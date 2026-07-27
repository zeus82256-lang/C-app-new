
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  ScrollView,
  StatusBar,
  ImageBackground
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

const CATEGORIES = [
    { id: 'characters', label: 'شخصيات' },
    { id: 'locations', label: 'أماكن' },
    { id: 'items', label: 'عناصر' },
    { id: 'ranks', label: 'رتب' },
    { id: 'other', label: 'أخرى' }
];

const GlassContainer = ({ children, style, onPress }) => (
    <TouchableOpacity 
        style={[styles.glassCard, style]} 
        onPress={onPress}
        activeOpacity={0.9}
        disabled={!onPress}
    >
        {children}
    </TouchableOpacity>
);

export default function GlossaryManagerScreen({ navigation, route }) {
  const initialNovelId = route.params?.novelId;
  const { showToast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [terms, setTerms] = useState([]);
  const [filteredTerms, setFilteredTerms] = useState([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('characters');

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [inputTerm, setInputTerm] = useState('');
  const [inputTrans, setInputTrans] = useState('');
  const [inputDesc, setInputDesc] = useState('');
  const [inputCat, setInputCat] = useState('characters');

  useEffect(() => { fetchTerms(); }, []);
  useEffect(() => { filterData(); }, [search, terms, activeTab]);

  const filterData = () => {
      let data = terms.filter(t => (t.category || 'other') === activeTab);
      if (search.trim()) {
          const lower = search.toLowerCase();
          data = data.filter(t => t.term.toLowerCase().includes(lower) || t.translation.includes(lower));
      }
      setFilteredTerms(data);
  };

  const fetchTerms = async () => {
      setLoading(true);
      try {
          const res = await api.get(`/api/translator/glossary/${initialNovelId}`);
          setTerms(res.data);
      } catch(e) { console.log(e); } 
      finally { setLoading(false); }
  };

  const handleSave = async () => {
      if (!inputTerm || !inputTrans) { showToast("البيانات ناقصة", "error"); return; }
      try {
          const res = await api.post('/api/translator/glossary', {
              novelId: initialNovelId,
              term: inputTerm,
              translation: inputTrans,
              category: inputCat || activeTab || 'other',
              description: inputDesc
          });
          if (editId) setTerms(prev => prev.map(t => t.term === inputTerm ? res.data : t));
          else setTerms(prev => [...prev, res.data]);
          setShowModal(false);
          resetForm();
          showToast("تم الحفظ", "success");
      } catch(e) { showToast("فشل الحفظ", "error"); }
  };

  const resetForm = () => {
      setInputTerm(''); setInputTrans(''); setInputDesc(''); setInputCat(activeTab); setEditId(null);
  };

  const openEdit = (item) => {
      setEditId(item._id);
      setInputTerm(item.term);
      setInputTrans(item.translation);
      setInputDesc(item.description || '');
      setInputCat(item.category || 'other');
      setShowModal(true);
  };

  const deleteTerm = (id) => {
      Alert.alert("حذف", "هل أنت متأكد؟", [
          { text: "إلغاء" },
          { text: "حذف", style: 'destructive', onPress: async () => {
              try {
                  await api.delete(`/api/translator/glossary/${id}`);
                  setTerms(prev => prev.filter(t => t._id !== id));
                  showToast("تم الحذف", "success");
              } catch(e) { showToast("فشل الحذف", "error"); }
          }}
      ]);
  };

  const renderItem = ({ item }) => (
      <GlassContainer onPress={() => openEdit(item)} style={styles.card}>
          <TouchableOpacity style={styles.deleteIcon} onPress={() => deleteTerm(item._id)}>
              <Ionicons name="trash-outline" size={18} color="#ff4444" />
          </TouchableOpacity>
          <View style={styles.cardContent}>
              <View style={styles.headerRow}>
                  <Text style={styles.enText}>{item.term}</Text>
                  <Ionicons name="arrow-forward" size={12} color="#666" style={{marginHorizontal: 8}} />
                  <Text style={styles.arText}>{item.translation}</Text>
              </View>
              {item.description ? <Text style={styles.descText}>{item.description}</Text> : null}
          </View>
      </GlassContainer>
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
            <Text style={styles.headerTitle}>المسرد</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
        </View>

        <View style={styles.tabsWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContainer}>
                {CATEGORIES.map(cat => (
                    <TouchableOpacity 
                        key={cat.id} 
                        style={[styles.tab, activeTab === cat.id && styles.activeTab]}
                        onPress={() => setActiveTab(cat.id)}
                    >
                        <Text style={[styles.tabText, activeTab === cat.id && styles.activeTabText]}>{cat.label}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>

        {/* Search Container styled as Glass */}
        <View style={{padding: 15}}>
            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color="#666" />
                <TextInput 
                    style={styles.searchInput}
                    placeholder="بحث..."
                    placeholderTextColor="#666"
                    value={search}
                    onChangeText={setSearch}
                    textAlign="right"
                />
            </View>
        </View>

        {loading ? <ActivityIndicator color="#fff" style={{marginTop:50}} /> : (
            <FlatList 
                data={filteredTerms}
                keyExtractor={item => item._id}
                renderItem={renderItem}
                contentContainerStyle={{padding: 15, paddingBottom: 80}}
                ListEmptyComponent={<Text style={{color: '#666', textAlign: 'center', marginTop: 50}}>لا توجد مصطلحات</Text>}
            />
        )}

        <TouchableOpacity style={styles.fab} onPress={() => { resetForm(); setShowModal(true); }}>
            <Ionicons name="add" size={32} color="#fff" />
        </TouchableOpacity>

        {/* Modal */}
        <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
            <View style={styles.modalBg}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>{editId ? "تعديل" : "إضافة"}</Text>
                    <ScrollView>
                        <Text style={styles.label}>القسم</Text>
                        <View style={styles.catSelector}>
                            {CATEGORIES.map(cat => (
                                <TouchableOpacity key={cat.id} style={[styles.catOption, inputCat === cat.id && styles.catOptionActive]} onPress={() => setInputCat(cat.id)}>
                                    <Text style={[styles.catText, inputCat === cat.id && {color: '#fff'}]}>{cat.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={styles.label}>English</Text>
                        <TextInput style={styles.input} value={inputTerm} onChangeText={setInputTerm} />
                        <Text style={styles.label}>عربي</Text>
                        <TextInput style={[styles.input, {textAlign:'right'}]} value={inputTrans} onChangeText={setInputTrans} />
                        <Text style={styles.label}>وصف (اختياري)</Text>
                        <TextInput style={[styles.input, {textAlign:'right'}]} value={inputDesc} onChangeText={setInputDesc} />
                    </ScrollView>
                    <View style={styles.modalBtns}>
                        <TouchableOpacity style={[styles.btn, {backgroundColor:'#333'}]} onPress={() => setShowModal(false)}><Text style={{color:'#fff'}}>إلغاء</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.btn, {backgroundColor:'#06b6d4'}]} onPress={handleSave}><Text style={{color:'#fff'}}>حفظ</Text></TouchableOpacity>
                    </View>
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
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 15, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  closeBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  
  // Glass Card
  glassCard: { 
      backgroundColor: 'rgba(20, 20, 20, 0.75)',
      borderRadius: 12, 
      overflow: 'hidden', 
      borderWidth: 1, 
      borderColor: 'rgba(255,255,255,0.1)' 
  },
  
  tabsWrapper: { height: 50 },
  tabsContainer: { paddingHorizontal: 10, alignItems: 'center', flexDirection: 'row-reverse' },
  tab: { paddingVertical: 6, paddingHorizontal: 15, borderRadius: 20, marginHorizontal: 5, backgroundColor: 'rgba(30,30,30,0.6)', borderWidth: 1, borderColor: '#333' },
  activeTab: { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: '#fff' },
  tabText: { color: '#888', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#fff' },

  searchContainer: { 
      flexDirection: 'row-reverse', padding: 10, alignItems: 'center',
      backgroundColor: 'rgba(30,30,30,0.6)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'
  },
  searchInput: { flex: 1, color: '#fff', marginRight: 10, fontSize: 14 },

  card: { flexDirection: 'row', marginBottom: 10, alignItems: 'center', padding: 12 },
  deleteIcon: { padding: 8, borderRightWidth: 1, borderRightColor: '#333', marginRight: 10 },
  cardContent: { flex: 1 },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', marginBottom: 4 },
  arText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  enText: { color: '#ccc', fontSize: 12 },
  descText: { color: '#666', fontSize: 10, textAlign: 'right' },

  fab: { position: 'absolute', bottom: 30, left: 30, width: 56, height: 56, borderRadius: 28, backgroundColor: '#06b6d4', justifyContent: 'center', alignItems: 'center', elevation: 5 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#161616', padding: 20, borderRadius: 16, maxHeight: '80%', borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  label: { color: '#888', marginBottom: 5, textAlign: 'right', fontSize: 12 },
  input: { backgroundColor: '#222', color: '#fff', padding: 10, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  catSelector: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  catOption: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#222', borderWidth: 1, borderColor: '#333' },
  catOptionActive: { backgroundColor: '#06b6d4', borderColor: '#06b6d4' },
  catText: { color: '#ccc', fontSize: 12 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' }
});
