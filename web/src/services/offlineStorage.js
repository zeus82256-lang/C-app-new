
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOVELS_KEY = '@offline_novels_meta';
const CHAPTER_INDEX_KEY_PREFIX = '@offline_idx_'; // + novelId
const CHAPTER_CONTENT_KEY_PREFIX = '@offline_ch_'; // + novelId_chapterNum

// 1. حفظ بيانات الرواية (Metadata)
export const saveOfflineNovel = async (novel) => {
    try {
        const stored = await AsyncStorage.getItem(NOVELS_KEY);
        const novels = stored ? JSON.parse(stored) : {};
        
        // Save minimal needed data
        novels[novel._id] = {
            _id: novel._id,
            title: novel.title,
            cover: novel.cover,
            author: novel.author,
            category: novel.category,
            description: novel.description,
            status: novel.status,
            tags: novel.tags || [],
            chaptersCount: novel.chaptersCount || (novel.chapters ? novel.chapters.length : 0),
            savedAt: new Date().toISOString()
        };
        
        await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(novels));
    } catch (e) {
        console.error("Failed to save novel meta", e);
    }
};

// 2. حفظ فصل
export const saveOfflineChapter = async (novelId, chapterData) => {
    try {
        // Save Content
        const key = `${CHAPTER_CONTENT_KEY_PREFIX}${novelId}_${chapterData.number}`;
        await AsyncStorage.setItem(key, JSON.stringify(chapterData));

        // Update Index
        const indexKey = `${CHAPTER_INDEX_KEY_PREFIX}${novelId}`;
        const storedIndex = await AsyncStorage.getItem(indexKey);
        let index = storedIndex ? JSON.parse(storedIndex) : [];
        
        // Add minimal chapter info to index if not exists
        const exists = index.find(c => c.number === chapterData.number);
        if (!exists) {
            index.push({
                number: chapterData.number,
                title: chapterData.title,
                _id: chapterData._id || `local_${chapterData.number}`
            });
            // Sort by number
            index.sort((a, b) => a.number - b.number);
            await AsyncStorage.setItem(indexKey, JSON.stringify(index));
        }
    } catch (e) {
        console.error("Failed to save chapter", e);
        throw e;
    }
};

// 3. حذف فصل
export const removeOfflineChapter = async (novelId, chapterNum) => {
    try {
        // Remove Content
        const key = `${CHAPTER_CONTENT_KEY_PREFIX}${novelId}_${chapterNum}`;
        await AsyncStorage.removeItem(key);

        // Update Index
        const indexKey = `${CHAPTER_INDEX_KEY_PREFIX}${novelId}`;
        const storedIndex = await AsyncStorage.getItem(indexKey);
        if (storedIndex) {
            let index = JSON.parse(storedIndex);
            index = index.filter(c => c.number !== chapterNum);
            
            if (index.length === 0) {
                // If no chapters left, remove index and maybe novel meta
                await AsyncStorage.removeItem(indexKey);
                await removeOfflineNovel(novelId);
            } else {
                await AsyncStorage.setItem(indexKey, JSON.stringify(index));
            }
        }
    } catch (e) {
        console.error("Failed to remove chapter", e);
    }
};

// 4. حذف رواية (داخلي)
const removeOfflineNovel = async (novelId) => {
    try {
        const stored = await AsyncStorage.getItem(NOVELS_KEY);
        if (stored) {
            const novels = JSON.parse(stored);
            delete novels[novelId];
            await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(novels));
        }
    } catch (e) { console.error(e); }
};

// 🔥 4.5 حذف مجموعة روايات (للواجهة الجديدة)
export const removeOfflineNovelsBatch = async (novelIds) => {
    try {
        // 1. Get Novels Meta
        const stored = await AsyncStorage.getItem(NOVELS_KEY);
        let novels = stored ? JSON.parse(stored) : {};

        for (const novelId of novelIds) {
            // A. Remove all chapters content
            const indexKey = `${CHAPTER_INDEX_KEY_PREFIX}${novelId}`;
            const storedIndex = await AsyncStorage.getItem(indexKey);
            if (storedIndex) {
                const chapters = JSON.parse(storedIndex);
                // Parallel removal of chapter content
                const keysToRemove = chapters.map(c => `${CHAPTER_CONTENT_KEY_PREFIX}${novelId}_${c.number}`);
                await AsyncStorage.multiRemove(keysToRemove);
            }

            // B. Remove Chapter Index
            await AsyncStorage.removeItem(indexKey);

            // C. Remove from meta object
            delete novels[novelId];
        }

        // 2. Save updated novels meta
        await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(novels));

        return true;
    } catch (e) {
        console.error("Batch delete failed", e);
        return false;
    }
};

// 5. جلب الروايات المحملة
export const getOfflineNovels = async () => {
    try {
        const stored = await AsyncStorage.getItem(NOVELS_KEY);
        const novelsMap = stored ? JSON.parse(stored) : {};
        const novelsList = Object.values(novelsMap);

        // Get downloaded chapters count for each
        for (let novel of novelsList) {
            const indexKey = `${CHAPTER_INDEX_KEY_PREFIX}${novel._id}`;
            const storedIndex = await AsyncStorage.getItem(indexKey);
            novel.downloadedCount = storedIndex ? JSON.parse(storedIndex).length : 0;
        }
        
        return novelsList.filter(n => n.downloadedCount > 0);
    } catch (e) {
        return [];
    }
};

// 6. جلب بيانات رواية كاملة (للمشاهدة بدون نت)
export const getOfflineNovelDetails = async (novelId) => {
    try {
        const stored = await AsyncStorage.getItem(NOVELS_KEY);
        const novels = stored ? JSON.parse(stored) : {};
        const novel = novels[novelId];
        
        if (!novel) return null;

        const indexKey = `${CHAPTER_INDEX_KEY_PREFIX}${novelId}`;
        const storedIndex = await AsyncStorage.getItem(indexKey);
        const chapters = storedIndex ? JSON.parse(storedIndex) : [];

        return { ...novel, chapters };
    } catch (e) {
        return null;
    }
};

// 7. جلب محتوى فصل
export const getOfflineChapterContent = async (novelId, chapterNum) => {
    try {
        const key = `${CHAPTER_CONTENT_KEY_PREFIX}${novelId}_${chapterNum}`;
        const stored = await AsyncStorage.getItem(key);
        return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
};

// 8. التحقق مما إذا كان الفصل محملاً
export const checkChapterDownloaded = async (novelId, chapterNum) => {
    try {
        const key = `${CHAPTER_CONTENT_KEY_PREFIX}${novelId}_${chapterNum}`;
        const stored = await AsyncStorage.getItem(key);
        return !!stored;
    } catch (e) { return false; }
};
