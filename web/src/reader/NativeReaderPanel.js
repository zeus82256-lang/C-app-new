// web/src/reader/NativeReaderPanel.js
// The tabbed reading-tools panel ("اللوحة") for the native (classic) reader
// structure. Mirrors the Galaxy web dock: fixed tab bar on top, scrollable
// content below, same sections — الفصل / النص / الخط / الخلفية / التلوين /
// الإعدادات / إبلاغ — with the full coloring feature (chosen delimiters).
import React, { useRef, useEffect } from 'react';
import {
  View, Text, Modal, Animated, Dimensions, ScrollView, TouchableOpacity,
  TextInput, Switch, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// same palette as the classic reader appearance view
const ADVANCED_COLORS = [
  '#ffffff', '#f97316', '#ec4899', '#a855f7', '#fbbf24', '#ef4444', '#3b82f6',
  '#4ade80', '#06b6d4', '#8b5cf6', '#f472b6', '#34d399', '#f87171', '#facc15',
  '#818cf8', '#888888', '#000000',
];
const BG_COLOR_PRESETS = [
  { color: '#0a0a0a', name: 'أسود' }, { color: '#2d2d2d', name: 'داكن' },
  { color: '#1a1a2e', name: 'كحلي' }, { color: '#1a0a0a', name: 'أحمر داكن' },
  { color: '#0a1a0a', name: 'أخضر داكن' }, { color: '#0a0a1a', name: 'أزرق داكن' },
  { color: '#ffffff', name: 'أبيض' }, { color: '#f5f0e8', name: 'بيج' },
  { color: '#e8f4f0', name: 'نعناع فاتح' }, { color: '#fdf6e3', name: 'كريمي' },
];
const QUOTE_STYLES = [
  { id: 'all', label: 'بدون', preview: 'لا شيء' },
  { id: 'guillemets', label: '« »', preview: '«نص»' },
  { id: 'curly', label: '“ ”', preview: '“نص”' },
  { id: 'straight', label: '" "', preview: '"نص"' },
  { id: 'single', label: '‘ ’', preview: '‘نص’' },
];
const REPORT_TYPES = [
  'مشكلة في عرض النص', 'فصل مكرر', 'فصل ناقص أو مبتور',
  'ترتيب الفصول', 'محتوى غير لائق', 'أخرى',
];

const TABS = [
  { id: 'book', label: 'الفصل', icon: 'book-outline' },
  { id: 'text', label: 'النص', icon: 'text-outline' },
  { id: 'font', label: 'الخط', icon: 'albums-outline' },
  { id: 'background', label: 'الخلفية', icon: 'contrast-outline' },
  { id: 'color', label: 'التلوين', icon: 'color-palette-outline' },
  { id: 'settings', label: 'الإعدادات', icon: 'settings-outline' },
  { id: 'report', label: 'إبلاغ', icon: 'warning-outline' },
];

// Lightweight slider (same feel as the classic reader's CustomSlider)
const PanelSlider = ({ value, onValueChange, minimumValue, maximumValue, step = 1, activeColor = '#4a7cc7' }) => {
  const [sliderWidth, setSliderWidth] = React.useState(0);
  const handleTouch = (evt) => {
    if (sliderWidth === 0) return;
    let percentage = evt.nativeEvent.locationX / sliderWidth;
    percentage = Math.max(0, Math.min(1, percentage));
    let newValue = minimumValue + percentage * (maximumValue - minimumValue);
    if (step) newValue = Math.round(newValue / step) * step;
    onValueChange(Math.max(minimumValue, Math.min(maximumValue, newValue)));
  };
  const percentage = ((value - minimumValue) / (maximumValue - minimumValue)) * 100;
  return (
    <View style={{ height: 40, justifyContent: 'center', flex: 1 }} onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}>
      <TouchableOpacity style={{ height: 40, justifyContent: 'center' }} onPress={handleTouch}>
        <View style={{ height: 6, backgroundColor: '#2a313c', borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${percentage}%`, backgroundColor: activeColor, borderRadius: 3 }} />
        </View>
        <View style={{
          position: 'absolute', left: `${percentage}%`, marginLeft: -10, width: 20, height: 20, borderRadius: 10,
          backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35,
          shadowRadius: 3, elevation: 5,
        }} />
      </TouchableOpacity>
    </View>
  );
};

const Card = ({ children, style, dimmed }) => (
  <View style={[panelStyles.card, dimmed && { opacity: 0.62 }, style]}>{children}</View>
);
const Label = ({ children }) => <Text style={panelStyles.sectionLabel}>{children}</Text>;
const ColorDots = ({ active, onPick }) => (
  <View style={panelStyles.dotsWrap}>
    {ADVANCED_COLORS.map((c) => (
      <TouchableOpacity key={c} style={[panelStyles.dot, { backgroundColor: c }, active === c && panelStyles.dotActive]} onPress={() => onPick(c)} />
    ))}
  </View>
);
const StyleChips = ({ active, onPick }) => (
  <View style={panelStyles.chipsWrap}>
    {QUOTE_STYLES.map((s) => (
      <TouchableOpacity key={s.id} style={[panelStyles.chip, active === s.id && panelStyles.chipActive]} onPress={() => onPick(s.id)}>
        <Text style={[panelStyles.chipText, active === s.id && { color: '#7da4e0', fontWeight: 'bold' }]}>{s.preview}</Text>
      </TouchableOpacity>
    ))}
  </View>
);
const ToggleRow = ({ label, value, onChange, accent = '#4a7cc7' }) => (
  <View style={panelStyles.toggleRow}>
    <Text style={panelStyles.toggleLabel}>{label}</Text>
    <Switch value={value} onValueChange={onChange} trackColor={{ false: '#2a313c', true: accent }} thumbColor="#fff" />
  </View>
);

// One coloring feature card (dialogue / markdown / bracket / custom)
const FormatCard = ({ title, accent, enabled, onEnabled, hasStyle, style, onStyle, color, onColor, size, onSize, hideMarks, onHideMarks, children }) => (
  <Card dimmed={!enabled}>
    <View style={panelStyles.cardHead}>
      <Text style={panelStyles.cardTitle}>{title}</Text>
      <Switch value={enabled} onValueChange={onEnabled} trackColor={{ false: '#2a313c', true: accent }} thumbColor="#fff" />
    </View>
    {enabled && (
      <>
        {hasStyle && (<><Label>نمط العلامات</Label><StyleChips active={style} onPick={onStyle} /></>)}
        {children}
        <Label>اللون</Label>
        <ColorDots active={color} onPick={onColor} />
        <View style={panelStyles.sliderRow}>
          <Text style={panelStyles.sliderBadge}>{size}%</Text>
          <PanelSlider minimumValue={80} maximumValue={150} step={5} value={size} onValueChange={onSize} activeColor={accent} />
        </View>
        <ToggleRow label="إخفاء علامات التنسيق" value={hideMarks} onChange={onHideMarks} accent={accent} />
      </>
    )}
  </Card>
);

export default function NativeReaderPanel({
  visible, onClose,
  tab, onTab,
  isAdmin,
  // book
  onNovelPage, onChapters, onWords, isFavorite, onToggleFavorite,
  // text
  fontSize, onChangeFontSize, textBrightness, onChangeBrightness,
  // font
  fontFamily, fonts, onFontChange,
  // background
  bgColor, textColor, bgColorHexInput, textColorHexInput, onBgHexChange, onTextHexChange, onBgPreset, onTextPreset,
  // coloring
  fmt, onSaveFmt,
  // settings
  continuousMode, onChangeContinuous, enableSeparator, onChangeSeparator, separatorText, onChangeSeparatorText,
  keepAwake, onChangeKeepAwake, onOpenCleaner, onOpenCopyright,
  // report
  reportSelected, onToggleReportType, reportDetails, onChangeReportDetails, onSubmitReport,
}) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      slideAnim.setValue(SCREEN_HEIGHT);
      fadeAnim.setValue(0);
    }
  }, [visible, slideAnim, fadeAnim]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={panelStyles.overlay}>
        <Animated.View style={[panelStyles.backdrop, { opacity: fadeAnim }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[panelStyles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={panelStyles.handle} />
          <View style={panelStyles.header}>
            <Text style={panelStyles.headerTitle}>أدوات القراءة</Text>
            <TouchableOpacity onPress={onClose} style={panelStyles.closeBtn}>
              <Ionicons name="close" size={22} color="#98a2b3" />
            </TouchableOpacity>
          </View>

          {/* FIXED tab bar — content scrolls under it, tabs never move */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={panelStyles.tabsWrap}>
            {TABS.map((t) => (
              <TouchableOpacity key={t.id} style={[panelStyles.tab, tab === t.id && panelStyles.tabActive]} onPress={() => onTab(t.id)}>
                <Ionicons name={t.icon} size={15} color={tab === t.id ? '#fff' : '#8a94a6'} />
                <Text style={[panelStyles.tabText, tab === t.id && panelStyles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={panelStyles.content}>
            {tab === 'book' && (
              <View style={panelStyles.grid2}>
                <TouchableOpacity style={panelStyles.actionCard} onPress={onNovelPage}>
                  <View style={[panelStyles.actionIcon, { backgroundColor: '#173324' }]}><Ionicons name="book-outline" size={22} color="#4ade80" /></View>
                  <Text style={panelStyles.actionTitle}>صفحة الرواية</Text>
                  <Text style={panelStyles.actionSub}>العودة إلى الرواية</Text>
                </TouchableOpacity>
                <TouchableOpacity style={panelStyles.actionCard} onPress={onChapters}>
                  <View style={[panelStyles.actionIcon, { backgroundColor: '#1b2a41' }]}><Ionicons name="list" size={22} color="#7da4e0" /></View>
                  <Text style={panelStyles.actionTitle}>قائمة الفصول</Text>
                  <Text style={panelStyles.actionSub}>تنقّل بين الفصول</Text>
                </TouchableOpacity>
                <TouchableOpacity style={panelStyles.actionCard} onPress={onWords}>
                  <View style={[panelStyles.actionIcon, { backgroundColor: '#241b33' }]}><Ionicons name="swap-horizontal-outline" size={22} color="#b79af0" /></View>
                  <Text style={panelStyles.actionTitle}>استبدال الكلمات</Text>
                  <Text style={panelStyles.actionSub}>تغيير كلمات داخل الفصل</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[panelStyles.actionCard, isFavorite && { borderColor: '#e05570' }]} onPress={onToggleFavorite}>
                  <View style={[panelStyles.actionIcon, { backgroundColor: isFavorite ? '#3a1720' : '#331b22' }]}>
                    <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={22} color={isFavorite ? '#ff6b81' : '#e08a99'} />
                  </View>
                  <Text style={panelStyles.actionTitle}>{isFavorite ? 'في المفضلة' : 'المفضلة'}</Text>
                  <Text style={panelStyles.actionSub}>{isFavorite ? 'اضغط للإزالة' : 'أضف إلى المفضلة'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {tab === 'text' && (
              <>
                <Card>
                  <Label>حجم الخط</Label>
                  <View style={panelStyles.stepperRow}>
                    <TouchableOpacity style={panelStyles.stepBtn} onPress={() => onChangeFontSize(-2)}>
                      <Ionicons name="remove" size={20} color="#fff" />
                    </TouchableOpacity>
                    <Text style={panelStyles.stepValue}>{fontSize}</Text>
                    <TouchableOpacity style={panelStyles.stepBtn} onPress={() => onChangeFontSize(2)}>
                      <Ionicons name="add" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </Card>
                <Card>
                  <Label>سطوع النص</Label>
                  <View style={panelStyles.sliderRow}>
                    <Text style={panelStyles.sliderBadge}>{Math.round(textBrightness * 100)}%</Text>
                    <PanelSlider minimumValue={0.3} maximumValue={1.5} step={0.05} value={textBrightness} onValueChange={onChangeBrightness} />
                  </View>
                  <Text style={panelStyles.hint}>اخفض النسبة لتعتيم النص وارفعها لزيادة سطوعه.</Text>
                </Card>
              </>
            )}

            {tab === 'font' && (
              <Card>
                <Label>نوع الخط</Label>
                <View style={panelStyles.pillsWrap}>
                  {fonts.map((font) => (
                    <TouchableOpacity key={font.id} style={[panelStyles.fontPill, fontFamily.id === font.id && panelStyles.fontPillActive]} onPress={() => onFontChange(font)}>
                      <Text style={[panelStyles.fontPillText, fontFamily.id === font.id && panelStyles.fontPillTextActive]}>{font.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Card>
            )}

            {tab === 'background' && (
              <>
                <Card>
                  <Label>لون الخلفية</Label>
                  <View style={panelStyles.hexRow}>
                    <View style={[panelStyles.hexSwatch, { backgroundColor: bgColor }]} />
                    <TextInput style={panelStyles.hexInput} placeholder="#RRGGBB" placeholderTextColor="#556" value={bgColorHexInput} onChangeText={onBgHexChange} autoCapitalize="none" />
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={panelStyles.dotsWrap}>
                      {BG_COLOR_PRESETS.map((c) => (
                        <TouchableOpacity key={c.color} style={[panelStyles.dot, { backgroundColor: c.color }, bgColor === c.color && panelStyles.dotActive]} onPress={() => onBgPreset(c.color)} />
                      ))}
                    </View>
                  </ScrollView>
                </Card>
                <Card>
                  <Label>لون النص</Label>
                  <View style={panelStyles.hexRow}>
                    <View style={[panelStyles.hexSwatch, { backgroundColor: textColor }]} />
                    <TextInput style={panelStyles.hexInput} placeholder="#RRGGBB" placeholderTextColor="#556" value={textColorHexInput} onChangeText={onTextHexChange} autoCapitalize="none" />
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={panelStyles.dotsWrap}>
                      {ADVANCED_COLORS.map((c) => (
                        <TouchableOpacity key={c} style={[panelStyles.dot, { backgroundColor: c }, textColor === c && panelStyles.dotActive]} onPress={() => onTextPreset(c)} />
                      ))}
                    </View>
                  </ScrollView>
                </Card>
              </>
            )}

            {tab === 'color' && (
              <>
                <Text style={panelStyles.hint}>لوّن الكلمات المحصورة بين علامات تنصيص تختارها بنفسك — الحوار، العريض، الأقواس، أو علامات مخصصة بالكامل.</Text>
                <FormatCard
                  title="الحوار (علامات التنصيص)" accent="#4ade80" enabled={fmt.enableDialogue}
                  onEnabled={(v) => onSaveFmt({ enableDialogue: v })}
                  hasStyle style={fmt.selectedQuoteStyle} onStyle={(v) => onSaveFmt({ selectedQuoteStyle: v })}
                  color={fmt.dialogueColor} onColor={(v) => onSaveFmt({ dialogueColor: v })}
                  size={fmt.dialogueSize} onSize={(v) => onSaveFmt({ dialogueSize: v })}
                  hideMarks={fmt.hideQuotes} onHideMarks={(v) => onSaveFmt({ hideQuotes: v })}
                />
                <FormatCard
                  title="العريض (علامات **)" accent="#e0c341" enabled={fmt.enableMarkdown}
                  onEnabled={(v) => onSaveFmt({ enableMarkdown: v })}
                  hasStyle style={fmt.selectedMarkdownStyle} onStyle={(v) => onSaveFmt({ selectedMarkdownStyle: v })}
                  color={fmt.markdownColor} onColor={(v) => onSaveFmt({ markdownColor: v })}
                  size={fmt.markdownSize} onSize={(v) => onSaveFmt({ markdownSize: v })}
                  hideMarks={fmt.hideMarkdownMarks} onHideMarks={(v) => onSaveFmt({ hideMarkdownMarks: v })}
                />
                <FormatCard
                  title="الأقواس [ ]" accent="#7da4e0" enabled={fmt.enableBracket}
                  onEnabled={(v) => onSaveFmt({ enableBracket: v })}
                  hasStyle style={fmt.selectedBracketStyle} onStyle={(v) => onSaveFmt({ selectedBracketStyle: v })}
                  color={fmt.bracketColor} onColor={(v) => onSaveFmt({ bracketColor: v })}
                  size={fmt.bracketSize} onSize={(v) => onSaveFmt({ bracketSize: v })}
                  hideMarks={fmt.hideBracketMarks} onHideMarks={(v) => onSaveFmt({ hideBracketMarks: v })}
                />
                <FormatCard
                  title="علامات مخصصة" accent="#f97316" enabled={fmt.enableCustom}
                  onEnabled={(v) => onSaveFmt({ enableCustom: v })}
                  hasStyle={false}
                  color={fmt.customColor} onColor={(v) => onSaveFmt({ customColor: v })}
                  size={fmt.customSize} onSize={(v) => onSaveFmt({ customSize: v })}
                  hideMarks={fmt.hideCustomMarks} onHideMarks={(v) => onSaveFmt({ hideCustomMarks: v })}
                >
                  <Label>علامة الفتح والإغلاق</Label>
                  <View style={panelStyles.customMarksRow}>
                    <TextInput style={[panelStyles.hexInput, { flex: 1, textAlign: 'center', fontWeight: 'bold' }]} placeholder="فتح" placeholderTextColor="#556" value={fmt.customOpenMark} onChangeText={(v) => onSaveFmt({ customOpenMark: v })} autoCapitalize="none" />
                    <Ionicons name="arrow-back" size={16} color="#5a6572" />
                    <TextInput style={[panelStyles.hexInput, { flex: 1, textAlign: 'center', fontWeight: 'bold' }]} placeholder="إغلاق" placeholderTextColor="#556" value={fmt.customCloseMark} onChangeText={(v) => onSaveFmt({ customCloseMark: v })} autoCapitalize="none" />
                  </View>
                </FormatCard>
              </>
            )}

            {tab === 'settings' && (
              <>
                <Card>
                  <ToggleRow label="التمرير المستمر" value={continuousMode} onChange={onChangeContinuous} />
                  <Text style={panelStyles.hint}>جلب الفصل التالي تلقائياً لمتابعة القراءة دون توقف.</Text>
                </Card>
                <Card>
                  <ToggleRow label="البقاء مستيقظاً" value={keepAwake} onChange={onChangeKeepAwake} accent="#4ade80" />
                  <Text style={panelStyles.hint}>يمنع إطفاء الشاشة أثناء القراءة.</Text>
                </Card>
                <Card>
                  <ToggleRow label="الخط الفاصل تحت العنوان" value={enableSeparator} onChange={onChangeSeparator} />
                  {enableSeparator && (
                    <TextInput style={[panelStyles.hexInput, { marginTop: 10 }]} placeholder="__________________" placeholderTextColor="#556" value={separatorText} onChangeText={onChangeSeparatorText} />
                  )}
                </Card>
                {isAdmin && (
                  <Card>
                    <Label>أدوات المدير</Label>
                    <View style={panelStyles.grid2}>
                      <TouchableOpacity style={[panelStyles.actionCard, { borderColor: '#b91c1c' }]} onPress={onOpenCleaner}>
                        <View style={[panelStyles.actionIcon, { backgroundColor: '#3a1212' }]}><Ionicons name="trash-outline" size={20} color="#ff6b6b" /></View>
                        <Text style={[panelStyles.actionTitle, { color: '#ff6b6b' }]}>الحذف الشامل</Text>
                        <Text style={panelStyles.actionSub}>حذف نصوص من السيرفر</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[panelStyles.actionCard, { borderColor: '#1e3a5f' }]} onPress={onOpenCopyright}>
                        <View style={[panelStyles.actionIcon, { backgroundColor: '#12233a' }]}><Ionicons name="information-circle-outline" size={20} color="#7da4e0" /></View>
                        <Text style={panelStyles.actionTitle}>حقوق التطبيق</Text>
                        <Text style={panelStyles.actionSub}>نص بداية ونهاية الفصل</Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                )}
              </>
            )}

            {tab === 'report' && (
              <>
                <Card>
                  <Text style={panelStyles.cardTitle}>ما المشكلة في هذا الفصل؟</Text>
                  <Text style={panelStyles.hint}>اختر نوع المشكلة ثم أضف تفاصيل إن أردت.</Text>
                  <View style={panelStyles.reportTypes}>
                    {REPORT_TYPES.map((t) => {
                      const on = reportSelected.indexOf(t) !== -1;
                      return (
                        <TouchableOpacity key={t} style={[panelStyles.reportType, on && panelStyles.reportTypeActive]} onPress={() => onToggleReportType(t)}>
                          <Text style={[panelStyles.reportTypeText, on && { color: '#7da4e0', fontWeight: 'bold' }]}>{t}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput
                    style={[panelStyles.hexInput, { minHeight: 90, textAlignVertical: 'top', marginTop: 12 }]}
                    placeholder="اشرح المشكلة باختصار..." placeholderTextColor="#556"
                    value={reportDetails} onChangeText={onChangeReportDetails} multiline maxLength={1200}
                  />
                  <Text style={panelStyles.charCount}>{reportDetails.length}/1200</Text>
                  <TouchableOpacity
                    style={[panelStyles.submitBtn, reportSelected.length === 0 && { opacity: 0.4 }]}
                    disabled={reportSelected.length === 0}
                    onPress={onSubmitReport}
                  >
                    <Ionicons name="send" size={16} color="#000" />
                    <Text style={panelStyles.submitText}>إرسال البلاغ</Text>
                  </TouchableOpacity>
                </Card>
              </>
            )}
            <View style={{ height: 30 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const panelStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: '#101216', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: '#232933', borderBottomWidth: 0,
    height: SCREEN_HEIGHT * 0.82, paddingBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 24,
  },
  handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#2c3442', alignSelf: 'center', marginTop: 10 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { color: '#eef2f8', fontSize: 18, fontWeight: 'bold' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1a202a', alignItems: 'center', justifyContent: 'center' },
  tabsWrap: { flexDirection: 'row-reverse', gap: 7, paddingHorizontal: 14, paddingVertical: 10 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, height: 38, borderRadius: 19,
    backgroundColor: '#171c25', borderWidth: 1, borderColor: '#242b38',
  },
  tabActive: { backgroundColor: '#4a7cc7', borderColor: '#5b8bd4' },
  tabText: { color: '#8a94a6', fontSize: 13, fontWeight: 'bold' },
  tabTextActive: { color: '#fff' },
  content: { paddingHorizontal: 14, paddingTop: 4 },
  grid2: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  actionCard: {
    flexGrow: 1, flexBasis: '47%', backgroundColor: '#151a22', borderRadius: 16, borderWidth: 1, borderColor: '#232b38',
    alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8, gap: 4,
  },
  actionIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  actionTitle: { color: '#eef2f8', fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  actionSub: { color: '#77808f', fontSize: 11, textAlign: 'center' },
  card: { backgroundColor: '#151a22', borderRadius: 16, borderWidth: 1, borderColor: '#232b38', padding: 14, marginBottom: 10, gap: 8 },
  cardHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: '#eef2f8', fontSize: 15, fontWeight: 'bold' },
  sectionLabel: { color: '#8a94a6', fontSize: 12, fontWeight: 'bold', textAlign: 'right', marginTop: 2 },
  hint: { color: '#77808f', fontSize: 12, lineHeight: 19, textAlign: 'right' },
  stepperRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 22, paddingVertical: 4 },
  stepBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#222a37', alignItems: 'center', justifyContent: 'center' },
  stepValue: { color: '#fff', fontSize: 24, fontWeight: 'bold', minWidth: 44, textAlign: 'center' },
  pillsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  fontPill: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 12, backgroundColor: '#1c2330', borderWidth: 1, borderColor: '#2a3344' },
  fontPillActive: { backgroundColor: '#4a7cc7', borderColor: '#5b8bd4' },
  fontPillText: { color: '#aab3c2', fontSize: 13, fontWeight: '600' },
  fontPillTextActive: { color: '#fff', fontWeight: 'bold' },
  hexRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  hexSwatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#3a4354' },
  hexInput: {
    flex: 1, backgroundColor: '#1c2330', color: '#eef2f8', borderRadius: 12, borderWidth: 1, borderColor: '#2a3344',
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, textAlign: 'right',
  },
  dotsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 9, paddingVertical: 4 },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#2a3344' },
  dotActive: { borderColor: '#eef2f8', shadowColor: '#4a7cc7', shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  chipsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 12, backgroundColor: '#1c2330', borderWidth: 1, borderColor: '#2a3344', alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: '#12291c', borderColor: '#4ade80' },
  chipText: { color: '#aab3c2', fontSize: 12.5, fontWeight: '600' },
  toggleRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { color: '#eef2f8', fontSize: 14, fontWeight: 'bold' },
  sliderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  sliderBadge: {
    color: '#eef2f8', fontSize: 12, fontWeight: 'bold', backgroundColor: '#1c2330', borderWidth: 1,
    borderColor: '#2a3344', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, overflow: 'hidden', minWidth: 56, textAlign: 'center',
  },
  customMarksRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  reportTypes: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  reportType: { flexBasis: '47%', flexGrow: 1, minHeight: 44, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#1c2330', borderWidth: 1, borderColor: '#2a3344', alignItems: 'center', justifyContent: 'center' },
  reportTypeActive: { backgroundColor: '#14263c', borderColor: '#4a7cc7' },
  reportTypeText: { color: '#aab3c2', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  charCount: { color: '#5a6572', fontSize: 11, textAlign: 'left', marginTop: 4 },
  submitBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 13, marginTop: 10 },
  submitText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
});
