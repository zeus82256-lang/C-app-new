import React, { useState, useContext, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Platform,
  StatusBar,
  ImageBackground,
  Modal,
  Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import axios from 'axios';
import api from '../services/api'; 
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';

// ⚠️ Update to the correct Python scraper URL
const SCRAPER_URL = 'https://web-production-c18f1.up.railway.app/scrape';
const SCHEDULER_URL = 'https://web-production-c18f1.up.railway.app/scheduler';
const API_SECRET = 'Zeusndndjddnejdjdjdejekk29393838msmskxcm9239484jdndjdnddjj99292938338zeuslojdnejxxmejj82283849'; 

// Glass Container
const GlassContainer = ({ children, style }) => (
    <View style={[styles.glassContainer, style]}>
        {children}
    </View>
);

const getTimeAgo = (date) => {
  if (!date) return 'جديد';
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return `منذ ${Math.floor(interval)} سنة`;
  interval = seconds / 2592000;
  if (interval > 1) return `منذ ${Math.floor(interval)} شهر`;
  interval = seconds / 86400;
  if (interval > 1) return `منذ ${Math.floor(interval)} يوم`;
  interval = seconds / 3600;
  if (interval > 1) return `منذ ${Math.floor(interval)} ساعة`;
  interval = seconds / 60;
  if (interval > 1) return `منذ ${Math.floor(interval)} دقيقة`;
  return 'الآن';
};

const TIME_UNITS = [
    { id: 'seconds', label: 'ثواني', multiplier: 1 },
    { id: 'minutes', label: 'دقائق', multiplier: 60 },
    { id: 'hours', label: 'ساعات', multiplier: 3600 },
    { id: 'days', label: 'أيام', multiplier: 86400 }
];

export default function AutoImportScreen({ navigation }) {
  const { userInfo } = useContext(AuthContext);
  const { showToast } = useToast();

  // Tabs State
  const [activeTab, setActiveTab] = useState('ongoing');
  const [watchlist, setWatchlist] = useState([]);
  const [filteredList, setFilteredList] = useState([]);
  const [fetchingList, setFetchingList] = useState(true);

  // Add/Scrape State
  const [url, setUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);
   
  // Server-Side Scheduler State
  const [serverSchedulerActive, setServerSchedulerActive] = useState(false);
  const [timeValue, setTimeValue] = useState('24');
  const [timeUnit, setTimeUnit] = useState('hours');
  const [nextRunTime, setNextRunTime] = useState(null);
  const [schedulerStatus, setSchedulerStatus] = useState('idle');

  // Real logs
  const [serverLogs, setServerLogs] = useState([]);
  const flatListRef = useRef(null);
  const pollingRef = useRef(null);

  // --- NEW STATE FOR SEARCH AND SORT ---
  const [searchText, setSearchText] = useState('');        // النص الفوري في حقل الإدخال
  const [searchQuery, setSearchQuery] = useState('');      // النص المستخدم في التصفية (يتم تحديثه بعد توقف الكتابة)
  const [sortAscending, setSortAscending] = useState(false); // false يعني الأحدث أولاً (تنازلي)
  const [sortBy, setSortBy] = useState('lastUpdate'); // 'lastUpdate' أو 'lastAdded'
  const searchTimeoutRef = useRef(null);

  useFocusEffect(
      useCallback(() => {
          fetchWatchlist();
          checkServerScheduler();
      }, [])
  );

  useEffect(() => {
      filterData();
  }, [watchlist, activeTab, searchQuery, sortAscending, sortBy]);

  // --- SERVER SCHEDULER LOGIC ---
  const checkServerScheduler = async () => {
      try {
          const res = await axios.get(`${SCHEDULER_URL}/status`);
          const config = res.data;
          setServerSchedulerActive(config.active);
          setNextRunTime(config.next_run);
          setSchedulerStatus(config.status);
      } catch (e) {
          console.log("Failed to check server scheduler", e.message);
      }
  };

  const toggleServerScheduler = async (value) => {
      // If turning ON
      if (value) {
          if (!timeValue || isNaN(parseInt(timeValue))) {
              showToast("أدخل وقتاً صحيحاً", "error");
              return;
          }
          const unitData = TIME_UNITS.find(u => u.id === timeUnit);
          const totalSeconds = parseInt(timeValue) * unitData.multiplier;

          try {
              await axios.post(`${SCHEDULER_URL}/config`, {
                  active: true,
                  interval: totalSeconds,
                  adminEmail: userInfo.email
              }, { headers: { 'Authorization': API_SECRET } });
              
              setServerSchedulerActive(true);
              showToast(`تم تفعيل السيرفر: كل ${timeValue} ${unitData.label}`, "success");
              checkServerScheduler();
          } catch(e) {
              showToast("فشل الاتصال بالسيرفر", "error");
          }
      } else {
          // Turn OFF
          try {
              await axios.post(`${SCHEDULER_URL}/config`, {
                  active: false
              }, { headers: { 'Authorization': API_SECRET } });
              setServerSchedulerActive(false);
              showToast("تم إيقاف الجدولة التلقائية", "info");
          } catch(e) {
              showToast("فشل الإيقاف", "error");
          }
      }
  };

  const fetchWatchlist = async () => {
      setFetchingList(true);
      try {
          const res = await api.get('/api/admin/watchlist');
          setWatchlist(res.data || []);
      } catch (e) {
          console.log("Failed to fetch watchlist");
      } finally {
          setFetchingList(false);
      }
  };

  // 🔥 Updated filterData to include search and sort
  const filterData = () => {
      if (!watchlist) return;
      // أولاً: تصفية حسب التبويب
      let filtered = watchlist.filter(item => item.status === activeTab);
      
      // ثانياً: تصفية حسب نص البحث (في العنوان) - باستخدام searchQuery
      if (searchQuery.trim()) {
          filtered = filtered.filter(item =>
              item.title.toLowerCase().includes(searchQuery.toLowerCase())
          );
      }
      
      // ثالثاً: الترتيب
      filtered.sort((a, b) => {
          if (sortBy === 'lastUpdate') {
              // حسب آخر تحديث (نفترض وجود lastUpdate)
              const dateA = a.lastUpdate ? new Date(a.lastUpdate) : new Date(0);
              const dateB = b.lastUpdate ? new Date(b.lastUpdate) : new Date(0);
              return sortAscending ? dateA - dateB : dateB - dateA;
          } else {
              // حسب آخر إضافة (نفترض وجود createdAt أو تاريخ الإنشاء)
              const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
              const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
              return sortAscending ? dateA - dateB : dateB - dateA;
          }
      });
      
      setFilteredList(filtered);
  };

  // دالة معالجة تغيير نص البحث مع debounce
  const handleSearchChange = (text) => {
      setSearchText(text); // تحديث النص الفوري
      if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
          setSearchQuery(text); // تحديث النص الفعلي بعد التوقف عن الكتابة
      }, 500); // تأخير 500 مللي
  };

  // --- LOGIC FOR SCRAPING ---
  useEffect(() => {
      if (showConsole) {
          api.delete('/api/scraper/logs').catch(() => {});
          startPolling();
      } else {
          stopPolling();
      }
      return () => stopPolling();
  }, [showConsole]);

  const startPolling = () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      fetchLogs(); 
      pollingRef.current = setInterval(fetchLogs, 1000);
  };

  const stopPolling = () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
  };

  const fetchLogs = async () => {
      try {
          const res = await api.get('/api/scraper/logs');
          if (res.data && Array.isArray(res.data)) {
              setServerLogs(res.data);
              const latest = res.data[0];
              if (latest && isScraping && !updatingAll) {
                  if (latest.type === 'success' && (latest.message.includes('حفظ') || latest.message.includes('موجودة') || latest.message.includes('اكتمل'))) {
                      setIsScraping(false);
                      showToast("اكتملت العملية!", "success");
                      fetchWatchlist(); 
                  }
                  if (latest.type === 'error' && (latest.message.includes('فشل') || latest.message.includes('خطأ'))) {
                      setIsScraping(false);
                      showToast("حدث خطأ", "error");
                  }
              }
          }
      } catch (e) {
          console.log("Polling error (silent)", e.message);
      }
  };

  const handleImport = async (targetUrl = null) => {
      const urlToUse = targetUrl ? targetUrl : url;
      if (!urlToUse || !urlToUse.trim()) {
          showToast("يرجى إدخال رابط الرواية", "error");
          return;
      }
      setIsScraping(true);
      setShowConsole(true);
      setServerLogs([]);
      try {
          await api.post('/api/scraper/init', { url: urlToUse, userEmail: userInfo.email });
          const scraperResponse = await axios.post(SCRAPER_URL, {
              url: urlToUse,
              adminEmail: userInfo.email
          }, {
              headers: { 'Authorization': API_SECRET, 'Content-Type': 'application/json' },
              timeout: 60000 
          });
          if (scraperResponse.data && scraperResponse.data.error) throw new Error(scraperResponse.data.error);
      } catch (error) {
          setIsScraping(false);
          let errorStatus = error.response ? `HTTP ${error.response.status}` : "Client Error";
          showToast(`خطأ: ${errorStatus}`, "error");
          try { await api.post('/api/scraper/log', { message: `❌ فشل الاتصال: ${error.message}`, type: 'error' }); fetchLogs(); } catch (logErr) {}
      }
  };

  const handleUpdateAll = async () => {
      if (watchlist.length === 0) return;
      setUpdatingAll(true);
      setIsScraping(true);
      setShowConsole(true);
      setServerLogs([]);
      
      await api.post('/api/scraper/log', { message: `🚀 بدء تحديث ${watchlist.length} رواية...`, type: 'info' });

      for (const item of watchlist) {
          if (!item.sourceUrl) continue;
          try {
              await api.post('/api/scraper/log', { message: `⏳ جاري فحص: ${item.title}`, type: 'info' });
              await axios.post(SCRAPER_URL, {
                  url: item.sourceUrl,
                  adminEmail: userInfo.email
              }, { headers: { 'Authorization': API_SECRET, 'Content-Type': 'application/json' } });
              await new Promise(r => setTimeout(r, 2000));
          } catch (e) {
              await api.post('/api/scraper/log', { message: `⚠️ فشل تحديث ${item.title}`, type: 'warning' });
          }
      }
      await api.post('/api/scraper/log', { message: `✅ انتهى التحديث الشامل`, type: 'success' });
      setUpdatingAll(false);
      setIsScraping(false);
      fetchWatchlist();
  };

  const renderLogItem = ({ item }) => {
      let color = '#ccc';
      let icon = 'information-circle-outline';
      if (item.type === 'success') { color = '#4ade80'; icon = 'checkmark-circle-outline'; }
      if (item.type === 'error') { color = '#ff4444'; icon = 'alert-circle-outline'; }
      if (item.type === 'warning') { color = '#f59e0b'; icon = 'warning-outline'; }
      const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('en-US', {hour12: false}) : '';
      return (
          <View style={styles.logItem}>
              <View style={styles.logHeader}>
                  <Ionicons name={icon} size={14} color={color} />
                  <Text style={{color:'#666', fontSize:10}}>{time}</Text>
              </View>
              <Text style={[styles.logText, { color }]}>{item.message}</Text>
          </View>
      );
  };

  const renderWatchlistItem = ({ item }) => {
      const isEnglishSource = item.sourceUrl && (item.sourceUrl.includes('novelfire') || item.sourceUrl.includes('freewebnovel'));
      return (
      <View style={styles.card}>
          <Image source={item.cover} style={styles.cardImage} contentFit="cover" />
          <View style={styles.cardInfo}>
              <View style={{flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                  {isEnglishSource && <View style={styles.engBadge}><Text style={styles.engText}>مصدر أجنبي</Text></View>}
              </View>
              <View style={styles.cardMeta}>
                  <Text style={styles.metaText}>{item.chaptersCount} فصل</Text>
                  <Text style={styles.metaText}>•</Text>
                  <Text style={styles.metaText}>{getTimeAgo(item.lastUpdate)}</Text>
              </View>
              {item.sourceUrl ? (
                  <TouchableOpacity style={styles.checkBtn} onPress={() => handleImport(item.sourceUrl)}>
                      <Ionicons name="refresh" size={16} color="#fff" />
                      <Text style={styles.checkBtnText}>فحص التحديثات</Text>
                  </TouchableOpacity>
              ) : <Text style={{color:'#666', fontSize:10}}>لا يوجد رابط مصدر</Text>}
          </View>
          <View style={[styles.statusIndicator, {backgroundColor: item.status === 'completed' ? '#4ade80' : item.status === 'stopped' ? '#ff4444' : '#4a7cc7'}]} />
      </View>
      );
  };

  // 🔥 Component for Header to scroll away (without search section)
  const renderHeader = () => (
      <View style={styles.scrollHeaderContainer}>
          <GlassContainer style={styles.schedulerBox}>
              <View style={styles.schedulerHeader}>
                  <View style={{flexDirection:'row-reverse', alignItems:'center', gap:10}}>
                      <Ionicons name="cloud-upload-outline" size={20} color="#4ade80" />
                      <Text style={styles.schedulerTitle}>التحديث التلقائي (Server-Side)</Text>
                  </View>
                  <Switch value={serverSchedulerActive} onValueChange={toggleServerScheduler} trackColor={{false: '#333', true: '#4ade80'}} />
              </View>
              {serverSchedulerActive && (
                  <View style={styles.schedulerInfo}>
                      <Text style={{color:'#4ade80', fontSize:12}}>✅ السيرفر يعمل بشكل تلقائي حتى لو خرجت من التطبيق.</Text>
                      {nextRunTime && (
                          <Text style={{color:'#ccc', fontSize:12, marginTop:5, textAlign:'right'}}>
                              التحديث القادم: {new Date(nextRunTime * 1000).toLocaleTimeString()}
                          </Text>
                      )}
                  </View>
              )}
              {!serverSchedulerActive && (
                  <View style={styles.timeConfig}>
                      <View style={styles.unitTabs}>
                          {TIME_UNITS.map(u => (
                              <TouchableOpacity key={u.id} style={[styles.unitTab, timeUnit === u.id && styles.unitTabActive]} onPress={() => setTimeUnit(u.id)}>
                                  <Text style={[styles.unitText, timeUnit === u.id && {color:'#fff'}]}>{u.label}</Text>
                              </TouchableOpacity>
                          ))}
                      </View>
                      <View style={styles.intervalRow}>
                          <Text style={{color:'#ccc'}}>كل</Text>
                          <TextInput style={styles.intervalInput} value={timeValue} onChangeText={setTimeValue} keyboardType="numeric" />
                      </View>
                  </View>
              )}
          </GlassContainer>

          <GlassContainer style={styles.inputBox}>
              <View style={styles.inputRow}>
                  <TextInput style={styles.input} placeholder="أضف رابط رواية جديد..." placeholderTextColor="#666" value={url} onChangeText={setUrl} autoCapitalize="none" />
                  <TouchableOpacity style={[styles.goBtn, (isScraping || !url) && styles.disabledBtn]} onPress={() => handleImport(null)} disabled={isScraping || !url}>
                      {isScraping ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="add" size={24} color="#fff" />}
                  </TouchableOpacity>
              </View>
          </GlassContainer>

          <View style={styles.tabsContainer}>
              <TouchableOpacity style={[styles.tab, activeTab === 'ongoing' && styles.activeTab]} onPress={() => setActiveTab('ongoing')}>
                  <Text style={[styles.tabText, activeTab === 'ongoing' && styles.activeTabText]}>جاري العمل</Text>
                  <View style={[styles.badge, {backgroundColor: '#4a7cc7'}]} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tab, activeTab === 'completed' && styles.activeTab]} onPress={() => setActiveTab('completed')}>
                  <Text style={[styles.tabText, activeTab === 'completed' && styles.activeTabText]}>مكتملة</Text>
                  <View style={[styles.badge, {backgroundColor: '#4ade80'}]} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tab, activeTab === 'stopped' && styles.activeTab]} onPress={() => setActiveTab('stopped')}>
                  <Text style={[styles.tabText, activeTab === 'stopped' && styles.activeTabText]}>متوقفة</Text>
                  <View style={[styles.badge, {backgroundColor: '#ff4444'}]} />
              </TouchableOpacity>
          </View>
      </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ImageBackground source={require('../../assets/adaptive-icon.png')} style={styles.bgImage} blurRadius={20}>
          <LinearGradient colors={['rgba(0,0,0,0.6)', '#000000']} style={StyleSheet.absoluteFill} />
      </ImageBackground>

      <SafeAreaView style={{flex: 1}} edges={['top']}>
        <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                <Ionicons name="arrow-forward" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>نظام المراقبة (Watchlist)</Text>
            <View style={{flexDirection: 'row', gap: 10}}>
                <TouchableOpacity onPress={() => handleUpdateAll(false)} style={[styles.iconBtn, {backgroundColor: updatingAll ? '#4a7cc7' : 'rgba(255,255,255,0.1)'}]} disabled={updatingAll}>
                    {updatingAll ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="sync" size={24} color="#fff" />}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowConsole(true)} style={styles.iconBtn}>
                    <Ionicons name="terminal" size={24} color={isScraping ? "#4ade80" : "#fff"} />
                </TouchableOpacity>
            </View>
        </View>

        {/* NEW: Search bar and sort buttons - ثابت خارج FlatList */}
        <View style={styles.searchSection}>
            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="ابحث باسم الرواية..."
                    placeholderTextColor="#888"
                    value={searchText}
                    onChangeText={handleSearchChange}
                />
            </View>
            <TouchableOpacity style={styles.sortButton} onPress={() => setSortAscending(!sortAscending)}>
                <Ionicons name={sortAscending ? 'arrow-up' : 'arrow-down'} size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.sortButton} onPress={() => setSortBy(prev => prev === 'lastUpdate' ? 'lastAdded' : 'lastUpdate')}>
                <Ionicons name={sortBy === 'lastUpdate' ? 'time' : 'calendar'} size={22} color="#fff" />
            </TouchableOpacity>
        </View>

        {/* 🔥 FlatList now only contains the scrollable header (scheduler, input, tabs) and the list items */}
        <FlatList
            data={filteredList}
            keyExtractor={item => item._id}
            renderItem={renderWatchlistItem}
            ListHeaderComponent={renderHeader} 
            contentContainerStyle={{paddingHorizontal: 20, paddingBottom: 50}}
            ListEmptyComponent={
                !fetchingList && (
                    <View style={{alignItems: 'center', marginTop: 50}}>
                        <Ionicons name="folder-open-outline" size={40} color="#666" />
                        <Text style={styles.emptyText}>القائمة فارغة</Text>
                    </View>
                )
            }
        />

        <Modal visible={showConsole} animationType="slide" transparent={true} onRequestClose={() => {if(!isScraping) setShowConsole(false)}}>
            <View style={styles.modalContainer}>
                <View style={styles.consoleBox}>
                    <View style={styles.consoleHeader}>
                        <TouchableOpacity onPress={() => setShowConsole(false)}><Ionicons name="close" size={24} color="#fff" /></TouchableOpacity>
                        <Text style={styles.consoleTitle}>Console Output</Text>
                        {isScraping && <ActivityIndicator size="small" color="#4ade80" />}
                    </View>
                    <FlatList ref={flatListRef} data={serverLogs} keyExtractor={item => item._id || Math.random().toString()} renderItem={renderLogItem} contentContainerStyle={styles.logsContent} />
                </View>
            </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  iconBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  
  glassContainer: { backgroundColor: 'rgba(20, 20, 20, 0.75)', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 20 },
  
  schedulerBox: { padding: 15 },
  schedulerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  schedulerTitle: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  schedulerInfo: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 10 },
  
  timeConfig: { marginTop: 10 },
  unitTabs: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 10, backgroundColor: '#222', borderRadius: 8, padding: 3 },
  unitTab: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 6 },
  unitTabActive: { backgroundColor: '#4a7cc7' },
  unitText: { color: '#888', fontSize: 12, fontWeight: 'bold' },
  intervalRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10 },
  intervalInput: { backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', padding: 8, borderRadius: 8, width: 80, textAlign: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', fontSize: 16, fontWeight: 'bold' },

  inputBox: { padding: 15 },
  inputRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 15, color: '#fff', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', textAlign: 'right' },
  goBtn: { width: 60, backgroundColor: 'rgba(74, 124, 199, 0.3)', borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#4a7cc7' },
  disabledBtn: { opacity: 0.5 },

  tabsContainer: { flexDirection: 'row-reverse', marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderRadius: 8 },
  activeTab: { backgroundColor: 'rgba(255,255,255,0.1)' },
  tabText: { color: '#888', fontSize: 12, fontWeight: 'bold' },
  activeTabText: { color: '#fff' },
  badge: { width: 6, height: 6, borderRadius: 3 },

  // New styles for search and sort (ثابتة خارج FlatList)
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
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

  card: { flexDirection: 'row-reverse', backgroundColor: 'rgba(30,30,30,0.6)', borderRadius: 16, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', height: 100 },
  cardImage: { width: 70, height: '100%' },
  cardInfo: { flex: 1, padding: 10, justifyContent: 'center', alignItems: 'flex-end' },
  cardTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14, marginBottom: 5, textAlign: 'right', flex: 1 },
  cardMeta: { flexDirection: 'row-reverse', gap: 5, marginBottom: 10 },
  metaText: { color: '#888', fontSize: 10 },
  checkBtn: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 5 },
  checkBtnText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  statusIndicator: { width: 4, height: '100%' },
  engBadge: { backgroundColor: '#f59e0b', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 10 },
  engText: { color: '#000', fontSize: 9, fontWeight: 'bold' },
  emptyText: { color: '#666', marginTop: 10 },

  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  consoleBox: { height: '60%', backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: '#333' },
  consoleHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#222', alignItems: 'center' },
  consoleTitle: { color: '#fff', fontWeight: 'bold' },
  logsContent: { padding: 15 },
  logItem: { marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderColor: '#222' },
  logHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 2 },
  logText: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'right' }
});