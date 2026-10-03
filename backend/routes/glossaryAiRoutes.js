/**
 * 📚 المستخرج الذكي — استخراج مصطلحات الرواية كاملة قبل الترجمة (نظام جديد مستقل)
 *
 * نفس نمط المترجم الذكي/المراجع الذكي بالضبط (reviewRoutes):
 *  - مهمة (GlossaryExtractionJob) لها حالة/سجل حي/إيقاف مؤقت/استئناف/حذف
 *  - عامل خلفي يمر على الفصول واحداً تلو الآخر من نفس مخزن النصوص (Firestore)
 *  - يستدعي نفس مزوّدات الذكاء الاصطناعي المضبوطة في إعدادات المترجم (نفس المفاتيح)
 *  - Qwen = حسابات تلقائية + وسوم فشل + لا انتقال لمزوّد آخر أبداً (حرفياً كالمترجم)
 *  - ⏱️ فاصل بين الفصول يضبطه المستخدم من الواجهة ويُقرأ حياً كل فصل
 *
 * الفرق الوحيد عن المترجم: بدل ترجمة الفصل، يستخرج من نصه الأصلي (أي لغة)
 * المصطلحات (أسماء شخصيات/أماكن/عناصر/رتب/مفاهيم) مع اقتراح الترجمة العربية،
 * ويغذيها في المسرد (Glossary) — ليكتمل مسرد الرواية كله قبل بدء الترجمة،
 * فتُوزَّع فصول الرواية بعد ذلك على عدة مهام ترجمة تعمل بسرعة مع مسرد جاهز.
 *
 * ⚠️ نظام إضافي مستقل تماماً: لا يمس المترجم ولا المراجع ولا أي نظام قائم.
 */
const mongoose = require('mongoose');
const Novel = require('../models/novel.model.js');
const Glossary = require('../models/glossary.model.js');
const GlossaryExtractionJob = require('../models/glossaryExtractionJob.model.js');
const Settings = require('../models/settings.model.js');
const qwenAutoAccount = require('../services/qwenAutoAccount.service.js');
const {
    callTranslationProvider,
    getGlobalSettings,
    getProviderAuthKeys,
    isDeepSeekProvider,
    isQwenProvider,
    isGeminiWebProvider,
    GUEST_TOKEN_SENTINEL,
} = require('./translatorRoutes')._ai;

