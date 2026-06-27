
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  FlatList,
  ActivityIndicator,
  Modal,
  ScrollView,
  useWindowDimensions,
  TextInput,
  ImageBackground,
  StatusBar
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { useFocusEffect } from '@react-navigation/native';

// Static fallbacks in case API fails or loads slow
const INITIAL_STATUS_OPTIONS = [
    { id: 'all', name: 'جميع الحالات' },
    { id: 'ongoing', name: 'مستمرة' },
    { id: 'completed', name: 'مكتملة' },
    { id: 'stopped', name: 'متوقفة' }
];

const SORT_OPTIONS = [
    { id: 'chapters_desc', name: 'عدد الفصول - من أعلى لأقل' },
    { id: 'chapters_asc', name: 'عدد الفصول - من أقل لأعلى' },
    { id: 'title_asc', name: 'الاسم - أ إلى ي' },
    { id: 'title_desc', name: 'الاسم - ي إلى أ' },
];

export default function LibraryScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const numColumns = width > 600 ? 4 : 2; // Responsive grid

  const [loading, setLoading] = useState(true);
  const [novels, setNovels] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Dynamic Categories
  const [categoriesList, setCategoriesList] = useState([]);

  // Filters State
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedSort, setSelectedSort] = useState('chapters_desc');
  const [searchQuery, setSearchQuery] = useState(''); 

  // Modal State
  const [activeModal, setActiveModal] = useState(null); 

  useEffect(() => {
      fetchCategories();
  }, []);

  const fetchCategories = async () => {
      try {
          const res = await api.get('/api/categories');
          if (res.data) {
              setCategoriesList(res.data);
          }
      } catch (e) {
          console.log("Failed to fetch categories");
          // Fallback if needed
          setCategoriesList([{ id: 'all', name: 'الكل' }]);
      }
  };

  const fetchNovels = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/novels', {
          params: {
              page,
              limit: 20,
              category: selectedCategory,
              status: selectedStatus,
              sort: selectedSort,
              search: searchQuery 
          }
      });
      
      if (Array.isArray(response.data)) {
          setNovels(response.data);
          setTotalPages(1);
      } else {
          setNovels(response.data.novels || []);
          setTotalPages(response.data.totalPages || 1);
      }
    } catch (error) {
      console.error("Library Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 1. Main Effect: Triggered only by Filters & Pagination (Removed searchQuery)
  useEffect(() => {
      fetchNovels();
  }, [page, selectedCategory, selectedStatus, selectedSort]);

  // 🔥 2. Search Effect: Debounced (Waits for user to stop typing)
  useEffect(() => {
      const delayDebounceFn = setTimeout(() => {
          setPage(1); // Reset to page 1
          fetchNovels(); // Execute search
      }, 500); // 500ms delay

      return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
      setPage(1);
  }, [selectedCategory, selectedStatus, selectedSort]);

  const handleSearchChange = (text) => {
      setSearchQuery(text);
      // Removed setPage(1) here to avoid immediate trigger
  };

  // ✅ Updated Text Colors
  const getStatusTextColor = (status) => {
    switch (status) {
      case 'مكتملة': return '#27ae60'; // Dark Green
      case 'متوقفة': return '#c0392b'; // Dark Red
      default: return '#2980b9';       // Dark Blue (Ongoing)
    }
  };

  const renderFilterButton = (label, type, value, options) => {
      const selectedLabel = options.find(o => o.id === value)?.name || label;
      return (
        <TouchableOpacity 
            style={styles.filterButton} 
            onPress={() => setActiveModal(type)}
        >
            <Text style={styles.filterButtonText} numberOfLines={1}>{selectedLabel}</Text>
            <Ionicons name="chevron-down" size={14} color="#888" />
        </TouchableOpacity>
      );
  };

  const renderModal = (type, options, currentValue, onSelect) => (
      <Modal
        visible={activeModal === type}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setActiveModal(null)}
      >
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setActiveModal(null)}
          >
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>
                      {type === 'sort' ? 'الترتيب حسب' : type === 'category' ? 'التصنيفات' : 'الحالة'}
                  </Text>
                  <ScrollView style={{maxHeight: 300}}>
                      {options.map(item => (
                          <TouchableOpacity 
                            key={item.id} 
                            style={[
                                styles.modalOption, 
                                currentValue === item.id && styles.modalOptionActive
                            ]}
                            onPress={() => {
                                onSelect(item.id);
                                setActiveModal(null);
                            }}
                          >
                              <Text style={[
                                  styles.modalOptionText,
                                  currentValue === item.id && styles.modalOptionTextActive
                              ]}>{item.name}</Text>
                              {currentValue === item.id && (
                                  <Ionicons name="checkmark" size={18} color="#4a7cc7" />
                              )}
                          </TouchableOpacity>
                      ))}
                  </ScrollView>
              </View>
          </TouchableOpacity>
      </Modal>
  );

  const renderNovelItem = ({ item }) => {
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
          <View style={styles.novelStats}>
              <View style={styles.statBadge}>
                  <Ionicons name="book-outline" size={12} color="#ccc" />
                  <Text style={styles.statText}>{item.chaptersCount || 0} فصل</Text>
              </View>
              {item.category && (
                  <View style={styles.statBadge}>
                      <Text style={[styles.statText, {color: '#4a7cc7'}]}>{item.category}</Text>
                  </View>
              )}
          </View>
      </View>
    </TouchableOpacity>
    );
  };

  const renderPagination = () => {
      if (totalPages <= 1) return null;
      
      let pages = [];
      const maxButtons = 5;
      let start = Math.max(1, page - 2);
      let end = Math.min(totalPages, start + maxButtons - 1);
      
      if (end - start < maxButtons - 1) {
          start = Math.max(1, end - maxButtons + 1);
      }

      for (let i = start; i <= end; i++) {
          pages.push(i);
      }

      return (
          <View style={styles.paginationContainer}>
              {page > 1 && (
                  <TouchableOpacity style={styles.pageButton} onPress={() => setPage(p => p - 1)}>
                      <Ionicons name="chevron-back" size={18} color="#fff" />
                  </TouchableOpacity>
              )}
              
              {pages.map(p => (
                  <TouchableOpacity 
                    key={p} 
                    style={[styles.pageButton, page === p && styles.pageButtonActive]} 
                    onPress={() => setPage(p)}
                  >
                      <Text style={[styles.pageText, page === p && styles.pageTextActive]}>{p}</Text>
                  </TouchableOpacity>
              ))}

              {page < totalPages && (
                  <TouchableOpacity style={styles.pageButton} onPress={() => setPage(p => p + 1)}>
                      <Ionicons name="chevron-forward" size={18} color="#fff" />
                  </TouchableOpacity>
              )}
          </View>
      );
  };

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
        {/* --- FIXED HEADER & SEARCH SECTION --- */}
        <View style={styles.header}>
            <Text style={styles.headerTitle}>المكتبة</Text>
            <Text style={styles.headerSubtitle}>تصفح جميع الروايات</Text>
        </View>

        <View style={styles.searchBarContainer}>
            <Ionicons name="search" size={20} color="#666" style={{marginLeft: 10}} />
            <TextInput
                style={styles.searchInput}
                placeholder="ابحث داخل المكتبة..."
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={handleSearchChange}
            />
            {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => handleSearchChange('')}>
                    <Ionicons name="close-circle" size={18} color="#666" />
                </TouchableOpacity>
            )}
        </View>

        <View style={styles.filterContainer}>
            {renderFilterButton('الترتيب', 'sort', selectedSort, SORT_OPTIONS)}
            {renderFilterButton('التصنيف', 'category', selectedCategory, categoriesList)}
            {renderFilterButton('الحالة', 'status', selectedStatus, INITIAL_STATUS_OPTIONS)}
        </View>
        {/* ------------------------------------- */}

        {loading ? (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#fff" />
            </View>
        ) : (
            <FlatList 
                data={novels}
                keyExtractor={item => item._id}
                renderItem={renderNovelItem}
                numColumns={numColumns}
                key={numColumns} 
                contentContainerStyle={styles.listContent}
                columnWrapperStyle={[styles.columnWrapper, { flexDirection: 'row-reverse' }]}
                ListFooterComponent={renderPagination}
                ListEmptyComponent={() => (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="library-outline" size={50} color="#666" />
                        <Text style={styles.emptyText}>لا توجد روايات تطابق بحثك</Text>
                    </View>
                )}
            />
        )}

        {renderModal('sort', SORT_OPTIONS, selectedSort, setSelectedSort)}
        {renderModal('category', categoriesList, selectedCategory, setSelectedCategory)}
        {renderModal('status', INITIAL_STATUS_OPTIONS, selectedStatus, setSelectedStatus)}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  bgImage: { ...StyleSheet.absoluteFillObject },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'right',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'right',
    marginTop: 2,
  },
  
  // Glassy Search Bar
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
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    textAlign: 'right',
    fontSize: 14,
    marginRight: 10,
  },

  filterContainer: {
      flexDirection: 'row',
      padding: 10,
      gap: 10,
      justifyContent: 'flex-end',
      marginBottom: 5,
  },
  // Glassy Filter Button
  filterButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(30,30,30,0.6)',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
  },
  filterButtonText: {
      color: '#ccc',
      fontSize: 12,
      fontWeight: '600',
      flex: 1,
      textAlign: 'right',
      marginRight: 5,
  },
  
  listContent: {
      padding: 10,
      paddingBottom: 40,
  },
  columnWrapper: {
      justifyContent: 'flex-start', 
      gap: 10,
  },
  // Glass Novel Card
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
      paddingVertical: 3, // Smaller vertical padding
      borderRadius: 8,
      backgroundColor: 'rgba(0,0,0,0.6)', // Glassy Black
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)'
  },
  statusText: {
      fontSize: 10, // Slightly smaller text
      fontWeight: 'bold',
  },
  cardInfo: {
      padding: 10,
  },
  novelTitle: {
      color: '#fff',
      fontSize: 14,
      fontWeight: 'bold',
      textAlign: 'right',
      marginBottom: 8,
      height: 40,
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
      fontSize: 11,
  },

  paginationContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 20,
      marginBottom: 20,
      gap: 8,
  },
  pageButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.1)',
      justifyContent: 'center',
      alignItems: 'center',
  },
  pageButtonActive: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderWidth: 1,
      borderColor: '#4a7cc7',
  },
  pageText: {
      color: '#fff',
      fontSize: 14,
  },
  pageTextActive: {
      fontWeight: 'bold',
      color: '#4a7cc7'
  },

  loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
  },
  emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 50,
  },
  emptyText: {
      color: '#666',
      marginTop: 10,
  },

  modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.8)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
  },
  modalContent: {
      width: '85%',
      backgroundColor: '#161616',
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      overflow: 'hidden',
  },
  modalTitle: {
      color: '#fff',
      fontSize: 18,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 15,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.1)',
      paddingBottom: 10,
  },
  modalOption: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  modalOptionActive: {
      backgroundColor: 'rgba(255,255,255,0.05)',
  },
  modalOptionText: {
      color: '#ccc',
      fontSize: 15,
      textAlign: 'right',
  },
  modalOptionTextActive: {
      color: '#fff',
      fontWeight: 'bold',
  },
});
