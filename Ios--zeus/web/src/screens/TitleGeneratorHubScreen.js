
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
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

// Standard Glass Card
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

export default function TitleGeneratorHubScreen({ navigation }) {
  const [jobs, setJobs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = async () => {
      try {
          const res = await api.get('/api/title-gen/jobs');
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

  const renderJobItem = (job) => (
      <GlassCard 
        key={job.id} 
        style={styles.jobCard}
        onPress={() => navigation.navigate('TitleGeneratorDetail', { job })}
      >
          <View style={styles.jobContentWrapper}>
              <Image source={{uri: job.cover}} style={styles.jobCover} />
              <View style={styles.jobInfo}>
                  <Text style={styles.jobTitle} numberOfLines={1}>{job.novelTitle}</Text>
                  <View style={styles.jobStatusRow}>
                      <View style={[styles.statusDot, {backgroundColor: job.status === 'active' ? '#fff' : '#666'}]} />
                      <Text style={styles.statusText}>
                          {job.status === 'active' ? 'جاري المعالجة' : job.status === 'completed' ? 'مكتمل' : 'متوقف/خطأ'}
                      </Text>
                  </View>
                  <View style={styles.progressContainer}>
                      <View style={[styles.progressBar, {width: `${(job.processed / job.total) * 100}%`}]} />
                  </View>
                  <Text style={styles.progressText}>{job.processed} / {job.total} فصل</Text>
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
            <TouchableOpacity onPress={() => navigation.navigate('TitleGeneratorSettings')} style={styles.iconBtn}>
                <Ionicons name="settings-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <View>
                <Text style={styles.headerTitle}>مولد العناوين AI</Text>
                <Text style={styles.headerSub}>Gemini 2.5 Flash</Text>
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
                onPress={() => navigation.navigate('TitleGeneratorSelection')}
                activeOpacity={0.8}
            >
                <Ionicons name="add-circle" size={28} color="#fff" />
                <Text style={styles.newTranslationText}>مهمة جديدة</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>المهام الحالية</Text>
            {jobs.length === 0 ? (
                <Text style={{color:'#666', textAlign:'center', marginTop: 50}}>لا توجد مهام نشطة حالياً.</Text>
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
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'right' },
  headerSub: { color: '#ccc', fontSize: 12, textAlign: 'right' },
  iconBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  
  content: { padding: 20 },
  
  // Glassy Button
  newTranslationBtn: { 
      marginBottom: 30, borderRadius: 16, overflow: 'hidden', 
      backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 1, borderColor: '#10b981',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10
  },
  newTranslationText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'right' },
  
  jobsList: { gap: 15, marginBottom: 30 },
  
  // Glass Card
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
  progressBar: { height: '100%', backgroundColor: '#10b981', borderRadius: 2 },
  progressText: { color: '#666', fontSize: 10 },
});