// --- Firestore Setup (MANDATORY — نفس مخزن فصول المترجم) ---
let firestore;
try {
    const firebaseAdmin = require('../config/firebaseAdmin');
    firestore = firebaseAdmin.db;
} catch (e) {
    console.error("❌ CRITICAL: Firestore not loaded. Glossary extractor cannot work without it.");
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** تصنيفات المسرد المسموحة (نفس نموذج Glossary) */
const TERM_CATEGORIES = ['characters', 'locations', 'items', 'ranks', 'other'];
const CATEGORY_LABELS = {
    characters: 'شخصيات',
    locations: 'أماكن',
    items: 'عناصر',
    ranks: 'رتب',
    other: 'أخرى',
};

/** تطبيع تصنيف الرد من النموذج إلى تصنيفات المسرد (نفس تحويل المترجم) */
function normalizeCategory(raw) {
    let c = String(raw || '').toLowerCase().trim();
    if (c === 'character' || c === 'شخصية' || c === 'شخصيات') return 'characters';
    if (c === 'location' || c === 'مكان' || c === 'أماكن' || c === 'موقع') return 'locations';
    if (c === 'item' || c === 'عنصر' || c === 'عناصر' || c === 'شيء') return 'items';
    if (c === 'rank' || c === 'رتبة' || c === 'رتب') return 'ranks';
    if (c === 'concept' || c === 'مفهوم' || c === 'مفاهيم') return 'other';
    return TERM_CATEGORIES.includes(c) ? c : 'other';
}

/**
 * 🧠 بناء توجيه الاستخراج — من النص الأصلي فقط (قبل الترجمة — لا يوجد نص عربي
 * مقترن بعد). النموذج يقترح الترجمة العربية المعتمدة لكل مصطلح بنفسه.
 * نفس قواعد قالب الاستخراج الافتراضي في المترجم (DEFAULT_EXTRACT_PROMPT).
 */
function buildExtractionPrompt(content, chapterNum) {
    return `ROLE: Expert Web Novel Terminology Extractor.
TASK: Analyze the "Source Text" below (any language: English/Chinese/Korean/Japanese/Russian/...) which is chapter ${chapterNum} of a web novel, and extract key proper nouns, unique concepts, and specific terminology to build a comprehensive Glossary (Codex) for the whole novel BEFORE translation.

STRICT RULES:
1.  Categories: Classify each extracted term into one of: 'character', 'location', 'item', 'rank', 'concept', 'other'.
    *   character: Names of individuals, specific titles referring to a person.
    *   location: Cities, villages, geographical regions, buildings, headquarters.
    *   item: Tools, weapons, materials, unique objects, or specific creatures.
    *   rank: General military, social, or cultivation ranks (not specific character names).
    *   concept: Spiritual, philosophical, cultivation terms, general techniques, or abstract ideas.
    *   other: Any other important term that doesn't fit the above categories.
2.  Format: Return a clean JSON array of objects.
3.  Content:
    *   "name": The exact original term as written in the source text (any language). Capitalized where appropriate.
    *   "translation": الترجمة العربية المقترحة المعتمدة للمصطلح (النقل الصوتي الصحيح للأسماء، والترجمة الدقيقة للمصطلحات).
    *   "description": وصف قصير جداً باللغة العربية (2-4 كلمات)، مثل: "البطل الرئيسي", "مهارة سيف", "طريقة زراعة", "طاقة روحية".
4.  Filtering & Exclusion (قواعد التصفية والاستبعاد):
    *   Ignore common words. Only specific names, places, unique cultivation terms, and key concepts should be extracted.
    *   Blacklist (تجاهل تام - لا تستخرج هذه أبداً):
        *   الأرقام المنفردة أو أرقام الفصول (مثال: 1, 500, Chapter 10, 第10章).
        *   عبارات النظام أو الإشعارات (مثال: Ding, System alert, Level Up).
        *   جمل التفاعل والإعلانات (مثال: Subscribe, Read at..., Translator notes).
        *   الأفعال والصفات العادية (مثال: run, fast, big, eat, go).
        *   الكلمات الشائعة جداً التي لا تعتبر مصطلحات خاصة.
5.  Accuracy (الدقة):
    *   Each extracted term must be unique (in its original language).
    *   Extracted terms must be meaningful within their context.
    *   إذا لم تجد مصطلحات جديدة حقيقية في الفصل أعد مصفوفة فارغة [] — هذا نجاح وليس فشلاً.

OUTPUT JSON STRUCTURE:
[
  { "category": "character", "name": "Fang Yuan", "translation": "فانغ يوان", "description": "البطل الرئيسي" },
  { "category": "concept", "name": "Immortal Gu", "translation": "غو الخالد", "description": "عنصر زراعة" },
  { "category": "location", "name": "Green Mountain Sect", "translation": "طائفة الجبل الأخضر", "description": "مقر الطائفة" }
]

RETURN ONLY JSON:

--- Source Text ---
${String(content || '').substring(0, 9000)}
--- نهاية النص الأصلي ---`;
}

/** استخراج مصفوفة المصطلحات من رد النموذج (متسامح مع backticks والزوائد — نفس منطق المترجم) */
function parseExtractedTerms(rawText) {
    let jsonText = String(rawText || '').trim();
    if (jsonText.startsWith('```json')) jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    else if (jsonText.startsWith('```')) jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    if (/^json\s*[\n\r]/i.test(jsonText)) jsonText = jsonText.replace(/^json\s*[\n\r]+/i, '');
    // 🔥 الأقوى: استخرج أول [ ] أو { } مباشرة
    const match = jsonText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (match) jsonText = match[1];
    const parsed = JSON.parse(jsonText);
    const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.terms) ? parsed.terms : []);
    const terms = [];
    const seen = new Set();
    for (const t of arr) {
        const name = String(t.name || t.term || '').trim();
        const translation = String(t.translation || '').trim();
        if (!name || !translation) continue;
        if (name.length > 80 || translation.length > 120) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        terms.push({
            name,
            translation,
            category: normalizeCategory(t.category),
            description: String(t.description || '').trim().substring(0, 160),
        });
    }
    return terms;
}

