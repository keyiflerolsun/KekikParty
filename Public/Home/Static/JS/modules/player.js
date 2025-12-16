// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { formatTime, formatDuration, sleep, logger } from './utils.js';
import { showToast, updateSyncInfoText, hideSkeleton } from './ui.js';

// ============== State ==============
const state = {
    videoPlayer: null,
    playerOverlay: null,
    videoInfo: null,
    videoTitle: null,
    videoDuration: null,
    hls: null,
    isProcessingRemote: false,
    lastLoadedUrl: null,
    playPromise: null
};

const callbacks = {
    onPlay: null,
    onPause: null,
    onSeek: null,
    onBufferStart: null,
    onBufferEnd: null,
    onSyncRequest: null,
    onInteractionSuccess: null
};

export const initPlayer = () => {
    state.videoPlayer = document.getElementById('video-player');
    state.playerOverlay = document.getElementById('player-overlay');
    state.videoInfo = document.getElementById('video-info');
    state.videoTitle = document.getElementById('video-title');
    state.videoDuration = document.getElementById('video-duration');
};

export const setPlayerCallbacks = (cbs) => {
    callbacks.onPlay = cbs.onPlay || null;
    callbacks.onPause = cbs.onPause || null;
    callbacks.onSeek = cbs.onSeek || null;
    callbacks.onBufferStart = cbs.onBufferStart || null;
    callbacks.onBufferEnd = cbs.onBufferEnd || null;
    callbacks.onSyncRequest = cbs.onSyncRequest || null;
    callbacks.onInteractionSuccess = cbs.onInteractionSuccess || null;
};

export const setupVideoEventListeners = () => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;

    videoPlayer.addEventListener('play', () => {
        if (state.isProcessingRemote) return;
        callbacks.onPlay?.(videoPlayer.currentTime);
    });

    videoPlayer.addEventListener('pause', () => {
        if (state.isProcessingRemote || videoPlayer.ended) return;
        callbacks.onPause?.(videoPlayer.currentTime);
    });

    videoPlayer.addEventListener('seeked', () => {
        if (state.isProcessingRemote) return;
        callbacks.onSeek?.(videoPlayer.currentTime);
    });

    videoPlayer.addEventListener('waiting', () => {
        if (state.isProcessingRemote || videoPlayer.paused) return;
        callbacks.onBufferStart?.();
        showToast('Bağlantı zayıf, bekleniyor...', 'warning');
    });

    videoPlayer.addEventListener('playing', () => {
        if (state.isProcessingRemote) return;
        callbacks.onBufferEnd?.();
    });
};

const buildProxyUrl = (url, headers = {}) => {
    const params = new URLSearchParams();
    params.append('url', url);
    if (headers['User-Agent']) params.append('user_agent', headers['User-Agent']);
    if (headers['Referer']) params.append('referer', headers['Referer']);
    return `/api/v1/proxy?${params.toString()}`;
};

const loadHlsWithFallback = (url, headers = {}, useProxy = false) => {
    return new Promise((resolve) => {
        const { videoPlayer } = state;
        
        // Destroy existing HLS instance
        if (state.hls) {
            state.hls.destroy();
            state.hls = null;
        }

        state.hls = new Hls({
            debug: false,
            enableWorker: true,
            xhrSetup: useProxy ? undefined : (xhr, url) => {
                // Set custom headers for direct requests
                if (headers['User-Agent']) xhr.setRequestHeader('X-Custom-User-Agent', headers['User-Agent']);
                if (headers['Referer']) xhr.setRequestHeader('X-Custom-Referer', headers['Referer']);
            }
        });

        const loadUrl = useProxy ? buildProxyUrl(url, headers) : url;
        logger.video(`HLS loading: ${useProxy ? 'via proxy' : 'direct'}`);
        
        state.hls.loadSource(loadUrl);
        state.hls.attachMedia(videoPlayer);

        // Track if we've handled the result
        let handled = false;
        let timeoutId = null;

        const cleanup = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        };

        const tryProxyFallback = async () => {
            if (handled) return;
            handled = true;
            cleanup();
            
            logger.warn('Direct HLS failed, trying proxy...');
            if (state.hls) {
                state.hls.destroy();
                state.hls = null;
            }
            
            // Retry with proxy
            const proxySuccess = await loadHlsWithFallback(url, headers, true);
            resolve(proxySuccess);
        };

        // Timeout for CORS/network issues that don't trigger error events
        if (!useProxy) {
            timeoutId = setTimeout(() => {
                if (!handled) {
                    logger.warn('HLS timeout, trying proxy...');
                    tryProxyFallback();
                }
            }, 8000); // 8 second timeout for direct loading
        }

        state.hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!handled) {
                handled = true;
                cleanup();
                logger.success('HLS manifest parsed');
                resolve(true);
            }
        });

        state.hls.on(Hls.Events.ERROR, async (event, data) => {
            if (data.fatal && !handled) {
                cleanup();
                logger.error(`HLS: ${data.type} - ${data.details}`);
                
                // Network error (CORS, 403, etc) - try proxy if not already using it
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !useProxy) {
                    await tryProxyFallback();
                } else {
                    handled = true;
                    
                    // Check if proxy is disabled (503)
                    if (useProxy && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        try {
                            const proxyCheckUrl = buildProxyUrl(url, headers);
                            const response = await fetch(proxyCheckUrl, { method: 'HEAD' }).catch(() => null);
                            if (response && response.status === 503) {
                                showToast('Bu video proxy olmadan izlenemiyor. Sunucuda proxy devre dışı.', 'warning');
                            } else {
                                showToast('Video hatası: ' + data.details, 'error');
                            }
                        } catch {
                            showToast('Video hatası: ' + data.details, 'error');
                        }
                    } else {
                        showToast('Video hatası: ' + data.details, 'error');
                    }
                    
                    // Try recovery for media errors
                    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        state.hls.recoverMediaError();
                    } else {
                        state.hls.destroy();
                        state.hls = null;
                    }
                    resolve(false);
                }
            }
        });
    });
};

