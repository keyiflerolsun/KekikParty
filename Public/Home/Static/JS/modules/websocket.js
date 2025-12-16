// Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

import { sleep } from './utils.js';
import { showToast, updateSyncStatus, showConnectionModal, hideConnectionModal } from './ui.js';

// ============== Config ==============
const config = {
    maxReconnectAttempts: 5,
    reconnectDelay: 3000,
    heartbeatInterval: 5000
};

// ============== State ==============
const state = {
    ws: null,
    isConnected: false,
    reconnectAttempts: 0,
    heartbeatInterval: null,
    getHeartbeatData: null
};

// ============== Message Handlers ==============
const messageHandlers = new Map();

export const onMessage = (type, handler) => {
    messageHandlers.set(type, handler);
};

export const setHeartbeatDataProvider = (fn) => {
    state.getHeartbeatData = fn;
};

export const connect = async (url) => {
    if (state.ws?.readyState === WebSocket.OPEN) return;

    updateSyncStatus('connecting');

    return new Promise((resolve, reject) => {
        state.ws = new WebSocket(url);

        state.ws.onopen = () => {
            state.isConnected = true;
            state.reconnectAttempts = 0;
            updateSyncStatus('connected');
            hideConnectionModal();
            startHeartbeat();
            resolve();
        };

        state.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleMessage(message);
            } catch (e) {
                console.error('Failed to parse message:', e);
            }
        };

        state.ws.onclose = async () => {
            state.isConnected = false;
            stopHeartbeat();
            updateSyncStatus('disconnected');

            if (state.reconnectAttempts < config.maxReconnectAttempts) {
                state.reconnectAttempts++;
                showConnectionModal();
                await sleep(config.reconnectDelay);
                connect(url);
            } else {
                showToast('Bağlantı kurulamadı. Lütfen sayfayı yenileyin.', 'error');
                reject(new Error('Max reconnect attempts reached'));
            }
        };

        state.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    });
};

const handleMessage = (message) => {
    if (message.type === 'pong') return;

    const handler = messageHandlers.get(message.type);
    if (handler) {
        handler(message);
    } else {
        console.warn('Unknown message type:', message.type);
    }
};

export const send = (type, data = {}) => {
    if (state.ws?.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type, ...data }));
    }
};

const startHeartbeat = () => {
    stopHeartbeat();
    state.heartbeatInterval = setInterval(() => {
        if (state.ws?.readyState === WebSocket.OPEN) {
            const payload = state.getHeartbeatData?.() || {};
            send('ping', payload);
        }
    }, config.heartbeatInterval);
};

const stopHeartbeat = () => {
    if (state.heartbeatInterval) {
        clearInterval(state.heartbeatInterval);
        state.heartbeatInterval = null;
    }
};
