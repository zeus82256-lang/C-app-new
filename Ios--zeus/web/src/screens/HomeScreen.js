
import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
  FlatList,
  Dimensions,
  AppState,
  Modal,
  TouchableWithoutFeedback,
  Easing
} from 'react-native';
import { Image } from 'expo-image'; 
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../services/api';
import { useApp } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { DrawerContext } from '../../App'; // Import Context

const { width } = Dimensions.get('window');
const isLargeScreen = width > 600;

// Helper for source name
const getSourceName = (url) => {
    if (!url) return null;
    if (url.includes('rewayat.club')) return 'نادي الروايات';
    if (url.includes('ar-no.com') || url.includes('ar-novel')) return 'Ar-Novel';
    if (url.includes('novelfire')) return 'Novel Fire';
    if (url.includes('freewebnovel')) return 'Free WebNovel';
    if (url.includes('wuxiabox')) return 'WuxiaBox';
    return 'مصدر خارجي';
};

const getTimeAgo = (date) => {
  if (!date) return 'قريباً';
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

// 🔥 Updated Status Colors (Text Only)
const getStatusTextColor = (status) => {
    switch (status) {
        case 'مكتملة': return '#27ae60'; // Dark Green
        case 'متوقفة': return '#c0392b'; // Dark Red
        default: return '#2980b9';       // Dark Blue (Ongoing)
    }
};

const HeroCarousel = ({ data, navigation, scrollY }) => {
    const flatListRef = useRef(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const userTouched = useRef(false);
    const startTimeRef = useRef(Date.now());

    useFocusEffect(
        useCallback(() => {
            startTimeRef.current = Date.now();
            const timer = setInterval(() => {
                if (data.length > 1 && !userTouched.current) {
                    let nextIndex = currentIndex + 1;
                    if (nextIndex >= data.length) nextIndex = 0;
                    if (flatListRef.current) {
                        flatListRef.current.scrollToIndex({ index: nextIndex, animated: true });
                        setCurrentIndex(nextIndex);
                    }
                }
            }, 5500);
            return () => clearInterval(timer);
        }, [currentIndex, data.length])
    );

    const imageScale = scrollY.interpolate({
        inputRange: [-150, 0],
        outputRange: [1.5, 1],
        extrapolate: 'clamp',
    });

    const renderItem = ({ item }) => {
        const statusText = item.status || 'مستمرة';
        const textColor = getStatusTextColor(statusText);

        return (
            <View style={{ width: width, height: 400 }}>
                <Image 
                    source={item.cover} 
                    style={StyleSheet.absoluteFillObject} 
                    contentFit="cover"
                    blurRadius={15} 
                    transition={200}
                />
                <LinearGradient 
                    colors={['transparent', 'rgba(0,0,0,0.6)', '#000000']} 
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.heroContent}>
                    <View style={styles.heroInfoContainer}>
                         {/* 🔥 Updated Glassy Badge */}
                         <View style={[styles.tagContainer, { alignSelf: 'flex-end' }]}>
                            <Text style={[styles.tagText, { color: textColor }]}>{statusText}</Text>
                        </View>
                        <Text style={styles.heroTitle} numberOfLines={2}>{item.title}</Text>
                        <Text style={styles.heroAuthor}>{item.author}</Text>
                        
                        <View style={styles.heroStats}>
                             <View style={styles.heroStatItem}>
                                <Text style={styles.heroStatText}>{item.chaptersCount || 0} فصل</Text>
                                <Ionicons name="book" size={14} color="#4a7cc7" style={{marginLeft: 5}} />
                             </View>
                             <View style={styles.heroStatDivider} />
                             <View style={styles.heroStatItem}>
                                <Text style={[styles.heroStatText, {color: '#ccc'}]}>{item.views || 0}</Text>
                                <Ionicons name="eye" size={14} color="#888" style={{marginLeft: 5}} />
                             </View>
                        </View>

                        <TouchableOpacity 
                            style={styles.heroReadButton}
                            onPress={() => navigation.navigate('NovelDetail', { novel: item })}
                        >
                            <Text style={styles.heroReadButtonText}>اقرأ الآن</Text>
                            <Ionicons name="arrow-back" size={18} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity 
                        activeOpacity={0.9}
                        onPress={() => navigation.navigate('NovelDetail', { novel: item })}
                        style={styles.heroPosterWrapper}
                    >
                        <Image 
                            source={item.cover} 
                            style={styles.heroPoster} 
                            contentFit="cover"
                            transition={500}
                        />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    if (data.length === 0) return null;

    return (
        <Animated.View style={{ transform: [{ scale: imageScale }], height: 400, overflow: 'hidden' }}>
            <FlatList
                ref={flatListRef}
                data={data}
                renderItem={renderItem}
                keyExtractor={item => item._id}
                horizontal
                pagingEnabled
                inverted={true} 
                showsHorizontalScrollIndicator={false}
                onTouchStart={() => { userTouched.current = true; }}
                onTouchEnd={() => { setTimeout(() => { userTouched.current = false; }, 4000); }}
                onMomentumScrollEnd={(ev) => {
                    const index = Math.round(ev.nativeEvent.contentOffset.x / width);
                    setCurrentIndex(index);
                }}
            />
        </Animated.View>
    );
};

// 🔥 Updated NovelCard with Rank Support
const NovelCard = ({ item, onPress, size = 'normal', rank }) => {
  const cardWidth = size === 'large' ? 160 : 130;
  const cardHeight = size === 'large' ? 240 : 190;
  const sourceName = getSourceName(item.sourceUrl);

  // 🔥 Calm Night Colors for Ranking Badges
  const getRankColor = (r) => {
      if (r === 1) return '#CFA006'; // Muted Gold (Calm Night)
      if (r === 2) return '#758896'; // Muted Slate/Silver (Calm Night)
      if (r === 3) return '#A3684B'; // Muted Bronze/Wood (Calm Night)
      return 'rgba(60, 60, 60, 0.9)'; // Dark subtle grey for others
  };

  return (
    <TouchableOpacity 
      style={[styles.cardContainer, { width: cardWidth, marginLeft: 15 }]} 
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={[styles.imageContainer, { width: cardWidth, height: cardHeight }]}>
        <Image 
          source={item.cover} 
          style={[styles.cardImage, { width: cardWidth, height: cardHeight }]}
          contentFit="cover"
          transition={300}
          cachePolicy="memory-disk"
        />
        
        {/* 🔥 Rank Badge (Unique Design) */}
        {rank && (
            <View style={[styles.rankBadge, { backgroundColor: getRankColor(rank) }]}>
                <Text style={styles.rankText}>{rank}</Text>
            </View>
        )}

        <View style={styles.chapterCountOverlay}>
          <Text style={styles.chapterCountText}>{item.chaptersCount || 0} فصل</Text>
        </View>
        {sourceName && (
            <View style={styles.cardSourceBadge}>
                <Text style={styles.cardSourceText}>{sourceName}</Text>
            </View>
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
    </TouchableOpacity>
  );
};

const AutoScrollCarousel = ({ data, renderItem, itemWidth }) => {
    return (
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item) => item._id}
        horizontal
        inverted={true}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 15 }}
      />
    );
};

export default function HomeScreen({ navigation }) {
  // Access the Drawer Context
  const { openDrawer } = useContext(DrawerContext);

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastReadItem, setLastReadItem] = useState(null);
  
  const [featured, setFeatured] = useState([]);
  const [trending, setTrending] = useState([]);
  const [latestUpdates, setLatestUpdates] = useState([]);
  const [newArrivals, setNewArrivals] = useState([]);
  
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifAnim = useRef(new Animated.Value(0)).current;
  const notifButtonRef = useRef(null);
  const [notifButtonPos, setNotifButtonPos] = useState(0);

  const scrollY = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    React.useCallback(() => {
      fetchLastRead();
      fetchNotifications();
    }, [])
  );

  const fetchNotifications = async () => {
    try {
        const res = await api.get('/api/notifications');
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.totalUnread || 0); 
    } catch (e) {
        console.log("Failed notifications");
    }
  };

  const fetchLastRead = async () => {
    try {
        const lastReadRes = await api.get('/api/novel/library?type=history');
        if (lastReadRes.data && lastReadRes.data.length > 0) {
            setLastReadItem(lastReadRes.data[0]);
        }
    } catch (e) {
        console.log("Failed to fetch last read");
    }
  };

  const fetchData = async () => {
    try {
      const [featuredRes, trendingRes, updatesRes, newRes] = await Promise.all([
          api.get('/api/novels?filter=featured&limit=5'),
          api.get(`/api/novels?filter=trending&timeRange=week`), // Defaulting to week since tabs are removed
          api.get('/api/novels?filter=latest_updates&limit=24'),
          api.get('/api/novels?filter=latest_added')
      ]);

      setFeatured(featuredRes.data.novels || featuredRes.data || []);
      // 🔥 Slice Trending to 12 items
      setTrending((trendingRes.data.novels || trendingRes.data || []).slice(0, 12));
      setLatestUpdates(updatesRes.data.novels || updatesRes.data || []);
      // 🔥 Slice New Arrivals to 12 items
      setNewArrivals((newRes.data.novels || newRes.data || []).slice(0, 12));
      
      await Promise.all([fetchLastRead(), fetchNotifications()]);

    } catch (error) {
      console.error("Home fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const toggleNotifications = () => {
      if (showNotifications) {
          Animated.timing(notifAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setShowNotifications(false));
      } else {
          // Measure button position for correct alignment
          if (notifButtonRef.current) {
              notifButtonRef.current.measure((fx, fy, width, height, px, py) => {
                  setNotifButtonPos(py + height); // Position below button
                  setShowNotifications(true);
                  Animated.spring(notifAnim, { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }).start();
              });
          }
      }
  };

  const markAllRead = async () => {
      // Optimistic UI Update
      setUnreadCount(0);
      setNotifications([]);
      setShowNotifications(false); 
      
      try {
          await api.post('/api/notifications/mark-read');
      } catch (e) {
          console.log("Failed to mark all as read");
      }
  };

  const markItemRead = (id) => {
      const item = notifications.find(n => n._id === id);
      if (item) {
          setUnreadCount(prev => Math.max(0, prev - item.newChaptersCount));
          setNotifications(prev => prev.filter(n => n._id !== id));
      }
  };

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const renderNotificationItem = ({ item }) => (
      <TouchableOpacity 
        style={styles.notifItem}
        onPress={() => {
            toggleNotifications();
            markItemRead(item._id); // Mark as read when clicked
            navigation.navigate('NovelDetail', { novel: item });
        }}
      >
          <View style={styles.notifContent}>
              <View style={{flex: 1}}>
                  <Text style={styles.notifTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.notifTime}>{getTimeAgo(item.updatedAt)}</Text>
                  <View style={styles.notifBadgeRow}>
                      <View style={styles.notifChapterBadge}>
                          <Text style={styles.notifChapterText}>فصل {item.lastChapterNumber}</Text>
                      </View>
                      {item.newChaptersCount > 1 && (
                           <View style={styles.notifPlusBadge}>
                               <Ionicons name="add" size={10} color="#fff" />
                           </View>
                      )}
                  </View>
              </View>
          </View>
          <Image 
            source={item.cover} 
            style={styles.notifImage} 
            contentFit="cover"
          />
      </TouchableOpacity>
  );

  const renderNotificationsDropdown = () => {
      if (!showNotifications) return null;
      
      const scaleY = notifAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
      const translateY = notifAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] });

      return (
          <View style={styles.dropdownOverlay} pointerEvents="box-none">
              <TouchableWithoutFeedback onPress={toggleNotifications}>
                  <View style={StyleSheet.absoluteFill} />
              </TouchableWithoutFeedback>
              
              <Animated.View 
                style={[
                    styles.dropdownContainer,
                    {
                        top: notifButtonPos + 10, // Position dynamically based on button
                        opacity: notifAnim,
                        transform: [{ scaleY }, { translateY }]
                    }
                ]}
              >
                  <View style={styles.dropdownArrow} />
                  <View style={styles.dropdownHeader}>
                      <TouchableOpacity onPress={markAllRead}>
                          <Text style={{color: '#4a7cc7', fontSize: 12}}>تحديد الكل كمقروء</Text>
                      </TouchableOpacity>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>
                          {unreadCount > 0 && <View style={styles.dropdownCountBadge}><Text style={styles.dropdownCountText}>{unreadCount}</Text></View>}
                          <Text style={styles.dropdownTitle}>التحديثات</Text>
                      </View>
                  </View>
                  
                  {notifications.length === 0 ? (
                      <View style={styles.emptyNotif}>
                          <Ionicons name="checkmark-done-circle-outline" size={30} color="#4ade80" />
                          <Text style={styles.emptyNotifText}>أنت مواكب لكل جديد!</Text>
                      </View>
                  ) : (
                      <FlatList
                        data={notifications}
                        renderItem={renderNotificationItem}
                        keyExtractor={item => item._id}
                        style={{maxHeight: 300}}
                        showsVerticalScrollIndicator={true}
                      />
                  )}
              </Animated.View>
          </View>
      );
  };

  const renderUpdateGridItem = ({ item }) => {
    const lastChapter = (item.chapters && item.chapters.length > 0) ? item.chapters[item.chapters.length - 1] : null;
    const sourceName = getSourceName(item.sourceUrl);

    return (
      <TouchableOpacity 
        style={styles.gridCard}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('NovelDetail', { novel: item })}
      >
        <Image 
          source={item.cover} 
          style={styles.gridImage} 
          contentFit="cover"
          transition={300}
          cachePolicy="memory-disk"
        />
        <View style={styles.gridContent}>
          <Text style={styles.gridTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.gridChapterRow}>
            <Text style={styles.gridChapterText} numberOfLines={1}>
                {lastChapter ? `فصل ${lastChapter.number}: ${lastChapter.title || ''}` : 'قريباً'}
            </Text>
          </View>
          <View style={styles.gridTimeRow}>
            <Ionicons name="time-outline" size={14} color="#888" style={{ marginLeft: 6 }} />
            <Text style={styles.gridTimeText}>{getTimeAgo(item.lastChapterUpdate)}</Text>
          </View>
          {sourceName && <Text style={{color:'#666', fontSize:9, marginTop:4, textAlign:'right'}}>{sourceName}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4a7cc7" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {renderNotificationsDropdown()}

      {/* Sticky Header with Buttons */}
      <Animated.View style={[styles.stickyHeader, { opacity: headerOpacity }]}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerContent}>
             <TouchableOpacity onPress={() => navigation.navigate('Search')} style={styles.iconBtn}>
               <Ionicons name="search" size={24} color="#fff" />
             </TouchableOpacity>
             
             <Text style={styles.headerTitleSticky}>الرئيسية</Text>
             
             <View style={styles.rightIcons}>
                 <TouchableOpacity 
                    ref={notifButtonRef} 
                    style={styles.iconBtn} 
                    onPress={toggleNotifications}
                 >
                    <Ionicons name={unreadCount > 0 ? "notifications" : "notifications-outline"} size={24} color="#fff" />
                    {unreadCount > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                        </View>
                    )}
                 </TouchableOpacity>

                 {/* زر القائمة الجديد - يفتح الدرج الجانبي */}
                 <TouchableOpacity style={styles.iconBtn} onPress={openDrawer}>
                    <Ionicons name="menu" size={28} color="#fff" />
                 </TouchableOpacity>
             </View>
          </View>
        </SafeAreaView>
      </Animated.View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" progressViewOffset={40} />}
      >
        <HeroCarousel data={featured} navigation={navigation} scrollY={scrollY} />

        {lastReadItem && (
          <View style={styles.continueSection}>
            <Text style={styles.sectionTitleSimple}>استئناف القراءة</Text>
            <TouchableOpacity 
              style={styles.continueCard}
              onPress={() => navigation.navigate('Reader', { novel: { ...lastReadItem, _id: lastReadItem.novelId }, chapterId: lastReadItem.lastChapterId })}
            >
              <Image source={lastReadItem.cover} style={styles.continueCover} contentFit="cover" cachePolicy="memory-disk" />
              <View style={styles.continueInfo}>
                <Text style={styles.continueTitle}>{lastReadItem.title}</Text>
                <Text style={styles.continueChapter}>{lastReadItem.lastChapterTitle || `الفصل ${lastReadItem.lastChapterId}`}</Text>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${lastReadItem.progress || 0}%` }]} />
                </View>
                <Text style={styles.progressText}>{lastReadItem.progress || 0}% مكتمل</Text>
              </View>
              <View style={styles.playIconContainer}><Ionicons name="play" size={20} color="#000" /></View>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            {/* 🔥 Replaced Filters with See All for Trending */}
            <TouchableOpacity onPress={() => navigation.navigate('Category', { title: 'الأكثر قراءة', filter: 'trending' })}>
                 <Text style={styles.seeAll}>المزيد</Text>
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>الأكثر قراءة</Text>
          </View>
          
          {/* 🔥 Modified Render Item to pass Index/Rank */}
          <AutoScrollCarousel 
            data={trending} 
            renderItem={({item, index}) => (
                <NovelCard 
                    item={item} 
                    onPress={() => navigation.navigate('NovelDetail', { novel: item })} 
                    rank={index + 1} // Pass rank 1-12
                />
            )} 
            itemWidth={130} 
          />
        </View>

        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                {/* Updated Navigation to pass filter type */}
                <TouchableOpacity onPress={() => navigation.navigate('Category', { title: 'آخر الفصول', filter: 'latest_updates' })}>
                    <Text style={styles.seeAll}>المزيد</Text>
                </TouchableOpacity>
                <Text style={styles.sectionTitle}>آخر الفصول</Text>
            </View>
            <View style={styles.gridContainer}>
                {latestUpdates.map(item => (
                    <View key={item._id} style={[styles.gridWrapper, { width: isLargeScreen ? '48%' : '100%' }]}>
                        {renderUpdateGridItem({item})}
                    </View>
                ))}
            </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
             {/* Updated Navigation to pass filter type */}
             <TouchableOpacity onPress={() => navigation.navigate('Category', { title: 'أضيف حديثاً', filter: 'latest_added' })}>
                 <Text style={styles.seeAll}>المزيد</Text>
             </TouchableOpacity>
             <Text style={styles.sectionTitle}>أضيف حديثاً</Text>
          </View>
          <FlatList
            data={newArrivals}
            horizontal
            inverted={true}
            renderItem={({item}) => (
                <NovelCard 
                    item={item} 
                    onPress={() => navigation.navigate('NovelDetail', { novel: item })} 
                    size="large" 
                    // No rank prop passed here = No Badge
                />
            )}
            keyExtractor={item => item._id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{paddingHorizontal: 15}}
          />
        </View>

        <View style={{ height: 100 }} />
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  stickyHeader: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 100, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, paddingTop: 40 },
  headerTitleSticky: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  iconBtn: { position: 'relative', padding: 5 },
  rightIcons: { flexDirection: 'row', gap: 15 }, 
  badge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#ff4444', borderRadius: 10, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 2, borderWidth: 1.5, borderColor: '#000' },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  dropdownOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000 },
  dropdownContainer: { position: 'absolute', right: 20, width: 300, backgroundColor: '#161616', borderRadius: 12, borderWidth: 1, borderColor: '#333', shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 20, transformOrigin: 'top right' },
  dropdownArrow: { position: 'absolute', top: -10, right: 55, width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 10, borderStyle: 'solid', backgroundColor: 'transparent', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#333' },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  dropdownTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  dropdownCountBadge: { backgroundColor: '#ff4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  dropdownCountText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  notifItem: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: '#222', alignItems: 'center' },
  notifImage: { width: 40, height: 55, borderRadius: 4, marginLeft: 10, backgroundColor: '#333' },
  notifContent: { flex: 1, alignItems: 'flex-end' },
  notifTitle: { color: '#fff', fontSize: 13, fontWeight: 'bold', marginBottom: 2, textAlign: 'right' },
  notifTime: { color: '#666', fontSize: 10, marginBottom: 5 },
  notifBadgeRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  notifChapterBadge: { backgroundColor: '#222', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: '#444' },
  notifChapterText: { color: '#ccc', fontSize: 10 },
  notifPlusBadge: { backgroundColor: '#4a7cc7', width: 14, height: 14, borderRadius: 7, justifyContent: 'center', alignItems: 'center' },
  emptyNotif: { padding: 30, alignItems: 'center', gap: 10 },
  emptyNotifText: { color: '#666', fontSize: 14 },
  heroContent: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, paddingBottom: 40 },
  heroPosterWrapper: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 12 },
  heroPoster: { width: 140, height: 210, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  heroInfoContainer: { flex: 1, marginRight: 20, alignItems: 'flex-end', justifyContent: 'flex-end', height: 210, paddingBottom: 5 },
  // 🔥 Updated Tag Style
  tagContainer: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  tagText: { fontWeight: 'bold', fontSize: 10 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', textAlign: 'right', marginBottom: 6, lineHeight: 30 },
  heroAuthor: { color: '#ccc', fontSize: 14, textAlign: 'right', marginBottom: 10 },
  heroStats: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 15, justifyContent: 'flex-start' },
  heroStatItem: { flexDirection: 'row', alignItems: 'center' },
  heroStatText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  heroStatDivider: { width: 1, height: 14, backgroundColor: '#444', marginHorizontal: 12 },
  heroReadButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4a7cc7', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25, gap: 5 },
  heroReadButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  section: { marginTop: 35, paddingBottom: 5 },
  continueSection: { marginTop: 20, paddingBottom: 5 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 15 },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  sectionTitleSimple: { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'right', marginRight: 20, marginBottom: 15 },
  seeAll: { color: '#666', fontSize: 14 },
  cardContainer: { borderRadius: 8, overflow: 'hidden' },
  imageContainer: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#1A1A1A', marginBottom: 8, position: 'relative' },
  cardImage: { borderRadius: 8 },
  
  // 🔥 Rank Badge
  rankBadge: {
      position: 'absolute',
      top: 0, 
      right: 10,
      width: 28,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderBottomLeftRadius: 14, 
      borderBottomRightRadius: 14, 
      zIndex: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 2,
      elevation: 3,
      paddingBottom: 2
  },
  rankText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 16,
  },

  chapterCountOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', paddingVertical: 4, alignItems: 'center' },
  chapterCountText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  cardSourceBadge: { position: 'absolute', top: 5, left: 5, backgroundColor:'rgba(0,0,0,0.6)', paddingHorizontal: 4, borderRadius: 4},
  cardSourceText: { color: '#ccc', fontSize: 8, fontWeight: 'bold' },
  cardTitle: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'right', marginBottom: 4 },
  continueCard: { marginHorizontal: 20, backgroundColor: '#111', borderRadius: 12, padding: 15, flexDirection: 'row-reverse', alignItems: 'center', borderWidth: 1, borderColor: '#222' },
  continueCover: { width: 60, height: 90, borderRadius: 6, marginLeft: 15 },
  continueInfo: { flex: 1, alignItems: 'flex-end' },
  continueTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  continueChapter: { color: '#888', fontSize: 13, marginBottom: 10 },
  progressBarBg: { width: '100%', height: 4, backgroundColor: '#333', borderRadius: 2, marginBottom: 6 },
  progressBarFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
  progressText: { color: '#666', fontSize: 10 },
  playIconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  gridContainer: { flexDirection: 'row-reverse', flexWrap: 'wrap', paddingHorizontal: 20, justifyContent: 'space-between' },
  gridWrapper: { marginBottom: 15 },
  gridCard: { flexDirection: 'row-reverse', backgroundColor: '#161616', borderRadius: 12, padding: 10, height: 110, alignItems: 'center', borderWidth: 1, borderColor: '#333', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 },
  gridImage: { width: 70, height: '100%', borderRadius: 8, marginLeft: 15 },
  gridContent: { flex: 1, alignItems: 'flex-end', justifyContent: 'center', height: '100%', paddingVertical: 5 },
  gridTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', textAlign: 'right', marginBottom: 8 },
  gridChapterRow: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 6 },
  gridChapterText: { color: '#4a7cc7', fontSize: 13, fontWeight: '600', textAlign: 'right' },
  gridTimeRow: { flexDirection: 'row-reverse', alignItems: 'center', opacity: 0.8 },
  gridTimeText: { color: '#888', fontSize: 12, marginRight: 0 }
});