const detectFormat = (url, format) => {
    const lowerUrl = url.toLowerCase();
    
    // Check URL extension
    if (lowerUrl.includes('.m3u8') || lowerUrl.includes('/hls/') || format === 'hls') return 'hls';
    if (lowerUrl.includes('.mp4') || lowerUrl.includes('/mp4/') || format === 'mp4') return 'mp4';
    if (lowerUrl.includes('.webm') || format === 'webm') return 'webm';
    if (lowerUrl.includes('.ogg') || lowerUrl.includes('.ogv') || format === 'ogg') return 'ogg';
    if (lowerUrl.includes('.ts') || lowerUrl.includes('/ts/')) return 'hls'; // TS segments usually HLS
    
    // Default based on hint or native
    return format || 'native';
};

const loadNativeWithFallback = (url, headers = {}, useProxy = false) => {
    return new Promise((resolve) => {
        const { videoPlayer } = state;
        
        const loadUrl = useProxy ? buildProxyUrl(url, headers) : url;
        videoPlayer.src = loadUrl;

        const handleCanPlay = () => {
            cleanup();
            resolve(true);
        };

        const handleError = async () => {
            cleanup();
            
            // Try proxy if not already using it
            if (!useProxy && headers && Object.keys(headers).length > 0) {
                logger.warn('Direct play failed, trying proxy...');
                const proxySuccess = await loadNativeWithFallback(url, headers, true);
                resolve(proxySuccess);
            } else if (!useProxy) {
                // No headers, try proxy anyway as last resort
                logger.warn('Direct play failed, trying proxy...');
                const proxySuccess = await loadNativeWithFallback(url, {}, true);
                resolve(proxySuccess);
            } else {
                // Proxy failed - check if it's disabled (503)
                try {
                    const proxyCheckUrl = buildProxyUrl(url, headers);
                    const response = await fetch(proxyCheckUrl, { method: 'HEAD' }).catch(() => null);
                    if (response && response.status === 503) {
                        showToast('Bu video proxy olmadan izlenemiyor. Sunucuda proxy devre dışı.', 'warning');
                    } else {
                        showToast('Video yüklenemedi', 'error');
                    }
                } catch {
                    showToast('Video yüklenemedi', 'error');
                }
                resolve(false);
            }
        };

        const cleanup = () => {
            videoPlayer.removeEventListener('canplay', handleCanPlay);
            videoPlayer.removeEventListener('error', handleError);
        };

        videoPlayer.addEventListener('canplay', handleCanPlay, { once: true });
        videoPlayer.addEventListener('error', handleError, { once: true });
        
        // Timeout for slow connections
        setTimeout(() => {
            if (videoPlayer.readyState >= 2) {
                cleanup();
                resolve(true);
            }
        }, 5000);
    });
};

