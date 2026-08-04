const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios'); // 🔥 NEW: for OpenRouter and custom providers
const Novel = require('../models/novel.model.js');
const Glossary = require('../models/glossary.model.js');
const TranslationJob = require('../models/translationJob.model.js');
const Settings = require('../models/settings.model.js');
const { askDeepSeek } = require('../services/deepseekAndroid.service.js');
const { askQwen } = require('../services/qwenAndroid.service.js');
const { askChatGPTAndroid } = require('../services/chatgptAndroid.service.js');

const DEEPSEEK_CHAPTERS_PER_CONVERSATION = 100;
const DEEPSEEK_MAX_ATTEMPTS_PER_TOKEN = 5;
const DEFAULT_DEEPSEEK_POW_PROVIDERS = [
    { id: 'railway', name: 'Railway', url: 'https://web-production-c09dc.up.railway.app/pow' },
    { id: 'ngrok', name: 'Ngrok', url: 'https://immunize-quintet-trimmer.ngrok-free.dev/get_pow' }
];
const stickyTokenAssignments = new Map();
let stickyNextTokenIndex = 0;


function normalizePowProviderUrl(url) {
    const value = url || '';
    return value.includes('/get_pow') ? value.split('?')[0] : value;
}

function resolveDeepSeekPowUrl(provider) {
    const powProviders = Array.isArray(provider.powProviders) && provider.powProviders.length > 0
        ? provider.powProviders
        : DEFAULT_DEEPSEEK_POW_PROVIDERS;
    const selected = powProviders.find(p => p.id === provider.selectedPowProviderId) || powProviders[0];
    return normalizePowProviderUrl(selected?.url);
}

function getDeepSeekConversationContext(contextStore, purpose, batchKey, scopeKey = 'default') {
    if (!contextStore || !purpose || batchKey === undefined || batchKey === null) return undefined;
    if (!contextStore[purpose]) contextStore[purpose] = new Map();
    const scopedStore = contextStore[purpose];
    const contextKey = `${scopeKey}:${batchKey}`;
    if (!scopedStore.has(contextKey)) {
        scopedStore.set(contextKey, {
            purpose,
            batchKey,
            scopeKey,
            sessionId: null,
            parentMessageId: null,
            requestMessageId: null,
            lastUpdated: null
        });
    }
    return scopedStore.get(contextKey);
}

function resetConversationContextsForScope(contextStore, scopeKey, batchKey) {
    if (!contextStore || !scopeKey) return;
    for (const scopedStore of Object.values(contextStore)) {
        if (!(scopedStore instanceof Map)) continue;
        for (const [contextKey, context] of scopedStore.entries()) {
            if (context?.scopeKey !== scopeKey) continue;
            if (batchKey !== undefined && batchKey !== null && context.batchKey !== batchKey) continue;
            scopedStore.delete(contextKey);
        }
    }
}

function getTokenConversationScope(provider, key, keyIdx) {
    const providerKey = provider.providerId || provider.name || 'provider';
    const tokenHash = hashStringToIndex(key || `key-${keyIdx}`, 1000000007);
    return `${providerKey}:token-${keyIdx}:${tokenHash}`;
}

function hashStringToIndex(value, size) {
    if (!value || size <= 0) return 0;
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % size;
}

function getProviderAuthKeys(provider) {
    if (isDeepSeekProvider(provider)) {
        const deepSeekTokens = Array.isArray(provider.deepSeekTokens)
            ? provider.deepSeekTokens.map(t => (t || '').trim()).filter(Boolean)
            : [];
        if (deepSeekTokens.length > 0) return deepSeekTokens;
    }
    if (isQwenProvider(provider)) {
        const qwenTokens = Array.isArray(provider.qwenTokens)
            ? provider.qwenTokens.map(t => (t || '').trim()).filter(Boolean)
            : [];
        if (qwenTokens.length > 0) return qwenTokens;
    }
    if (isChatGPTAndroidProvider(provider)) {
        const chatGptTokens = Array.isArray(provider.chatGptTokens)
            ? provider.chatGptTokens.map(t => (t || '').trim()).filter(Boolean)
            : [];
        if (chatGptTokens.length > 0) return chatGptTokens;
    }
    return Array.isArray(provider.apiKeys) ? provider.apiKeys.map(k => (k || '').trim()).filter(Boolean) : [];
}

function pickDeepSeekToken(provider, options = {}, explicitToken) {
    const directToken = (explicitToken || '').trim();
    if (directToken && !directToken.startsWith('dummy-key-for-')) return directToken;
    const tokenField = isQwenProvider(provider) ? provider.qwenTokens : provider.deepSeekTokens;
    const tokens = Array.isArray(tokenField)
        ? tokenField.map(t => (t || '').trim()).filter(Boolean)
        : [];
    if (tokens.length === 0) return provider.deepSeekToken || undefined;
    const stickyKey = `${options.deepSeekJobId || ''}:${provider.providerId || provider.name || 'deepseek'}`;
    if (options.deepSeekJobId) {
        if (!stickyTokenAssignments.has(stickyKey)) {
            stickyTokenAssignments.set(stickyKey, stickyNextTokenIndex % tokens.length);
            stickyNextTokenIndex++;
        }
        return tokens[stickyTokenAssignments.get(stickyKey) % tokens.length];
    }
    return tokens[hashStringToIndex(stickyKey, tokens.length)];
}

// --- Firestore Setup (MANDATORY) ---
let firestore;
try {
    const firebaseAdmin = require('../config/firebaseAdmin');
    firestore = firebaseAdmin.db;
} catch (e) {
    console.error("❌ CRITICAL: Firestore not loaded. Translator cannot work without it.");
}

// --- Helper: Delay ---
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// 🔥 Helper to get GLOBAL Settings (Singleton)
async function getGlobalSettings() {
    let settings = await Settings.findOne();
    if (!settings) {
        settings = new Settings({});
        await settings.save();
    }
    return settings;
}

// 🔥 New Default Prompt as provided by user
const DEFAULT_EXTRACT_PROMPT = `ROLE: Expert Web Novel Terminology Extractor.
TASK: Analyze the "English Text" and "Arabic Translation" below. Extract key proper nouns, unique concepts, and specific terminology for a comprehensive Glossary (Codex).

STRICT RULES:
1.  Categories: Classify each extracted term into one of: 'character', 'location', 'item', 'rank', 'concept', 'other'.
    *   character: Names of individuals, specific titles referring to a person.
    *   location: Cities, villages, geographical regions, buildings, headquarters.
    *   item: Tools, weapons, materials, unique objects, or specific creatures.
    *   rank: General military, social, or cultivation ranks (not specific character names).
    *   concept: Spiritual, philosophical, agricultural terms, general techniques, or abstract ideas.
    *   other: Any other important term that doesn't fit the above categories.
2.  Format: Return a clean JSON array of objects.
3.  Content:
    *   "name": The exact English name (Capitalized where appropriate).
    *   "translation": The exact Arabic translation used in the text.
    *   "description": وصف قصير جداً باللغة العربية (2-4 كلمات)، مثل: "البطل الرئيسي", "مهارة سيف", "طريقة زراعة", "طاقة روحية".
4.  Filtering & Exclusion (قواعد التصفية والاستبعاد):
    *   Ignore common words. Only specific names, places, unique cultivation terms, and key concepts should be extracted.
    *   Blacklist (تجاهل تام - لا تستخرج هذه أبداً):
        *   الأرقام المنفردة أو أرقام الفصول (مثال: 1, 500, Chapter 10).
        *   عبارات النظام أو الإشعارات (مثال: Ding, System alert, Level Up).
        *   جمل التفاعل والإعلانات (مثال: Subscribe, Read at..., Translator notes, ...).
        *   الأفعال والصفات العادية (مثال: run, fast, big, eat, go).
        *   الكلمات الشائعة جداً التي لا تعتبر مصطلحات خاصة.
5.  Accuracy (الدقة):
    *   Each extracted English term must be unique.
    *   The Arabic translation must exactly match the word or phrase used in the provided Arabic text.
    *   Extracted terms must be meaningful within their context.

Focus Areas (مجالات التركيز - لتوجيه الاستخراج):
*   مصطلحات الزراعة والتقنيات: مثل أنواع النباتات، أساليب الزراعة، أدوات وتقنيات زراعية، أمراض النباتات، حلول هندسية زراعية.
*   أسماء المواقع والمقرات: أسماء المدن، القرى، المناطق الجغرافية، المباني، المقرات الحكومية أو الخاصة، أي موقع ذي أهمية.
*   الشخصيات والرتب الخالدة: أسماء الأشخاص، الألقاب، الرتب العسكرية أو الاجتماعية، الشخصيات التاريخية أو الخيالية.
*   المفاهيم الروحية والزراعية: المصطلحات الدينية، الفلسفية، الروحية، أو المفاهيم المتعلقة بالزراعة العضوية، الاستدامة، التنوع البيولوجي.

OUTPUT JSON STRUCTURE:
[
  { "category": "character", "name": "Fang Yuan", "translation": "فانغ يوان", "description": "البطل الرئيسي" },
  { "category": "concept", "name": "Immortal Gu", "translation": "غو الخالد", "description": "عنصر زراعة" },
  { "category": "location", "name": "Green Mountain Sect", "translation": "طائفة الجبل الأخضر", "description": "مقر الطائفة" }
]

RETURN ONLY JSON:`;

