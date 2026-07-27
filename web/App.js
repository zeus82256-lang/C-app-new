
import React, { useContext, useEffect, useState, useRef, createContext } from 'react';
import { NavigationContainer, DarkTheme, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'; // استيراد التبويبات
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { 
  View, 
  ActivityIndicator, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Dimensions, 
  Animated, 
  ImageBackground,
  PanResponder,
  TouchableWithoutFeedback,
  ScrollView
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';

import { AuthProvider, AuthContext } from './src/context/AuthContext';
import { ToastProvider } from './src/context/ToastContext';

import HomeScreen from './src/screens/HomeScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import NovelDetailScreen from './src/screens/NovelDetailScreen';
import ReaderScreen from './src/screens/ReaderScreen';
import CategoryScreen from './src/screens/CategoryScreen';
import SearchScreen from './src/screens/SearchScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen'; 
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import ManagementScreen from './src/screens/ManagementScreen'; 
import UsersManagementScreen from './src/screens/UsersManagementScreen'; 
import AdminMainScreen from './src/screens/AdminMainScreen';
import BulkUploadScreen from './src/screens/BulkUploadScreen';
import AutoImportScreen from './src/screens/AutoImportScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';

// New Screens
import SettingsScreen from './src/screens/SettingsScreen';
import ContactUsScreen from './src/screens/ContactUsScreen';
import AboutAppScreen from './src/screens/AboutAppScreen';
import DownloadsScreen from './src/screens/DownloadsScreen'; // 🔥 IMPORTED

import ChapterTitleFixerScreen from './src/screens/ChapterTitleFixerScreen'; // Hub
import ChapterTitleFixerSelectionScreen from './src/screens/ChapterTitleFixerSelectionScreen'; // New Selection Screen

import TranslatorHubScreen from './src/screens/TranslatorHubScreen';
import EnglishNovelsSelectionScreen from './src/screens/EnglishNovelsSelectionScreen';
import TranslationJobDetailScreen from './src/screens/TranslationJobDetailScreen';
import GlossaryManagerScreen from './src/screens/GlossaryManagerScreen';
import TranslatorSettingsScreen from './src/screens/TranslatorSettingsScreen';

// 🔥 Title Generator Screens
import TitleGeneratorHubScreen from './src/screens/TitleGeneratorHubScreen';
import TitleGeneratorSelectionScreen from './src/screens/TitleGeneratorSelectionScreen';
import TitleGeneratorDetailScreen from './src/screens/TitleGeneratorDetailScreen';
import TitleGeneratorSettingsScreen from './src/screens/TitleGeneratorSettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator(); // إنشاء التبويبات المخفية
const { width, height } = Dimensions.get('window');
const DRAWER_WIDTH = width * 0.75;

export const DrawerContext = createContext();

// ... (Rest of Drawer Logic unchanged) ...
const CustomSideDrawer = ({ isOpen, onClose, navigation }) => {
  const { userInfo } = useContext(AuthContext);
  const slideAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // ⚡ تسريع الأنيميشن (200ms بدلاً من 300ms)
    const animDuration = 200; 
    if (isOpen) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: animDuration, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: animDuration, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: DRAWER_WIDTH, duration: animDuration, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0, duration: animDuration, useNativeDriver: true }),
      ]).start();
    }
  }, [isOpen]);

  if (!isOpen && slideAnim._value === DRAWER_WIDTH) return null;

  const navigateTo = (screen) => {
    onClose();
    // التنقل هنا سيذهب للتبويب المفتوح مسبقاً دون إعادة تحميل
    setTimeout(() => navigation.navigate(screen), 50); 
  };

  // ✅ استخدام بنر المستخدم كخلفية للقسم العلوي
  const userBanner = userInfo?.banner ? { uri: userInfo.banner } : require('./assets/banner.png');

  return (
    <View style={[styles.drawerOverlay, !isOpen && { pointerEvents: 'none' }]}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.drawerContainer, { transform: [{ translateX: slideAnim }] }]}>
        {/* خلفية زجاجية داكنة للقائمة بالكامل */}
        <LinearGradient colors={['#0a0a0a', '#000']} style={StyleSheet.absoluteFill} />
            
        <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false}>
            {/* ✅ القسم العلوي: البنر + المعلومات (الآن داخل ScrollView ليتحرك) */}
            <View style={styles.drawerHeaderContainer}>
                <ImageBackground 
                    source={userBanner} 
                    style={styles.headerBackground}
                    contentFit="cover"
                >
                    <LinearGradient colors={['rgba(0,0,0,0.3)', '#0a0a0a']} style={StyleSheet.absoluteFill} />
                    
                    <View style={styles.profileSection}>
                        <TouchableOpacity onPress={() => navigateTo('Profile')} activeOpacity={0.9} style={styles.avatarWrapper}>
                            <Image 
                                source={userInfo?.picture ? { uri: userInfo.picture } : require('./assets/adaptive-icon.png')} 
                                style={styles.avatar} 
                                contentFit="cover"
                            />
                        </TouchableOpacity>
                        <View style={styles.userInfoText}>
                            <Text style={styles.username}>{userInfo?.name || 'زائر'}</Text>
                            <Text style={styles.email}>{userInfo?.email || 'تسجيل الدخول'}</Text>
                        </View>
                    </View>
                </ImageBackground>
            </View>

            <View style={styles.divider} />

            {/* ✅ القسم الأول: التنقل الأساسي */}
            <View style={styles.drawerItems}>
                <TouchableOpacity style={styles.drawerItem} onPress={() => navigateTo('Home')}>
                    <Ionicons name="home-outline" size={24} color="#fff" />
                    <Text style={styles.drawerLabel}>الرئيسية</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.drawerItem} onPress={() => navigateTo('Library')}>
                    <Ionicons name="library-outline" size={24} color="#fff" />
                    <Text style={styles.drawerLabel}>المكتبة</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.drawerItem} onPress={() => navigateTo('Profile')}>
                    <Ionicons name="person-outline" size={24} color="#fff" />
                    <Text style={styles.drawerLabel}>صفحتي</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {/* ✅ القسم الثاني: التنزيلات و الإعدادات */}
            <View style={styles.drawerItems}>
                <TouchableOpacity style={styles.drawerItem} onPress={() => navigateTo('Downloads')}>
                    <Ionicons name="cloud-download-outline" size={24} color="#fff" />
                    <Text style={styles.drawerLabel}>التنزيلات</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.drawerItem} onPress={() => navigateTo('Settings')}>
                    <Ionicons name="settings-outline" size={24} color="#fff" />
                    <Text style={styles.drawerLabel}>الإعدادات</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {/* ✅ القسم الثالث: معلومات */}
            <View style={styles.drawerItems}>
                <TouchableOpacity style={styles.drawerItem} onPress={() => navigateTo('PrivacyPolicy')}>
                    <Ionicons name="shield-checkmark-outline" size={24} color="#fff" />
                    <Text style={styles.drawerLabel}>سياسة الخصوصية</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.drawerItem} onPress={() => navigateTo('ContactUs')}>
                    <Ionicons name="mail-outline" size={24} color="#fff" />
                    <Text style={styles.drawerLabel}>تواصل معنا</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.drawerItem} onPress={() => navigateTo('AboutApp')}>
                    <Ionicons name="information-circle-outline" size={24} color="#fff" />
                    <Text style={styles.drawerLabel}>حول التطبيق</Text>
                </TouchableOpacity>
            </View>
            
            <View style={{ height: 40 }} />
        </ScrollView>

        <View style={styles.drawerFooter}>
            <Text style={styles.versionText}>Zeus App v1.0</Text>
        </View>

      </Animated.View>
    </View>
  );
};

