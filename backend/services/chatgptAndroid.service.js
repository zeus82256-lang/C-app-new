const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_BASE_URL = 'https://android.chat.openai.com/backend-api';
const DEFAULT_MODEL = process.env.CHATGPT_ANDROID_MODEL || 'gpt-5-5';
const DEFAULT_AUTH_TOKEN = process.env.CHATGPT_ANDROID_AUTH_TOKEN || '';
const DEFAULT_COOKIES = process.env.CHATGPT_ANDROID_COOKIES || '';
const DEFAULT_DEVICE_ID = process.env.CHATGPT_ANDROID_DEVICE_ID || '05d871f5-391c-418a-b1d1-8dc804241915';
const DEFAULT_ACCOUNT_ID = process.env.CHATGPT_ANDROID_ACCOUNT_ID || '';

function buildHeaders(options = {}) {
    const headers = {
        'User-Agent': options.userAgent || 'ChatGPT/1.2026.195 (Android 15; RMX3834; build 2619512)',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'Content-Type': 'application/json',
        'oai-package-name': options.packageName || 'com.openai.chatgpt',
        'oai-client-type': 'android',
        'oai-device-id': options.deviceId || DEFAULT_DEVICE_ID,
        'accept-language': options.acceptLanguage || 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
        'x-device-tier': options.deviceTier || 'lower_mid',
        'chatgpt-residency-region': options.residencyRegion || 'no_constraint'
    };
    const accountId = options.accountId || DEFAULT_ACCOUNT_ID;
    const authToken = options.authToken || options.token || DEFAULT_AUTH_TOKEN;
    const cookies = options.cookies || DEFAULT_COOKIES;
    if (accountId) headers['chatgpt-account-id'] = accountId;
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    if (cookies) headers.Cookie = cookies;
    return headers;
}

async function prepareConversation(model, options = {}) {
    const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    const response = await axios.post(`${baseUrl}/f/conversation/prepare`, {
        action: 'next',
        messages: [],
        model,
        history_and_training_disabled: false,
        fork_from_shared_post: false,
        enable_message_followups: false,
        force_use_sse: false,
        force_use_search: null,
        force_paragen: false,
        supported_encodings: ['v1'],
        supports_buffering: true,
        timezone: options.timezone || 'Africa/Cairo',
        timezone_offset_min: options.timezoneOffsetMin ?? -180,
        system_hints: [],
        is_onboarding_conversation: false,
        client_prepare_dispatch: 'debounced',
        client_prepare_source: 'composer_editor_state'
    }, { headers: buildHeaders(options), timeout: options.prepareTimeout || 30000 });

    const token = response.data?.conduit_token;
    if (!token) throw new Error(`ChatGPT Android conduit token missing: ${JSON.stringify(response.data)}`);
    return token;
}

function appendChunk(state, value) {
    if (typeof value !== 'string' || !value) return;
    state.chunks.push(value);
}

function rememberSnapshot(state, value) {
    if (typeof value !== 'string' || !value) return;
    if (!state.snapshot || value.length >= state.snapshot.length) state.snapshot = value;
}

function parsePatch(patch, state) {
    if (!patch || typeof patch !== 'object') return;
    const op = String(patch.o || patch.op || '').toLowerCase();
    const path = patch.p || patch.path || '';
    if (op === 'append' && path === '/message/content/parts/0') appendChunk(state, patch.v);
    if ((op === 'replace' || op === 'add') && path === '/message/content/parts/0') rememberSnapshot(state, patch.v);
}

function parseChatGPTLine(line, state) {
    if (line.startsWith('event: ')) {
        state.currentEvent = line.slice(7).trim();
        return;
    }
    if (!line.startsWith('data: ')) return;
    const raw = line.slice(6).trim();
    if (!raw || raw === '[DONE]') return;
    let event;
    try { event = JSON.parse(raw); } catch (_) { return; }

    if (event.conversation_id) state.conversationId = event.conversation_id;
    if (event.message?.id) state.responseMessageId = event.message.id;
    rememberSnapshot(state, event.message?.content?.parts?.[0]);

    if (state.currentEvent === 'delta') parsePatch(event, state);
    if (Array.isArray(event.v)) event.v.forEach(patch => parsePatch(patch, state));
    if (event.o && event.p) parsePatch(event, state);
    if (event.type === 'content_delta') appendChunk(state, event.delta || event.text || event.content);
}

async function askChatGPTAndroid(prompt, options = {}) {
    const model = options.model || DEFAULT_MODEL;
    const context = options.context || {};
    const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    const conduitToken = context.conduitToken || await prepareConversation(model, options);
    const convoSessionId = context.sessionId || options.sessionId || uuidv4();
    const parentMessageId = context.parentMessageId || options.parentMessageId || uuidv4();

    const headers = {
        ...buildHeaders(options),
        Accept: 'text/event-stream,application/json',
        'cache-control': 'no-cache',
        'x-conduit-token': conduitToken,
        'x-oai-convo-session-id': convoSessionId,
        'x-oai-turn-trace-id': uuidv4(),
        'x-openai-target-path': '/backend-api/f/conversation'
    };

    const response = await axios.post(`${baseUrl}/f/conversation`, {
        action: 'next',
        messages: [{
            id: uuidv4(),
            author: { role: 'user' },
            content: { parts: [prompt], content_type: 'text' },
            status: 'finished_successfully',
            recipient: 'all',
            metadata: { model_slug: model, default_model_slug: model }
        }],
        model,
        parent_message_id: parentMessageId,
        conversation_id: context.conversationId,
        history_and_training_disabled: false,
        enable_message_followups: true,
        force_use_sse: true,
        supported_encodings: ['v1'],
        supports_buffering: true,
        timezone: options.timezone || 'Africa/Cairo',
        timezone_offset_min: options.timezoneOffsetMin ?? -180,
        stream: true
    }, { headers, timeout: options.timeout || 500000, responseType: 'stream' });

    const state = { chunks: [], snapshot: '', currentEvent: null, conversationId: context.conversationId, responseMessageId: null };
    await new Promise((resolve, reject) => {
        response.data.on('data', chunk => chunk.toString().split('\n').forEach(line => parseChatGPTLine(line.trim(), state)));
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    const fullText = state.chunks.join('').trim().length >= (state.snapshot || '').trim().length ? state.chunks.join('') : state.snapshot;

    if (!fullText.trim()) throw new Error('ChatGPT Android returned an empty response');
    if (options.context) {
        options.context.conduitToken = conduitToken;
        options.context.sessionId = convoSessionId;
        if (state.conversationId) options.context.conversationId = state.conversationId;
        if (state.responseMessageId) options.context.parentMessageId = state.responseMessageId;
        options.context.lastUpdated = new Date();
    }
    return fullText;
}

module.exports = { askChatGPTAndroid };
