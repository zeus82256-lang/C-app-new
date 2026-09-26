
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  ImageBackground,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import { useToast } from '../context/ToastContext';
import CustomAlert from '../components/CustomAlert';

const GlassContainer = ({ children, style }) => (
    <View style={[styles.glassContainer, style]}>
        {children}
    </View>
);

const STATUS_LABELS = {
    active: 'نشطة',
    completed: 'مكتملة',
    failed: 'فشلت'
};

const STEP_LABELS = ['العنوان', 'الوصف', 'التصنيفات'];

export default function MetadataTranslationHubScreen({ navigation }) {
  const { showToast } = useToast();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Detail sheet state
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailJob, setDetailJob] = useState(null);
  const [detailLogs, setDetailLogs] = useState([]);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({});

  const fetchJobs = async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
          const res = await api.get('/api/translator/metadata-jobs');
          setJobs(res.data);
      } catch (e) {
          console.log(e);
      } finally {
          setLoading(false);
          setRefreshing(false);
      }
  };

  useFocusEffect(
      useCallback(() => {
          fetchJobs(true);
          const interval = setInterval(() => fetchJobs(true), 5000);
          return () => clearInterval(interval);
      }, [])
  );

  const openDetail = (job) => {
      setDetailJob(job);
      setDetailLogs(job.logs ? [...job.logs].reverse() : []);
      setDetailVisible(true);
  };

  // Poll lifecycle tied to the modal visibility
  useEffect(() => {
      if (!detailVisible || !detailJob?._id) return;
      const jobId = detailJob._id;
      const interval = setInterval(async () => {
          try {
              const res = await api.get(`/api/translator/metadata-jobs/${jobId}`);
              if (!res.data) return;
              setDetailJob(res.data);
              setDetailLogs(res.data.logs ? [...res.data.logs].reverse() : []);
          } catch (e) {}
      }, 3000);
      return () => clearInterval(interval);
  }, [detailVisible, detailJob?._id]);

  const requestDelete = (job) => {
      setDetailVisible(false);
      setAlertConfig({
          title: "حذف المهمة",
          message: `حذف مهمة تعريب "${job.novelTitle}" نهائياً؟ (لا يؤثر على بيانات الرواية نفسها)`,
          type: 'danger',
          confirmText: 'حذف',
          onConfirm: () => performDelete(job)
      });
      setAlertVisible(true);
  };

  const performDelete = async (job) => {
      setAlertVisible(false);
      try {
          await api.delete(`/api/translator/metadata-jobs/${job._id}`);
          showToast("تم حذف المهمة", "success");
          fetchJobs(true);
      } catch (e) {
          showToast("فشل الحذف", "error");
      }
  };

  const renderLog = (item, index) => {
      let color = '#ccc';
      if (item.type === 'error') color = '#ff4444';
      if (item.type === 'success') color = '#4ade80';
      if (item.type === 'warning') color = '#f59e0b';
      const time = new Date(item.timestamp).toLocaleTimeString();
      return (
          <View style={styles.logItem} key={item._id || index}>
              <Text style={styles.logTime}>{time}</Text>
              <Text style={[styles.logText, { color }]}>{item.message}</Text>
          </View>
      );
  };

  const renderJobItem = ({ item }) => {
      const pct = item.totalSteps > 0 ? Math.min(100, (item.processedCount / item.totalSteps) * 100) : 0;
      return (
          <GlassContainer style={styles.jobCard}>
              <TouchableOpacity style={styles.jobContent} onPress={() => openDetail(item)} activeOpacity={0.8}>
                  <ImageBackground source={{ uri: item.cover }} style={styles.jobCover} imageStyle={{ borderRadius: 8 }}>
                      <View style={styles.coverOverlay}>
                          {item.status === 'active' && <ActivityIndicator size="small" color="#fff" />}
                          {item.status === 'completed' && <Ionicons name="checkmark-circle" size={26} color="#4ade80" />}
                          {item.status === 'failed' && <Ionicons name="close-circle" size={26} color="#ff4444" />}
                      </View>
                  </ImageBackground>
                  <View style={styles.jobInfo}>
                      <Text style={styles.jobTitle} numberOfLines={1}>{item.novelTitle}</Text>
                      <View style={styles.statusRow}>
                          <View style={[styles.statusDot, { backgroundColor: item.status === 'active' ? '#fff' : item.status === 'completed' ? '#4ade80' : '#ff4444' }]} />
                          <Text style={styles.statusText}>{STATUS_LABELS[item.status] || item.status}</Text>
                          <Text style={styles.stepText}>
                              {STEP_LABELS[Math.min(item.processedCount, 2)] || '—'} • {item.processedCount}/{item.totalSteps}
                          </Text>
                      </View>
                      <View style={styles.progressContainer}>
                          <View style={[styles.progressBar, { width: `${pct}%` }]} />
                      </View>
                  </View>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => requestDelete(item)}>
                      <Ionicons name="trash-outline" size={18} color="#ff4444" />
                  </TouchableOpacity>
              </TouchableOpacity>
          </GlassContainer>
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

      <SafeAreaView style={{ flex: 1 }}>
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
            <TouchableOpacity
                onPress={() => navigation.navigate('NovelMetadataTranslation')}
                style={styles.iconBtn}
            >
                <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
            <View>
                <Text style={styles.headerTitle}>مهام تعريب البيانات</Text>
                <Text style={styles.headerSub}>عنوان • وصف • تصنيفات</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                <Ionicons name="arrow-forward" size={24} color="#fff" />
            </TouchableOpacity>
        </View>

        {loading ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
        ) : (
            <FlatList
                data={jobs}
                keyExtractor={item => item._id}
                renderItem={renderJobItem}
                contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                refreshing={refreshing}
                onRefresh={fetchJobs}
                ListEmptyComponent={
                    <View style={{ alignItems: 'center', marginTop: 60 }}>
                        <Ionicons name="layers-outline" size={52} color="#333" />
                        <Text style={{ color: '#666', marginTop: 12, textAlign: 'center' }}>
                            لا توجد مهام تعريب بعد.
                        </Text>
                        <TouchableOpacity
                            style={styles.emptyStartBtn}
                            onPress={() => navigation.navigate('NovelMetadataTranslation')}
                        >
                            <Ionicons name="language" size={18} color="#000" />
                            <Text style={{ color: '#000', fontWeight: 'bold' }}>ابدأ مهمة جديدة</Text>
                        </TouchableOpacity>
                    </View>
                }
            />
        )}

        {/* Detail Sheet */}
        <Modal visible={detailVisible} transparent animationType="slide" onRequestClose={() => setDetailVisible(false)}>
            <View style={styles.modalOverlay}>
                <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setDetailVisible(false)} />
                <View style={styles.detailSheet}>
                    <View style={styles.detailHandle} />
                    <View style={styles.detailHeader}>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                            <View style={[styles.statusDot, { backgroundColor: detailJob?.status === 'active' ? '#fff' : detailJob?.status === 'completed' ? '#4ade80' : '#ff4444' }]} />
                            <Text style={styles.detailTitle} numberOfLines={1}>{detailJob?.novelTitle}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setDetailVisible(false)}>
                            <Ionicons name="close-circle" size={28} color="#555" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.stepsRow}>
                        {STEP_LABELS.map((label, i) => {
                            const done = (detailJob?.processedCount || 0) > i;
                            const isCurrent = (detailJob?.processedCount || 0) === i && detailJob?.status === 'active';
                            return (
                                <View key={label} style={[styles.stepChip, done && styles.stepChipDone, isCurrent && styles.stepChipCurrent]}>
                                    {isCurrent && <ActivityIndicator size="small" color="#fff" style={{ marginHorizontal: 4 }} />}
                                    {done && <Ionicons name="checkmark" size={14} color="#000" />}
                                    <Text style={[styles.stepChipText, (done || isCurrent) && { color: done ? '#000' : '#fff' }]}>{label}</Text>
                                </View>
                            );
                        })}
                    </View>

                    <View style={styles.consoleContainer}>
                        <Text style={styles.consoleTitle}>Live Terminal</Text>
                        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
                            {detailLogs.length === 0 ? (
                                <Text style={{ color: '#555', fontSize: 11, textAlign: 'center', marginTop: 20 }}>لا توجد سجلات بعد</Text>
                            ) : (
                                detailLogs.map(renderLog)
                            )}
                        </ScrollView>
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
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'right' },
  headerSub: { color: '#ccc', fontSize: 12, textAlign: 'right' },
  iconBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },

  glassContainer: {
      backgroundColor: 'rgba(20, 20, 20, 0.75)',
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)'
  },

  jobCard: { marginBottom: 12 },
  jobContent: { flexDirection: 'row-reverse', padding: 12, alignItems: 'center', gap: 12 },
  jobCover: { width: 52, height: 72, borderRadius: 8, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' },
  coverOverlay: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  jobInfo: { flex: 1 },
  jobTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 6, textAlign: 'right' },
  statusRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#bbb', fontSize: 12 },
  stepText: { color: '#666', fontSize: 11 },
  progressContainer: { width: '100%', height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2 },
  progressBar: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
  deleteBtn: { padding: 8 },

  emptyStartBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: '#fff', paddingHorizontal: 18, paddingVertical: 10,
      borderRadius: 12, marginTop: 16
  },

  // Detail sheet
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  detailSheet: {
      backgroundColor: '#0d0d0d',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: '#222',
      height: '70%',
      paddingBottom: 20
  },
  detailHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#333', alignSelf: 'center', marginTop: 10 },
  detailHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  detailTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', flex: 1, textAlign: 'right' },
  stepsRow: { flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  stepChip: {
      flexDirection: 'row-reverse', alignItems: 'center',
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
      backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333'
  },
  stepChipDone: { backgroundColor: '#4ade80', borderColor: '#4ade80' },
  stepChipCurrent: { borderColor: '#fff' },
  stepChipText: { color: '#888', fontSize: 12, fontWeight: 'bold' },

  consoleContainer: {
      flex: 1, margin: 16, marginTop: 4,
      backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
      borderWidth: 1, borderColor: '#222'
  },
  consoleTitle: { color: '#888', fontSize: 12, padding: 10, textAlign: 'right', borderBottomWidth: 1, borderColor: '#222' },
  logItem: { flexDirection: 'row-reverse', marginBottom: 8 },
  logTime: { color: '#555', fontSize: 10, width: 54, textAlign: 'left', marginRight: 10 },
  logText: { flex: 1, fontSize: 11, textAlign: 'right' },
});
