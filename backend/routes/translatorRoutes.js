const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios'); // 🔥 NEW: for OpenRouter and custom providers
const Novel = require('../models/novel.model.js');
const Glossary = require('../models/glossary.model.js');
const TranslationJob = require('../models/translationJob.model.js');
const Settings = require('../models/settings.model.js');

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

// 🔥 Unified provider caller supporting Gemini, OpenRouter, Cloudflare, and custom APIs
async function callTranslationProvider(provider, modelName, apiKey, prompt, options = {}) {
    const providerId = (provider.providerId || 'gemini').toLowerCase();
    const isCloudflare = (providerId === 'cloudflare');

    // ---- Gemini native ----
    if (providerId === 'gemini' && !provider.baseUrl) {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
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

        for (const chapterNum of chaptersToProcess) {
            const freshJob = await TranslationJob.findById(jobId);
            // 🔥 Check for pause or stop
            if (!freshJob || freshJob.status !== 'active') {
                if (freshJob && freshJob.status === 'paused') {
                    await pushLog(jobId, `⏸️ تم إيقاف المهمة مؤقتاً عند الفصل ${chapterNum}`, 'warning');
                }
                break;
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

            // ========== Multi-provider with double cycle ==========
            const MAX_CYCLES = 2;
            let cycle = 0;
            
            while (!translationSuccess && cycle < MAX_CYCLES) {
                cycle++;
                if (cycle > 1) {
                    await pushLog(jobId, `🔄 دورة ${cycle}: محاولة إضافية عبر جميع المزوّدين`, 'info');
                }
                
                for (const provider of providers) {
                    if (translationSuccess) break;
                    const providerName = provider.name || provider.providerId;
                    const modelToUse = provider.selectedModel || (provider.models && provider.models[0]?.modelId) || 'gemini-2.5-flash';
                    const keys = provider.apiKeys || [];
                    
                    if (keys.length === 0) {
                        await pushLog(jobId, `⚠️ المزوّد ${providerName} ليس لديه مفاتيح – تخطيه`, 'warning');
                        continue;
                    }

                    for (let keyIdx = 0; keyIdx < keys.length; keyIdx++) {
                        const key = keys[keyIdx];
                        try {
                            await pushLog(jobId, `1️⃣ مزوّد: ${providerName} | نموذج: ${modelToUse} | مفتاح ${keyIdx + 1}/${keys.length}`, 'info');
                            translatedText = await callTranslationProvider(provider, modelToUse, key, translationInput);
                            translationSuccess = true;
                            usedProvider = provider; // remember which provider worked
                            await pushLog(jobId, `✅ نجحت الترجمة باستخدام ${providerName}`, 'success');
                            break;
                        } catch (err) {
                            console.error(`❌ فشل ${providerName} مفتاح ${keyIdx+1}: ${err.message}`);
                            await pushLog(jobId, `❌ فشل: ${err.message}`, 'warning');
                            if (keyIdx < keys.length - 1) {
                                await delay(3000);
                            }
                        }
                    }
                    
                    if (!translationSuccess) {
                        await pushLog(jobId, `🚫 جميع مفاتيح ${providerName} فشلت`, 'warning');
                    }
                }
                
                if (!translationSuccess && cycle < MAX_CYCLES) {
                    await delay(10000); // wait before second cycle
                }
            }

            if (!translationSuccess) {
                await pushLog(jobId, `❌ فشلت جميع المزوّدين بعد ${MAX_CYCLES} دورات – تخطي الفصل ${chapterNum}`, 'error');
                continue;
            }
            // ========== End multi-provider translation ==========

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
                    if ((extProvider.providerId === 'gemini' || (!extProvider.baseUrl && extProvider.providerId !== 'openrouter' && extProvider.providerId !== 'cloudflare')) && extProvider.providerId !== 'openrouter' && extProvider.providerId !== 'cloudflare') {
                        // Gemini native with JSON mode
                        const genAI = new GoogleGenerativeAI(extKey);
                        const modelJSON = genAI.getGenerativeModel({ model: extModelId });
                        modelJSON.generationConfig = { responseMimeType: "application/json" };
                        const resultExt = await modelJSON.generateContent(extractionInput);
                        const responseExt = await resultExt.response;
                        jsonText = responseExt.text().trim();
                    } else {
                        // OpenAI-compatible or Cloudflare LLM
                        const extPrompt = extractionInput + "\n\nRETURN ONLY JSON.";
                        jsonText = await callTranslationProvider(extProvider, extModelId, extKey, extPrompt);
                    }
                    
                    // Cleanup JSON string
                    if (jsonText.startsWith("```json")) {
                        jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
                    } else if (jsonText.startsWith("```")) {
                        jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
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
                        const keys = usedProvider.apiKeys || [];
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
                            const keys = usedProvider.apiKeys || [];
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
                    for (const provider of providers) {
                        if (extractionDone) break;
                        const llmModel = findLLMModel(provider);
                        if (!llmModel) continue;
                        const keys = provider.apiKeys || [];
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
            const anyKeys = providers.some(p => p.apiKeys && p.apiKeys.length > 0);
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