// 🔥 Gemini Web service — نقل مباشر لطريقة البروكسي المجرّبة (GeminiBackend في qwen_proxy.py)
// المصدر: https://github.com/jsnjbwjbw-ui/Proxy (أُخذ منه مسار Gemini فقط كما طلب المستخدم)
//
// كيف يعمل:
//   1) "المفتاح" لمزوّد Gemini Web = سلسلة كوكيز من gemini.google.com بعد تسجيل الدخول
//      (يجب أن تحتوي على الأقل __Secure-1PSID و __Secure-1PSIDTS)
//   2) نجلب توكني الجلسة SNlM0e + FdrFJe من صفحة التطبيق (مع تتبّع تدوير الكوكيز)
//   3) نرسل البرومبت إلى StreamGenerate (نفس نداء واجهة الويب) ونجمع النص التدريجي
//   4) 🔥 إصلاح مشكلة "يترجم نصف الفصل / آخره كأنه انقطع": إذا انتهى الرد مقطوعاً
//      (بلا علامة ترقيم نهائية) نتابع تلقائياً في نفس المحادثة حتى ٣ جولات إكمال
//      مع منع التكرار وقصّ التداخل بين الجزأين
//
// ملاحظة مجرّبة: الوضع المجهول بدون كوكيز يعيد HTTP 400 (لا يوجد SNlM0e في صفحة الزوّار)
// لذلك لا يوجد fallback صامت — فشل الكوكيز يعطي رسالة صادقة وواضحة للمستخدم.
const axios = require('axios');
const crypto = require('crypto');

const GEMINI_BASE = 'https://gemini.google.com';
const GEMINI_USER_ACCT = 'u/1';
const GEMINI_BL = 'boq_assistant-bard-web-server_20260817.02_p0';
const GEMINI_MODEL_JSPB = (
    '[1,null,null,null,"fbb127bbb056c959",null,null,0,' +
    '[4,5,6,8,4,5,6,8],null,null,1,null,null,1,1,' +
    '"036033AF-386B-4A1C-A8B6-F563586CF2B9"]'
);
const GEMINI_STREAM_URL = `${GEMINI_BASE}/${GEMINI_USER_ACCT}/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`;
const GEMINI_APP_URL = `${GEMINI_BASE}/${GEMINI_USER_ACCT}/app`;

// نفس الكوكيز التي يتتبعها البروكسي للتدوير (PSIDTS تدور بشكل دوري من Google)
const TRACKED_COOKIES = new Set([
    'SIDCC', '__Secure-1PSIDCC', '__Secure-3PSIDCC',
    '__Secure-1PSIDTS', '__Secure-3PSIDTS',
    'COMPASS', '_gcl_au', '_ga_WC57KJ50ZZ', '_ga_BF8Q35BMLM',
    'SID', '__Secure-1PSID', '__Secure-3PSID', 'NID'
]);

class GeminiWebAuthError extends Error {
    constructor(message) {
        super(message || 'Gemini Web auth failed: الكوكيز غير صالحة أو منتهية');
        this.name = 'GeminiWebAuthError';
    }
}

// ---------- Cookie jars (in-memory, تتبّع تدوير الكوكيز مثل البروكسي) ----------
const cookieJars = new Map(); // cookieKey -> { cookies: {}, updatedAt }

function parseCookieString(cookieStr) {
    const result = {};
    String(cookieStr || '').split(';').forEach(part => {
        const p = part.trim();
        const idx = p.indexOf('=');
        if (idx > 0) result[p.slice(0, idx).trim()] = p.slice(idx + 1).trim();
    });
    return result;
}

function cookiesToString(cookies) {
    return Object.entries(cookies || {}).map(([k, v]) => `${k}=${v}`).join('; ');
}

function cookieKeyFor(token) {
    const t = String(token || '');
    return 'gem_' + crypto.createHash('md5').update(t.substring(0, 64) || 'empty').digest('hex').substring(0, 16);
}

function getJar(token) {
    const key = cookieKeyFor(token);
    if (!cookieJars.has(key)) {
        cookieJars.set(key, { cookies: parseCookieString(token), updatedAt: Date.now() });
    }
    return cookieJars.get(key);
}

