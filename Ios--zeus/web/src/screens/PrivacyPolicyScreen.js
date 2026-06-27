
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PrivacyPolicyScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-forward" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>سياسة الخصوصية</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lastUpdated}>آخر تحديث: {new Date().toLocaleDateString('ar-EG')}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. مقدمة</Text>
          <Text style={styles.text}>
            مرحباً بك في تطبيق "Zeus". نحن نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية. توضح هذه السياسة كيف نجمع ونستخدم ونحمي معلوماتك عند استخدامك للتطبيق.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. البيانات التي نجمعها</Text>
          <Text style={styles.text}>
            لتقديم خدماتنا، قد نقوم بجمع المعلومات التالية:
            {'\n'}• <Text style={styles.bold}>معلومات الحساب:</Text> عند تسجيل الدخول عبر Google، نحصل على اسمك، بريدك الإلكتروني، وصورتك الشخصية.
            {'\n'}• <Text style={styles.bold}>سجل النشاط:</Text> نحتفظ بسجل للروايات التي تقرؤها، الفصول التي توقفت عندها، والمفضلة لتزامنها بين أجهزتك.
            {'\n'}• <Text style={styles.bold}>المحتوى المنشأ:</Text> التعليقات، الردود، والتقييمات التي تنشرها.
            {'\n'}• <Text style={styles.bold}>الصور:</Text> إذا قمت برفع صورة شخصية أو غلاف، سيتم تخزينها على خوادمنا.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. الصلاحيات المطلوبة</Text>
          <Text style={styles.text}>
            يطلب التطبيق الصلاحيات التالية فقط عند الحاجة:
            {'\n'}• <Text style={styles.bold}>معرض الصور (Gallery):</Text> لتمكينك من رفع صورة شخصية أو غلاف للرواية (للكتاب).
            {'\n'}• <Text style={styles.bold}>الإنترنت:</Text> للوصول إلى محتوى الروايات والمزامنة.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. خدمات الطرف الثالث</Text>
          <Text style={styles.text}>
            نستخدم خدمات موثوقة لمساعدتنا في تشغيل التطبيق:
            {'\n'}• <Text style={styles.bold}>Google Auth:</Text> لإدارة عملية تسجيل الدخول.
            {'\n'}• <Text style={styles.bold}>Cloudinary:</Text> لتخزين ومعالجة الصور بشكل آمن.
            {'\n'}• <Text style={styles.bold}>MongoDB:</Text> قاعدة بيانات لتخزين المعلومات المشفرة.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. أمان البيانات</Text>
          <Text style={styles.text}>
            نحن نتخذ إجراءات أمنية معقولة لحماية معلوماتك من الوصول غير المصرح به أو التعديل أو الكشف أو الإتلاف. ومع ذلك، لا يوجد نقل بيانات عبر الإنترنت آمن بنسبة 100%.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. حقوق المستخدم وحذف البيانات</Text>
          <Text style={styles.text}>
            لديك الحق في:
            {'\n'}• الوصول إلى بياناتك الشخصية.
            {'\n'}• تعديل بياناتك (الاسم، الصورة، النبذة) من خلال إعدادات التطبيق.
            {'\n'}• <Text style={styles.bold}>طلب حذف الحساب:</Text> يمكنك طلب حذف حسابك وجميع بياناتك نهائياً. عند الحذف، يتم إزالة البريد، السجل، والتعليقات بشكل لا رجعة فيه.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7. اتصل بنا</Text>
          <Text style={styles.text}>
            إذا كان لديك أي أسئلة حول سياسة الخصوصية هذه، يرجى التواصل معنا عبر البريد الإلكتروني للمطور الموجود في صفحة المتجر.
          </Text>
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    padding: 20,
  },
  lastUpdated: {
    color: '#666',
    textAlign: 'right',
    fontSize: 12,
    marginBottom: 20,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    color: '#4a7cc7',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'right',
    marginBottom: 10,
  },
  text: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 24,
    textAlign: 'right',
  },
  bold: {
    fontWeight: 'bold',
    color: '#fff',
  }
});