// 🔥 Check if a model is a translation-only model (cannot do JSON extraction)
function isTranslationOnlyModel(modelId) {
    if (!modelId) return false;
    // Cloudflare translation models – cannot instruct with prompts
    if (modelId.startsWith('@cf/meta/m2m100')) return true;
    // Add other translation-only models here if needed
    return false;
}

// 🔥 Find the first LLM model in a provider (for extraction)
function findLLMModel(provider) {
    if (!provider.models || provider.models.length === 0) return null;
    return provider.models.find(m => !isTranslationOnlyModel(m.modelId)) || null;
}

// 🔥 Helper to detect if a provider is ChatGPT Android (by name or model)
function isDeepSeekProvider(provider) {
    const providerId = (provider.providerId || '').toLowerCase();
    const name = (provider.name || '').toLowerCase();
    const model = (provider.selectedModel || '').toLowerCase();
    const hasDeepSeekModel = provider.models && provider.models.some(m => (m.modelId || '').toLowerCase().includes('deepseek'));
    return providerId === 'deepseek' || name.includes('deepseek') || model.includes('deepseek') || hasDeepSeekModel;
}

function isQwenProvider(provider) {
    const providerId = (provider.providerId || '').toLowerCase();
    const name = (provider.name || '').toLowerCase();
    const model = (provider.selectedModel || '').toLowerCase();
    const hasQwenModel = provider.models && provider.models.some(m => (m.modelId || '').toLowerCase().includes('qwen'));
    return providerId === 'qwen' || name.includes('qwen') || model.includes('qwen') || hasQwenModel;
}

function isChatGPTAndroidProvider(provider) {
    const providerId = (provider.providerId || '').toLowerCase();
    const name = (provider.name || '').toLowerCase();
    const model = (provider.selectedModel || '').toLowerCase();
    const hasGptModel = provider.models && provider.models.some(m => /(gpt|chatgpt)/i.test(m.modelId || ''));
    return providerId === 'chatgpt-android' || name.includes('chatgpt') || model.includes('gpt') || hasGptModel;
}

function isStickyChatProvider(provider) {
    return isDeepSeekProvider(provider) || isQwenProvider(provider) || isChatGPTAndroidProvider(provider);
}

const ARABIC_FULL_CHAPTER_WORD_THRESHOLD = 800;
const SHORT_CHAPTER_SOURCE_WORD_THRESHOLD = 900;
const MIN_ARABIC_TO_ENGLISH_WORD_RATIO = 0.35;
const ALLOWED_SHORT_LATIN_TOKEN_PATTERN = /^[A-Z]{2,4}\d*$/;

function stripCodeBlocks(text) {
    return (text || '').replace(/```[\s\S]*?```/g, ' ');
}

function removeDeepSeekFinishedMarker(text) {
    return (text || '').replace(/(?:\r?\n|\s)*FINISHED\s*$/i, '').trim();
}

function getArabicLetterCount(text) {
    return (text || '').match(/[\u0600-\u06FF]/g)?.length || 0;
}

function getArabicWordCount(text) {
    return ((text || '').match(/[\u0600-\u06FF]+/g) || []).length;
}

