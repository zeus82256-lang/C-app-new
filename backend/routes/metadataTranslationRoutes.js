// routes/metadataTranslationRoutes.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const MetadataTranslationJob = require('../models/metadataTranslationJob.model.js');
const Novel = require('../models/novel.model.js');

// استيراد الدوال المساعدة من adminRoutes.js (التي سيتم تصديرها)
const { logScraper, getGlobalSettings } = require('./adminRoutes');

// 🔥 Helper to update metadata translation job
async function updateMetadataJob(jobId, status, message, type) {
    try {
        if (!jobId) return;
        const update = { status, lastUpdate: new Date() };
        if (message) {
            update.$push = { logs: { message, type, timestamp: new Date() } };
        }
        if (status === 'completed' || status === 'failed') {
            update.processedCount = 3; // all steps done
        }
        await MetadataTranslationJob.findByIdAndUpdate(jobId, update);
    } catch (e) {
        console.error("Error updating metadata job:", e);
    }
}

// 🔥 Translate novel metadata using Gemini with key rotation (same as translator)
async function translateNovelMetadata(novelId, originalData, jobId = null) {
    try {
        const settings = await getGlobalSettings();
        const apiKeys = settings.translatorApiKeys || [];
        const selectedModel = settings.translatorModel || 'gemini-1.5-flash';
        
        if (!apiKeys.length) {
            const msg = `⚠️ لا توجد مفاتيح API للترجمة، لن يتم ترجمة البيانات الوصفية للرواية ${originalData.title}`;
            await logScraper(msg, 'warning');
            if (jobId) await updateMetadataJob(jobId, 'failed', msg, 'error');
            return;
        }

        let availableCategories = settings.managedCategories || [];
        if (!availableCategories.length) {
            availableCategories = [
                'أكشن', 'رومانسي', 'فانتازيا', 'شيانشيا', 'شوانهوان', 'وشيا',
                'مغامرات', 'نظام', 'حريم', 'رعب', 'خيال علمي', 'دراما', 'غموض', 'تاريخي'
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
1. ترجمة العنوان إلى العربية.
2. ترجمة الوصف إلى العربية (إذا كان موجوداً).
3. استخرج التصنيفات المناسبة من القائمة المتاحة (${categoriesListStr}) بناءً على التصنيفات الأصلية (tags) المذكورة أعلاه. لا تخرج تصنيفات غير موجودة في القائمة. أعد قائمة بأسماء التصنيفات المطابقة فقط.

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

        // تدوير المفاتيح وإعادة المحاولة
        let attempt = 0;
        let keyIndex = 0;
        let lastError = null;
        let parsed = null;
        const maxAttempts = 3;

        while (attempt < maxAttempts && !parsed) {
            try {
                const currentKey = apiKeys[keyIndex % apiKeys.length];
                const genAI = new GoogleGenerativeAI(currentKey);
                const model = genAI.getGenerativeModel({ model: selectedModel });
                
                const result = await model.generateContent(prompt);
                const response = await result.response;
                let jsonText = response.text().trim();
                
                if (jsonText.startsWith("```json")) {
                    jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
                } else if (jsonText.startsWith("```")) {
                    jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
                }

                parsed = JSON.parse(jsonText);
                break;
            } catch (err) {
                lastError = err;
                if (err.message.includes('429') || err.message.includes('quota')) {
                    keyIndex++;
                    attempt++;
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue;
                }
                throw err;
            }
        }

        if (!parsed) throw lastError || new Error('Failed after retries');

        if (jobId) await updateMetadataJob(jobId, 'active', 'تم استلام الرد من الذكاء الاصطناعي', 'info');

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
            await logScraper(`ℹ️ لم يتم العثور على بيانات جديدة لتحديثها للرواية ${originalData.title}`, 'info');
            if (jobId) await updateMetadataJob(jobId, 'completed', 'ℹ️ لم يتم العثور على بيانات جديدة لتحديثها', 'info');
        }
        
    } catch (error) {
        console.error("Metadata translation error:", error);
        await logScraper(`❌ فشل ترجمة البيانات الوصفية للرواية ${originalData.title}: ${error.message}`, 'error');
        if (jobId) await updateMetadataJob(jobId, 'failed', `❌ فشل الترجمة: ${error.message}`, 'error');
    }
}

module.exports = function(app, verifyToken, verifyAdmin) {

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
};