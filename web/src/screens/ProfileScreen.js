import React, { useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Animated,
  Dimensions,
  Modal,
  TextInput,
  ActivityIndicator,
  FlatList,
  Alert,
  StatusBar,
  ImageBackground
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { DrawerContext } from '../../App'; // Import Context

const { width } = Dimensions.get('window');
const HEADER_HEIGHT = 280;

// Config for Responsive Layout
const isMobile = width < 600;

// Improved date formatter
const formatDate = (dateString) => {
    if (!dateString) return 'غير معروف';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'غير معروف'; // Invalid date check
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

export default function ProfileScreen({ navigation, route }) {
  const { openDrawer } = useContext(DrawerContext); // Access Drawer
  const { userInfo } = useContext(AuthContext); 
  const { showToast } = useToast();
  
  // Public Profile Logic
  const targetUserId = route.params?.userId;
  const targetUserEmail = route.params?.email;
  const isSelf = !targetUserId && !targetUserEmail;
  
  // State
  const [activeTab, setActiveTab] = useState('data'); 
  const [loading, setLoading] = useState(true);
  
  // User Data State
  const [profileUser, setProfileUser] = useState(null); // The user being displayed
  const [stats, setStats] = useState({
      readChapters: 0,
      addedChapters: 0,
      totalViews: 0,
      joinDate: ''
  });

  // Data Lists & Pagination
  const [myWorks, setMyWorks] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [history, setHistory] = useState([]);

  const [worksPage, setWorksPage] = useState(1);
  const [favoritesPage, setFavoritesPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  const [hasMoreWorks, setHasMoreWorks] = useState(true);
  const [hasMoreFavorites, setHasMoreFavorites] = useState(true);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);

  const [loadingMore, setLoadingMore] = useState(false);
  
  // Animations
  const scrollY = useRef(new Animated.Value(0)).current;

  // Role Logic (for the profile being viewed)
  const isProfileAdmin = profileUser?.role === 'admin';
  const isProfileContributor = profileUser?.role === 'contributor' || isProfileAdmin; 
  const isViewerAdmin = userInfo?.role === 'admin';

  // Initial Load & Refetch
  useFocusEffect(
      useCallback(() => {
          fetchProfileData(false); // False means silent refresh if data exists
      }, [userInfo, targetUserId, targetUserEmail])
  );

  // 🔥 Main Fetch: Gets User Info + Stats + First page of Works
  const fetchProfileData = async (forceLoading = false) => {
      // Only show full spinner if it's the first load or explicit refresh
      if (forceLoading || (!profileUser && loading)) {
          setLoading(true);
      }

      try {
          // Construct Query Params
          let queryParams = '?page=1&limit=20'; // Reset pagination on full fetch
          if (targetUserId) queryParams += `&userId=${targetUserId}`;
          else if (targetUserEmail) queryParams += `&email=${targetUserEmail}`;

          // Fetch Stats & Public Profile Data
          const statsRes = await api.get(`/api/user/stats${queryParams}`);
          
          const userData = statsRes.data.user || userInfo; // Fallback to userInfo if self
          setProfileUser(userData);

          setMyWorks(statsRes.data.myWorks || []);
          setWorksPage(1);
          setHasMoreWorks((statsRes.data.myWorks || []).length === 20);

          setStats({
              readChapters: statsRes.data.readChapters || 0,
              addedChapters: statsRes.data.addedChapters || 0,
              totalViews: statsRes.data.totalViews || 0,
              joinDate: formatDate(userData?.createdAt)
          });

          // Fetch Private Data (Library/Favorites) - First Page Only
          const shouldFetchLibrary = isSelf || userData.isHistoryPublic;
          
          if (shouldFetchLibrary) {
             const libQuery = targetUserId ? `&userId=${targetUserId}` : '';
             
             // Fetch Favorites (Page 1)
             const favRes = await api.get(`/api/novel/library?type=favorites&page=1&limit=20${libQuery}`);
             setFavorites(favRes.data || []);
             setFavoritesPage(1);
             setHasMoreFavorites((favRes.data || []).length === 20);

             // Fetch History (Page 1)
             const historyRes = await api.get(`/api/novel/library?type=history&page=1&limit=20${libQuery}`);
             setHistory(historyRes.data || []);
             setHistoryPage(1);
             setHasMoreHistory((historyRes.data || []).length === 20);

          } else {
             setHistory([]); 
             setFavorites([]);
          }

      } catch (e) {
          console.error("Profile Fetch Error", e);
      } finally {
          setLoading(false);
      }
  };

  // 🔥 Load More Data (Pagination)
  const loadMoreData = async (type) => {
      if (loadingMore) return;
      setLoadingMore(true);

      try {
          let nextPage = 1;
          let endpoint = '';
          let params = `limit=20`;
          if (targetUserId) params += `&userId=${targetUserId}`;

          if (type === 'works') {
              nextPage = worksPage + 1;
              endpoint = '/api/user/stats'; // We reuse stats endpoint but it handles works pagination
              // Note: Stats endpoint sends works in `myWorks` field
          } else {
              endpoint = '/api/novel/library';
              if (type === 'favorites') {
                  nextPage = favoritesPage + 1;
                  params += `&type=favorites`;
              } else {
                  nextPage = historyPage + 1;
                  params += `&type=history`;
              }
          }

          params += `&page=${nextPage}`;
          
          const res = await api.get(`${endpoint}?${params}`);
          const newData = type === 'works' ? (res.data.myWorks || []) : (res.data || []);

          if (newData.length > 0) {
              if (type === 'works') {
                  setMyWorks(prev => [...prev, ...newData]);
                  setWorksPage(nextPage);
                  setHasMoreWorks(newData.length === 20);
              } else if (type === 'favorites') {
                  setFavorites(prev => [...prev, ...newData]);
                  setFavoritesPage(nextPage);
                  setHasMoreFavorites(newData.length === 20);
              } else {
                  setHistory(prev => [...prev, ...newData]);
                  setHistoryPage(nextPage);
                  setHasMoreHistory(newData.length === 20);
              }
          } else {
              if (type === 'works') setHasMoreWorks(false);
              else if (type === 'favorites') setHasMoreFavorites(false);
              else setHasMoreHistory(false);
          }

      } catch (e) {
          console.log("Load more error", e);
      } finally {
          setLoadingMore(false);
      }
  };

  // 🔍 Scroll handler for infinite loading
  const handleScroll = (event) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 50; // Distance from bottom to trigger load
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    if (isCloseToBottom && !loadingMore) {
      // Determine which tab is active and if it has more data
      if (activeTab === 'works' && hasMoreWorks) {
        loadMoreData('works');
      } else if (activeTab === 'favorites' && hasMoreFavorites) {
        loadMoreData('favorites');
      } else if (activeTab === 'history' && hasMoreHistory) {
        loadMoreData('history');
      }
    }
  };

  // --- Render Components ---

  const renderTabButton = (id, label) => (
      <TouchableOpacity 
        style={styles.tabButton}
        onPress={() => setActiveTab(id)}
      >
          <Text style={[styles.tabText, activeTab === id && styles.activeTabText]}>{label}</Text>
          {activeTab === id && <View style={styles.activeIndicator} />}
      </TouchableOpacity>
  );

  const renderDataRow = (icon, label, value, color = "#4a7cc7") => (
      <View style={styles.dataRow}>
          <View style={styles.dataValueContainer}>
              <Text style={styles.dataLabel}>{label}</Text>
              <Text style={styles.dataValue}>{value}</Text>
          </View>
          <View style={[styles.iconBox, { backgroundColor: `${color}20` }]}>
              <Ionicons name={icon} size={20} color={color} />
          </View>
      </View>
  );

  // 🔥 Responsive Grid/List Renderer (With Auto Load More, No Status Badge)
  const renderLibraryStyleGrid = (data, emptyMsg, type) => {
      if (!data || data.length === 0) {
          return (
              <View style={styles.emptyContainer}>
                  <Ionicons name="book-outline" size={40} color="#333" />
                  <Text style={styles.emptyText}>{emptyMsg}</Text>
              </View>
          );
      }

      return (
          <View>
              <View style={styles.gridContainer}>
                  {data.map((item, index) => {
                      const ContainerStyle = isMobile ? styles.mobileCard : styles.tabletCard;
                      const ImageStyle = isMobile ? styles.mobileImage : styles.tabletImage;
                      
                      return (
                        <TouchableOpacity
                            key={index}
                            style={ContainerStyle}
                            onPress={() => navigation.push('NovelDetail', { 
                                novel: { ...item, _id: item.novelId || item._id } 
                            })}
                            activeOpacity={0.8}
                        >
                            {isMobile ? (
                                // --- MOBILE VIEW ---
                                <>
                                    <View>
                                        <Image 
                                            source={item.cover} 
                                            style={ImageStyle}
                                            contentFit="cover" 
                                            transition={300}
                                            cachePolicy="memory-disk"
                                        />
                                        {/* ❌ Status Badge Removed Here */}
                                    </View>
                                    
                                    <View style={styles.mobileInfo}>
                                        <Text style={styles.novelTitle} numberOfLines={2}>{item.title}</Text>
                                        
                                        <View style={styles.novelStats}>
                                            <View style={styles.statBadge}>
                                                <Text style={styles.statText}>{item.chaptersCount || (item.chapters ? item.chapters.length : 0)} فصل</Text>
                                                <Ionicons name="book-outline" size={12} color="#888" style={{marginLeft: 4}} />
                                            </View>
                                        </View>
                                    </View>
                                </>
                            ) : (
                                // --- TABLET/LARGE VIEW ---
                                <>
                                    <Image 
                                        source={item.cover} 
                                        style={ImageStyle}
                                        contentFit="cover" 
                                        transition={300}
                                        cachePolicy="memory-disk"
                                    />
                                    {/* ❌ Status Badge Removed Here */}
                                    <View style={styles.cardInfo}>
                                        {/* تعديل الخط للشاشات الكبيرة: سطرين وخط أصغر */}
                                        <Text style={[styles.novelTitle, { fontSize: 11, height: 'auto' }]} numberOfLines={2}>{item.title}</Text>
                                        <View style={styles.novelStats}>
                                            <View style={styles.statBadge}>
                                                <Ionicons name="book-outline" size={12} color="#888" />
                                                <Text style={styles.statText}>{item.chaptersCount || (item.chapters ? item.chapters.length : 0)} فصل</Text>
                                            </View>
                                        </View>
                                    </View>
                                </>
                            )}
                        </TouchableOpacity>
                      );
                  })}
              </View>
          </View>
      );
  };

  const renderHistoryList = (data, emptyMsg) => {
    if (!data || data.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Ionicons name="time-outline" size={40} color="#333" />
                <Text style={styles.emptyText}>{emptyMsg}</Text>
            </View>
        );
    }
    return (
        <View>
            <View style={{ gap: 15 }}>
                {data.map((item, index) => (
                    <TouchableOpacity 
                        key={index}
                        style={styles.historyCard}
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate('Reader', { 
                            novel: { ...item, _id: item.novelId }, 
                            chapterId: item.lastChapterId 
                        })}
                    >
                        <Image 
                            source={item.cover} 
                            style={styles.historyImage} 
                            contentFit="cover"
                            transition={200}
                            cachePolicy="memory-disk"
                        />
                        <View style={styles.historyContent}>
                            <Text style={styles.historyTitle} numberOfLines={1}>{item.title}</Text>
                            
                            <View style={styles.historyChapterRow}>
                                <Text style={styles.historyChapterText} numberOfLines={1}>
                                    {item.lastChapterTitle ? `فصل ${item.lastChapterId}: ${item.lastChapterTitle}` : `الفصل ${item.lastChapterId}`}
                                </Text>
                            </View>

                            <View style={styles.progressBarBg}>
                                <View style={[styles.progressBarFill, { width: `${item.progress || 0}%` }]} />
                            </View>
                            <Text style={styles.progressText}>{item.progress || 0}% مكتمل</Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
  };

  const renderContent = () => {
      // Logic for showing library tabs: Self OR Public
      const showLibrary = isSelf || (profileUser && profileUser.isHistoryPublic);

      switch (activeTab) {
          case 'data':
              return (
                  <View style={styles.tabContent}>
                      <View style={styles.bioContainer}>
                          <Text style={styles.sectionTitle}>النبذة التعريفية</Text>
                          <Text style={styles.bioText}>
                              {profileUser?.bio || "لا توجد نبذة تعريفية."}
                          </Text>
                      </View>

                      <View style={styles.dataSection}>
                          {renderDataRow("person", "نوع العضوية", isProfileAdmin ? "مشرف (Admin)" : isProfileContributor ? "مساهم" : "قارئ", isProfileAdmin ? "#ff4444" : "#4a7cc7")}
                          <View style={styles.separator} />
                          {renderDataRow("book", "الفصول المقروءة", stats.readChapters, "#4ade80")}
                          <View style={styles.separator} />
                          {isProfileContributor && (
                              <>
                                  {renderDataRow("cloud-upload", "الفصول المضافة", stats.addedChapters, "#ffa500")}
                                  <View style={styles.separator} />
                                  {renderDataRow("eye", "المشاهدات", stats.totalViews, "#d44aff")}
                                  <View style={styles.separator} />
                              </>
                          )}
                          {renderDataRow("calendar", "تاريخ الانضمام", stats.joinDate, "#888")}
                      </View>
                  </View>
              );
          case 'works':
              return renderLibraryStyleGrid(myWorks, "لا توجد أعمال منشورة.", 'works');
          case 'favorites':
              return showLibrary ? renderLibraryStyleGrid(favorites, "قائمة المفضلة فارغة.", 'favorites') : null;
          case 'history':
              return showLibrary ? renderHistoryList(history, "سجل القراءة فارغ.") : null;
          default:
              return null;
      }
  };

  const AsyncStorage = require('@react-native-async-storage/async-storage').default;

  // Determine Dashboard Button
  const renderDashboardButton = () => {
      if (!isSelf || !isProfileContributor) return null;

      if (userInfo?.role === 'admin') {
          return (
            <TouchableOpacity style={styles.dashboardButton} onPress={() => navigation.navigate('AdminMain')}>
                <Ionicons name="grid" size={20} color="#fff" />
                <Text style={styles.dashboardButtonText}>لوحة التحكم</Text>
            </TouchableOpacity>
          );
      } else {
          // Contributor
          return (
            <TouchableOpacity style={styles.dashboardButton} onPress={() => navigation.navigate('Management')}>
                <Ionicons name="book" size={20} color="#fff" />
                <Text style={styles.dashboardButtonText}>أعمالي</Text>
            </TouchableOpacity>
          );
      }
  };

  // Logic to show/hide tabs
  const showLibraryTabs = isSelf || (profileUser && profileUser.isHistoryPublic);

  // Default Images Logic
  const bannerSource = profileUser?.banner ? { uri: profileUser.banner } : require('../../assets/banner.png');
  const avatarSource = profileUser?.picture ? { uri: profileUser.picture } : require('../../assets/adaptive-icon.png');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Glassy Background - Same as AdminMainScreen */}
      <ImageBackground 
        source={require('../../assets/adaptive-icon.png')} 
        style={styles.bgImage}
        blurRadius={20}
      >
          <LinearGradient colors={['rgba(0,0,0,0.6)', '#000000']} style={StyleSheet.absoluteFill} />
      </ImageBackground>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { 
          useNativeDriver: false,
          listener: (event) => handleScroll(event) // Add scroll listener for infinite loading
        })}
        scrollEventThrottle={16}
      >
        {/* Hero Section */}
        <View style={styles.heroContainer}>
            <Image 
                source={bannerSource} 
                style={styles.bannerImage}
                contentFit="cover"
            />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)', '#000000']} style={styles.heroGradient} />
            
            {/* Header Controls */}
            <View style={styles.headerControls}>
                {!isSelf && (
                    <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.profileInfo}>
                <View style={styles.avatarContainer}>
                    <Image 
                        source={avatarSource} 
                        style={styles.avatarImage} 
                        contentFit="cover" 
                    />
                </View>
                <Text style={styles.userName}>{profileUser?.name || 'مستخدم'}</Text>
                <Text style={styles.userRole}>{isProfileAdmin ? 'مشرف عام' : isProfileContributor ? 'مترجم / مؤلف' : 'قارئ مميز'}</Text>
                
                {renderDashboardButton()}
            </View>
        </View>

        {/* Tabs - Reordered & Conditional */}
        <View style={styles.tabsContainer}>
            {renderTabButton('data', 'البيانات')}
            {isProfileContributor && renderTabButton('works', 'الأعمال')}
            {showLibraryTabs && renderTabButton('favorites', 'المفضلة')}
            {showLibraryTabs && renderTabButton('history', 'السجل')}
        </View>

        {/* Content Area */}
        <View style={styles.contentContainer}>
            {loading && !profileUser ? (
                <ActivityIndicator color="#4a7cc7" style={{marginTop: 50}} />
            ) : renderContent()}
            {/* Loading indicator at the bottom when loadingMore */}
            {loadingMore && (
              <View style={styles.loadingMoreIndicator}>
                <ActivityIndicator size="small" color="#4a7cc7" />
              </View>
            )}
        </View>

        <View style={{height: 100}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  
  // Hero Section
  heroContainer: {
      height: HEADER_HEIGHT,
      width: '100%',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingBottom: 20,
      position: 'relative'
  },
  bannerImage: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: 0.6
  },
  heroGradient: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0
  },
  headerControls: {
      position: 'absolute',
      top: 50,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'flex-end', 
      paddingHorizontal: 20,
      zIndex: 10
  },
  iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 10,
  },
  profileInfo: {
      alignItems: 'center',
      zIndex: 2
  },
  avatarContainer: {
      width: 100,
      height: 100,
      borderRadius: 50,
      borderWidth: 3,
      borderColor: '#fff',
      overflow: 'hidden',
      marginBottom: 10,
      backgroundColor: '#333'
  },
  avatarImage: { width: '100%', height: '100%' },
  userName: {
      color: '#fff',
      fontSize: 22,
      fontWeight: 'bold',
      textShadowColor: 'rgba(0, 0, 0, 0.75)',
      textShadowOffset: {width: -1, height: 1},
      textShadowRadius: 10
  },
  userRole: {
      color: '#ccc',
      fontSize: 14,
      marginTop: 4,
      backgroundColor: 'rgba(0,0,0,0.5)',
      paddingHorizontal: 10,
      paddingVertical: 2,
      borderRadius: 10
  },
  dashboardButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#4a7cc7',
      paddingHorizontal: 15,
      paddingVertical: 8,
      borderRadius: 20,
      marginTop: 15,
      gap: 8
  },
  dashboardButtonText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 14
  },

  // Tabs
  tabsContainer: {
      flexDirection: 'row-reverse',
      backgroundColor: 'rgba(0,0,0,0.5)', // Semi-transparent for glass effect
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  tabButton: {
      flex: 1,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative'
  },
  tabText: {
      color: '#ccc',
      fontSize: 14,
      fontWeight: '500'
  },
  activeTabText: {
      color: '#fff',
      fontWeight: 'bold'
  },
  activeIndicator: {
      position: 'absolute',
      bottom: 0,
      width: '60%',
      height: 3,
      backgroundColor: '#fff',
      borderRadius: 2
  },

  // Content
  contentContainer: {
      padding: 20,
      minHeight: 300
  },
  bioContainer: {
      marginBottom: 25,
      paddingBottom: 20,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.1)'
  },
  sectionTitle: {
      color: '#fff',
      fontSize: 16,
      fontWeight: 'bold',
      marginBottom: 10,
      textAlign: 'right'
  },
  bioText: {
      color: '#ccc',
      fontSize: 14,
      lineHeight: 22,
      textAlign: 'right'
  },
  
  // Data Rows (RTL Fix)
  dataSection: {
      gap: 0
  },
  dataRow: {
      flexDirection: 'row', 
      justifyContent: 'flex-end', 
      alignItems: 'center',
      paddingVertical: 12
  },
  dataValueContainer: {
      alignItems: 'flex-end', 
      marginRight: 15 
  },
  dataLabel: {
      color: '#fff',
      fontSize: 14,
      marginBottom: 2,
      fontWeight: 'bold',
      textAlign: 'right'
  },
  dataValue: {
      color: '#888',
      fontSize: 12,
      textAlign: 'right'
  },
  iconBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center'
  },
  separator: {
      height: 1,
      backgroundColor: 'rgba(255,255,255,0.1)',
      width: '100%'
  },

  // Grid Style (Exact copy of LibraryScreen)
  gridContainer: {
      flexDirection: 'row-reverse',
      flexWrap: 'wrap',
      gap: 15, 
      justifyContent: 'flex-start'
  },
  mobileCard: {
      width: '100%',
      height: 120, 
      backgroundColor: 'rgba(22, 22, 22, 0.8)', // Semi-transparent
      borderRadius: 12,
      marginBottom: 10,
      flexDirection: 'row-reverse', 
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
  },
  mobileImage: {
      width: 80,
      height: '100%',
  },
  mobileInfo: {
      flex: 1,
      padding: 10,
      justifyContent: 'space-between',
      alignItems: 'flex-end'
  },
  tabletCard: {
      width: 160, 
      backgroundColor: 'rgba(22, 22, 22, 0.8)',
      borderRadius: 12,
      marginBottom: 15,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
  },
  tabletImage: {
      width: '100%',
      height: 220, 
      backgroundColor: '#000',
  },
  cardInfo: {
      padding: 10,
  },
  novelTitle: {
      color: '#fff',
      fontSize: 13,
      fontWeight: 'bold',
      textAlign: 'right',
      marginBottom: 8,
  },
  novelStats: {
      flexDirection: 'row-reverse',
      justifyContent: 'space-between',
      alignItems: 'center',
  },
  statBadge: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 4,
  },
  statText: {
      color: '#888',
      fontSize: 11,
  },

  // History Style (Horizontal Card)
  historyCard: { 
      flexDirection: 'row-reverse', 
      backgroundColor: 'rgba(22, 22, 22, 0.8)', 
      borderRadius: 12, 
      padding: 10, 
      height: 110, 
      alignItems: 'center', 
      borderWidth: 1, 
      borderColor: 'rgba(255,255,255,0.1)',
  },
  historyImage: { 
      width: 70, 
      height: '100%', 
      borderRadius: 8, 
      marginLeft: 15 
  },
  historyContent: { 
      flex: 1, 
      alignItems: 'flex-end', 
      justifyContent: 'center',
      height: '100%',
      paddingVertical: 5
  },
  historyTitle: { 
      color: '#fff', 
      fontSize: 15, 
      fontWeight: 'bold', 
      textAlign: 'right', 
      marginBottom: 8 
  },
  historyChapterRow: { 
      flexDirection: 'row-reverse', 
      alignItems: 'center', 
      marginBottom: 8
  },
  historyChapterText: { 
      color: '#4a7cc7', 
      fontSize: 13, 
      fontWeight: '600',
      textAlign: 'right' 
  },
  progressBarBg: {
      width: '100%',
      height: 4,
      backgroundColor: '#333',
      borderRadius: 2,
      marginBottom: 4
  },
  progressBarFill: {
      height: '100%',
      backgroundColor: '#4ade80',
      borderRadius: 2
  },
  progressText: {
      color: '#666',
      fontSize: 10,
      textAlign: 'right'
  },
  emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 50
  },
  emptyText: {
      color: '#444',
      marginTop: 10,
      fontSize: 14
  },

  // Loading indicator for infinite scroll
  loadingMoreIndicator: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});