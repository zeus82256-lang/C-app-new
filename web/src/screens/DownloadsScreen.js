
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  ImageBackground,
  StatusBar,
  Animated
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { getOfflineNovels, removeOfflineNovelsBatch } from '../services/offlineStorage';
import CustomAlert from '../components/CustomAlert';
import api from '../services/api';
import downloadQueue from '../services/DownloadQueue';
import { useToast } from '../context/ToastContext';

const { width } = Dimensions.get('window');

export default function DownloadsScreen({ navigation }) {
  const [novels, setNovels] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  
  // Selection Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({});

  useFocusEffect(
    useCallback(() => {
      loadDownloads();
      return () => {
          setIsSelectionMode(false);
          setSelectedIds([]);
      };
    }, [])
  );

  const loadDownloads = async () => {
    setLoading(true);
    const data = await getOfflineNovels();
    setNovels(data);
    setLoading(false);
  };

  const handleLongPress = (id) => {
      setIsSelectionMode(true);
      setSelectedIds([id]);
  };

  const handlePress = (item) => {
      if (isSelectionMode) {
          if (selectedIds.includes(item._id)) {
              const newIds = selectedIds.filter(id => id !== item._id);
              setSelectedIds(newIds);
              if (newIds.length === 0) setIsSelectionMode(false);
          } else {
              setSelectedIds([...selectedIds, item._id]);
          }
      } else {
          navigation.navigate('NovelDetail', { novel: item, isOfflineMode: true });
      }
  };

  const handleSelectAll = () => {
      if (selectedIds.length === novels.length) {
          setSelectedIds([]);
      } else {
          setSelectedIds(novels.map(n => n._id));
      }
  };

  const confirmDelete = () => {
      if (selectedIds.length === 0) return;
      
      setAlertConfig({
          title: "حذف التنزيلات",
          message: `هل أنت متأكد من حذف ${selectedIds.length} رواية مع جميع فصولها المحملة؟`,
          type: "danger",
          confirmText: "حذف",
          cancelText: "إلغاء",
          onConfirm: async () => {
              setAlertVisible(false);
              setLoading(true);
              await removeOfflineNovelsBatch(selectedIds);
              setIsSelectionMode(false);
              setSelectedIds([]);
              await loadDownloads();
          }
      });
      setAlertVisible(true);
  };

  // 🔥 FEATURE: Batch Download Missing Chapters
  const handleDownloadAllForNovel = async (novel) => {
      setAlertConfig({
          title: "تحميل الكل",
          message: `هل تريد تنزيل جميع فصول "${novel.title}" المتبقية في الخلفية؟`,
          type: "info",
          confirmText: "ابدأ التنزيل",
          cancelText: "إلغاء",
          onConfirm: async () => {
              setAlertVisible(false);
              try {
                  showToast("جاري فحص الفصول...", "info");
                  // Get full chapter list from API
                  const res = await api.get(`/api/novels/${novel._id}/chapters-list?limit=10000`);
                  const allChapters = res.data;
                  
                  if (!allChapters || allChapters.length === 0) {
                      showToast("لا توجد فصول", "error");
                      return;
                  }

                  // Add ALL to queue (Queue service will filter duplicates)
                  downloadQueue.add(novel, allChapters);
                  showToast("تمت الإضافة لطابور التنزيل", "success");
              } catch(e) {
                  showToast("فشل الاتصال بالخادم", "error");
              }
          }
      });
      setAlertVisible(true);
  };

  const renderItem = ({ item }) => {
      const isSelected = selectedIds.includes(item._id);
      // Check if actively downloading
      const isDownloading = downloadQueue.isNovelDownloading(item._id);
      const queueCount = downloadQueue.getNovelQueueCount(item._id);

      return (
        <TouchableOpacity
          style={[styles.card, isSelectionMode && isSelected && styles.cardSelected]}
          onPress={() => handlePress(item)}
          onLongPress={() => handleLongPress(item._id)}
          activeOpacity={0.9}
        >
          <Image 
            source={item.cover} 
            style={styles.cover} 
            contentFit="cover" 
            cachePolicy="memory-disk"
          />
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            <View style={styles.statsRow}>
                <View style={styles.badge}>
                    <Ionicons name="cloud-done" size={12} color="#fff" />
                    <Text style={styles.badgeText}>{item.downloadedCount} فصل</Text>
                </View>
                
                {/* 🔥 NEW BUTTON ONLY IN DOWNLOADS SCREEN */}
                {!isSelectionMode && (
                    <TouchableOpacity 
                        style={styles.downloadBtn} 
                        onPress={() => handleDownloadAllForNovel(item)}
                        hitSlop={{top:10,bottom:10,left:10,right:10}}
                    >
                        <Ionicons name="cloud-download-outline" size={18} color="#4a7cc7" />
                    </TouchableOpacity>
                )}
            </View>
            <View style={styles.metaRow}>
                {isDownloading ? (
                    <Text style={[styles.metaText, {color: '#4ade80'}]}>جاري تنزيل {queueCount} فصل...</Text>
                ) : (
                    <Text style={styles.metaText}>{item.chaptersCount ? `الأرشيف: ${item.chaptersCount}` : 'محفوظة'}</Text>
                )}
            </View>
          </View>
          
          {isSelectionMode && (
              <View style={styles.checkOverlay}>
                  <View style={[styles.checkBox, isSelected && styles.checkBoxActive]}>
                      {isSelected && <Ionicons name="checkmark" size={16} color="#000" />}
                  </View>
              </View>
          )}
        </TouchableOpacity>
      );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ImageBackground 
        source={require('../../assets/adaptive-icon.png')} 
        style={styles.bgImage}
        blurRadius={20}
      >
          <LinearGradient colors={['rgba(0,0,0,0.6)', '#000000']} style={StyleSheet.absoluteFill} />
      </ImageBackground>

      <CustomAlert 
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onCancel={() => setAlertVisible(false)}
        onConfirm={alertConfig.onConfirm}
      />

      <SafeAreaView style={{flex: 1}} edges={['top']}>
        {/* Header - Changes based on Selection Mode */}
        {isSelectionMode ? (
            <View style={styles.selectionHeader}>
                 <View style={styles.selectionLeft}>
                     <TouchableOpacity onPress={() => { setIsSelectionMode(false); setSelectedIds([]); }}>
                         <Text style={styles.cancelText}>إلغاء</Text>
                     </TouchableOpacity>
                     <Text style={styles.selectionCount}>{selectedIds.length} محدد</Text>
                 </View>
                 <View style={styles.selectionRight}>
                     <TouchableOpacity onPress={handleSelectAll} style={styles.actionIcon}>
                         <Ionicons name="checkmark-done-circle-outline" size={26} color="#fff" />
                     </TouchableOpacity>
                     <TouchableOpacity onPress={confirmDelete} style={[styles.actionIcon, {backgroundColor: 'rgba(255,68,68,0.2)'}]}>
                         <Ionicons name="trash-outline" size={24} color="#ff4444" />
                     </TouchableOpacity>
                 </View>
            </View>
        ) : (
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-forward" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>التنزيلات</Text>
                <View style={{width: 40}} /> 
            </View>
        )}

        <FlatList 
            data={novels}
            keyExtractor={item => item._id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
                <View style={styles.empty}>
                    <Ionicons name="cloud-download-outline" size={60} color="#444" />
                    <Text style={styles.emptyText}>لا توجد روايات محملة</Text>
                    <Text style={styles.emptySub}>اضغط مطولاً على أي رواية لتفعيل التحديد</Text>
                </View>
            }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  backBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },

  selectionHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
      padding: 15, marginHorizontal: 15, marginBottom: 10,
      backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)'
  },
  selectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  cancelText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  selectionCount: { color: '#ccc', fontSize: 14 },
  selectionRight: { flexDirection: 'row', gap: 10 },
  actionIcon: { padding: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)' },
  
  list: { padding: 15 },
  
  card: { 
      flexDirection: 'row-reverse', 
      backgroundColor: 'rgba(20, 20, 20, 0.8)', 
      borderRadius: 16, 
      marginBottom: 15, 
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      position: 'relative'
  },
  cardSelected: {
      borderColor: '#fff',
      backgroundColor: 'rgba(40, 40, 40, 0.9)'
  },
  cover: { width: 90, height: 130, backgroundColor: '#333' },
  info: { flex: 1, padding: 15, justifyContent: 'center', alignItems: 'flex-end' },
  title: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 10, textAlign: 'right' },
  statsRow: { flexDirection: 'row-reverse', marginBottom: 8, alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  
  badge: { 
      flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
      backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)'
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  
  // Style for the new download button in list
  downloadBtn: {
      padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)',
      marginLeft: 10
  },

  metaRow: { flexDirection: 'row-reverse' },
  metaText: { color: '#888', fontSize: 11 },

  checkOverlay: {
      position: 'absolute', left: 10, top: 0, bottom: 0, 
      justifyContent: 'center', alignItems: 'center', zIndex: 10
  },
  checkBox: {
      width: 24, height: 24, borderRadius: 12, 
      borderWidth: 2, borderColor: '#fff', 
      justifyContent: 'center', alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)'
  },
  checkBoxActive: {
      backgroundColor: '#fff',
      borderColor: '#fff'
  },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100, gap: 10 },
  emptyText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  emptySub: { color: '#666', fontSize: 14 }
});
