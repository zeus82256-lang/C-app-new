‏const mongoose = require('mongoose');
‏const path = require('path');
‏const AdmZip = require('adm-zip');
‏const jwt = require('jsonwebtoken'); // Required for manual token verification in export
‏const { GoogleGenerativeAI } = require("@google/generative-ai"); // 🔥 NEW: Required for metadata translation

‏// --- Config Imports ---
‏let firestore, cloudinary;
‏try {
‏    const firebaseAdmin = require('../config/firebaseAdmin');
‏    firestore = firebaseAdmin.db;
‏    cloudinary = require('../config/cloudinary');
‏} catch (e) {
‏    console.warn("⚠️ Config files check failed in admin routes...");
}

‏// Models
‏const User = require('../models/user.model.js');
‏const Novel = require('../models/novel.model.js');
‏const NovelLibrary = require('../models/novelLibrary.model.js'); 
‏const Settings = require('../models/settings.model.js');
‏const Comment = require('../models/comment.model.js');
‏const ChapterScraperJob = require('../models/chapterScraperJob.model.js'); // 🔥 NEW MODEL
‏const MetadataTranslationJob = require('../models/metadataTranslationJob.model.js'); // 🔥 NEW MODEL

‏// 🔥 MODEL FOR SCRAPER LOGS
‏const ScraperLogSchema = new mongoose.Schema({
‏    message: String,
‏    type: { type: String, default: 'info' }, 
‏    timestamp: { type: Date, default: Date.now }
});
‏if (mongoose.models.ScraperLog) delete mongoose.models.ScraperLog;
‏const ScraperLog = mongoose.model('ScraperLog', ScraperLogSchema);

‏async function logScraper(message, type = 'info') {
‏    try {
‏        console.log(`[Scraper Log] ${message}`);
‏        await ScraperLog.create({ message, type, timestamp: new Date() });
‏        const count = await ScraperLog.countDocuments();
‏        if (count > 100) {
‏            const first = await ScraperLog.findOne().sort({ timestamp: 1 });
‏            if (first) await ScraperLog.deleteOne({ _id: first._id });
        }
‏    } catch (e) {
‏        console.error("Log error", e);
    }
}

‏// 🔥 Helper to update metadata translation job
‏async function updateMetadataJob(jobId, status, message, type) {
‏    try {
‏        if (!jobId) return;
‏        const update = { status, lastUpdate: new Date() };
‏        if (message) {
‏            update.$push = { logs: { message, type, timestamp: new Date() } };
        }
‏        if (status === 'completed' || status === 'failed') {
‏            update.processedCount = 3; // all steps done
        }
‏        await MetadataTranslationJob.findByIdAndUpdate(jobId, update);
‏    } catch (e) {
‏        console.error("Error updating metadata job:", e);
    }
}

