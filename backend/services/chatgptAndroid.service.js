const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// نسخ الـ Headers الثابتة من الكود (مع التأكد من صحة الـ Cookie)
const getStaticHeaders = () => ({
    'User-Agent': "ChatGPT/1.2027.000 (Android 15; RMX3834; build 2700000)",
    'Accept': "application/json",
    'Accept-Encoding': "gzip",
    'Content-Type': "application/json",
    'oai-package-name': "com.Modderme",
    'oai-client-type': "android",
    'oai-device-id': "84329164059103383964",
    'accept-language': "en-US,en;q=0.9,ar-EG;q=0.8,ar;q=0.7",
    'x-device-tier': "lower_mid",
    'chatgpt-account-id': "84329164059103383964",
    'chatgpt-residency-region': "no_constraint",
    'Cookie': "__cflb=04dTod5Jcx9DYJeMeKbyj32ve2B3i9pLVRxJxEAaKD; _cfuvid=PXu6q36jhfgxnsdFkDmqwLzCfHOSgG588liApL0856A-1777834828.2542033-1.0.1.1-JFC10kaoqt9_IXzxrixI6zZuAm.TzRPF14QfJiD43MQ; oai-ll=; oai-sc=0gAAAAABp959mEmk6Qr5JsnqYMpWx1-15EJhCVV2EV6SQpet7Z7SjNuAT0x2cVScJu_g_TE9_NXidYfi68DtZfl4ImOQIRkr8PF-R-v9PUl7IPGtYiF1rwqdVm0NjapKV1lROdrmNGkiuNgcVMGYXMrP45hfmmQKiCQ5MBQLjfI7XI2tKSLvHT3WkjFEnmDZIRtVz85lyV9pxK181GJRARSxM53m06IfD3jEDjVbSR5QDQbL6Nxl4l7c; __cf_bm=y_lpbPz3viZYHSAd8nCLtIlm2JBCYWvEwOz8xvvwFow-1777835878.3854406-1.0.1.1-Muu0UxZKqufJhSVDELNGz2fO12Xcqc.oJ3hINoXkGIc2tGinJqVnmBTM7EAKDRfqdl1WdKtZ06fuCJ3y5DddxeMPVlBNX_r7daQReYa59qkFBwXOF3p4W3lwU.tdPN9A"
});

// الحصول على Conduit Token (مطلوب لكل طلب جديد)
async function getConduitToken() {
    const url = "https://android.chat.openai.com/backend-api/f/conversation/prepare";
    const payload = {
        action: "next",
        messages: [],
        model: "auto",
        history_and_training_disabled: false,
        fork_from_shared_post: false,
        enable_message_followups: false,
        force_use_sse: false,
        force_use_search: null,
        force_paragen: false,
        supports_buffering: false,
        timezone: "Africa/Cairo",
        timezone_offset_min: -180,
        system_hints: [],
        is_onboarding_conversation: false
    };
    const response = await axios.post(url, payload, { headers: getStaticHeaders(), timeout: 30000 });
    if (response.status === 200 && response.data.conduit_token) {
        return response.data.conduit_token;
    }
    throw new Error("Failed to get conduit token");
}

// إرسال رسالة إلى ChatGPT (بدون سياق سابق - كل مرة جولة جديدة)
async function sendMessage(prompt, options = { stream = false, timeout = 120000 }) {
    const conduitToken = await getConduitToken();
    const headers = {
        ...getStaticHeaders(),
        'Conduit-Token': conduitToken,
        'x-oai-convo-session-id': uuidv4(),
        'x-oai-turn-trace-id': uuidv4(),
        'x-openai-target-path': '/backend-api/f/conversation'
    };
    
    const messageId = uuidv4();
    const parentMessageId = uuidv4(); // جديد لكل طلب
    
    const payload = {
        action: "next",
        messages: [{
            id: messageId,
            author: { role: "user" },
            content: { content_type: "text", parts: [prompt] },
            status: "finished_successfully"
        }],
        model: "auto",
        parent_message_id: parentMessageId,
        stream: options.stream || false,
        timezone: "Africa/Cairo",
        timezone_offset_min: -180
    };
    
    const response = await axios.post(
        'https://android.chat.openai.com/backend-api/f/conversation',
        payload,
        { headers, timeout: options.timeout, responseType: options.stream ? 'stream' : 'json' }
    );
    
    if (options.stream) {
        // في حالة البث، نعيد الـ stream ونعالجه خارجياً
        return response.data;
    } else {
        // قراءة النص الكامل من response (غير stream)
        let fullText = "";
        // لكن الـ API يعيد stream دائماً تقريباً، لذا حتى مع stream:false نتعامل مع التدفق
        // الأفضل نستخدم stream دائماً ونجمع النص يدوياً
    }
}

// دالة تجمع النص من stream وتعيده كسلسلة
async function getFullResponse(prompt, timeout = 120000) {
    const conduitToken = await getConduitToken();
    const headers = { ...getStaticHeaders(), 'Conduit-Token': conduitToken, ... };
    // ... نفس بناء payload
    const response = await axios.post(..., { responseType: 'stream', timeout });
    return new Promise((resolve, reject) => {
        let fullResponse = "";
        response.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const event = JSON.parse(data);
                        if (event.message?.content?.parts?.[0]) {
                            fullResponse = event.message.content.parts[0];
                        }
                    } catch(e) {}
                }
            }
        });
        response.data.on('end', () => resolve(fullResponse));
        response.data.on('error', reject);
    });
}

module.exports = { getFullResponse };