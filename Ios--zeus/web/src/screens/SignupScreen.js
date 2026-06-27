
import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ImageBackground
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import CustomAlert from '../components/CustomAlert'; // 🔥 Custom Alert

const { width } = Dimensions.get('window');

export default function SignupScreen({ navigation }) {
  const { login } = useContext(AuthContext);
  const { showToast } = useToast();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); 
  const [loading, setLoading] = useState(false);

  // 🔥 Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({});

  const showAlert = (title, message, type = 'warning') => {
      setAlertConfig({
          title, message, type,
          confirmText: "حسناً",
          cancelText: "", // Hide cancel
          onConfirm: () => setAlertVisible(false)
      });
      setAlertVisible(true);
  };

  const handleSignup = async () => {
    // 1. Basic Empty Check
    if (!name || !email || !password || !confirmPassword) {
      showToast("يرجى ملء جميع الحقول", "error");
      return;
    }

    // 2. Password Match Check
    if (password !== confirmPassword) {
        showAlert("خطأ في كلمة المرور", "كلمة المرور وتأكيد كلمة المرور غير متطابقين.");
        return;
    }

    // 3. Email Validation Logic
    const emailRegex = /^[a-zA-Z]{5,}@gmail\.com$/;
    if (!emailRegex.test(email)) {
        showAlert(
            "تنسيق البريد غير صحيح",
            "يجب أن يكون البريد Gmail، ويتكون الاسم (قبل @) من أكثر من 4 حروف إنجليزية فقط."
        );
        return;
    }

    // 4. Password Validation Logic
    const passwordRegex = /^[a-zA-Z0-9@]{4,}$/;
    if (!passwordRegex.test(password)) {
        showAlert(
            "كلمة المرور غير صالحة",
            "كلمة المرور يجب أن تكون 4 خانات على الأقل، وتحتوي فقط على حروف إنجليزية، أرقام، أو رمز @."
        );
        return;
    }

    setLoading(true);
    try {
        const res = await api.post('/auth/signup', { name, email, password });
        if (res.data.token) {
            login(res.data.token);
            showToast("تم إنشاء الحساب بنجاح", "success");
        }
    } catch (error) {
        const msg = error.response?.data?.message || "فشل إنشاء الحساب";
        showAlert("خطأ", msg, "danger");
    } finally {
        setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* 🔥 Custom Alert Component */}
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
        blurRadius={10}
        contentFit="cover"
      >
          <LinearGradient colors={['rgba(0,0,0,0.3)', '#000000']} style={StyleSheet.absoluteFill} />
          
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"} 
            style={{flex: 1}}
          >
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                <View style={styles.logoContainer}>
                    <View style={styles.logoWrapper}>
                        <Image 
                            source={require('../../assets/adaptive-icon.png')} 
                            style={styles.logo} 
                            contentFit="contain"
                        />
                    </View>
                    <Text style={styles.appName}>حساب جديد</Text>
                    <Text style={styles.appSlogan}>انضم إلى عالم قمر الروايات</Text>
                </View>

                {/* Glass Form Container */}
                <View style={styles.glassContainer}>
                    <Text style={styles.formTitle}>بيانات التسجيل</Text>
                    
                    <View style={styles.inputGroup}>
                        {/* الاسم */}
                        <View style={styles.inputWrapper}>
                            <TextInput 
                                style={styles.input}
                                placeholder="الاسم الكامل"
                                placeholderTextColor="#ccc"
                                value={name}
                                onChangeText={setName}
                                textAlign="right"
                            />
                            <Ionicons name="person-outline" size={20} color="#ccc" style={styles.inputIcon} />
                        </View>

                        {/* البريد */}
                        <View style={styles.inputWrapper}>
                            <TextInput 
                                style={styles.input}
                                placeholder="البريد (أكثر من 4 حروف إنجليزية @gmail.com)"
                                placeholderTextColor="#ccc"
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
                            <Ionicons name="mail-outline" size={20} color="#ccc" style={styles.inputIcon} />
                        </View>
                        
                        {/* كلمة المرور */}
                        <View style={styles.inputWrapper}>
                            <TextInput 
                                style={styles.input}
                                placeholder="كلمة المرور (4+ حروف، أرقام، @)"
                                placeholderTextColor="#ccc"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry
                            />
                            <Ionicons name="lock-closed-outline" size={20} color="#ccc" style={styles.inputIcon} />
                        </View>

                        {/* تأكيد كلمة المرور */}
                        <View style={styles.inputWrapper}>
                            <TextInput 
                                style={styles.input}
                                placeholder="تأكيد كلمة المرور"
                                placeholderTextColor="#ccc"
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                secureTextEntry
                            />
                            <Ionicons name="lock-closed-outline" size={20} color="#ccc" style={styles.inputIcon} />
                        </View>
                    </View>

                    {/* زر إنشاء الحساب */}
                    <TouchableOpacity 
                        style={styles.signupBtn} 
                        onPress={handleSignup}
                        disabled={loading}
                    >
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.signupBtnText}>إنشاء الحساب</Text>}
                    </TouchableOpacity>

                    <View style={styles.divider}>
                        <View style={styles.line} />
                    </View>

                    <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                        <Text style={styles.loginLink}>لديك حساب بالفعل؟ تسجيل الدخول</Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>
          </KeyboardAvoidingView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  bgImage: {
      flex: 1,
      width: '100%',
      height: '100%'
  },
  scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: 20,
      paddingTop: 60
  },
  logoContainer: {
      alignItems: 'center',
      marginBottom: 30
  },
  logoWrapper: {
      width: 100,
      height: 100,
      borderRadius: 30,
      backgroundColor: 'rgba(255,255,255,0.1)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 15,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      overflow: 'hidden',
      shadowColor: "#fff",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
      elevation: 5
  },
  logo: {
      width: '100%',
      height: '100%',
  },
  appName: {
      fontSize: 28,
      fontWeight: 'bold',
      color: '#fff',
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowOffset: {width: 0, height: 2},
      textShadowRadius: 10,
      marginBottom: 5
  },
  appSlogan: {
      fontSize: 14,
      color: '#ccc',
      letterSpacing: 1
  },
  glassContainer: {
      backgroundColor: 'rgba(20, 20, 20, 0.75)',
      borderRadius: 24,
      padding: 25,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      width: '100%',
      maxWidth: 400,
      alignSelf: 'center',
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.5,
      shadowRadius: 20,
      elevation: 10
  },
  formTitle: {
      color: '#fff',
      fontSize: 20,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 25
  },
  inputGroup: {
      gap: 15,
      marginBottom: 25
  },
  inputWrapper: {
      flexDirection: 'row', 
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.4)',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      height: 55,
      paddingHorizontal: 15
  },
  inputIcon: {
      marginLeft: 10
  },
  input: {
      flex: 1,
      color: '#fff',
      fontSize: 14,
      textAlign: 'right', // Arabic Input
      height: '100%'
  },
  signupBtn: {
      backgroundColor: 'rgba(74, 124, 199, 0.3)', 
      height: 55,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
      borderWidth: 1,
      borderColor: '#4a7cc7', 
      shadowColor: "#4a7cc7",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.3,
      shadowRadius: 5,
      elevation: 5
  },
  signupBtnText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 18,
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowOffset: {width: 0, height: 1},
      textShadowRadius: 2
  },
  divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20
  },
  line: {
      flex: 1,
      height: 1,
      backgroundColor: 'rgba(255,255,255,0.1)'
  },
  loginLink: {
      color: '#ccc',
      textAlign: 'center',
      fontSize: 14,
      fontWeight: '600'
  }
});