‏// 🔥 NEW: Translate novel metadata (title, description, tags) using Gemini (same as translator)
‏async function translateNovelMetadata(novelId, originalData, jobId = null) {
‏    try {
‏        // 1. Get translation settings (same as translator)
‏        const settings = await getGlobalSettings();
‏        const apiKeys = settings.translatorApiKeys || [];
‏        const selectedModel = settings.translatorModel || 'gemini-2.5-flash';
        
‏        if (!apiKeys.length) {
‏            const msg = `⚠️ لا توجد مفاتيح API للترجمة، لن يتم ترجمة البيانات الوصفية للرواية ${originalData.title}`;
‏            await logScraper(msg, 'warning');
‏            if (jobId) await updateMetadataJob(jobId, 'failed', msg, 'error');
‏            return;
        }

‏        // 2. Get available categories from settings or fallback
‏        let availableCategories = settings.managedCategories || [];
‏        if (!availableCategories.length) {
‏            // Fallback to hardcoded categories if not set
‏            availableCategories = [
                'أكشن', 'رومانسي', 'فانتازيا', 'شيانشيا', 'شوانهوان', 'وشيا',
                'مغامرات', 'نظام', 'حريم', 'رعب', 'خيال علمي', 'دراما', 'غموض', 'تاريخي'
            ];
        }
‏        const categoriesListStr = availableCategories.join('، ');

‏        // 3. Prepare prompt for Gemini
‏        const prompt = `
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
‏  "arabicTitle": "العنوان المترجم",
‏  "arabicDescription": "الوصف المترجم",
‏  "matchedCategories": ["تصنيف1", "تصنيف2"]
}

إذا لم يتم العثور على تصنيفات مطابقة، أعد مصفوفة فارغة.
لا تضف أي نصوص خارج JSON.
`;

‏        if (jobId) await updateMetadataJob(jobId, 'active', 'جاري ترجمة البيانات...', 'info');

‏        // 4. Call Gemini (same logic as translator)
‏        const keyIndex = 0; // simple round-robin not needed
‏        const genAI = new GoogleGenerativeAI(apiKeys[keyIndex % apiKeys.length]);
‏        const model = genAI.getGenerativeModel({ model: selectedModel });
        
‏        const result = await model.generateContent(prompt);
‏        const response = await result.response;
‏        let jsonText = response.text().trim();
        
‏        if (jobId) await updateMetadataJob(jobId, 'active', 'تم استلام الرد من الذكاء الاصطناعي', 'info');

‏        // Clean JSON if needed
‏        if (jsonText.startsWith("```json")) {
‏            jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
‏        } else if (jsonText.startsWith("```")) {
‏            jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

‏        const parsed = JSON.parse(jsonText);
        
‏        // 5. Update novel in MongoDB
‏        const updateData = {};
‏        if (parsed.arabicTitle && parsed.arabicTitle.trim()) {
‏            updateData.title = parsed.arabicTitle;
‏            if (jobId) await updateMetadataJob(jobId, 'active', `✅ تم ترجمة العنوان إلى: ${parsed.arabicTitle}`, 'success');
        }
‏        if (parsed.arabicDescription && parsed.arabicDescription.trim()) {
‏            updateData.description = parsed.arabicDescription;
‏            if (jobId) await updateMetadataJob(jobId, 'active', '✅ تم ترجمة الوصف', 'success');
        }
‏        if (parsed.matchedCategories && Array.isArray(parsed.matchedCategories) && parsed.matchedCategories.length > 0) {
‏            updateData.tags = parsed.matchedCategories;
‏            if (parsed.matchedCategories[0]) {
‏                updateData.category = parsed.matchedCategories[0];
            }
‏            if (jobId) await updateMetadataJob(jobId, 'active', `✅ تم تحديث التصنيفات إلى: ${parsed.matchedCategories.join(', ')}`, 'success');
        }
        
‏        if (Object.keys(updateData).length > 0) {
‏            await Novel.updateOne({ _id: novelId }, { $set: updateData });
‏            await logScraper(`✅ تم تحديث البيانات الوصفية للرواية: العنوان: ${parsed.arabicTitle || originalData.title}`, 'success');
‏            if (jobId) await updateMetadataJob(jobId, 'completed', '🏁 اكتملت ترجمة البيانات بنجاح', 'success');
‏        } else {
‏            await logScraper(`ℹ️ لم يتم العثور على بيانات جديدة لتحديثها للرواية ${originalData.title}`, 'info');
‏            if (jobId) await updateMetadataJob(jobId, 'completed', 'ℹ️ لم يتم العثور على بيانات جديدة لتحديثها', 'info');
        }
        
‏    } catch (error) {
‏        console.error("Metadata translation error:", error);
‏        await logScraper(`❌ فشل ترجمة البيانات الوصفية للرواية ${originalData.title}: ${error.message}`, 'error');
‏        if (jobId) await updateMetadataJob(jobId, 'failed', `❌ فشل الترجمة: ${error.message}`, 'error');
    }
}

‏// Helper to escape regex special characters
‏function escapeRegExp(string) {
‏  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

‏// 🔥 Helper to get GLOBAL Settings (Singleton)
‏async function getGlobalSettings() {
‏    let settings = await Settings.findOne();
‏    if (!settings) {
‏        settings = new Settings({});
‏        await settings.save();
    }
‏    return settings;
}

‏// 🔥🔥 WORKER FUNCTION FOR TITLE EXTRACTION (BACKGROUND) 🔥🔥
‏async function processTitleExtractionJob(jobId) {
‏    try {
‏        const job = await ChapterScraperJob.findById(jobId);
‏        if (!job || job.status !== 'active') return;

‏        if (!firestore) {
‏            job.status = 'failed';
‏            job.logs.push({ message: "Firestore not connected", type: 'error' });
‏            await job.save();
‏            return;
        }

‏        const novel = await Novel.findById(job.novelId);
‏        if (!novel) {
‏            job.status = 'failed';
‏            job.logs.push({ message: "الرواية غير موجودة", type: 'error' });
‏            await job.save();
‏            return;
        }

‏        // Sort chapters
‏        const chapters = novel.chapters.sort((a, b) => a.number - b.number);
‏        let updatedCount = 0;

‏        for (let i = 0; i < chapters.length; i++) {
‏            const chapter = chapters[i];
            
‏            // Check if job was cancelled externally
‏            const freshJob = await ChapterScraperJob.findById(jobId);
‏            if (!freshJob) break; 

‏            try {
‏                // Fetch content from Firestore
‏                const docRef = firestore.collection('novels').doc(novel._id.toString()).collection('chapters').doc(chapter.number.toString());
‏                const docSnap = await docRef.get();

‏                if (docSnap.exists) {
‏                    const content = docSnap.data().content || "";
                    
‏                    const lines = content.split('\n');
‏                    let firstLine = "";
‏                    for (const line of lines) {
‏                        if (line.trim().length > 0) {
‏                            firstLine = line.trim();
‏                            break;
                        }
                    }

‏                    // Check regex: Contains "Chapter" or "الفصل" AND has a colon ":"
‏                    if (firstLine && (firstLine.includes('الفصل') || firstLine.includes('Chapter')) && firstLine.includes(':')) {
‏                        const parts = firstLine.split(':');
‏                        if (parts.length > 1) {
‏                            const newTitle = parts.slice(1).join(':').trim();
                            
‏                            if (newTitle && newTitle !== chapter.title) {
‏                                // Update Mongo
‏                                await Novel.updateOne(
‏                                    { _id: novel._id, "chapters.number": chapter.number },
‏                                    { $set: { "chapters.$.title": newTitle } }
                                );
                                
‏                                // Update Firestore
‏                                await docRef.update({ title: newTitle });

‏                                updatedCount++;
                                
‏                                // Log update to Job
‏                                await ChapterScraperJob.findByIdAndUpdate(jobId, {
‏                                    $push: { logs: { message: `✅ فصل ${chapter.number}: تم التحديث إلى "${newTitle}"`, type: 'success' } }
                                });
                            }
                        }
                    }
                }
‏            } catch (err) {
‏                // Log error but continue
‏                 await ChapterScraperJob.findByIdAndUpdate(jobId, {
‏                    $push: { logs: { message: `❌ خطأ في فصل ${chapter.number}: ${err.message}`, type: 'error' } }
                });
            }

‏            // Update Progress
‏            await ChapterScraperJob.findByIdAndUpdate(jobId, {
‏                processedCount: i + 1,
‏                lastUpdate: new Date()
            });
            
‏            // Artificial delay to not choke DB
‏            await new Promise(r => setTimeout(r, 100));
        }

‏        await ChapterScraperJob.findByIdAndUpdate(jobId, {
‏            status: 'completed',
‏            $push: { logs: { message: `🏁 اكتملت المهمة. تم تحديث ${updatedCount} عنوان.`, type: 'success' } }
        });

‏    } catch (e) {
‏        console.error(e);
‏        await ChapterScraperJob.findByIdAndUpdate(jobId, {
‏            status: 'failed',
‏            $push: { logs: { message: `❌ خطأ فادح: ${e.message}`, type: 'error' } }
        });
    }
}

‏module.exports = function(app, verifyToken, verifyAdmin, upload) {

    // =========================================================
‏    // 🛠️ TOOLS API (JOB BASED TITLE EXTRACTOR)
    // =========================================================
    
‏    // 1. Get Jobs
‏    app.get('/api/admin/tools/extract-titles/jobs', verifyAdmin, async (req, res) => {
‏        try {
‏            const jobs = await ChapterScraperJob.find().sort({ createdAt: -1 }).limit(20);
‏            res.json(jobs);
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

‏    // 2. Start Job
‏    app.post('/api/admin/tools/extract-titles/start', verifyAdmin, async (req, res) => {
‏        try {
‏            const { novelId } = req.body;
‏            if (!novelId) return res.status(400).json({ message: "Novel ID required" });

‏            const novel = await Novel.findById(novelId);
‏            if (!novel) return res.status(404).json({ message: "Novel not found" });

‏            const job = new ChapterScraperJob({
‏                novelId: novel._id,
‏                novelTitle: novel.title,
‏                cover: novel.cover,
‏                totalChapters: novel.chapters.length,
‏                logs: [{ message: '🚀 تم بدء مهمة استخراج العناوين...', type: 'info' }]
            });

‏            await job.save();

‏            // 🔥 Start Worker in Background (No await)
‏            processTitleExtractionJob(job._id);

‏            res.json({ success: true, message: "تم بدء المهمة في الخلفية", jobId: job._id });

‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

‏    // 3. Get Job Detail
‏    app.get('/api/admin/tools/extract-titles/jobs/:id', verifyAdmin, async (req, res) => {
‏        try {
‏            const job = await ChapterScraperJob.findById(req.params.id);
‏            res.json(job);
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

‏    // 4. Delete Job
‏    app.delete('/api/admin/tools/extract-titles/jobs/:id', verifyAdmin, async (req, res) => {
‏        try {
‏            await ChapterScraperJob.findByIdAndDelete(req.params.id);
‏            res.json({ success: true });
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });


    // =========================================================
‏    // 📂 CATEGORY MANAGEMENT API (GLOBAL)
    // =========================================================
    
‏    // Add New Category to Master List
‏    app.post('/api/admin/categories', verifyAdmin, async (req, res) => {
‏        try {
‏            const { category } = req.body;
‏            if (!category) return res.status(400).json({ message: "Category name required" });

‏            let settings = await getGlobalSettings();

‏            if (!settings.managedCategories) settings.managedCategories = [];
            
‏            if (!settings.managedCategories.includes(category)) {
‏                settings.managedCategories.push(category);
‏                await settings.save();
            }
            
‏            res.json({ message: "Category added", list: settings.managedCategories });
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

‏    // Delete Category (Remove from Master List + Remove from ALL Novels)
‏    app.delete('/api/admin/categories/:name', verifyAdmin, async (req, res) => {
‏        try {
‏            const categoryName = decodeURIComponent(req.params.name);
            
‏            // 1. Remove from Admin Settings (GLOBAL)
‏            let settings = await getGlobalSettings();
‏            if (settings && settings.managedCategories) {
‏                settings.managedCategories = settings.managedCategories.filter(c => c !== categoryName);
‏                await settings.save();
            }

‏            // 2. Remove from Novels (Tags array)
‏            await Novel.updateMany(
‏                { tags: categoryName },
‏                { $pull: { tags: categoryName } }
            );

‏            // 3. Reset Main Category if matched
‏            await Novel.updateMany(
‏                { category: categoryName },
‏                { $set: { category: 'أخرى' } }
            );

‏            res.json({ message: "Category deleted permanently" });
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================
‏    // 🧹 GLOBAL CLEANER API
    // =========================================================
    
‏    // Get Blacklist
‏    app.get('/api/admin/cleaner', verifyAdmin, async (req, res) => {
‏        try {
‏            let settings = await getGlobalSettings();
‏            res.json(settings.globalBlocklist || []);
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

‏    // Add Word & Execute Clean
‏    app.post('/api/admin/cleaner', verifyAdmin, async (req, res) => {
‏        try {
‏            const { word } = req.body; 
‏            if (!word) return res.status(400).json({ message: "Word required" });

‏            // 1. Save to Blacklist (GLOBAL)
‏            let settings = await getGlobalSettings();
            
‏            if (!settings.globalBlocklist.includes(word)) {
‏                settings.globalBlocklist.push(word);
‏                await settings.save();
            }

‏            // 2. Execute Cleanup on ALL Novels (Batch Job)
‏            let updatedCount = 0;

‏            if (firestore) {
‏                const novelsSnapshot = await firestore.collection('novels').get();
‏                const batchPromises = [];

‏                novelsSnapshot.forEach(doc => {
‏                    const novelId = doc.id;
‏                    const p = firestore.collection('novels').doc(novelId).collection('chapters').get().then(chaptersSnap => {
‏                        chaptersSnap.forEach(chapDoc => {
‏                            let content = chapDoc.data().content || "";
‏                            let modified = false;

‏                            if (word.includes('\n') || word.includes('\r')) {
‏                                // --- BLOCK REMOVAL MODE ---
‏                                if (content.includes(word)) {
‏                                    content = content.split(word).join('');
‏                                    modified = true;
                                }
‏                            } else {
‏                                // --- KEYWORD LINE REMOVAL MODE ---
‏                                const escapedKeyword = escapeRegExp(word);
‏                                const regex = new RegExp(`^.*${escapedKeyword}.*$`, 'gm');
                                
‏                                if (regex.test(content)) {
‏                                    content = content.replace(regex, '');
‏                                    modified = true;
                                }
                            }

‏                            if (modified) {
‏                                content = content.replace(/^\s*[\r\n]/gm, ''); // Clean empty lines
‏                                chapDoc.ref.update({ content: content });
‏                                updatedCount++;
                            }
                        });
                    });
‏                    batchPromises.push(p);
                });
‏                await Promise.all(batchPromises);
            }

‏            res.json({ message: "Cleanup executed", updatedCount });
‏        } catch (e) {
‏            console.error(e);
‏            res.status(500).json({ error: e.message });
        }
    });

‏    // Update Word (Remove old, Add new, Clean new)
‏    app.put('/api/admin/cleaner/:index', verifyAdmin, async (req, res) => {
‏        try {
‏            const index = parseInt(req.params.index);
‏            const { word } = req.body;
            
‏            let settings = await getGlobalSettings();
‏            if (settings && settings.globalBlocklist[index]) {
‏                settings.globalBlocklist[index] = word;
‏                await settings.save();
                
‏                // Re-run cleaner for the new word (Batch)
‏                if (firestore) {
‏                    const novelsSnapshot = await firestore.collection('novels').get();
‏                    const batchPromises = [];
‏                    novelsSnapshot.forEach(doc => {
‏                        const p = firestore.collection('novels').doc(doc.id).collection('chapters').get().then(chaptersSnap => {
‏                            chaptersSnap.forEach(chapDoc => {
‏                                let content = chapDoc.data().content || "";
‏                                let modified = false;

‏                                if (word.includes('\n') || word.includes('\r')) {
‏                                    if (content.includes(word)) {
‏                                        content = content.split(word).join('');
‏                                        modified = true;
                                    }
‏                                } else {
‏                                    const escapedKeyword = escapeRegExp(word);
‏                                    const regex = new RegExp(`^.*${escapedKeyword}.*$`, 'gm');
‏                                    if (regex.test(content)) {
‏                                        content = content.replace(regex, '');
‏                                        modified = true;
                                    }
                                }

‏                                if (modified) {
‏                                    content = content.replace(/^\s*[\r\n]/gm, '');
‏                                    chapDoc.ref.update({ content: content });
                                }
                            });
                        });
‏                        batchPromises.push(p);
                    });
‏                    await Promise.all(batchPromises);
                }
            }
‏            res.json({ message: "Updated and executed" });
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

‏    // Delete Word from Blacklist
‏    app.delete('/api/admin/cleaner/:word', verifyAdmin, async (req, res) => {
‏        try {
‏            const word = decodeURIComponent(req.params.word);
‏            let settings = await getGlobalSettings();
‏            if (settings) {
‏                settings.globalBlocklist = settings.globalBlocklist.filter(w => w !== word);
‏                await settings.save();
            }
‏            res.json({ message: "Removed from list" });
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================
‏    // 🔄 GLOBAL REPLACEMENTS API (SERVER-SIDE)
    // =========================================================

‏    // Get Replacements
‏    app.get('/api/admin/global-replacements', verifyAdmin, async (req, res) => {
‏        try {
‏            let settings = await getGlobalSettings();
‏            res.json(settings.globalReplacements || []);
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

‏    // Add Replacement
‏    app.post('/api/admin/global-replacements', verifyAdmin, async (req, res) => {
‏        try {
‏            const { original, replacement } = req.body;
‏            if (!original) return res.status(400).json({ message: "Original word required" });

‏            let settings = await getGlobalSettings();
‏            if (!settings.globalReplacements) settings.globalReplacements = [];

‏            settings.globalReplacements.push({ original, replacement: replacement || '' });
‏            await settings.save();

‏            res.json({ message: "Replacement added", list: settings.globalReplacements });
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

‏    // Update Replacement
‏    app.put('/api/admin/global-replacements/:id', verifyAdmin, async (req, res) => {
‏        try {
‏            const { original, replacement } = req.body;
‏            let settings = await getGlobalSettings();
            
‏            const item = settings.globalReplacements.id(req.params.id);
‏            if (!item) return res.status(404).json({ message: "Item not found" });

‏            if (original) item.original = original;
‏            if (replacement !== undefined) item.replacement = replacement;

‏            await settings.save();
‏            res.json({ message: "Updated", list: settings.globalReplacements });
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

‏    // Delete Replacement
‏    app.delete('/api/admin/global-replacements/:id', verifyAdmin, async (req, res) => {
‏        try {
‏            let settings = await getGlobalSettings();
‏            settings.globalReplacements.pull(req.params.id);
‏            await settings.save();
‏            res.json({ message: "Deleted", list: settings.globalReplacements });
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================
‏    // 📝 GLOBAL COPYRIGHTS API (UPDATED FOR SEPARATOR)
    // =========================================================
    
‏    // Get Copyrights
‏    app.get('/api/admin/copyright', verifyAdmin, async (req, res) => {
‏        try {
‏            let settings = await getGlobalSettings();
‏            res.json({
‏                startText: settings.globalChapterStartText || '',
‏                endText: settings.globalChapterEndText || '',
‏                styles: settings.globalCopyrightStyles || {},
‏                frequency: settings.copyrightFrequency || 'always',
‏                everyX: settings.copyrightEveryX || 5,
‏                // 🔥 NEW FIELDS
‏                chapterSeparatorText: settings.chapterSeparatorText || '________________________________________',
‏                enableChapterSeparator: settings.enableChapterSeparator ?? true
            });
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

‏    // Save Copyrights
‏    app.post('/api/admin/copyright', verifyAdmin, async (req, res) => {
‏        try {
‏            const { 
‏                startText, endText, styles, frequency, everyX,
‏                chapterSeparatorText, enableChapterSeparator // 🔥 New fields
‏            } = req.body;
            
‏            let settings = await getGlobalSettings();
            
‏            settings.globalChapterStartText = startText;
‏            settings.globalChapterEndText = endText;
            
‏            if (styles) settings.globalCopyrightStyles = styles;
‏            if (frequency) settings.copyrightFrequency = frequency;
‏            if (everyX) settings.copyrightEveryX = everyX;
            
‏            // Save Separator Settings
‏            if (chapterSeparatorText !== undefined) settings.chapterSeparatorText = chapterSeparatorText;
‏            if (enableChapterSeparator !== undefined) settings.enableChapterSeparator = enableChapterSeparator;

‏            await settings.save();
‏            res.json({ message: "Copyrights updated" });
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });


    // =========================================================
‏    // 📜 SCRAPER LOGS API
    // =========================================================
‏    app.delete('/api/scraper/logs', async (req, res) => {
‏        try {
‏            await ScraperLog.deleteMany({});
‏            res.json({ message: "Logs cleared" });
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

‏    app.get('/api/scraper/logs', async (req, res) => {
‏        try {
‏            const logs = await ScraperLog.find().sort({ timestamp: -1 }).limit(100);
‏            res.json(logs);
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

‏    app.post('/api/scraper/init', async (req, res) => {
‏        try {
‏            const { url, userEmail } = req.body;
‏            await ScraperLog.deleteMany({}); 
            
‏            if (userEmail) {
‏                const user = await User.findOne({ email: userEmail });
‏                if (user) await logScraper(`👤 المستخدم: ${user.name}`, 'info');
            }

‏            await logScraper(`🚀 بدء عملية الفحص الذكي...`, 'info');
‏            await logScraper(`🔗 الرابط: ${url}`, 'info');
‏            res.json({ success: true });
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

‏    app.post('/api/scraper/log', async (req, res) => {
‏        try {
‏            const { message, type } = req.body;
‏            await logScraper(message, type || 'info');
‏            res.json({ success: true });
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================
‏    // 👁️ NEW WATCHLIST API (Watchlist Dashboard)
    // =========================================================
    
‏    // 🔥🔥 UPDATED: Allow Access with API Secret Header for Scraper 🔥🔥
‏    app.get('/api/admin/watchlist', async (req, res, next) => {
‏        const secret = req.headers['authorization'] || req.headers['x-api-secret'];
‏        // This should theoretically be in env, but keeping consistent with prompt
‏        const VALID_SECRET = 'Zeusndndjddnejdjdjdejekk29393838msmskxcm9239484jdndjdnddjj99292938338zeuslojdnejxxmejj82283849';
        
‏        if (secret === VALID_SECRET) {
‏            // Bypass verification, it's the scraper
‏            return next();
        }
‏        // Otherwise, verify admin token
‏        verifyAdmin(req, res, next);
‏    }, async (req, res) => {
‏        try {
‏            // 🔥🔥 ROCKET SPEED UPDATE: Use Aggregation to count chapters without fetching them
‏            const novels = await Novel.aggregate([
‏                { $match: { isWatched: true } },
                {
‏                    $project: {
‏                        title: 1,
‏                        cover: 1,
‏                        lastChapterUpdate: 1,
‏                        sourceUrl: 1,
‏                        sourceStatus: 1,
‏                        status: 1,
‏                        // Calculate size directly in DB
‏                        chaptersCount: { $size: { $ifNull: ["$chapters", []] } }
                    }
                },
‏                { $sort: { lastChapterUpdate: -1 } }
            ]);

‏            const formatted = novels.map(n => {
‏                const now = new Date();
‏                const diffTime = Math.abs(now - n.lastChapterUpdate);
‏                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
‏                let computedStatus = 'ongoing';
                
‏                // Priority to server-side logic
‏                if (n.sourceStatus === 'مكتملة' || n.status === 'مكتملة') {
‏                    computedStatus = 'completed';
‏                } else if (diffDays > 90) {
‏                    computedStatus = 'stopped';
                }

‏                return {
‏                    _id: n._id,
‏                    title: n.title,
‏                    cover: n.cover,
‏                    chaptersCount: n.chaptersCount, // Directly from aggregation
‏                    lastUpdate: n.lastChapterUpdate,
‏                    sourceUrl: n.sourceUrl,
‏                    status: computedStatus // 'ongoing', 'completed', 'stopped'
                };
            });

‏            res.json(formatted);
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================
‏    // 🔍 CHECK EXISTING CHAPTERS
    // =========================================================
‏    app.post('/api/scraper/check-chapters', async (req, res) => {
‏        const secret = req.headers['authorization'] || req.headers['x-api-secret'];
‏        const VALID_SECRET = 'Zeusndndjddnejdjdjdejekk29393838msmskxcm9239484jdndjdnddjj99292938338zeuslojdnejxxmejj82283849';
        
‏        if (secret !== VALID_SECRET) return res.status(403).json({ message: "Unauthorized" });

‏        try {
‏            const { title } = req.body;
            
            // 🔥 تعديل: البحث باستخدام العنوانين (العربي والانجليزي)
‏            const novel = await Novel.findOne({ 
‏                $or: [
‏                    { title: title },
‏                    { titleEn: title } 
                ]
            });
            
‏            if (novel) {
‏                const existingChapters = novel.chapters.map(c => c.number);
‏                await logScraper(`✅ الرواية موجودة (${existingChapters.length} فصل). جاري فحص النواقص والتحديثات...`, 'success');
‏                return res.json({ exists: true, chapters: existingChapters });
‏            } else {
‏                return res.json({ exists: false, chapters: [] });
            }
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================
‏    // 🕷️ SCRAPER WEBHOOK (Corrected - No Overwrite)
    // =========================================================
‏    app.post('/api/scraper/receive', async (req, res) => {
‏        const secret = req.headers['authorization'] || req.headers['x-api-secret'];
‏        const VALID_SECRET = 'Zeusndndjddnejdjdjdejekk29393838msmskxcm9239484jdndjdnddjj99292938338zeuslojdnejxxmejj82283849';
        
‏        if (secret !== VALID_SECRET) return res.status(403).json({ message: "Unauthorized" });

‏        try {
‏            const { adminEmail, novelData, chapters, error, skipMetadataUpdate } = req.body;

‏            if (error) {
‏                await logScraper(`❌ توقف: ${error}`, 'error');
‏                return res.status(400).json({ message: error });
            }

‏            if (!novelData || !novelData.title) {
‏                return res.status(400).json({ message: "Missing data" });
            }

‏            // Fallback for user if automated
‏            let user = null;
‏            if (adminEmail) {
‏                user = await User.findOne({ email: adminEmail });
            }
‏            // Use System Name if no user found
‏            const authorName = user ? user.name : "System Scraper";
‏            const authorEmail = user ? user.email : "system@scraper";
‏            const authorId = user ? user._id : null; // 🔥 NEW: Get User ID

            // 🔥 البحث باستخدام العنوانين لتجنب التكرار
‏            let novel = await Novel.findOne({ 
‏                $or: [
‏                    { title: novelData.title },
‏                    { titleEn: novelData.title } 
                ]
            });

‏            if (!novel) {
‏                // Image Upload Logic (Cloudinary) - Only for NEW novels
‏                if (novelData.cover && !novelData.cover.includes('cloudinary') && cloudinary) {
‏                    try {
‏                        const uploadRes = await cloudinary.uploader.upload(novelData.cover, {
‏                            folder: 'novels_covers',
‏                            resource_type: 'auto',
‏                            timeout: 60000 
                        });
‏                        novelData.cover = uploadRes.secure_url;
‏                        await logScraper(`✅ تم رفع الغلاف`, 'success');
‏                    } catch (imgErr) {
‏                        await logScraper(`⚠️ فشل رفع الغلاف (سيستخدم الرابط الأصلي)`, 'warning');
                    }
                }

‏                // New Novel - Full Creation
‏                // 🔥 MODIFICATION: Set internal status to 'خاصة' (private) instead of using scraped status
‏                novel = new Novel({
‏                    title: novelData.title,
‏                    titleEn: novelData.title, 
‏                    cover: novelData.cover,
‏                    description: novelData.description,
‏                    author: authorName, 
‏                    authorEmail: authorEmail,
‏                    authorId: authorId, // 🔥 NEW: Set authorId
‏                    category: novelData.category || 'أخرى',
‏                    tags: novelData.tags || [],
‏                    status: 'خاصة', // 🔥 PRIVATE UNTIL TRANSLATED
‏                    chapters: [],
‏                    views: 0,
‏                    // 🔥 Watchlist Fields
‏                    sourceUrl: novelData.sourceUrl || '',
‏                    sourceStatus: novelData.status || 'مستمرة',
‏                    isWatched: true, // Auto-watch new scraped novels
‏                    lastChapterUpdate: novelData.lastUpdate ? new Date(novelData.lastUpdate) : new Date() // Use Source Date
                });
‏                await novel.save();
‏                await logScraper(`✨ تم إنشاء الرواية: ${novelData.title} (خاصة)`, 'info');

‏                // 🔥 NEW: Start async translation of metadata (without job)
‏                translateNovelMetadata(novel._id, {
‏                    title: novelData.title,
‏                    description: novelData.description,
‏                    tags: novelData.tags || []
‏                }).catch(err => console.error("Background metadata translation error:", err));

‏            } else {
‏                // 🔥🔥 CRITICAL: EXISTING NOVEL - UPDATE ONLY WATCHLIST & STATUS 🔥🔥
                
‏                // Update Source URL if provided
‏                if (novelData.sourceUrl) novel.sourceUrl = novelData.sourceUrl;
                
‏                // Update Source Status
‏                if (novelData.status) {
‏                    novel.sourceStatus = novelData.status;
‏                    // Also update main status ONLY if completed (source completed)
‏                    if (novelData.status === 'مكتملة') {
‏                        novel.status = 'مكتملة';
‏                        await logScraper(`🏁 تم تحديث الحالة إلى مكتملة`, 'success');
                    }
                }
                
‏                // Ensure it's in watchlist
‏                novel.isWatched = true; 

‏                // 🛑 DO NOT UPDATE COVER, DESCRIPTION, TITLE, OR AUTHOR
‏                // We deliberately skip any other metadata updates here.
                
‏                // 🛑 DO NOT SAVE LAST UPDATE DATE YET
‏                // We save it only if new chapters are added and novel is public
                
‏                await novel.save();
            }

‏            // Save Chapters (This logic handles duplicates internally)
‏            let addedCount = 0;
‏            // 🔥 NEW: Check if novel is private (status === 'خاصة')
‏            const isPrivate = (novel.status === 'خاصة');
            
‏            if (chapters && Array.isArray(chapters) && chapters.length > 0) {
‏                for (const chap of chapters) {
‏                    // Always store in Firestore (regardless of privacy)
‏                    if (firestore) {
‏                        await firestore.collection('novels').doc(novel._id.toString())
‏                            .collection('chapters').doc(chap.number.toString()).set({
‏                                title: chap.title,
‏                                content: chap.content,
‏                                lastUpdated: new Date()
‏                            }, { merge: true });
                    }
                    
‏                    // Only add to MongoDB if novel is NOT private
‏                    if (!isPrivate) {
‏                        const existingChap = novel.chapters.find(c => c.number === chap.number);
‏                        if (!existingChap) {
‏                            // MongoDB Meta
‏                            novel.chapters.push({
‏                                number: chap.number,
‏                                title: chap.title,
‏                                createdAt: new Date(),
‏                                views: 0
                            });
‏                            addedCount++;
                        }
                    }
                }

‏                // 🔥 NEW: Update sourceChaptersCount with the highest chapter number received
‏                let maxChapter = 0;
‏                if (chapters && chapters.length > 0) {
‏                    maxChapter = Math.max(...chapters.map(c => c.number));
                }
‏                if (maxChapter > (novel.sourceChaptersCount || 0)) {
‏                    await Novel.updateOne(
‏                        { _id: novel._id },
‏                        { $set: { sourceChaptersCount: maxChapter } }
                    );
‏                    await logScraper(`📊 تم تحديث عدد الفصول المصدر إلى ${maxChapter}`, 'info');
                }

‏                if (!isPrivate && addedCount > 0) {
‏                    novel.chapters.sort((a, b) => a.number - b.number);
                    
‏                    // 🔥🔥 CRITICAL FIX: Only update lastChapterUpdate if NEW chapters were added
‏                    // Priority: Source Date provided by scraper > Current Date
‏                    if (novelData.lastUpdate) {
‏                        const sourceDate = new Date(novelData.lastUpdate);
‏                        if (!isNaN(sourceDate.getTime())) {
‏                            novel.lastChapterUpdate = sourceDate;
‏                        } else {
‏                            novel.lastChapterUpdate = new Date();
                        }
‏                    } else {
‏                        novel.lastChapterUpdate = new Date();
                    }

‏                    // Reactivate if new chapters added and not completed (only if not private)
‏                    if (novel.status === 'متوقفة' && novel.sourceStatus !== 'مكتملة') {
‏                        novel.status = 'مستمرة';
                    }
‏                    await novel.save();
‏                    await logScraper(`✅ تم حفظ ${addedCount} فصل جديد وتحديث تاريخ الرواية`, 'success');
‏                } else if (isPrivate) {
‏                    // Private novel: chapters stored only in Firestore, not visible yet
‏                    await logScraper(`ℹ️ تم حفظ ${chapters.length} فصل في Firestore (الرواية خاصة، لن تظهر للقراء حتى تتم الترجمة)`, 'info');
‏                } else {
‏                    // No chapters added, DO NOT TOUCH lastChapterUpdate
‏                    // This prevents the novel from jumping to top without new content
                }
            } 

‏            res.json({ success: true, novelId: novel._id });

‏        } catch (error) {
‏            console.error("Scraper Receiver Error:", error);
‏            await logScraper(`❌ خطأ خادم: ${error.message}`, 'error');
‏            res.status(500).json({ error: error.message });
        }
    });

    // =========================================================
‏    // 🔥 NEW: METADATA TRANSLATION JOB MANAGEMENT API
    // =========================================================
    
‏    // 1. Get all metadata translation jobs
‏    app.get('/api/translator/metadata-jobs', verifyToken, verifyAdmin, async (req, res) => {
‏        try {
‏            const jobs = await MetadataTranslationJob.find()
‏                .sort({ createdAt: -1 })
‏                .limit(20);
‏            res.json(jobs);
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

‏    // 2. Get a specific job
‏    app.get('/api/translator/metadata-jobs/:id', verifyToken, verifyAdmin, async (req, res) => {
‏        try {
‏            const job = await MetadataTranslationJob.findById(req.params.id);
‏            if (!job) return res.status(404).json({ message: "Job not found" });
‏            res.json(job);
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

‏    // 3. Start a new metadata translation job
‏    app.post('/api/admin/novels/:id/translate-metadata', verifyAdmin, async (req, res) => {
‏        try {
‏            const novelId = req.params.id;
‏            const novel = await Novel.findById(novelId);
‏            if (!novel) {
‏                return res.status(404).json({ message: "الرواية غير موجودة" });
            }

‏            // Create job
‏            const job = new MetadataTranslationJob({
‏                novelId: novel._id,
‏                novelTitle: novel.title,
‏                cover: novel.cover,
‏                status: 'active',
‏                processedCount: 0,
‏                totalSteps: 3,
‏                logs: [{ message: '🚀 تم بدء مهمة ترجمة البيانات الوصفية', type: 'info', timestamp: new Date() }]
            });
‏            await job.save();

‏            // Start translation in background with job tracking
‏            translateNovelMetadata(novel._id, {
‏                title: novel.titleEn || novel.title,
‏                description: novel.description,
‏                tags: novel.tags
‏            }, job._id).catch(err => console.error("Background metadata translation error:", err));

‏            res.json({ message: "تم بدء الترجمة بنجاح", jobId: job._id });
‏        } catch (error) {
‏            console.error("Error starting metadata translation:", error);
‏            res.status(500).json({ error: error.message });
        }
    });

‏    // 4. Delete a job
‏    app.delete('/api/translator/metadata-jobs/:id', verifyToken, verifyAdmin, async (req, res) => {
‏        try {
‏            await MetadataTranslationJob.findByIdAndDelete(req.params.id);
‏            res.json({ success: true });
‏        } catch (e) {
‏            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================
‏    // 📦 EXPORT CHAPTERS TO ZIP (ADMIN ONLY) - 🔥 STREAMING VERSION
    // =========================================================
‏    // Note: We bypass `verifyToken` middleware in main `app.use` by handling token check manually here
‏    // This allows browser/native Linking to trigger download via URL with query param
‏    app.get('/api/admin/novels/:id/export', async (req, res) => {
‏        try {
‏            // 1. Manually verify token from Query Param (because Linking.openURL can't set Authorization Header)
‏            const token = req.query.token;
‏            const includeTitle = req.query.includeTitle === 'true'; // Check if title should be included in content

‏            if (!token) return res.status(401).json({ message: "Authentication required" });

‏            try {
‏                const decoded = jwt.verify(token, process.env.JWT_SECRET);
‏                const user = await User.findById(decoded.id);
‏                if (!user || (user.role !== 'admin' && user.role !== 'contributor')) {
‏                    return res.status(403).json({ message: "Access Denied" });
                }
‏                req.user = user; 
‏            } catch (authErr) {
‏                return res.status(403).json({ message: "Invalid token" });
            }

‏            const novelId = req.params.id;
‏            const novel = await Novel.findById(novelId);
‏            if (!novel) return res.status(404).json({ message: "Novel not found" });

‏            // Ensure ownership for contributors
‏            if (req.user.role !== 'admin' && novel.authorEmail !== req.user.email) {
‏                return res.status(403).json({ message: "Access Denied to this novel" });
            }

‏            const settings = await getGlobalSettings();
            
‏            // 🔥 STREAMING SETUP 🔥
‏            const archiver = require('archiver');
‏            const archive = archiver('zip', {
‏                zlib: { level: 9 } // Sets the compression level.
            });

‏            // Set Headers for Download
‏            res.set('Content-Type', 'application/zip');
‏            res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(novel.title)}_chapters.zip"`);

‏            // Pipe archive data to the response
‏            archive.pipe(res);

‏            // Sort chapters by number
‏            novel.chapters.sort((a, b) => a.number - b.number);

‏            // Process chapters in batches to avoid memory overflow
‏            // We use a simple loop but process one by one to keep memory low
‏            for (const chap of novel.chapters) {
‏                let content = "";
‏                // Fetch content from Firestore
‏                if (firestore) {
‏                    const doc = await firestore.collection('novels').doc(novelId).collection('chapters').doc(chap.number.toString()).get();
‏                    if (doc.exists) content = doc.data().content || "";
                }

‏                // --- Apply Formatting Rules ---

‏                // 1. Blocklist Cleaning
‏                if (settings.globalBlocklist && settings.globalBlocklist.length > 0) {
‏                     settings.globalBlocklist.forEach(word => {
‏                        if (!word) return;
‏                        if (word.includes('\n') || word.includes('\r')) {
‏                            content = content.split(word).join('');
‏                        } else {
‏                            const escapedKeyword = escapeRegExp(word);
‏                            const regex = new RegExp(`^.*${escapedKeyword}.*$`, 'gm');
‏                            content = content.replace(regex, '');
                        }
                     });
                }

‏                // 1.5. 🔥 Global Replacements Logic (Server-Side) 🔥
‏                if (settings.globalReplacements && settings.globalReplacements.length > 0) {
‏                    settings.globalReplacements.forEach(rep => {
‏                        if (rep.original) {
‏                            const escapedOriginal = escapeRegExp(rep.original);
‏                            const regex = new RegExp(escapedOriginal, 'g');
‏                            content = content.replace(regex, rep.replacement || '');
                        }
                    });
                }
                
‏                // 2. 🔥🔥 INTERNAL CHAPTER SEPARATOR (SMART FIRST LINE ONLY) 🔥🔥
‏                // Note: Export logic needs to match Reader logic for consistency.
‏                if (settings.enableChapterSeparator) {
‏                    const separatorLine = `\n\n${settings.chapterSeparatorText || '________________________________________'}\n\n`;
                    
‏                    const lines = content.split('\n');
‏                    let replaced = false;
‏                    for (let i = 0; i < lines.length; i++) {
‏                        const lineTrimmed = lines[i].trim();
‏                        if (lineTrimmed.length > 0) {
‏                            // 🔥 Updated Regex: Matches 'Chapter', 'الفصل', 'فصل' OR checks for ':'
‏                            if (/^(?:الفصل|Chapter|فصل)|:/i.test(lineTrimmed)) {
‏                                lines[i] = lines[i] + separatorLine;
‏                                replaced = true;
                            }
‏                            break; // Stop after first non-empty
                        }
                    }
‏                    if (replaced) content = lines.join('\n');
                }

‏                // 3. Copyright Logic
‏                let showCopyright = true;
‏                const freq = settings.copyrightFrequency || 'always';
‏                const everyX = settings.copyrightEveryX || 5;
‏                if (freq === 'random' && Math.random() > 0.5) showCopyright = false;
‏                if (freq === 'every_x' && chap.number % everyX !== 0) showCopyright = false;

‏                let finalContent = "";
                
‏                // Add Start Copyright + Separator UNDER it
‏                if (showCopyright && settings.globalChapterStartText) {
‏                    finalContent += settings.globalChapterStartText + "\n\n_________________________________\n\n";
                }
                
‏                // Add Title (Optional)
‏                if (includeTitle) {
‏                     // 🔥 Updated Title Format: الفصل X: العنوان
‏                     finalContent += `الفصل ${chap.number}: ${chap.title || ''}\n\n`;
                }
                
‏                finalContent += content;

‏                // Add End Copyright + Separator ABOVE it
‏                if (showCopyright && settings.globalChapterEndText) {
‏                    finalContent += "\n\n_________________________________\n\n" + settings.globalChapterEndText;
                }

‏                // Add to ZIP Stream (FileName: 1.txt, 2.txt...)
‏                archive.append(finalContent, { name: `${chap.number}.txt` });
                
‏                // Small delay to allow GC to work if needed (optional but good for huge lists)
‏                // await new Promise(resolve => setImmediate(resolve));
            }

‏            // Finalize the archive (this triggers the end of the stream)
‏            await archive.finalize();

‏        } catch (e) {
‏            console.error("Export Error:", e);
‏            // If headers are already sent (streaming started), we can't send JSON error
‏            if (!res.headersSent) {
‏                res.status(500).json({ error: e.message });
‏            } else {
‏                // If streaming, just end it (client will get incomplete file)
‏                res.end();
            }
        }
    });

    // =========================================================
‏    // 🔄 TRANSFER ALL OWNERSHIP (ADMIN ONLY) - 🔥 FIXED PATH CONFLICT
    // =========================================================
‏    // Use a unique path to avoid collision with /api/admin/novels/:id
‏    app.put('/api/admin/ownership/transfer-all', verifyAdmin, async (req, res) => {
‏        // Double check admin role via DB to be safe
‏        const requestUser = await User.findById(req.user.id);
‏        if (!requestUser || requestUser.role !== 'admin') {
‏            return res.status(403).json({ message: "Access Denied. Admins only." });
        }

‏        const { targetUserId } = req.body;
        
‏        if (!targetUserId) {
‏            return res.status(400).json({ message: "Target User ID is required" });
        }

‏        try {
‏            // 1. Fetch Target User to get details
‏            const targetUser = await User.findById(targetUserId);
‏            if (!targetUser) {
‏                return res.status(404).json({ message: "Target User not found" });
            }

‏            // 2. Update ALL novels in the database
‏            // We update 'author' (name) and 'authorEmail' to match the target user
‏            const result = await Novel.updateMany({}, {
‏                $set: {
‏                    author: targetUser.name,
‏                    authorEmail: targetUser.email
                }
            });

‏            res.json({ 
‏                message: "Ownership transferred successfully", 
‏                modifiedCount: result.modifiedCount,
‏                newOwner: targetUser.name
            });

‏        } catch (error) {
‏            console.error("Transfer Ownership Error:", error);
‏            res.status(500).json({ error: error.message });
        }
    });
};