function getEnglishWordCount(text) {
    return ((text || '').match(/\b[A-Za-z][A-Za-z'’\-]*\b/g) || []).length;
}

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAllowedShortLatinToken(word) {
    const normalized = (word || '').trim();
    if (normalized.length <= 1) return true;
    
    // ✅ جديد: السماح بأي سلسلة مكررة من نفس الحرف (SS, SSS, AAA, bb ...)
    if (/^([a-zA-Z])\1+$/.test(normalized)) return true;
    
    // السلوك القديم: السماح باختصارات معينة بشرط عدم وجود حروف علة
    return ALLOWED_SHORT_LATIN_TOKEN_PATTERN.test(normalized) && !/[AEIOU]/.test(normalized);
}

function extractEnglishResidues(text) {
    const cleaned = stripCodeBlocks(removeDeepSeekFinishedMarker(text));
    const matches = cleaned.match(/\b[A-Za-z][A-Za-z'’\-]*\b/g) || [];
    const seen = new Set();
    const residues = [];

    for (const word of matches) {
        const normalized = word.trim();
        if (normalized.toUpperCase() === 'FINISHED') continue;
        // السماح بالرموز اللاتينية القصيرة للرتب/المستويات مثل A أو S أو LV أو HP.
        if (isAllowedShortLatinToken(normalized)) continue;
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        residues.push(normalized);
    }

    return residues;
}

function getEnglishResidueContexts(text, residues, contextChars = 45) {
    const value = text || '';
    return residues.slice(0, 80).map(word => {
        const match = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i').exec(value);
        if (!match) return { word, context: word };
        const start = Math.max(0, match.index - contextChars);
        const end = Math.min(value.length, match.index + word.length + contextChars);
        return { word, context: value.substring(start, end).replace(/\s+/g, ' ').trim() };
    });
}

function parseJsonFromAiText(text) {
    let jsonText = (text || '').trim();
    if (jsonText.startsWith('```json')) jsonText = jsonText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    else if (jsonText.startsWith('```')) jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    if (/^json\s*[\n\r]/i.test(jsonText)) jsonText = jsonText.replace(/^json\s*[\n\r]+/i, '');
    const jsonMatch = jsonText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (jsonMatch) jsonText = jsonMatch[1];
    return JSON.parse(jsonText);
}

function isLikelyAiRefusalOrMeta(text) {
    const lower = (text || '').toLowerCase();
    const patterns = [
        /\bas an ai\b/,
        /\bi (?:can'?t|cannot|am unable to)\b/,
        /\bi need (?:the )?(?:chapter|text|content)\b/,
        /\bplease provide\b/,
        /\btranslation\s+instructions?\b/,
        /\bglossary\b[\s\S]{0,120}\bjson\b/,
        /\benglish text to translate\b/,
        /\boutput only\b/
    ];
    return patterns.some(pattern => pattern.test(lower));
}

function validateTranslatedChapter(translatedText, sourceContent) {
    const text = removeDeepSeekFinishedMarker(translatedText);
    const source = (sourceContent || '').trim();
    const reasons = [];
    const englishResidues = extractEnglishResidues(text);
    const arabicWords = getArabicWordCount(text);
    const sourceWords = getEnglishWordCount(source);
    const wordRatio = sourceWords > 0 ? arabicWords / sourceWords : 0;
    const sourceLooksShort = sourceWords > 0 && sourceWords < SHORT_CHAPTER_SOURCE_WORD_THRESHOLD;

    if (text.length < 80 && source.length >= 200) reasons.push('الناتج قصير جداً ولا يبدو فصلاً مترجماً كاملاً');
    if (!sourceLooksShort && source.length >= 500 && text.length < source.length * 0.20) reasons.push('الناتج أقصر بكثير من الفصل الأصلي');
    if (getArabicLetterCount(text) < 50) reasons.push('الناتج لا يحتوي على نص عربي كافٍ');
    if (englishResidues.length > 0) reasons.push(`الناتج يحتوي على كلمات إنجليزية غير مترجمة: ${englishResidues.slice(0, 12).join(', ')}`);
    if (isLikelyAiRefusalOrMeta(text)) reasons.push('الناتج يبدو كرسالة من الذكاء الاصطناعي أو تعليمات وليس فصلاً مترجماً');
    if (!sourceLooksShort && sourceWords >= SHORT_CHAPTER_SOURCE_WORD_THRESHOLD && arabicWords > 0 && arabicWords < ARABIC_FULL_CHAPTER_WORD_THRESHOLD && wordRatio < MIN_ARABIC_TO_ENGLISH_WORD_RATIO) {
        reasons.push(`الناتج العربي قصير مقارنة بالأصل: ${arabicWords} كلمة عربية مقابل ${sourceWords} كلمة إنجليزية تقريباً`);
    }

    return { ok: reasons.length === 0, reasons, englishResidues, arabicWords, sourceWords, wordRatio };
}

async function translateEnglishResiduesOnly(provider, modelToUse, key, translatedText, residues, options) {
    if (!residues.length) return translatedText;
    const contexts = getEnglishResidueContexts(translatedText, residues);
    const prompt = `
أنت مدقق ترجمة عربية. توجد كلمات إنجليزية متبقية داخل فصل عربي.
المطلوب: ترجم كل كلمة إنجليزية فقط اعتماداً على السياق المجاور، ولا تترجم الجملة كاملة.
إذا كانت الكلمة رمزاً لاتينياً قصيراً يمثل رتبة/تصنيفاً مثل A أو S أو LV أو HP فلا تُرجعها أصلاً.
أعد JSON فقط بالشكل:
[{"word":"EnglishWord","translation":"الترجمة العربية"}]

الكلمات والسياقات:
${JSON.stringify(contexts, null, 2)}
`;
    const response = await callTranslationProvider(provider, modelToUse, key, prompt, options);
    let replacements = [];
    try {
        const parsed = parseJsonFromAiText(response);
        replacements = Array.isArray(parsed) ? parsed : (parsed.replacements || []);
    } catch (e) {
        throw new Error(`فشل تحليل بدائل الكلمات الإنجليزية: ${e.message}`);
    }

    let fixedText = translatedText;
    for (const item of replacements) {
        const word = (item.word || '').trim();
        const translation = (item.translation || '').trim();
        if (!word || !translation || word.length <= 1) continue;
        fixedText = fixedText.replace(new RegExp(`\\b${escapeRegex(word)}\\b`, 'g'), translation);
    }
    return fixedText;
}

async function reviewQuestionableChapter(provider, modelToUse, key, translatedText, sourceContent, validation, options) {
    const prompt = `
أنت مراجع جودة لترجمة فصول روايات من الإنجليزية إلى العربية.
قارن النص الإنجليزي الأصلي بالنص العربي الناتج، ولا تعتمد على عدد كلمات عربي ثابت وحده.

مؤشرات آلية:
- كلمات الأصل الإنجليزية تقريباً: ${validation.sourceWords}
- كلمات النص العربي تقريباً: ${validation.arabicWords}
- نسبة العربي إلى الإنجليزي تقريباً: ${validation.wordRatio.toFixed(2)}
- الملاحظات:
- ${validation.reasons.join('\n- ')}

القواعد النهائية:
1. إذا كان الأصل نفسه قصيراً والعربي يغطي نفس الأحداث وبحجم منطقي، القرار accept حتى لو كان أقل من ${ARABIC_FULL_CHAPTER_WORD_THRESHOLD} كلمة.
2. إذا كان العربي مختصراً/ناقصاً مقارنة بالأصل أو رسالة ذكاء اصطناعي أو تعليمات، القرار retranslate.
3. الرموز اللاتينية القصيرة مثل A أو S أو B أو LV أو HP مسموحة إذا كانت رتباً/تصنيفات/مستويات ولا تجعل الفصل يفشل.
4. الكلمات الإنجليزية الكاملة داخل النص العربي يجب أن تكون قد تُرجمت واستُبدلت فقط، ولا تطلب إعادة ترجمة فصل كامل بسببها إلا إذا بقيت كثيرة أو أثبتت أن الفصل غير مترجم.
5. أعد JSON فقط بدون شرح زائد.

الشكل المطلوب:
{"decision":"accept" أو "retranslate", "reason":"سبب عربي قصير يوضح المقارنة مع الأصل"}

النص الإنجليزي الأصلي للمقارنة:
"""${sourceContent.substring(0, 7000)}"""

النص العربي للمراجعة:
"""${translatedText.substring(0, 9000)}"""
`;
    const response = await callTranslationProvider(provider, modelToUse, key, prompt, options);
    try {
        const parsed = parseJsonFromAiText(response);
        const rawDecision = String(parsed.decision || parsed.Decision || parsed.status || parsed.result || '').trim().toLowerCase();
        const decision = ['accept', 'accepted', 'ok', 'pass', 'قبول', 'مقبول'].includes(rawDecision)
            ? 'accept'
            : 'retranslate';
        return {
            decision,
            reason: parsed.reason || 'قرار المراجع الآلي',
            rawResponse: response
        };
    } catch (e) {
        if (/"decision"\s*:\s*"accept"/i.test(response || '') || /\baccept(?:ed)?\b/i.test(response || '')) {
            return { decision: 'accept', reason: 'تم قبول الفصل من رد المراجع النصي رغم تعذر تحليل JSON حرفياً', rawResponse: response };
        }
        return { decision: 'retranslate', reason: `تعذر تحليل رد المراجعة: ${e.message}`, rawResponse: response };
    }
}

function buildRepairTranslationPrompt(basePrompt, glossaryText, sourceContent, previousTranslation, reasons) {
    return `
${basePrompt}

مراجعة صارمة: الترجمة السابقة فشلت للأسباب التالية:
- ${reasons.join('\n- ')}

أعد ترجمة الفصل كاملاً من النص الإنجليزي الأصلي أدناه إلى العربية فقط.
مسموح فقط برموز لاتينية قصيرة للرتب/التصنيفات/المستويات مثل A أو S أو LV أو HP عند الحاجة.
ممنوع ترك أي كلمة إنجليزية كاملة داخل السرد. ممنوع الاعتذار أو شرح ما فعلته. ممنوع إخراج JSON أو مصطلحات فقط.
أخرج الفصل المترجم كاملاً فقط.

--- GLOSSARY (Use these strictly) ---
${glossaryText}
-------------------------------------

--- PREVIOUS FAILED OUTPUT (Do not copy its English/meta errors) ---
${(previousTranslation || '').substring(0, 5000)}
-------------------------------------

--- ENGLISH Text TO TRANSLATE ---
${sourceContent}
---------------------------------
`;
}

// 🔥 Unified provider caller supporting Gemini, OpenRouter, Cloudflare, custom APIs, and ChatGPT Android
async function callTranslationProvider(provider, modelName, apiKey, prompt, options = {}) {
    const providerId = (provider.providerId || 'gemini').toLowerCase();
    const isCloudflare = (providerId === 'cloudflare');
    const isDeepSeek = isDeepSeekProvider(provider);
    const isChatGPT = isChatGPTAndroidProvider(provider);

    // ---- DeepSeek Android/Web API (same flow as the standalone DeepSeek app) ----
    if (isDeepSeek) {
        const deepSeekToken = pickDeepSeekToken(provider, options, apiKey);
        const deepSeekOptions = {
            // DeepSeek هنا هو مزوّد تطبيق المحادثة وليس واجهة API الرسمية.
            // لذلك لا نمرر مفاتيح OpenAI-compatible مثل sk-* كـ Bearer token لأنها تسبب
            // Authorization Failed، ونستخدم رمز التطبيق الافتراضي مثل التطبيق المستقل.
            token: deepSeekToken,
            thinkingEnabled: Boolean(provider.thinkingEnabled),
            searchEnabled: provider.searchEnabled !== false,
            modelType: provider.deepSeekModelType === 'expert' ? 'expert' : 'default',
            powUrl: resolveDeepSeekPowUrl(provider),
            timeout: options.timeout || 500000,
            context: getDeepSeekConversationContext(
                options.conversationContexts,
                options.conversationPurpose,
                options.conversationBatchKey,
                options.conversationScopeKey
            )
        };
        return askDeepSeek(prompt, deepSeekOptions);
    }

    // ---- Gemini native ----
    if (providerId === 'gemini' && !provider.baseUrl) {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    }

    // ---- Qwen Android API (same conversation/token behavior as DeepSeek) ----
    if (isQwenProvider(provider)) {
        return askQwen(prompt, {
            token: apiKey && !apiKey.startsWith('dummy-key-for-') ? apiKey : provider.qwenToken,
            model: modelName || 'qwen3.8-max',
            thinkingEnabled: Boolean(provider.thinkingEnabled),
            searchEnabled: provider.searchEnabled !== false,
            timeout: options.timeout || 500000,
            context: getDeepSeekConversationContext(
                options.conversationContexts,
                options.conversationPurpose,
                options.conversationBatchKey,
                options.conversationScopeKey
            )
        });
    }

    // ---- ChatGPT Android API from root gpt.py (service-backed, no inline legacy code) ----
    if (isChatGPT || providerId === 'chatgpt-android') {
        return askChatGPTAndroid(prompt, {
            token: apiKey && !apiKey.startsWith('dummy-key-for-') ? apiKey : provider.chatgptToken,
            model: modelName || 'gpt-5-5',
            timeout: options.timeout || 500000,
            context: getDeepSeekConversationContext(
                options.conversationContexts,
                options.conversationPurpose,
                options.conversationBatchKey,
                options.conversationScopeKey
            )
        });
    }

    // ---- Cloudflare Workers AI ----
    if (isCloudflare) {
        // baseUrl should be like: https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/run
        const baseUrl = provider.baseUrl || '';
        const url = `${baseUrl.replace(/\/+$/, '')}/${modelName}`;

        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        };

        let body;
        if (isTranslationOnlyModel(modelName)) {
            // Translation model (e.g., @cf/meta/m2m100-1.2b)
            body = {
                text: prompt,
                source_lang: options.sourceLang || 'en',
                target_lang: options.targetLang || 'ar'
            };
        } else {
            // LLM model (e.g., @cf/meta/llama-3.1-8b-instruct)
            body = {
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3
            };
        }

        const res = await axios.post(url, body, { headers, timeout: 500000 });
        const data = res.data;
        if (data.success && data.result) {
            // Translation models return translated_text, LLM models return response
            return data.result.translated_text || data.result.response || '';
        }
        throw new Error(`Cloudflare error: ${JSON.stringify(data)}`);
    }

    // ---- OpenAI-compatible (OpenRouter, custom baseUrl) ----
    const baseUrl = provider.baseUrl || 'https://openrouter.ai/api/v1';
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };
    // Add OpenRouter specific headers if needed
    if (providerId === 'openrouter') {
        headers['HTTP-Referer'] = 'https://zeus-novel.app';
        headers['X-Title'] = 'Zeus Novel Translator';
    }

    const body = {
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
    };

    const res = await axios.post(url, body, { headers, timeout: 500000 });
    const choice = res.data?.choices?.[0];
    if (choice && choice.message && choice.message.content) {
        return choice.message.content;
    }
    throw new Error(`Invalid response from ${providerId}: ${JSON.stringify(res.data)}`);
}

// --- THE TRANSLATION WORKER (STRICT FIRESTORE MODE) ---
async function processTranslationJob(jobId) {
    try {
        const job = await TranslationJob.findById(jobId);
        if (!job || job.status !== 'active') return;

        if (!firestore) {
            job.status = 'failed';
            job.logs.push({ message: 'خطأ خادم: قاعدة بيانات النصوص (Firestore) غير متصلة', type: 'error' });
            await job.save();
            return;
        }

        const novel = await Novel.findById(job.novelId);
        if (!novel) {
            job.status = 'failed';
            job.logs.push({ message: 'الرواية لم تعد موجودة', type: 'error' });
            await job.save();
            return;
        }

        const settings = await getGlobalSettings(); 
        
        // 🔥🔥 NEW: Read providers from new system; fallback to old keys if empty
        let providers = settings.translationProviders && settings.translationProviders.length > 0
            ? settings.translationProviders.slice()
            : [];

        // Fallback: if no new providers, build one from legacy settings
        if (providers.length === 0) {
            const legacyKeys = (job.apiKeys && job.apiKeys.length > 0) ? job.apiKeys : (settings?.translatorApiKeys || []);
            if (legacyKeys.length > 0) {
                const legacyModel = settings?.translatorModel || 'gemini-2.5-flash';
                providers = [{
                    providerId: 'gemini',
                    name: 'Gemini (Legacy)',
                    baseUrl: '',
                    models: [{ modelId: legacyModel, modelName: legacyModel }],
                    apiKeys: legacyKeys,
                    selectedModel: legacyModel,
                    priority: 0
                }];
            }
        }

        if (providers.length === 0) {
            job.status = 'failed';
            job.logs.push({ message: 'لا توجد مزوّدات ترجمة مفعلة مع مفاتيح API.', type: 'error' });
            await job.save();
            return;
        }

        // Sort by priority ascending
        providers.sort((a, b) => (a.priority || 0) - (b.priority || 0));

        const transPrompt = settings?.customPrompt || "You are a professional translator. Translate the novel chapter from English to Arabic. Output ONLY the Arabic translation. Use the glossary provided.";
        const extractPrompt = settings?.translatorExtractPrompt || DEFAULT_EXTRACT_PROMPT;

        const chaptersToProcess = job.targetChapters.sort((a, b) => a - b);
        const conversationContexts = { chapters: new Map(), glossary: new Map(), chapter_review: new Map() };
        let stickySuccessRoute = null;

        for (const [chapterIndex, chapterNum] of chaptersToProcess.entries()) {
            const freshJob = await TranslationJob.findById(jobId);
            // 🔥 Check for pause or stop
            if (!freshJob || freshJob.status !== 'active') {
                if (freshJob && freshJob.status === 'paused') {
                    await pushLog(jobId, `⏸️ تم إيقاف المهمة مؤقتاً عند الفصل ${chapterNum}`, 'warning');
                }
                break;
            }

            const conversationBatchKey = Math.floor(chapterIndex / DEEPSEEK_CHAPTERS_PER_CONVERSATION);
            const isFirstChapterInDeepSeekBatch = chapterIndex % DEEPSEEK_CHAPTERS_PER_CONVERSATION === 0;
            if (isFirstChapterInDeepSeekBatch) {
                await pushLog(jobId, `💬 بدء 3 محادثات جديدة للفصول ${chapterIndex + 1}-${Math.min(chapterIndex + DEEPSEEK_CHAPTERS_PER_CONVERSATION, chaptersToProcess.length)} (ترجمة الفصول + المراجعة/إصلاح الكلمات + المصطلحات)`, 'info');
            }

            const freshNovel = await Novel.findById(job.novelId);
            
            let sourceContent = ""; 
            try {
                const docRef = firestore.collection('novels').doc(freshNovel._id.toString()).collection('chapters').doc(chapterNum.toString());
                const docSnap = await docRef.get();
                if (docSnap.exists) {
                    const data = docSnap.data();
                    sourceContent = data.content || "";
                }
            } catch (fsErr) {
                console.log(`Firestore fetch error for Ch ${chapterNum}:`, fsErr.message);
            }

            if (!sourceContent || sourceContent.trim().length === 0) {
                 await pushLog(jobId, `تخطي الفصل ${chapterNum}: المحتوى غير موجود في السيرفر (Firestore)`, 'warning');
                 continue;
            }

            const glossaryItems = await Glossary.find({ novelId: freshNovel._id });
            const glossaryText = glossaryItems.map(g => `"${g.term}": "${g.translation}"`).join(',\n');

            const translationInput = `
${transPrompt}

--- GLOSSARY (Use these strictly) ---
${glossaryText}
-------------------------------------

--- ENGLISH Text TO TRANSLATE ---
${sourceContent}
---------------------------------
`;

            let translatedText = "";
            let translationSuccess = false;
            let usedProvider = null; // track which provider succeeded

            // ========== Multi-provider translation with strict validation ==========
            const RETRY_DELAY_MS = 30 * 60 * 1000;
            let attempt = 0;
            let lastValidationReasons = [];

            while (!translationSuccess) {
                attempt++;
                const freshAttemptJob = await TranslationJob.findById(jobId);
                if (!freshAttemptJob || freshAttemptJob.status !== 'active') break;

                if (attempt > 1) {
                    await pushLog(jobId, `🔄 محاولة ${attempt}: إعادة ترجمة الفصل ${chapterNum} حتى ينجح ولا يبقى إنجليزياً`, 'info');
                }

                const promptForAttempt = lastValidationReasons.length > 0
                    ? buildRepairTranslationPrompt(transPrompt, glossaryText, sourceContent, translatedText, lastValidationReasons)
                    : translationInput;

                const orderedProviders = stickySuccessRoute
                    ? [...providers.slice(stickySuccessRoute.providerIndex), ...providers.slice(0, stickySuccessRoute.providerIndex)]
                    : providers;

                for (const provider of orderedProviders) {
                    if (translationSuccess) break;
                    const providerIndex = providers.indexOf(provider);
                    const providerName = provider.name || provider.providerId;
                    const modelToUse = provider.selectedModel || (provider.models && provider.models[0]?.modelId) || 'gemini-2.5-flash';
                    let keys = getProviderAuthKeys(provider);
                    const isChatGPT = isChatGPTAndroidProvider(provider);
                    const isDeepSeek = isDeepSeekProvider(provider);
                    const isQwen = isQwenProvider(provider);
                    const isStickyChat = isStickyChatProvider(provider);

                    if (keys.length === 0 && !isChatGPT && !isDeepSeek && !isQwen) {
                        await pushLog(jobId, `⚠️ المزوّد ${providerName} ليس لديه مفاتيح – تخطيه`, 'warning');
                        continue;
                    }
                    if (isChatGPT && keys.length === 0) {
                        keys = ['dummy-key-for-chatgpt-android'];
                        await pushLog(jobId, `🔑 مزوّد ChatGPT Android: سيتم استخدام مفتاح وهمي (لا يحتاج مفتاح حقيقي)`, 'info');
                    }
                    if (isDeepSeek && keys.length === 0) {
                        keys = ['dummy-key-for-deepseek'];
                        await pushLog(jobId, `🔑 مزوّد DeepSeek: لا توجد توكنات محفوظة، سيتم استخدام الرمز الافتراضي من تطبيق DeepSeek`, 'info');
                    } else if (isDeepSeek) {
                        await pushLog(jobId, `🔑 مزوّد DeepSeek: سيتم استخدام ${keys.length} توكن محفوظ من حقل المفاتيح/التوكنات`, 'info');
                    }
                    if (isQwen && keys.length === 0) {
                        keys = ['dummy-key-for-qwen'];
                        await pushLog(jobId, `🔑 مزوّد Qwen: لا توجد توكنات محفوظة، سيتم استخدام إعدادات البيئة/الافتراضي`, 'info');
                    } else if (isQwen) {
                        await pushLog(jobId, `🔑 مزوّد Qwen: سيتم استخدام ${keys.length} توكن محفوظ`, 'info');
                    }

                    const preferredKeyIdx = stickySuccessRoute?.providerIndex === providerIndex ? stickySuccessRoute.keyIdx : 0;
                    const orderedKeyIndexes = [...Array(keys.length).keys()].slice(preferredKeyIdx).concat([...Array(keys.length).keys()].slice(0, preferredKeyIdx));

                    for (const keyIdx of orderedKeyIndexes) {
                        const key = keys[keyIdx];
                        const conversationScopeKey = isStickyChat ? getTokenConversationScope(provider, key, keyIdx) : undefined;
                        const tokenAttempts = isStickyChat ? DEEPSEEK_MAX_ATTEMPTS_PER_TOKEN : 1;
                        let tokenFailed = false;

                        for (let tokenAttempt = 1; tokenAttempt <= tokenAttempts; tokenAttempt++) {
                            try {
                                const retryLabel = isStickyChat ? ` | محاولة التوكن ${tokenAttempt}/${tokenAttempts}` : '';
                                await pushLog(jobId, `1️⃣ مزوّد: ${providerName} | نموذج: ${modelToUse} | مفتاح ${keyIdx + 1}/${keys.length} | محاولة ${attempt}${retryLabel}`, 'info');
                                const candidateText = await callTranslationProvider(provider, modelToUse, key, promptForAttempt, {
                                    deepSeekJobId: jobId.toString(),
                                    conversationContexts,
                                    conversationPurpose: 'chapters',
                                    conversationBatchKey,
                                    conversationScopeKey
                                });
                            let candidateTextForReview = removeDeepSeekFinishedMarker(candidateText);
                            if (candidateTextForReview !== (candidateText || '').trim()) {
                                await pushLog(jobId, `✂️ تم حذف علامة DeepSeek النهائية FINISHED من الفصل ${chapterNum} قبل المراجعة والحفظ`, 'info');
                            }
                            let validation = validateTranslatedChapter(candidateTextForReview, sourceContent);

                            if (validation.englishResidues.length > 0) {
                                await pushLog(jobId, `🔎 وُجدت كلمات إنجليزية في الفصل ${chapterNum}: ${validation.englishResidues.slice(0, 8).join(', ')} — ترجمة الكلمات فقط ثم استبدالها`, 'warning');
                                try {
                                    candidateTextForReview = await translateEnglishResiduesOnly(provider, modelToUse, key, candidateTextForReview, validation.englishResidues, {
                                        deepSeekJobId: jobId.toString(),
                                        conversationContexts,
                                        conversationPurpose: 'chapter_review',
                                        conversationBatchKey,
                                        conversationScopeKey
                                    });
                                    validation = validateTranslatedChapter(candidateTextForReview, sourceContent);
                                } catch (replaceErr) {
                                    await pushLog(jobId, `⚠️ فشل استبدال الكلمات الإنجليزية فقط: ${replaceErr.message}`, 'warning');
                                }
                            }

                            if (!validation.ok) {
                                const review = await reviewQuestionableChapter(provider, modelToUse, key, candidateTextForReview, sourceContent, validation, {
                                    deepSeekJobId: jobId.toString(),
                                    conversationContexts,
                                    conversationPurpose: 'chapter_review',
                                    conversationBatchKey,
                                    conversationScopeKey
                                });

                                if (review.decision !== 'accept') {
                                    translatedText = candidateTextForReview || '';
                                    lastValidationReasons = [...validation.reasons, review.reason];
                                    await pushLog(jobId, `🧪 فشلت مراجعة الفصل ${chapterNum}: ${lastValidationReasons.join('، ')} — ستتم إعادة الترجمة ولن ننتقل للفصل التالي`, 'warning');
                                    if (isStickyChat) resetConversationContextsForScope(conversationContexts, conversationScopeKey, conversationBatchKey);
                                    tokenFailed = true;
                                    continue;
                                }

                                await pushLog(jobId, `✅ قبل المراجع الآلي الفصل رغم تنبيه الفحص: ${review.reason}`, 'success');
                            }

                            translatedText = candidateTextForReview;
                            lastValidationReasons = [];
                            translationSuccess = true;
                            usedProvider = provider;
                            stickySuccessRoute = { providerIndex, keyIdx };
                                await pushLog(jobId, `✅ نجحت الترجمة والمراجعة باستخدام ${providerName} (سيُكمل النظام من هذا المزود/التوكن في الفصل التالي)`, 'success');
                                break;
                            } catch (err) {
                                tokenFailed = true;
                                console.error(`❌ فشل ${providerName} مفتاح ${keyIdx+1}: ${err.message}`);
                                await pushLog(jobId, `❌ فشل: ${err.message}`, 'warning');
                                if (isStickyChat && tokenAttempt < tokenAttempts) {
                                    resetConversationContextsForScope(conversationContexts, conversationScopeKey, conversationBatchKey);
                                    await pushLog(jobId, `🔁 مزوّد المحادثة: سيتم إنشاء محادثات جديدة لنفس التوكن قبل إعادة المحاولة ${tokenAttempt + 1}/${tokenAttempts}`, 'warning');
                                    await delay(3000);
                                }
                            }
                        }

                        if (translationSuccess) break;
                        if (isStickyChat && tokenFailed && keyIdx < keys.length - 1) {
                            await pushLog(jobId, `➡️ ${providerName}: فشل التوكن ${keyIdx + 1} بعد ${tokenAttempts} محاولات؛ الانتقال لتوكن آخر وسيستمر استخدامه إذا نجح`, 'warning');
                            await delay(3000);
                        } else if (!isStickyChat && keyIdx < keys.length - 1) {
                            await delay(3000);
                        }
                    }

                    if (!translationSuccess) {
                        await pushLog(jobId, `🚫 جميع مفاتيح ${providerName} فشلت أو لم تجتز المراجعة`, 'warning');
                    }
                }

                if (!translationSuccess) {
                    stickySuccessRoute = null;
                    await pushLog(jobId, `⏳ لم ينجح الفصل ${chapterNum} بعد تجربة كل المزودين/التوكنات. سيتم تصفير نقطة البدء ثم الانتظار 30 دقيقة وإعادة المحاولة على نفس الفصل.`, 'warning');
                    await delay(RETRY_DELAY_MS);
                }
            }

            if (!translationSuccess) break;
            // ========== End multi-provider translation with strict validation ==========

            // 🔥🔥🔥 NEW: EXTRACT TITLE FROM TRANSLATED CONTENT 🔥🔥🔥
            let extractedTitle = `الفصل ${chapterNum}`;
            try {
                const lines = translatedText.split('\n');
                let firstParagraph = "";
                
                for (const line of lines) {
                    if (line.trim().length > 0) {
                        firstParagraph = line.trim();
                        break;
                    }
                }

                if (firstParagraph && (firstParagraph.includes('الفصل') || firstParagraph.includes('Chapter')) && firstParagraph.includes(':')) {
                    const parts = firstParagraph.split(':');
                    if (parts.length > 1) {
                        const potentialTitle = parts.slice(1).join(':').trim();
                        if (potentialTitle.length > 0) {
                            extractedTitle = potentialTitle;
                        }
                    }
                }
            } catch (titleErr) {
                console.log("Title extraction error:", titleErr);
            }
            // 🔥🔥🔥 END TITLE EXTRACTION 🔥🔥🔥

            try {
                await pushLog(jobId, `2️⃣ جاري استخراج المصطلحات...`, 'info');
                
                // 🔥 NEW: For extraction, pick the best LLM model from the same provider that succeeded,
                // or fall back to any provider with an LLM.
                let extractionDone = false;

                // Helper function to try extraction with a specific provider + model
                const tryExtraction = async (extProvider, extModelId, extKey) => {
                    const extractionInput = `
${extractPrompt}

English Text (Excerpt):
"""${sourceContent.substring(0, 8000)}"""

Arabic Text (Excerpt):
"""${translatedText.substring(0, 8000)}"""
`;
                    let jsonText;
                    if ((extProvider.providerId === 'gemini' || (!extProvider.baseUrl && extProvider.providerId !== 'openrouter' && extProvider.providerId !== 'cloudflare' && !isChatGPTAndroidProvider(extProvider) && !isDeepSeekProvider(extProvider))) && extProvider.providerId !== 'openrouter' && extProvider.providerId !== 'cloudflare' && !isChatGPTAndroidProvider(extProvider) && !isDeepSeekProvider(extProvider)) {
                        // Gemini native with JSON mode
                        const genAI = new GoogleGenerativeAI(extKey);
                        const modelJSON = genAI.getGenerativeModel({ model: extModelId });
                        modelJSON.generationConfig = { responseMimeType: "application/json" };
                        const resultExt = await modelJSON.generateContent(extractionInput);
                        const responseExt = await resultExt.response;
                        jsonText = responseExt.text().trim();
                    } else {
                        // OpenAI-compatible or Cloudflare LLM or ChatGPT Android
                        const extPrompt = extractionInput + "\n\nRETURN ONLY JSON.";
                        jsonText = await callTranslationProvider(extProvider, extModelId, extKey, extPrompt, {
                            deepSeekJobId: jobId.toString(),
                            conversationContexts,
                            conversationPurpose: 'glossary',
                            conversationBatchKey,
                            conversationScopeKey: getTokenConversationScope(extProvider, extKey, 0)
                        });
                    }
                    
                    // Cleanup JSON string - ROBUST VERSION
jsonText = jsonText.trim();

// Remove markdown code blocks (with or without backticks)
if (jsonText.startsWith("```json")) {
    jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
} else if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
}

// 🔥 FIX: DeepSeek يُرجع "json\n[...]" بدون backticks
if (/^json\s*[\n\r]/i.test(jsonText)) {
    jsonText = jsonText.replace(/^json\s*[\n\r]+/i, "");
}

// 🔥 الأقوى: استخرج أول [ ] أو { } مباشرة
const jsonMatch = jsonText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
if (jsonMatch) {
    jsonText = jsonMatch[1];
}


                    let parsedTerms = [];
                    try {
                        const parsed = JSON.parse(jsonText);
                        if (Array.isArray(parsed)) {
                            parsedTerms = parsed;
                        } else if (parsed.newTerms && Array.isArray(parsed.newTerms)) {
                            parsedTerms = parsed.newTerms;
                        } else if (parsed.terms && Array.isArray(parsed.terms)) {
                            parsedTerms = parsed.terms;
                        }
                    } catch (e) {
                        console.log("JSON Parse Error", e);
                    }

                    return parsedTerms;
                };

                // ---- STEP 1: Use the same provider that translated successfully ----
                if (usedProvider) {
                    const providerId = usedProvider.providerId;
                    // If the model used for translation is an LLM (not translation-only), use it directly
                    if (!isTranslationOnlyModel(usedProvider.selectedModel)) {
                        let keys = getProviderAuthKeys(usedProvider);
                        if (isChatGPTAndroidProvider(usedProvider) && keys.length === 0) keys = ['dummy-key-for-chatgpt-android'];
                        if (isDeepSeekProvider(usedProvider) && keys.length === 0) keys = ['dummy-key-for-deepseek'];
                        if (isQwenProvider(usedProvider) && keys.length === 0) keys = ['dummy-key-for-qwen'];
                        for (const key of keys) {
                            try {
                                const terms = await tryExtraction(usedProvider, usedProvider.selectedModel, key);
                                if (terms.length > 0) {
                                    // Save terms...
                                    let newTermsCount = 0;
                                    for (const termObj of terms) {
                                        const rawTerm = termObj.name || termObj.term;
                                        const translation = termObj.translation;
                                        if (rawTerm && translation) {
                                            let category = termObj.category ? termObj.category.toLowerCase() : 'other';
                                            if (category === 'character') category = 'characters';
                                            else if (category === 'location') category = 'locations';
                                            else if (category === 'item') category = 'items';
                                            else if (category === 'rank') category = 'ranks';
                                            else if (category === 'concept') category = 'other';
                                            if (!['characters', 'locations', 'items', 'ranks'].includes(category)) category = 'other';
                                            await Glossary.updateOne(
                                                { novelId: freshNovel._id, term: rawTerm }, 
                                                { 
                                                    $set: { translation: translation, category: category, description: termObj.description || '' },
                                                    $setOnInsert: { autoGenerated: true }
                                                },
                                                { upsert: true }
                                            );
                                            newTermsCount++;
                                        }
                                    }
                                    if (newTermsCount > 0) await pushLog(jobId, `✅ تم إضافة/تحديث ${newTermsCount} مصطلح للمسرد`, 'success');
                                    else await pushLog(jobId, `ℹ️ لم يتم استخراج مصطلحات جديدة`, 'info');
                                    extractionDone = true;
                                    break;
                                }
                            } catch (extErr) {
                                console.error("Extraction error with same provider:", extErr.message);
                            }
                        }
                    } else {
                        // Translation-only model – try to find an LLM model in the same provider
                        const llmModel = findLLMModel(usedProvider);
                        if (llmModel) {
                            let keys = getProviderAuthKeys(usedProvider);
                            if (isChatGPTAndroidProvider(usedProvider) && keys.length === 0) keys = ['dummy-key-for-chatgpt-android'];
                            if (isDeepSeekProvider(usedProvider) && keys.length === 0) keys = ['dummy-key-for-deepseek'];
                        if (isQwenProvider(usedProvider) && keys.length === 0) keys = ['dummy-key-for-qwen'];
                            for (const key of keys) {
                                try {
                                    const terms = await tryExtraction(usedProvider, llmModel.modelId, key);
                                    if (terms.length > 0) {
                                        let newTermsCount = 0;
                                        for (const termObj of terms) {
                                            const rawTerm = termObj.name || termObj.term;
                                            const translation = termObj.translation;
                                            if (rawTerm && translation) {
                                                let category = termObj.category ? termObj.category.toLowerCase() : 'other';
                                                if (category === 'character') category = 'characters';
                                                else if (category === 'location') category = 'locations';
                                                else if (category === 'item') category = 'items';
                                                else if (category === 'rank') category = 'ranks';
                                                else if (category === 'concept') category = 'other';
                                                if (!['characters', 'locations', 'items', 'ranks'].includes(category)) category = 'other';
                                                await Glossary.updateOne(
                                                    { novelId: freshNovel._id, term: rawTerm }, 
                                                    { 
                                                        $set: { translation: translation, category: category, description: termObj.description || '' },
                                                        $setOnInsert: { autoGenerated: true }
                                                    },
                                                    { upsert: true }
                                                );
                                                newTermsCount++;
                                            }
                                        }
                                        if (newTermsCount > 0) await pushLog(jobId, `✅ تم إضافة/تحديث ${newTermsCount} مصطلح للمسرد`, 'success');
                                        else await pushLog(jobId, `ℹ️ لم يتم استخراج مصطلحات جديدة`, 'info');
                                        extractionDone = true;
                                        break;
                                    }
                                } catch (extErr) {
                                    console.error("Extraction error with LLM model:", extErr.message);
                                }
                            }
                        }
                    }
                }

                // ---- STEP 2: Fallback – any provider with an LLM ----
                if (!extractionDone) {
                    const orderedProviders = stickySuccessRoute
                    ? [...providers.slice(stickySuccessRoute.providerIndex), ...providers.slice(0, stickySuccessRoute.providerIndex)]
                    : providers;

                for (const provider of orderedProviders) {
                        if (extractionDone) break;
                        const llmModel = findLLMModel(provider);
                        if (!llmModel) continue;
                        let keys = getProviderAuthKeys(provider);
                        if (isChatGPTAndroidProvider(provider) && keys.length === 0) keys = ['dummy-key-for-chatgpt-android'];
                        if (isDeepSeekProvider(provider) && keys.length === 0) keys = ['dummy-key-for-deepseek'];
                        if (isQwenProvider(provider) && keys.length === 0) keys = ['dummy-key-for-qwen'];
                        for (const key of keys) {
                            try {
                                const terms = await tryExtraction(provider, llmModel.modelId, key);
                                if (terms.length > 0) {
                                    let newTermsCount = 0;
                                    for (const termObj of terms) {
                                        const rawTerm = termObj.name || termObj.term;
                                        const translation = termObj.translation;
                                        if (rawTerm && translation) {
                                            let category = termObj.category ? termObj.category.toLowerCase() : 'other';
                                            if (category === 'character') category = 'characters';
                                            else if (category === 'location') category = 'locations';
                                            else if (category === 'item') category = 'items';
                                            else if (category === 'rank') category = 'ranks';
                                            else if (category === 'concept') category = 'other';
                                            if (!['characters', 'locations', 'items', 'ranks'].includes(category)) category = 'other';
                                            await Glossary.updateOne(
                                                { novelId: freshNovel._id, term: rawTerm }, 
                                                { 
                                                    $set: { translation: translation, category: category, description: termObj.description || '' },
                                                    $setOnInsert: { autoGenerated: true }
                                                },
                                                { upsert: true }
                                            );
                                            newTermsCount++;
                                        }
                                    }
                                    if (newTermsCount > 0) await pushLog(jobId, `✅ تم إضافة/تحديث ${newTermsCount} مصطلح للمسرد`, 'success');
                                    else await pushLog(jobId, `ℹ️ لم يتم استخراج مصطلحات جديدة`, 'info');
                                    extractionDone = true;
                                    break;
                                }
                            } catch (extErr) {
                                console.error("Extraction error fallback:", extErr.message);
                            }
                        }
                    }
                }

                if (!extractionDone) {
                    await pushLog(jobId, `⚠️ فشل استخراج المصطلحات لهذا الفصل`, 'warning');
                }

                try {
                    await firestore.collection('novels').doc(freshNovel._id.toString())
                        .collection('chapters').doc(chapterNum.toString())
                        .set({
                            title: extractedTitle,
                            content: translatedText,
                            lastUpdated: new Date()
                        }, { merge: true });
                    
                } catch (fsSaveErr) {
                    throw new Error(`فشل الحفظ في Firestore: ${fsSaveErr.message}`);
                }

                const now = new Date();
                const existingChapterIndex = freshNovel.chapters.findIndex(c => c.number === chapterNum);
                
                if (existingChapterIndex === -1) {
                    await Novel.updateOne(
                        { _id: freshNovel._id },
                        {
                            $push: {
                                chapters: {
                                    number: chapterNum,
                                    title: extractedTitle,
                                    createdAt: now,
                                    views: 0
                                }
                            },
                            $set: {
                                lastChapterUpdate: now,
                                status: freshNovel.status === 'خاصة' ? 'مستمرة' : freshNovel.status
                            }
                        }
                    );
                    await pushLog(jobId, `✅ تم إضافة الفصل ${chapterNum} إلى قاعدة البيانات (الرواية أصبحت عامة)`, 'success');
                } else {
                    await Novel.updateOne(
                        { _id: freshNovel._id, "chapters.number": chapterNum },
                        {
                            $set: {
                                "chapters.$.title": extractedTitle,
                                "chapters.$.createdAt": now,
                                "lastChapterUpdate": now
                            }
                        }
                    );
                    if (freshNovel.status === 'خاصة') {
                        await Novel.updateOne(
                            { _id: freshNovel._id },
                            { $set: { status: 'مستمرة' } }
                        );
                        await pushLog(jobId, `🔓 تم تغيير حالة الرواية إلى 'مستمرة' (عامة)`, 'success');
                    }
                    await pushLog(jobId, `✅ تم تحديث الفصل ${chapterNum} وتاريخه`, 'success');
                }

                await TranslationJob.findByIdAndUpdate(jobId, {
                    $inc: { translatedCount: 1 },
                    $set: { currentChapter: chapterNum, lastUpdate: new Date() },
                    $pull: { targetChapters: chapterNum }
                });

                await pushLog(jobId, `🎉 تم إنجاز الفصل ${chapterNum} بعنوان "${extractedTitle}" وحفظه في السيرفر`, 'success');

            } catch (err) {
                console.error("Extraction/Save Error:", err);
                
                if (translatedText) {
                    try {
                        await firestore.collection('novels').doc(freshNovel._id.toString())
                            .collection('chapters').doc(chapterNum.toString())
                            .set({ content: translatedText }, { merge: true });
                        
                        const now = new Date();
                        const existingChapterIndex = freshNovel.chapters.findIndex(c => c.number === chapterNum);
                        
                        if (existingChapterIndex === -1) {
                            await Novel.updateOne(
                                { _id: freshNovel._id },
                                {
                                    $push: {
                                        chapters: {
                                            number: chapterNum,
                                            title: extractedTitle,
                                            createdAt: now,
                                            views: 0
                                        }
                                    },
                                    $set: {
                                        lastChapterUpdate: now,
                                        status: freshNovel.status === 'خاصة' ? 'مستمرة' : freshNovel.status
                                    }
                                }
                            );
                        } else {
                            await Novel.updateOne(
                                { _id: freshNovel._id, "chapters.number": chapterNum },
                                {
                                    $set: {
                                        "chapters.$.title": extractedTitle,
                                        "chapters.$.createdAt": now,
                                        "lastChapterUpdate": now
                                    }
                                }
                            );
                            if (freshNovel.status === 'خاصة') {
                                await Novel.updateOne(
                                    { _id: freshNovel._id },
                                    { $set: { status: 'مستمرة' } }
                                );
                            }
                        }

                        await TranslationJob.findByIdAndUpdate(jobId, {
                            $pull: { targetChapters: chapterNum }
                        });

                        await pushLog(jobId, `⚠️ تم حفظ الترجمة (فشل الاستخراج): ${err.message}`, 'warning');
                    } catch (saveErr) {
                        await pushLog(jobId, `❌ فشل الحفظ النهائي: ${saveErr.message}`, 'error');
                    }
                } else {
                    await pushLog(jobId, `❌ فشل العملية: ${err.message}`, 'error');
                }
            }

            await delay(2000); 
        }

        // Final check
        const finalJob = await TranslationJob.findById(jobId);
        if (finalJob.status === 'active') {
            await TranslationJob.findByIdAndUpdate(jobId, { status: 'completed' });
            await pushLog(jobId, `🏁 اكتملت جميع الفصول!`, 'success');
        }

    } catch (e) {
        console.error("Worker Critical Error:", e);
        await TranslationJob.findByIdAndUpdate(jobId, { status: 'failed' });
    }
}

async function pushLog(jobId, message, type) {
    const prefix = type ? `[translator:${type}]` : '[translator]';
    console.log(`${new Date().toISOString()} ${prefix} job=${jobId} ${message}`);
    await TranslationJob.findByIdAndUpdate(jobId, {
        $push: { logs: { message, type, timestamp: new Date() } }
    });
}


module.exports = function(app, verifyToken, verifyAdmin) {

    mongoose.connection.once('open', async () => {
        try {
            const collection = mongoose.connection.db.collection('glossaries');
            const indexes = await collection.indexes();
            if (indexes.some(idx => idx.name === 'user_1_key_1')) {
                await collection.dropIndex('user_1_key_1');
                console.log('✅ Deleted old conflicting index: user_1_key_1');
            }
        } catch (err) {
            console.log('ℹ️ No old indexes to delete or already cleaned.');
        }
    });

    // 1. Get Novels (🔥 OPTIMIZED FOR LAZY LOADING & PERFORMANCE 🔥)
    app.get('/api/translator/novels', verifyToken, async (req, res) => {
        try {
            const { search, page = 1, limit = 20 } = req.query;
            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            const skip = (pageNum - 1) * limitNum;

            let query = {};
            if (search) {
                query.title = { $regex: search, $options: 'i' };
            }
            
            const novels = await Novel.aggregate([
                { $match: query },
                {
                    $project: {
                        _id: 1,
                        title: 1,
                        cover: 1,
                        author: 1,
                        status: 1,
                        createdAt: 1,
                        chaptersCount: {
                            $ifNull: [
                                "$sourceChaptersCount",
                                { $size: { $ifNull: ["$chapters", []] } }
                            ]
                        }
                    }
                },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: limitNum }
            ]);
            
            res.json(novels);
        } catch (e) {
            console.error("Translator Novels Error:", e);
            res.status(500).json({ error: e.message });
        }
    });

    // 2. Start Job
    app.post('/api/translator/start', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const { novelId, chapters, apiKeys, resumeFrom, jobId } = req.body; 
            
            if (jobId) {
                const existingJob = await TranslationJob.findById(jobId);
                if (!existingJob) return res.status(404).json({ message: "Job not found" });
                
                existingJob.status = 'active';
                existingJob.logs.push({ message: '▶️ تم استئناف المهمة', type: 'info' });
                await existingJob.save();
                
                processTranslationJob(existingJob._id);
                return res.json({ message: "Job resumed", jobId: existingJob._id });
            }

            const novel = await Novel.findById(novelId);
            if (!novel) return res.status(404).json({ message: "Novel not found" });

            const userSettings = await getGlobalSettings();
            
            // 🔥 CHECK providers instead of legacy keys
            const providers = userSettings?.translationProviders || [];
            const anyKeys = providers.some(p => (p.apiKeys && p.apiKeys.length > 0) || isChatGPTAndroidProvider(p) || isDeepSeekProvider(p) || isQwenProvider(p));
            const legacyKeys = userSettings?.translatorApiKeys || [];
            
            if (!anyKeys && legacyKeys.length === 0) {
                return res.status(400).json({ message: "No API keys found. Please add keys in Settings first." });
            }

            let targetChapters = [];
            
            if (resumeFrom) {
                targetChapters = novel.chapters
                    .filter(c => c.number >= resumeFrom)
                    .map(c => c.number);
            } else if (chapters === 'all') {
                const mongoChapters = novel.chapters.map(c => c.number);
                
                let firestoreChapters = [];
                if (firestore) {
                    try {
                        const chaptersRef = firestore.collection('novels').doc(novelId.toString()).collection('chapters');
                        const snapshot = await chaptersRef.get();
                        firestoreChapters = snapshot.docs.map(doc => parseInt(doc.id)).filter(num => !isNaN(num));
                    } catch (err) {
                        console.error("Failed to fetch chapters from Firestore:", err);
                    }
                }
                
                const allChaptersSet = new Set([...mongoChapters, ...firestoreChapters]);
                targetChapters = Array.from(allChaptersSet).sort((a, b) => a - b);
                
                if (novel.sourceChaptersCount && novel.sourceChaptersCount > targetChapters.length) {
                    for (let i = 1; i <= novel.sourceChaptersCount; i++) {
                        allChaptersSet.add(i);
                    }
                    targetChapters = Array.from(allChaptersSet).sort((a, b) => a - b);
                }
            } else if (Array.isArray(chapters)) {
                targetChapters = chapters;
            }

            const job = new TranslationJob({
                novelId,
                novelTitle: novel.title,
                cover: novel.cover,
                targetChapters,
                totalToTranslate: targetChapters.length,
                apiKeys: legacyKeys, // keep for backward compatibility, but actual translation will use providers
                logs: [{ message: `تم بدء المهمة (استهداف ${targetChapters.length} فصل)`, type: 'info' }]
            });

            await job.save();

            processTranslationJob(job._id);

            res.json({ message: "Job started", jobId: job._id });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 🔥 Pause Job
    app.post('/api/translator/jobs/:id/pause', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const job = await TranslationJob.findById(req.params.id);
            if (!job) return res.status(404).json({ message: "Job not found" });
            
            job.status = 'paused';
            job.logs.push({ message: '⏸️ طلب إيقاف مؤقت من المستخدم...', type: 'warning' });
            await job.save();
            
            res.json({ message: "Job paused" });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 🔥 Delete Job
    app.delete('/api/translator/jobs/:id', verifyToken, verifyAdmin, async (req, res) => {
        try {
            await TranslationJob.findByIdAndDelete(req.params.id);
            res.json({ message: "Job deleted" });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 3. Get Jobs List (🔥 OPTIMIZED: Exclude logs and apiKeys)
    app.get('/api/translator/jobs', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const jobs = await TranslationJob.find()
                .select('novelTitle cover status translatedCount totalToTranslate startTime') 
                .sort({ updatedAt: -1 })
                .limit(20);
            
            const uiJobs = jobs.map(j => ({
                id: j._id,
                novelTitle: j.novelTitle,
                cover: j.cover,
                status: j.status,
                translated: j.translatedCount,
                total: j.totalToTranslate,
                startTime: j.startTime
            }));
            res.json(uiJobs);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 4. Get Job Details
    app.get('/api/translator/jobs/:id', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const job = await TranslationJob.findById(req.params.id);
            if (!job) return res.status(404).json({message: "Job not found"});

            const novelStats = await Novel.aggregate([
                { $match: { _id: job.novelId } },
                { $project: { maxChapter: { $max: "$chapters.number" } } }
            ]);
            
            const maxChapter = (novelStats[0] && novelStats[0].maxChapter) ? novelStats[0].maxChapter : 0;

            const response = job.toObject();
            response.novelMaxChapter = maxChapter;
            
            res.json(response);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 5. Manage Glossary
    app.get('/api/translator/glossary/:novelId', verifyToken, async (req, res) => {
        try {
            const terms = await Glossary.find({ novelId: req.params.novelId });
            res.json(terms);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/translator/glossary', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const { novelId, term, translation, category, description } = req.body; 
            
            const finalCategory = category && ['characters', 'locations', 'items', 'ranks', 'other'].includes(category) 
                                  ? category 
                                  : 'other';

            const newTerm = await Glossary.findOneAndUpdate(
                { novelId, term },
                { 
                    translation, 
                    category: finalCategory,
                    description: description || '',
                    autoGenerated: false 
                },
                { new: true, upsert: true }
            );
            res.json(newTerm);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/api/translator/glossary/:id', verifyToken, verifyAdmin, async (req, res) => {
        try {
            await Glossary.findByIdAndDelete(req.params.id);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    
    app.post('/api/translator/glossary/bulk-delete', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const { ids } = req.body;
            await Glossary.deleteMany({ _id: { $in: ids } });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 6. Translator Settings API (GLOBAL) – updated to include providers
    app.get('/api/translator/settings', verifyToken, verifyAdmin, async (req, res) => {
        try {
            let settings = await getGlobalSettings();
            res.json({
                customPrompt: settings.customPrompt || '',
                translatorExtractPrompt: settings.translatorExtractPrompt || DEFAULT_EXTRACT_PROMPT,
                translatorModel: settings.translatorModel || 'gemini-2.5-flash',
                translatorApiKeys: settings.translatorApiKeys || [],
                translationProviders: settings.translationProviders || [] // 🔥 NEW
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/translator/settings', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const { customPrompt, translatorExtractPrompt, translatorModel, translatorApiKeys, translationProviders } = req.body;
            
            let settings = await getGlobalSettings();

            if (customPrompt !== undefined) settings.customPrompt = customPrompt;
            if (translatorExtractPrompt !== undefined) settings.translatorExtractPrompt = translatorExtractPrompt;
            if (translatorModel !== undefined) settings.translatorModel = translatorModel;
            if (translatorApiKeys !== undefined) settings.translatorApiKeys = translatorApiKeys;
            if (translationProviders !== undefined) settings.translationProviders = translationProviders; // 🔥 NEW

            await settings.save();
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
};
