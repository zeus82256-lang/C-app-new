
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Image,
  StatusBar,
  ImageBackground
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { useFocusEffect } from '@react-navigation/native';

// Glass Card
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

export default function ChapterTitleFixerScreen({ navigation }) {
  const [jobs, setJobs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = async () => {
      try {
          const res = await api.get('/api/admin/tools/extract-titles/jobs');
          setJobs(res.data);
      } catch (e) { console.log(e); }
  };

  useFocusEffect(
      useCallback(() => {
          fetchJobs();
          const interval = setInterval(fetchJobs, 3000); // Live poll
          return () => clearInterval(interval);
      }, [])
  );

  const onRefresh = async () => {
      setRefreshing(true);
      await fetchJobs();
      setRefreshing(false);
  };

  const handleDeleteJob = async (id) => {
      try {
          await api.delete(`/api/admin/tools/extract-titles/jobs/${id}`);
          fetchJobs();
      } catch(e) {}
  };

  const renderJobItem = (job) => (
      <GlassCard key={job._id} style={styles.jobCard}>
          <View style={styles.jobContentWrapper}>
              <Image source={{uri: job.cover}} style={styles.jobCover} />
              <View style={styles.jobInfo}>
                  <Text style={styles.jobTitle} numberOfLines={1}>{job.novelTitle}</Text>
                  
                  <View style={styles.statusRow}>
                      <View style={[styles.statusDot, {backgroundColor: job.status === 'active' ? '#4ade80' : job.status === 'completed' ? '#fff' : '#ff4444'}]} />
                      <Text style={styles.statusText}>
                          {job.status === 'active' ? 'جاري المعالجة...' : job.status === 'completed' ? 'مكتمل' : 'فشل'}
                      </Text>
                  </View>

                  <View style={styles.progressContainer}>
                      <View style={[styles.progressBar, {width: `${Math.min(100, (job.processedCount / (job.totalChapters || 1)) * 100)}%`}]} />
                  </View>
                  <Text style={styles.progressText}>{job.processedCount} / {job.totalChapters} فصل</Text>
              </View>
              
              <TouchableOpacity onPress={() => handleDeleteJob(job._id)} style={{padding: 5}}>
                  <Ionicons name="trash-outline" size={20} color="#ff4444" />
              </TouchableOpacity>
          </View>
          
          {/* Last Log */}
          {job.logs && job.logs.length > 0 && (
              <View style={styles.lastLog}>
                  <Text style={[styles.logText, {color: '#888'}]} numberOfLines={1}>
                      {job.logs[job.logs.length-1].message}
                  </Text>
              </View>
          )}
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
            <View>
                <Text style={styles.headerTitle}>معالج العناوين</Text>
                <Text style={styles.headerSub}>Extractor Hub</Text>
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
                style={styles.newJobBtn}
                onPress={() => navigation.navigate('ChapterTitleFixerSelection')}
                activeOpacity={0.8}
            >
                <Ionicons name="add-circle" size={28} color="#fff" />
                <Text style={styles.newJobText}>بدء مهمة جديدة</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>المهام الحالية</Text>
            {jobs.length === 0 ? (
                <View style={styles.emptyState}>
                    <Ionicons name="layers-outline" size={50} color="#333" />
                    <Text style={styles.emptyText}>لا توجد مهام نشطة.</Text>
                </View>
            ) : (
                <View style={styles.jobsList}>
                    {jobs.map(renderJobItem)}
                </View>
            )}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'left' },
  headerSub: { color: '#ccc', fontSize: 12, textAlign: 'left' },
  iconBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  
  content: { padding: 20 },
  
  newJobBtn: { 
      marginBottom: 30, borderRadius: 16, overflow: 'hidden', 
      backgroundColor: 'rgba(244, 63, 94, 0.1)', borderWidth: 1, borderColor: '#f43f5e',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10
  },
  newJobText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

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
  jobCover: { width: 50, height: 70, borderRadius: 8, backgroundColor: '#333' },
  jobInfo: { flex: 1, marginRight: 15, alignItems: 'flex-end' },
  jobTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 5 },
  statusRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginBottom: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#bbb', fontSize: 11 },
  progressContainer: { width: '100%', height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 4 },
  progressBar: { height: '100%', backgroundColor: '#f43f5e', borderRadius: 2 },
  progressText: { color: '#666', fontSize: 10 },
  lastLog: { backgroundColor: 'rgba(0,0,0,0.3)', padding: 8, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  logText: { fontSize: 10, textAlign: 'right' },
  emptyState: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#666', marginTop: 10 }
});