function mergeSetCookies(jar, setCookieHeaders) {
    if (!Array.isArray(setCookieHeaders)) return;
    let updated = [];
    for (const raw of setCookieHeaders) {
        const first = String(raw).split(';')[0];
        const idx = first.indexOf('=');
        if (idx <= 0) continue;
        const name = first.slice(0, idx).trim();
        const value = first.slice(idx + 1).trim();
        if (!TRACKED_COOKIES.has(name)) continue;
        if (jar.cookies[name] !== value) {
            jar.cookies[name] = value;
            updated.push(name);
        }
    }
    if (updated.length) {
        jar.updatedAt = Date.now();
        console.log(`[geminiWeb] cookies updated: ${updated.join(', ')}`);
    }
}

// ---------- Headers ----------
function geminiHeaders(cookiesStr) {
    return {
        'authority': 'gemini.google.com',
        'accept': '*/*',
        'accept-language': 'ar,en-US;q=0.9,en;q=0.8',
        'origin': 'https://gemini.google.com',
        'referer': 'https://gemini.google.com/',
        'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36',
        'x-same-domain': '1',
        'cookie': cookiesStr
    };
}

// ---------- جلب توكني الجلسة SNlM0e + FdrFJe (مثل البروكسي: تتبّع التحويلات يدوياً) ----------
async function getTokens(jar) {
    let url = GEMINI_APP_URL;
    let resp = null;
    const baseHeaders = geminiHeaders(cookiesToString(jar.cookies));
    delete baseHeaders['content-type'];

    for (let hop = 0; hop < 5; hop++) {
        resp = await axios.get(url, {
            headers: baseHeaders,
            timeout: 30000,
            maxRedirects: 0,
            validateStatus: () => true
        });
        mergeSetCookies(jar, resp.headers?.['set-cookie']);
        if ([301, 302, 303, 307, 308].includes(resp.status)) {
            let location = resp.headers?.location || '';
            if (!location) break;
            if (location.startsWith('/')) location = 'https://gemini.google.com' + location;
            url = location;
            continue;
        }
        break;
    }

    const page = String(resp?.data || '');
    let snlm0e = null;
    let fdrfje = null;
    for (const pattern of [/"SNlM0e":"(.*?)"/, /'SNlM0e':'(.*?)'/, /SNlM0e["\s]*:["\s]*"([^"]+)"/]) {
        const m = page.match(pattern);
        if (m) { snlm0e = m[1]; break; }
    }
    for (const pattern of [/"FdrFJe":"([\d-]+)"/, /'FdrFJe':'([\d-]+)'/, /FdrFJe["\s]*:["\s]*"([\d-]+)"/]) {
        const m = page.match(pattern);
        if (m) { fdrfje = m[1]; break; }
    }
    if (!snlm0e) {
        console.error(`[geminiWeb] SNlM0e not found (page len ${page.length}) — الكوكيز غير صالحة أو منتهية`);
        return null;
    }
    console.log(`[geminiWeb] tokens OK snlm0e=${snlm0e.substring(0, 8)}... fdrfje=${fdrfje || '-'}`);
    return { snlm0e, fdrfje };
}

// ---------- إرسال رسالة (نداء StreamGenerate نفسه في البروكسي) ----------
function buildContext(conv) {
    if (!conv) return ['', '', '', null, null, null, null, null, null, ''];
    return [
        conv.conversation_id || '',
        conv.response_id || '',
        conv.choice_id || '',
        null, null, null, null, null, null,
        conv.at_token || ''
    ];
}

