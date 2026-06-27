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
  ImageBackground,
  Alert
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

export default function TranslatorSettingsScreen({ navigation }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  
  // الحقول العامة
  const [transPrompt, setTransPrompt] = useState('');
  const [extractPrompt, setExtractPrompt] = useState('');
  
  // المزوّدون
  const [providers, setProviders] = useState([]);
  const [expandedProvider, setExpandedProvider] = useState(null); // لمراقبة أي مزوّد مفعّل حالياً

  useEffect(() => {
      fetchSettings();
  }, []);

  const fetchSettings = async () => {
      try {
          const res = await api.get('/api/translator/settings');
          if (res.data) {
              setTransPrompt(res.data.customPrompt || '');
              setExtractPrompt(res.data.translatorExtractPrompt || '');
              // تحميل المزوّدين
              const fetchedProviders = res.data.translationProviders || [];
              // تأكد من وجود حقول افتراضية
              const normalized = fetchedProviders.map((p, idx) => ({
                  providerId: p.providerId || `provider_${idx}`,
                  name: p.name || 'مزوّد جديد',
                  baseUrl: p.baseUrl || '',
                  models: p.models && p.models.length ? p.models : [{ modelId: 'gemini-2.5-flash', modelName: 'Gemini 2.5 Flash' }],
                  apiKeys: p.apiKeys || [],
                  selectedModel: p.selectedModel || (p.models && p.models[0]?.modelId) || 'gemini-2.5-flash',
                  priority: p.priority !== undefined ? p.priority : idx
              }));
              setProviders(normalized);
          }
      } catch (e) {
          showToast("فشل جلب الإعدادات", "error");
      } finally {
          setLoading(false);
      }
  };

  // إضافة مزوّد جديد (معدل ليشمل نموذج ChatGPT Android)
  const addProvider = () => {
      const newPriority = providers.length > 0 ? Math.max(...providers.map(p => p.priority)) + 1 : 0;
      const newProvider = {
          providerId: `provider_${Date.now()}`,
          name: 'مزوّد جديد',
          baseUrl: '',
          models: [
              { modelId: 'gemini-2.5-flash', modelName: 'Gemini 2.5 Flash' },
              { modelId: 'auto', modelName: 'ChatGPT Android' }
          ],
          apiKeys: [],
          selectedModel: 'gemini-2.5-flash',
          priority: newPriority
      };
      setProviders([...providers, newProvider]);
      setExpandedProvider(newProvider.providerId);
  };

  // حذف مزوّد
  const deleteProvider = (providerId) => {
      Alert.alert("تأكيد", "هل تريد حذف هذا المزود؟", [
          { text: "إلغاء", style: "cancel" },
          { text: "حذف", onPress: () => {
              setProviders(providers.filter(p => p.providerId !== providerId));
          }}
      ]);
  };

  // تحديث حقل عام في مزوّد (name, baseUrl, selectedModel)
  const updateProviderField = (providerId, field, value) => {
      setProviders(providers.map(p => p.providerId === providerId ? { ...p, [field]: value } : p));
  };

  // تحديث المفاتيح لمزوّد (نص متعدد الأسطر)
  const updateProviderKeys = (providerId, text) => {
      const keys = text.split('\n').map(k => k.trim()).filter(k => k.length > 5);
      setProviders(providers.map(p => p.providerId === providerId ? { ...p, apiKeys: keys, _keysText: text } : p));
  };

  // إضافة نموذج لمزوّد
  const addModelToProvider = (providerId) => {
      const provider = providers.find(p => p.providerId === providerId);
      if (!provider) return;
      const newModel = { modelId: '', modelName: '' };
      const updatedModels = [...provider.models, newModel];
      setProviders(providers.map(p => p.providerId === providerId ? { ...p, models: updatedModels } : p));
  };

  // حذف نموذج من مزوّد
  const removeModelFromProvider = (providerId, modelIndex) => {
      const provider = providers.find(p => p.providerId === providerId);
      if (!provider || provider.models.length <= 1) {
          showToast("يجب أن يحتوي المزوّد على نموذج واحد على الأقل", "warning");
          return;
      }
      const updatedModels = provider.models.filter((_, idx) => idx !== modelIndex);
      // إذا تم حذف النموذج المحدد، نعيد تعيينه لأول نموذج
      let updatedSelectedModel = provider.selectedModel;
      if (!updatedModels.find(m => m.modelId === updatedSelectedModel)) {
          updatedSelectedModel = updatedModels[0].modelId;
      }
      setProviders(providers.map(p => p.providerId === providerId ? { ...p, models: updatedModels, selectedModel: updatedSelectedModel } : p));
  };

  // تحديث حقل نموذج (modelId, modelName)
  const updateModelField = (providerId, modelIndex, field, value) => {
      setProviders(providers.map(p => {
          if (p.providerId !== providerId) return p;
          const updatedModels = p.models.map((m, idx) => idx === modelIndex ? { ...m, [field]: value } : m);
          return { ...p, models: updatedModels };
      }));
  };

  // تبديل أولوية (لأعلى/لأسفل)
  const moveProvider = (index, direction) => {
      const newProviders = [...providers];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= newProviders.length) return;
      // تبديل الأولويات
      [newProviders[index].priority, newProviders[targetIndex].priority] = [newProviders[targetIndex].priority, newProviders[index].priority];
      // إعادة ترتيب المصفوفة حسب الأولوية
      newProviders.sort((a, b) => a.priority - b.priority);
      setProviders(newProviders);
  };

  const handleSave = async () => {
      try {
          // تجهيز المزوّدين للإرسال: نظيف تنسيق النماذج والمفاتيح
          const cleanedProviders = providers.map(p => ({
              providerId: p.providerId,
              name: p.name,
              baseUrl: p.baseUrl,
              models: p.models.filter(m => m.modelId.trim() !== '').map(m => ({ modelId: m.modelId.trim(), modelName: m.modelName.trim() || m.modelId.trim() })),
              apiKeys: p.apiKeys,
              selectedModel: p.selectedModel,
              priority: p.priority
          }));

          await api.post('/api/translator/settings', {
              customPrompt: transPrompt,
              translatorExtractPrompt: extractPrompt,
              translationProviders: cleanedProviders
          });
          
          showToast("تم حفظ الإعدادات بنجاح", "success");
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
            <Text style={styles.headerTitle}>إعدادات المترجم</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
            
            {/* إضافة مزوّد جديد */}
            <TouchableOpacity style={styles.addProviderBtn} onPress={addProvider}>
                <Ionicons name="add-circle" size={24} color="#fff" />
                <Text style={styles.addProviderText}>إضافة مزوّد جديد</Text>
            </TouchableOpacity>

            {/* عرض المزوّدين */}
            {providers.sort((a, b) => a.priority - b.priority).map((provider, index) => {
                const isExpanded = expandedProvider === provider.providerId;
                return (
                    <GlassContainer key={provider.providerId} style={styles.providerCard}>
                        {/* رأس البطاقة */}
                        <TouchableOpacity 
                            style={styles.providerHeader}
                            onPress={() => setExpandedProvider(isExpanded ? null : provider.providerId)}
                            activeOpacity={0.8}
                        >
                            <View style={{flexDirection: 'row-reverse', alignItems: 'center'}}>
                                <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="#ccc" style={{marginLeft: 10}} />
                                <View style={{flex: 1, alignItems: 'flex-end'}}>
                                    <Text style={styles.providerName}>{provider.name}</Text>
                                    <Text style={styles.providerModel}>النموذج: {provider.selectedModel}</Text>
                                </View>
                            </View>
                            <View style={{flexDirection: 'row-reverse', gap: 8}}>
                                <TouchableOpacity onPress={() => moveProvider(index, -1)} disabled={index === 0}>
                                    <Ionicons name="arrow-up" size={18} color={index === 0 ? '#444' : '#fff'} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => moveProvider(index, 1)} disabled={index === providers.length - 1}>
                                    <Ionicons name="arrow-down" size={18} color={index === providers.length - 1 ? '#444' : '#fff'} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => deleteProvider(provider.providerId)}>
                                    <Ionicons name="trash-outline" size={18} color="#ff6666" />
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>

                        {/* محتوى قابل للطي */}
                        {isExpanded && (
                            <View style={styles.providerBody}>
                                {/* الاسم و الرابط الأساسي */}
                                <Text style={styles.miniLabel}>اسم المزوّد</Text>
                                <TextInput
                                    style={styles.miniInput}
                                    value={provider.name}
                                    onChangeText={(text) => updateProviderField(provider.providerId, 'name', text)}
                                    placeholder="مثل: Gemini, OpenRouter, ChatGPT Android"
                                    placeholderTextColor="#666"
                                />
                                <Text style={styles.miniLabel}>Base URL (اختياري)</Text>
                                <TextInput
                                    style={styles.miniInput}
                                    value={provider.baseUrl}
                                    onChangeText={(text) => updateProviderField(provider.providerId, 'baseUrl', text)}
                                    placeholder="https://api.openai.com/v1"
                                    placeholderTextColor="#666"
                                    autoCapitalize="none"
                                />

                                {/* المفاتيح */}
                                <Text style={styles.miniLabel}>مفاتيح API (كل مفتاح في سطر)</Text>
                                <Text style={styles.hintSmall}>🔑 بالنسبة لـ ChatGPT Android: اترك الحقل فارغاً أو اكتب أي نص (لا يحتاج مفتاح حقيقي)</Text>
                                <TextInput
                                    style={styles.keysInputSmall}
                                    multiline
                                    placeholder="AIzaSy...\nsk-..."
                                    placeholderTextColor="#666"
                                    value={provider._keysText || provider.apiKeys.join('\n')}
                                    onChangeText={(text) => updateProviderKeys(provider.providerId, text)}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />

                                {/* النماذج */}
                                <Text style={styles.miniLabel}>النماذج</Text>
                                {provider.models.map((model, mIdx) => (
                                    <View key={mIdx} style={styles.modelRow}>
                                        <TouchableOpacity 
                                            style={styles.removeModelBtn}
                                            onPress={() => removeModelFromProvider(provider.providerId, mIdx)}
                                        >
                                            <Ionicons name="remove-circle" size={22} color="#ff6666" />
                                        </TouchableOpacity>
                                        <View style={{flex: 1}}>
                                            <TextInput
                                                style={styles.modelInput}
                                                placeholder="modelId"
                                                placeholderTextColor="#666"
                                                value={model.modelId}
                                                onChangeText={(text) => updateModelField(provider.providerId, mIdx, 'modelId', text)}
                                            />
                                            <TextInput
                                                style={styles.modelInput}
                                                placeholder="اسم ودود"
                                                placeholderTextColor="#666"
                                                value={model.modelName}
                                                onChangeText={(text) => updateModelField(provider.providerId, mIdx, 'modelName', text)}
                                            />
                                        </View>
                                        {provider.selectedModel === model.modelId ? (
                                            <Ionicons name="checkmark-circle" size={22} color="#fff" />
                                        ) : (
                                            <TouchableOpacity onPress={() => updateProviderField(provider.providerId, 'selectedModel', model.modelId)}>
                                                <Ionicons name="ellipse-outline" size={22} color="#888" />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                ))}
                                <TouchableOpacity style={styles.addModelBtn} onPress={() => addModelToProvider(provider.providerId)}>
                                    <Ionicons name="add-circle-outline" size={18} color="#ccc" />
                                    <Text style={styles.addModelText}>إضافة نموذج</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </GlassContainer>
                );
            })}

            {/* تعليمات الترجمة */}
            <GlassContainer>
                <Text style={styles.sectionLabel}>تعليمات الترجمة</Text>
                <Text style={styles.hint}>النبرة، الأسلوب، الضمائر...</Text>
                <TextInput 
                    style={styles.input}
                    multiline
                    value={transPrompt}
                    onChangeText={setTransPrompt}
                    textAlignVertical="top"
                    placeholder="You are a professional translator..."
                    placeholderTextColor="#666"
                />
            </GlassContainer>

            {/* استخراج المصطلحات */}
            <GlassContainer style={{marginTop: 20, borderColor: 'rgba(255,255,255,0.2)'}}>
                <Text style={[styles.sectionLabel, {color: '#fff'}]}>استخراج المصطلحات</Text>
                <Text style={styles.hint}>كيفية استخراج المصطلحات الجديدة للمسرد.</Text>
                <TextInput 
                    style={styles.input}
                    multiline
                    value={extractPrompt}
                    onChangeText={setExtractPrompt}
                    textAlignVertical="top"
                    placeholder="Extract proper nouns..."
                    placeholderTextColor="#666"
                />
            </GlassContainer>

            {/* زر الحفظ */}
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
  
  glassContainer: { 
      backgroundColor: 'rgba(20, 20, 20, 0.75)',
      borderRadius: 16, 
      overflow: 'hidden', 
      padding: 15, 
      borderWidth: 1, 
      borderColor: 'rgba(255,255,255,0.1)' 
  },
  
  sectionLabel: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 5, textAlign: 'right' },
  hint: { color: '#888', fontSize: 12, textAlign: 'right', marginBottom: 15 },
  hintSmall: { color: '#888', fontSize: 10, textAlign: 'right', marginBottom: 5 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15, marginTop: 25, textAlign: 'right' },

  // زر إضافة مزوّد
  addProviderBtn: {
      marginBottom: 20, borderRadius: 12, overflow: 'hidden',
      backgroundColor: 'rgba(16, 185, 129, 0.15)', borderWidth: 1, borderColor: '#10b981',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, gap: 10
  },
  addProviderText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  // بطاقة المزوّد
  providerCard: { marginBottom: 15 },
  providerHeader: {
      flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 5
  },
  providerName: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'right' },
  providerModel: { color: '#aaa', fontSize: 12, textAlign: 'right' },

  providerBody: { marginTop: 15, borderTopWidth: 1, borderColor: '#333', paddingTop: 15 },
  
  miniLabel: { color: '#ccc', fontSize: 12, marginBottom: 4, marginTop: 8, textAlign: 'right' },
  miniInput: {
      backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: 8, padding: 10,
      fontSize: 14, borderWidth: 1, borderColor: '#333', textAlign: 'right'
  },
  keysInputSmall: {
      backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: 10, color: '#fff',
      borderWidth: 1, borderColor: '#333', height: 80, fontFamily: 'monospace', fontSize: 12,
      textAlignVertical: 'top'
  },

  modelRow: {
      flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 8, gap: 8
  },
  removeModelBtn: { padding: 4 },
  modelInput: {
      backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: 6, padding: 8,
      fontSize: 13, borderWidth: 1, borderColor: '#333', marginBottom: 4, textAlign: 'right'
  },
  addModelBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      marginTop: 10, paddingVertical: 8
  },
  addModelText: { color: '#ccc', fontSize: 14 },

  input: { backgroundColor: 'rgba(0,0,0,0.5)', color: '#ccc', borderRadius: 10, padding: 15, minHeight: 120, borderWidth: 1, borderColor: '#333', textAlign: 'left' },

  saveBtn: { 
      marginTop: 40, marginBottom: 50, borderRadius: 16, overflow: 'hidden', 
      backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
      padding: 18, alignItems: 'center'
  },
  saveText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});