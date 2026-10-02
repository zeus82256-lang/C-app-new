import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  ImageBackground,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { useFocusEffect } from '@react-navigation/native';

// 🔹 شاشة إدارة مفاتيح ScraperAPI + كوكيز TomatoMTL + كوكيز WTR-LAB
// المفاتيح: كل مفتاح في سطر مستقل (أو مفصول بفواصل) — تُحفظ في الخادم وتُدفع
// تلقائياً لخدمة السكرابر، مع عرض حالة الرصيد لكل مفتاح.
// كوكيز TomatoMTL: جلسة حساب tomatomtl.com لسحب رواياته (الواجهة نفسها في الموقع والتطبيق)
// — الحقل الفارغ يعني استخدام الكوكيز الثابتة داخل كود السكرابر.
// كوكيز WTR-LAB: جلسة wtr-lab.com لقراءة الفصول (البيانات والفهرس مجانية بلا جلسة
// ومحتوى الفصول يحتاج جلسة لتحدي Turnstile) — الحقل الفارغ = سحب مجهول.

const EXAMPLE_KEYS = 'مثال:\n6ac34ae7f246b2588b5a5fbd45899a92\nd8f2a1c3e4b5a6978f0d2c3b4a5f6e7d\n1a2b3c4d5e6f70819a2b3c4d5e6f7081';

const MT_EXAMPLE = 'مثال (ترويسة Cookie كاملة من المتصفح):\ncf_clearance=alvbHRPkSSaWrtoOVhRFGrz8P_tbInkp…; _ga=GA1.1.1632139315.1790935815; translator_button=en; remember_6TpGq1xR_F05q3tke-JkBw=wJwdY-taHOAxK15ymm9RarLW%7E5pnIX134L0vGDX5N3ROrYxcV_4xWJFLS; PHPSESSID=t349n0dhnsm74n6mqasln6rvne';

const WTR_EXAMPLE = 'مثال (ترويسة Cookie كاملة من المتصفح):\nwtr_session=eyJhbGciOiJIUzI1NiJ9…; __cf_bm=abc123…; cf_clearance=xyz789…';

const GlassCard = ({ children, style }) => (
  <View style={[styles.glassCard, style]}>{children}</View>
);

