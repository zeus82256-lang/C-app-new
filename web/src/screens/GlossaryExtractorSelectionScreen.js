
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
  Keyboard,
  StatusBar,
  ImageBackground
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import CustomAlert from '../components/CustomAlert';

// 📚 اختيار الرواية لاستخراج المصطلحات — نفس واجهة اختيار رواية الترجمة بالضبط سوى أنه مستخرج

const GlassContainer = ({ children, style }) => (
    <View style={[styles.glassContainer, style]}>
        {children}
    </View>
);

export default function GlossaryExtractorSelectionScreen({ navigation }) {
  const { showToast } = useToast();

  // State for List & Pagination
  const [novels, setNovels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');

  // Selection State
  const [selectedNovel, setSelectedNovel] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [selectionMode, setSelectionMode] = useState('all');
  const [selectedChapters, setSelectedChapters] = useState([]);
  const [rangeInput, setRangeInput] = useState('');
  // ⏱️ الفاصل بين كل فصل والذي يليه (بالثواني) — لتقليل الاستهلاك والسرعة
  const [delayInput, setDelayInput] = useState('3');

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({});

  useEffect(() => {
      fetchNovels(1);
  }, []);

  // Debounce Search Effect
  useEffect(() => {
      const delayDebounce = setTimeout(() => {
          fetchNovels(1);
      }, 500);

      return () => clearTimeout(delayDebounce);
  }, [search]);

  // 🔥 TRUE LAZY LOADING FETCH 🔥
  const fetchNovels = async (pageNum) => {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      try {
          const res = await api.get('/api/glossary-ai/novels', {
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

          setHasMore(newNovels.length === 20); // If < 20, we reached end
          setPage(pageNum);

      } catch(e) {
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

  const fetchChapters = async (novelId) => {
      setChaptersLoading(true);
      setChapters([]);
      try {
          // 🔥 نفس نداء التطبيق: chapters-list يضمن جلب الفصول
          const res = await api.get(`/api/novels/${novelId}/chapters-list?limit=10000`);
          if (res.data) {
              const list = Array.isArray(res.data) ? res.data : (res.data?.chapters || []);
              setChapters(list);
          }
      } catch(e) {
          console.log(e);
          showToast("فشل جلب الفصول", "error");
      } finally {
          setChaptersLoading(false);
      }
  };

  const handleSelectNovel = (novel) => {
      setSelectedNovel(novel);
      fetchChapters(novel._id);
      setSelectedChapters([]);
      setRangeInput('');
      setSelectionMode('all');
  };

  const toggleChapter = (num) => {
      if (selectedChapters.includes(num)) {
          setSelectedChapters(prev => prev.filter(c => c !== num));
      } else {
          setSelectedChapters(prev => [...prev, num]);
      }
  };

  /** تطبيق النطاق — يدعم "25-100" و"150-!" (إلى آخر فصل) وأرقاماً مفردة مفصولة بفواصل "12,50" */
  const handleApplyRange = () => {
      if (!rangeInput.trim()) { showToast("يرجى إدخال نطاق", "error"); return; }
      const input = rangeInput.trim();
      let newSelection = [];
      const availableNumbers = chapters.map(c => c.number);
      const maxChap = availableNumbers.length > 0 ? Math.max(...availableNumbers) : 0;

      for (const token of input.split(/[,،]/)) {
          const part = token.trim();
          if (!part) continue;
          if (part.includes('-!')) {
              const [startStr] = part.split('-!');
              const start = parseInt(startStr);
              if (isNaN(start)) continue;
              for (let i = start; i <= maxChap; i++) if (availableNumbers.includes(i) && !newSelection.includes(i)) newSelection.push(i);
          } else if (part.includes('-')) {
              const parts = part.split('-');
              const start = parseInt(parts[0]);
              const end = parseInt(parts[1]);
              if (isNaN(start) || isNaN(end)) continue;
              for (let i = start; i <= end; i++) if (availableNumbers.includes(i) && !newSelection.includes(i)) newSelection.push(i);
          } else {
              const num = parseInt(part);
              if (!isNaN(num) && availableNumbers.includes(num) && !newSelection.includes(num)) newSelection.push(num);
          }
      }

      if (newSelection.length === 0) showToast("لم يتم العثور على فصول", "warning");
      else {
          setSelectedChapters(newSelection);
          showToast(`تم تحديد ${newSelection.length} فصل`, "success");
          Keyboard.dismiss();
      }
  };

  const confirmExtraction = () => {
      if (!selectedNovel) return;
      const count = selectionMode === 'manual' ? selectedChapters.length : (chapters.length || 'الكل');
      if (selectionMode === 'manual' && selectedChapters.length === 0) {
          showToast("الرجاء تحديد فصل واحد على الأقل", "error");
          return;
      }
      setAlertConfig({
          title: "تأكيد الاستخراج",
          message: `هل أنت متأكد من بدء استخراج مصطلحات "${selectedNovel.title}"؟\nعدد الفصول: ${count}`,
          type: 'info',
          confirmText: 'ابدأ الآن',
          onConfirm: startExtraction
      });
      setAlertVisible(true);
  };

  const startExtraction = async () => {
      setAlertVisible(false);
      try {
          // ⏱️ الفاصل بالثواني (0 - 3600) — يُطبق بين كل فصل والذي يليه
          const delaySec = parseFloat(String(delayInput).replace(',', '.'));
          const safeDelay = Number.isFinite(delaySec) && delaySec >= 0 && delaySec <= 3600 ? delaySec : 3;
          await api.post('/api/glossary-ai/start', {
              novelId: selectedNovel._id,
              chapters: selectionMode === 'manual' ? selectedChapters : 'all',
              chapterDelay: safeDelay,
          });
          showToast("تم بدء استخراج المصطلحات", "success");
          navigation.navigate('GlossaryExtractorHub');
      } catch (e) { showToast("فشل بدء الاستخراج", "error"); }
  };

  const renderNovelItem = ({ item }) => (
      <TouchableOpacity onPress={() => handleSelectNovel(item)} activeOpacity={0.8}>
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
            <Text style={styles.headerTitle}>اختيار الرواية</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
        </View>

        <View style={{flex:1, flexDirection:'row-reverse'}}>
            {/* Right: Novels List (Pagination) */}
            <View style={styles.rightPane}>
                <GlassContainer style={styles.searchBox}>
                    <View style={{flexDirection:'row', alignItems:'center', padding:10}}>
                        <Ionicons name="search" size={16} color="#666" />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="بحث في السيرفر..."
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
                        ListFooterComponent={() => (
                            hasMore ? (
                                <TouchableOpacity
                                    style={styles.loadMoreBtn}
                                    onPress={handleLoadMore}
                                    disabled={loadingMore}
                                >
                                    {loadingMore ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <Text style={styles.loadMoreText}>تحميل المزيد</Text>
                                    )}
                                </TouchableOpacity>
                            ) : null
                        )}
                        ListEmptyComponent={
                            <Text style={{color:'#666', textAlign:'center', marginTop:20}}>لا توجد نتائج</Text>
                        }
                    />
                }
            </View>

            {/* Left: Config */}
            <View style={styles.leftPane}>
                {selectedNovel ? (
                    <GlassContainer style={{flex: 1, padding: 15}}>
                        <Text style={styles.selectedTitle}>{selectedNovel.title}</Text>

                        <View style={styles.modeSwitch}>
                            <TouchableOpacity style={[styles.modeBtn, selectionMode === 'all' && styles.modeBtnActive]} onPress={() => setSelectionMode('all')}>
                                <Text style={[styles.modeText, selectionMode === 'all' && {color:'#fff'}]}>الكل</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modeBtn, selectionMode === 'manual' && styles.modeBtnActive]} onPress={() => setSelectionMode('manual')}>
                                <Text style={[styles.modeText, selectionMode === 'manual' && {color:'#fff'}]}>تحديد</Text>
                            </TouchableOpacity>
                        </View>

                        {/* ⏱️ الفاصل بين الفصول — تحكم كامل من الواجهة لتقليل السرعة/الاستهلاك */}
                        <View style={styles.delayRow}>
                            <Text style={styles.delayLabel}>⏱️ الفاصل بين كل فصل (ثواني)</Text>
                            <TextInput
                                style={styles.delayInput}
                                placeholder="3"
                                placeholderTextColor="#666"
                                keyboardType="decimal-pad"
                                value={delayInput}
                                onChangeText={setDelayInput}
                            />
                        </View>

                        {selectionMode === 'manual' && (
                            <View style={{flex: 1}}>
                                <View style={styles.rangeInputRow}>
                                    <TextInput
                                        style={styles.rangeInput}
                                        placeholder="25-100 أو 12,50 أو 150-!"
                                        placeholderTextColor="#666"
                                        value={rangeInput}
                                        onChangeText={setRangeInput}
                                    />
                                    <TouchableOpacity style={styles.rangeApplyBtn} onPress={handleApplyRange}>
                                        <Text style={styles.rangeApplyText}>ok</Text>
                                    </TouchableOpacity>
                                </View>
                                {chaptersLoading ? (
                                    <ActivityIndicator color="#fff" style={{marginTop: 20}} />
                                ) : (
                                    <FlatList
                                        data={chapters}
                                        keyExtractor={item => item.number.toString()}
                                        style={{flex:1, marginTop: 10}}
                                        renderItem={({item}) => (
                                            <TouchableOpacity
                                                style={[styles.chapItem, selectedChapters.includes(item.number) && styles.chapItemActive]}
                                                onPress={() => toggleChapter(item.number)}
                                            >
                                                <Text style={[styles.chapText, selectedChapters.includes(item.number) && {color:'#fff'}]}>
                                                    #{item.number} - {item.title || ''}
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                    />
                                )}
                            </View>
                        )}

                        <TouchableOpacity style={styles.startBtn} onPress={confirmExtraction}>
                            <Text style={styles.startBtnText}>ابدأ استخراج المصطلحات</Text>
                            <Ionicons name="play" size={18} color="#fff" />
                        </TouchableOpacity>
                    </GlassContainer>
                ) : (
                    <View style={{flex:1, justifyContent:'center', alignItems:'center'}}>
                        <Ionicons name="arrow-back" size={40} color="#333" />
                        <Text style={{color:'#666', marginTop:10}}>اختر رواية</Text>
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
  novelItemSelected: { borderColor: '#fff', borderWidth: 1 },
  novelCover: { width: 35, height: 50, borderRadius: 4, backgroundColor: '#333' },
  novelTitle: { color: '#fff', fontSize: 12, textAlign: 'right' },
  novelMeta: { color: '#666', fontSize: 10, textAlign: 'right' },

  loadMoreBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#333' },
  loadMoreText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  selectedTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
  modeSwitch: { flexDirection: 'row-reverse', backgroundColor: '#111', padding: 4, borderRadius: 8, marginBottom: 10 },
  modeBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  modeBtnActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  modeText: { color: '#666', fontSize: 11, fontWeight: 'bold' },

  delayRow: {
      flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: '#111', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10,
  },
  delayLabel: { color: '#999', fontSize: 11, fontWeight: 'bold' },
  delayInput: {
      backgroundColor: '#222', color: '#fff', borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10,
      minWidth: 70, textAlign: 'center', fontSize: 12,
  },

  rangeInputRow: { flexDirection: 'row-reverse', gap: 5 },
  rangeInput: { flex: 1, backgroundColor: '#222', color: '#fff', borderRadius: 6, padding: 8, textAlign: 'center', fontSize: 12 },
  rangeApplyBtn: { backgroundColor: '#333', borderRadius: 6, paddingHorizontal: 10, justifyContent: 'center' },
  rangeApplyText: { color: '#fff', fontSize: 10 },

  chapItem: { padding: 8, borderBottomWidth: 1, borderColor: '#222', alignItems: 'flex-end' },
  chapItemActive: { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  chapText: { color: '#ccc', fontSize: 12, textAlign: 'right' },

  startBtn: {
      marginTop: 'auto',
      backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      padding: 12, borderRadius: 10, gap: 5
  },
  startBtnText: { color: '#fff', fontWeight: 'bold' }
});
