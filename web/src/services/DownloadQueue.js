
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { saveOfflineChapter, checkChapterDownloaded, saveOfflineNovel } from './offlineStorage';

const QUEUE_KEY = '@download_queue_v1';
const CONCURRENCY_LIMIT = 5;

class DownloadQueueService {
    constructor() {
        this.queue = [];
        this.activeDownloads = 0;
        this.listeners = [];
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;
        try {
            const savedQueue = await AsyncStorage.getItem(QUEUE_KEY);
            if (savedQueue) {
                this.queue = JSON.parse(savedQueue);
                // Reset 'downloading' status to 'pending' in case app was killed
                this.queue = this.queue.map(item => 
                    item.status === 'downloading' ? { ...item, status: 'pending' } : item
                );
            }
            this.isInitialized = true;
            this.processQueue();
        } catch (e) {
            console.error("Failed to init download queue", e);
        }
    }

    async add(novel, chapters) {
        if (!this.isInitialized) await this.init();

        const chaptersArray = Array.isArray(chapters) ? chapters : [chapters];
        
        // Save novel meta to ensure it appears in downloads list
        await saveOfflineNovel(novel);

        let addedCount = 0;
        for (const chapter of chaptersArray) {
            // Check if already in queue
            const existsInQueue = this.queue.some(q => q.novelId === novel._id && q.chapterNumber === chapter.number);
            
            if (!existsInQueue) {
                this.queue.push({
                    id: `${novel._id}_${chapter.number}`,
                    novelId: novel._id,
                    chapterNumber: chapter.number,
                    chapterTitle: chapter.title,
                    novelTitle: novel.title,
                    status: 'pending',
                    timestamp: Date.now()
                });
                addedCount++;
            }
        }

        if (addedCount > 0) {
            this.persistQueue();
            this.notifyListeners();
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.activeDownloads >= CONCURRENCY_LIMIT || this.queue.length === 0) return;

        // Get pending items
        const pendingItems = this.queue.filter(item => item.status === 'pending');
        
        if (pendingItems.length === 0) return;

        // Determine how many slots available
        const slotsAvailable = CONCURRENCY_LIMIT - this.activeDownloads;
        const batch = pendingItems.slice(0, slotsAvailable);

        batch.forEach(item => {
            this.startDownload(item);
        });
    }

    async startDownload(item) {
        // Mark as downloading
        item.status = 'downloading';
        this.activeDownloads++;
        this.notifyListeners();

        try {
            // Check if already downloaded physically to skip network
            const isDownloaded = await checkChapterDownloaded(item.novelId, item.chapterNumber);
            
            if (!isDownloaded) {
                const res = await api.get(`/api/novels/${item.novelId}/chapters/${item.chapterNumber}`);
                await saveOfflineChapter(item.novelId, res.data);
            }

            // Success: Remove from queue
            this.remove(item.id);

        } catch (error) {
            console.log(`Download failed for ${item.id}:`, error.message);
            // On failure, remove from queue or mark failed? 
            // We remove to prevent blocking, user can retry.
            // Or we could implement retry logic here.
            this.remove(item.id); 
        } finally {
            this.activeDownloads--;
            this.processQueue(); // Trigger next items
        }
    }

    remove(itemId) {
        this.queue = this.queue.filter(i => i.id !== itemId);
        this.persistQueue();
        this.notifyListeners();
    }

    getQueueStatus(novelId, chapterNum) {
        const item = this.queue.find(q => q.novelId === novelId && q.chapterNumber === chapterNum);
        return item ? item.status : null;
    }

    // Helper to check if a novel is currently being downloaded
    isNovelDownloading(novelId) {
        return this.queue.some(q => q.novelId === novelId);
    }

    getNovelQueueCount(novelId) {
        return this.queue.filter(q => q.novelId === novelId).length;
    }

    async persistQueue() {
        try {
            await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
        } catch (e) {
            console.error("Failed to persist queue", e);
        }
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notifyListeners() {
        this.listeners.forEach(l => l(this.queue));
    }
}

const downloadQueue = new DownloadQueueService();
export default downloadQueue;
