const mongoose = require('mongoose');
const path = require('path');
const AdmZip = require('adm-zip');
const jwt = require('jsonwebtoken');
const axios = require('axios'); // 🔥 NEW: for custom/OpenRouter providers
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { v4: uuidv4 } = require('uuid'); // 🔥 NEW: for ChatGPT Android API

// --- Config Imports ---
let firestore, cloudinary;
try {
    const firebaseAdmin = require('../config/firebaseAdmin');
    firestore = firebaseAdmin.db;
    cloudinary = require('../config/cloudinary');
} catch (e) {
    console.warn("⚠️ Config files check failed in admin routes...");
}

// Models
const User = require('../models/user.model.js');
const Novel = require('../models/novel.model.js');
const NovelLibrary = require('../models/novelLibrary.model.js'); 
const Settings = require('../models/settings.model.js');
const Comment = require('../models/comment.model.js');
const ChapterScraperJob = require('../models/chapterScraperJob.model.js');
const MetadataTranslationJob = require('../models/metadataTranslationJob.model.js');

// 🔥 MODEL FOR SCRAPER LOGS
const ScraperLogSchema = new mongoose.Schema({
    message: String,
    type: { type: String, default: 'info' }, 
    timestamp: { type: Date, default: Date.now }
});
if (mongoose.models.ScraperLog) delete mongoose.models.ScraperLog;
const ScraperLog = mongoose.model('ScraperLog', ScraperLogSchema);

async function logScraper(message, type = 'info') {
    try {
        console.log(`[Scraper Log] ${message}`);
        await ScraperLog.create({ message, type, timestamp: new Date() });
        const count = await ScraperLog.countDocuments();
        if (count > 100) {
            const first = await ScraperLog.findOne().sort({ timestamp: 1 });
            if (first) await ScraperLog.deleteOne({ _id: first._id });
        }
    } catch (e) {
        console.error("Log error", e);
    }
}

// 🔥 Check if a model is a translation-only model (cannot do JSON extraction)
function isTranslationOnlyModel(modelId) {
    if (!modelId) return false;
    if (modelId.startsWith('@cf/meta/m2m100')) return true;
    return false;
}

// 🔥 Find the first LLM model in a provider (for extraction)
function findLLMModel(provider) {
    if (!provider.models || provider.models.length === 0) return null;
    return provider.models.find(m => !isTranslationOnlyModel(m.modelId)) || null;
}

// 🔥 Helper to detect if a provider is ChatGPT Android (by name or model)
function isChatGPTAndroidProvider(provider) {
    const name = (provider.name || '').toLowerCase();
    const model = (provider.selectedModel || '').toLowerCase();
    // Check if any model has modelId 'auto' or contains 'chatgpt'
    const hasAutoModel = provider.models && provider.models.some(m => (m.modelId || '').toLowerCase() === 'auto');
    return name.includes('chatgpt') || name.includes('gpt') || model === 'auto' || hasAutoModel;
}

