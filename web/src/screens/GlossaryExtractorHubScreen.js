import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  RefreshControl,
  StatusBar,
  ImageBackground
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../services/api';
import { useFocusEffect } from '@react-navigation/native';

// 📚 المستخرج الذكي — استخراج مصطلحات الرواية كاملة قبل الترجمة
// نفس واجهة المراجع الذكي بالضبط سوى أنه مستخرج مصطلحات

const GlassCard = ({ children, style, onPress }) => (
    <TouchableOpacity
        style={[styles.glassCard, style]}
        onPress={onPress}
        activeOpacity={0.9}
        disabled={!onPress}
    >
        {children}
    </TouchableOpacity>
);

export default function GlossaryExtractorHubScreen({ navigation }) {
  const [jobs, setJobs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = async () => {
      try {
          const res = await api.get('/api/glossary-ai/jobs');
          setJobs(res.data);
      } catch (e) { console.log(e); }
  };

  useFocusEffect(
      useCallback(() => {
          fetchJobs();
          const interval = setInterval(fetchJobs, 5000);
          return () => clearInterval(interval);
      }, [])
  );

  const onRefresh = async () => {
      setRefreshing(true);
      await fetchJobs();
      setRefreshing(false);
  };

  const statusLabel = (status) => status === 'active' ? 'جاري الاستخراج' : status === 'completed' ? 'مكتمل' : status === 'paused' ? 'متوقف مؤقتاً' : 'متوقف/خطأ';

  const renderJobItem = (job) => (
      <GlassCard
        key={job.id}
        style={styles.jobCard}
        onPress={() => navigation.navigate('GlossaryExtractorJobDetail', { job })}
      >
          <View style={styles.jobContentWrapper}>
              <Image source={{uri: job.cover}} style={styles.jobCover} />
              <View style={styles.jobInfo}>
                  <Text style={styles.jobTitle} numberOfLines={1}>{job.novelTitle}</Text>
                  <View style={styles.jobStatusRow}>
                      <View style={[styles.statusDot, {backgroundColor: job.status === 'active' ? '#fff' : '#666'}]} />
                      <Text style={styles.statusText}>
                          {statusLabel(job.status)}
                      </Text>
                  </View>
                  <View style={styles.progressContainer}>
                      <View style={[styles.progressBar, {width: `${job.total ? Math.min(100, ((job.processed || 0) / job.total) * 100) : 0}%`}]} />
                  </View>
                  <Text style={styles.progressText}>{(job.processed || 0)} / {job.total} فصل{job.newTerms ? ` — 📚 ${job.newTerms} مصطلح` : ''}</Text>
              </View>
              <Ionicons name="chevron-back" size={20} color="#666" />
          </View>
      </GlassCard>
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

      <SafeAreaView style={{flex: 1}}>
        <View style={styles.header}>
            {/* المستخرج يستخدم نفس مزوّدات المترجم — الإعدادات نفسها */}
            <TouchableOpacity onPress={() => navigation.navigate('TranslatorSettings')} style={styles.iconBtn}>
                <Ionicons name="settings-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <View>
                <Text style={styles.headerTitle}>المستخرج الذكي</Text>
                <Text style={styles.headerSub}>Zeus AI Glossary Extractor</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                <Ionicons name="arrow-forward" size={24} color="#fff" />
            </TouchableOpacity>
        </View>

        <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        >

            <TouchableOpacity
                style={styles.newTranslationBtn}
                onPress={() => navigation.navigate('GlossaryExtractorSelection')}
                activeOpacity={0.8}
            >
                <Ionicons name="add-circle" size={28} color="#fff" />
                <Text style={styles.newTranslationText}>بدء استخراج مصطلحات جديد</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>المهام الحالية</Text>
            {jobs.length === 0 ? (
                <Text style={{color:'#666', textAlign:'center', marginTop: 50}}>لا توجد مهام استخراج حالياً.</Text>
            ) : (
                <View style={styles.jobsList}>
                    {jobs.map(renderJobItem)}
                </View>
            )}

            <Text style={styles.hintText}>
                💡 ابدأ باستخراج مصطلحات الرواية كاملة أولاً — بعدها وزّع فصولها على مهام ترجمة متعددة تعمل بسرعة مع مسرد جاهز.
            </Text>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'right' },
  headerSub: { color: '#ccc', fontSize: 12, textAlign: 'right' },
  iconBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },

  content: { padding: 20 },

  newTranslationBtn: {
      marginBottom: 30, borderRadius: 16, overflow: 'hidden',
      backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10
  },
  newTranslationText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'right' },

  jobsList: { gap: 15, marginBottom: 30 },

  glassCard: {
      backgroundColor: 'rgba(20, 20, 20, 0.75)',
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      position: 'relative'
  },
  jobCard: { marginBottom: 0 },
  jobContentWrapper: { flexDirection: 'row-reverse', padding: 15, alignItems: 'center' },
  jobCover: { width: 60, height: 80, borderRadius: 8, backgroundColor: '#333' },
  jobInfo: { flex: 1, marginRight: 15, alignItems: 'flex-end' },
  jobTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 5 },
  jobStatusRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginBottom: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#bbb', fontSize: 12 },
  progressContainer: { width: '100%', height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 4 },
  progressBar: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
  progressText: { color: '#666', fontSize: 10 },

  hintText: { color: '#555', fontSize: 12, textAlign: 'right', lineHeight: 20, marginTop: 10 },
});