export const loadVideo = async (url, format = 'hls', headers = {}, title = '', subtitleUrl = '') => {
    const { videoPlayer, playerOverlay, videoInfo, videoTitle: titleEl } = state;
    if (!videoPlayer || !playerOverlay) return;

    // Destroy existing HLS instance
    if (state.hls) {
        state.hls.destroy();
        state.hls = null;
    }

    // Remove existing subtitle tracks
    const existingTracks = videoPlayer.querySelectorAll('track');
    existingTracks.forEach(track => track.remove());

    playerOverlay.classList.add('hidden');
    hideSkeleton('player-container');

    const detectedFormat = detectFormat(url, format);
    logger.video(`Loading: ${detectedFormat} format`);

    switch (detectedFormat) {
        case 'hls':
            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                // HLS.js - try direct first, fallback to proxy
                await loadHlsWithFallback(url, headers, false);
            } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                // Safari native HLS
                await loadNativeWithFallback(url, headers, false);
            } else {
                showToast('HLS desteklenmiyor', 'error');
            }
            break;

        case 'mp4':
        case 'webm':
        case 'ogg':
        case 'native':
        default:
            // Native video - try direct first, fallback to proxy
            await loadNativeWithFallback(url, headers, false);
            break;
    }

    // Add subtitle track if provided
    if (subtitleUrl) {
        const subtitleProxyUrl = buildProxyUrl(subtitleUrl, headers);
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = 'Türkçe';
        track.srclang = 'tr';
        track.src = subtitleProxyUrl;
        track.default = true;
        videoPlayer.appendChild(track);
        logger.info('Subtitle track added');
    }

    if (title && titleEl && videoInfo) {
        titleEl.textContent = title;
        videoInfo.style.display = 'block';
    }

    state.lastLoadedUrl = url;
};

const handlePlayError = (error) => {
    if (error.name === 'NotAllowedError') {
        showInteractionPrompt();
    } else {
        showToast('Oynatma hatası: ' + error.message, 'error');
    }
};

export const showInteractionPrompt = (localOnInteract = null, localOnSyncRequest = null) => {
    const { playerOverlay, videoPlayer } = state;
    if (!playerOverlay) return;
    if (!playerOverlay.classList.contains('hidden')) return;

    // Use local callbacks or fall back to global ones
    const onInteract = localOnInteract || callbacks.onInteractionSuccess;
    const onSyncRequest = localOnSyncRequest || callbacks.onSyncRequest;

    playerOverlay.classList.remove('hidden');
    playerOverlay.innerHTML = `
        <div class="wp-player-message" style="cursor: pointer;">
            <i class="fa-solid fa-circle-play" style="font-size: 4rem; color: var(--wp-primary); margin-bottom: 1rem;"></i>
            <p>Yayına Katılmak İçin Tıklayın</p>
        </div>
    `;

    // Continuous state sync while waiting - every second
    let syncInterval = null;
    if (onSyncRequest) {
        syncInterval = setInterval(() => {
            onSyncRequest();
        }, 1000);
    }

    const handleClick = async () => {
        // Stop syncing
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }

        state.isProcessingRemote = true;
        playerOverlay.removeEventListener('click', handleClick);
        
        try {
            // Start playback
            state.playPromise = videoPlayer.play();
            await state.playPromise;
            state.playPromise = null;
            playerOverlay.classList.add('hidden');
            
            // Trigger post-interaction logic (progressive sync etc.) from main.js
            if (onInteract) {
                await onInteract();
            }
        } catch (e) {
            state.playPromise = null;
            if (e.name !== 'AbortError') {
                console.error('Play error:', e);
            }
        }
        
        state.isProcessingRemote = false;
    };

    playerOverlay.addEventListener('click', handleClick);
};

export const applyState = async (serverState, customOptions = {}) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;

    // Default options
    const options = {
        onSyncRequest: null,
        forceSync: false,
        ...customOptions
    };

    // Support legacy second argument if function
    if (typeof customOptions === 'function') {
        options.onSyncRequest = customOptions;
    }

    // Always seek to server time first (important for late joiners)
    logger.sync(`State: time=${serverState.current_time.toFixed(1)}s, playing=${serverState.is_playing}`);
    
    // Force seek to correct position
    videoPlayer.currentTime = serverState.current_time;
    
    // Wait for seek to complete
    await new Promise(resolve => {
        const onSeeked = () => {
            videoPlayer.removeEventListener('seeked', onSeeked);
            resolve();
        };
        videoPlayer.addEventListener('seeked', onSeeked);
        // Timeout fallback
        setTimeout(resolve, 500);
    });

    if (serverState.is_playing) {
        try {
            state.playPromise = videoPlayer.play();
            await state.playPromise;
            state.playPromise = null;
        } catch (e) {
            state.playPromise = null;
            // Autoplay blocked - show prompt with continuous sync
            if (e.name === 'NotAllowedError') {
                showInteractionPrompt(null, options.onSyncRequest);
            } else if (e.name !== 'AbortError') {
                showToast('Oynatma hatası: ' + e.message, 'error');
            }
        }
    } else {
        // Wait for any pending play promise before pausing
        if (state.playPromise) {
            try {
                await state.playPromise;
            } catch (e) { /* ignore */ }
            state.playPromise = null;
        }
        videoPlayer.pause();
    }

    await sleep(500);
    state.isProcessingRemote = false;
};

