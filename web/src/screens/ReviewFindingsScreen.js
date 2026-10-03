
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
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
import { useFocusEffect } from '@react-navigation/native';

// 🚩 الفصول التي بها خلل — تختار الرواية فتشاهد فصولها المشكلة،
// وبعد حذفها وإعادة استيرادها بالسكرابر وإعادة ترجمتها تزيل العلامة يدوياً.

const GlassContainer = ({ children, style }) => (
    <View style={[styles.glassContainer, style]}>
        {children}
    </View>
);

const TYPE_LABELS = {
  english: 'إنجليزي/غير مترجم',
  short: 'قصير جداً',
  repeated: 'فقرات مكررة',
  gibberish: 'لغة مخربطة',
};
const TYPE_COLORS = {
  english: '#f59e0b',
  short: '#ef4444',
  repeated: '#a855f7',
  gibberish: '#06b6d4',
};

export default function ReviewFindingsScreen({ navigation }) {
  const { showToast } = useToast();

  const [novels, setNovels] = useState([]);
  const [selectedNovel, setSelectedNovel] = useState(null);
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [reReviewing, setReReviewing] = useState(false);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({});

  const fetchNovels = async () => {
      try {
          const res = await api.get('/api/review/findings');
          setNovels(res.data || []);
      } catch (e) { console.log(e); }
      finally { setLoading(false); }
  };

  useFocusEffect(
      useCallback(() => {
          fetchNovels();
      }, [])
  );

  const fetchFindings = async (novelId) => {
      setFindingsLoading(true);
      try {
          const res = await api.get(`/api/review/findings?novelId=${novelId}`);
          setFindings(res.data || []);
      } catch (e) {
          console.log(e);
          showToast("فشل جلب الفصول المعلَّمة", "error");
      } finally { setFindingsLoading(false); }
  };

  const handleSelectNovel = (novel) => {
      setSelectedNovel(novel);
      fetchFindings(novel.novelId);
  };

  const removeFinding = (finding) => {
      setAlertConfig({
          title: "إزالة العلامة",
          message: `إزالة العلامة عن الفصل #${finding.chapter}؟\nاستخدم هذا بعد حذف الفصل وإعادة استيراده بالسكرابر وإعادة ترجمته.`,
          type: 'warning',
          confirmText: "إزالة",
          onConfirm: async () => {
              setAlertVisible(false);
              try {
                  await api.delete(`/api/review/findings/${finding._id}`);
                  showToast("تمت إزالة العلامة", "success");
                  fetchFindings(selectedNovel.novelId);
                  fetchNovels();
              } catch (e) { showToast("فشل إزالة العلامة", "error"); }
          }
      });
      setAlertVisible(true);
  };

  const reReview = () => {
      if (!selectedNovel) return;
      setAlertConfig({
          title: "إعادة المراجعة",
          message: `إعادة فحص كل الفصول المعلَّمة لـ"${selectedNovel.novelTitle}" (${findings.length} فصلاً)؟`,
          type: 'info',
          confirmText: "ابدأ",
          onConfirm: async () => {
              setAlertVisible(false);
              setReReviewing(true);
              try {
                  await api.post('/api/review/findings/re-review', { novelId: selectedNovel.novelId });
                  showToast("بدأت إعادة المراجعة", "success");
                  navigation.navigate('ReviewHub');
              } catch (e) { showToast("فشل بدء إعادة المراجعة", "error"); }
              finally { setReReviewing(false); }
          }
      });
      setAlertVisible(true);
  };

  const renderNovelItem = ({ item }) => (
      <TouchableOpacity onPress={() => handleSelectNovel(item)} activeOpacity={0.8}>
          <GlassContainer style={[styles.novelItem, selectedNovel?.novelId === item.novelId && styles.novelItemSelected]}>
              <View style={{flexDirection:'row-reverse', alignItems:'center', padding: 10, gap: 10}}>
                  <Image source={{uri: item.cover}} style={styles.novelCover} />
                  <View style={{flex:1}}>
                      <Text style={styles.novelTitle} numberOfLines={2}>{item.novelTitle}</Text>
                      <Text style={styles.novelMeta}>🚩 {item.count} فصلاً بها خلل</Text>
                  </View>
                  <Ionicons name="chevron-back" size={18} color="#666" />
              </View>
          </GlassContainer>
      </TouchableOpacity>
  );

  const renderFinding = ({ item }) => (
      <View style={styles.findingCard}>
          <Text style={styles.findingChapter}>
              الفصل #{item.chapter} {item.chapterTitle ? `— ${item.chapterTitle}` : ''}
          </Text>
          <View style={{flexDirection:'row-reverse', flexWrap:'wrap', gap: 6, marginVertical: 6}}>
              {(item.types || []).map((t, i) => (
                  <View key={i} style={[styles.typeBadge, {borderColor: TYPE_COLORS[t] || '#888'}]}>
                      <Text style={[styles.typeBadgeText, {color: TYPE_COLORS[t] || '#888'}]}>{TYPE_LABELS[t] || t}</Text>
                  </View>
              ))}
          </View>
          {item.details ? <Text style={styles.findingDetails}>{item.details}</Text> : null}
          <TouchableOpacity style={styles.removeBtn} onPress={() => removeFinding(item)}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#4ade80" />
              <Text style={styles.removeBtnText}>إزالة العلامة (تمت معالجته)</Text>
          </TouchableOpacity>
      </View>
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
            <Text style={styles.headerTitle}>الفصول التي بها خلل</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
        </View>

        {!selectedNovel ? (
            // المرحلة 1: اختيار الرواية من بين الروايات التي بها فصول معلَّمة
            <View style={{flex: 1, padding: 15}}>
                {loading ? <ActivityIndicator color="#fff" style={{marginTop: 30}} /> : (
                    novels.length === 0 ? (
                        <Text style={{color:'#666', textAlign:'center', marginTop: 60}}>🎉 لا توجد فصول معلَّمة حالياً — كل الروايات سليمة.</Text>
                    ) : (
                        <FlatList
                            data={novels}
                            keyExtractor={item => String(item.novelId)}
                            renderItem={renderNovelItem}
                            contentContainerStyle={{paddingBottom: 20}}
                        />
                    )
                )}
            </View>
        ) : (
            // المرحلة 2: فصول الرواية المعلَّمة
            <View style={{flex: 1, padding: 15}}>
                <View style={styles.novelHeader}>
                    <TouchableOpacity onPress={() => { setSelectedNovel(null); setFindings([]); }} style={styles.backBtn}>
                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.novelHeaderTitle} numberOfLines={1}>{selectedNovel.novelTitle}</Text>
                </View>

                {findingsLoading ? (
                    <ActivityIndicator color="#fff" style={{marginTop: 30}} />
                ) : (
                    <>
                        <FlatList
                            data={findings}
                            keyExtractor={item => String(item._id)}
                            renderItem={renderFinding}
                            contentContainerStyle={{paddingBottom: 90}}
                            ListEmptyComponent={
                                <Text style={{color:'#666', textAlign:'center', marginTop: 50}}>لا فصول معلَّمة — اضغط رجوع للتحديث.</Text>
                            }
                        />
                        {findings.length > 0 && (
                            <View style={styles.bottomBar}>
                                <TouchableOpacity style={styles.reReviewBtn} onPress={reReview} disabled={reReviewing}>
                                    {reReviewing
                                        ? <ActivityIndicator size="small" color="#fff" />
                                        : <Ionicons name="refresh" size={18} color="#fff" />}
                                    <Text style={styles.reReviewText}>إعادة مراجعة الفصول المعلَّمة</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </>
                )}
            </View>
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

  novelItem: { marginBottom: 8 },
  novelItemSelected: { borderColor: '#fff', borderWidth: 1 },
  novelCover: { width: 35, height: 50, borderRadius: 4, backgroundColor: '#333' },
  novelTitle: { color: '#fff', fontSize: 12, textAlign: 'right' },
  novelMeta: { color: '#f59e0b', fontSize: 10, textAlign: 'right', marginTop: 2 },

  novelHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 12 },
  backBtn: { padding: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)' },
  novelHeaderTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', flex: 1, textAlign: 'right' },

  findingCard: {
      backgroundColor: 'rgba(20, 20, 20, 0.75)',
      borderWidth: 1,
      borderColor: 'rgba(255, 68, 68, 0.3)',
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
  },
  findingChapter: { color: '#fff', fontSize: 13, fontWeight: 'bold', textAlign: 'right' },
  typeBadge: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: 'rgba(0,0,0,0.3)' },
  typeBadgeText: { fontSize: 10, fontWeight: 'bold' },
  findingDetails: { color: '#999', fontSize: 11, textAlign: 'right', lineHeight: 17, marginBottom: 4 },

  removeBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 6, alignSelf: 'flex-start' },
  removeBtnText: { color: '#4ade80', fontSize: 11, fontWeight: 'bold' },

  bottomBar: { position: 'absolute', bottom: 10, left: 15, right: 15 },
  reReviewBtn: {
      backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      padding: 14, borderRadius: 12, gap: 8,
  },
  reReviewText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
});