async function sendMessage(jar, tokens, prompt, conv, timeoutMs) {
    const d1 = [
        [prompt, 0, null, null, null, null, 0],
        ['ar'],
        buildContext(conv),
        null, null, null, [], 0, [], [], 1, 0
    ];
    const payload = {
        at: tokens.snlm0e,
        'f.req': JSON.stringify([null, JSON.stringify(d1)])
    };
    const params = {
        bl: GEMINI_BL,
        hl: 'ar',
        pageId: 'none',
        _reqid: String(Math.floor(Math.random() * 9_000_000) + 1_000_000),
        rt: 'c',
        'f.sid': tokens.fdrfje || ''
    };

    const headers = geminiHeaders(cookiesToString(jar.cookies));
    headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
    headers['x-goog-ext-525001261-jspb'] = GEMINI_MODEL_JSPB;
    headers['x-goog-ext-73010989-jspb'] = '[0]';
    headers['x-goog-ext-73010990-jspb'] = '[0,0,0]';

    const response = await axios.post(GEMINI_STREAM_URL, new URLSearchParams(payload).toString(), {
        params,
        headers,
        timeout: timeoutMs || 300000,
        responseType: 'stream',
        maxRedirects: 0,
        validateStatus: s => s < 500
    });

    // كوكيز الاستجابة تُدمج دائماً (تدوير PSIDTS)
    mergeSetCookies(jar, response.headers?.['set-cookie']);

    if (response.status >= 400) {
        let errBody = '';
        response.data.on('data', c => { errBody += c.toString(); if (errBody.length > 400) response.data.destroy(); });
        await new Promise(resolve => response.data.on('end', resolve).on('close', resolve).on('error', resolve));
        throw new Error(`Gemini Web HTTP ${response.status}: ${errBody.replace(/\s+/g, ' ').substring(0, 160)}`);
    }

    let fullText = '';
    let longestSeen = '';
    const newConv = conv ? { ...conv } : {};

    await new Promise((resolve, reject) => {
        response.data.on('data', chunk => {
            chunk.toString().split('\n').forEach(line => {
                const raw = line.trim();
                if (!raw) return;
                try {
                    const a1 = JSON.parse(raw);
                    if (!Array.isArray(a1) || !a1.length) return;
                    if (a1[0]?.length >= 3 && a1[0][2]) {
                        const c2 = JSON.parse(a1[0][2]);
                        try {
                            if (!newConv.conversation_id) {
                                const convMeta = c2[1];
                                if (convMeta && convMeta.length >= 2) {
                                    newConv.conversation_id = convMeta[0];
                                    newConv.response_id = convMeta[1];
                                }
                            }
                        } catch (_) { /* ignore */ }
                        try {
                            const candidates = c2[4];
                            if (candidates && candidates[0]) {
                                const choice = candidates[0];
                                if (choice[0]) newConv.choice_id = choice[0];
                                const text = choice[1]?.[0] || '';
                                if (text) {
                                    if (text.length > longestSeen.length) longestSeen = text;
                                    // نفس منطق البروكسي: لقطات تدريجية تنمو؛ نقبل ما يمتد النص السابق
                                    if (text.startsWith(fullText) && text.length > fullText.length) {
                                        fullText = text;
                                    }
                                }
                            }
                        } catch (_) { /* ignore */ }
                        try {
                            if (c2[3] && typeof c2[3] === 'object') {
                                const atVal = c2[3]['26'];
                                if (atVal) newConv.at_token = atVal;
                            }
                        } catch (_) { /* ignore */ }
                    }
                } catch (_) { /* سطر غير JSON — تجاهل */ }
            });
        });
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });

    // أمان: إن لم ينمو النص تدريجياً (لقطات متفرقة) خذ أطول لقطة رأيناها
    if (!fullText && longestSeen) fullText = longestSeen;
    return { text: fullText, conv: newConv.conversation_id ? newConv : null };
}