/** حفظ المصطلحات في المسرد (نفس upsert المترجم — فريد لكل novelId+term) */
async function saveExtractedTerms(novelId, terms) {
    let saved = 0;
    for (const t of terms) {
        try {
            await Glossary.updateOne(
                { novelId, term: t.name },
                {
                    $set: { translation: t.translation, category: t.category, description: t.description },
                    $setOnInsert: { autoGenerated: true }
                },
                { upsert: true }
            );
            saved++;
        } catch (e) { console.log('Glossary upsert error:', e.message); }
    }
    return saved;
}

async function pushLog(jobId, message, type) {
    try {
        await GlossaryExtractionJob.findByIdAndUpdate(jobId, {
            $push: { logs: { message, type: type || 'info' } },
            $set: { lastUpdate: new Date() }
        });
    } catch (e) { console.log('pushLog error:', e.message); }
}

// =========================================================
// 🔁 عامل الاستخراج — نفس دورة عامل المراجعة/الترجمة (مزوّدات/مفاتيح/استئناف)
// =========================================================
async function processGlossaryJob(jobId) {
    try {
        const job = await GlossaryExtractionJob.findById(jobId);
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

        // 🔥 نفس منطق المترجم: مزوّدات جديدة ← احتياطياً مفاتيح قديمة كمزوّد Gemini
        let providers = settings?.translationProviders && settings.translationProviders.length > 0
            ? settings.translationProviders.slice()
            : [];
        if (providers.length === 0) {
            const legacyKeys = settings?.translatorApiKeys || [];
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
            job.logs.push({ message: 'لا توجد مزوّدات ذكاء اصطناعي مفعّلة — أضف المفاتيح من إعدادات المترجم أولاً (المستخرج يستخدم نفس المزوّدات)', type: 'error' });
            await job.save();
            return;
        }
        providers.sort((a, b) => (a.priority || 0) - (b.priority || 0));

        const chaptersToProcess = (job.targetChapters || []).slice().sort((a, b) => a - b);

        // ⏱️ الفاصل بين الفصول — مضبوط من الواجهة (ثواني) ويُقرأ حياً من المهمة كل فصل
        const initialDelaySec = Math.max(0, Math.min(3600, Number(job.chapterDelayMs ?? 3000) / 1000));
        await pushLog(jobId, `📚 بدء استخراج المصطلحات: ${chaptersToProcess.length} فصلاً — المزوّد الأول ${providers[0].name || providers[0].providerId} | ⏱️ الفاصل بين الفصول: ${initialDelaySec} ثانية`, 'info');

        // 🔥 تفضيل المزوّد/التوكن الذي نجح في الفصل السابق (نفس سلوك المترجم)
        let stickySuccessRoute = null;

        for (const chapterNum of chaptersToProcess) {
            const freshJob = await GlossaryExtractionJob.findById(jobId);
            if (!freshJob || freshJob.status !== 'active') {
                if (freshJob && freshJob.status === 'paused') {
                    await pushLog(jobId, `⏸️ تم إيقاف الاستخراج مؤقتاً عند الفصل ${chapterNum}`, 'warning');
                }
                break;
            }

            // 1) جلب نص الفصل الأصلي من نفس مخزن المترجم
            let content = '';
            try {
                const docSnap = await firestore.collection('novels').doc(novel._id.toString())
                    .collection('chapters').doc(chapterNum.toString()).get();
                if (docSnap.exists) content = docSnap.data().content || '';
            } catch (fsErr) {
                console.log(`Firestore fetch error (glossary-extract) Ch ${chapterNum}:`, fsErr.message);
            }

            if (!content || content.trim().length === 0) {
                await pushLog(jobId, `تخطي الفصل ${chapterNum}: المحتوى غير موجود في السيرفر`, 'warning');
                await GlossaryExtractionJob.findByIdAndUpdate(jobId, {
                    $pull: { targetChapters: chapterNum },
                    $set: { currentChapter: chapterNum, lastUpdate: new Date() }
                });
                await delay(Math.max(0, Math.min(3600000, freshJob.chapterDelayMs ?? 3000)));
                continue;
            }

            // 2) استدعاء المستخرج (الذكاء الاصطناعي) — نفس منطق المزوّدات في المترجم حرفياً:
            //    Qwen = حسابات تلقائية + وسوم فشل + لا انتقال لمزوّد آخر أبداً.
            const prompt = buildExtractionPrompt(content, chapterNum);
            let extractedTerms = null;
            let lastErr = null;

            /** محاولة استخراج واحدة بتوكن محدد — تُعيد true عند النجاح */
            const attemptExtractWithToken = async (prov, model, key, keyIdx, keysCount) => {
                const provName = prov.name || prov.providerId;
                let raw = null;
                try {
                    await pushLog(jobId, `📚 استخراج مصطلحات الفصل ${chapterNum} عبر ${provName} | نموذج: ${model} | مفتاح ${keyIdx + 1}/${keysCount}`, 'info');
                    raw = await callTranslationProvider(prov, model, key, prompt, {
                        timeout: 300000,
                    });
                } catch (err) {
                    lastErr = err;
                    // 🔥 قاتل حلقة «نفس الحساب» — نفس وسوم المترجم:
                    // RateLimited → 24 ساعة، مصادقة → ميت، خطأ غير مصنّف → موسم 30 دقيقة
                    if (isQwenProvider(prov)) {
                        const v = qwenAutoAccount.markTokenFailure(key, err);
                        if (v === 'rate-limited-24h') {
                            await pushLog(jobId, `⏳ توكن Qwen مستهلك (RateLimited): وُسم 24 ساعة وسيُستبعد ويُستبدل بحساب جديد تلقائياً`, 'warning');
                        } else if (v === 'dead') {
                            await pushLog(jobId, `🔒 توكن Qwen غير صالح (فشل مصادقة): وُسم ميتاً وسيُستبعد`, 'warning');
                        } else if (v === 'limited-30m') {
                            await pushLog(jobId, `🧯 فشل غير مصنّف من حساب Qwen (${err.message}) — وُسم التوكن 30 دقيقة احتياطاً حتى لا يتكرر نفس الحساب في الحلقة`, 'warning');
                        }
                    }
                    console.error(`❌ glossary-extract provider fail (${provName}): ${err.message}`);
                    await pushLog(jobId, `⚠️ فشل الاستخراج عبر ${provName}: ${err.message}`, 'warning');
                    return false;
                }
                // تحليل الرد خارج فشل المزوّد — رد JSON تالف لا يوسم التوكن
                try {
                    const terms = parseExtractedTerms(raw);
                    extractedTerms = terms;
                    return true;
                } catch (_) {
                    lastErr = new Error('رد غير مفهوم من المستخرج (فشل تحليل JSON)');
                    await pushLog(jobId, `⚠️ رد غير مفهوم من ${provName} (فشل تحليل JSON) — إعادة المحاولة`, 'warning');
                    return false;
                }
            };

            const termsBox = { value: null };

            const orderedProviders = stickySuccessRoute
                ? [...providers.slice(stickySuccessRoute.providerIndex), ...providers.slice(0, stickySuccessRoute.providerIndex)]
                : providers;

            outer:
            for (const provider of orderedProviders) {
                if (termsBox.value) break;
                const providerIndex = providers.indexOf(provider);
                const providerName = provider.name || provider.providerId;
                const modelToUse = provider.selectedModel
                    || (provider.models && provider.models[0]?.modelId)
                    || 'gemini-2.5-flash';
                let keys = getProviderAuthKeys(provider);
                const isDeepSeek = isDeepSeekProvider(provider);
                const isQwen = isQwenProvider(provider);
                const isGeminiWeb = isGeminiWebProvider(provider);

                if (keys.length === 0 && !isDeepSeek && !isQwen && !isGeminiWeb) {
                    await pushLog(jobId, `⚠️ المزوّد ${providerName} ليس لديه مفاتيح – تخطيه`, 'warning');
                    continue;
                }
                if (isGeminiWeb && keys.length === 0) {
                    keys = [GUEST_TOKEN_SENTINEL];
                    await pushLog(jobId, `🟡 تنبيه — وضع الضيف: مزوّد Gemini Web "${providerName}" بلا كوكيز، سيعمل الاستخراج عبر الوصول المجهول`, 'warning');
                }
                if (isDeepSeek && keys.length === 0) {
                    keys = ['dummy-key-for-deepseek'];
                    await pushLog(jobId, `🔑 مزوّد DeepSeek: لا توجد توكنات محفوظة، سيتم استخدام الرمز الافتراضي من تطبيق DeepSeek`, 'info');
                }

                // 🔥🔥🔥 Qwen AUTO-ACCOUNT (Qwen فقط — نفس طريقة المترجم حرفياً) 🔥🔥🔥
                // استبعاد التوكنات المستهلكة/الميتة/المملوكة لمزوّد Qwen آخر، وإن لم يبقَ أي توكن
                // صالح يُنشأ حساب Qwen جديد تلقائياً (بريد مؤقت → تسجيل → تفعيل → توكن).
                if (isQwen) {
                    const usableTokens = qwenAutoAccount.filterUsableQwenTokens(keys, provider.providerId);
                    if (usableTokens.length < keys.length) {
                        await pushLog(jobId, `🧹 مزوّد Qwen: استبعاد ${keys.length - usableTokens.length} توكن (موسوم/ميت أو مملوك لمزوّد آخر)`, 'info');
                        keys = usableTokens;
                    }
                    if (keys.length === 0) {
                        await pushLog(jobId, `🤖 مزوّد Qwen: لا يوجد أي توكن صالح لهذا المزوّد — جاري تجهيز حساب Qwen خاص به (بريد مؤقت → تسجيل → تفعيل → توكن)...`, 'info');
                        try {
                            const { account, created } = await qwenAutoAccount.ensureQwenAccount(provider.providerId);
                            provider.qwenTokens = Array.isArray(provider.qwenTokens) ? provider.qwenTokens : [];
                            if (!provider.qwenTokens.includes(account.token)) provider.qwenTokens.push(account.token);
                            try { await qwenAutoAccount.persistProviderToken(provider.providerId, account.token); } catch (_) {}
                            keys = [account.token];
                            if (created) {
                                await pushLog(jobId, `✅ تم إنشاء حساب Qwen جديد خاص بهذا المزوّد (${account.email}) وسيبدأ الاستخراج عليه مباشرة`, 'success');
                            } else {
                                await pushLog(jobId, `♻️ إعادة استخدام الحساب التلقائي الصالح الخاص بهذا المزوّد (${account.email}) — لم يُنشأ حساب جديد`, 'info');
                            }
                        } catch (accErr) {
                            await pushLog(jobId, `❌ تعذر إنشاء حساب Qwen تلقائياً الآن: ${accErr.message} — لن ننتقل لمزوّد آخر، سيُعاد الاستخراج على Qwen عند الاستئناف`, 'warning');
                            break; // Qwen فقط: لا انتقال لمزوّد آخر أبداً
                        }
                    } else {
                        await pushLog(jobId, `🔑 مزوّد Qwen: سيتم استخدام ${keys.length} توكن صالح`, 'info');
                    }
                }

                // تفضيل التوكن الذي نجح في الفصل السابق (نفس المترجم)
                let preferredKeyIdx = 0;
                if (stickySuccessRoute && stickySuccessRoute.providerIndex === providerIndex && stickySuccessRoute.key) {
                    const ki = keys.indexOf(stickySuccessRoute.key);
                    preferredKeyIdx = ki >= 0 ? ki : 0;
                }
                const orderedKeyIndexes = [...Array(keys.length).keys()].slice(preferredKeyIdx).concat([...Array(keys.length).keys()].slice(0, preferredKeyIdx));

                for (const keyIdx of orderedKeyIndexes) {
                    const ok = await attemptExtractWithToken(provider, modelToUse, keys[keyIdx], keyIdx, keys.length);
                    if (ok) {
                        stickySuccessRoute = { providerIndex, key: keys[keyIdx] };
                        break outer;
                    }
                    if (termsBox.value) break outer;
                }

                // 🔥🔥🔥 Qwen: فشلت كل التوكنات → إنشاء حساب جديد فوراً ومتابعة على Qwen فقط 🔥🔥🔥
                if (!termsBox.value && isQwen) {
                    const AUTO_ROUNDS = 2;
                    for (let round = 1; round <= AUTO_ROUNDS && !termsBox.value; round++) {
                        await pushLog(jobId, `🤖 مزوّد Qwen: فشلت جميع التوكنات — إنشاء حساب Qwen جديد كلياً (جولة ${round}/${AUTO_ROUNDS}) ومتابعة الاستخراج على Qwen فقط`, 'info');
                        let account;
                        try {
                            const ensured = await qwenAutoAccount.ensureQwenAccount(provider.providerId, { forceNew: true });
                            account = ensured.account;
                        } catch (accErr) {
                            await pushLog(jobId, `❌ تعذر إنشاء حساب Qwen تلقائياً الآن: ${accErr.message} — لن ننتقل لمزوّد آخر، سيُعاد الاستخراج على Qwen عند الاستئناف`, 'warning');
                            break;
                        }
                        provider.qwenTokens = Array.isArray(provider.qwenTokens) ? provider.qwenTokens : [];
                        if (!provider.qwenTokens.includes(account.token)) provider.qwenTokens.push(account.token);
                        try { await qwenAutoAccount.persistProviderToken(provider.providerId, account.token); } catch (_) {}
                        keys.push(account.token);
                        await pushLog(jobId, `✅ حساب Qwen جديد كلياً جاهز (${account.email}) — إعادة استخراج الفصل ${chapterNum} بالتوكن الجديد`, 'success');

                        const autoKeyIdx = keys.length - 1;
                        for (let tokenAttempt = 1; tokenAttempt <= 2 && !termsBox.value; tokenAttempt++) {
                            const ok = await attemptExtractWithToken(provider, modelToUse, account.token, autoKeyIdx, keys.length);
                            if (ok) {
                                stickySuccessRoute = { providerIndex, key: account.token };
                                break outer;
                            }
                        }
                    }
                }

                if (!termsBox.value) {
                    await pushLog(jobId, `🚫 جميع مفاتيح ${providerName} فشلت`, 'warning');
                    // 🔥 Qwen فقط: لا انتقال إلى مزوّد آخر — الفصل يبقى معلقاً ويُعاد عند الاستئناف
                    if (isQwen) break;
                }
            }

            extractedTerms = termsBox.value;

            if (extractedTerms === null) {
                // لا نُفشل المهمة كلها — يبقى الفصل في قائمة الانتظار ويُعاد عند الاستئناف
                await pushLog(jobId, `❌ تعذر استخراج مصطلحات الفصل ${chapterNum} عبر كل المزوّدات (${lastErr?.message || 'خطأ غير معروف'}) — سيُعاد عند الاستئناف`, 'error');
                break;
            }

            // 3) حفظ المصطلحات في المسرد
            if (extractedTerms.length === 0) {
                await pushLog(jobId, `✅ الفصل ${chapterNum}: لا مصطلحات جديدة (فصل حواري/خالٍ من الأسماء)`, 'success');
            } else {
                const savedCount = await saveExtractedTerms(novel._id, extractedTerms);
                const catSummary = extractedTerms.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + 1; return acc; }, {});
                const catText = Object.entries(catSummary).map(([c, n]) => `${CATEGORY_LABELS[c] || c}: ${n}`).join('، ');
                await pushLog(jobId, `✅ الفصل ${chapterNum}: استُخرج ${extractedTerms.length} مصطلحاً وحُفظ ${savedCount} في المسرد (${catText})`, 'success');
            }

            await GlossaryExtractionJob.findByIdAndUpdate(jobId, {
                $inc: { processedCount: 1, newTermsCount: extractedTerms.length },
                $pull: { targetChapters: chapterNum },
                $set: { currentChapter: chapterNum, lastUpdate: new Date() }
            });

            // ⏱️ الفاصل بين الفصول — يُقرأ حياً من المهمة حتى يسري تغييره من الواجهة فوراً
            const postJob = await GlossaryExtractionJob.findById(jobId).select('chapterDelayMs');
            await delay(Math.max(0, Math.min(3600000, postJob?.chapterDelayMs ?? 3000)));
        }

        // النهاية: إن لم تبق فصول مستهدفة والمهمة لا تزال نشطة → مكتملة
        const finalJob = await GlossaryExtractionJob.findById(jobId);
        if (finalJob && finalJob.status === 'active') {
            const remaining = (finalJob.targetChapters || []).length;
            if (remaining === 0) {
                await GlossaryExtractionJob.findByIdAndUpdate(jobId, { status: 'completed' });
                await pushLog(jobId, `🏁 اكتمل استخراج المصطلحات! فصول معالجة: ${finalJob.processedCount} — مجموع المصطلحات: ${finalJob.newTermsCount}. المسرد جاهز الآن لتوزيع الترجمة على مهام متعددة`, 'success');
            } else {
                await pushLog(jobId, `⏳ توقف الاستخراج مع ${remaining} فصلاً لم يُعالج بعد (استئناف متاح)`, 'warning');
            }
        }
    } catch (err) {
        console.error('Glossary Extraction Job Error:', err);
        try {
            await GlossaryExtractionJob.findByIdAndUpdate(jobId, { status: 'failed' });
            await pushLog(jobId, `❌ خطأ قاتل في المهمة: ${err.message}`, 'error');
        } catch (_) { /* ignore */ }
    }
}

