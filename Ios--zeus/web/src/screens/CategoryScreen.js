
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  TextInput,
  ImageBackground
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';

const { width } = Dimensions.get('window');
const numColumns = width > 600 ? 4 : 2;

// Helper for source name (Added to card)
const getSourceName = (url) => {
    if (!url) return null;
    if (url.includes('rewayat.club')) return 'نادي الروايات';
    if (url.includes('ar-no.com') || url.includes('ar-novel')) return 'Ar-Novel';
    if (url.includes('novelfire')) return 'Novel Fire';
    if (url.includes('freewebnovel')) return 'Free WebNovel';
    if (url.includes('wuxiabox')) return 'WuxiaBox';
    return 'مصدر خارجي';
};

export default function CategoryScreen({ route, navigation }) {
  const { title, filter, category } = route.params; // filter: 'trending', 'latest_updates' etc.
  
  const [novels, setNovels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Use display title or fallback to category name
  const displayTitle = title || category || 'القائمة';

  useEffect(() => {
      fetchNovels(true);
  }, [searchQuery]);

  const fetchNovels = async (reset = false) => {
      if (reset) {
          setLoading(true);
          setPage(1);
      } else {
          if (!hasMore || loadingMore) return;
          setLoadingMore(true);
      }

      try {
          const currentPage = reset ? 1 : page;
          const params = {
              page: currentPage,
              limit: 20,
              search: searchQuery
          };

          // Apply specific filters
          if (category) params.category = category;
          if (filter) {
              params.filter = filter;
              // Add time range if trending
              if (filter === 'trending') params.timeRange = 'week';
          }

          const res = await api.get('/api/novels', { params });
          
          let newNovels = [];
          if (Array.isArray(res.data)) {
              newNovels = res.data; // Fallback for simple endpoints
          } else {
              newNovels = res.data.novels || [];
          }

          if (reset) {
              setNovels(newNovels);
          } else {
              setNovels(prev => [...prev, ...newNovels]);
          }

          setHasMore(newNovels.length === 20); // Assuming limit is 20
          if (!reset) setPage(p => p + 1);
          else setPage(2);

      } catch (e) {
          console.error("Fetch Category Error:", e);
      } finally {
          setLoading(false);
          setLoadingMore(false);
      }
  };

  // 🔥 Updated Text Colors
  const getStatusTextColor = (status) => {
    switch (status) {
      case 'مكتملة': return '#27ae60'; // Dark Green
      case 'متوقفة': return '#c0392b'; // Dark Red
      default: return '#2980b9';       // Dark Blue (Ongoing)
    }
  };

  const renderNovelItem = ({ item }) => {
    const sourceName = getSourceName(item.sourceUrl);
    const statusText = item.status || 'مستمرة';
    const textColor = getStatusTextColor(statusText);
    
    return (
      <TouchableOpacity
        style={styles.novelCard}
        onPress={() => navigation.navigate('NovelDetail', { novel: item })}
        activeOpacity={0.8}
      >
        <View style={styles.imageContainer}>
            <Image 
              source={item.cover} 
              style={styles.novelImage}
              contentFit="cover"
              transition={300}
              cachePolicy="memory-disk"
            />
            {/* 🔥 Updated Status Badge Style */}
            <View style={styles.statusBadge}>
                <Text style={[styles.statusText, { color: textColor }]}>{statusText}</Text>
            </View>
        </View>
        
        <View style={styles.cardInfo}>
            <Text style={styles.novelTitle} numberOfLines={2}>{item.title}</Text>
            
            {sourceName && (
                <View style={styles.sourceBadge}>
                    <Text style={styles.sourceText}>{sourceName}</Text>
                </View>
            )}

            <View style={styles.novelStats}>
                <View style={styles.statBadge}>
                    <Ionicons name="book-outline" size={12} color="#ccc" />
                    <Text style={styles.statText}>{item.chaptersCount || 0} فصل</Text>
                </View>
                <View style={styles.statBadge}>
                    <Ionicons name="eye-outline" size={12} color="#ccc" />
                    <Text style={styles.statText}>{item.views || 0}</Text>
                </View>
            </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ImageBackground 
        source={require('../../assets/adaptive-icon.png')} 
        style={styles.bgImage}
        blurRadius={20}
      >
          <LinearGradient colors={['rgba(0,0,0,0.6)', '#000000']} style={StyleSheet.absoluteFill} />
      </ImageBackground>

      <SafeAreaView style={{flex: 1}} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                <Ionicons name="arrow-forward" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{displayTitle}</Text>
            <View style={{width: 40}} /> 
        </View>

        {/* Search Bar */}
        <View style={styles.searchBarContainer}>
            <Ionicons name="search" size={20} color="#666" style={{marginLeft: 10}} />
            <TextInput
                style={styles.searchInput}
                placeholder="ابحث في هذه القائمة..."
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color="#666" />
                </TouchableOpacity>
            )}
        </View>

        {loading ? (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4a7cc7" />
            </View>
        ) : (
            <FlatList
                data={novels}
                renderItem={renderNovelItem}
                keyExtractor={item => item._id}
                numColumns={numColumns}
                key={numColumns}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                columnWrapperStyle={[styles.columnWrapper, { flexDirection: 'row-reverse' }]}
                onEndReached={() => fetchNovels(false)}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                    loadingMore ? <ActivityIndicator color="#fff" style={{marginVertical: 20}} /> : <View style={{height: 20}} />
                }
                ListEmptyComponent={() => (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="library-outline" size={50} color="#666" />
                        <Text style={styles.emptyText}>لا توجد نتائج</Text>
                    </View>
                )}
            />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },

  searchBarContainer: {
    flexDirection: 'row-reverse', 
    alignItems: 'center',
    backgroundColor: 'rgba(30,30,30,0.6)',
    marginHorizontal: 15,
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 50,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 10,
    marginBottom: 5,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    textAlign: 'right',
    fontSize: 14,
    marginRight: 10,
  },

  listContent: {
    padding: 10,
    paddingBottom: 40,
  },
  columnWrapper: {
      justifyContent: 'flex-start', 
      gap: 10,
  },
  
  // Novel Card (Library Style)
  novelCard: {
      flex: 1,
      backgroundColor: 'rgba(20, 20, 20, 0.75)',
      borderRadius: 16,
      marginBottom: 10,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      maxWidth: '48%', 
  },
  imageContainer: {
      height: 200,
      width: '100%',
      position: 'relative',
  },
  novelImage: {
      width: '100%',
      height: '100%',
  },
  // 🔥 Modified Status Badge Style
  statusBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      paddingHorizontal: 8,
      paddingVertical: 3, 
      borderRadius: 8,
      backgroundColor: 'rgba(0,0,0,0.6)', // Glassy Black
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)'
  },
  statusText: {
      fontSize: 10,
      fontWeight: 'bold',
  },
  cardInfo: {
      padding: 10,
  },
  novelTitle: {
      color: '#fff',
      fontSize: 13,
      fontWeight: 'bold',
      textAlign: 'right',
      marginBottom: 6,
      height: 36,
  },
  sourceBadge: {
      backgroundColor: 'rgba(255,255,255,0.1)',
      alignSelf: 'flex-end',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      marginBottom: 6
  },
  sourceText: {
      color: '#ccc',
      fontSize: 9,
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
      color: '#ccc',
      fontSize: 10,
  },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 50 },
  emptyText: { color: '#666', marginTop: 10 },
});
