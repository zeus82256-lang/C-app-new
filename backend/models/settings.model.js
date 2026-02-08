
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
    translatorExtractPrompt: { type: String, default: '' },
    translatorApiKeys: [{ type: String }], // Global Keys for Translator
    
    // 🔥 Title Generator Specific Settings (NEW & SEPARATED)
    titleGenModel: { type: String, default: 'gemini-2.5-flash' },
    titleGenPrompt: { type: String, default: 'Read the following chapter content and suggest a short, engaging, and professional Arabic title for it (Maximum 6 words). Output ONLY the Arabic title string without any quotes, prefixes, or chapter numbers.' },
    titleGenApiKeys: [{ type: String }], // 🔥 Separated Keys for Title Gen

    // 🔥 Categories Management (Master List)
    managedCategories: [{ type: String }],
    
    // 🔥 Category Normalization Rules (Dynamic)
    categoryNormalizationRules: [{ 
        original: { type: String, required: true }, 
        target: { type: String, required: true } 
    }],

    fontSize: { type: Number, default: 18 },
    globalBlocklist: [{ type: String }],

    // 🔥 Global App Rights (Copyrights) with Styling
    globalChapterStartText: { type: String, default: '' },
    globalChapterEndText: { type: String, default: '' },
    
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