// ⏱️ تحويل قيمة الفاصل من الواجهة (ثواني) إلى ملي ثانية مع تحقق صارم — null إن كانت غير صالحة
function parseChapterDelaySeconds(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 3600) return null;
    return Math.round(n * 1000);
}

// =========================================================
// 🔗 المسارات — /api/glossary-ai/* (نفس واجهة المراجع حرفياً)
// =========================================================
module.exports = function (app, verifyToken, verifyAdmin) {

    // 1) روايات الاستخراج — نفس نداء المراجع حرفياً (نفس واجهة اختيار الرواية)
    app.get('/api/glossary-ai/novels', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const { search, page = 1, limit = 20 } = req.query;
            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            const skip = (pageNum - 1) * limitNum;
            let query = {};
            if (search) query.title = { $regex: search, $options: 'i' };
            const novels = await Novel.aggregate([
                { $match: query },
                {
                    $project: {
                        _id: 1, title: 1, cover: 1, author: 1, status: 1, createdAt: 1,
                        chaptersCount: {
                            $ifNull: ["$sourceChaptersCount", { $size: { $ifNull: ["$chapters", []] } }]
                        }
                    }
                },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: limitNum }
            ]);
            res.json(novels);
        } catch (e) {
            console.error("Glossary AI Novels Error:", e);
            res.status(500).json({ error: e.message });
        }
    });

    // 2) بدء مهمة استخراج (أو استئناف ب jobId) — يقبل chapterDelay بالثواني
    app.post('/api/glossary-ai/start', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const { novelId, chapters, jobId, chapterDelay } = req.body;

            if (jobId) {
                const existingJob = await GlossaryExtractionJob.findById(jobId);
                if (!existingJob) return res.status(404).json({ message: "Job not found" });
                if ((existingJob.targetChapters || []).length === 0) {
                    return res.status(400).json({ message: "لا توجد فصول متبقية في هذه المهمة" });
                }
                const delayMs = parseChapterDelaySeconds(chapterDelay);
                if (delayMs !== null) existingJob.chapterDelayMs = delayMs;
                existingJob.status = 'active';
                existingJob.logs.push({ message: '▶️ تم استئناف مهمة استخراج المصطلحات' + (delayMs !== null ? ` | ⏱️ الفاصل: ${delayMs / 1000} ثانية` : ''), type: 'info' });
                await existingJob.save();
                processGlossaryJob(existingJob._id);
                return res.json({ message: "Job resumed", jobId: existingJob._id });
            }

            const novel = await Novel.findById(novelId);
            if (!novel) return res.status(404).json({ message: "Novel not found" });

            const settings = await getGlobalSettings();
            const providers = settings?.translationProviders || [];
            const anyKeys = providers.some(p => (p.apiKeys && p.apiKeys.length > 0) || isDeepSeekProvider(p) || isQwenProvider(p) || isGeminiWebProvider(p));
            const legacyKeys = settings?.translatorApiKeys || [];
            if (!anyKeys && legacyKeys.length === 0) {
                return res.status(400).json({ message: "لا توجد مزوّدات ذكاء اصطناعي — أضف المفاتيح من إعدادات المترجم أولاً" });
            }

            let targetChapters = [];
            if (chapters === 'all' || chapters === undefined || chapters === null) {
                const mongoChapters = (novel.chapters || []).map(c => c.number);
                let firestoreChapters = [];
                if (firestore) {
                    try {
                        const snapshot = await firestore.collection('novels').doc(novel._id.toString()).collection('chapters').get();
                        firestoreChapters = snapshot.docs.map(doc => parseInt(doc.id)).filter(num => !isNaN(num));
                    } catch (err) {
                        console.error("Failed to fetch chapters from Firestore (glossary-ai):", err.message);
                    }
                }
                targetChapters = Array.from(new Set([...mongoChapters, ...firestoreChapters])).sort((a, b) => a - b);
            } else if (Array.isArray(chapters)) {
                targetChapters = chapters.map(n => parseInt(n)).filter(n => !isNaN(n));
            }

            if (targetChapters.length === 0) {
                return res.status(400).json({ message: "لا توجد فصول لاستخراج مصطلحاتها" });
            }

            const delayMs = parseChapterDelaySeconds(chapterDelay);
            const effectiveDelayMs = delayMs === null ? 3000 : delayMs;

            const job = new GlossaryExtractionJob({
                novelId,
                novelTitle: novel.title,
                cover: novel.cover,
                targetChapters,
                totalToExtract: targetChapters.length,
                chapterDelayMs: effectiveDelayMs,
                logs: [{ message: `تم بدء استخراج مصطلحات «${novel.title}» (استهداف ${targetChapters.length} فصلاً) | ⏱️ الفاصل بين الفصول: ${effectiveDelayMs / 1000} ثانية`, type: 'info' }]
            });
            await job.save();
            processGlossaryJob(job._id);
            res.json({ message: "Glossary extraction started", jobId: job._id });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 3) إيقاف مؤقت
    app.post('/api/glossary-ai/jobs/:id/pause', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const job = await GlossaryExtractionJob.findById(req.params.id);
            if (!job) return res.status(404).json({ message: "Job not found" });
            job.status = 'paused';
            job.logs.push({ message: '⏸️ طلب إيقاف مؤقت من المستخدم...', type: 'warning' });
            await job.save();
            res.json({ message: "Job paused" });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 4) حذف المهمة
    app.delete('/api/glossary-ai/jobs/:id', verifyToken, verifyAdmin, async (req, res) => {
        try {
            await GlossaryExtractionJob.findByIdAndDelete(req.params.id);
            res.json({ message: "Job deleted" });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 4.5) ⏱️ تغيير الفاصل بين الفصول لمهمة جارية (يتأثر من الفصل التالي فوراً)
    app.post('/api/glossary-ai/jobs/:id/delay', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const delayMs = parseChapterDelaySeconds(req.body?.seconds);
            if (delayMs === null) {
                return res.status(400).json({ message: "قيمة فاصل غير صالحة — أدخل عدد ثوانٍ بين 0 و 3600" });
            }
            const job = await GlossaryExtractionJob.findByIdAndUpdate(
                req.params.id,
                {
                    $set: { chapterDelayMs: delayMs, lastUpdate: new Date() },
                    $push: { logs: { message: `⏱️ تم تغيير الفاصل بين الفصول إلى ${delayMs / 1000} ثانية`, type: 'info' } }
                },
                { new: true }
            );
            if (!job) return res.status(404).json({ message: "Job not found" });
            res.json({ message: "Delay updated", chapterDelayMs: job.chapterDelayMs });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 5) قائمة المهام (بدون سجلات/تفاصيل — مثل المراجع)
    app.get('/api/glossary-ai/jobs', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const jobs = await GlossaryExtractionJob.find()
                .select('novelTitle cover status processedCount newTermsCount totalToExtract startTime')
                .sort({ updatedAt: -1 })
                .limit(20);
            const uiJobs = jobs.map(j => ({
                id: j._id,
                novelTitle: j.novelTitle,
                cover: j.cover,
                status: j.status,
                processed: j.processedCount,
                newTerms: j.newTermsCount,
                total: j.totalToExtract,
                startTime: j.startTime
            }));
            res.json(uiJobs);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 6) تفاصيل مهمة (مع السجل الحي)
    app.get('/api/glossary-ai/jobs/:id', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const job = await GlossaryExtractionJob.findById(req.params.id);
            if (!job) return res.status(404).json({ message: "Job not found" });
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
};