export const handleSync = async (msg, options = {}) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;

    state.isProcessingRemote = true;
    const timeDiff = Math.abs(videoPlayer.currentTime - msg.current_time);

    // Default threshold 0.5s, but can be forced to be tighter or ignored
    const threshold = options.forceSync ? 0.1 : 0.5;

    if (timeDiff > threshold) {
        logger.sync(`Adjustment: diff=${timeDiff.toFixed(2)}s`);
        videoPlayer.currentTime = msg.current_time;
    }

    if (msg.is_playing) {
        if (videoPlayer.paused) {
            try {
                state.playPromise = videoPlayer.play();
                await state.playPromise;
                state.playPromise = null;
            } catch (e) {
                state.playPromise = null;
                if (e.name !== 'AbortError') {
                    handlePlayError(e);
                }
            }
        }
    } else {
        if (!videoPlayer.paused) {
            // Wait for any pending play promise before pausing
            if (state.playPromise) {
                try {
                    await state.playPromise;
                } catch (e) { /* ignore */ }
                state.playPromise = null;
            }
            videoPlayer.pause();
        }
    }

    updateSyncInfoText(msg.triggered_by, msg.is_playing ? 'oynatıyor' : 'durdurdu');
    resetProcessingFlag();
};

export const handleSeek = (msg) => {
    const { videoPlayer } = state;
    if (!videoPlayer) return;

    state.isProcessingRemote = true;
    videoPlayer.currentTime = msg.current_time;
    updateSyncInfoText(msg.triggered_by, `${formatTime(msg.current_time)} konumuna atladı`);
    resetProcessingFlag();
};

export const handleSyncCorrection = async (msg) => {
    const { videoPlayer } = state;
    if (!videoPlayer || state.isProcessingRemote) return;

    if (msg.action === 'rate') {
        const rate = msg.rate || 1.0;
        if (Math.abs(videoPlayer.playbackRate - rate) > 0.01) {
            logger.sync(`Rate: ${rate}x (Drift: ${msg.drift.toFixed(2)}s)`);
            videoPlayer.playbackRate = rate;
            
            // If rate is normal, don't show toast to be subtle
            if (rate !== 1.0) {
                 // Optional: show subtle toast or debug info
            }
        }
    } else if (msg.action === 'buffer') {
        logger.sync(`Buffer: Target=${msg.target_time.toFixed(1)}s (Drift: ${msg.drift.toFixed(2)}s)`);
        state.isProcessingRemote = true;
        
        // Mock buffer effect
        try {
            videoPlayer.pause();
            showToast('Senkronize ediliyor...', 'warning');
            
            videoPlayer.currentTime = msg.target_time;
            
            // Wait a bit to simulate buffer/catch up
            await sleep(1000);
            
            await videoPlayer.play();
        } catch (e) {
            console.error('Sync correction error:', e);
        }
        
        state.isProcessingRemote = false;
        videoPlayer.playbackRate = 1.0; // Reset rate after hard sync
    }
};

const resetProcessingFlag = () => {
    setTimeout(() => {
        state.isProcessingRemote = false;
    }, 500);
};

// ============== Getters ==============
export const getCurrentTime = () => state.videoPlayer?.currentTime || 0;
export const isPlaying = () => state.videoPlayer ? !state.videoPlayer.paused : false;
export const getLastLoadedUrl = () => state.lastLoadedUrl;

// ============== Setters ==============
export const setProcessingRemote = (value) => {
    state.isProcessingRemote = value;
};

export const updateVideoInfo = (title, duration) => {
    if (state.videoTitle && title) state.videoTitle.textContent = title;
    if (state.videoDuration && duration) state.videoDuration.textContent = formatDuration(duration);
    if (state.videoInfo) state.videoInfo.style.display = 'block';
};
