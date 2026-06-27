import React, { useState, useCallback, useContext, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  StatusBar,
  ImageBackground,
  TextInput
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// Standard Glass Card
const GlassCard = ({ children, style, onPress }) => (
    <TouchableOpacity 
        style={[styles.glassCard, style]} 
        onPress={onPress}
        activeOpacity={0.9}
        disabled={!onPress}
    >
        {children}
    </TouchableOpacity>
);

export default function ManagementScreen({ navigation }) {
  const { userInfo } = useContext(AuthContext);
  const { showToast } = useToast();
  const [novels, setNovels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortAscending, setSortAscending] = useState(true); // true = تصاعدي, false = تنازلي
  const [sortBy, setSortBy] = useState('title'); // 'title' أو 'date'

  useFocusEffect(
    useCallback(() => {
      fetchMyNovels();
    }, [])
  );

  const fetchMyNovels = async () => {
    setLoading(true);
    try {
      // جلب جميع الأعمال بوضع حد كبير (مثلاً 1000) لتغطية أكبر عدد
      const res = await api.get('/api/user/stats?limit=1000');
      setNovels(res.data.myWorks || []);
    } catch (e) {
      console.error(e);
      showToast("فشل جلب الأعمال", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (novelId) => {
    Alert.alert(
      "حذف الرواية",
      "هل أنت متأكد؟ سيتم حذف الرواية وجميع الفصول نهائياً.",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/api/admin/novels/${novelId}`);
              showToast("تم الحذف بنجاح", "success");
              fetchMyNovels();
            } catch (e) {
              showToast("فشل الحذف", "error");
            }
          }
        }
      ]
    );
  };

  // تصفية وترتيب الأعمال بناءً على البحث ومعيار الترتيب
  const filteredAndSortedNovels = useMemo(() => {
    // تصفية حسب البحث (في العنوان)
    let filtered = novels.filter(item =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    // ترتيب حسب المعيار المختار
    filtered.sort((a, b) => {
      if (sortBy === 'title') {
        // ترتيب حسب العنوان أبجدياً
        const comparison = a.title.localeCompare(b.title, 'ar');
        return sortAscending ? comparison : -comparison;
      } else {
        // ترتيب حسب التاريخ (آخر تحديث أو إنشاء)
        // نفترض وجود updatedAt أو createdAt
        const dateA = a.updatedAt ? new Date(a.updatedAt) : (a.createdAt ? new Date(a.createdAt) : new Date(0));
        const dateB = b.updatedAt ? new Date(b.updatedAt) : (b.createdAt ? new Date(b.createdAt) : new Date(0));
        // التاريخ الأحدث يأتي أولاً إذا كان sortAscending = false (تنازلي)
        if (sortAscending) {
          return dateA - dateB; // أقدم أولاً
        } else {
          return dateB - dateA; // أحدث أولاً
        }
      }
    });
    
    return filtered;
  }, [novels, searchQuery, sortAscending, sortBy]);

  // تبديل معيار الترتيب بين العنوان والتاريخ
  const toggleSortBy = () => {
    setSortBy(prev => prev === 'title' ? 'date' : 'title');
  };

  const renderItem = ({ item }) => (
    <GlassCard style={styles.card}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', padding: 12 }}>
          <Image 
            source={item.cover} 
            style={styles.cover} 
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
            <View style={styles.statsRow}>
                <Text style={styles.statText}>{item.chaptersCount || (item.chapters?.length || 0)} فصل</Text>
                <Text style={styles.statText}>•</Text>
                <Text style={styles.statText}>{item.views || 0} مشاهدة</Text>
            </View>
            <View style={styles.actions}>
                <TouchableOpacity 
                    style={[styles.actionBtn, styles.editBtn]} 
                    onPress={() => navigation.navigate('AdminDashboard', { editNovel: item })}
                >
                    <Ionicons name="create-outline" size={16} color="#fff" />
                    <Text style={styles.btnText}>تعديل</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={[styles.actionBtn, styles.addBtn]}
                    onPress={() => navigation.navigate('AdminDashboard', { 
                        addChapterMode: { 
                            novelId: item._id, 
                            nextNumber: (item.chapters ? item.chapters.length + 1 : 1).toString(),
                            novelTitle: item.title
                        } 
                    })}
                >
                    <Ionicons name="add-circle-outline" size={16} color="#fff" />
                    <Text style={styles.btnText}>فصل</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={[styles.actionBtn, styles.deleteBtn]}
                    onPress={() => handleDelete(item._id)}
                >
                    <Ionicons name="trash-outline" size={16} color="#ff4444" />
                </TouchableOpacity>
            </View>
          </View>
      </View>
    </GlassCard>
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
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Ionicons name="arrow-forward" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>أعمالي</Text>
            <TouchableOpacity 
                style={styles.addNovelBtn}
                onPress={() => navigation.navigate('AdminDashboard')}
            >
                <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
        </View>

        {/* شريط البحث وزر الترتيب */}
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث باسم الرواية..."
              placeholderTextColor="#888"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          
          {/* زر تبديل معيار الترتيب (حسب العنوان أو التاريخ) */}
          <TouchableOpacity 
            style={styles.sortButton} 
            onPress={toggleSortBy}
          >
            <Ionicons 
              name={sortBy === 'title' ? "text" : "time-outline"} 
              size={22} 
              color="#fff" 
            />
          </TouchableOpacity>
          
          {/* زر اتجاه الترتيب */}
          <TouchableOpacity 
            style={styles.sortButton} 
            onPress={() => setSortAscending(prev => !prev)}
          >
            <Ionicons 
              name={sortAscending ? "arrow-up" : "arrow-down"} 
              size={22} 
              color="#fff" 
            />
          </TouchableOpacity>
        </View>

        {loading ? (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#fff" />
            </View>
        ) : (
            <FlatList
                data={filteredAndSortedNovels}
                keyExtractor={item => item._id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.centered}>
                        <Text style={styles.emptyText}>
                          {searchQuery ? 'لا توجد نتائج مطابقة للبحث' : 'لم تقم بنشر أي أعمال بعد.'}
                        </Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  backBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  
  // Glassy Button
  addNovelBtn: { 
      backgroundColor: 'rgba(255,255,255,0.1)', 
      borderRadius: 12, width: 44, height: 44, 
      justifyContent: 'center', alignItems: 'center',
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)'
  },
  
  listContent: { padding: 15 },
  
  // Glass Card Style
  glassCard: {
      backgroundColor: 'rgba(20, 20, 20, 0.75)',
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      marginBottom: 15
  },
  
  cover: { width: 70, height: 100, borderRadius: 8, marginLeft: 15, backgroundColor: '#333' },
  info: { flex: 1, alignItems: 'flex-end' },
  title: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 5, textAlign: 'right' },
  statsRow: { flexDirection: 'row-reverse', gap: 5, marginBottom: 10 },
  statText: { color: '#888', fontSize: 12 },
  
  actions: { flexDirection: 'row-reverse', gap: 10, width: '100%' },
  actionBtn: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, gap: 5, borderWidth: 1 },
  
  // Glassy Action Buttons
  editBtn: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.2)' },
  addBtn: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.2)' },
  deleteBtn: { backgroundColor: 'rgba(255, 68, 68, 0.1)', borderColor: '#ff4444', paddingHorizontal: 10 },
  
  btnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#666', fontSize: 16 },

  // أنماط جديدة للبحث والترتيب
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    marginBottom: 10,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginRight: 10,
    paddingHorizontal: 10,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    textAlign: 'right',
    paddingVertical: 8,
  },
  sortButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginLeft: 8,
  },
});