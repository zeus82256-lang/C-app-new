import React, { useContext, useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  StatusBar,
  ImageBackground,
  Modal,
  FlatList,
  TextInput,
  Animated,
  Easing
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import CustomAlert from '../components/CustomAlert';

const { width } = Dimensions.get('window');

const GlassCard = ({ children, style, onPress }) => (
    <TouchableOpacity 
        style={[styles.glassCard, style]} 
        onPress={onPress}
        activeOpacity={0.9}
        disabled={!onPress}
    >
        <LinearGradient
            colors={['rgba(20, 20, 20, 0.7)', 'rgba(20, 20, 20, 0.9)']}
            style={StyleSheet.absoluteFill}
        />
        {children}
    </TouchableOpacity>
);

export default function AdminMainScreen({ navigation }) {
  const { userInfo } = useContext(AuthContext);
  const { showToast } = useToast();
  const [stats, setStats] = useState({ users: 0, novels: 0, views: 0 });
  const [loading, setLoading] = useState(true);

  const [showUserPicker, setShowUserPicker] = useState(false);
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({});

  // 🔥 GLOBAL REPLACEMENTS STATE 🔥
  const [showReplacementsModal, setShowReplacementsModal] = useState(false);
  const [replacementsList, setReplacementsList] = useState([]);
  const [repLoading, setRepLoading] = useState(false);
  const [newOriginal, setNewOriginal] = useState('');
  const [newReplacement, setNewReplacement] = useState('');
  const [editingRepId, setEditingRepId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' = أقدم أولاً, 'desc' = أحدث أولاً

  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
      fetchStats();
  }, []);

  // فلترة وترتيب الاستبدالات حسب الوقت
  const filteredAndSortedReplacements = useMemo(() => {
    let filtered = replacementsList.filter(item => 
      item.original.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.replacement && item.replacement.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    
    // ترتيب زمني باستخدام _id (ObjectId يحتوي على طابع زمني)
    filtered.sort((a, b) => {
      if (sortOrder === 'asc') {
        // أقدم أولاً (a أقدم من b)
        return a._id.localeCompare(b._id);
      } else {
        // أحدث أولاً (b أحدث من a)
        return b._id.localeCompare(a._id);
      }
    });
    return filtered;
  }, [replacementsList, searchQuery, sortOrder]);

  const fetchReplacements = async () => {
      setRepLoading(true);
      try {
          const res = await api.get('/api/admin/global-replacements');
          setReplacementsList(res.data);
      } catch (e) {
          showToast("فشل جلب الاستبدالات", "error");
      } finally {
          setRepLoading(false);
      }
  };

  const handleOpenReplacements = () => {
      setShowReplacementsModal(true);
      fetchReplacements();
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease)
        }),
        Animated.spring(slideAnim, {
          toValue: 1,
          tension: 65,
          friction: 11,
          useNativeDriver: true
        })
      ]).start();
  };

  const handleCloseReplacements = () => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true
        })
      ]).start(() => setShowReplacementsModal(false));
  };

  const handleSaveReplacement = async () => {
      if (!newOriginal.trim()) {
          showToast("الكلمة الأصلية مطلوبة", "error");
          return;
      }
      setRepLoading(true);
      try {
          if (editingRepId) {
              const res = await api.put(`/api/admin/global-replacements/${editingRepId}`, {
                  original: newOriginal,
                  replacement: newReplacement
              });
              setReplacementsList(res.data.list);
              showToast("تم التعديل", "success");
          } else {
              const res = await api.post('/api/admin/global-replacements', {
                  original: newOriginal,
                  replacement: newReplacement
              });
              setReplacementsList(res.data.list);
              showToast("تم الإضافة", "success");
          }
          setNewOriginal('');
          setNewReplacement('');
          setEditingRepId(null);
      } catch (e) {
          showToast("فشلت العملية", "error");
      } finally {
          setRepLoading(false);
      }
  };

  const handleDeleteReplacement = async (id) => {
      setRepLoading(true);
      try {
          const res = await api.delete(`/api/admin/global-replacements/${id}`);
          setReplacementsList(res.data.list);
          showToast("تم الحذف", "success");
      } catch (e) {
          showToast("فشل الحذف", "error");
      } finally {
          setRepLoading(false);
      }
  };

  const startEditReplacement = (item) => {
      setNewOriginal(item.original);
      setNewReplacement(item.replacement);
      setEditingRepId(item._id);
  };

  const fetchStats = async () => {
      try {
          const usersRes = await api.get('/api/admin/users');
          const novelsRes = await api.get('/api/novels?limit=1'); 
          
          setStats({
              users: usersRes.data.length,
              novels: novelsRes.data.totalNovels || 0,
              views: '---' 
          });
      } catch (e) {
          console.log(e);
      } finally {
          setLoading(false);
      }
  };

  const fetchUsers = async () => {
      setUsersLoading(true);
      try {
          const res = await api.get('/api/admin/users');
          setUsersList(res.data);
      } catch (e) {
          showToast("فشل جلب قائمة المستخدمين", "error");
      } finally {
          setUsersLoading(false);
      }
  };

  const handleOpenTransferModal = () => {
      fetchUsers();
      setShowUserPicker(true);
  };

  const confirmTransfer = (targetUser) => {
      setShowUserPicker(false);
      setAlertConfig({
          title: "نقل ملكية شامل",
          message: `هل أنت متأكد من نقل ملكية جميع الروايات في التطبيق إلى المستخدم "${targetUser.name}"؟ هذا إجراء لا يمكن التراجع عنه بسهولة.`,
          type: 'danger',
          confirmText: "نعم، انقل الملكية",
          cancelText: "إلغاء",
          onConfirm: () => {
              setAlertVisible(false);
              performTransfer(targetUser._id);
          }
      });
      setAlertVisible(true);
  };

  const performTransfer = async (targetUserId) => {
      setLoading(true); 
      try {
          const res = await api.put('/api/admin/ownership/transfer-all', { targetUserId });
          showToast(`تم نقل ${res.data.modifiedCount} رواية بنجاح إلى المالك الجديد`, "success");
      } catch (e) {
          const msg = e.response?.data?.message || "فشل نقل الملكية";
          showToast(msg, "error");
      } finally {
          setLoading(false);
      }
  };

  const DashboardButton = ({ title, icon, color, onPress, subtitle }) => (
      <GlassCard onPress={onPress} style={styles.dashboardBtn}>
          <View style={[styles.iconCircle, { backgroundColor: `${color}20` }]}>
              <Ionicons name={icon} size={28} color={color} />
          </View>
          <View style={styles.btnContent}>
              <Text style={styles.btnTitle}>{title}</Text>
              {subtitle && <Text style={styles.btnSubtitle}>{subtitle}</Text>}
          </View>
          <Ionicons name="chevron-back" size={20} color="#444" />
      </GlassCard>
  );

  const filteredUsers = usersList.filter(u => 
      u.name.toLowerCase().includes(userSearch.toLowerCase()) || 
      u.email.toLowerCase().includes(userSearch.toLowerCase())
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

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
            <View>
                <Text style={styles.greeting}>مرحباً، {userInfo?.name}</Text>
                <Text style={styles.roleText}>لوحة تحكم المشرف العام</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
            
            {/* Quick Stats Grid */}
            <View style={styles.statsContainer}>
                <GlassCard style={styles.statCard}>
                    <Text style={styles.statNumber}>{loading ? '...' : stats.users}</Text>
                    <Text style={styles.statLabel}>المستخدمين</Text>
                    <Ionicons name="people" size={20} color="#a855f7" style={styles.statIcon} />
                </GlassCard>
                
                <GlassCard style={styles.statCard}>
                    <Text style={styles.statNumber}>{loading ? '...' : stats.novels}</Text>
                    <Text style={styles.statLabel}>الروايات</Text>
                    <Ionicons name="library" size={20} color="#3b82f6" style={styles.statIcon} />
                </GlassCard>
            </View>

            <Text style={styles.sectionTitle}>الذكاء الاصطناعي</Text>
            <View style={styles.grid}>
                <DashboardButton 
                    title="المترجم الذكي (AI)" 
                    subtitle="إدارة الترجمة الآلية، المفاتيح، المسرد"
                    icon="language" 
                    color="#06b6d4" 
                    onPress={() => navigation.navigate('TranslatorHub')}
                />
                <DashboardButton 
                    title="مولد العناوين AI" 
                    subtitle="توليد عناوين للفصول تلقائياً"
                    icon="text" 
                    color="#10b981" 
                    onPress={() => navigation.navigate('TitleGeneratorHub')}
                />
                <DashboardButton 
                    title="الاستيراد الآلي (Scraper)" 
                    subtitle="سحب الروايات من المواقع الخارجية"
                    icon="planet" 
                    color="#8b5cf6" 
                    onPress={() => navigation.navigate('AutoImport')}
                />
            </View>

            <Text style={styles.sectionTitle}>أدوات النشر</Text>
            <View style={styles.grid}>
                <DashboardButton 
                    title="النشر المتعدد (ZIP)" 
                    subtitle="رفع ملف مضغوط للفصول"
                    icon="cloud-upload" 
                    color="#f59e0b" 
                    onPress={() => navigation.navigate('BulkUpload')}
                />
                <DashboardButton 
                    title="إنشاء عمل جديد" 
                    subtitle="إضافة رواية جديدة يدوياً"
                    icon="add-circle" 
                    color="#10b981" 
                    onPress={() => navigation.navigate('AdminDashboard')}
                />
                <DashboardButton 
                    title="ناشر نادي الروايات 🚀" 
                    subtitle="نشر تلقائي للروايات في النادي"
                    icon="rocket" 
                    color="#f43f5e" 
                    onPress={() => navigation.navigate('NadiPublisherHub')}
                />
            </View>

            <Text style={styles.sectionTitle}>الإدارة العامة</Text>
            <View style={styles.grid}>
                <DashboardButton 
                    title="إدارة المستخدمين" 
                    subtitle="الصلاحيات، الحظر، الحذف"
                    icon="people-circle" 
                    color="#f43f5e" 
                    onPress={() => navigation.navigate('UsersManagement')}
                />
                <DashboardButton 
                    title="إدارة الروايات" 
                    subtitle="تعديل، حذف، إضافة فصول"
                    icon="book" 
                    color="#3b82f6" 
                    onPress={() => navigation.navigate('Management')}
                />
                <DashboardButton 
                    title="نقل ملكية الكل" 
                    subtitle="نقل جميع روايات التطبيق لمستخدم واحد"
                    icon="swap-horizontal" 
                    color="#d946ef" 
                    onPress={handleOpenTransferModal}
                />
                <DashboardButton 
                    title="تنقية الفصول (Global)" 
                    subtitle="استبدال كلمات في جميع الروايات"
                    icon="color-filter" 
                    color="#f97316" 
                    onPress={handleOpenReplacements}
                />
            </View>

            <Text style={styles.sectionTitle}>أدوات الصيانة</Text>
            <View style={styles.grid}>
                <DashboardButton 
                    title="مستخرج العناوين" 
                    subtitle="استخراج العناوين من داخل نص الفصول"
                    icon="hammer" 
                    color="#ff6b6b" 
                    onPress={() => navigation.navigate('ChapterTitleFixer')}
                />
            </View>

        </ScrollView>

        {/* USER PICKER MODAL */}
        <Modal visible={showUserPicker} transparent animationType="slide" onRequestClose={() => setShowUserPicker(false)}>
            <View style={styles.modalBg}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>اختر المالك الجديد للروايات</Text>
                    
                    <View style={styles.searchBox}>
                        <Ionicons name="search" size={20} color="#666" />
                        <TextInput 
                            style={styles.searchInput}
                            placeholder="بحث عن مستخدم..."
                            placeholderTextColor="#666"
                            value={userSearch}
                            onChangeText={setUserSearch}
                            textAlign="right"
                        />
                    </View>

                    {usersLoading ? (
                        <ActivityIndicator color="#fff" style={{marginVertical: 20}} />
                    ) : (
                        <FlatList
                            data={filteredUsers}
                            keyExtractor={item => item._id}
                            style={{maxHeight: 400}}
                            renderItem={({item}) => (
                                <TouchableOpacity style={styles.userItem} onPress={() => confirmTransfer(item)}>
                                    <View>
                                        <Text style={styles.userName}>{item.name}</Text>
                                        <Text style={styles.userEmail}>{item.email}</Text>
                                    </View>
                                    <Ionicons name="chevron-back" size={18} color="#666" />
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={<Text style={{color: '#666', textAlign: 'center', marginTop: 20}}>لا يوجد مستخدمين</Text>}
                        />
                    )}
                    
                    <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowUserPicker(false)}>
                        <Text style={{color: '#fff'}}>إغلاق</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>

        {/* 🔥 GLOBAL REPLACEMENTS MODAL - REDESIGNED - BLACK & WHITE GLASS 🔥 */}
        <Modal visible={showReplacementsModal} transparent onRequestClose={handleCloseReplacements}>
          <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
            <Animated.View style={[
              styles.glassModalContainer,
              {
                transform: [
                  {
                    translateY: slideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [600, 0]
                    })
                  }
                ]
              }
            ]}>
              {/* Close button floating */}
              <TouchableOpacity style={styles.floatingCloseButton} onPress={handleCloseReplacements}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>

              <LinearGradient
                colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              
              <View style={styles.modalHeader}>
                <Ionicons name="color-filter-outline" size={32} color="#fff" />
                <Text style={styles.modalTitle}>تنقية الفصول العالمية</Text>
                <Text style={styles.modalSubtitle}>استبدال ذكي في جميع الروايات</Text>
              </View>

              <View style={styles.glowLine} />

              <View style={styles.modalBody}>
                {/* Input Form - Glass style */}
                <View style={styles.inputGlassCard}>
                  <View style={styles.inputRow}>
                    <View style={styles.inputIconContainer}>
                      <Ionicons name="text" size={20} color="#aaa" />
                    </View>
                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputLabel}>الكلمة الأصلية</Text>
                      <TextInput 
                        style={styles.glassInput}
                        value={newOriginal}
                        onChangeText={setNewOriginal}
                        placeholder="مثال: كلمة سيئة"
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        textAlign="right"
                      />
                    </View>
                  </View>

                  <View style={styles.inputRow}>
                    <View style={styles.inputIconContainer}>
                      <Ionicons name="swap-horizontal" size={20} color="#aaa" />
                    </View>
                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputLabel}>الاستبدال (اختياري)</Text>
                      <TextInput 
                        style={styles.glassInput}
                        value={newReplacement}
                        onChangeText={setNewReplacement}
                        placeholder="مثال: كلمة جيدة"
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        textAlign="right"
                      />
                    </View>
                  </View>

                  <TouchableOpacity 
                    style={[styles.saveButton, editingRepId ? styles.editButton : null]}
                    onPress={handleSaveReplacement}
                    disabled={repLoading}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={editingRepId ? ['#555', '#333'] : ['#444', '#222']}
                      style={styles.gradientButton}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      {repLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name={editingRepId ? "create-outline" : "add-circle-outline"} size={22} color="#fff" />
                          <Text style={styles.saveButtonText}>{editingRepId ? 'تحديث الاستبدال' : 'إضافة استبدال جديد'}</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                  
                  {editingRepId && (
                    <TouchableOpacity 
                      onPress={() => { setEditingRepId(null); setNewOriginal(''); setNewReplacement(''); }} 
                      style={styles.cancelEditButton}
                    >
                      <Ionicons name="close-circle-outline" size={18} color="#aaa" />
                      <Text style={styles.cancelEditText}>إلغاء التعديل</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Search and Sort Bar */}
                <View style={styles.searchSortBar}>
                  <View style={styles.searchContainer}>
                    <Ionicons name="search" size={18} color="#aaa" />
                    <TextInput
                      style={styles.searchInputSmall}
                      placeholder="بحث في الاستبدالات..."
                      placeholderTextColor="#666"
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      textAlign="right"
                    />
                  </View>
                  <TouchableOpacity onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')} style={styles.sortButton}>
                    <Ionicons 
                      name={sortOrder === 'asc' ? "arrow-up" : "arrow-down"} 
                      size={22} 
                      color="#fff" 
                    />
                  </TouchableOpacity>
                </View>

                {/* List Header */}
                <View style={styles.listHeader}>
                  <Ionicons name="list-outline" size={18} color="#aaa" />
                  <Text style={styles.listHeaderText}>
                    الاستبدالات النشطة ({filteredAndSortedReplacements.length}) · 
                    {sortOrder === 'asc' ? ' الأقدم أولاً' : ' الأحدث أولاً'}
                  </Text>
                </View>

                {/* Replacements List - now scrollable */}
                <FlatList
                  data={filteredAndSortedReplacements}
                  keyExtractor={item => item._id}
                  contentContainerStyle={styles.listContent}
                  renderItem={({item, index}) => (
                    <Animated.View style={[styles.replacementItem, { opacity: fadeAnim }]}>
                      <LinearGradient
                        colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      />
                      <View style={styles.itemContent}>
                        <View style={styles.itemTextContainer}>
                          <Text style={styles.itemOriginal}>{item.original}</Text>
                          {item.replacement ? (
                            <Text style={styles.itemReplacement}>← {item.replacement}</Text>
                          ) : (
                            <Text style={styles.itemDeleted}>سيتم الحذف نهائياً</Text>
                          )}
                        </View>
                        <View style={styles.itemActions}>
                          <TouchableOpacity onPress={() => startEditReplacement(item)} style={styles.actionButton}>
                            <Ionicons name="create-outline" size={20} color="#ccc" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteReplacement(item._id)} style={styles.actionButton}>
                            <Ionicons name="trash-outline" size={20} color="#999" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </Animated.View>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyList}>
                      <Ionicons name="color-filter-outline" size={48} color="rgba(255,255,255,0.1)" />
                      <Text style={styles.emptyListText}>لا توجد استبدالات نشطة</Text>
                      <Text style={styles.emptyListSubtext}>أضف أول استبدال الآن</Text>
                    </View>
                  }
                />
              </View>
            </Animated.View>
          </Animated.View>
        </Modal>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  safeArea: { flex: 1 },
  header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 20,
  },
  greeting: { fontSize: 24, fontWeight: 'bold', color: '#fff', textAlign: 'right' },
  roleText: { fontSize: 14, color: '#aaa', marginTop: 4, textAlign: 'right', fontWeight: '600' },
  closeBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  
  content: { padding: 20, paddingBottom: 50 },
  
  glassCard: {
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      position: 'relative'
  },

  statsContainer: { flexDirection: 'row', gap: 15, marginBottom: 30 },
  statCard: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
  statNumber: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 5 },
  statLabel: { color: '#888', fontSize: 12 },
  statIcon: { position: 'absolute', top: 10, left: 10, opacity: 0.8 },

  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15, marginTop: 10, textAlign: 'right' },
  
  grid: { gap: 12 },
  
  dashboardBtn: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      padding: 15,
  },
  iconCircle: {
      width: 50,
      height: 50,
      borderRadius: 15,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 15
  },
  btnContent: { flex: 1 },
  btnTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'right', marginBottom: 4 },
  btnSubtitle: { color: '#888', fontSize: 12, textAlign: 'right' },

  // Modal Styles (user picker - unchanged)
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#161616', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
  searchBox: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#222', borderRadius: 12, paddingHorizontal: 10, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  searchInput: { flex: 1, color: '#fff', padding: 10, textAlign: 'right' },
  userItem: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
  userName: { color: '#fff', fontWeight: 'bold', textAlign: 'right' },
  userEmail: { color: '#888', fontSize: 12, textAlign: 'right' },
  closeModalBtn: { marginTop: 20, padding: 12, backgroundColor: '#333', borderRadius: 12, alignItems: 'center' },

  // ========== NEW BLACK & WHITE GLASS MODAL STYLES ==========
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  glassModalContainer: {
    width: '100%',
    height: '90%',
    backgroundColor: 'rgba(20,20,20,0.7)',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 25,
  },
  floatingCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  modalHeader: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 20,
  },
  modalSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 4,
    letterSpacing: 1,
  },
  glowLine: {
    height: 1,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  inputGlassCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 16,
  },
  inputIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  inputWrapper: {
    flex: 1,
  },
  inputLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginBottom: 4,
    textAlign: 'right',
  },
  glassInput: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 16,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    textAlign: 'right',
  },
  saveButton: {
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 8,
  },
  gradientButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  cancelEditButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 6,
  },
  cancelEditText: {
    color: '#aaa',
    fontSize: 13,
  },
  searchSortBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchInputSmall: {
    flex: 1,
    color: '#fff',
    padding: 10,
    fontSize: 14,
    textAlign: 'right',
  },
  sortButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  listHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  listHeaderText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 10,
  },
  replacementItem: {
    borderRadius: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  itemContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  itemTextContainer: {
    flex: 1,
    marginLeft: 10,
  },
  itemOriginal: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: 'right',
    marginBottom: 3,
  },
  itemReplacement: {
    color: '#ccc',
    fontSize: 12,
    textAlign: 'right',
  },
  itemDeleted: {
    color: '#888',
    fontSize: 12,
    textAlign: 'right',
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  emptyList: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyListText: {
    color: '#aaa',
    fontSize: 15,
    marginTop: 10,
  },
  emptyListSubtext: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 12,
    marginTop: 4,
  },
});
