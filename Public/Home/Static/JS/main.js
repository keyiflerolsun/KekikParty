// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

// Module Imports
import { generateRandomUser } from './modules/utils.js';
import { initUI, showToast, copyRoomLink, toggleElement, showSkeleton } from './modules/ui.js';
import { initChat, addChatMessage, addSystemMessage, updateUsersList, loadChatHistory, setCurrentUsername } from './modules/chat.js';
import {
    initPlayer,
    setPlayerCallbacks,
    setupVideoEventListeners,
    loadVideo,
    applyState,
    handleSync,
    handleSeek,
    getCurrentTime,
    isPlaying,
    getLastLoadedUrl,
    setProcessingRemote,
    updateVideoInfo,
    handleSyncCorrection
} from './modules/player.js';
import { connect, send, onMessage, setHeartbeatDataProvider } from './modules/websocket.js';

// ============== State ==============
const state = {
    currentUser: null
};

// ============== Config ==============
const getRoomConfig = () => {
    const roomId = window.ROOM_ID || document.getElementById('room-id')?.textContent || '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/wss/watch_party/${roomId}`;
    return { roomId, wsUrl };
};

// ============== Message Handlers ==============
const setupMessageHandlers = () => {
    onMessage('room_state', handleRoomState);
    onMessage('user_joined', handleUserJoined);
    onMessage('user_left', handleUserLeft);
    onMessage('sync', handleSync);
    onMessage('sync_correction', handleSyncCorrection);
    onMessage('seek', handleSeek);
    onMessage('chat', handleChatMessage);
    onMessage('video_changed', handleVideoChanged);
    onMessage('error', (msg) => showToast(msg.message, 'error'));
};

const handleRoomState = async (roomState) => {
    updateUsersList(roomState.users);
    setProcessingRemote(true);

    if (roomState.video_url) {
        const shouldLoad = getLastLoadedUrl() !== roomState.video_url;

        if (shouldLoad) {
            await loadVideo(roomState.video_url, roomState.video_format, roomState.headers, roomState.video_title, roomState.subtitle_url);

            // Wait for metadata before applying state
            const videoPlayer = document.getElementById('video-player');
            if (videoPlayer) {
                await new Promise(resolve => {
                    videoPlayer.addEventListener('loadedmetadata', resolve, { once: true });
                });
            }
        }

        // Sync callback for continuous syncing while waiting for user interaction
        const requestSync = () => send('get_state');
        await applyState(roomState, requestSync);
    } else {
        setProcessingRemote(false);
    }

    if (roomState.chat_messages) {
        loadChatHistory(roomState.chat_messages);
    }
};

const handleUserJoined = (msg) => {
    updateUsersList(msg.users);
    addSystemMessage(`${msg.avatar} ${msg.username} odaya katıldı`);
    showToast(`${msg.username} odaya katıldı`, 'info');
};

const handleUserLeft = (msg) => {
    updateUsersList(msg.users);
    addSystemMessage(`${msg.username} odadan ayrıldı`);
};

const handleChatMessage = (msg) => {
    addChatMessage(msg.username, msg.avatar, msg.message, msg.timestamp);
};

const handleVideoChanged = async (msg) => {
    // Show skeleton for all users while video loads
    showSkeleton('player-container');
    await loadVideo(msg.url, msg.format, msg.headers, msg.title, msg.subtitle_url);
    updateVideoInfo(msg.title, msg.duration);
    showToast(`${msg.changed_by || 'Birisi'} yeni video yükledi`, 'info');
    addSystemMessage(`🎥 Yeni video: ${msg.title || 'Video'}`);
};

// ============== Player Callbacks ==============
const setupPlayerCallbacks = () => {
    setPlayerCallbacks({
        onPlay: (time) => send('play', { time }),
        onPause: (time) => send('pause', { time }),
        onSeek: (time) => send('seek', { time }),
        onBufferStart: () => send('buffer_start'),
        onBufferEnd: () => send('buffer_end'),
        onSyncRequest: () => send('get_state'),
        onInteractionSuccess: async () => { send('get_state'); }
    });
};

// ============== Heartbeat ==============
const setupHeartbeat = () => {
    setHeartbeatDataProvider(() => {
        const payload = {};
        if (isPlaying()) {
            payload.current_time = getCurrentTime();
        }
        return payload;
    });
};

// ============== User Actions (Global) ==============
const setupGlobalActions = () => {
    // Change video
    window.changeVideo = () => {
        const urlInput = document.getElementById('video-url-input');
        const userAgent = document.getElementById('custom-user-agent')?.value.trim() || '';
        const referer = document.getElementById('custom-referer')?.value.trim() || '';
        const subtitleUrl = document.getElementById('subtitle-url')?.value.trim() || '';
        const url = urlInput?.value.trim() || '';

        if (!url) {
            showToast("Lütfen bir video URL'si girin", 'warning');
            return;
        }

        // Show skeleton on player while loading
        showSkeleton('player-container');
        send('video_change', { url, user_agent: userAgent, referer, subtitle_url: subtitleUrl });
        if (urlInput) urlInput.value = '';
    };

    // Send chat message
    window.sendMessage = (event) => {
        event.preventDefault();
        const input = document.getElementById('chat-input');
        const message = input?.value.trim() || '';
        if (!message) return;

        send('chat', { message });
        if (input) input.value = '';
    };

    // Copy room link
    window.copyRoomLink = copyRoomLink;

    // Toggle advanced options
    window.toggleAdvancedOptions = () => {
        toggleElement('advanced-options');
    };

    // Toggle controls
    window.toggleControls = (btn) => {
        const isVisible = toggleElement('video-input-container');
        if (btn) {
            btn.classList.toggle('active', isVisible);
        }
    };
};

// ============== Initialize ==============
const init = async () => {
    // Init modules
    initUI();
    initChat();
    initPlayer();

    // Generate user
    state.currentUser = generateRandomUser();
    setCurrentUsername(state.currentUser.username);

    // Setup
    setupMessageHandlers();
    setupPlayerCallbacks();
    setupVideoEventListeners();
    setupHeartbeat();
    setupGlobalActions();

    // Connect
    const { wsUrl } = getRoomConfig();
    try {
        await connect(wsUrl);
        send('join', {
            username: state.currentUser.username,
            avatar: state.currentUser.avatar
        });
    } catch (e) {
        console.error('Connection failed:', e);
    }
};

// Start app when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
