const axios = require('axios');

const DEFAULT_DEEPSEEK_TOKEN = process.env.DEEPSEEK_APP_TOKEN || 'IVlSFv6JwO2TttyAhMW6Cu9/eMCDQhcfY0uHWu000SDnAyEwsYxtR8rFADgo22LM';
const DEFAULT_POW_URL = process.env.DEEPSEEK_POW_URL || 'https://web-production-c09dc.up.railway.app/pow';

function generateDeviceId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    for (let i = 0; i < 88; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

function generateRangersId() {
    const ts = BigInt(Date.now());
    const rv = BigInt(Math.floor(1000000000 + Math.random() * 8999999999));
    return ((ts << 32n) | rv).toString();
}

function getTzOffset() {
    return (new Date().getTimezoneOffset() * -60).toString();
}

function buildFullHeaders(token, powResponse) {
    return {
        'User-Agent': 'DeepSeek/2.1.1 Android/36',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'Content-Type': 'application/json',
        'x-client-platform': 'android',
        'x-client-version': '2.1.1',
        'x-client-locale': 'ar',
        'x-client-bundle-id': 'com.deepseek.chat',
        'x-rangers-id': generateRangersId(),
        'x-client-timezone-offset': getTzOffset(),
        'x-device-id': generateDeviceId(),
        'x-os-version': '30',
        'x-app-version': '2.1.1',
        'Authorization': `Bearer ${token}`,
        'X-DS-PoW-Response': powResponse,
        'accept-charset': 'UTF-8'
    };
}

async function getFreshPow(powUrl) {
    const response = await axios.get(powUrl, { timeout: 60000 });
    if (!response.data?.pow_response || !response.data?.solved_json) {
        throw new Error(`DeepSeek POW response is incomplete: ${JSON.stringify(response.data)}`);
    }
    return {
        powResponse: response.data.pow_response,
        powData: response.data.solved_json
    };
}

async function createChatSession(token) {
    const response = await axios.post('https://chat.deepseek.com/api/v0/chat_session/create', {}, {
        headers: {
            'x-client-bundle-id': 'com.deepseek.chat',
            'x-client-platform': 'web',
            'x-client-version': '2.0.0',
            'x-client-locale': 'en_US',
            'x-client-timezone-offset': getTzOffset(),
            'x-app-version': '2.0.0',
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': '*/*'
        },
        timeout: 60000
    });
    const sessionId = response.data?.data?.biz_data?.chat_session?.id;
    if (!sessionId) throw new Error(`DeepSeek session id missing: ${JSON.stringify(response.data)}`);
    return sessionId;
}

function parseDeepSeekLine(line, state) {
    if (!line.startsWith('data: ')) return;
    const rawChunk = line.substring(6);
    let item;
    try { item = JSON.parse(rawChunk); } catch (_) { return; }

    if (item?.request_message_id) state.requestMessageId = item.request_message_id;
    if (item?.response_message_id) state.responseMessageId = item.response_message_id;

    if (item?.v) {
        if (typeof item.v === 'string') {
            state.text += item.v;
        } else if (typeof item.v === 'object' && item.v.response?.fragments) {
            for (const frag of item.v.response.fragments) {
                if (frag.type === 'RESPONSE') state.text += frag.content || '';
                if (frag.type === 'THINKING') state.thinking += frag.content || '';
                if (frag.type === 'SEARCH' && Array.isArray(frag.results)) state.searchResults = frag.results;
            }
        }
    }
    if (item?.p === 'response/fragments/-1/content' && item.o === 'APPEND' && item.v) {
        state.text += item.v;
    }
}

async function askDeepSeek(prompt, options = {}) {
    const token = options.token || DEFAULT_DEEPSEEK_TOKEN;
    const powUrl = options.powUrl || DEFAULT_POW_URL;
    const context = options.context || {};
    const sessionId = context.sessionId || options.sessionId || await createChatSession(token);
    const parentMessageId = context.parentMessageId || options.parentMessageId || null;
    const { powResponse, powData } = await getFreshPow(powUrl);

    const response = await axios.post('https://chat.deepseek.com/api/v0/chat/completion', {
        chat_session_id: sessionId,
        parent_message_id: parentMessageId,
        prompt,
        ref_file_ids: [],
        thinking_enabled: Boolean(options.thinkingEnabled),
        search_enabled: Boolean(options.searchEnabled),
        model_type: options.modelType === 'expert' ? 'expert' : 'instant',
        action: null,
        preempt: false,
        pow: powData,
        stream: true
    }, {
        headers: buildFullHeaders(token, powResponse),
        timeout: options.timeout || 500000,
        responseType: 'stream'
    });

    const state = { text: '', thinking: '', searchResults: [] };
    await new Promise((resolve, reject) => {
        response.data.on('data', chunk => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) parseDeepSeekLine(line.trim(), state);
        });
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    if (!state.text.trim()) throw new Error('DeepSeek returned an empty response');

    if (options.context) {
        options.context.sessionId = sessionId;
        if (state.responseMessageId) options.context.parentMessageId = state.responseMessageId;
        if (state.requestMessageId) options.context.requestMessageId = state.requestMessageId;
        options.context.lastUpdated = new Date();
    }

    return state.text;
}

module.exports = { askDeepSeek };