// ... (MainTabs and MainLayout unchanged) ...

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' }, // 🛑 إخفاء الشريط السفلي تماماً
        lazy: false, // تحميل الصفحات لتبقى في الذاكرة (اختياري، يفضل false للأداء السريع عند التنقل)
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function MainLayout({ children }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const navigation = useNavigation();

  // سحب سريع (Fast Swipe)
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return gestureState.moveX > width - 40 && gestureState.dx < -10;
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx < -30) { // حساسية أعلى للسحب
          setIsDrawerOpen(true);
        }
      },
    })
  ).current;

  return (
    <DrawerContext.Provider value={{ isDrawerOpen, openDrawer: () => setIsDrawerOpen(true), closeDrawer: () => setIsDrawerOpen(false) }}>
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        {children}
        <CustomSideDrawer 
            isOpen={isDrawerOpen} 
            onClose={() => setIsDrawerOpen(false)} 
            navigation={navigation} 
        />
      </View>
    </DrawerContext.Provider>
  );
}

function NavigationRoot() {
  const { userToken, login, loading } = useContext(AuthContext);

  useEffect(() => {
    const handleDeepLink = (event) => {
      let data = Linking.parse(event.url);
      if (data.path === 'auth' && data.queryParams?.token) {
        login(data.queryParams.token);
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);
    
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => subscription.remove();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#4a7cc7" />
      </View>
    );
  }

  const appTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: '#4a7cc7',
      background: '#0a0a0a',
      card: '#0f0f0f',
      text: '#fff',
      border: '#2a2a2a',
      notification: '#ff4444',
    },
  };

  return (
    <NavigationContainer theme={appTheme} linking={{ prefixes: [Linking.createURL('/')] }}>
      {userToken ? (
        <MainLayout>
            <Stack.Navigator
                screenOptions={{
                    headerShown: false,
                    animation: 'slide_from_right',
                    contentStyle: { backgroundColor: '#0a0a0a' },
                }}
            >
                <Stack.Screen name="MainTabs" component={MainTabs} />
                <Stack.Screen name="NovelDetail" component={NovelDetailScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="Reader" component={ReaderScreen} options={{ animation: 'fade' }} />
                <Stack.Screen name="Category" component={CategoryScreen} />
                <Stack.Screen name="Search" component={SearchScreen} />
                <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="Downloads" component={DownloadsScreen} options={{ animation: 'slide_from_bottom' }} /> 
                <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="ContactUs" component={ContactUsScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="AboutApp" component={AboutAppScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="Management" component={ManagementScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="UsersManagement" component={UsersManagementScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="AdminMain" component={AdminMainScreen} options={{ animation: 'fade_from_bottom' }} />
                <Stack.Screen name="BulkUpload" component={BulkUploadScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="AutoImport" component={AutoImportScreen} options={{ animation: 'slide_from_bottom' }} /> 
                
                {/* Updated Title Fixer Route */}
                <Stack.Screen name="ChapterTitleFixer" component={ChapterTitleFixerScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="ChapterTitleFixerSelection" component={ChapterTitleFixerSelectionScreen} options={{ animation: 'slide_from_bottom' }} />
                
                {/* Translator Screens */}
                <Stack.Screen name="TranslatorHub" component={TranslatorHubScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="EnglishNovelsSelection" component={EnglishNovelsSelectionScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="TranslationJobDetail" component={TranslationJobDetailScreen} options={{ animation: 'fade_from_bottom' }} />
                <Stack.Screen name="GlossaryManager" component={GlossaryManagerScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="TranslatorSettings" component={TranslatorSettingsScreen} options={{ animation: 'slide_from_right' }} />
                
                {/* Title Generator Screens */}
                <Stack.Screen name="TitleGeneratorHub" component={TitleGeneratorHubScreen} options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="TitleGeneratorSelection" component={TitleGeneratorSelectionScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="TitleGeneratorDetail" component={TitleGeneratorDetailScreen} options={{ animation: 'fade_from_bottom' }} />
                <Stack.Screen name="TitleGeneratorSettings" component={TitleGeneratorSettingsScreen} options={{ animation: 'slide_from_right' }} />

                <Stack.Screen name="UserProfile" component={ProfileScreen} options={{ animation: 'slide_from_right' }} />
            </Stack.Navigator>
        </MainLayout>
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <>
      <StatusBar style="light" backgroundColor="transparent" translucent />
      <ToastProvider>
        <AuthProvider>
          <NavigationRoot />
        </AuthProvider>
      </ToastProvider>
    </>
  );
}

const styles = StyleSheet.create({
    drawerOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 9999,
        flexDirection: 'row',
    },
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)', // تعتيم أخف قليلاً
    },
    drawerContainer: {
        width: DRAWER_WIDTH,
        height: '100%',
        backgroundColor: '#000',
        shadowColor: "#000",
        shadowOffset: { width: -10, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: 20,
        elevation: 25,
        borderLeftWidth: 1,
        borderLeftColor: 'rgba(255,255,255,0.1)'
    },
    drawerHeaderContainer: {
        height: 220,
        width: '100%',
        position: 'relative',
    },
    headerBackground: {
        width: '100%',
        height: '100%',
        justifyContent: 'flex-end',
    },
    profileSection: {
        alignItems: 'center',
        paddingBottom: 20,
        width: '100%',
    },
    avatarWrapper: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 2,
        borderColor: '#fff',
        overflow: 'hidden',
        marginBottom: 10,
        backgroundColor: '#222',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 5,
        elevation: 10
    },
    avatar: {
        width: '100%',
        height: '100%'
    },
    userInfoText: {
        alignItems: 'center'
    },
    username: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 2,
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: {width: 0, height: 1},
        textShadowRadius: 3
    },
    email: {
        color: '#ccc',
        fontSize: 12,
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: {width: 0, height: 1},
        textShadowRadius: 3
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        width: '85%',
        alignSelf: 'center',
        marginVertical: 15
    },
    drawerItems: {
        paddingHorizontal: 20,
        marginTop: 5
    },
    drawerItem: {
        flexDirection: 'row-reverse', // ✅ الأيقونة يمين، النص يسار
        alignItems: 'center',
        justifyContent: 'flex-start', // ✅ يبدأ من اليمين
        paddingVertical: 16,
        paddingHorizontal: 15,
        borderRadius: 12,
        marginBottom: 8,
        backgroundColor: 'rgba(255,255,255,0.03)', // خلفية خفيفة جداً
        gap: 15 // ✅ مسافة ثابتة بين الأيقونة والكلمة
    },
    drawerLabel: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'right', // تأكيد محاذاة النص
    },
    drawerFooter: {
        padding: 20,
        alignItems: 'center',
        opacity: 0.5,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)'
    },
    versionText: {
        color: '#666',
        fontSize: 11
    }
});
