
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  StatusBar,
  ImageBackground
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import CustomAlert from '../components/CustomAlert';

const GlassContainer = ({ children, style }) => (
    <View style={[styles.glassContainer, style]}>
        {children}
    </View>
);

export default function TitleGeneratorDetailScreen({ navigation, route }) {
  const { job: initialJob } = route.params;
  const { showToast } = useToast();
  const [job, setJob] = useState(initialJob);
  const [logs, setLogs] = useState([]);
  
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({});
  
  useEffect(() => {
      const fetchDetails = async () => {
          try {
              const res = await api.get(`/api/title-gen/jobs/${initialJob.id}`);
              setJob(res.data);
              setLogs(res.data.logs.reverse() || []); 
          } catch(e) { console.log(e); }
      };
      fetchDetails();
      const interval = setInterval(fetchDetails, 3000); 
      return () => clearInterval(interval);
  }, []);

  const requestResume = () => {
      setAlertConfig({
          title: "استئناف المهمة",
          message: `استئناف توليد العناوين؟`,
          type: 'info',
          confirmText: "ابدأ",
          onConfirm: performResume
      });
      setAlertVisible(true);
  };

  const performResume = async () => {
      setAlertVisible(false);
      try {
          await api.post('/api/title-gen/start', {
              jobId: job._id || job.id
          });
          showToast("تم استئناف المهمة", "success");
      } catch (e) { showToast("فشل الاستئناف", "error"); }
  };

  const requestPause = () => {
      setAlertConfig({
          title: "إيقاف مؤقت",
          message: "هل تريد إيقاف المهمة مؤقتاً؟ (ستتوقف بعد الفصل الحالي)",
          type: 'warning',
          confirmText: "إيقاف",
          onConfirm: performPause
      });
      setAlertVisible(true);
  };

  const performPause = async () => {
      setAlertVisible(false);
      try {
          await api.post(`/api/title-gen/jobs/${job._id || job.id}/pause`);
          showToast("تم إرسال طلب الإيقاف", "info");
      } catch (e) { showToast("فشل الإيقاف", "error"); }
  };

  const requestDelete = () => {
      setAlertConfig({
          title: "حذف المهمة",
          message: "هل أنت متأكد من حذف هذه المهمة نهائياً؟",
          type: 'danger',
          confirmText: "حذف",
          onConfirm: performDelete
      });
      setAlertVisible(true);
  };

  const performDelete = async () => {
      setAlertVisible(false);
      try {
          await api.delete(`/api/title-gen/jobs/${job._id || job.id}`);
          showToast("تم حذف المهمة", "success");
          navigation.goBack();
      } catch (e) { showToast("فشل الحذف", "error"); }
  };

  const renderLog = ({ item }) => {
      let color = '#ccc';
      if (item.type === 'error') color = '#ff4444';
      if (item.type === 'success') color = '#4ade80';
      if (item.type === 'warning') color = '#f59e0b';
      const time = new Date(item.timestamp).toLocaleTimeString();
      return (
          <View style={styles.logItem}>
              <Text style={styles.logTime}>{time}</Text>
              <Text style={[styles.logText, {color}]}>{item.message}</Text>
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
        <CustomAlert 
            visible={alertVisible}
            title={alertConfig.title}
            message={alertConfig.message}
            type={alertConfig.type}
            confirmText={alertConfig.confirmText}
            onCancel={() => setAlertVisible(false)}
            onConfirm={alertConfig.onConfirm}
        />

        <View style={styles.header}>
            <Text style={styles.headerTitle}>متابعة المهمة</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
            
            <GlassContainer style={styles.statusCard}>
                <View style={{flexDirection:'row-reverse', justifyContent:'space-between', alignItems:'center'}}>
                    <Text style={styles.novelTitle}>{job.novelTitle}</Text>
                    <View style={[styles.statusBadge, {backgroundColor: job.status === 'active' ? '#fff' : job.status === 'paused' ? '#f59e0b' : '#333'}]}>
                        {job.status === 'active' && <ActivityIndicator size="small" color="#000" style={{marginRight:5}} />}
                        <Text style={{color: job.status === 'active' ? '#000' : '#fff', fontSize:12, fontWeight:'bold'}}>
                            {job.status === 'active' ? 'نشط' : job.status === 'paused' ? 'متوقف مؤقتاً' : job.status === 'completed' ? 'مكتمل' : 'فشل/توقف'}
                        </Text>
                    </View>
                </View>
                <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, {width: `${Math.min(100, (job.processedCount / (job.totalToProcess || 1)) * 100)}%`}]} />
                </View>
                <Text style={styles.progressText}>
                    تم معالجة {job.processedCount} / {job.totalToProcess}
                </Text>
            </GlassContainer>

            <Text style={styles.sectionTitle}>إجراءات</Text>
            <View style={styles.actionsRow}>
                {job.status === 'active' ? (
                    <TouchableOpacity style={[styles.actionBtn, {borderColor: '#f59e0b'}]} onPress={requestPause}>
                        <Ionicons name="pause" size={24} color="#f59e0b" />
                        <Text style={[styles.actionBtnText, {color: '#f59e0b'}]}>إيقاف مؤقت</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity style={[styles.actionBtn, {borderColor: '#fff'}]} onPress={requestResume}>
                        <Ionicons name="play" size={24} color="#fff" />
                        <Text style={[styles.actionBtnText, {color: '#fff'}]}>استئناف</Text>
                    </TouchableOpacity>
                )}
                
                <TouchableOpacity style={[styles.actionBtn, {borderColor: '#ff4444'}]} onPress={requestDelete}>
                    <Ionicons name="trash-outline" size={24} color="#ff4444" />
                    <Text style={[styles.actionBtnText, {color: '#ff4444'}]}>حذف المهمة</Text>
                </TouchableOpacity>
            </View>

            <GlassContainer style={styles.consoleContainer}>
                <Text style={styles.consoleTitle}>Live Terminal</Text>
                <FlatList 
                    data={logs}
                    keyExtractor={item => item._id || Math.random().toString()}
                    renderItem={renderLog}
                    scrollEnabled={false}
                />
            </GlassContainer>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  iconBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  
  content: { padding: 20 },
  
  // Glass Container
  glassContainer: { 
      backgroundColor: 'rgba(20, 20, 20, 0.75)',
      borderRadius: 16, 
      overflow: 'hidden', 
      padding: 15, 
      borderWidth: 1, 
      borderColor: 'rgba(255,255,255,0.1)' 
  },
  
  statusCard: { marginBottom: 20 },
  novelTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', maxWidth: '70%', textAlign:'right' },
  statusBadge: { flexDirection:'row', alignItems:'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  progressContainer: { width: '100%', height: 6, backgroundColor: '#333', borderRadius: 3, marginTop: 15, marginBottom: 5 },
  progressBar: { height: '100%', backgroundColor: '#10b981', borderRadius: 3 },
  progressText: { color: '#888', fontSize: 12, textAlign: 'right' },

  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 15, textAlign: 'right' },
  actionsRow: { flexDirection: 'row-reverse', gap: 10, marginBottom: 10 },
  
  // Glassy Button Style
  actionBtn: { 
      flex: 1, padding: 15, borderRadius: 16, 
      alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1
  },
  actionBtnText: { fontWeight: 'bold', fontSize: 14 },

  consoleContainer: { minHeight: 300, backgroundColor: 'rgba(0,0,0,0.5)', marginTop: 20 },
  consoleTitle: { color: '#888', fontSize: 12, marginBottom: 10, textAlign: 'right', borderBottomWidth: 1, borderColor: '#333', paddingBottom: 5 },
  logItem: { flexDirection: 'row-reverse', marginBottom: 8 },
  logTime: { color: '#555', fontSize: 10, width: 50, textAlign: 'left', marginRight: 10 },
  logText: { flex: 1, fontSize: 11, fontFamily: 'monospace', textAlign: 'right' },
});
