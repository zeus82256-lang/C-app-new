
import React, { useState, useRef, useEffect, useContext, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  Alert,
  ScrollView,
  FlatList,
  Modal,
  Platform
} from 'react-native';
import { Image } from 'expo-image'; 
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser'; // 🔥 Use WebBrowser for internal browser
import api, { incrementView } from '../services/api'; 
import { useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import CommentsSection from '../components/CommentsSection'; 
import { saveOfflineNovel, saveOfflineChapter, removeOfflineChapter, getOfflineNovelDetails } from '../services/offlineStorage';
import CustomAlert from '../components/CustomAlert';
import downloadQueue from '../services/DownloadQueue'; // 🔥 IMPORTED QUEUE SERVICE

const { width, height } = Dimensions.get('window');
const CHAPTERS_PER_PAGE = 25; 

// Format views helper
const formatNumber = (num) => {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
};

// 🔥 Updated Status Colors (Text Only)
const getStatusTextColor = (status) => {
    switch (status) {
        case 'مكتملة': return '#27ae60'; // Dark Green
        case 'متوقفة': return '#c0392b'; // Dark Red
        default: return '#2980b9';       // Dark Blue (Ongoing)
    }
};

// Global cache for authors to avoid re-fetching across screens
const authorCache = {};

export default function NovelDetailScreen({ route, navigation }) {
  const { userInfo, userToken } = useContext(AuthContext);
  const { showToast } = useToast();
  
  // 🔥 1. Initialize immediately with passed params (Rocket Speed Start)
  const initialNovelData = route.params.novel || {};
  const isOfflineMode = route.params.isOfflineMode || false;
  const novelId = initialNovelData._id || initialNovelData.id || initialNovelData.novelId;

  const [fullNovel, setFullNovel] = useState(initialNovelData);
  const [authorProfile, setAuthorProfile] = useState(
      (initialNovelData.authorEmail && authorCache[initialNovelData.authorEmail]) || null
  );
  
  const [chapters, setChapters] = useState([]);
  // 🔥 New: Store ALL offline chapters to support pagination locally
  const [allOfflineChapters, setAllOfflineChapters] = useState([]);
  
  // Independent Loading States
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingChapters, setLoadingChapters] = useState(true);
  
  const [activeTab, setActiveTab] = useState('about'); 
  const [isFavorite, setIsFavorite] = useState(false);
  const [lastReadChapterId, setLastReadChapterId] = useState(0); 
  const [readChapters, setReadChapters] = useState([]); 

  // Pagination & Sorting State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isPagePickerVisible, setPagePickerVisible] = useState(false);
  const [sortDesc, setSortDesc] = useState(false); 

  // Sort Dropdown Modal
  const [isSortPickerVisible, setSortPickerVisible] = useState(false);

  // Download State
  const [downloadedChapters, setDownloadedChapters] = useState([]); 
  // 🔥 Replaced simple downloadingChapter state with queue awareness
  const [queueMap, setQueueMap] = useState({}); 

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({});

  const scrollY = useRef(new Animated.Value(0)).current;

  // Check ownership
  const isOwner = userInfo && (
      userInfo.role === 'admin' || 
      (fullNovel.authorEmail && fullNovel.authorEmail === userInfo.email) ||
      (!fullNovel.authorEmail && fullNovel.author && fullNovel.author.toLowerCase() === userInfo.name.toLowerCase())
  );

  // 🔥 2. Parallel Fetching on Mount
  useEffect(() => {
      // 🔥 Init Download Queue Listener
      downloadQueue.init();
      const unsubscribeQueue = downloadQueue.subscribe((currentQueue) => {
          const map = {};
          currentQueue.forEach(item => {
              if (item.novelId === novelId) {
                  map[item.chapterNumber] = item.status;
              }
          });
          setQueueMap(map);
          // Refresh downloaded list implicitly when queue changes (item removed = downloaded/failed)
          checkDownloads(); 
      });

      if (isOfflineMode) {
          fetchOfflineData();
      } else {
          fetchLibraryStatus();
          // 🔥 Only fetch METADATA first (fast)
          fetchNovelMetadata();
      }
      checkDownloads();

      return () => unsubscribeQueue();
  }, [novelId]);

  // 🔥 3. Fetch Author whenever authorEmail is available (Effect)
  useEffect(() => {
      if (fullNovel.authorEmail && !isOfflineMode) {
          fetchAuthorData(fullNovel.authorEmail);
      }
  }, [fullNovel.authorEmail]);

  // 🔥 4. Fetch Chapters logic (Updated for Offline Mode Pagination)
  useEffect(() => {
      if (activeTab === 'chapters') {
          if (isOfflineMode) {
              updateOfflineChaptersList();
          } else {
              fetchChaptersPage(currentPage);
          }
      }
  }, [activeTab, currentPage, sortDesc, isOfflineMode, allOfflineChapters]);

  // 🔥 New Function: Process Offline Chapters (Sort & Paginate Locally)
  const updateOfflineChaptersList = useCallback(() => {
      if (!allOfflineChapters || allOfflineChapters.length === 0) {
          setChapters([]);
          return;
      }

      let processed = [...allOfflineChapters];
      
      // Sort
      if (sortDesc) {
          processed.sort((a, b) => b.number - a.number);
      } else {
          processed.sort((a, b) => a.number - b.number);
      }
      
      // Paginate
      const startIndex = (currentPage - 1) * CHAPTERS_PER_PAGE;
      const endIndex = startIndex + CHAPTERS_PER_PAGE;
      const pageItems = processed.slice(startIndex, endIndex);

      setChapters(pageItems);
  }, [allOfflineChapters, currentPage, sortDesc]);

  const fetchOfflineData = async () => {
      setLoadingChapters(true);
      const data = await getOfflineNovelDetails(novelId);
      if (data) {
          setFullNovel(prev => ({ ...prev, ...data }));
          const list = data.chapters || [];
          setAllOfflineChapters(list); // Store Full List
          setDownloadedChapters(list.map(c => c.number));
          
          // 🔥 Calculate Total Pages for Offline
          setTotalPages(Math.ceil(list.length / CHAPTERS_PER_PAGE) || 1);
          
          // Initial Slice (Avoid waiting for useEffect)
          const sorted = [...list].sort((a, b) => a.number - b.number);
          setChapters(sorted.slice(0, CHAPTERS_PER_PAGE));
      }
      setLoadingChapters(false);
      setLoadingStatus(false);
  };

  const checkDownloads = async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      try {
          const keys = await AsyncStorage.getAllKeys();
          const prefix = `@offline_ch_${novelId}_`;
          const downloaded = keys
              .filter(k => k.startsWith(prefix))
              .map(k => parseInt(k.replace(prefix, '')));
          setDownloadedChapters(downloaded);
      } catch(e) {}
  };

  const fetchLibraryStatus = async () => {
      setLoadingStatus(true);
      try {
        const statusRes = await api.get(`/api/novel/status/${novelId}`);
        if (statusRes.data) {
          setIsFavorite(statusRes.data.isFavorite);
          setLastReadChapterId(statusRes.data.lastChapterId || 0);
          setReadChapters(statusRes.data.readChapters || []);
        }
      } catch (e) {
         // Silently fail if offline or error
      } finally {
          setLoadingStatus(false);
      }
  };

  const fetchAuthorData = async (email) => {
      if (!email) return;
      if (authorCache[email]) {
          setAuthorProfile(authorCache[email]);
          return;
      }
      try {
          // 🔥🔥 NEW ENDPOINT: Use the specialized light endpoint instead of heavy /stats
          const authorRes = await api.get(`/api/user/public-profile?email=${email}`);
          const profile = authorRes.data.user;
          if (profile) {
              authorCache[email] = profile;
              setAuthorProfile(profile);
          }
      } catch (e) {
          console.log("Author fetch error", e.message);
      }
  };

  // 🔥 Optimized: Fetch ONLY Metadata (No chapters array)
  const fetchNovelMetadata = async () => {
      try {
          const response = await api.get(`/api/novels/${novelId}`);
          const novelData = response.data;
          
          setFullNovel(prev => ({ ...prev, ...novelData }));
          
          // Calculate total pages based on count from metadata
          const count = novelData.chaptersCount || 0;
          setTotalPages(Math.ceil(count / CHAPTERS_PER_PAGE) || 1);

          saveOfflineNovel(novelData); // Save meta implicitly
      } catch (e) {
          // Fallback handled by offline logic
      }
  };

  // 🔥 Optimized: Fetch Specific Page of Chapters
  const fetchChaptersPage = async (page) => {
      if (isOfflineMode) return; // Handled by updateOfflineChaptersList

      setLoadingChapters(true);
      try {
          const sortOrder = sortDesc ? 'desc' : 'asc';
          const res = await api.get(`/api/novels/${novelId}/chapters-list`, {
              params: {
                  page: page,
                  limit: CHAPTERS_PER_PAGE,
                  sort: sortOrder
              }
          });
          setChapters(res.data);
      } catch (e) {
          showToast("فشل تحميل الفصول", "error");
      } finally {
          setLoadingChapters(false);
      }
  };

  const handleDownloadChapter = async (chapter) => {
      if (downloadedChapters.includes(chapter.number)) return;
      // 🔥 USE QUEUE INSTEAD OF DIRECT API CALL
      await downloadQueue.add(fullNovel, chapter);
      showToast("تمت الإضافة لطابور التنزيل", "info");
  };

  const confirmRemoveDownload = (chapterNumber) => {
      setAlertConfig({
          title: "حذف التنزيل",
          message: `هل تريد حذف الفصل ${chapterNumber} من الجهاز؟`,
          type: "warning",
          confirmText: "حذف",
          cancelText: "إلغاء",
          onConfirm: async () => {
              setAlertVisible(false);
              await removeOfflineChapter(novelId, chapterNumber);
              setDownloadedChapters(prev => prev.filter(n => n !== chapterNumber));
              // Also update offline cache list if we are in offline mode
              if (isOfflineMode) {
                  const newOffline = allOfflineChapters.filter(c => c.number !== chapterNumber);
                  setAllOfflineChapters(newOffline);
                  // Refresh UI
                  const currentStart = (currentPage - 1) * CHAPTERS_PER_PAGE;
                  const currentEnd = currentStart + CHAPTERS_PER_PAGE;
                  // Handle if page becomes empty
                  if (currentStart >= newOffline.length && currentPage > 1) {
                      setCurrentPage(prev => prev - 1);
                  } else {
                      updateOfflineChaptersList();
                  }
              }
              showToast("تم الحذف من الجهاز", "success");
          }
      });
      setAlertVisible(true);
  };

  const handleDeleteChapter = (chapNum) => {
    Alert.alert(
        "حذف الفصل",
        "هل أنت متأكد؟ لا يمكن التراجع عن هذا الإجراء.",
        [
            { text: "إلغاء", style: "cancel" },
            { 
                text: "حذف", 
                style: "destructive", 
                onPress: async () => {
                    try {
                        await api.delete(`/api/admin/chapters/${novelId}/${chapNum}`);
                        showToast("تم حذف الفصل بنجاح", "success");
                        // Refresh current page
                        fetchChaptersPage(currentPage);
                    } catch (e) {
                        showToast("فشل الحذف", "error");
                    }
                }
            }
        ]
    );
  };

  const handleEditChapter = (chapter) => {
      navigation.navigate('AdminDashboard', { 
          editNovel: fullNovel, 
          editChapter: { novelId: novelId, number: chapter.number, title: chapter.title }
      });
  };

  const handleEditNovel = () => {
      navigation.navigate('AdminDashboard', { editNovel: fullNovel });
  };

  const executeExport = async (includeTitle) => {
      // Construct Download URL with token and includeTitle query param
      const downloadUrl = `${api.defaults.baseURL}/api/admin/novels/${novelId}/export?token=${userToken}&includeTitle=${includeTitle}`;
      
      // 🔥 Open in Internal Browser (WebBrowser)
      await WebBrowser.openBrowserAsync(downloadUrl);
  };

  const handleExportNovel = () => {
      // Use standard Alert for options
      Alert.alert(
          "تنسيق التصدير",
          "هل تريد تضمين عنوان الفصل في بداية كل ملف نصي؟",
          [
              { text: "إلغاء", style: "cancel" },
              { 
                  text: "لا (النص فقط)", 
                  onPress: () => executeExport(false) 
              },
              { 
                  text: "نعم (تضمين العنوان)", 
                  onPress: () => executeExport(true) 
              }
          ]
      );
  };

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const imageScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.2, 1],
    extrapolate: 'clamp',
  });

  const toggleLibrary = async () => {
    if (isOfflineMode) { showToast("لا يمكن التعديل بدون إنترنت", "warning"); return; }
    try {
      const newStatus = !isFavorite;
      setIsFavorite(newStatus); 
      setFullNovel(prev => ({
          ...prev,
          favorites: (prev.favorites || 0) + (newStatus ? 1 : -1)
      }));
      await api.post('/api/novel/update', {
        novelId: novelId,
        title: fullNovel.title,
        cover: fullNovel.cover,
        author: fullNovel.author,
        isFavorite: newStatus
      });
      if (newStatus) showToast("تمت الإضافة للمفضلة");
      else showToast("تم الحذف من المفضلة", "info");
    } catch (error) {
      setIsFavorite(!isFavorite); 
      showToast("فشلت العملية", "error");
    }
  };

  const renderTabButton = (id, title) => (
    <TouchableOpacity 
      style={[styles.tabButton, activeTab === id && styles.tabButtonActive]}
      onPress={() => setActiveTab(id)}
    >
      <Text style={[styles.tabText, activeTab === id && styles.tabTextActive]}>{title}</Text>
    </TouchableOpacity>
  );

  const renderChapterItem = ({ item }) => {
    const isRead = readChapters.includes(item.number);
    const dateStr = item.createdAt ? new Date(item.createdAt).toISOString().split('T')[0].replace(/-/g, '/') : '---';
    const isDownloaded = downloadedChapters.includes(item.number);
    
    // 🔥 Check Queue Status
    const queueStatus = queueMap[item.number];
    const isDownloading = queueStatus === 'downloading';
    const isPending = queueStatus === 'pending';

    return (
        <View style={styles.chapterRowContainer}>
            <TouchableOpacity 
                style={styles.chapterBadge}
                onPress={() => {
                    if (!isOfflineMode) incrementView(novelId, item.number);
                    // Pass available chapters to Reader for offline navigation
                    navigation.navigate('Reader', { 
                        novel: fullNovel, 
                        chapterId: item.number, 
                        isOfflineMode,
                        availableChapters: isOfflineMode ? downloadedChapters : null
                    });
                }}
            >
                <Text style={styles.chapterBadgeText}>{item.number}</Text>
                {isRead && <View style={styles.readDot} />}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.chapterInfo}
              onPress={() => {
                if (!isOfflineMode) incrementView(novelId, item.number);
                navigation.navigate('Reader', { 
                    novel: fullNovel, 
                    chapterId: item.number, 
                    isOfflineMode,
                    availableChapters: isOfflineMode ? downloadedChapters : null
                });
              }}
            >
                <Text style={[styles.chapterTitle, isRead && styles.textRead]} numberOfLines={1}>
                    {item.title || `فصل ${item.number}`}
                </Text>
                <Text style={styles.chapterMeta}>
                    {fullNovel.author || 'Zeus'} • {dateStr}
                </Text>
            </TouchableOpacity>

             <View style={styles.adminControls}>
                 {/* 🔥 SHOW SPINNER IF DOWNLOADING OR PENDING IN QUEUE */}
                 {(isDownloading || isPending) ? (
                     <ActivityIndicator size="small" color="#fff" style={{padding: 5}} />
                 ) : isDownloaded ? (
                     <TouchableOpacity onPress={() => confirmRemoveDownload(item.number)} style={{padding: 5}}>
                         <Ionicons name="checkmark-circle" size={22} color="#fff" />
                     </TouchableOpacity>
                 ) : (
                     !isOfflineMode && (
                         <TouchableOpacity onPress={() => handleDownloadChapter(item)} style={{padding: 5}}>
                             <Ionicons name="cloud-download-outline" size={22} color="#fff" />
                         </TouchableOpacity>
                     )
                 )}

                 {isOwner && !isOfflineMode && (
                     <>
                         <TouchableOpacity style={styles.adminBtn} onPress={() => handleEditChapter(item)}>
                             <Ionicons name="create-outline" size={16} color="#4a7cc7" />
                         </TouchableOpacity>
                         <TouchableOpacity style={styles.adminBtn} onPress={() => handleDeleteChapter(item.number)}>
                             <Ionicons name="trash-outline" size={16} color="#ff4444" />
                         </TouchableOpacity>
                     </>
                 )}
             </View>
        </View>
    );
  };

  const AuthorWidget = () => {
      const displayName = authorProfile?.name || fullNovel.author || 'Zeus';
      const targetId = authorProfile?._id;
      const displayAvatar = authorProfile?.picture ? { uri: authorProfile.picture } : require('../../assets/adaptive-icon.png');
      const displayBanner = authorProfile?.banner ? { uri: authorProfile.banner } : require('../../assets/banner.png');

      return (
          <View style={styles.authorSection}>
              <Text style={styles.sectionTitle}>الناشر</Text>
              <TouchableOpacity 
                style={styles.authorCardContainer}
                activeOpacity={0.9}
                disabled={!targetId || isOfflineMode}
                onPress={() => { if (targetId) navigation.push('UserProfile', { userId: targetId }); }}
              >
                  <View style={styles.authorBannerWrapper}>
                    <Image source={displayBanner} style={styles.authorBannerImage} contentFit="cover" />
                    <LinearGradient colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFill} />
                    <View style={styles.authorOverlayContent}>
                        <View style={styles.authorAvatarWrapper}>
                            <Image source={displayAvatar} style={styles.authorAvatarImage} contentFit="cover" />
                        </View>
                        <Text style={styles.authorDisplayName} numberOfLines={1}>{displayName}</Text>
                        {!targetId && !isOfflineMode && <Text style={{color: '#888', fontSize: 10, marginTop: 4}}>جاري جلب البيانات...</Text>}
                    </View>
                  </View>
              </TouchableOpacity>
          </View>
      );
  };

  const renderPagination = () => {
      if (totalPages <= 1) return null;
      return (
          <View style={styles.paginationContainer}>
               <TouchableOpacity 
                   style={[styles.pageNavBtn, currentPage === 1 && styles.disabledBtn]} 
                   onPress={() => setCurrentPage(Math.max(1, currentPage - 1))}
                   disabled={currentPage === 1}
               >
                   <Ionicons name="arrow-back" size={20} color={currentPage === 1 ? "#555" : "#fff"} />
               </TouchableOpacity>

               <TouchableOpacity style={styles.pageSelector} onPress={() => setPagePickerVisible(true)}>
                   <Ionicons name="caret-down-sharp" size={12} color="#fff" style={{marginRight: 'auto'}} />
                   <View style={{alignItems: 'flex-end'}}>
                        <Text style={styles.pageLabel}>الصفحة</Text>
                        <Text style={styles.pageValue}>{currentPage}</Text>
                   </View>
               </TouchableOpacity>

               <TouchableOpacity 
                   style={[styles.pageNavBtn, currentPage === totalPages && styles.disabledBtn]} 
                   onPress={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                   disabled={currentPage === totalPages}
               >
                   <Ionicons name="arrow-forward" size={20} color={currentPage === totalPages ? "#555" : "#fff"} />
               </TouchableOpacity>
          </View>
      );
  };

  const allTags = [
    ...(fullNovel.category ? [fullNovel.category] : []),
    ...(fullNovel.tags || [])
  ];
  const uniqueTags = [...new Set(allTags)];

  const statusText = fullNovel.status || 'مستمرة';
  const statusColor = getStatusTextColor(statusText);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
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

      <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
        <SafeAreaView edges={['top']} style={styles.headerSafe}>
          <Text style={styles.headerTitle} numberOfLines={1}>{fullNovel.title}</Text>
        </SafeAreaView>
      </Animated.View>

      <SafeAreaView edges={['top']} style={styles.floatingControls}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        
        <View style={{flexDirection: 'row', gap: 10}}>
            {/* Export Button for Admin/Owner */}
            {isOwner && !isOfflineMode && (
                <TouchableOpacity 
                    style={[styles.iconButton, {backgroundColor: 'rgba(255, 153, 0, 0.2)'}]} 
                    onPress={handleExportNovel}
                >
                    <Ionicons name="download-outline" size={24} color="#f59e0b" />
                </TouchableOpacity>
            )}

            {isOwner && !isOfflineMode && (
                <TouchableOpacity style={[styles.iconButton, {backgroundColor: '#4a7cc7'}]} onPress={handleEditNovel}>
                    <Ionicons name="settings-outline" size={24} color="#fff" />
                </TouchableOpacity>
            )}
        </View>
      </SafeAreaView>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <Animated.View style={[styles.coverContainer, { transform: [{ scale: imageScale }] }]}>
          <Image 
            source={fullNovel.cover} 
            style={styles.coverImage} 
            contentFit="cover"
            cachePolicy="memory-disk" 
          />
          <LinearGradient colors={['transparent', '#000000']} style={styles.coverGradient} />
        </Animated.View>

        <View style={styles.contentContainer}>
          {/* 🔥 Updated Status Badge Style */}
          <View style={styles.statusBadgeContainer}>
            <View style={styles.statusBadge}>
                <Text style={[styles.statusText, {color: statusColor}]}>{statusText}</Text>
            </View>
          </View>

          <Text style={styles.title}>{fullNovel.title}</Text>
          
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              {/* Use pre-calculated chaptersCount */}
              <Text style={styles.statValue}>{fullNovel.chaptersCount || 0}</Text>
              <Text style={styles.statLabel}>فصل</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatNumber(fullNovel.views)}</Text>
              <Text style={styles.statLabel}>مشاهدة</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, {color: '#ffa500'}]}>{formatNumber(fullNovel.favorites || 0)}</Text>
              <Text style={styles.statLabel}>مفضلة</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            {/* Library Button */}
            <TouchableOpacity 
              style={[styles.libraryButton, isFavorite && styles.libraryButtonActive]} 
              onPress={toggleLibrary}
              disabled={loadingStatus || isOfflineMode}
            >
              {loadingStatus ? (
                  <ActivityIndicator size="small" color="#fff" />
              ) : (
                  <Ionicons name={isFavorite ? "checkmark" : "add"} size={24} color="#fff" />
              )}
            </TouchableOpacity>

            {/* Read Button - Updated Logic */}
            <TouchableOpacity 
              style={styles.readButton}
              onPress={() => {
                // Logic to start reading doesn't rely on chapter list being loaded
                let targetChapterNum = 1;
                if (lastReadChapterId > 0) {
                     targetChapterNum = lastReadChapterId;
                }
                
                if (!isOfflineMode) incrementView(novelId, targetChapterNum);
                navigation.navigate('Reader', { 
                    novel: fullNovel, 
                    chapterId: targetChapterNum, 
                    isOfflineMode,
                    // Pass the list of downloaded/available numbers to reader for navigation
                    availableChapters: isOfflineMode ? downloadedChapters : null
                });
              }}
            >
              {loadingStatus ? (
                  <ActivityIndicator color="#fff" />
              ) : (
                  <>
                    <Text style={styles.readButtonText}>
                        {lastReadChapterId > 0 ? 'استئناف القراءة' : 'ابدأ القراءة'}
                    </Text>
                    <Ionicons name="book-outline" size={20} color="#fff" style={{ marginLeft: 8 }} />
                  </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.tabsContainer}>
            {!isOfflineMode && renderTabButton('comments', 'التعليقات')} 
            {renderTabButton('chapters', 'الفصول')}
            {renderTabButton('about', 'نظرة عامة')} 
          </View>

          {activeTab === 'about' && (
            <View style={styles.aboutSection}>
              <Text style={styles.sectionTitle}>القصة</Text>
              <Text style={styles.descriptionText}>
                  {fullNovel.description || 'لا يوجد وصف متاح حالياً.'}
              </Text>
              
              <Text style={styles.sectionTitle}>التصنيفات</Text>
              <View style={styles.tagsRow}>
                {uniqueTags.map((tag, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.tag}
                    onPress={() => !isOfflineMode && navigation.navigate('Category', { category: tag })}
                    disabled={isOfflineMode}
                  >
                    <Text style={styles.tagText}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <AuthorWidget />
            </View>
          )} 
          
          {activeTab === 'comments' && !isOfflineMode && (
              <CommentsSection novelId={novelId} user={userInfo} />
          )}
          
          {activeTab === 'chapters' && (
            <View style={styles.chaptersList}>
               <TouchableOpacity 
                   style={styles.sortHeader} 
                   onPress={() => setSortPickerVisible(true)}
               >
                   <Ionicons name="caret-down" size={14} color="#888" />
                   <Text style={styles.sortHeaderText}>
                       {sortDesc ? 'ترتيب من أعلى لأقل' : 'ترتيب من أقل لأعلى'}
                   </Text>
               </TouchableOpacity>

               {loadingChapters ? (
                   <View style={{marginTop: 50, alignItems: 'center'}}>
                       <ActivityIndicator color="#4a7cc7" size="large" />
                       <Text style={{color: '#666', marginTop: 10}}>جاري التحميل...</Text>
                   </View>
               ) : chapters.length > 0 ? (
                   <>
                       {chapters.map(item => (
                         <View key={item._id || item.number}>
                            {renderChapterItem({ item })}
                         </View>
                       ))}
                       {renderPagination()}
                   </>
               ) : (
                   <Text style={{color: '#666', textAlign: 'center', marginTop: 20}}>لا توجد فصول بعد.</Text>
               )}
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* Page Picker Modal - Glassy Update */}
      <Modal visible={isPagePickerVisible} transparent animationType="fade" onRequestClose={() => setPagePickerVisible(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPagePickerVisible(false)}>
              <View style={styles.pickerContainer}>
                  <Text style={styles.pickerTitle}>اختر الصفحة</Text>
                  <FlatList
                      data={Array.from({length: totalPages}, (_, i) => i + 1)}
                      keyExtractor={item => item.toString()}
                      contentContainerStyle={{paddingVertical: 10}}
                      renderItem={({item}) => (
                          <TouchableOpacity 
                            style={[styles.pickerItem, item === currentPage && styles.pickerItemActive]}
                            onPress={() => { setCurrentPage(item); setPagePickerVisible(false); }}
                          >
                              {item === currentPage && <Ionicons name="checkmark" size={18} color="#fff" />}
                              <Text style={[styles.pickerItemText, item === currentPage && {color: '#fff', fontWeight: 'bold'}]}>{item}</Text>
                          </TouchableOpacity>
                      )}
                  />
              </View>
          </TouchableOpacity>
      </Modal>

      {/* Sort Picker Modal - Glassy Update */}
      <Modal visible={isSortPickerVisible} transparent animationType="fade" onRequestClose={() => setSortPickerVisible(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSortPickerVisible(false)}>
              <View style={[styles.pickerContainer, {maxHeight: 200}]}>
                  <Text style={styles.pickerTitle}>الترتيب</Text>
                  <TouchableOpacity 
                    style={[styles.pickerItem, !sortDesc && styles.pickerItemActive]}
                    onPress={() => { setSortDesc(false); setCurrentPage(1); setSortPickerVisible(false); }}
                  >
                      {!sortDesc && <Ionicons name="checkmark" size={18} color="#fff" />}
                      <Text style={[styles.pickerItemText, !sortDesc && {color:'#fff', fontWeight:'bold'}]}>ترتيب من أقل لأعلى</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.pickerItem, sortDesc && styles.pickerItemActive]}
                    onPress={() => { setSortDesc(true); setCurrentPage(1); setSortPickerVisible(false); }}
                  >
                      {sortDesc && <Ionicons name="checkmark" size={18} color="#fff" />}
                      <Text style={[styles.pickerItemText, sortDesc && {color:'#fff', fontWeight:'bold'}]}>ترتيب من أعلى لأقل</Text>
                  </TouchableOpacity>
              </View>
          </TouchableOpacity>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 90, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  headerSafe: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  floatingControls: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, pointerEvents: 'box-none' },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  coverContainer: { height: height * 0.55, width: '100%' },
  coverImage: { width: '100%', height: '100%' },
  coverGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%' },
  contentContainer: { marginTop: -40, paddingHorizontal: 20 },
  statusBadgeContainer: { alignItems: 'center', marginBottom: 10 },
  // 🔥 Modified Status Badge Style
  statusBadge: { 
      paddingHorizontal: 12, 
      paddingVertical: 4, 
      borderRadius: 8, 
      backgroundColor: 'rgba(0,0,0,0.6)', 
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)'
  },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 25 },
  statsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20, backgroundColor: '#111', paddingVertical: 15, borderRadius: 16, borderWidth: 1, borderColor: '#222' },
  statItem: { alignItems: 'center', paddingHorizontal: 20 },
  statValue: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  statLabel: { color: '#666', fontSize: 12, marginTop: 4 },
  statDivider: { width: 1, height: 30, backgroundColor: '#333' },
  actionRow: { flexDirection: 'row', gap: 15, marginBottom: 30 },
  
  // Updated Read Button: Glassy Style
  readButton: { 
      flex: 1, height: 56, 
      backgroundColor: 'rgba(255,255,255,0.1)', // Glassy
      borderRadius: 28, 
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)'
  },
  readButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  libraryButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#333' },
  libraryButtonActive: { backgroundColor: '#4a7cc7', borderColor: '#4a7cc7' },
  tabsContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1A1A1A', marginBottom: 20 },
  tabButton: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  tabButtonActive: { borderBottomWidth: 2, borderBottomColor: '#fff' },
  tabText: { fontSize: 16, color: '#666', fontWeight: '500' },
  tabTextActive: { color: '#fff', fontWeight: 'bold' },
  aboutSection: { paddingBottom: 40 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 12, textAlign: 'right', marginTop: 10 },
  descriptionText: { color: '#ccc', fontSize: 16, lineHeight: 26, textAlign: 'right', marginBottom: 25 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 },
  tag: { backgroundColor: '#1A1A1A', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#333' },
  tagText: { color: '#ccc', fontSize: 14 },
  paginationContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 30, gap: 10 },
  pageNavBtn: { width: 45, height: 45, borderRadius: 8, borderWidth: 1, borderColor: '#333', justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  disabledBtn: { opacity: 0.5, borderColor: '#222', backgroundColor: '#0a0a0a' },
  pageSelector: { flex: 1, height: 45, borderWidth: 1, borderColor: '#333', borderRadius: 8, backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, justifyContent: 'space-between' },
  pageLabel: { fontSize: 9, color: '#888', position: 'absolute', top: -8, right: 0, backgroundColor: '#111', paddingHorizontal: 2 },
  pageValue: { fontSize: 14, color: '#fff', fontWeight: 'bold', marginTop: 2 },
  
  // Updated Modal Styles: Glassy + Right Align
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { 
      width: '80%', maxHeight: '60%', 
      backgroundColor: 'rgba(20,20,20,0.95)', // Glassy Dark
      borderRadius: 12, 
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', 
      padding: 15 
  },
  pickerTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 10 },
  pickerItem: { 
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a', 
      flexDirection: 'row', justifyContent: 'flex-end', // Right Align
      alignItems: 'center', paddingHorizontal: 10, gap: 10
  },
  pickerItemActive: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, borderBottomColor: 'transparent' },
  pickerItemText: { color: '#ccc', fontSize: 16, textAlign: 'right' },
  
  chaptersList: { paddingBottom: 20 },
  sortHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, marginBottom: 5, borderBottomWidth: 1, borderBottomColor: '#333' },
  sortHeaderText: { color: '#888', fontSize: 12, textAlign: 'right' },
  
  chapterRowContainer: { flexDirection: 'row-reverse', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1A1A1A', paddingVertical: 12, justifyContent: 'space-between' },
  chapterBadge: { backgroundColor: '#000000', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 5, minWidth: 45, alignItems: 'center', justifyContent: 'center', marginLeft: 10, borderWidth: 1, borderColor: '#333' },
  chapterBadgeText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  readDot: { position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80', borderWidth: 1, borderColor: '#000' },
  chapterInfo: { flex: 1, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 10 },
  chapterTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold', textAlign: 'right', marginBottom: 3 },
  chapterMeta: { color: '#666', fontSize: 10, textAlign: 'right' },
  textRead: { color: '#888' },
  
  adminControls: { flexDirection: 'row', gap: 10, marginRight: 5 }, 
  adminBtn: { padding: 4, backgroundColor: '#1a1a1a', borderRadius: 4, borderWidth: 1, borderColor: '#333' },
  
  authorSection: { marginTop: 30, borderTopWidth: 1, borderColor: '#222', paddingTop: 20 },
  authorCardContainer: { borderRadius: 16, overflow: 'hidden', marginTop: 10, borderWidth: 1, borderColor: '#222' },
  authorBannerWrapper: { width: '100%', height: 140, justifyContent: 'center', alignItems: 'center', position: 'relative', backgroundColor: '#000' },
  authorBannerImage: { position: 'absolute', width: '100%', height: '100%' },
  authorOverlayContent: { alignItems: 'center', justifyContent: 'center', zIndex: 2, width: '100%' },
  authorAvatarWrapper: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: '#fff', backgroundColor: '#333', marginBottom: 8, overflow: 'hidden' },
  authorAvatarImage: { width: '100%', height: '100%' },
  authorDisplayName: { color: '#fff', fontSize: 20, fontWeight: 'bold', textTransform: 'uppercase', textShadowColor: 'rgba(0, 0, 0, 0.9)', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 6 }
});
