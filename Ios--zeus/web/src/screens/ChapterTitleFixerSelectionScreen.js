
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

const GlassContainer = ({ children, style }) => (
    <View style={[styles.glassContainer, style]}>
        {children}
    </View>
);

export default function ChapterTitleFixerSelectionScreen({ navigation }) {
  const { showToast } = useToast();
  
  const [novels, setNovels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  
  const [selectedNovel, setSelectedNovel] = useState(null);
  const [startingJob, setStartingJob] = useState(false);

  useEffect(() => { 
      fetchNovels(1); 
  }, []);

  useEffect(() => {
      const delayDebounce = setTimeout(() => {
          fetchNovels(1);
      }, 500);
      return () => clearTimeout(delayDebounce);
  }, [search]);

  // Use Optimized Endpoint
  const fetchNovels = async (pageNum) => {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      try {
          const res = await api.get('/api/translator/novels', {
              params: { page: pageNum, limit: 20, search: search }
          }); 
          
          if (pageNum === 1) setNovels(res.data);
          else setNovels(prev => [...prev, ...res.data]);

          setHasMore(res.data.length === 20);
          setPage(pageNum);
      } catch(e) { 
          showToast("فشل جلب الروايات", "error");
      } finally { 
          setLoading(false); 
          setLoadingMore(false);
      }
  };

  const handleLoadMore = () => {
      if (!loadingMore && hasMore) fetchNovels(page + 1);
  };

  const startExtractionJob = async () => {
      if (!selectedNovel) return;
      setStartingJob(true);
      try {
          await api.post('/api/admin/tools/extract-titles/start', {
              novelId: selectedNovel._id
          });
          showToast("تم بدء المهمة بنجاح", "success");
          navigation.goBack();
      } catch (error) {
          const msg = error.response?.data?.message || "فشل بدء المهمة";
          showToast(msg, "error");
      } finally {
          setStartingJob(false);
      }
  };

  const renderNovelItem = ({ item }) => (
      <TouchableOpacity onPress={() => setSelectedNovel(item)} activeOpacity={0.8}>
          <GlassContainer style={[styles.novelItem, selectedNovel?._id === item._id && styles.novelItemSelected]}>
              <View style={{flexDirection:'row-reverse', alignItems:'center', padding: 10, gap: 10}}>
                  <Image source={{uri: item.cover}} style={styles.novelCover} />
                  <View style={{flex:1}}>
                      <Text style={styles.novelTitle} numberOfLines={2}>{item.title}</Text>
                      <Text style={styles.novelMeta}>{item.chaptersCount || 0} فصل</Text>
                  </View>
                  {selectedNovel?._id === item._id && <Ionicons name="checkmark-circle" size={24} color="#fff" />}
              </View>
          </GlassContainer>
      </TouchableOpacity>
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
      
      <SafeAreaView style={{flex: 1}} edges={['top']}>
        <View style={styles.header}>
            <Text style={styles.headerTitle}>اختيار رواية للاستخراج</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
        </View>

        <View style={{flex:1, flexDirection:'row-reverse'}}>
            {/* List */}
            <View style={styles.rightPane}>
                <GlassContainer style={styles.searchBox}>
                    <View style={{flexDirection:'row', alignItems:'center', padding:10}}>
                        <Ionicons name="search" size={16} color="#666" />
                        <TextInput 
                            style={styles.searchInput} 
                            placeholder="بحث..." 
                            placeholderTextColor="#666"
                            value={search}
                            onChangeText={setSearch}
                        />
                    </View>
                </GlassContainer>
                
                {loading ? <ActivityIndicator color="#fff" style={{marginTop:20}} /> : 
                    <FlatList 
                        data={novels}
                        keyExtractor={item => item._id}
                        renderItem={renderNovelItem}
                        contentContainerStyle={{paddingBottom: 20}}
                        onEndReached={handleLoadMore}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={loadingMore && <ActivityIndicator color="#fff" />}
                        ListEmptyComponent={<Text style={{color:'#666', textAlign:'center'}}>لا توجد نتائج</Text>}
                    />
                }
            </View>

            {/* Config Panel */}
            <View style={styles.leftPane}>
                {selectedNovel ? (
                    <GlassContainer style={{flex: 1, padding: 15, justifyContent: 'space-between'}}>
                        <View>
                            <Text style={styles.selectedTitle}>{selectedNovel.title}</Text>
                            <Text style={styles.infoText}>
                                سيتم إنشاء مهمة في الخلفية للمرور على جميع الفصول ({selectedNovel.chaptersCount || 0}) واستخراج العناوين من السطر الأول.
                            </Text>
                            <Text style={[styles.infoText, {color: '#f43f5e', marginTop: 10}]}>
                                يمكنك الخروج واستخدام التطبيق بحرية أثناء المعالجة.
                            </Text>
                        </View>

                        <TouchableOpacity 
                            style={styles.startBtn} 
                            onPress={startExtractionJob}
                            disabled={startingJob}
                        >
                            {startingJob ? <ActivityIndicator color="#fff" /> : (
                                <>
                                    <Text style={styles.startBtnText}>بدء المهمة</Text>
                                    <Ionicons name="rocket-outline" size={18} color="#fff" />
                                </>
                            )}
                        </TouchableOpacity>
                    </GlassContainer>
                ) : (
                    <View style={{flex:1, justifyContent:'center', alignItems:'center'}}>
                        <Ionicons name="library-outline" size={50} color="#333" />
                        <Text style={{color:'#666', marginTop:10, textAlign:'center'}}>اختر رواية</Text>
                    </View>
                )}
            </View>
        </View>
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
  
  rightPane: { width: '45%', padding: 10 },
  leftPane: { width: '55%', padding: 10 },
  
  searchBox: { marginBottom: 10 },
  searchInput: { flex: 1, color: '#fff', marginLeft: 5, fontSize: 12 },

  novelItem: { marginBottom: 8 },
  novelItemSelected: { borderColor: '#f43f5e', borderWidth: 1, backgroundColor: 'rgba(244, 63, 94, 0.1)' },
  novelCover: { width: 35, height: 50, borderRadius: 4, backgroundColor: '#333' },
  novelTitle: { color: '#fff', fontSize: 12, textAlign: 'right' },
  novelMeta: { color: '#666', fontSize: 10, textAlign: 'right' },

  selectedTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', paddingBottom: 10 },
  infoText: { color: '#ccc', fontSize: 13, lineHeight: 20, textAlign: 'right' },

  startBtn: { 
      marginTop: 'auto', 
      backgroundColor: 'rgba(244, 63, 94, 0.2)', borderWidth: 1, borderColor: '#f43f5e',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', 
      padding: 12, borderRadius: 10, gap: 5 
  },
  startBtnText: { color: '#fff', fontWeight: 'bold' }
});