export default function ScraperKeysScreen({ navigation }) {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [statuses, setStatuses] = useState([]);
  // 🍪 كوكيز TomatoMTL
  const [mtText, setMtText] = useState('');
  const [mtSaving, setMtSaving] = useState(false);
  const [mtChecking, setMtChecking] = useState(false);
  const [mtResult, setMtResult] = useState(null);
  // 🍪 كوكيز WTR-LAB
  const [wtrText, setWtrText] = useState('');
  const [wtrSaving, setWtrSaving] = useState(false);
  const [wtrChecking, setWtrChecking] = useState(false);
  const [wtrResult, setWtrResult] = useState(null);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/admin/scraper-keys');
      const keys = res.data?.keys || [];
      setText(keys.join('\n'));
      setMtText(res.data?.tomatomtlCookies || '');
      setWtrText(res.data?.wtrlabCookies || '');
      setMtResult(null);
      setWtrResult(null);
    } catch (e) {
      console.log('load keys failed:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadKeys();
    }, [])
  );

  const handleSave = async () => {
    const lines = text.trim();
    if (!lines) {
      showToast('الصق مفتاحاً واحداً على الأقل', 'error');
      return;
    }
    setSaving(true);
    try {
      // نرسل النص كما هو — الخادم يفصل الأسطر والفواصل وينظف التكرار
      const res = await api.post('/api/admin/scraper-keys', { keys: lines });
      const data = res.data || {};
      setStatuses(data.statuses || []);
      const okKeys = (data.statuses || []).filter(s => s.valid && s.creditsLeft > 0).length;
      showToast(`تم حفظ ${data.saved} مفتاح (${okKeys} جاهز) — أُرسلت للسكرابر`, 'success');
    } catch (e) {
      showToast(e.response?.data?.error || 'فشل الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    try {
      const res = await api.get('/api/admin/scraper-keys/check');
      setStatuses(res.data?.statuses || []);
      showToast('تم تحديث حالة الأرصدة', 'info');
    } catch (e) {
      showToast('فشل فحص الأرصدة', 'error');
    } finally {
      setChecking(false);
    }
  };

  // 🍪 حفظ كوكيز TomatoMTL (فارغ = إعادة للثابتة بالكود)
  const handleSaveCookies = async () => {
    setMtSaving(true);
    try {
      const res = await api.post('/api/admin/scraper-keys', { tomatomtlCookies: mtText.trim() });
      const t = res.data?.tomatomtl;
      showToast(t?.cleared ? 'فُرِّغت الكوكيز — يعود السكرابر للثابتة بالكود' : 'حُفظت الكوكيز وأُرسلت للسكرابر', 'success');
    } catch (e) {
      showToast(e.response?.data?.error || 'فشل حفظ الكوكيز', 'error');
    } finally {
      setMtSaving(false);
    }
  };

  // 🍪 فحص حي: هل جلسة الحساب تعمل فعلاً من السكرابر؟
  const handleCheckSession = async () => {
    setMtChecking(true);
    setMtResult(null);
    try {
      const res = await api.post('/api/admin/scraper-keys/check-tomatomtl', {});
      setMtResult(res.data || { ok: false, message: 'رد غير متوقع' });
    } catch (e) {
      setMtResult({ ok: false, message: e.response?.data?.message || 'فشل الفحص' });
    } finally {
      setMtChecking(false);
    }
  };

  // 🍪 حفظ كوكيز WTR-LAB (فارغ = تصفير — سحب مجهول للبيانات والفهرس)
  const handleSaveWtrCookies = async () => {
    setWtrSaving(true);
    try {
      const res = await api.post('/api/admin/scraper-keys', { wtrlabCookies: wtrText.trim() });
      const t = res.data?.wtrlab;
      showToast(t?.cleared ? 'فُرِّغت الكوكيز — البيانات والفهرس تبقى مجانية والفصول مجهولة' : 'حُفظت الكوكيز وأُرسلت للسكرابر', 'success');
    } catch (e) {
      showToast(e.response?.data?.error || 'فشل حفظ الكوكيز', 'error');
    } finally {
      setWtrSaving(false);
    }
  };

  // 🍪 فحص حي: هل قراءة WTR-LAB تعمل فعلاً من السكرابر؟
  const handleCheckWtrSession = async () => {
    setWtrChecking(true);
    setWtrResult(null);
    try {
      const res = await api.post('/api/admin/scraper-keys/check-wtrlab', {});
      setWtrResult(res.data || { ok: false, message: 'رد غير متوقع' });
    } catch (e) {
      setWtrResult({ ok: false, message: e.response?.data?.message || 'فشل الفحص' });
    } finally {
      setWtrChecking(false);
    }
  };

  const renderStatus = ({ item, index }) => {
    const pct = (item.valid && item.requestLimit > 0)
      ? Math.max(0, Math.min(1, item.creditsLeft / item.requestLimit))
      : 0;
    const barColor = !item.valid ? '#ff4444' : item.creditsLeft === 0 ? '#f59e0b' : pct > 0.5 ? '#4ade80' : '#f59e0b';
    return (
      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Ionicons
            name={item.valid ? (item.creditsLeft === 0 ? 'time-outline' : 'checkmark-circle') : 'alert-circle'}
            size={16}
            color={barColor}
          />
          <Text style={styles.statusKey}>{index + 1}. {item.key}</Text>
          <Text style={[styles.statusNote, { color: barColor }]}>{item.note}</Text>
        </View>
        {item.valid && item.requestLimit > 0 && (
          <View style={styles.barWrap}>
            <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: barColor }]} />
          </View>
        )}
        {item.valid && item.requestLimit > 0 && (
          <Text style={styles.statusMeta}>
            الرصيد: {item.creditsLeft} / {item.requestLimit} طلب
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ImageBackground source={require('../../assets/adaptive-icon.png')} style={styles.bgImage} blurRadius={20}>
        <LinearGradient colors={['rgba(0,0,0,0.6)', '#000000']} style={StyleSheet.absoluteFill} />
      </ImageBackground>

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Ionicons name="arrow-forward" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>مفاتيح ScraperAPI</Text>
          <TouchableOpacity onPress={handleCheck} style={styles.iconBtn} disabled={checking}>
            {checking ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="refresh" size={22} color="#fff" />}
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#8b5cf6" />
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* شرح */}
            <GlassCard style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="key" size={18} color="#8b5cf6" />
                <Text style={styles.infoTitle}>كيف تعمل المفاتيح؟</Text>
              </View>
              <Text style={styles.infoText}>
                ضع كل مفتاح في سطر مستقل (مفتاح واحد لكل حساب مجاني = 5000 رصيد شهرياً).{'\n'}
                السكرابر يدور بين المفاتيح تلقائياً ويتخطى المستهلك — المفاتيح الأكثر = سحب أكبر للمواقع المحمية مثل ScribbleHub وFreeWebNovel.{'\n\n'}
                يمكنك أيضاً ضبطها عبر متغير البيئة في Railway (مفصولة بفواصل فقط):
              </Text>
              <View style={styles.envBox}>
                <Text style={styles.envText}>
                  SCRAPERAPI_KEYS=6ac34ae7f246b2588b5a5fbd45899a92,d8f2a1c3e4b5a6978f0d2c3b4a5f6e7d
                </Text>
              </View>
            </GlassCard>

            {/* حقل المفاتيح */}
            <GlassCard style={styles.inputCard}>
              <Text style={styles.inputLabel}>المفاتيح (كل مفتاح في سطر):</Text>
              <TextInput
                style={styles.input}
                multiline
                textAlignVertical="top"
                placeholder={EXAMPLE_KEYS}
                placeholderTextColor="#555"
                value={text}
                onChangeText={setText}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="ascii-capable"
              />
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.disabledBtn]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={18} color="#fff" />
                    <Text style={styles.saveBtnText}>حفظ وإرسال للسكرابر</Text>
                  </>
                )}
              </TouchableOpacity>
            </GlassCard>

            {/* حالة المفاتيح */}
            {statuses.length > 0 && (
              <View style={{ marginBottom: 30 }}>
                <Text style={styles.sectionTitle}>حالة الأرصدة:</Text>
                {statuses.map((s, i) => renderStatus({ item: s, index: i }))}
              </View>
            )}

            {/* 🍪 كوكيز TomatoMTL — نفس واجهة الموقع تماماً */}
            <GlassCard style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="nutrition" size={18} color="#ff6b6b" />
                <Text style={styles.infoTitle}>كوكيز TomatoMTL — حساب القراءة</Text>
              </View>
              <Text style={styles.infoText}>
                موقع TomatoMTL يتطلب حساباً لقراءة الفصول — السكرابر يستخدم كوكيز حسابك للمسح. المهم بين الكوكيز ثلاثة فقط والبقية (إعلانات/تحليلات) تُتجاهل تلقائياً:{'\n'}
                1) remember_... = «تذكرني» يصلح ≈ 5 سنوات — هو الموضوع ثابتاً في كود السكرابر.{'\n'}
                2) PHPSESSID = جلسة قصيرة العمر (ساعات) — إن انتهى يعيد remember_ الدخول تلقائياً.{'\n'}
                3) cf_clearance = حماية Cloudflare قصيرة ومرتبطة بجهازك/IP — جدّدها من هنا متى توقفت الجلسة.{'\n\n'}
                أسهل طريقة: افتح tomatomtl.com مسجلاً الدخول ← F12 ← Network ← اضغط أي طلب ← انسخ قيمة ترويسة «cookie» كاملة والصقها هنا (كل الكوكيز معاً).{'\n'}
                ترك الحقل فارغاً + حفظ = استخدام الكوكيز الثابتة في كود السكرابر.
              </Text>
              <View style={styles.envBox}>
                <Text style={styles.envText}>{MT_EXAMPLE}</Text>
              </View>
            </GlassCard>

            <GlassCard style={styles.inputCard}>
              <Text style={styles.inputLabel}>ترويسة الكوكيز (سطر واحد):</Text>
              <TextInput
                style={styles.input}
                multiline
                textAlignVertical="top"
                placeholder={MT_EXAMPLE}
                placeholderTextColor="#555"
                value={mtText}
                onChangeText={setMtText}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="ascii-capable"
              />
              <View style={styles.mtBtnRow}>
                <TouchableOpacity
                  style={[styles.saveBtn, { flex: 1 }, mtSaving && styles.disabledBtn]}
                  onPress={handleSaveCookies}
                  disabled={mtSaving}
                >
                  {mtSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={18} color="#fff" />
                      <Text style={styles.saveBtnText}>حفظ وإرسال للسكرابر</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.checkBtn, mtChecking && styles.disabledBtn]}
                  onPress={handleCheckSession}
                  disabled={mtChecking}
                >
                  {mtChecking ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="pulse" size={18} color="#fff" />
                      <Text style={styles.saveBtnText}>فحص الجلسة</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              {mtResult && (
                <View style={[styles.mtResultBox, { borderColor: mtResult.ok ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)' }]}>
                  <Ionicons
                    name={mtResult.ok ? 'checkmark-circle' : 'alert-circle'}
                    size={18}
                    color={mtResult.ok ? '#4ade80' : '#f87171'}
                  />
                  <Text style={[styles.mtResultText, { color: mtResult.ok ? '#4ade80' : '#f87171' }]}>
                    {mtResult.message}
                  </Text>
                </View>
              )}
            </GlassCard>

            {/* 🍪 كوكيز WTR-LAB — نفس واجهة الموقع تماماً */}
            <GlassCard style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="globe-outline" size={18} color="#4ade80" />
                <Text style={styles.infoTitle}>كوكيز WTR-LAB — جلسة القراءة</Text>
              </View>
              <Text style={styles.infoText}>
                موقع WTR-LAB (wtr-lab.com): بيانات الروايات والفهارس تعمل بلا جلسة، لكن محتوى الفصول يحصّن نفسه بتحدي Turnstile — الجلسة المسجلة تتجاوزه.{'\n'}
                أسهل طريقة: افتح wtr-lab.com مسجلاً الدخول ← F12 ← Network ← اضغط أي طلب ← انسخ قيمة ترويسة «cookie» كاملة والصقها هنا.{'\n'}
                ترك الحقل فارغاً + حفظ = تصفير (سحب مجهول: البيانات والفهرس فقط).{'\n'}
                إن توقفت القراءة بتحدي تحقق فجدد الكوكيز بنفس الطريقة.
              </Text>
              <View style={styles.envBox}>
                <Text style={styles.envText}>{WTR_EXAMPLE}</Text>
              </View>
            </GlassCard>

            <GlassCard style={styles.inputCard}>
              <Text style={styles.inputLabel}>ترويسة كوكيز WTR-LAB (سطر واحد):</Text>
              <TextInput
                style={styles.input}
                multiline
                textAlignVertical="top"
                placeholder={WTR_EXAMPLE}
                placeholderTextColor="#555"
                value={wtrText}
                onChangeText={setWtrText}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="ascii-capable"
              />
              <View style={styles.mtBtnRow}>
                <TouchableOpacity
                  style={[styles.saveBtn, { flex: 1 }, wtrSaving && styles.disabledBtn]}
                  onPress={handleSaveWtrCookies}
                  disabled={wtrSaving}
                >
                  {wtrSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={18} color="#fff" />
                      <Text style={styles.saveBtnText}>حفظ وإرسال للسكرابر</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.checkBtn, wtrChecking && styles.disabledBtn]}
                  onPress={handleCheckWtrSession}
                  disabled={wtrChecking}
                >
                  {wtrChecking ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="pulse" size={18} color="#fff" />
                      <Text style={styles.saveBtnText}>فحص القراءة</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              {wtrResult && (
                <View style={[styles.mtResultBox, { borderColor: wtrResult.ok ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)' }]}>
                  <Ionicons
                    name={wtrResult.ok ? 'checkmark-circle' : 'alert-circle'}
                    size={18}
                    color={wtrResult.ok ? '#4ade80' : '#f87171'}
                  />
                  <Text style={[styles.mtResultText, { color: wtrResult.ok ? '#4ade80' : '#f87171' }]}>
                    {wtrResult.message}
                  </Text>
                </View>
              )}
            </GlassCard>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  iconBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },

  glassCard: {
    backgroundColor: 'rgba(20, 20, 20, 0.75)',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 15,
    marginBottom: 16,
  },

  infoCard: {},
  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8 },
  infoTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  infoText: { color: '#bbb', fontSize: 12, lineHeight: 20, textAlign: 'right' },
  envBox: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.35)',
    padding: 10,
    marginTop: 10,
  },
  envText: { color: '#c4b5fd', fontSize: 11, fontFamily: 'monospace' },

  inputCard: {},
  inputLabel: { color: '#ccc', fontSize: 12, marginBottom: 8, textAlign: 'right' },
  input: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    minHeight: 130,
    fontSize: 13,
    fontFamily: 'monospace',
    textAlign: 'left',
  },
  saveBtn: {
    marginTop: 12,
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  disabledBtn: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  mtBtnRow: { marginTop: 12, flexDirection: 'row', gap: 10 },
  checkBtn: {
    backgroundColor: '#374151',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  mtResultBox: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 12,
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 8,
  },
  mtResultText: { flex: 1, fontSize: 12, lineHeight: 18, textAlign: 'right' },

  sectionTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 10, textAlign: 'right' },
  statusCard: {
    backgroundColor: 'rgba(20,20,20,0.75)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 12,
    marginBottom: 10,
  },
  statusHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  statusKey: { color: '#fff', fontSize: 12, fontFamily: 'monospace', flex: 1 },
  statusNote: { fontSize: 11 },
  barWrap: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3 },
  statusMeta: { color: '#888', fontSize: 10, marginTop: 6, textAlign: 'right' },
});
