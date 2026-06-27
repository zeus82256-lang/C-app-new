
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://c-production-e6c3.up.railway.app'; 

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('userToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * تحديث المشاهدات بناءً على الرواية ورقم الفصل
 * تم تعديلها لترسل chapterNumber لكي تتوافق مع منطق الـ viewKey في الخادم
 */
export const incrementView = async (novelId, chapterNumber = null) => {
    try {
        await api.post(`/api/novels/${novelId}/view`, {
            chapterNumber: chapterNumber
        });
    } catch (e) {
        // Ignore errors for analytics
        console.log("View increment failed:", e.message);
    }
};

export default api;