// ---------- كشف القطع: هل الرد انتهى في منتصف الجملة؟ ----------
function looksIncomplete(text) {
    const t = String(text || '');
    if (t.trim().length < 200) return false; // الردود القصيرة (JSON/مراجعات) تُعتبر مكتملة
    const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
    const last = (lines[lines.length - 1] || '').replace(/[*_#`>\-]+$/g, '').trim();
    if (!last) return false;
    // علامات نهاية مقبولة للفقرات/الحوارات العربية والإنجليزية
    return !/[.!?؟…«»"”’」』)\]}:\-]$/.test(last);
}

// قصّ التداخل: إن أعاد النموذج تكرار نهاية الجزء السابق، احذف التكرار قبل الدمج
function stitchWithoutOverlap(existing, addition) {
    const a = String(existing || '');
    const b = String(addition || '');
    if (!a) return b;
    if (!b) return a;
    const maxCheck = Math.min(300, a.length, b.length);
    for (let k = maxCheck; k >= 20; k--) {
        const suffix = a.slice(-k);
        if (b.startsWith(suffix)) {
            return a + b.slice(k);
        }
    }
    const needsSpace = !/\s$/.test(a) && !/^\s/.test(b);
    return a + (needsSpace ? '\n' : '') + b;
}

// ---------- النقطة العامة: askGeminiWeb ----------
// options: { token (كوكيز), timeout, context (حالة المحادثة اللاصقة — نفس نمط askQwen), log }
async function askGeminiWeb(prompt, options = {}) {
    const token = options.token || '';
    if (!token || token.startsWith('dummy-key-for-')) {
        throw new GeminiWebAuthError('لا توجد كوكيز Gemini — أضف كوكيز gemini.google.com في حقل المفاتيح');
    }
    if (!String(token).includes('__Secure-1PSID=') && !String(token).includes('SID=')) {
        throw new GeminiWebAuthError('المفتاح لا يبدو كوكيز Gemini صالحة (يجب أن يحتوي __Secure-1PSID=...) — انسخ الكوكيز من متصفح مسجّل الدخول في gemini.google.com');
    }
    const log = typeof options.log === 'function' ? options.log : null;
    const jar = getJar(token);
    const context = options.context || {};
    let conv = context.geminiConv || null;

    // 1) توكنات الجلسة (مع تتبّع الكوكيز الدوّارة)
    let tokens = await getTokens(jar);
    if (!tokens) {
        // محاولة ثانية بعد تحديث الكوكيز من التحويلات (مثل سلوك البروكسي مع PSIDTS الجديدة)
        await new Promise(r => setTimeout(r, 1200));
        tokens = await getTokens(jar);
    }
    if (!tokens) {
        throw new GeminiWebAuthError('تعذر جلب جلسة Gemini Web — الكوكيز غير صالحة أو منتهية. افتح gemini.google.com في المتصفح وانسخ كوكيز جديدة ثم حدّث المفاتيح');
    }

    // 2) الطلب الأول
    const timeoutMs = options.timeout || 300000;
    let { text, conv: newConv } = await sendMessage(jar, tokens, prompt, conv, timeoutMs);
    conv = newConv;
    if (context) context.geminiConv = conv;
    let resultText = text || '';

    // 3) 🔥 الإكمال التلقائي ضد القطع ("يترجم نصفه / آخره كأنه انقطع")
    let continuationRounds = 0;
    const MAX_CONTINUATIONS = 2;
    while (looksIncomplete(resultText) && continuationRounds < MAX_CONTINUATIONS) {
        continuationRounds++;
        const tail = resultText.slice(-90).replace(/\s+/g, ' ');
        if (log) log(`الرد كان مقطوعاً في نهايته — جاري الإكمال تلقائياً في نفس المحادثة (جولة ${continuationRounds}/${MAX_CONTINUATIONS})...`, 'info');
        console.log(`[geminiWeb] continuation round ${continuationRounds} (text len ${resultText.length})`);
        try {
            const contPrompt = `أكمل المهمة السابقة من حيث توقفت تماماً. ابدأ مباشرة بعد نهاية النص السابق الذي انتهى بـ: «...${tail}»\nلا تكرر أي جملة أو فقرة سبقت، ولا تعِد الترجمة من البداية، ولا تضف مقدمات أو شرحاً — أكمل النص فقط حتى نهايته ثم توقف.`;
            const cont = await sendMessage(jar, tokens, contPrompt, conv, timeoutMs);
            if (!cont.text || !cont.text.trim()) break;
            conv = cont.conv || conv;
            if (context) context.geminiConv = conv;
            const before = resultText.length;
            resultText = stitchWithoutOverlap(resultText, cont.text);
            if (resultText.length <= before) break; // لم يُضف شيء جديد — توقف
        } catch (contErr) {
            console.error(`[geminiWeb] continuation failed: ${contErr.message}`);
            break;
        }
    }

    if (!resultText.trim()) {
        throw new Error('Gemini Web أعاد رداً فارغاً');
    }
    return resultText;
}

module.exports = { askGeminiWeb, GeminiWebAuthError };
