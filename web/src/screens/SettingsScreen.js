
import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  StatusBar,
  ImageBackground,
  Modal,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import CustomAlert from '../components/CustomAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { READER_STRUCTURE_KEY } from './ReaderScreen';

const GlassContainer = ({ children, style }) => (
    <View style={[styles.glassContainer, style]}>
        {children}
    </View>
);

export default function SettingsScreen({ navigation }) {
  const { userInfo, logout, login } = useContext(AuthContext);
  const { showToast } = useToast();
  
  const [name, setName] = useState(userInfo?.name || '');
  const [bio, setBio] = useState(userInfo?.bio || '');
  const [email, setEmail] = useState(userInfo?.email || ''); // 🔥 Email State
  const [isHistoryPublic, setIsHistoryPublic] = useState(userInfo?.isHistoryPublic ?? true);
  const [uploading, setUploading] = useState(false);
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;

  // 🔥 Password Management State
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Custom Alert
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({});
  const [readerStructure, setReaderStructure] = useState('web');
  const isAdmin = userInfo?.role === 'admin';

  useEffect(() => {
    AsyncStorage.getItem(READER_STRUCTURE_KEY)
      .then((v) => { if (v === 'native' || v === 'web') setReaderStructure(v); })
      .catch(() => {});
  }, []);

  const changeReaderStructure = async (value) => {
    setReaderStructure(value);
    try { await AsyncStorage.setItem(READER_STRUCTURE_KEY, value); } catch (e) {}
  };

  const uploadImage = async (uri, type) => {
      setUploading(true);
      try {
          let formData = new FormData();
          formData.append('image', {
              uri: uri,
              name: 'upload.jpg',
              type: 'image/jpeg'
          });

          const res = await api.post('/api/upload', formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
          });
          
          const imageUrl = res.data.url;
          
          await api.put('/api/user/profile', {
              [type]: imageUrl
          });

          showToast("تم تحديث الصورة بنجاح", "success");
          login(await AsyncStorage.getItem('userToken')); // Refresh context
      } catch (e) {
          showToast("فشل رفع الصورة", "error");
      } finally {
          setUploading(false);
      }
  };

  const pickImage = async (type) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
        showToast('نحتاج إذن الوصول للصور', 'error');
        return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: type === 'banner' ? [16, 9] : [1, 1],
        quality: 0.7,
    });

    if (!result.canceled) {
        uploadImage(result.assets[0].uri, type);
    }
  };

  const handleSave = async () => {
      setUploading(true);
      try {
          await api.put('/api/user/profile', {
              name,
              bio,
              email, // 🔥 Include email in update
              isHistoryPublic
          });
          showToast("تم حفظ التغييرات", "success");
          login(await AsyncStorage.getItem('userToken')); // Refresh context to update user data in app
          navigation.goBack();
      } catch (e) {
          const msg = e.response?.data?.message || "فشل حفظ التغييرات";
          showToast(msg, "error");
      } finally {
          setUploading(false);
      }
  };

  const handleSavePassword = async () => {
      // Basic Validations
      if (!newPassword || !confirmPassword) {
          showToast("يرجى ملء جميع الحقول", "error");
          return;
      }
      if (newPassword !== confirmPassword) {
          setAlertConfig({
              title: "خطأ",
              message: "كلمة المرور الجديدة غير متطابقة",
              type: 'warning',
              confirmText: "حسناً",
              onConfirm: () => setAlertVisible(false)
          });
          setAlertVisible(true);
          return;
      }
      
      // If user has existing password (detected via password prop which we will assume exists if not google only, but api handles checks)
      if (userInfo.password && !currentPassword) {
           // We rely on the backend to tell us if current pass is wrong, but here is a client check if we want
      }

      setChangingPassword(true);
      try {
          await api.put('/auth/password', {
              currentPassword,
              newPassword
          });
          
          showToast("تم تحديث كلمة المرور بنجاح", "success");
          setPasswordModalVisible(false);
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          
          // Refresh user data (now they definitely have a password)
          login(await AsyncStorage.getItem('userToken'));

      } catch (e) {
          const msg = e.response?.data?.message || "فشل تحديث كلمة المرور";
          setAlertConfig({
              title: "خطأ",
              message: msg,
              type: 'danger',
              confirmText: "حسناً",
              onConfirm: () => setAlertVisible(false)
          });
          setAlertVisible(true);
      } finally {
          setChangingPassword(false);
      }
  };

  // Determine if user has a password (based on userInfo from context)
  const hasPassword = !!userInfo?.password;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <CustomAlert 
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onCancel={() => setAlertVisible(false)}
        onConfirm={alertConfig.onConfirm}
      />

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
            <Text style={styles.headerTitle}>تعديل الملف الشخصي</Text>
            <View style={{width: 40}} /> 
        </View>

        <ScrollView contentContainerStyle={styles.content}>
            {/* Banner Section */}
            <TouchableOpacity style={styles.bannerContainer} onPress={() => pickImage('banner')}>
                <Image 
                    source={userInfo?.banner ? { uri: userInfo.banner } : null} 
                    style={styles.bannerImage}
                    contentFit="cover"
                />
                <View style={styles.bannerOverlay}>
                    <Ionicons name="camera" size={24} color="#fff" />
                    <Text style={{color:'#fff', marginTop: 5, fontWeight: 'bold'}}>تغيير الغلاف</Text>
                </View>
            </TouchableOpacity>

            {/* Avatar Section */}
            <View style={styles.avatarSection}>
                <TouchableOpacity style={styles.avatarContainer} onPress={() => pickImage('picture')}>
                    <Image 
                        source={userInfo?.picture ? { uri: userInfo.picture } : require('../../assets/adaptive-icon.png')} 
                        style={styles.avatarImage} 
                        contentFit="cover" 
                    />
                    <View style={styles.avatarOverlay}>
                        <Ionicons name="camera" size={20} color="#fff" />
                    </View>
                </TouchableOpacity>
            </View>

            {/* Form Fields */}
            <View style={styles.form}>
                <GlassContainer>
                    <Text style={styles.label}>الاسم</Text>
                    <TextInput 
                        style={styles.input} 
                        value={name} 
                        onChangeText={setName}
                        placeholder="اسم المستخدم"
                        placeholderTextColor="#666" 
                    />
                    
                    <Text style={styles.label}>النبذة التعريفية</Text>
                    <TextInput 
                        style={[styles.input, {height: 100, textAlignVertical: 'top'}]} 
                        value={bio} 
                        onChangeText={setBio}
                        placeholder="اكتب شيئاً عن نفسك..."
                        placeholderTextColor="#666"
                        multiline
                    />
                </GlassContainer>

                {/* 🔥 Email Section (Above Password) */}
                <GlassContainer>
                    <Text style={styles.sectionTitle}>البريد الإلكتروني</Text>
                    <Text style={styles.label}>تعديل البريد</Text>
                    <TextInput 
                        style={styles.input} 
                        value={email} 
                        onChangeText={setEmail}
                        placeholder="example@gmail.com"
                        placeholderTextColor="#666"
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />
                    <Text style={styles.hint}>
                        يجب أن ينتهي البريد بـ @gmail.com لتتمكن من تسجيل الدخول.
                    </Text>
                </GlassContainer>

                {/* 🔥 Password Management Section */}
                <GlassContainer>
                    <Text style={styles.sectionTitle}>الأمان</Text>
                    <View style={styles.securityRow}>
                        <View style={{flex: 1}}>
                            <Text style={styles.securityText}>
                                {hasPassword ? "كلمة المرور مفعلة" : "لا توجد كلمة مرور (تسجيل عبر Google)"}
                            </Text>
                            <Text style={styles.securitySub}>
                                {hasPassword ? "يمكنك تغيير كلمة المرور الحالية" : "قم بإنشاء كلمة مرور لتتمكن من الدخول بالبريد"}
                            </Text>
                        </View>
                        <TouchableOpacity style={styles.passwordBtn} onPress={() => setPasswordModalVisible(true)}>
                            <Text style={styles.passwordBtnText}>
                                {hasPassword ? "تغيير" : "إنشاء"}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </GlassContainer>

                <GlassContainer>
                    <View style={styles.switchRow}>
                        <Switch 
                            value={isHistoryPublic} 
                            onValueChange={setIsHistoryPublic}
                            trackColor={{ false: "#333", true: "#4a7cc7" }}
                        />
                        <Text style={styles.switchLabel}>سجل القراءة عام</Text>
                    </View>
                </GlassContainer>

                {/* Admin-only: reader engine structure */}
                {isAdmin && (
                    <GlassContainer>
                        <Text style={styles.sectionTitle}>هيكلية القارئ (للمشرف)</Text>
                        <Text style={styles.securitySub}>
                            اختر محرك عرض الفصول: عارض الويب بتصميم Galaxy، أو القارئ الأصلي (كلاسيكي). يُطبق عند فتح أي فصل.
                        </Text>
                        <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 12 }}>
                            <TouchableOpacity
                                style={{
                                    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                                    backgroundColor: readerStructure === 'web' ? '#4a7cc7' : '#1c1c1e',
                                    borderWidth: 1, borderColor: readerStructure === 'web' ? '#5b8bd4' : '#333',
                                }}
                                onPress={() => changeReaderStructure('web')}
                            >
                                <Ionicons name="globe-outline" size={18} color={readerStructure === 'web' ? '#fff' : '#999'} />
                                <Text style={{ color: readerStructure === 'web' ? '#fff' : '#999', fontWeight: 'bold', marginTop: 4, fontSize: 13 }}>
                                    عارض ويب (Galaxy)
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{
                                    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                                    backgroundColor: readerStructure === 'native' ? '#4a7cc7' : '#1c1c1e',
                                    borderWidth: 1, borderColor: readerStructure === 'native' ? '#5b8bd4' : '#333',
                                }}
                                onPress={() => changeReaderStructure('native')}
                            >
                                <Ionicons name="phone-portrait-outline" size={18} color={readerStructure === 'native' ? '#fff' : '#999'} />
                                <Text style={{ color: readerStructure === 'native' ? '#fff' : '#999', fontWeight: 'bold', marginTop: 4, fontSize: 13 }}>
                                    أصلي (كلاسيكي)
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </GlassContainer>
                )}

                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={uploading}>
                    {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>حفظ التغييرات</Text>}
                </TouchableOpacity>

                <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
                    <Text style={styles.logoutBtnText}>تسجيل الخروج</Text>
                    <Ionicons name="log-out-outline" size={20} color="#fff" />
                </TouchableOpacity>
            </View>

        </ScrollView>

        {/* 🔥 Password Modal */}
        <Modal 
            visible={passwordModalVisible} 
            transparent 
            animationType="fade" 
            onRequestClose={() => setPasswordModalVisible(false)}
        >
            <TouchableOpacity 
                style={styles.modalOverlay} 
                activeOpacity={1} 
                onPress={() => Keyboard.dismiss()}
            >
                <KeyboardAvoidingView 
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={{width: '100%'}}
                >
                    <View style={styles.modalContainer}>
                        <GlassContainer style={{width: '100%', marginBottom: 0}}>
                            <Text style={styles.modalTitle}>
                                {hasPassword ? "تغيير كلمة المرور" : "إنشاء كلمة مرور جديدة"}
                            </Text>

                            {/* Only show current password field if user has a password */}
                            {hasPassword && (
                                <>
                                    <Text style={styles.label}>كلمة المرور الحالية</Text>
                                    <TextInput 
                                        style={styles.input} 
                                        value={currentPassword} 
                                        onChangeText={setCurrentPassword}
                                        placeholder="*******"
                                        placeholderTextColor="#666"
                                        secureTextEntry
                                    />
                                </>
                            )}

                            <Text style={styles.label}>كلمة المرور الجديدة</Text>
                            <TextInput 
                                style={styles.input} 
                                value={newPassword} 
                                onChangeText={setNewPassword}
                                placeholder="4 حروف/أرقام على الأقل"
                                placeholderTextColor="#666"
                                secureTextEntry
                            />

                            <Text style={styles.label}>تأكيد كلمة المرور</Text>
                            <TextInput 
                                style={styles.input} 
                                value={confirmPassword} 
                                onChangeText={setConfirmPassword}
                                placeholder="تأكيد كلمة المرور"
                                placeholderTextColor="#666"
                                secureTextEntry
                            />

                            <View style={styles.modalActions}>
                                <TouchableOpacity 
                                    style={[styles.modalBtn, {backgroundColor: '#333'}]} 
                                    onPress={() => {
                                        setPasswordModalVisible(false);
                                        setCurrentPassword('');
                                        setNewPassword('');
                                        setConfirmPassword('');
                                    }}
                                >
                                    <Text style={styles.modalBtnText}>إلغاء</Text>
                                </TouchableOpacity>

                                <TouchableOpacity 
                                    style={[styles.modalBtn, {backgroundColor: '#4a7cc7'}]} 
                                    onPress={handleSavePassword}
                                    disabled={changingPassword}
                                >
                                    {changingPassword ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>حفظ</Text>}
                                </TouchableOpacity>
                            </View>
                        </GlassContainer>
                    </View>
                </KeyboardAvoidingView>
            </TouchableOpacity>
        </Modal>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  iconBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  
  content: { paddingBottom: 50 },
  
  bannerContainer: { height: 180, width: '100%', backgroundColor: '#222', position: 'relative' },
  bannerImage: { width: '100%', height: '100%', opacity: 0.7 },
  bannerOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  
  avatarSection: { alignItems: 'center', marginTop: -50, marginBottom: 20 },
  avatarContainer: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, borderColor: '#000', backgroundColor: '#333', position: 'relative', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 30, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },

  form: { padding: 20, gap: 20 },
  
  // Glass Container
  glassContainer: { 
      backgroundColor: 'rgba(20, 20, 20, 0.75)',
      borderRadius: 16, 
      overflow: 'hidden', 
      padding: 20, 
      borderWidth: 1, 
      borderColor: 'rgba(255,255,255,0.1)' 
  },
  
  label: { color: '#ccc', marginBottom: 8, textAlign: 'right', fontSize: 14, fontWeight: '600' },
  input: { 
      backgroundColor: 'rgba(0,0,0,0.7)', // Darker background for inputs
      color: '#fff', 
      borderRadius: 12, 
      padding: 15, 
      fontSize: 16, 
      borderWidth: 1, 
      borderColor: 'rgba(255,255,255,0.1)', 
      textAlign: 'right',
      marginBottom: 15 
  },
  hint: { color: '#888', fontSize: 12, textAlign: 'right', marginTop: -10 },
  
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchLabel: { color: '#fff', fontSize: 16 },

  // Security Section
  sectionTitle: { color: '#4a7cc7', fontSize: 16, fontWeight: 'bold', marginBottom: 15, textAlign: 'right' },
  securityRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  securityText: { color: '#fff', fontSize: 14, fontWeight: 'bold', textAlign: 'right' },
  securitySub: { color: '#888', fontSize: 11, textAlign: 'right', marginTop: 4 },
  passwordBtn: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
  passwordBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  // Transparent Blue Button
  saveBtn: { 
      backgroundColor: 'rgba(74, 124, 199, 0.25)', 
      borderRadius: 16, padding: 18, 
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: '#4a7cc7'
  },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // Transparent Red Button
  logoutBtn: { 
      backgroundColor: 'rgba(185, 28, 28, 0.25)', 
      borderRadius: 16, padding: 18, 
      alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10,
      borderWidth: 1, borderColor: '#b91c1c'
  },
  logoutBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContainer: { width: '100%' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  modalBtn: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { color: '#fff', fontWeight: 'bold' }
});
