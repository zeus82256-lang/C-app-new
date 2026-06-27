
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StatusBar,
  ImageBackground
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useToast } from '../context/ToastContext';
import api from '../services/api';

const GlassContainer = ({ children, style }) => (
    <View style={[styles.glassContainer, style]}>
        {children}
    </View>
);

export default function TitleGeneratorSettingsScreen({ navigation }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  
  const [prompt, setPrompt] = useState('');
  const [apiKeysText, setApiKeysText] = useState('');
  const [savedKeysCount, setSavedKeysCount] = useState(0);
  
  useEffect(() => {
      fetchSettings();
  }, []);

  const fetchSettings = async () => {
      try {
          const res = await api.get('/api/title-gen/settings');
          if (res.data) {
              setPrompt(res.data.prompt || '');
              const keys = res.data.apiKeys || [];
              setApiKeysText(keys.join('\n'));
              setSavedKeysCount(keys.length);
          }
      } catch (e) {
          showToast("فشل جلب الإعدادات", "error");
      } finally {
          setLoading(false);
      }
  };

  const handleSave = async () => {
      try {
          const processedKeys = apiKeysText
              .split('\n')
              .map(k => k.trim())
              .filter(k => k.length > 5);

          await api.post('/api/title-gen/settings', {
              prompt: prompt,
              apiKeys: processedKeys
          });
          
          setSavedKeysCount(processedKeys.length);
          showToast(`تم الحفظ بنجاح (${processedKeys.length} مفتاح)`, "success");
          navigation.goBack();
      } catch (e) {
          showToast("فشل الحفظ", "error");
      }
  };

  if (loading) {
      return (
          <View style={[styles.container, {justifyContent:'center', alignItems:'center'}]}>
              <ActivityIndicator color="#fff" size="large" />
          </View>
      );
  }

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
            <Text style={styles.headerTitle}>إعدادات مولد العناوين</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
            
            <GlassContainer>
                <View style={{flexDirection: 'row-reverse', gap: 10, alignItems: 'center', marginBottom: 15}}>
                    <Ionicons name="information-circle" size={20} color="#10b981" />
                    <Text style={[styles.hint, {textAlign: 'right', flex: 1, marginBottom: 0}]}>
                        يستخدم هذا النظام مفاتيح Gemini Flash. إذا لم تقم بإضافة مفاتيح هنا، سيحاول استخدام مفاتيح المترجم.
                    </Text>
                </View>
            </GlassContainer>

            <GlassContainer style={{marginTop: 20}}>
                <Text style={styles.sectionLabel}>مفاتيح API (منفصلة)</Text>
                <Text style={styles.hint}>ضع كل مفتاح في سطر منفصل.</Text>
                <Text style={[styles.hint, {color: '#fff', fontWeight: 'bold'}]}>الحالة: {savedKeysCount} مفتاح محفوظ.</Text>
                
                <TextInput 
                    style={styles.keysInput}
                    multiline
                    placeholder="AIzaSy...&#10;AIzaSy..."
                    placeholderTextColor="#666"
                    value={apiKeysText}
                    onChangeText={setApiKeysText}
                    textAlignVertical="top"
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </GlassContainer>

            <GlassContainer style={{marginTop: 20}}>
                <Text style={styles.sectionLabel}>البرومبت (Prompt)</Text>
                <Text style={styles.hint}>التعليمات التي ترسل للذكاء الاصطناعي لتوليد العنوان.</Text>
                <TextInput 
                    style={styles.input}
                    multiline
                    value={prompt}
                    onChangeText={setPrompt}
                    textAlignVertical="top"
                    placeholder="Read the chapter content..."
                    placeholderTextColor="#666"
                />
            </GlassContainer>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveText}>حفظ الإعدادات</Text>
            </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
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
  
  sectionLabel: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 5, textAlign: 'right' },
  hint: { color: '#888', fontSize: 12, textAlign: 'right', marginBottom: 15, lineHeight: 18 },
  
  input: { backgroundColor: 'rgba(0,0,0,0.5)', color: '#ccc', borderRadius: 10, padding: 15, minHeight: 200, borderWidth: 1, borderColor: '#333', textAlign: 'left' },
  keysInput: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: 12, color: '#fff', borderWidth: 1, borderColor: '#333', height: 150, fontFamily: 'monospace', fontSize: 12 },

  // Glassy Button
  saveBtn: { 
      marginTop: 40, marginBottom: 50, borderRadius: 16, overflow: 'hidden', 
      backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 1, borderColor: '#10b981',
      padding: 18, alignItems: 'center'
  },
  saveText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