// 🔥 NEW: Unified provider caller (same as translatorRoutes) – now with Cloudflare support
async function callTranslationProvider(provider, modelName, apiKey, prompt, options = {}) {
    const providerId = (provider.providerId || 'gemini').toLowerCase();
    const isCloudflare = (providerId === 'cloudflare');
    const isChatGPT = isChatGPTAndroidProvider(provider);

    // ---- Gemini native ----
    if (providerId === 'gemini' && !provider.baseUrl) {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    }

    // ---- ChatGPT Android API (Reverse Engineered) ----
    if (isChatGPT || providerId === 'chatgpt-android') {
        // Helper function to get conduit token
        async function getConduitToken() {
            const prepareUrl = "https://android.chat.openai.com/backend-api/f/conversation/prepare";
            const preparePayload = {
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
            const staticHeaders = {
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
            };
            try {
                const prepareRes = await axios.post(prepareUrl, preparePayload, { headers: staticHeaders, timeout: 30000 });
                if (prepareRes.status === 200 && prepareRes.data.conduit_token) {
                    return prepareRes.data.conduit_token;
                }
                throw new Error("No conduit token in response");
            } catch (err) {
                throw new Error(`ChatGPT Android: failed to get conduit token: ${err.message}`);
            }
        }

        // Get conduit token
        const conduitToken = await getConduitToken();
        
        // Build headers with conduit token and session IDs
        const chatHeaders = {
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
            'Cookie': "__cflb=04dTod5Jcx9DYJeMeKbyj32ve2B3i9pLVRxJxEAaKD; _cfuvid=PXu6q36jhfgxnsdFkDmqwLzCfHOSgG588liApL0856A-1777834828.2542033-1.0.1.1-JFC10kaoqt9_IXzxrixI6zZuAm.TzRPF14QfJiD43MQ; oai-ll=; oai-sc=0gAAAAABp959mEmk6Qr5JsnqYMpWx1-15EJhCVV2EV6SQpet7Z7SjNuAT0x2cVScJu_g_TE9_NXidYfi68DtZfl4ImOQIRkr8PF-R-v9PUl7IPGtYiF1rwqdVm0NjapKV1lROdrmNGkiuNgcVMGYXMrP45hfmmQKiCQ5MBQLjfI7XI2tKSLvHT3WkjFEnmDZIRtVz85lyV9pxK181GJRARSxM53m06IfD3jEDjVbSR5QDQbL6Nxl4l7c; __cf_bm=y_lpbPz3viZYHSAd8nCLtIlm2JBCYWvEwOz8xvvwFow-1777835878.3854406-1.0.1.1-Muu0UxZKqufJhSVDELNGz2fO12Xcqc.oJ3hINoXkGIc2tGinJqVnmBTM7EAKDRfqdl1WdKtZ06fuCJ3y5DddxeMPVlBNX_r7daQReYa59qkFBwXOF3p4W3lwU.tdPN9A",
            'Conduit-Token': conduitToken,
            'x-oai-convo-session-id': uuidv4(),
            'x-oai-turn-trace-id': uuidv4(),
            'x-openai-target-path': '/backend-api/f/conversation'
        };
        
        const messageId = uuidv4();
        const parentMessageId = uuidv4();
        
        const payload = {
            action: "next",
            messages: [{
                id: messageId,
                author: { role: "user" },
                content: { content_type: "text", parts: [prompt] },
                status: "finished_successfully"
            }],
            model: modelName || "auto",
            parent_message_id: parentMessageId,
            stream: false,
            timezone: "Africa/Cairo",
            timezone_offset_min: -180
        };
        
        const chatUrl = 'https://android.chat.openai.com/backend-api/f/conversation';
        const response = await axios.post(chatUrl, payload, { headers: chatHeaders, timeout: options.timeout || 500000, responseType: 'stream' });
        
        // Collect full response from stream
        let fullResponse = "";
        await new Promise((resolve, reject) => {
            response.data.on('data', (chunk) => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;
                        try {
                            const event = JSON.parse(data);
                            if (event.message && event.message.content && event.message.content.parts && event.message.content.parts[0]) {
                                fullResponse = event.message.content.parts[0];
                            }
                        } catch (e) {}
                    }
                }
            });
            response.data.on('end', () => resolve());
            response.data.on('error', reject);
        });
        
        if (!fullResponse) throw new Error("ChatGPT Android: empty response");
        return fullResponse;
    }

    // ---- Cloudflare Workers AI ----
    if (isCloudflare) {
        const baseUrl = provider.baseUrl || '';
        const url = `${baseUrl.replace(/\/+$/, '')}/${modelName}`;

        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        };

        let body;
        if (isTranslationOnlyModel(modelName)) {
            body = {
                text: prompt,
                source_lang: options.sourceLang || 'en',
                target_lang: options.targetLang || 'ar'
            };
        } else {
            body = {
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3
            };
        }

        const res = await axios.post(url, body, { headers, timeout: 500000 });
        const data = res.data;
        if (data.success && data.result) {
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

// 🔥 Helper to update metadata translation job
async function updateMetadataJob(jobId, status, message, type) {
    try {
        if (!jobId) return;
        const update = { status, lastUpdate: new Date() };
        if (message) {
            update.$push = { logs: { message, type, timestamp: new Date() } };
        }
        if (status === 'completed' || status === 'failed') {
            update.processedCount = 3;
        }
        await MetadataTranslationJob.findByIdAndUpdate(jobId, update);
    } catch (e) {
        console.error("Error updating metadata job:", e);
    }
}

// 🔥 UPDATED: Translate novel metadata using multi-provider system
async function translateNovelMetadata(novelId, originalData, jobId = null) {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    try {
        const settings = await getGlobalSettings();
        
        // Read providers from new system; fallback to legacy keys
        let providers = settings.translationProviders && settings.translationProviders.length > 0
            ? settings.translationProviders.slice()
            : [];

        if (providers.length === 0) {
            const legacyKeys = settings.translatorApiKeys || [];
            if (legacyKeys.length > 0) {
                const legacyModel = settings.translatorModel || 'gemini-1.5-flash';
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
            const msg = `⚠️ لا توجد مزوّدات ترجمة مفعلة مع مفاتيح API`;
            await logScraper(msg, 'warning');
            if (jobId) await updateMetadataJob(jobId, 'failed', msg, 'error');
            return;
        }

        // Sort by priority
        providers.sort((a, b) => (a.priority || 0) - (b.priority || 0));

        // Get available categories from settings or fallback
        let availableCategories = settings.managedCategories || [];
        if (!availableCategories.length) {
            availableCategories = [
                'بناء القواعد', 'الهجرة', 'الزراعة', 'الحياة المدرسية', 'الحياة الحضرية', 'أكشن', 'حياة مدرسية', 'حسم في القتل', 'حريم', 'حرب النجوم', 'تراجيدي', 'تاريخي', 'رياضة', 'رومانسي', 'رعب', 'راشد', 'دراما', 'خيال علمي', 'خيال', 'خارق لطبيعية', 'شيانشيا', 'شونين', 'شوانهوان', 'شريحة من الحياة', 'سينين', 'سحر', 'زراعة', 'كوميديا', 'كوارث', 'قوى خارقة', 'فنون قتالية', 'فانتازيا', 'غموض', 'عسكري', 'موريم', 'مغامرة', 'مغامرات', 'مصاصو الدماء', 'محاكي', 'مأساة', 'لعبة', 'وشيا', 'نظام'
            ];
        }
        const categoriesListStr = availableCategories.join('، ');

        const prompt = `
أنت خبير في ترجمة بيانات الروايات من الإنجليزية إلى العربية.
المهمة: قم بترجمة البيانات التالية إلى العربية، ثم قم بتصنيف الرواية ضمن التصنيفات المتاحة التالية: ${categoriesListStr}.

البيانات الأصلية:
- العنوان: ${originalData.title}
- الوصف: ${originalData.description || ''}
- التصنيفات الأصلية (tags): ${originalData.tags?.join(', ') || ''}

المطلوب:
1. ترجمة العنوان إلى العربية (بدون علامات تنصيص).
2. ترجمة الوصف إلى العربية بأسلوب "إبداعي سياقي" (Localization):
   - تجنب الترجمة الحرفية تماماً؛ أعد صياغة الجمل لتكون انسيابية وقوية باللغة العربية.
   - الالتزام الصارم بالمصطلحات: (إله -> حاكم/حكام) ، (إلهية -> سماوية).
   - التنسيق: الحوارات بين " "، ورسائل النظام بين [ ].
   - منع استخدام أي كلمات إنجليزية داخل النص المترجم.
3. استخراج التصنيفات المطابقة فقط:
   - قارن الـ (tags) الأصلية مع القائمة المتاحة (availableCategories).
   - استخرج الأسماء المطابقة فقط من القائمة المذكورة أعلاه.
   - يمنع ابتكار أو إضافة تصنيفات خارج هذه القائمة.

أعد النتيجة بصيغة JSON فقط بالشكل التالي:
{
  "arabicTitle": "العنوان المترجم",
  "arabicDescription": "الوصف المترجم",
  "matchedCategories": ["تصنيف1", "تصنيف2"]
}

إذا لم يتم العثور على تصنيفات مطابقة، أعد مصفوفة فارغة.
لا تضف أي نصوص خارج JSON.
`;

        if (jobId) await updateMetadataJob(jobId, 'active', 'جاري ترجمة البيانات...', 'info');

        // ---- Multi-provider translation with double cycle ----
        const MAX_CYCLES = 2;
        let cycle = 0;
        let parsed = null;
        let lastError = null;

        while (!parsed && cycle < MAX_CYCLES) {
            cycle++;
            if (cycle > 1) {
                await logScraper(`🔄 دورة ${cycle}: محاولة إضافية عبر جميع المزوّدين`, 'info');
            }
            for (const provider of providers) {
                if (parsed) break;
                const providerName = provider.name || provider.providerId;
                const modelToUse = provider.selectedModel || (provider.models && provider.models[0]?.modelId) || 'gemini-1.5-flash';
                let keys = provider.apiKeys || [];
                
                // 🔥 Allow ChatGPT Android provider to have empty keys
                const isChatGPT = isChatGPTAndroidProvider(provider);
                if (keys.length === 0 && !isChatGPT) {
                    await logScraper(`⚠️ المزوّد ${providerName} ليس لديه مفاتيح – تخطيه`, 'warning');
                    continue;
                }
                
                // For ChatGPT with empty keys, create a dummy key
                if (isChatGPT && keys.length === 0) {
                    keys = ['dummy-key-for-chatgpt-android'];
                    await logScraper(`🔑 مزوّد ChatGPT Android: سيتم استخدام مفتاح وهمي (لا يحتاج مفتاح حقيقي)`, 'info');
                }

                for (let keyIdx = 0; keyIdx < keys.length; keyIdx++) {
                    const key = keys[keyIdx];
                    try {
                        await logScraper(`🔑 مزوّد: ${providerName} | نموذج: ${modelToUse} | مفتاح ${keyIdx + 1}/${keys.length}`, 'info');
                        const rawText = await callTranslationProvider(provider, modelToUse, key, prompt);
                        let jsonText = rawText.trim();
                        if (jsonText.startsWith("```json")) {
                            jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
                        } else if (jsonText.startsWith("```")) {
                            jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
                        }
                        parsed = JSON.parse(jsonText);
                        if (jobId) await updateMetadataJob(jobId, 'active', `✅ نجحت الترجمة باستخدام ${providerName}`, 'success');
                        break; // exit key loop
                    } catch (err) {
                        lastError = err;
                        console.error(`❌ فشل ${providerName} مفتاح ${keyIdx+1}: ${err.message}`);
                        if (err.message.includes('429') || err.message.includes('quota')) {
                            if (jobId) await updateMetadataJob(jobId, 'active', `⚠️ ضغط على المفتاح، تبديل...`, 'warning');
                            await delay(3000);
                            continue; // try next key
                        }
                        // For other errors, try next key
                    }
                }
                if (!parsed) {
                    await logScraper(`🚫 جميع مفاتيح ${providerName} فشلت`, 'warning');
                }
            }
            if (!parsed && cycle < MAX_CYCLES) {
                await delay(10000);
            }
        }

        if (!parsed) {
            throw lastError || new Error('فشل بعد عدة محاولات');
        }

        // Update novel in MongoDB
        const updateData = {};
        if (parsed.arabicTitle && parsed.arabicTitle.trim()) {
            updateData.title = parsed.arabicTitle;
            if (jobId) await updateMetadataJob(jobId, 'active', `✅ تم ترجمة العنوان إلى: ${parsed.arabicTitle}`, 'success');
        }
        if (parsed.arabicDescription && parsed.arabicDescription.trim()) {
            updateData.description = parsed.arabicDescription;
            if (jobId) await updateMetadataJob(jobId, 'active', '✅ تم ترجمة الوصف', 'success');
        }
        if (parsed.matchedCategories && Array.isArray(parsed.matchedCategories) && parsed.matchedCategories.length > 0) {
            updateData.tags = parsed.matchedCategories;
            if (parsed.matchedCategories[0]) {
                updateData.category = parsed.matchedCategories[0];
            }
            if (jobId) await updateMetadataJob(jobId, 'active', `✅ تم تحديث التصنيفات إلى: ${parsed.matchedCategories.join(', ')}`, 'success');
        }
        
        if (Object.keys(updateData).length > 0) {
            await Novel.updateOne({ _id: novelId }, { $set: updateData });
            await logScraper(`✅ تم تحديث البيانات الوصفية للرواية: العنوان: ${parsed.arabicTitle || originalData.title}`, 'success');
            if (jobId) await updateMetadataJob(jobId, 'completed', '🏁 اكتملت ترجمة البيانات بنجاح', 'success');
        } else {
            await logScraper(`ℹ️ لم يتم العثور على بيانات جديدة لتحديثها`, 'info');
            if (jobId) await updateMetadataJob(jobId, 'completed', 'ℹ️ لم يتم العثور على بيانات جديدة', 'info');
        }

    } catch (error) {
        console.error("Metadata translation error:", error);
        await logScraper(`❌ فشل ترجمة البيانات الوصفية: ${error.message}`, 'error');
        if (jobId) await updateMetadataJob(jobId, 'failed', `❌ فشل الترجمة: ${error.message}`, 'error');
    }
}

// Helper to escape regex special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 🔥 Helper to get GLOBAL Settings (Singleton)
async function getGlobalSettings() {
    let settings = await Settings.findOne();
    if (!settings) {
        settings = new Settings({});
        await settings.save();
    }
    return settings;
}

// 🔥🔥 WORKER FUNCTION FOR TITLE EXTRACTION (BACKGROUND) 🔥🔥
async function processTitleExtractionJob(jobId) {
    try {
        const job = await ChapterScraperJob.findById(jobId);
        if (!job || job.status !== 'active') return;

        if (!firestore) {
            job.status = 'failed';
            job.logs.push({ message: "Firestore not connected", type: 'error' });
            await job.save();
            return;
        }

        const novel = await Novel.findById(job.novelId);
        if (!novel) {
            job.status = 'failed';
            job.logs.push({ message: "الرواية غير موجودة", type: 'error' });
            await job.save();
            return;
        }

        // Sort chapters
        const chapters = novel.chapters.sort((a, b) => a.number - b.number);
        let updatedCount = 0;

        for (let i = 0; i < chapters.length; i++) {
            const chapter = chapters[i];
            
            // Check if job was cancelled externally
            const freshJob = await ChapterScraperJob.findById(jobId);
            if (!freshJob) break; 

            try {
                // Fetch content from Firestore
                const docRef = firestore.collection('novels').doc(novel._id.toString()).collection('chapters').doc(chapter.number.toString());
                const docSnap = await docRef.get();

                if (docSnap.exists) {
                    const content = docSnap.data().content || "";
                    
                    const lines = content.split('\n');
                    let firstLine = "";
                    for (const line of lines) {
                        if (line.trim().length > 0) {
                            firstLine = line.trim();
                            break;
                        }
                    }

                    // Check regex: Contains "Chapter" or "الفصل" AND has a colon ":"
                    if (firstLine && (firstLine.includes('الفصل') || firstLine.includes('Chapter')) && firstLine.includes(':')) {
                        const parts = firstLine.split(':');
                        if (parts.length > 1) {
                            const newTitle = parts.slice(1).join(':').trim();
                            
                            if (newTitle && newTitle !== chapter.title) {
                                // Update Mongo
                                await Novel.updateOne(
                                    { _id: novel._id, "chapters.number": chapter.number },
                                    { $set: { "chapters.$.title": newTitle } }
                                );
                                
                                // Update Firestore
                                await docRef.update({ title: newTitle });

                                updatedCount++;
                                
                                // Log update to Job
                                await ChapterScraperJob.findByIdAndUpdate(jobId, {
                                    $push: { logs: { message: `✅ فصل ${chapter.number}: تم التحديث إلى "${newTitle}"`, type: 'success' } }
                                });
                            }
                        }
                    }
                }
            } catch (err) {
                // Log error but continue
                 await ChapterScraperJob.findByIdAndUpdate(jobId, {
                    $push: { logs: { message: `❌ خطأ في فصل ${chapter.number}: ${err.message}`, type: 'error' } }
                });
            }

            // Update Progress
            await ChapterScraperJob.findByIdAndUpdate(jobId, {
                processedCount: i + 1,
                lastUpdate: new Date()
            });
            
            // Artificial delay to not choke DB
            await new Promise(r => setTimeout(r, 100));
        }

        await ChapterScraperJob.findByIdAndUpdate(jobId, {
            status: 'completed',
            $push: { logs: { message: `🏁 اكتملت المهمة. تم تحديث ${updatedCount} عنوان.`, type: 'success' } }
        });

    } catch (e) {
        console.error(e);
        await ChapterScraperJob.findByIdAndUpdate(jobId, {
            status: 'failed',
            $push: { logs: { message: `❌ خطأ فادح: ${e.message}`, type: 'error' } }
        });
    }
}

module.exports = function(app, verifyToken, verifyAdmin, upload) {

    // =========================================================
    // 🛠️ TOOLS API (JOB BASED TITLE EXTRACTOR)
    // =========================================================
    
    // 1. Get Jobs
    app.get('/api/admin/tools/extract-titles/jobs', verifyAdmin, async (req, res) => {
        try {
            const jobs = await ChapterScraperJob.find().sort({ createdAt: -1 }).limit(20);
            res.json(jobs);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

// 🟢 1. جلب قائمة المستخدمين
    app.get('/api/admin/users', verifyAdmin, async (req, res) => {
        try {
            const users = await User.find().select('-password').sort({ createdAt: -1 });
            res.json(users);
        } catch (error) {
            res.status(500).json({ message: "خطأ في جلب المستخدمين", error: error.message });
        }
    });

// 🔴 3. حذف رواية (الدالة المفقودة)
    app.delete('/api/admin/novel/:id', verifyAdmin, async (req, res) => {
        try {
            const novel = await Novel.findByIdAndDelete(req.params.id);
            if (!novel) return res.status(404).json({ message: "الرواية غير موجودة" });
            
            res.json({ message: "تم حذف الرواية بنجاح" });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // 2. Start Job
    app.post('/api/admin/tools/extract-titles/start', verifyAdmin, async (req, res) => {
        try {
            const { novelId } = req.body;
            if (!novelId) return res.status(400).json({ message: "Novel ID required" });

            const novel = await Novel.findById(novelId);
            if (!novel) return res.status(404).json({ message: "Novel not found" });

            const job = new ChapterScraperJob({
                novelId: novel._id,
                novelTitle: novel.title,
                cover: novel.cover,
                totalChapters: novel.chapters.length,
                logs: [{ message: '🚀 تم بدء مهمة استخراج العناوين...', type: 'info' }]
            });

            await job.save();

            // 🔥 Start Worker in Background (No await)
            processTitleExtractionJob(job._id);

            res.json({ success: true, message: "تم بدء المهمة في الخلفية", jobId: job._id });

        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 3. Get Job Detail
    app.get('/api/admin/tools/extract-titles/jobs/:id', verifyAdmin, async (req, res) => {
        try {
            const job = await ChapterScraperJob.findById(req.params.id);
            res.json(job);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 4. Delete Job
    app.delete('/api/admin/tools/extract-titles/jobs/:id', verifyAdmin, async (req, res) => {
        try {
            await ChapterScraperJob.findByIdAndDelete(req.params.id);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });


    // =========================================================
    // 📂 CATEGORY MANAGEMENT API (GLOBAL)
    // =========================================================
    
    // Add New Category to Master List
    app.post('/api/admin/categories', verifyAdmin, async (req, res) => {
        try {
            const { category } = req.body;
            if (!category) return res.status(400).json({ message: "Category name required" });

            let settings = await getGlobalSettings();

            if (!settings.managedCategories) settings.managedCategories = [];
            
            if (!settings.managedCategories.includes(category)) {
                settings.managedCategories.push(category);
                await settings.save();
            }
            
            res.json({ message: "Category added", list: settings.managedCategories });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Delete Category (Remove from Master List + Remove from ALL Novels)
    app.delete('/api/admin/categories/:name', verifyAdmin, async (req, res) => {
        try {
            const categoryName = decodeURIComponent(req.params.name);
            
            // 1. Remove from Admin Settings (GLOBAL)
            let settings = await getGlobalSettings();
            if (settings && settings.managedCategories) {
                settings.managedCategories = settings.managedCategories.filter(c => c !== categoryName);
                await settings.save();
            }

            // 2. Remove from Novels (Tags array)
            await Novel.updateMany(
                { tags: categoryName },
                { $pull: { tags: categoryName } }
            );

            // 3. Reset Main Category if matched
            await Novel.updateMany(
                { category: categoryName },
                { $set: { category: 'أخرى' } }
            );

            res.json({ message: "Category deleted permanently" });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================
    // 🧹 GLOBAL CLEANER API
    // =========================================================
    
    // Get Blacklist
    app.get('/api/admin/cleaner', verifyAdmin, async (req, res) => {
        try {
            let settings = await getGlobalSettings();
            res.json(settings.globalBlocklist || []);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Add Word & Execute Clean
    app.post('/api/admin/cleaner', verifyAdmin, async (req, res) => {
        try {
            const { word } = req.body; 
            if (!word) return res.status(400).json({ message: "Word required" });

            // 1. Save to Blacklist (GLOBAL)
            let settings = await getGlobalSettings();
            
            if (!settings.globalBlocklist.includes(word)) {
                settings.globalBlocklist.push(word);
                await settings.save();
            }

            // 2. Execute Cleanup on ALL Novels (Batch Job)
            let updatedCount = 0;

            if (firestore) {
                const novelsSnapshot = await firestore.collection('novels').get();
                const batchPromises = [];

                novelsSnapshot.forEach(doc => {
                    const novelId = doc.id;
                    const p = firestore.collection('novels').doc(novelId).collection('chapters').get().then(chaptersSnap => {
                        chaptersSnap.forEach(chapDoc => {
                            let content = chapDoc.data().content || "";
                            let modified = false;

                            if (word.includes('\n') || word.includes('\r')) {
                                // --- BLOCK REMOVAL MODE ---
                                if (content.includes(word)) {
                                    content = content.split(word).join('');
                                    modified = true;
                                }
                            } else {
                                // --- KEYWORD LINE REMOVAL MODE ---
                                const escapedKeyword = escapeRegExp(word);
                                const regex = new RegExp(`^.*${escapedKeyword}.*$`, 'gm');
                                
                                if (regex.test(content)) {
                                    content = content.replace(regex, '');
                                    modified = true;
                                }
                            }

                            if (modified) {
                                content = content.replace(/^\s*[\r\n]/gm, ''); // Clean empty lines
                                chapDoc.ref.update({ content: content });
                                updatedCount++;
                            }
                        });
                    });
                    batchPromises.push(p);
                });
                await Promise.all(batchPromises);
            }

            res.json({ message: "Cleanup executed", updatedCount });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: e.message });
        }
    });

    // Update Word (Remove old, Add new, Clean new)
    app.put('/api/admin/cleaner/:index', verifyAdmin, async (req, res) => {
        try {
            const index = parseInt(req.params.index);
            const { word } = req.body;
            
            let settings = await getGlobalSettings();
            if (settings && settings.globalBlocklist[index]) {
                settings.globalBlocklist[index] = word;
                await settings.save();
                
                // Re-run cleaner for the new word (Batch)
                if (firestore) {
                    const novelsSnapshot = await firestore.collection('novels').get();
                    const batchPromises = [];
                    novelsSnapshot.forEach(doc => {
                        const p = firestore.collection('novels').doc(doc.id).collection('chapters').get().then(chaptersSnap => {
                            chaptersSnap.forEach(chapDoc => {
                                let content = chapDoc.data().content || "";
                                let modified = false;

                                if (word.includes('\n') || word.includes('\r')) {
                                    if (content.includes(word)) {
                                        content = content.split(word).join('');
                                        modified = true;
                                    }
                                } else {
                                    const escapedKeyword = escapeRegExp(word);
                                    const regex = new RegExp(`^.*${escapedKeyword}.*$`, 'gm');
                                    if (regex.test(content)) {
                                        content = content.replace(regex, '');
                                        modified = true;
                                    }
                                }

                                if (modified) {
                                    content = content.replace(/^\s*[\r\n]/gm, '');
                                    chapDoc.ref.update({ content: content });
                                }
                            });
                        });
                        batchPromises.push(p);
                    });
                    await Promise.all(batchPromises);
                }
            }
            res.json({ message: "Updated and executed" });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

app.put('/api/admin/novels/:id', verifyAdmin, async (req, res) => {
        try {
            const { title, titleEn, cover, description, category, tags, status } = req.body;
            const novel = await Novel.findById(req.params.id);
            if (!novel) return res.status(404).json({ message: "Novel not found" });

            if (req.user.role !== 'admin' && novel.authorEmail !== req.user.email) {
                return res.status(403).json({ message: "Access Denied" });
            }

            let updateData = { title, titleEn, cover, description, category, tags, status };
            if (req.user.role === 'admin') {
                updateData.author = req.user.name;
                updateData.authorEmail = req.user.email;
                updateData.authorId = req.user.id; // 🔥 NEW: Set authorId
            }
            const updated = await Novel.findByIdAndUpdate(req.params.id, updateData, { new: true });
            res.json(updated);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

// 🔵 2. تحديث رتبة مستخدم
    app.put('/api/admin/users/:id/role', verifyAdmin, async (req, res) => {
        try {
            const { role } = req.body;
            const updatedUser = await User.findByIdAndUpdate(
                req.params.id, 
                { role }, 
                { new: true }
            );
            res.json({ message: "تم تحديث الرتبة بنجاح", user: updatedUser });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });


// Delete Novel (Admin/Author)
    app.delete('/api/admin/novels/:id', verifyAdmin, async (req, res) => {
        try {
            const novelId = req.params.id;
            const novel = await Novel.findById(novelId);
            if (!novel) {
                return res.status(404).json({ message: "الرواية غير موجودة" });
            }

            // التحقق من الصلاحيات (المشرف أو المؤلف)
            if (req.user.role !== 'admin' && novel.authorEmail !== req.user.email) {
                return res.status(403).json({ message: "لا تملك صلاحية حذف هذه الرواية" });
            }

            // 1. حذف الفصول من Firestore (إن وجدت)
            if (firestore) {
                try {
                    const chaptersRef = firestore.collection('novels').doc(novelId).collection('chapters');
                    const snapshot = await chaptersRef.get();
                    
                    // Batch delete all chapters
                    const batch = firestore.batch();
                    snapshot.forEach(doc => {
                        batch.delete(doc.ref);
                    });
                    await batch.commit();
                    
                    // Delete the novel document from Firestore
                    await firestore.collection('novels').doc(novelId).delete();
                    
                    await logScraper(`✅ تم حذف ${snapshot.size} فصل من Firestore للرواية ${novel.title}`, 'success');
                } catch (fsError) {
                    console.error("❌ فشل حذف الفصول من Firestore:", fsError);
                    await logScraper(`❌ فشل حذف الفصول من Firestore: ${fsError.message}`, 'error');
                    return res.status(500).json({ message: "فشل حذف الفصول من قاعدة البيانات السحابية، يرجى المحاولة لاحقاً." });
                }
            }

            // 2. حذف الرواية من MongoDB
            await Novel.findByIdAndDelete(novelId);
            
            // 3. حذف أي سجلات في مكتبة المستخدمين مرتبطة بهذه الرواية
            await NovelLibrary.deleteMany({ novelId: novelId });
            
            // 4. (اختياري) حذف مهام الترجمة المرتبطة بالرواية
            if (mongoose.models.MetadataTranslationJob) {
                await mongoose.models.MetadataTranslationJob.deleteMany({ novelId: novelId });
            }

            await logScraper(`🗑️ تم حذف الرواية ${novel.title} بالكامل (MongoDB + Firestore)`, 'success');
            res.json({ message: "تم حذف الرواية وجميع فصولها بنجاح" });
            
        } catch (error) {
            console.error("Error deleting novel:", error);
            await logScraper(`❌ فشل حذف الرواية: ${error.message}`, 'error');
            res.status(500).json({ error: error.message });
        }
    });

    // Delete Word from Blacklist
    app.delete('/api/admin/cleaner/:word', verifyAdmin, async (req, res) => {
        try {
            const word = decodeURIComponent(req.params.word);
            let settings = await getGlobalSettings();
            if (settings) {
                settings.globalBlocklist = settings.globalBlocklist.filter(w => w !== word);
                await settings.save();
            }
            res.json({ message: "Removed from list" });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================
    // 🔄 GLOBAL REPLACEMENTS API (SERVER-SIDE)
    // =========================================================

    // Get Replacements
    app.get('/api/admin/global-replacements', verifyAdmin, async (req, res) => {
        try {
            let settings = await getGlobalSettings();
            res.json(settings.globalReplacements || []);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Add Replacement
    app.post('/api/admin/global-replacements', verifyAdmin, async (req, res) => {
        try {
            const { original, replacement } = req.body;
            if (!original) return res.status(400).json({ message: "Original word required" });

            let settings = await getGlobalSettings();
            if (!settings.globalReplacements) settings.globalReplacements = [];

            settings.globalReplacements.push({ original, replacement: replacement || '' });
            await settings.save();

            res.json({ message: "Replacement added", list: settings.globalReplacements });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Update Replacement
    app.put('/api/admin/global-replacements/:id', verifyAdmin, async (req, res) => {
        try {
            const { original, replacement } = req.body;
            let settings = await getGlobalSettings();
            
            const item = settings.globalReplacements.id(req.params.id);
            if (!item) return res.status(404).json({ message: "Item not found" });

            if (original) item.original = original;
            if (replacement !== undefined) item.replacement = replacement;

            await settings.save();
            res.json({ message: "Updated", list: settings.globalReplacements });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Delete Replacement
    app.delete('/api/admin/global-replacements/:id', verifyAdmin, async (req, res) => {
        try {
            let settings = await getGlobalSettings();
            settings.globalReplacements.pull(req.params.id);
            await settings.save();
            res.json({ message: "Deleted", list: settings.globalReplacements });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================
    // 📝 GLOBAL COPYRIGHTS API (UPDATED FOR SEPARATOR)
    // =========================================================
    
    // Get Copyrights
    app.get('/api/admin/copyright', verifyAdmin, async (req, res) => {
        try {
            let settings = await getGlobalSettings();
            res.json({
                startText: settings.globalChapterStartText || '',
                endText: settings.globalChapterEndText || '',
                styles: settings.globalCopyrightStyles || {},
                frequency: settings.copyrightFrequency || 'always',
                everyX: settings.copyrightEveryX || 5,
                // 🔥 NEW FIELDS
                chapterSeparatorText: settings.chapterSeparatorText || '________________________________________',
                enableChapterSeparator: settings.enableChapterSeparator ?? true
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Save Copyrights
    app.post('/api/admin/copyright', verifyAdmin, async (req, res) => {
        try {
            const { 
                startText, endText, styles, frequency, everyX,
                chapterSeparatorText, enableChapterSeparator // 🔥 New fields
            } = req.body;
            
            let settings = await getGlobalSettings();
            
            settings.globalChapterStartText = startText;
            settings.globalChapterEndText = endText;
            
            if (styles) settings.globalCopyrightStyles = styles;
            if (frequency) settings.copyrightFrequency = frequency;
            if (everyX) settings.copyrightEveryX = everyX;
            
            // Save Separator Settings
            if (chapterSeparatorText !== undefined) settings.chapterSeparatorText = chapterSeparatorText;
            if (enableChapterSeparator !== undefined) settings.enableChapterSeparator = enableChapterSeparator;

            await settings.save();
            res.json({ message: "Copyrights updated" });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });


    // =========================================================
    // 📜 SCRAPER LOGS API
    // =========================================================
    app.delete('/api/scraper/logs', async (req, res) => {
        try {
            await ScraperLog.deleteMany({});
            res.json({ message: "Logs cleared" });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/scraper/logs', async (req, res) => {
        try {
            const logs = await ScraperLog.find().sort({ timestamp: -1 }).limit(100);
            res.json(logs);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/scraper/init', async (req, res) => {
        try {
            const { url, userEmail } = req.body;
            await ScraperLog.deleteMany({}); 
            
            if (userEmail) {
                const user = await User.findOne({ email: userEmail });
                if (user) await logScraper(`👤 المستخدم: ${user.name}`, 'info');
            }

            await logScraper(`🚀 بدء عملية الفحص الذكي...`, 'info');
            await logScraper(`🔗 الرابط: ${url}`, 'info');
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/scraper/log', async (req, res) => {
        try {
            const { message, type } = req.body;
            await logScraper(message, type || 'info');
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================
    // 👁️ NEW WATCHLIST API (Watchlist Dashboard)
    // =========================================================
    
    // 🔥🔥 UPDATED: Allow Access with API Secret Header for Scraper 🔥🔥
    app.get('/api/admin/watchlist', async (req, res, next) => {
        const secret = req.headers['authorization'] || req.headers['x-api-secret'];
        // This should theoretically be in env, but keeping consistent with prompt
        const VALID_SECRET = 'Zeusndndjddnejdjdjdejekk29393838msmskxcm9239484jdndjdnddjj99292938338zeuslojdnejxxmejj82283849';
        
        if (secret === VALID_SECRET) {
            // Bypass verification, it's the scraper
            return next();
        }
        // Otherwise, verify admin token
        verifyAdmin(req, res, next);
    }, async (req, res) => {
        try {
            // 🔥🔥 ROCKET SPEED UPDATE: Use Aggregation to count chapters without fetching them
            const novels = await Novel.aggregate([
                { $match: { isWatched: true } },
                {
                    $project: {
                        title: 1,
                        cover: 1,
                        lastChapterUpdate: 1,
                        sourceUrl: 1,
                        sourceStatus: 1,
                        status: 1,
                        // Calculate size directly in DB
                        chaptersCount: { $size: { $ifNull: ["$chapters", []] } }
                    }
                },
                { $sort: { lastChapterUpdate: -1 } }
            ]);

            const formatted = novels.map(n => {
                const now = new Date();
                const diffTime = Math.abs(now - n.lastChapterUpdate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                let computedStatus = 'ongoing';
                
                // Priority to server-side logic
                if (n.sourceStatus === 'مكتملة' || n.status === 'مكتملة') {
                    computedStatus = 'completed';
                } else if (diffDays > 90) {
                    computedStatus = 'stopped';
                }

                return {
                    _id: n._id,
                    title: n.title,
                    cover: n.cover,
                    chaptersCount: n.chaptersCount, // Directly from aggregation
                    lastUpdate: n.lastChapterUpdate,
                    sourceUrl: n.sourceUrl,
                    status: computedStatus // 'ongoing', 'completed', 'stopped'
                };
            });

            res.json(formatted);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================
    // 🔍 CHECK EXISTING CHAPTERS
    // =========================================================
    app.post('/api/scraper/check-chapters', async (req, res) => {
        const secret = req.headers['authorization'] || req.headers['x-api-secret'];
        const VALID_SECRET = 'Zeusndndjddnejdjdjdejekk29393838msmskxcm9239484jdndjdnddjj99292938338zeuslojdnejxxmejj82283849';
        
        if (secret !== VALID_SECRET) return res.status(403).json({ message: "Unauthorized" });

        try {
            const { title } = req.body;
            
            // 🔥 تعديل: البحث باستخدام العنوانين (العربي والانجليزي)
            const novel = await Novel.findOne({ 
                $or: [
                    { title: title },
                    { titleEn: title } 
                ]
            });
            
            if (novel) {
                const existingChapters = novel.chapters.map(c => c.number);
                await logScraper(`✅ الرواية موجودة (${existingChapters.length} فصل). جاري فحص النواقص والتحديثات...`, 'success');
                return res.json({ exists: true, chapters: existingChapters });
            } else {
                return res.json({ exists: false, chapters: [] });
            }
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================
    // 🕷️ SCRAPER WEBHOOK (Corrected - No Overwrite)
    // =========================================================
    app.post('/api/scraper/receive', async (req, res) => {
        const secret = req.headers['authorization'] || req.headers['x-api-secret'];
        const VALID_SECRET = 'Zeusndndjddnejdjdjdejekk29393838msmskxcm9239484jdndjdnddjj99292938338zeuslojdnejxxmejj82283849';
        
        if (secret !== VALID_SECRET) return res.status(403).json({ message: "Unauthorized" });

        try {
            const { adminEmail, novelData, chapters, error, skipMetadataUpdate } = req.body;

            if (error) {
                await logScraper(`❌ توقف: ${error}`, 'error');
                return res.status(400).json({ message: error });
            }

            if (!novelData || !novelData.title) {
                return res.status(400).json({ message: "Missing data" });
            }

            // Fallback for user if automated
            let user = null;
            if (adminEmail) {
                user = await User.findOne({ email: adminEmail });
            }
            // Use System Name if no user found
            const authorName = user ? user.name : "System Scraper";
            const authorEmail = user ? user.email : "system@scraper";
            const authorId = user ? user._id : null; // 🔥 NEW: Get User ID

            // 🔥 البحث باستخدام العنوانين لتجنب التكرار
            let novel = await Novel.findOne({ 
                $or: [
                    { title: novelData.title },
                    { titleEn: novelData.title } 
                ]
            });

            if (!novel) {
                // Image Upload Logic (Cloudinary) - Only for NEW novels
                if (novelData.cover && !novelData.cover.includes('cloudinary') && cloudinary) {
                    try {
                        const uploadRes = await cloudinary.uploader.upload(novelData.cover, {
                            folder: 'novels_covers',
                            resource_type: 'auto',
                            timeout: 60000 
                        });
                        novelData.cover = uploadRes.secure_url;
                        await logScraper(`✅ تم رفع الغلاف`, 'success');
                    } catch (imgErr) {
                        await logScraper(`⚠️ فشل رفع الغلاف (سيستخدم الرابط الأصلي)`, 'warning');
                    }
                }

                // New Novel - Full Creation
                // 🔥 MODIFICATION: Set internal status to 'خاصة' (private) instead of using scraped status
                novel = new Novel({
                    title: novelData.title,
                    titleEn: novelData.title, 
                    cover: novelData.cover,
                    description: novelData.description,
                    author: authorName, 
                    authorEmail: authorEmail,
                    authorId: authorId, // 🔥 NEW: Set authorId
                    category: novelData.category || 'أخرى',
                    tags: novelData.tags || [],
                    status: 'خاصة', // 🔥 PRIVATE UNTIL TRANSLATED
                    chapters: [],
                    views: 0,
                    // 🔥 Watchlist Fields
                    sourceUrl: novelData.sourceUrl || '',
                    sourceStatus: novelData.status || 'مستمرة',
                    isWatched: true, // Auto-watch new scraped novels
                    lastChapterUpdate: novelData.lastUpdate ? new Date(novelData.lastUpdate) : new Date() // Use Source Date
                });
                await novel.save();
                await logScraper(`✨ تم إنشاء الرواية: ${novelData.title} (خاصة)`, 'info');

                // 🔥 NEW: Start async translation of metadata (without job)
                translateNovelMetadata(novel._id, {
                    title: novelData.title,
                    description: novelData.description,
                    tags: novelData.tags || []
                }).catch(err => console.error("Background metadata translation error:", err));

            } else {
                // 🔥🔥 CRITICAL: EXISTING NOVEL - UPDATE ONLY WATCHLIST & STATUS 🔥🔥
                
                // Update Source URL if provided
                if (novelData.sourceUrl) novel.sourceUrl = novelData.sourceUrl;
                
                // Update Source Status
                if (novelData.status) {
                    novel.sourceStatus = novelData.status;
                    // Also update main status ONLY if completed (source completed)
                    if (novelData.status === 'مكتملة') {
                        novel.status = 'مكتملة';
                        await logScraper(`🏁 تم تحديث الحالة إلى مكتملة`, 'success');
                    }
                }
                
                // Ensure it's in watchlist
                novel.isWatched = true; 

                // 🛑 DO NOT UPDATE COVER, DESCRIPTION, TITLE, OR AUTHOR
                // We deliberately skip any other metadata updates here.
                
                // 🛑 DO NOT SAVE LAST UPDATE DATE YET
                // We save it only if new chapters are added and novel is public
                
                await novel.save();
            }

            // Save Chapters (This logic handles duplicates internally)
            let addedCount = 0;
            // 🔥 NEW: Check if novel is private (status === 'خاصة')
            const isPrivate = (novel.status === 'خاصة');
            
            if (chapters && Array.isArray(chapters) && chapters.length > 0) {
                for (const chap of chapters) {
                    // Always store in Firestore (regardless of privacy)
                    if (firestore) {
                        await firestore.collection('novels').doc(novel._id.toString())
                            .collection('chapters').doc(chap.number.toString()).set({
                                title: chap.title,
                                content: chap.content,
                                lastUpdated: new Date()
                            }, { merge: true });
                    }
                    
                    // Only add to MongoDB if novel is NOT private
                    if (!isPrivate) {
                        const existingChap = novel.chapters.find(c => c.number === chap.number);
                        if (!existingChap) {
                            // MongoDB Meta
                            novel.chapters.push({
                                number: chap.number,
                                title: chap.title,
                                createdAt: new Date(),
                                views: 0
                            });
                            addedCount++;
                        }
                    }
                }

                // 🔥 NEW: Update sourceChaptersCount with the highest chapter number received
                let maxChapter = 0;
                if (chapters && chapters.length > 0) {
                    maxChapter = Math.max(...chapters.map(c => c.number));
                }
                if (maxChapter > (novel.sourceChaptersCount || 0)) {
                    await Novel.updateOne(
                        { _id: novel._id },
                        { $set: { sourceChaptersCount: maxChapter } }
                    );
                    await logScraper(`📊 تم تحديث عدد الفصول المصدر إلى ${maxChapter}`, 'info');
                }

                if (!isPrivate && addedCount > 0) {
                    novel.chapters.sort((a, b) => a.number - b.number);
                    
                    // 🔥🔥 CRITICAL FIX: Only update lastChapterUpdate if NEW chapters were added
                    // Priority: Source Date provided by scraper > Current Date
                    if (novelData.lastUpdate) {
                        const sourceDate = new Date(novelData.lastUpdate);
                        if (!isNaN(sourceDate.getTime())) {
                            novel.lastChapterUpdate = sourceDate;
                        } else {
                            novel.lastChapterUpdate = new Date();
                        }
                    } else {
                        novel.lastChapterUpdate = new Date();
                    }

                    // Reactivate if new chapters added and not completed (only if not private)
                    if (novel.status === 'متوقفة' && novel.sourceStatus !== 'مكتملة') {
                        novel.status = 'مستمرة';
                    }
                    await novel.save();
                    await logScraper(`✅ تم حفظ ${addedCount} فصل جديد وتحديث تاريخ الرواية`, 'success');
                } else if (isPrivate) {
                    // Private novel: chapters stored only in Firestore, not visible yet
                    await logScraper(`ℹ️ تم حفظ ${chapters.length} فصل في Firestore (الرواية خاصة، لن تظهر للقراء حتى تتم الترجمة)`, 'info');
                } else {
                    // No chapters added, DO NOT TOUCH lastChapterUpdate
                    // This prevents the novel from jumping to top without new content
                }
            } 

            res.json({ success: true, novelId: novel._id });

        } catch (error) {
            console.error("Scraper Receiver Error:", error);
            await logScraper(`❌ خطأ خادم: ${error.message}`, 'error');
            res.status(500).json({ error: error.message });
        }
    });

    // =========================================================
    // 🔥 NEW: METADATA TRANSLATION JOB MANAGEMENT API
    // =========================================================
    
    // 1. Get all metadata translation jobs
    app.get('/api/translator/metadata-jobs', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const jobs = await MetadataTranslationJob.find()
                .sort({ createdAt: -1 })
                .limit(20);
            res.json(jobs);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 2. Get a specific job
    app.get('/api/translator/metadata-jobs/:id', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const job = await MetadataTranslationJob.findById(req.params.id);
            if (!job) return res.status(404).json({ message: "Job not found" });
            res.json(job);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 3. Start a new metadata translation job
    app.post('/api/admin/novels/:id/translate-metadata', verifyAdmin, async (req, res) => {
        try {
            const novelId = req.params.id;
            const novel = await Novel.findById(novelId);
            if (!novel) {
                return res.status(404).json({ message: "الرواية غير موجودة" });
            }

            // Create job
            const job = new MetadataTranslationJob({
                novelId: novel._id,
                novelTitle: novel.title,
                cover: novel.cover,
                status: 'active',
                processedCount: 0,
                totalSteps: 3,
                logs: [{ message: '🚀 تم بدء مهمة ترجمة البيانات الوصفية', type: 'info', timestamp: new Date() }]
            });
            await job.save();

            // Start translation in background with job tracking
            translateNovelMetadata(novel._id, {
                title: novel.titleEn || novel.title,
                description: novel.description,
                tags: novel.tags
            }, job._id).catch(err => console.error("Background metadata translation error:", err));

            res.json({ message: "تم بدء الترجمة بنجاح", jobId: job._id });
        } catch (error) {
            console.error("Error starting metadata translation:", error);
            res.status(500).json({ error: error.message });
        }
    });

    // 4. Delete a job
    app.delete('/api/translator/metadata-jobs/:id', verifyToken, verifyAdmin, async (req, res) => {
        try {
            await MetadataTranslationJob.findByIdAndDelete(req.params.id);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

// 🔥 إنشاء رواية جديدة (للمشرفين والكتّاب)
app.post('/api/admin/novels', verifyAdmin, async (req, res) => {
    try {
        const {
            title,
            titleEn,
            cover,
            description,
            category,
            tags,
            status
        } = req.body;

        if (!title || !cover) {
            return res.status(400).json({ message: "العنوان والغلاف مطلوبان" });
        }

        const adminUser = await User.findById(req.user.id);
        if (!adminUser) {
            return res.status(404).json({ message: "المستخدم غير موجود" });
        }

        const novel = new Novel({
            title,
            titleEn: titleEn || title,
            cover,
            description: description || '',
            author: adminUser.name,
            authorEmail: adminUser.email,
            authorId: adminUser._id,
            category: category || 'أخرى',
            tags: tags || [],
            status: status || 'مستمرة',
            chapters: [],
            views: 0,
            isWatched: false
        });

        await novel.save();

        translateNovelMetadata(novel._id, {
            title: novel.title,
            description: description || '',
            tags: tags || []
        }).catch(err => console.error("Translation error:", err));

        res.status(201).json({ message: "تم إنشاء الرواية بنجاح", novelId: novel._id });
    } catch (error) {
        console.error("Novel creation error:", error);
        res.status(500).json({ error: error.message });
    }
});

    // =========================================================
    // 📦 EXPORT CHAPTERS TO ZIP (ADMIN ONLY) - 🔥 STREAMING VERSION
    // =========================================================
    app.get('/api/admin/novels/:id/export', async (req, res) => {
        try {
            const token = req.query.token;
            const includeTitle = req.query.includeTitle === 'true';

            if (!token) return res.status(401).json({ message: "Authentication required" });

            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.id);
                if (!user || (user.role !== 'admin' && user.role !== 'contributor')) {
                    return res.status(403).json({ message: "Access Denied" });
                }
                req.user = user; 
            } catch (authErr) {
                return res.status(403).json({ message: "Invalid token" });
            }

            const novelId = req.params.id;
            const novel = await Novel.findById(novelId);
            if (!novel) return res.status(404).json({ message: "Novel not found" });

            if (req.user.role !== 'admin' && novel.authorEmail !== req.user.email) {
                return res.status(403).json({ message: "Access Denied to this novel" });
            }

            const settings = await getGlobalSettings();
            
            const archiver = require('archiver');
            const archive = archiver('zip', {
                zlib: { level: 9 }
            });

            res.set('Content-Type', 'application/zip');
            res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(novel.title)}_chapters.zip"`);

            archive.pipe(res);

            let chaptersToExport = [];
            
            if (novel.status === 'خاصة' && (!novel.chapters || novel.chapters.length === 0)) {
                if (!firestore) {
                    throw new Error("Firestore غير متصل، لا يمكن جلب الفصول.");
                }
                const chaptersRef = firestore.collection('novels').doc(novelId).collection('chapters');
                const snapshot = await chaptersRef.get();
                
                snapshot.forEach(doc => {
                    const number = parseInt(doc.id);
                    if (!isNaN(number)) {
                        const data = doc.data();
                        chaptersToExport.push({
                            number: number,
                            title: data.title || `الفصل ${number}`,
                            content: data.content || ""
                        });
                    }
                });
                chaptersToExport.sort((a, b) => a.number - b.number);
            } else {
                chaptersToExport = novel.chapters.sort((a, b) => a.number - b.number).map(chap => ({
                    number: chap.number,
                    title: chap.title,
                }));
            }

            for (const chap of chaptersToExport) {
                let content = "";
                
                if (chap.content !== undefined) {
                    content = chap.content;
                } else {
                    if (firestore) {
                        const doc = await firestore.collection('novels').doc(novelId).collection('chapters').doc(chap.number.toString()).get();
                        if (doc.exists) content = doc.data().content || "";
                    }
                }

                // --- Apply Formatting Rules ---
                if (settings.globalBlocklist && settings.globalBlocklist.length > 0) {
                     settings.globalBlocklist.forEach(word => {
                        if (!word) return;
                        if (word.includes('\n') || word.includes('\r')) {
                            content = content.split(word).join('');
                        } else {
                            const escapedKeyword = escapeRegExp(word);
                            const regex = new RegExp(`^.*${escapedKeyword}.*$`, 'gm');
                            content = content.replace(regex, '');
                        }
                     });
                }

                if (settings.globalReplacements && settings.globalReplacements.length > 0) {
                    settings.globalReplacements.forEach(rep => {
                        if (rep.original) {
                            const escapedOriginal = escapeRegExp(rep.original);
                            const regex = new RegExp(escapedOriginal, 'g');
                            content = content.replace(regex, rep.replacement || '');
                        }
                    });
                }
                
                if (settings.enableChapterSeparator) {
                    const separatorLine = `\n\n${settings.chapterSeparatorText || '________________________________________'}\n\n`;
                    
                    const lines = content.split('\n');
                    let replaced = false;
                    for (let i = 0; i < lines.length; i++) {
                        const lineTrimmed = lines[i].trim();
                        if (lineTrimmed.length > 0) {
                            if (/^(?:الفصل|Chapter|فصل)|:/i.test(lineTrimmed)) {
                                lines[i] = lines[i] + separatorLine;
                                replaced = true;
                            }
                            break;
                        }
                    }
                    if (replaced) content = lines.join('\n');
                }

                let showCopyright = true;
                const freq = settings.copyrightFrequency || 'always';
                const everyX = settings.copyrightEveryX || 5;
                if (freq === 'random' && Math.random() > 0.5) showCopyright = false;
                if (freq === 'every_x' && chap.number % everyX !== 0) showCopyright = false;

                let finalContent = "";
                
                if (showCopyright && settings.globalChapterStartText) {
                    finalContent += settings.globalChapterStartText + "\n\n_________________________________\n\n";
                }
                
                if (includeTitle) {
                     finalContent += `الفصل ${chap.number}: ${chap.title || ''}\n\n`;
                }
                
                finalContent += content;

                if (showCopyright && settings.globalChapterEndText) {
                    finalContent += "\n\n_________________________________\n\n" + settings.globalChapterEndText;
                }

                archive.append(finalContent, { name: `${chap.number}.txt` });
            }

            await archive.finalize();

        } catch (e) {
            console.error("Export Error:", e);
            if (!res.headersSent) {
                res.status(500).json({ error: e.message });
            } else {
                res.end();
            }
        }
    });

// =========================================================
// 📝 SINGLE & BULK CHAPTER MANAGEMENT API
// =========================================================

app.post('/api/admin/chapters', verifyAdmin, async (req, res) => {
    try {
        const { novelId, number, title, content } = req.body;
        if (!novelId || !number || !title || !content) {
            return res.status(400).json({ message: "جميع الحقول مطلوبة" });
        }

        const novel = await Novel.findById(novelId);
        if (!novel) return res.status(404).json({ message: "الرواية غير موجودة" });

        const exists = novel.chapters.find(c => c.number == number);
        if (exists) return res.status(400).json({ message: "رقم الفصل موجود مسبقاً" });

        if (firestore) {
            await firestore.collection('novels').doc(novelId).collection('chapters')
                .doc(number.toString()).set({
                    title,
                    content,
                    lastUpdated: new Date()
                });
        }

        novel.chapters.push({
            number: parseInt(number),
            title,
            createdAt: new Date(),
            views: 0
        });
        novel.lastChapterUpdate = new Date();
        await novel.save();

        await logScraper(`✅ تم إضافة الفصل ${number} للرواية ${novel.title}`, 'success');
        res.json({ message: "تم إضافة الفصل بنجاح" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "فشل إضافة الفصل", error: error.message });
    }
});

app.put('/api/admin/chapters/:novelId/:chapterNumber', verifyAdmin, async (req, res) => {
    try {
        const { novelId, chapterNumber } = req.params;
        const { title, content } = req.body;

        const novel = await Novel.findById(novelId);
        if (!novel) return res.status(404).json({ message: "الرواية غير موجودة" });

        const chapterIdx = novel.chapters.findIndex(c => c.number == chapterNumber);
        if (chapterIdx === -1) return res.status(404).json({ message: "الفصل غير موجود" });

        if (title) {
            novel.chapters[chapterIdx].title = title;
        }
        await novel.save();

        if (firestore) {
            const updateData = { lastUpdated: new Date() };
            if (title) updateData.title = title;
            if (content) updateData.content = content;
            await firestore.collection('novels').doc(novelId).collection('chapters')
                .doc(chapterNumber.toString()).update(updateData);
        }

        await logScraper(`✅ تم تعديل الفصل ${chapterNumber}`, 'success');
        res.json({ message: "تم تعديل الفصل بنجاح" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "فشل تعديل الفصل", error: error.message });
    }
});

app.delete('/api/admin/chapters/:novelId/:chapterNumber', verifyAdmin, async (req, res) => {
    try {
        const { novelId, chapterNumber } = req.params;

        const novel = await Novel.findById(novelId);
        if (!novel) return res.status(404).json({ message: "الرواية غير موجودة" });

        const idx = novel.chapters.findIndex(c => c.number == chapterNumber);
        if (idx !== -1) {
            novel.chapters.splice(idx, 1);
            await novel.save();
        }

        if (firestore) {
            await firestore.collection('novels').doc(novelId).collection('chapters')
                .doc(chapterNumber.toString()).delete();
        }

        await logScraper(`🗑️ تم حذف الفصل ${chapterNumber} من ${novel.title}`, 'success');
        res.json({ message: "تم حذف الفصل بنجاح" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "فشل حذف الفصل", error: error.message });
    }
});

app.post('/api/admin/chapters/batch-delete', verifyAdmin, async (req, res) => {
    try {
        const { novelId, chapterNumbers } = req.body;
        if (!novelId || !Array.isArray(chapterNumbers)) {
            return res.status(400).json({ message: "بيانات غير صالحة" });
        }

        const novel = await Novel.findById(novelId);
        if (!novel) return res.status(404).json({ message: "الرواية غير موجودة" });

        novel.chapters = novel.chapters.filter(c => !chapterNumbers.includes(c.number));
        await novel.save();

        if (firestore) {
            const batch = firestore.batch();
            const chaptersRef = firestore.collection('novels').doc(novelId).collection('chapters');
            chapterNumbers.forEach(num => {
                batch.delete(chaptersRef.doc(num.toString()));
            });
            await batch.commit();
        }

        await logScraper(`🗑️ تم حذف ${chapterNumbers.length} فصل من ${novel.title}`, 'success');
        res.json({ message: "تم الحذف الجماعي بنجاح" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "فشل الحذف الجماعي", error: error.message });
    }
});

const multer = require('multer');
const uploadZip = multer({ storage: multer.memoryStorage() });

app.post('/api/admin/chapters/bulk-upload', verifyAdmin, uploadZip.single('zip'), async (req, res) => {
    try {
        const { novelId } = req.body;
        if (!novelId) return res.status(400).json({ message: "معرف الرواية مطلوب" });
        if (!req.file) return res.status(400).json({ message: "يرجى إرفاق ملف ZIP" });

        const novel = await Novel.findById(novelId);
        if (!novel) return res.status(404).json({ message: "الرواية غير موجودة" });

        const zip = new AdmZip(req.file.buffer);
        const zipEntries = zip.getEntries();

        let successCount = 0;
        const errors = [];

        for (const entry of zipEntries) {
            if (entry.isDirectory) continue;

            const nameWithoutExt = path.basename(entry.entryName, path.extname(entry.entryName)).trim();
            let chapterNumber = parseInt(nameWithoutExt);
            if (isNaN(chapterNumber)) {
                const match = nameWithoutExt.match(/(\d+)/);
                if (match) chapterNumber = parseInt(match[1]);
                else {
                    errors.push(`تخطي: "${entry.entryName}" - لا يوجد رقم صحيح`);
                    continue;
                }
            }

            let content = zip.readAsText(entry);
            const lines = content.split('\n').filter(l => l.trim());
            let title = `الفصل ${chapterNumber}`;
            if (lines.length > 0) {
                const firstLine = lines[0].trim();
                if (firstLine.length < 100 && !firstLine.includes(':')) {
                    title = firstLine;
                }
            }

            if (novel.chapters.some(c => c.number === chapterNumber)) {
                errors.push(`موجود: فصل ${chapterNumber}`);
                continue;
            }

            try {
                if (firestore) {
                    await firestore.collection('novels').doc(novelId).collection('chapters')
                        .doc(chapterNumber.toString()).set({
                            title,
                            content,
                            lastUpdated: new Date()
                        });
                }

                novel.chapters.push({
                    number: chapterNumber,
                    title,
                    createdAt: new Date(),
                    views: 0
                });
                successCount++;
            } catch (e) {
                errors.push(`خطأ في فصل ${chapterNumber}: ${e.message}`);
            }
        }

        if (successCount > 0) {
            novel.lastChapterUpdate = new Date();
            await novel.save();
        }

        await logScraper(`📦 رفع ZIP: تم إضافة ${successCount} فصل للرواية ${novel.title}`, 'success');
        res.json({ successCount, errors: errors.slice(0, 20) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "فشل معالجة الملف المضغوط", error: error.message });
    }
});

    // =========================================================
    // 🔄 TRANSFER ALL OWNERSHIP (ADMIN ONLY) - 🔥 FIXED PATH CONFLICT
    // =========================================================
    app.put('/api/admin/ownership/transfer-all', verifyAdmin, async (req, res) => {
        const requestUser = await User.findById(req.user.id);
        if (!requestUser || requestUser.role !== 'admin') {
            return res.status(403).json({ message: "Access Denied. Admins only." });
        }

        const { targetUserId } = req.body;
        
        if (!targetUserId) {
            return res.status(400).json({ message: "Target User ID is required" });
        }

        try {
            const targetUser = await User.findById(targetUserId);
            if (!targetUser) {
                return res.status(404).json({ message: "Target User not found" });
            }

            const result = await Novel.updateMany({}, {
                $set: {
                    author: targetUser.name,
                    authorEmail: targetUser.email
                }
            });

            res.json({ 
                message: "Ownership transferred successfully", 
                modifiedCount: result.modifiedCount,
                newOwner: targetUser.name
            });

        } catch (error) {
            console.error("Transfer Ownership Error:", error);
            res.status(500).json({ error: error.message });
        }
    });
};