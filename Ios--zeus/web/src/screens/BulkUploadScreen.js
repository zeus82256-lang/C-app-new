
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  FlatList,
  Modal,
  StatusBar,
  ImageBackground
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { AuthContext } from '../context/AuthContext';

// Glass Component
const GlassContainer = ({ children, style }) => (
    <View style={[styles.glassContainer, style]}>
        {children}
    </View>
);

export default function BulkUploadScreen({ navigation }) {
  const { userInfo } = useContext(AuthContext);
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [fetchingNovels, setFetchingNovels] = useState(true);
  
  const [novelsList, setNovelsList] = useState([]);
  const [selectedNovel, setSelectedNovel] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showNovelPicker, setShowNovelPicker] = useState(false);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    fetchNovels();
  }, []);

  const fetchNovels = async () => {
    try {
        const res = await api.get('/api/novels?limit=100');
        let list = res.data.novels || [];
        if (userInfo && userInfo.role !== 'admin') {
            list = list.filter(n => 
                (n.authorEmail && n.authorEmail === userInfo.email) ||
                (n.author && n.author.toLowerCase() === userInfo.name.toLowerCase())
            );
        }
        setNovelsList(list);
    } catch(e) { 
        showToast("فشل جلب قائمة الروايات", "error");
    } finally {
        setFetchingNovels(false);
    }
  };

  const pickZipFile = async () => {
    try {
        const result = await DocumentPicker.getDocumentAsync({
            type: ['application/zip', 'application/x-zip-compressed'],
            copyToCacheDirectory: true
        });
        if (result.canceled) return;
        const asset = result.assets ? result.assets[0] : result;
        if (asset) setSelectedFile(asset);
    } catch (err) {
        showToast("فشل اختيار الملف", "error");
    }
  };

  const handleUpload = async () => {
      if (!selectedNovel) { showToast("يرجى اختيار الرواية أولاً", "error"); return; }
      if (!selectedFile) { showToast("يرجى اختيار ملف ZIP", "error"); return; }

      setLoading(true);
      setLogs([]);

      try {
          const formData = new FormData();
          formData.append('novelId', selectedNovel._id);
          formData.append('zip', {
              uri: selectedFile.uri,
              name: selectedFile.name || 'chapters.zip',
              type: selectedFile.mimeType || 'application/zip'
          });

          const response = await api.post('/api/admin/chapters/bulk-upload', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
          });

          const { successCount, errors } = response.data;
          
          if (successCount > 0) {
              showToast(`تم نشر ${successCount} فصل بنجاح!`, "success");
              setLogs([`✅ تم إضافة ${successCount} فصل بنجاح.`, ...errors]);
          } else {
              showToast("لم يتم إضافة أي فصل", "error");
              setLogs(["❌ لم يتم العثور على فصول صالحة.", ...errors]);
          }

      } catch (error) {
          const msg = error.response?.data?.message || "حدث خطأ أثناء الرفع";
          showToast(msg, "error");
          setLogs([`❌ خطأ فادح: ${msg}`]);
      } finally { setLoading(false); }
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
        <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                <Ionicons name="arrow-forward" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>النشر المتعدد</Text>
            <View style={{width: 40}} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
            <GlassContainer style={styles.descriptionBox}>
                <Text style={styles.description}>
                    قم برفع ملف ZIP يحتوي على ملفات نصية (.txt). سيتم استخراج رقم الفصل من اسم الملف (مثال: 10.txt) والعنوان من السطر الأول داخل الملف.
                </Text>
            </GlassContainer>

            <View style={styles.section}>
                <Text style={styles.label}>1. اختر الرواية</Text>
                <GlassContainer>
                    <TouchableOpacity 
                        style={styles.selectorBtn} 
                        onPress={() => setShowNovelPicker(true)}
                        disabled={fetchingNovels}
                    >
                        {fetchingNovels ? (
                            <ActivityIndicator color="#666" />
                        ) : (
                            <>
                                <Ionicons name="chevron-down" size={20} color="#666" />
                                <Text style={[styles.selectorText, selectedNovel && {color: '#fff', fontWeight: 'bold'}]}>
                                    {selectedNovel ? selectedNovel.title : "اضغط للاختيار من القائمة"}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                </GlassContainer>
            </View>

            <View style={styles.section}>
                <Text style={styles.label}>2. ملف الفصول (ZIP)</Text>
                <GlassContainer>
                    <TouchableOpacity style={styles.filePickerBtn} onPress={pickZipFile}>
                        {selectedFile ? (
                            <View style={styles.fileInfo}>
                                <Ionicons name="document-text" size={32} color="#fff" />
                                <Text style={styles.fileName}>{selectedFile.name}</Text>
                                <Text style={styles.fileSize}>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</Text>
                            </View>
                        ) : (
                            <View style={styles.filePlaceholder}>
                                <Ionicons name="cloud-upload-outline" size={40} color="#666" />
                                <Text style={styles.filePlaceholderText}>اضغط لاختيار ملف .zip</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </GlassContainer>
            </View>

            <TouchableOpacity 
                style={[styles.uploadBtn, (!selectedNovel || !selectedFile || loading) && styles.disabledBtn]} 
                onPress={handleUpload}
                disabled={!selectedNovel || !selectedFile || loading}
            >
                {loading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.uploadBtnText}>بدء المعالجة والنشر</Text>
                )}
            </TouchableOpacity>

            {logs.length > 0 && (
                <GlassContainer style={styles.logsContainer}>
                    <Text style={styles.logsTitle}>سجل العملية:</Text>
                    {logs.map((log, index) => (
                        <Text key={index} style={[styles.logText, log.includes('❌') && {color: '#ff6b6b'}]}>
                            {log}
                        </Text>
                    ))}
                </GlassContainer>
            )}

        </ScrollView>

        <Modal visible={showNovelPicker} transparent animationType="slide">
            <View style={styles.modalBg}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>اختر رواية للنشر</Text>
                    <FlatList
                        data={novelsList}
                        keyExtractor={item => item._id}
                        renderItem={({item}) => (
                            <TouchableOpacity style={styles.modalItem} onPress={() => { setSelectedNovel(item); setShowNovelPicker(false); }}>
                                <Text style={styles.modalItemText}>{item.title}</Text>
                                {selectedNovel?._id === item._id && <Ionicons name="checkmark" size={18} color="#fff" />}
                            </TouchableOpacity>
                        )}
                    />
                    <TouchableOpacity style={styles.closeBtn} onPress={() => setShowNovelPicker(false)}>
                        <Text style={{color: '#fff'}}>إغلاق</Text>
                    </TouchableOpacity>
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
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  iconBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  
  content: { padding: 20 },
  
  // Glass Container
  glassContainer: { 
      backgroundColor: 'rgba(20, 20, 20, 0.75)',
      borderRadius: 16, 
      overflow: 'hidden', 
      padding: 1, 
      borderColor: 'rgba(255,255,255,0.1)', 
      borderWidth: 1, 
      position: 'relative' 
  },
  
  descriptionBox: { marginBottom: 25 },
  description: { color: '#ccc', textAlign: 'right', lineHeight: 22, padding: 15 },
  
  section: { marginBottom: 25 },
  label: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 10, textAlign: 'right' },
  
  selectorBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15 },
  selectorText: { color: '#ccc', fontSize: 14 },

  filePickerBtn: { height: 150, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  filePlaceholder: { alignItems: 'center', gap: 10 },
  filePlaceholderText: { color: '#666' },
  fileInfo: { alignItems: 'center', gap: 5 },
  fileName: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  fileSize: { color: '#888', fontSize: 12 },

  // Glassy Button
  uploadBtn: { 
      height: 55, borderRadius: 16, overflow: 'hidden', 
      justifyContent: 'center', alignItems: 'center', marginTop: 10,
      backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)'
  },
  disabledBtn: { opacity: 0.5, backgroundColor: 'rgba(50,50,50,0.5)', borderColor: '#333' },
  uploadBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  logsContainer: { marginTop: 30, padding: 15 },
  logsTitle: { color: '#fff', fontWeight: 'bold', marginBottom: 10, textAlign: 'right' },
  logText: { color: '#4ade80', fontSize: 12, marginBottom: 4, textAlign: 'right' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#161616', borderRadius: 16, padding: 20, maxHeight: '60%', borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  modalItem: { flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#222' },
  modalItemText: { color: '#ccc', fontSize: 16 },
  closeBtn: { marginTop: 20, alignItems: 'center', padding: 15, backgroundColor: '#333', borderRadius: 12 },
});
