
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Image,
  ActivityIndicator,
  StatusBar,
  ImageBackground
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import CustomAlert from '../components/CustomAlert';

const GlassContainer = ({ children, style }) => (
    <View style={[styles.glassContainer, style]}>
        {children}
    </View>
);

export default function NovelMetadataTranslationScreen({ navigation }) {
  const { showToast } = useToast();

  const [novels, setNovels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [startingId, setStartingId] = useState(null);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({});

  useEffect(() => {
      fetchNovels(1);
  }, []);

  // Debounced search
  useEffect(() => {
      const delayDebounce = setTimeout(() => {
          fetchNovels(1);
      }, 500);
      return () => clearTimeout(delayDebounce);
  }, [search]);

  const fetchNovels = async (pageNum) => {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      try {
          const res = await api.get('/api/translator/novels', {
              params: {
                  page: pageNum,
                  limit: 20,
                  search: search
              }
          });

          const newNovels = res.data;

          if (pageNum === 1) {
              setNovels(newNovels);
          } else {
              setNovels(prev => [...prev, ...newNovels]);
          }

          setHasMore(newNovels.length === 20);
          setPage(pageNum);
      } catch (e) {
          console.log(e);
          showToast("فشل جلب الروايات", "error");
      } finally {
          setLoading(false);
          setLoadingMore(false);
      }
  };

  const handleLoadMore = () => {
      if (!loadingMore && hasMore) {
          fetchNovels(page + 1);
      }
  };

  const confirmTranslate = (novel) => {
      setAlertConfig({
          title: "تعريب بيانات الرواية",
          message: `ترجمة عنوان ووصف وتصنيفات "${novel.title}"؟\nالعدد الحالي للفصول: ${novel.chaptersCount || 0}`,
          type: 'info',
          confirmText: 'ابدأ التعريب',
          onConfirm: () => startMetadataTranslation(novel)
      });
      setAlertVisible(true);
  };

  const startMetadataTranslation = async (novel) => {
      setAlertVisible(false);
      setStartingId(novel._id);
      try {
          await api.post(`/api/admin/novels/${novel._id}/translate-metadata`);
          showToast("تم بدء مهمة تعريب البيانات", "success");
          navigation.replace('MetadataTranslationHub');
      } catch (e) {
          console.log(e);
          const msg = e?.response?.data?.message || e?.response?.data?.error;
          showToast(msg || "فشل بدء المهمة", "error");
      } finally {
          setStartingId(null);
      }
  };

  const renderNovelItem = ({ item }) => (
      <GlassContainer style={styles.novelItem}>
          <View style={styles.itemRow}>
              <Image source={{ uri: item.cover }} style={styles.novelCover} />
              <View style={styles.itemInfo}>
                  <Text style={styles.novelTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.novelMeta}>
                      {item.author ? `بواسطة ${item.author} • ` : ''}{item.chaptersCount || 0} فصل
                  </Text>
              </View>
              <TouchableOpacity
                  style={styles.translateBtn}
                  onPress={() => confirmTranslate(item)}
                  disabled={startingId === item._id}
              >
                  {startingId === item._id ? (
                      <ActivityIndicator size="small" color="#000" />
                  ) : (
                      <>
                          <Ionicons name="language" size={18} color="#000" />
                          <Text style={styles.translateBtnText}>تعريب</Text>
                      </>
                  )}
              </TouchableOpacity>
          </View>
      </GlassContainer>
  );

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

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <CustomAlert
            visible={alertVisible}
            title={alertConfig.title}
            message={alertConfig.message}
            type={alertConfig.type}
            confirmText={alertConfig.confirmText}
            onCancel={() => setAlertVisible(false)}
            onConfirm={alertConfig.onConfirm}
        />

        <View style={styles.header}>
            <Text style={styles.headerTitle}>تعريب رواية موجودة</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
        </View>

        <GlassContainer style={styles.searchBox}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', padding: 10 }}>
                <Ionicons name="search" size={16} color="#666" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="ابحث عن رواية..."
                    placeholderTextColor="#666"
                    value={search}
                    onChangeText={setSearch}
                />
                {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')}>
                        <Ionicons name="close-circle" size={16} color="#666" />
                    </TouchableOpacity>
                )}
            </View>
        </GlassContainer>

        {loading ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 30 }} />
        ) : (
            <FlatList
                data={novels}
                keyExtractor={item => item._id}
                renderItem={renderNovelItem}
                contentContainerStyle={{ padding: 15, paddingBottom: 30 }}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                ListFooterComponent={() => (
                    loadingMore ? <ActivityIndicator color="#fff" size="small" style={{ marginTop: 10 }} /> : null
                )}
                ListEmptyComponent={
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                        <Ionicons name="book-outline" size={48} color="#333" />
                        <Text style={{ color: '#666', marginTop: 10 }}>لا توجد روايات</Text>
                    </View>
                }
            />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 15, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  closeBtn: { padding: 5, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },

  glassContainer: {
      backgroundColor: 'rgba(20, 20, 20, 0.75)',
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)'
  },

  searchBox: { marginHorizontal: 15, marginBottom: 5 },
  searchInput: { flex: 1, color: '#fff', marginHorizontal: 8, fontSize: 13, textAlign: 'right' },

  novelItem: { marginBottom: 10 },
  itemRow: { flexDirection: 'row-reverse', alignItems: 'center', padding: 10, gap: 12 },
  novelCover: { width: 45, height: 64, borderRadius: 6, backgroundColor: '#333' },
  itemInfo: { flex: 1 },
  novelTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold', textAlign: 'right' },
  novelMeta: { color: '#888', fontSize: 11, textAlign: 'right', marginTop: 4 },

  translateBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 9,
      borderRadius: 10
  },
  translateBtnText: { color: '#000', fontWeight: 'bold', fontSize: 13 },
});
