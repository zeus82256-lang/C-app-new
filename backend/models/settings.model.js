
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    // 🔥 جعلنا المستخدم غير إجباري لكي تكون الإعدادات عامة للنظام
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
    
    provider: { type: String, default: 'gemini' },
    model: { type: String, default: 'gemini-1.5-flash' },
    temperature: { type: Number, default: 0.7 },
    geminiApiKeys: [{ key: String, status: String }],
    openrouterApiKeys: [{ key: String, status: String }],
    customProviders: [{
        id: String,
        name: String,
        baseUrl: String,
        models: [{ id: String, name: String }],
        apiKeys: [{ key: String, status: String }]
    }],
    customPrompt: { type: String, default: '' },
    
    // 🔥 Translator Specific Settings
    translatorModel: { type: String, default: 'gemini-2.5-flash' }, 
    // 🔥 UPDATED PROMPT HERE
    translatorExtractPrompt: { type: String, default: `ROLE: Expert Web Novel Terminology Extractor.
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

RETURN ONLY JSON:` },
    translatorApiKeys: [{ type: String }], // Global Keys for Translator
    
    // 🔥 Title Generator Specific Settings
    titleGenModel: { type: String, default: 'gemini-2.5-flash' },
    titleGenPrompt: { type: String, default: 'Read the following chapter content and suggest a short, engaging, and professional Arabic title for it (Maximum 6 words). Output ONLY the Arabic title string without any quotes, prefixes, or chapter numbers.' },
    titleGenApiKeys: [{ type: String }], 

    // 🔥 Categories Management (Master List)
    managedCategories: [{ type: String }],
    
    // 🔥 Category Normalization Rules (Dynamic)
    categoryNormalizationRules: [{ 
        original: { type: String, required: true }, 
        target: { type: String, required: true } 
    }],

    fontSize: { type: Number, default: 18 },
    globalBlocklist: [{ type: String }],

    // 🔥 Global Replacements (Server-Side)
    globalReplacements: [{ 
        original: { type: String, required: true }, 
        replacement: { type: String, default: '' } 
    }],

    // 🔥 Global App Rights (Copyrights) with Styling
    globalChapterStartText: { type: String, default: '' },
    globalChapterEndText: { type: String, default: '' },
    
    // 🔥 New: Chapter Separator Configuration
    chapterSeparatorText: { type: String, default: '________________________________________' },
    enableChapterSeparator: { type: Boolean, default: true },
    
    globalCopyrightStyles: {
        color: { type: String, default: '#888888' },
        opacity: { type: Number, default: 1 },
        alignment: { type: String, enum: ['left', 'center', 'right'], default: 'center' },
        isBold: { type: Boolean, default: true },
        fontSize: { type: Number, default: 14 } 
    },

    // 🔥 Frequency Control for Copyrights
    copyrightFrequency: { type: String, enum: ['always', 'random', 'every_x'], default: 'always' },
    copyrightEveryX: { type: Number, default: 5 } 

}, { timestamps: true });

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
