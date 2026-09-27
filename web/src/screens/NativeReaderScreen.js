import React, { useState, useRef, useEffect, useMemo, useCallback, useContext } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Text,
  Animated,
  Modal,
  StatusBar,
  Dimensions,
  Alert,
  ScrollView,
  FlatList,
  TouchableWithoutFeedback,
  Platform,
  TextInput,
  Keyboard,
  Switch
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { incrementView } from '../services/api';
import CommentsSection from '../components/CommentsSection';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getOfflineChapterContent } from '../services/offlineStorage';
import NativeReaderPanel from '../reader/NativeReaderPanel';
import { KeepAwake } from '../reader/optionalModules';

const { width, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAWER_WIDTH = width * 0.85;
const BOTTOM_DRAWER_HEIGHT = SCREEN_HEIGHT * 0.5;

// ---------- Content helpers (encryption fully removed) ----------
// The server now serves chapter content as PLAIN TEXT. The only remaining
// decryption here is a read-only compatibility shim for OLD offline downloads
// that were saved while the app still encrypted chapter content.
const LEGACY_SECRET = "Z3uS_N0v3l_2026_S3cr3t_K3y";
const LEGACY_B64_RE = /^[A-Za-z0-9+\/=]+$/;

const legacyDecrypt = (encoded) => {
    try {
        const trimmed = (encoded || '').trim();
        if (trimmed.length < 40 || !LEGACY_B64_RE.test(trimmed)) return null;
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        let output = '';
        let i = 0;
        const str = trimmed.replace(/=+$/, '');
        while (i < str.length) {
            const a = chars.indexOf(str.charAt(i++));
            const b = chars.indexOf(str.charAt(i++));
            const c = chars.indexOf(str.charAt(i++));
            const d = chars.indexOf(str.charAt(i++));
            if (a !== -1 && b !== -1) {
                output += String.fromCharCode((a << 2) | (b >> 4));
                if (c !== -1) {
                    output += String.fromCharCode(((b & 15) << 4) | (c >> 2));
                    if (d !== -1) output += String.fromCharCode(((c & 3) << 6) | d);
                }
            }
        }
        let result = "";
        for (let j = 0; j < output.length; j++) {
            let charCode = output.charCodeAt(j);
            charCode = (charCode - 3 + 256) % 256;
            const offset = (j * 7) % 13;
            charCode = (charCode - offset + 256) % 256;
            charCode = charCode ^ LEGACY_SECRET.charCodeAt(j % LEGACY_SECRET.length);
            result += String.fromCharCode(charCode);
        }
        const decoded = decodeURIComponent(result);
        if (/[\u0600-\u06FF]/.test(decoded) || /[A-Za-z]{4,}/.test(decoded)) return decoded;
        return null;
    } catch (e) {
        return null;
    }
};

// Converts any legacy-encrypted blob to plain text; passes everything else through.
const normalizeContent = (raw) => {
    if (!raw) return "";
    const trimmed = String(raw).trim();
    if (!/[\u0600-\u06FF]/.test(trimmed) && LEGACY_B64_RE.test(trimmed) && trimmed.length > 40) {
        const legacy = legacyDecrypt(trimmed);
        if (legacy) return legacy;
    }
    return raw;
};

// Escape text for safe embedding in HTML text nodes (quotes are intentionally kept).
const escapeHtmlText = (text) => String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Safe word/phrase replacement that never corrupts neighbouring Arabic words
// (word-boundary aware, '$'-safe) — fixes "letter remnants of deleted words".
const safeReplaceAll = (content, original, replacement) => {
    try {
        if (!original) return content;
        const escaped = String(original).replace(/[.*+?${}()|[\]\\]/g, '\\$&');
        const safeRepl = String(replacement == null ? '' : replacement).replace(/\$/g, '$$$$');
        if (/^[A-Za-z0-9]/.test(original)) {
            return content.replace(new RegExp('\\b' + escaped + '\\b', 'g'), safeRepl);
        }
        try {
            const re = new RegExp('(?<![\\u0600-\\u06FF\\w])' + escaped + '(?![\\u0600-\\u06FF\\w])', 'g');
            return content.replace(re, safeRepl);
        } catch (e) {
            return content.replace(new RegExp(escaped, 'g'), safeRepl);
        }
    } catch (e) {
        return content;
    }
};

// --- CUSTOM SLIDER ---
const CustomSlider = ({ value, onValueChange, minimumValue, maximumValue, step = 1, thumbColor='#fff', activeColor='#4a7cc7' }) => {
    const [sliderWidth, setSliderWidth] = useState(0);

    const handleTouch = (evt) => {
        if (sliderWidth === 0) return;
        const locationX = evt.nativeEvent.locationX;
        let percentage = locationX / sliderWidth;
        percentage = Math.max(0, Math.min(1, percentage));
        let newValue = minimumValue + percentage * (maximumValue - minimumValue);
        if (step) {
            newValue = Math.round(newValue / step) * step;
        }
        onValueChange(newValue);
    };

    const percentage = ((value - minimumValue) / (maximumValue - minimumValue)) * 100;

    return (
        <View
            style={{ height: 40, justifyContent: 'center', flex: 1 }}
            onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
        >
            <TouchableWithoutFeedback onPress={handleTouch}>
                <View style={{height: 40, justifyContent: 'center'}}>
                    <View style={{ height: 6, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${percentage}%`, backgroundColor: activeColor }} />
                    </View>
                    <View style={{
                        position: 'absolute',
                        left: `${percentage}%`,
                        marginLeft: -10,
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: thumbColor,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.3,
                        shadowRadius: 3,
                        elevation: 5,
                        borderWidth: 1,
                        borderColor: 'rgba(0,0,0,0.1)'
                    }} />
                </View>
            </TouchableWithoutFeedback>
        </View>
    );
};

const FONT_OPTIONS = [
  { id: 'Cairo', name: 'القاهرة', family: Platform.OS === 'ios' || Platform.OS === 'web' ? "'Cairo', sans-serif" : "Cairo", url: 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap' },
  { id: 'Amiri', name: 'أميري', family: Platform.OS === 'ios' || Platform.OS === 'web' ? "'Amiri', serif" : "Amiri", url: 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap' },
  { id: 'Geeza', name: 'جيزة', family: "'Geeza Pro', 'Segoe UI', Tahoma, sans-serif", url: '' },
  { id: 'Noto', name: 'نوتو كوفي', family: Platform.OS === 'ios' || Platform.OS === 'web' ? "'Noto Kufi Arabic', sans-serif" : "NotoKufi", url: 'https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@400;700&display=swap' },
  { id: 'Arial', name: 'آريال', family: "Arial, sans-serif", url: '' },
  { id: 'Times', name: 'تايمز', family: "'Times New Roman', serif", url: '' },
];

const ADVANCED_COLORS = [
    { color: '#ffffff', name: 'white' },
    { color: '#f97316', name: 'orange' },
    { color: '#ec4899', name: 'pink' },
    { color: '#a855f7', name: 'purple' },
    { color: '#fbbf24', name: 'yellow' },
    { color: '#ef4444', name: 'red' },
    { color: '#3b82f6', name: 'blue' },
    { color: '#4ade80', name: 'green' },
    { color: '#06b6d4', name: 'cyan' },
    { color: '#8b5cf6', name: 'violet' },
    { color: '#f472b6', name: 'rose' },
    { color: '#34d399', name: 'emerald' },
    { color: '#f87171', name: 'coral' },
    { color: '#facc15', name: 'gold' },
    { color: '#818cf8', name: 'indigo' },
    { color: '#888888', name: 'gray' },
    { color: '#000000', name: 'black' },
];

// classic reader retained for the native structure (see ReaderScreen dispatcher)
export default function NativeReaderScreen({ route, navigation }) {
const { userInfo } = useContext(AuthContext);
const { showToast } = useToast();
const { novel, chapterId, isOfflineMode, availableChapters } = route.params;

const [chapter, setChapter] = useState(null);
const [loading, setLoading] = useState(true);
const [realTotalChapters, setRealTotalChapters] = useState(novel.chaptersCount || 0);
const [commentCount, setCommentCount] = useState(0);
const [authorProfile, setAuthorProfile] = useState(null);

// Settings State
const [fontSize, setFontSize] = useState(19);
const [bgColor, setBgColor] = useState('#0a0a0a');
const [textColor, setTextColor] = useState('#e0e0e0');
const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0]);
const [showMenu, setShowMenu] = useState(false);
const [showPanel, setShowPanel] = useState(false);
const [panelTab, setPanelTab] = useState('book');
const [isFavorite, setIsFavorite] = useState(false);
const [keepAwake, setKeepAwake] = useState(false);
const [reportSelected, setReportSelected] = useState([]);
const [reportDetails, setReportDetails] = useState('');
const [textBrightness, setTextBrightness] = useState(1);
const [bgColorHexInput, setBgColorHexInput] = useState('#0a0a0a');
const [textColorHexInput, setTextColorHexInput] = useState('#e0e0e0');

// --- ADVANCED FORMATTING STATE ---
const [enableDialogue, setEnableDialogue] = useState(false);
const [dialogueColor, setDialogueColor] = useState('#4ade80');
const [dialogueSize, setDialogueSize] = useState(100);
const [hideQuotes, setHideQuotes] = useState(false);
const [selectedQuoteStyle, setSelectedQuoteStyle] = useState('all');

const [enableMarkdown, setEnableMarkdown] = useState(false);
const [markdownColor, setMarkdownColor] = useState('#ffffff');
const [markdownSize, setMarkdownSize] = useState(100);
const [hideMarkdownMarks, setHideMarkdownMarks] = useState(false);
const [selectedMarkdownStyle, setSelectedMarkdownStyle] = useState('all');

// --- NEW: BRACKET FORMATTING STATE ---
const [enableBracket, setEnableBracket] = useState(false);
const [bracketColor, setBracketColor] = useState('#3b82f6');
const [bracketSize, setBracketSize] = useState(110);
const [hideBracketMarks, setHideBracketMarks] = useState(false);
const [selectedBracketStyle, setSelectedBracketStyle] = useState('all');

// --- NEW: CUSTOM FORMATTING STATE ---
const [enableCustom, setEnableCustom] = useState(false);
const [customOpenMark, setCustomOpenMark] = useState('');
const [customCloseMark, setCustomCloseMark] = useState('');
const [customColor, setCustomColor] = useState('#f97316');
const [customSize, setCustomSize] = useState(105);
const [hideCustomMarks, setHideCustomMarks] = useState(false);

// --- REPLACEMENTS STATE ---
const [folders, setFolders] = useState([]);
const [currentFolderId, setCurrentFolderId] = useState(null);
const [replacementViewMode, setReplacementViewMode] = useState('folders');
const [replaceSearch, setReplaceSearch] = useState('');
const [replaceSortDesc, setReplaceSortDesc] = useState(true);

const [newOriginal, setNewOriginal] = useState('');
const [newReplacement, setNewReplacement] = useState('');
const [editingId, setEditingId] = useState(null);

const [showFolderModal, setShowFolderModal] = useState(false);
const [newFolderName, setNewFolderName] = useState('');

const [cleanerWords, setCleanerWords] = useState([]);
const [newCleanerWord, setNewCleanerWord] = useState('');
const [cleanerEditingId, setCleanerEditingId] = useState(null);
const [cleanerOldWord, setCleanerOldWord] = useState('');
const [cleaningLoading, setCleaningLoading] = useState(false);

const [copyrightStartText, setCopyrightStartText] = useState('');
const [copyrightEndText, setCopyrightEndText] = useState('');
const [copyrightLoading, setCopyrightLoading] = useState(false);
const [copyrightStyle, setCopyrightStyle] = useState({
    color: '#888888', opacity: 1, alignment: 'center', isBold: true, fontSize: 14
});
const [hexColorInput, setHexColorInput] = useState('#888888');
const [copyrightFrequency, setCopyrightFrequency] = useState('always');
const [copyrightEveryX, setCopyrightEveryX] = useState('5');

// SEPARATOR SETTINGS
const [enableSeparator, setEnableSeparator] = useState(true);
const [separatorText, setSeparatorText] = useState('________________________________________');

// Chapters list state
const [chaptersList, setChaptersList] = useState([]);
const [loadingChapters, setLoadingChapters] = useState(false);

const [drawerMode, setDrawerMode] = useState('none');
const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
const slideAnimRight = useRef(new Animated.Value(DRAWER_WIDTH)).current;
const fadeAnim = useRef(new Animated.Value(0)).current;
const backdropAnim = useRef(new Animated.Value(0)).current;

const [showComments, setShowComments] = useState(false);

// --- CONTINUOUS SCROLL STATE ---
const [continuousMode, setContinuousMode] = useState(false);
const [extraSections, setExtraSections] = useState([]);
const [loadingNext, setLoadingNext] = useState(false);
const [endReached, setEndReached] = useState(false);
const [currentViewedChapter, setCurrentViewedChapter] = useState(parseInt(chapterId) || 1);
const [errorInfo, setErrorInfo] = useState(null);

const insets = useSafeAreaInsets();
const webViewRef = useRef(null);
const flatListRef = useRef(null);
const androidListRef = useRef(null);
const scrollSaveTimer = useRef(null);
const restoredOnceRef = useRef(false);
const pendingRestoreRef = useRef(0);
const headerYsRef = useRef({});
const loadingNextRef = useRef(false);
const autoScrollNextRef = useRef(false);

const novelId = novel._id || novel.id || novel.novelId;
const isAdmin = userInfo?.role === 'admin';

useEffect(() => {
    loadSettings();
    loadFoldersAndPrefs();
    if (!isOfflineMode) {
        fetchAuthorData();
        fetchFavoriteStatus();
        if (isAdmin) {
            fetchCleanerWords();
            fetchCopyrights();
        }
    }
}, []);

// keep the screen awake while reading (optional module — degrades gracefully)
useEffect(() => {
    if (keepAwake) KeepAwake.activateKeepAwakeAsync().catch(() => {});
    else KeepAwake.deactivateKeepAwake().catch(() => {});
}, [keepAwake]);

const fetchFavoriteStatus = async () => {
    if (isOfflineMode) return;
    try {
        const res = await api.get(`/api/novel/status/${novelId}`);
        if (res.data) setIsFavorite(!!res.data.isFavorite);
    } catch (e) {}
};

const toggleFavorite = async () => {
    if (isOfflineMode) { showToast('لا يمكن التعديل بدون إنترنت', 'warning'); return; }
    const newStatus = !isFavorite;
    setIsFavorite(newStatus);
    try {
        await api.post('/api/novel/update', {
            novelId, title: novel.title, cover: novel.cover, author: novel.author || novel.translator,
            isFavorite: newStatus
        });
        showToast(newStatus ? 'تمت الإضافة للمفضلة' : 'تم الحذف من المفضلة', newStatus ? 'success' : 'info');
    } catch (e) {
        setIsFavorite(!newStatus);
        showToast('فشلت العملية', 'error');
    }
};

const toggleReportType = (t) => {
    setReportSelected(prev => (prev.indexOf(t) !== -1 ? prev.filter(x => x !== t) : [...prev, t]));
};

const submitReport = async () => {
    if (!reportSelected.length) return;
    try {
        await api.post('/api/reports', {
            novelId,
            novelTitle: novel.title,
            chapterNumber: parseInt(chapterId) || 1,
            chapterTitle: chapter ? chapter.title : '',
            types: reportSelected.slice(),
            details: reportDetails.trim(),
        });
        showToast('تم إرسال البلاغ، شكراً لك!', 'success');
        setReportSelected([]);
        setReportDetails('');
        setShowPanel(false);
    } catch (e) {
        showToast('تعذر إرسال البلاغ الآن', 'error');
    }
};

// map of every coloring-formatting key -> its setter (used by the panel)
const FMT_SETTERS = {
    enableDialogue: setEnableDialogue, dialogueColor: setDialogueColor, dialogueSize: setDialogueSize,
    hideQuotes: setHideQuotes, selectedQuoteStyle: setSelectedQuoteStyle,
    enableMarkdown: setEnableMarkdown, markdownColor: setMarkdownColor, markdownSize: setMarkdownSize,
    hideMarkdownMarks: setHideMarkdownMarks, selectedMarkdownStyle: setSelectedMarkdownStyle,
    enableBracket: setEnableBracket, bracketColor: setBracketColor, bracketSize: setBracketSize,
    hideBracketMarks: setHideBracketMarks, selectedBracketStyle: setSelectedBracketStyle,
    enableCustom: setEnableCustom, customOpenMark: setCustomOpenMark, customCloseMark: setCustomCloseMark,
    customColor: setCustomColor, customSize: setCustomSize, hideCustomMarks: setHideCustomMarks,
};
const saveFmt = (patch) => {
    Object.keys(patch).forEach((k) => { if (FMT_SETTERS[k]) FMT_SETTERS[k](patch[k]); });
    saveSettings(patch);
};
const fmtSettings = {
    enableDialogue, dialogueColor, dialogueSize, hideQuotes, selectedQuoteStyle,
    enableMarkdown, markdownColor, markdownSize, hideMarkdownMarks, selectedMarkdownStyle,
    enableBracket, bracketColor, bracketSize, hideBracketMarks, selectedBracketStyle,
    enableCustom, customOpenMark, customCloseMark, customColor, customSize, hideCustomMarks,
};

useEffect(() => {
    if (!isOfflineMode && (!novel.chapters || novel.chapters.length === 0) && (!availableChapters || availableChapters.length === 0)) {
        fetchChapters();
    } else {
        if (availableChapters && availableChapters.length > 0) {
            const list = availableChapters.map(num => ({
                number: num,
                title: `فصل ${num}`,
                _id: num.toString()
            }));
            setChaptersList(list);
        } else if (novel.chapters && novel.chapters.length > 0) {
            setChaptersList(novel.chapters);
        }
    }
}, [novel.chapters, availableChapters, isOfflineMode]);

const fetchChapters = async () => {
    setLoadingChapters(true);
    try {
        const res = await api.get(`/api/novels/${novelId}/chapters`);
        if (res.data && Array.isArray(res.data)) {
            setChaptersList(res.data);
        }
    } catch (error) {
        console.log("Failed to fetch chapters list", error);
    } finally {
        setLoadingChapters(false);
    }
};

const fetchAuthorData = async () => {
    if (novel.authorEmail) {
        try {
            const res = await api.get(`/api/user/stats?email=${novel.authorEmail}`);
            if (res.data && res.data.user) {
                setAuthorProfile(res.data.user);
            }
        } catch (e) {
            console.log("Failed to fetch author for reader");
        }
    }
};

const fetchCleanerWords = async () => {
    try {
        const res = await api.get('/api/admin/cleaner');
        setCleanerWords(res.data);
    } catch (e) {}
};

const fetchCopyrights = async () => {
    try {
        const res = await api.get('/api/admin/copyright');
        setCopyrightStartText(res.data.startText || '');
        setCopyrightEndText(res.data.endText || '');
        if (res.data.styles) {
            setCopyrightStyle(prev => ({...prev, ...res.data.styles}));
            setHexColorInput(res.data.styles.color || '#888888');
        }
        if (res.data.frequency) setCopyrightFrequency(res.data.frequency);
        if (res.data.everyX) setCopyrightEveryX(res.data.everyX.toString());

        if (res.data.chapterSeparatorText) setSeparatorText(res.data.chapterSeparatorText);
        if (res.data.enableChapterSeparator !== undefined) setEnableSeparator(res.data.enableChapterSeparator);
    } catch (e) {}
};

const handleSaveCopyrights = async () => {
    setCopyrightLoading(true);
    try {
        await api.post('/api/admin/copyright', {
            startText: copyrightStartText,
            endText: copyrightEndText,
            styles: copyrightStyle,
            frequency: copyrightFrequency,
            everyX: parseInt(copyrightEveryX) || 5,
            chapterSeparatorText: separatorText,
            enableChapterSeparator: enableSeparator
        });
        showToast("تم حفظ الحقوق والإعدادات بنجاح", "success");
        fetchChapter();
    } catch (e) {
        showToast("فشل الحفظ", "error");
    } finally {
        setCopyrightLoading(false);
    }
};

const loadSettings = async () => {
    try {
        const saved = await AsyncStorage.getItem('@reader_settings_v4');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.fontSize) setFontSize(parsed.fontSize);
            if (parsed.bgColor) {
                setBgColor(parsed.bgColor);
                setBgColorHexInput(parsed.bgColor);
                setTextColor(parsed.bgColor === '#fff' || parsed.bgColor === '#ffffff' ? '#1a1a1a' : '#e0e0e0');
            }
            if (parsed.textColor) {
                setTextColor(parsed.textColor);
                setTextColorHexInput(parsed.textColor);
            }
            if (parsed.fontId) {
                const foundFont = FONT_OPTIONS.find(f => f.id === parsed.fontId);
                if (foundFont) setFontFamily(foundFont);
            }

            if (parsed.enableDialogue !== undefined) setEnableDialogue(parsed.enableDialogue);
            if (parsed.dialogueColor) setDialogueColor(parsed.dialogueColor);
            if (parsed.dialogueSize) setDialogueSize(parsed.dialogueSize);
            if (parsed.hideQuotes !== undefined) setHideQuotes(parsed.hideQuotes);
            if (parsed.selectedQuoteStyle) setSelectedQuoteStyle(parsed.selectedQuoteStyle);

            if (parsed.enableMarkdown !== undefined) setEnableMarkdown(parsed.enableMarkdown);
            if (parsed.markdownColor) setMarkdownColor(parsed.markdownColor);
            if (parsed.markdownSize) setMarkdownSize(parsed.markdownSize);
            if (parsed.hideMarkdownMarks !== undefined) setHideMarkdownMarks(parsed.hideMarkdownMarks);
            if (parsed.selectedMarkdownStyle) setSelectedMarkdownStyle(parsed.selectedMarkdownStyle);

            if (parsed.enableBracket !== undefined) setEnableBracket(parsed.enableBracket);
            if (parsed.bracketColor) setBracketColor(parsed.bracketColor);
            if (parsed.bracketSize) setBracketSize(parsed.bracketSize);
            if (parsed.hideBracketMarks !== undefined) setHideBracketMarks(parsed.hideBracketMarks);
            if (parsed.selectedBracketStyle) setSelectedBracketStyle(parsed.selectedBracketStyle);

            if (parsed.enableCustom !== undefined) setEnableCustom(parsed.enableCustom);
            if (parsed.customOpenMark) setCustomOpenMark(parsed.customOpenMark);
            if (parsed.customCloseMark) setCustomCloseMark(parsed.customCloseMark);
            if (parsed.customColor) setCustomColor(parsed.customColor);
            if (parsed.customSize) setCustomSize(parsed.customSize);
            if (parsed.hideCustomMarks !== undefined) setHideCustomMarks(parsed.hideCustomMarks);

            if (parsed.textBrightness) setTextBrightness(parsed.textBrightness);
            if (parsed.continuousMode !== undefined) setContinuousMode(parsed.continuousMode);
            if (parsed.keepAwake !== undefined) setKeepAwake(parsed.keepAwake);
        }
    } catch (e) { console.error("Error loading settings", e); }
};

const saveSettings = async (newSettings) => {
    try {
        const current = await AsyncStorage.getItem('@reader_settings_v4');
        const existing = current ? JSON.parse(current) : {};
        await AsyncStorage.setItem('@reader_settings_v4', JSON.stringify({ ...existing, ...newSettings }));
    } catch (e) { console.error("Error saving settings", e); }
};

const loadFoldersAndPrefs = async () => {
    try {
        const savedFolders = await AsyncStorage.getItem('@reader_folders_v2');
        let parsedFolders = [];
        if (savedFolders) {
            parsedFolders = JSON.parse(savedFolders);
        } else {
            const oldReplacements = await AsyncStorage.getItem('@reader_replacements');
            if (oldReplacements) {
                parsedFolders = [{
                    id: 'default_migrated',
                    name: 'عام (قديم)',
                    replacements: JSON.parse(oldReplacements)
                }];
                await AsyncStorage.setItem('@reader_folders_v2', JSON.stringify(parsedFolders));
            }
        }
        setFolders(parsedFolders);

        const prefs = await AsyncStorage.getItem('@reader_ui_prefs');
        if (prefs) {
            const { lastFolderId, sortDesc } = JSON.parse(prefs);
            if (sortDesc !== undefined) setReplaceSortDesc(sortDesc);
            if (lastFolderId) {
                const folderExists = parsedFolders.find(f => f.id === lastFolderId);
                if (folderExists) {
                    setCurrentFolderId(lastFolderId);
                    setReplacementViewMode('list');
                }
            }
        }
    } catch (e) { console.error("Error loading folders", e); }
};

const saveFoldersData = async (newFolders) => {
    try {
        setFolders(newFolders);
        await AsyncStorage.setItem('@reader_folders_v2', JSON.stringify(newFolders));
    } catch (e) { console.error("Error saving folders", e); }
};

const saveUiPrefs = async (prefs) => {
    try {
        const current = await AsyncStorage.getItem('@reader_ui_prefs');
        const existing = current ? JSON.parse(current) : {};
        const newPrefs = { ...existing, ...prefs };
        await AsyncStorage.setItem('@reader_ui_prefs', JSON.stringify(newPrefs));
    } catch (e) { console.error("Error saving prefs", e); }
};

const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const newFolder = { id: Date.now().toString(), name: newFolderName.trim(), replacements: [] };
    const updatedFolders = [...folders, newFolder];
    saveFoldersData(updatedFolders);
    setShowFolderModal(false);
    setNewFolderName('');
};

const deleteFolder = (folderId) => {
    Alert.alert("حذف المجلد", "هل أنت متأكد؟ سيتم حذف جميع الاستبدالات داخله.", [
        { text: "إلغاء" },
        {
            text: "حذف",
            style: 'destructive',
            onPress: () => {
                const updated = folders.filter(f => f.id !== folderId);
                saveFoldersData(updated);
                if (currentFolderId === folderId) {
                    setCurrentFolderId(null);
                    setReplacementViewMode('folders');
                }
            }
        }
    ]);
};

const openFolder = (folderId) => {
    setCurrentFolderId(folderId);
    setReplacementViewMode('list');
    saveUiPrefs({ lastFolderId: folderId });
    setReplaceSearch('');
    setEditingId(null);
    setNewOriginal('');
    setNewReplacement('');
};

const backToFolders = () => {
    setReplacementViewMode('folders');
    setEditingId(null);
    setNewOriginal('');
    setNewReplacement('');
    setReplaceSearch('');
};

const toggleSortOrder = () => {
    const newOrder = !replaceSortDesc;
    setReplaceSortDesc(newOrder);
    saveUiPrefs({ sortDesc: newOrder });
};

const handleAddReplacement = () => {
    if (!currentFolderId) return;
    if (!newOriginal.trim() || !newReplacement.trim()) {
        Alert.alert('تنبيه', 'يرجى إدخال الكلمة الأصلية والبديلة');
        return;
    }
    const folderIndex = folders.findIndex(f => f.id === currentFolderId);
    if (folderIndex === -1) return;
    const currentFolder = folders[folderIndex];
    let updatedReplacements = [...currentFolder.replacements];
    if (editingId !== null) {
        updatedReplacements = updatedReplacements.map((item, index) =>
            index === editingId ? { original: newOriginal.trim(), replacement: newReplacement.trim() } : item
        );
        setEditingId(null);
    } else {
        updatedReplacements.push({ original: newOriginal.trim(), replacement: newReplacement.trim() });
    }
    const updatedFolders = [...folders];
    updatedFolders[folderIndex] = { ...currentFolder, replacements: updatedReplacements };
    saveFoldersData(updatedFolders);
    setNewOriginal('');
    setNewReplacement('');
    Keyboard.dismiss();
};

const handleEditReplacement = (item, realIndex) => {
    setNewOriginal(item.original);
    setNewReplacement(item.replacement);
    setEditingId(realIndex);
};

const handleCancelEditReplacement = () => {
    setEditingId(null);
    setNewOriginal('');
    setNewReplacement('');
};

const handleDeleteReplacement = (realIndex) => {
    if (!currentFolderId) return;
    const folderIndex = folders.findIndex(f => f.id === currentFolderId);
    if (folderIndex === -1) return;
    const currentFolder = folders[folderIndex];
    const updatedReplacements = currentFolder.replacements.filter((_, i) => i !== realIndex);
    const updatedFolders = [...folders];
    updatedFolders[folderIndex] = { ...currentFolder, replacements: updatedReplacements };
    saveFoldersData(updatedFolders);
    if (editingId === realIndex) {
        setEditingId(null);
        setNewOriginal('');
        setNewReplacement('');
    }
};

const activeReplacementsList = useMemo(() => {
    if (!currentFolderId) return [];
    const folder = folders.find(f => f.id === currentFolderId);
    return folder ? folder.replacements : [];
}, [folders, currentFolderId]);

const filteredSortedReplacements = useMemo(() => {
    let list = activeReplacementsList.map((item, index) => ({ ...item, realIndex: index }));
    if (replaceSearch.trim()) {
        const q = replaceSearch.toLowerCase();
        list = list.filter(item =>
            item.original.toLowerCase().includes(q) ||
            item.replacement.toLowerCase().includes(q)
        );
    }
    if (replaceSortDesc) {
        list.reverse();
    }
    return list;
}, [activeReplacementsList, replaceSearch, replaceSortDesc]);

const handleExecuteCleaner = async () => {
    if (!newCleanerWord.trim()) {
        Alert.alert('تنبيه', 'يرجى إدخال النص المراد حذفه');
        return;
    }

    const executeAction = async () => {
        setCleaningLoading(true);
        try {
            if (cleanerEditingId !== null && cleanerOldWord) {
                await api.put(`/api/admin/cleaner/${encodeURIComponent(cleanerOldWord)}`, { word: newCleanerWord.trim() });
                setCleanerEditingId(null);
                setCleanerOldWord('');
            } else {
                await api.post('/api/admin/cleaner', { word: newCleanerWord.trim() });
            }
            setNewCleanerWord('');
            await fetchCleanerWords();
            showToast(cleanerEditingId !== null ? "تم التحديث بنجاح" : "تم الحذف من جميع الفصول بنجاح", "success");
            fetchChapter();
        } catch (e) {
            showToast("فشل تنفيذ العملية", "error");
        } finally {
            setCleaningLoading(false);
        }
    };

    if (cleanerEditingId !== null) {
        Alert.alert(
            "تأكيد التحديث",
            `سيتم تحديث "${cleanerOldWord}" إلى "${newCleanerWord.trim()}" في جميع الفصول.`,
            [
                { text: "إلغاء", style: "cancel" },
                { text: "تحديث", style: "destructive", onPress: executeAction }
            ]
        );
    } else {
        Alert.alert(
            "تأكيد الحذف الشامل",
            `سيتم حذف أي فقرة أو نص مطابق لـ "${newCleanerWord.trim()}" من جميع الفصول في السيرفر.`,
            [
                { text: "إلغاء", style: "cancel" },
                { text: "تنفيذ الحذف", style: "destructive", onPress: executeAction }
            ]
        );
    }
};

const handleEditCleaner = (item, index) => {
    setNewCleanerWord(item);
    setCleanerEditingId(index);
    setCleanerOldWord(item);
};

const handleCancelEditCleaner = () => {
    setCleanerEditingId(null);
    setCleanerOldWord('');
    setNewCleanerWord('');
};

const handleDeleteCleaner = async (item) => {
    Alert.alert("حذف", "هل تريد إزالة هذا النص من القائمة؟", [
        { text: "إلغاء" },
        {
            text: "حذف",
            style: 'destructive',
            onPress: async () => {
                try {
                    await api.delete(`/api/admin/cleaner/${encodeURIComponent(item)}`);
                    fetchCleanerWords();
                    if (newCleanerWord === item) {
                        setNewCleanerWord('');
                        setCleanerEditingId(null);
                        setCleanerOldWord('');
                    }
                } catch (e) { showToast("فشل الحذف", "error"); }
            }
        }
    ]);
};

const applyReplacements = useCallback((raw) => {
    let content = normalizeContent(raw);
    activeReplacementsList.forEach(rep => {
        if (rep.original && rep.replacement !== undefined) {
            content = safeReplaceAll(content, rep.original, rep.replacement);
        }
    });
    return content;
}, [activeReplacementsList]);

const getProcessedContent = useMemo(() => (chapter ? applyReplacements(chapter.content) : ''), [chapter, applyReplacements]);

// Extra chapters appended in continuous-scroll mode
const processedExtraSections = useMemo(() => (
    extraSections.map(sec => ({ ...sec, content: applyReplacements(sec.rawContent) }))
), [extraSections, applyReplacements]);

// ----- Scroll position persistence (per novel + chapter) -----
const scrollKeyFor = (chNum) => `@reader_scroll_v1_${novelId}_${chNum}`;

const saveScrollPosition = async (chNum, offset) => {
    try {
        if (!chNum || offset == null || offset < 0) return;
        await AsyncStorage.setItem(scrollKeyFor(chNum), JSON.stringify({ offset: Math.round(offset), savedAt: Date.now() }));
    } catch (e) {}
};

const loadScrollPosition = async (chNum) => {
    try {
        const raw = await AsyncStorage.getItem(scrollKeyFor(chNum));
        if (!raw) return 0;
        const parsed = JSON.parse(raw);
        return parsed?.offset || 0;
    } catch (e) { return 0; }
};

const queueSaveScroll = (chNum, offset) => {
    if (!continuousMode && parseInt(chNum) !== parseInt(chapterId)) return;
    if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = setTimeout(() => saveScrollPosition(chNum, offset), 600);
};

const updateProgressOnServer = async (currentChapter, chapterNum) => {
  if (!currentChapter || isOfflineMode) return;
  try {
    await api.post('/api/novel/update', {
      novelId: novelId,
      title: novel.title,
      cover: novel.cover,
      author: novel.author || novel.translator,
      lastChapterId: parseInt(chapterNum) || parseInt(chapterId),
      lastChapterTitle: currentChapter.title
    });
  } catch (error) {
    console.error("Failed to update progress on server");
  }
};

const fetchChapter = async () => {
    setLoading(true);
    setErrorInfo(null);
    setExtraSections([]);
    setEndReached(false);
    setLoadingNext(false);
    loadingNextRef.current = false;
    restoredOnceRef.current = false;
    setCurrentViewedChapter(parseInt(chapterId) || 1);
    try {
        let chapterData = null;

        const offlineData = await getOfflineChapterContent(novelId, chapterId);
        if (offlineData) {
            chapterData = offlineData;
        }
        else if (!isOfflineMode) {
            const response = await api.get(`/api/novels/${novelId}/chapters/${chapterId}`);
            chapterData = response.data;
        } else {
            throw new Error("الفصل غير متوفر بدون اتصال");
        }

        if (chapterData && chapterData.content) {
            chapterData.content = normalizeContent(chapterData.content);
        }

        setChapter(chapterData);
        if (availableChapters) {
             setRealTotalChapters(availableChapters.length);
        } else if (chapterData.totalChapters) {
            setRealTotalChapters(chapterData.totalChapters);
        }

        // Restore last scroll position for this chapter
        const savedOffset = await loadScrollPosition(chapterId);
        pendingRestoreRef.current = savedOffset;

        if (!isOfflineMode) {
            incrementView(novelId, chapterId);
            updateProgressOnServer(chapterData, chapterId);
            fetchCommentCount();
        }
    } catch (error) {
        console.error("Error fetching chapter:", error);
        const status = error?.response?.status;
        let message = "فشل تحميل الفصل. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.";
        if (status === 403) message = "هذا الفصل غير متاح حالياً (خاص أو لم يُنشر بعد).";
        else if (status === 404) message = "الفصل غير موجود. ربما تم حذفه أو تغيير ترقيمه.";
        else if (isOfflineMode) message = "الفصل غير متوفر بدون اتصال. حمّله مسبقاً لتقرأه أوفلاين.";
        setErrorInfo({ message, status });
    } finally {
        setLoading(false);
    }
};

// ----- Continuous scroll: fetch + append the NEXT chapter -----
const fetchNextChapter = async () => {
    if (loadingNextRef.current || endReached) return;
    const lastNum = extraSections.length > 0
        ? extraSections[extraSections.length - 1].number
        : parseInt(chapterId);
    let nextNum = null;
    if (availableChapters && availableChapters.length > 0) {
        const sorted = [...availableChapters].sort((a, b) => a - b);
        const idx = sorted.indexOf(lastNum);
        if (idx !== -1 && idx < sorted.length - 1) nextNum = sorted[idx + 1];
    } else {
        const cand = lastNum + 1;
        if (!(realTotalChapters > 0 && cand > realTotalChapters)) nextNum = cand;
    }
    if (nextNum === null) {
        setEndReached(true);
        if (Platform.OS !== 'android') {
            webViewRef.current?.injectJavaScript('window.__markEnd && window.__markEnd(); true;');
        }
        return;
    }
    loadingNextRef.current = true;
    setLoadingNext(true);
    try {
        let nextData = null;
        const off = await getOfflineChapterContent(novelId, nextNum);
        if (off) nextData = off;
        else if (!isOfflineMode) {
            const response = await api.get(`/api/novels/${novelId}/chapters/${nextNum}`);
            nextData = response.data;
        }
        if (!nextData || !nextData.content) {
            setEndReached(true);
            if (Platform.OS !== 'android') {
                webViewRef.current?.injectJavaScript('window.__markEnd && window.__markEnd(); true;');
            }
            return;
        }
        const section = {
            number: nextNum,
            title: nextData.title || `فصل ${nextNum}`,
            rawContent: normalizeContent(nextData.content),
            copyrightStart: nextData.copyrightStart,
            copyrightEnd: nextData.copyrightEnd,
            copyrightStyles: nextData.copyrightStyles
        };
        setExtraSections(prev => [...prev, section]);
        if (Platform.OS !== 'android') {
            // Append the new chapter into the LIVE WebView DOM (no reload => scroll kept)
            const secHTML = buildSectionHTML({
                number: section.number,
                title: section.title,
                content: applyReplacements(section.rawContent),
                copyrightStart: section.copyrightStart,
                copyrightEnd: section.copyrightEnd,
                copyrightStyles: section.copyrightStyles
            }, extraSections.length + 1);
            const appendJs = `window.__appendChapter(${JSON.stringify(section.number)}, ${JSON.stringify(section.title)}, ${JSON.stringify(secHTML)}); true;`;
            webViewRef.current?.injectJavaScript(appendJs);
            if (autoScrollNextRef.current) {
                autoScrollNextRef.current = false;
                webViewRef.current?.injectJavaScript(
                    `setTimeout(function(){ var el = document.querySelector('section[data-ch="${nextNum}"]'); if (el) { window.scrollTo(0, el.offsetTop - 8); } }, 250); true;`
                );
            }
        }
    } catch (e) {
        // 403/404/network: stop auto-appending silently; buttons still work
        setEndReached(true);
        if (Platform.OS !== 'android') {
            webViewRef.current?.injectJavaScript('window.__markEnd && window.__markEnd(); true;');
        }
    } finally {
        loadingNextRef.current = false;
        setLoadingNext(false);
    }
};

const fetchCommentCount = async () => {
    try {
        const res = await api.get(`/api/novels/${novelId}/comments?chapterNumber=${chapterId}`);
        setCommentCount(res.data.totalComments || 0);
    } catch (e) {
        console.log("Failed to fetch comment count");
    }
};

useEffect(() => {
    fetchChapter();
}, [chapterId]);

const toggleMenu = useCallback(() => {
  if (drawerMode !== 'none') {
      closeDrawers();
      return;
  }
  setShowMenu(prevShowMenu => {
      const nextShowMenu = !prevShowMenu;
      Animated.timing(fadeAnim, {
        toValue: nextShowMenu ? 1 : 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
      return nextShowMenu;
  });
}, [drawerMode]);

useEffect(() => {
    if (Platform.OS === 'web') {
        const handleWebMessage = (event) => {
            if (typeof event.data === 'string') {
                 if (event.data === 'toggleMenu') toggleMenu();
                 if (event.data === 'openComments') setShowComments(true);
                 if (event.data === 'openProfile') {
                     if (authorProfile) navigation.push('UserProfile', { userId: authorProfile._id });
                 }
            }
        };
        window.addEventListener('message', handleWebMessage);
        return () => window.removeEventListener('message', handleWebMessage);
    }
}, [toggleMenu, authorProfile]);

const openLeftDrawer = () => {
    setDrawerMode('chapters');
    Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 300, useNativeDriver: true })
    ]).start();
};

const openRightDrawer = (mode) => {
    if (isOfflineMode) return;
    setShowPanel(false);
    setDrawerMode(mode);
    if (mode === 'replacements') {
        if (!currentFolderId) {
            setReplacementViewMode('folders');
        } else {
            setReplacementViewMode('list');
        }
    }
    Animated.parallel([
        Animated.timing(slideAnimRight, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 300, useNativeDriver: true })
    ]).start();
};

const closeDrawers = () => {
    Keyboard.dismiss();
    Animated.parallel([
        Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnimRight, { toValue: DRAWER_WIDTH, duration: 300, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 300, useNativeDriver: true })
    ]).start(() => {
        setDrawerMode('none');
        setEditingId(null);
        setNewOriginal('');
        setNewReplacement('');
        setCleanerEditingId(null);
        setCleanerOldWord('');
        setNewCleanerWord('');
    });
};

const [isAscending, setIsAscending] = useState(true);
const toggleSort = () => {
    setIsAscending(!isAscending);
};

const sortedChapters = useMemo(() => {
    let list = [...chaptersList];
    if (!isAscending) list.reverse();
    return list;
}, [chaptersList, isAscending]);

const navigateChapter = (targetId) => {
    closeDrawers();
    if (parseInt(targetId) === parseInt(chapterId)) return;
    setTimeout(() => {
        navigation.replace('Reader', {
            novel,
            chapterId: targetId,
            isOfflineMode,
            availableChapters
        });
    }, 300);
};

const navigateNextPrev = (offset) => {
    // Continuous mode: "next" scrolls to the already-appended section or fetches it
    if (continuousMode && offset > 0) {
        const anchorNum = parseInt(chapterId) || 1;
        const secNums = [anchorNum, ...processedExtraSections.map(x => x.number)];
        const idx = secNums.indexOf(currentViewedChapter);
        const nextSec = idx !== -1 ? secNums[idx + 1] : (processedExtraSections.length ? null : undefined);
        if (nextSec) {
            if (Platform.OS === 'android') {
                const itemIdx = androidItems.findIndex(it => it.type === 'header' && it.number === nextSec);
                if (itemIdx >= 0) {
                    androidListRef.current?.scrollToIndex({ index: itemIdx, viewPosition: 'start', animated: true });
                }
            } else {
                webViewRef.current?.injectJavaScript(`var el=document.querySelector('section[data-ch="${nextSec}"]'); if(el){ window.scrollTo({top: el.offsetTop - 8, behavior: 'smooth'}); } true;`);
            }
            return;
        }
        if (endReached) {
            Alert.alert("تنبيه", "أنت في آخر فصل متاح.");
            return;
        }
        autoScrollNextRef.current = true;
        fetchNextChapter();
        return;
    }
    if (availableChapters && availableChapters.length > 0) {
        const currentNum = parseInt(chapterId);
        const sortedAvailable = [...availableChapters].sort((a,b) => a - b);
        const currentIndex = sortedAvailable.indexOf(currentNum);
        if (currentIndex === -1) return;
        const nextIndex = currentIndex + offset;
        if (nextIndex >= 0 && nextIndex < sortedAvailable.length) {
            const nextChapId = sortedAvailable[nextIndex];
            if (offset > 0) clearScrollFor(nextChapId);
            navigation.replace('Reader', {
                novel,
                chapterId: nextChapId,
                isOfflineMode,
                availableChapters
            });
        } else {
             Alert.alert("تنبيه", offset > 0 ? "أنت في آخر فصل منزل." : "أنت في أول فصل منزل.");
        }
    } else {
        const nextNum = parseInt(chapterId) + offset;
        if (offset < 0 && nextNum < 1) return;
        if (offset > 0 && realTotalChapters > 0 && nextNum > realTotalChapters) {
            Alert.alert("تنبيه", "أنت في آخر فصل متاح.");
            return;
        }
        if (offset > 0) clearScrollFor(nextNum);
        navigation.replace('Reader', { novel, chapterId: nextNum, isOfflineMode });
    }
};

const clearScrollFor = async (chNum) => {
    try { await AsyncStorage.removeItem(scrollKeyFor(chNum)); } catch (e) {}
};

const changeFontSize = (delta) => {
const newSize = fontSize + delta;
if (newSize >= 14 && newSize <= 32) {
setFontSize(newSize);
saveSettings({ fontSize: newSize });
}
};

const changeTheme = (newBgColor) => {
setBgColor(newBgColor);
setBgColorHexInput(newBgColor);
saveSettings({ bgColor: newBgColor });
};

const handleBgColorHexChange = (text) => {
    setBgColorHexInput(text);
    if (/^#[0-9A-F]{6}$/i.test(text)) {
        setBgColor(text);
        saveSettings({ bgColor: text });
    }
};

const handleTextColorHexChange = (text) => {
    setTextColorHexInput(text);
    if (/^#[0-9A-F]{6}$/i.test(text)) {
        setTextColor(text);
        saveSettings({ textColor: text });
    }
};

const handleTextColorPreset = (color) => {
    setTextColor(color);
    setTextColorHexInput(color);
    saveSettings({ textColor: color });
};

const handleFontChange = (font) => {
    setFontFamily(font);
    saveSettings({ fontId: font.id });
};

// ----- HTML line processing (formatting spans are ALWAYS emitted; CSS controls them) -----
// SINGLE-PASS: one combined regex runs over the ESCAPED text and each match is
// wrapped exactly once. Sequential passes fed generated HTML (attribute quotes
// like class="...") back into later regexes, corrupting markup and leaking
// fragments such as `"bmark">[...]` into the visible text.
const STYLE_MARKS = {
    guillemets: ['«', '»'],
    curly: ['“', '”'],
    straight: ['"', '"'],
    single: ['‘', '’'],
};
const escapeRegexSrc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const processLineHTML = (line) => {
    const text = escapeHtmlText(line);

    let dialogueSrc;
    if (selectedQuoteStyle === 'guillemets') dialogueSrc = '«[^»]*»';
    else if (selectedQuoteStyle === 'curly') dialogueSrc = '“[^”]*”';
    else if (selectedQuoteStyle === 'straight') dialogueSrc = '"[^"]*"';
    else if (selectedQuoteStyle === 'single') dialogueSrc = "['‘][^'’]*['’]";
    else dialogueSrc = '[“"«][^”"»]*[”"»]';

    const alternatives = [
        '\\[[^\\]\\n]*\\]',
        '\\*\\*[\\s\\S]*?\\*\\*',
        dialogueSrc,
    ];
    let customOpen = '', customClose = '';
    if (customOpenMark.trim() && customCloseMark.trim()) {
        customOpen = escapeHtmlText(customOpenMark.trim());
        customClose = escapeHtmlText(customCloseMark.trim());
        alternatives.push(escapeRegexSrc(customOpen) + '[\\s\\S]*?' + escapeRegexSrc(customClose));
    }

    let re;
    try { re = new RegExp(alternatives.join('|'), 'g'); } catch (e) { return text; }

    const bracketMarks = STYLE_MARKS[selectedBracketStyle] || null;
    const markdownMarks = STYLE_MARKS[selectedMarkdownStyle] || null;

    return text.replace(re, (m) => {
        if (customOpen && m.startsWith(customOpen) && m.endsWith(customClose)) {
            const inner = m.slice(customOpen.length, m.length - customClose.length);
            return `<span class="custom-formatted"><span class="cmark">${customOpen}</span>${inner}<span class="cmark">${customClose}</span></span>`;
        }
        if (m.charAt(0) === '[' && m.charAt(m.length - 1) === ']') {
            const inner = m.slice(1, -1);
            const innerStart = bracketMarks ? `<span class="bq-style">${escapeHtmlText(bracketMarks[0])}</span>` : '';
            const innerEnd = bracketMarks ? `<span class="bq-style">${escapeHtmlText(bracketMarks[1])}</span>` : '';
            return `<span class="bracket-formatted"><span class="bmark">[</span>${innerStart}${inner}${innerEnd}<span class="bmark">]</span></span>`;
        }
        if (m.startsWith('**') && m.endsWith('**') && m.length > 4) {
            const inner = m.slice(2, -2);
            const qStart = markdownMarks ? `<span class="mq-style">${escapeHtmlText(markdownMarks[0])}</span>` : '';
            const qEnd = markdownMarks ? `<span class="mq-style">${escapeHtmlText(markdownMarks[1])}</span>` : '';
            return `<span class="cm-markdown-bold"><span class="mmark">**</span>${qStart}${inner}${qEnd}<span class="mmark">**</span></span>`;
        }
        const open = m.charAt(0);
        const close = m.charAt(m.length - 1);
        const inner = m.length > 2 ? m.slice(1, -1) : '';
        return `<span class="cm-dialogue-text"><span class="qmark">${open}</span>${inner}<span class="qmark">${close}</span></span>`;
    });
};

// ----- Build one chapter <section> (used for the anchor chapter AND appended ones) -----
const buildSectionHTML = (sec, idx) => {
    const style = sec.copyrightStyles || {};
    const copyrightCSS = `color: ${style.color || '#888'}; opacity: ${style.opacity || 1}; text-align: ${style.alignment || 'center'}; font-weight: ${style.isBold ? 'bold' : 'normal'}; font-size: ${style.fontSize || 14}px; line-height: 1.5; padding: 15px 0; margin: 10px 0; font-family: sans-serif;`;
    const lines = (sec.content || '').split('\n').filter(line => line.trim() !== '');
    const paragraphs = lines.map(line => `<p>${processLineHTML(line)}</p>`).join('');
    const sepHTML = idx > 0 ? `<div class="chapter-sep">◆ ◆ ◆</div>` : '';
    const titleHTML = `<div class="title${idx > 0 ? ' sub-title' : ''}">${escapeHtmlText(sec.title || '')}</div>`;
    const customSep = idx === 0 && enableSeparator ? `<div class="custom-sep">${escapeHtmlText(separatorText)}</div>` : '';
    const startHTML = sec.copyrightStart ? `<div class="app-copyright" style="${copyrightCSS}">${escapeHtmlText(sec.copyrightStart)}</div><div class="chapter-divider"></div>` : '';
    const endHTML = sec.copyrightEnd ? `<div class="chapter-divider"></div><div class="app-copyright" style="${copyrightCSS}">${escapeHtmlText(sec.copyrightEnd)}</div>` : '';
    return `<section class="chapter-sec" data-ch="${sec.number}">${sepHTML}${titleHTML}${customSep}${startHTML}<div class="content-area">${paragraphs}</div>${endHTML}</section>`;
};

// ----- Full CSS (re-injected on every settings change WITHOUT reloading the WebView,
// which is what keeps the scroll position intact when changing colors/fonts/sizes) -----
const buildReaderCSS = () => `
      * { -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; box-sizing: border-box; }
      body, html {
        margin: 0; padding: 0; background-color: ${bgColor}; color: ${textColor};
        font-family: ${fontFamily.family}; line-height: 1.8;
        -webkit-overflow-scrolling: touch; overflow-x: hidden;
        filter: brightness(${textBrightness});
      }
      .container { padding: 25px 20px 120px 20px; width: 100%; max-width: 800px; margin: 0 auto; }
      .title {
        font-size: ${fontSize + 8}px; font-weight: bold; margin-bottom: 20px;
        color: ${bgColor === '#fff' || bgColor === '#ffffff' ? '#000' : '#fff'};
        padding-bottom: 10px; font-family: ${fontFamily.family}; text-align: right;
      }
      .sub-title { font-size: ${fontSize + 4}px; margin-top: 35px; }
      .chapter-sep { text-align: center; color: rgba(128,128,128,0.55); font-size: 18px; letter-spacing: 6px; margin: 45px 0 10px 0; user-select: none; }
      .custom-sep { text-align: center; color: rgba(128,128,128,0.5); font-size: 1em; padding: 10px 0; margin: 5px 0 20px 0; letter-spacing: 2px; user-select: none; }
      .chapter-divider { border: none; height: 1px; background-color: rgba(128,128,128,0.3); margin: 10px 0 30px 0; width: 100%; }
      .content-area { font-size: ${fontSize}px; text-align: justify; word-wrap: break-word; }
      p { margin-bottom: 1.5em; }

      .cm-dialogue-text {
          color: ${enableDialogue ? dialogueColor : 'inherit'};
          font-size: ${enableDialogue ? dialogueSize + '%' : '100%'};
          font-weight: ${enableDialogue ? 'bold' : 'inherit'};
          transition: color 0.3s ease, font-size 0.3s ease;
      }
      .cm-markdown-bold {
          font-weight: bold;
          color: ${enableMarkdown ? markdownColor : 'inherit'};
          font-size: ${enableMarkdown ? markdownSize + '%' : '100%'};
          transition: color 0.3s ease, font-size 0.3s ease;
      }
      .bracket-formatted {
          color: ${enableBracket ? bracketColor : 'inherit'};
          font-size: ${enableBracket ? bracketSize + '%' : '100%'};
          font-weight: ${enableBracket ? 'bold' : 'inherit'};
          transition: color 0.3s ease, font-size 0.3s ease;
      }
      .custom-formatted {
          color: ${enableCustom ? customColor : 'inherit'};
          font-size: ${enableCustom ? customSize + '%' : '100%'};
          font-weight: ${enableCustom ? 'bold' : 'inherit'};
          transition: color 0.3s ease, font-size 0.3s ease;
      }
      /* Formatting marks are always in the DOM; CSS shows/hides them live */
      .qmark, .mmark, .bmark, .cmark { opacity: 1; transition: opacity 0.3s ease; }
      ${hideQuotes ? '.qmark { opacity: 0; font-size: 0; }' : ''}
      ${hideMarkdownMarks ? '.mmark { opacity: 0; font-size: 0; }' : ''}
      ${hideBracketMarks ? '.bmark { opacity: 0; font-size: 0; }' : ''}
      ${hideCustomMarks ? '.cmark { opacity: 0; font-size: 0; }' : ''}

      body { user-select: none; -webkit-user-select: none; }
      .author-section-wrapper { margin-top: 50px; margin-bottom: 20px; border-top: 1px solid #222; padding-top: 20px; }
      .section-title { color: ${bgColor === '#fff' || bgColor === '#ffffff' ? '#000' : '#fff'}; font-size: 18px; font-weight: bold; margin-bottom: 12px; text-align: right; }
      .author-card { border-radius: 16px; overflow: hidden; margin-top: 10px; border: 1px solid #222; position: relative; height: 140px; width: 100%; cursor: pointer; }
      .author-banner { position: absolute; width: 100%; height: 100%; background-size: cover; background-position: center; }
      .author-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.8)); z-index: 1; }
      .author-content { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 2; width: 100%; }
      .author-avatar-wrapper { width: 76px; height: 76px; border-radius: 38px; border: 3px solid #fff; background-color: #333; margin-bottom: 8px; overflow: hidden; }
      .author-avatar-img { width: 100%; height: 100%; object-fit: cover; }
      .author-name { color: #fff; font-size: 20px; font-weight: bold; text-transform: uppercase; text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9); text-align: center; }
      .comments-btn-container { margin-bottom: 40px; padding: 0 5px; }
      .comments-btn { width: 100%; background-color: ${bgColor === '#fff' || bgColor === '#ffffff' ? '#f0f0f0' : '#1a1a1a'}; border: 1px solid ${bgColor === '#fff' || bgColor === '#ffffff' ? '#ddd' : '#333'}; color: ${bgColor === '#fff' || bgColor === '#ffffff' ? '#333' : '#fff'}; padding: 15px; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
`;

const generateHTML = () => {
    if (!chapter) return '';

    const fontImports = FONT_OPTIONS.map(f => f.url ? `@import url('${f.url}');` : '').join('\n');

    const authorName = authorProfile?.name || novel.author || 'Zeus';
    const authorAvatar = authorProfile?.picture || 'https://via.placeholder.com/150';
    const authorBanner = authorProfile?.banner || null;
    const bannerStyle = authorBanner ? `background-image: url('${authorBanner}');` : 'background-color: #000;';

    const publisherBanner = `
<div class="author-section-wrapper">
    <div class="section-title">الناشر</div>
    <div class="author-card" id="authorCard">
        <div class="author-banner" style="${bannerStyle}"></div>
        <div class="author-overlay"></div>
        <div class="author-content">
            <div class="author-avatar-wrapper">
                <img src="${authorAvatar}" class="author-avatar-img" />
            </div>
            <div class="author-name">${authorName}</div>
        </div>
    </div>
</div>
`;

    const commentsButton = !isOfflineMode ? `
<div class="comments-btn-container">
    <button class="comments-btn" id="commentsBtn">
        <span class="icon">💬</span>
        <span>عرض التعليقات (${commentCount})</span>
    </button>
</div>
` : '';

    const anchorSection = buildSectionHTML({
        number: parseInt(chapterId) || 1,
        title: chapter.title,
        content: getProcessedContent,
        copyrightStart: chapter.copyrightStart,
        copyrightEnd: chapter.copyrightEnd,
        copyrightStyles: chapter.copyrightStyles
    }, 0);

    const initialScroll = Math.max(0, Math.round(pendingRestoreRef.current || 0));

    const webviewScript = `
      (function() {
          function sendMessage(msg) {
              if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(msg); }
              else if (window.parent) { window.parent.postMessage(msg, '*'); }
          }
          window.__readerScrollTo = function(y) { setTimeout(function(){ window.scrollTo(0, y); }, 80); };
          var initialScroll = ${initialScroll};
          if (initialScroll > 0) {
              setTimeout(function(){ window.scrollTo(0, initialScroll); }, 150);
              setTimeout(function(){ window.scrollTo(0, initialScroll); }, 500);
          }
          var lastSent = 0;
          function currentChapterNumber(y) {
              var secs = document.querySelectorAll('section[data-ch]');
              var cur = secs.length ? parseInt(secs[0].getAttribute('data-ch')) : 0;
              for (var i = 0; i < secs.length; i++) {
                  if (secs[i].offsetTop - 80 <= y) cur = parseInt(secs[i].getAttribute('data-ch'));
                  else break;
              }
              return cur;
          }
          window.__continuous = ${continuousMode ? 'true' : 'false'};
          function maybeNeedNext() {
              if (!window.__continuous) return;
              if (window.__endReached || window.__needNextLock) return;
              var doc = document.documentElement;
              if (window.scrollY + window.innerHeight >= doc.scrollHeight - 1500) {
                  window.__needNextLock = true;
                  sendMessage('readerNeedNext');
              }
          }
          window.addEventListener('scroll', function() {
              var now = Date.now();
              if (now - lastSent < 250) return;
              lastSent = now;
              var y = window.scrollY || 0;
              sendMessage(JSON.stringify({ type: 'readerScroll', offset: y, chapter: currentChapterNumber(y) }));
              maybeNeedNext();
          }, true);
          document.addEventListener('click', function(e) {
              try {
                  if (e.target.closest('#commentsBtn')) { e.stopPropagation(); sendMessage('openComments'); return; }
                  if (e.target.closest('#authorCard')) { e.stopPropagation(); sendMessage('openProfile'); return; }
                  var selection = window.getSelection();
                  if (selection && selection.toString().length > 0) return;
                  sendMessage('toggleMenu');
              } catch (err) {}
          });
          window.__appendChapter = function(num, title, html) {
              var wrap = document.createElement('div');
              wrap.innerHTML = html;
              var root = document.getElementById('chapters-root');
              while (wrap.firstChild) root.appendChild(wrap.firstChild);
              window.__needNextLock = false;
          };
          window.__markEnd = function() { window.__endReached = true; window.__needNextLock = true; };
      })();
    `;

    return `
  <!DOCTYPE html>
  <html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>${fontImports}</style>
    <style id="reader-style">${buildReaderCSS()}</style>
  </head>
  <body>
    <div class="container" id="clickable-area">
      <div id="chapters-root">${anchorSection}</div>
      ${publisherBanner}
      ${commentsButton}
    </div>
    <script>${webviewScript}<\/script>
  </body>
  </html>
`;
};

// Stable per-chapter HTML: styling changes must NOT regenerate it (scroll preservation)
const baseHtml = useMemo(() => generateHTML(), [
    chapter, chapterId, commentCount, authorProfile, isOfflineMode,
    enableSeparator, separatorText, customOpenMark, customCloseMark,
    selectedQuoteStyle, selectedMarkdownStyle, selectedBracketStyle,
    getProcessedContent, novel.author, novel.title
]);

// Web (iframe) still needs full regeneration on style change
const webHtml = useMemo(() => generateHTML(), [baseHtml, fontSize, bgColor, textColor, fontFamily, textBrightness, enableDialogue, dialogueColor, dialogueSize, hideQuotes, enableMarkdown, markdownColor, markdownSize, hideMarkdownMarks, enableBracket, bracketColor, bracketSize, hideBracketMarks, enableCustom, customColor, customSize, hideCustomMarks]);

// Inject updated CSS into the WebView WITHOUT reloading it (scroll position is kept)
useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const css = buildReaderCSS();
    const js = `(function(){window.__continuous=${continuousMode ? 'true' : 'false'};var el=document.getElementById('reader-style'); if(el){el.textContent=${JSON.stringify(css)};}})(); true;`;
    webViewRef.current?.injectJavaScript(js);
}, [fontSize, bgColor, textColor, fontFamily, textBrightness,
    enableDialogue, dialogueColor, dialogueSize, hideQuotes,
    enableMarkdown, markdownColor, markdownSize, hideMarkdownMarks,
    enableBracket, bracketColor, bracketSize, hideBracketMarks,
    enableCustom, customColor, customSize, hideCustomMarks, baseHtml]);

// Cleanup scroll-save timer on unmount
useEffect(() => () => {
    if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
}, []);

// Keep server reading-progress in sync with the chapter actually being viewed
useEffect(() => {
    if (chapter && !isOfflineMode) updateProgressOnServer(chapter, currentViewedChapter);
}, [currentViewedChapter]);

const onMessage = (event) => {
    const msg = event?.nativeEvent?.data;
    if (!msg) return;
    if (typeof msg === 'string' && msg.startsWith('{')) {
        try {
            const data = JSON.parse(msg);
            if (data.type === 'readerScroll') {
                const chNum = parseInt(data.chapter) || currentViewedChapter;
                setCurrentViewedChapter(prev => (parseInt(prev) === chNum ? prev : chNum));
                queueSaveScroll(chNum, data.offset);
                return;
            }
        } catch (e) {}
    }
    if (msg === 'toggleMenu') {
        toggleMenu();
    } else if (msg === 'openComments') {
        setShowComments(true);
    } else if (msg === 'openProfile') {
        if (authorProfile && !isOfflineMode) {
            navigation.push('UserProfile', { userId: authorProfile._id });
        }
    } else if (msg === 'readerNeedNext') {
        fetchNextChapter();
    }
};

const renderFolderItem = ({ item }) => (
    <TouchableOpacity style={styles.drawerItem} onPress={() => openFolder(item.id)}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Ionicons name="folder" size={20} color="#4a7cc7" style={{marginLeft: 10}} />
            <Text style={styles.drawerItemTitle}>{item.name}</Text>
        </View>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Text style={{color: '#666', fontSize: 12, marginRight: 10}}>{item.replacements.length} كلمة</Text>
            <TouchableOpacity onPress={() => deleteFolder(item.id)} style={{padding: 5}}>
                <Ionicons name="trash-outline" size={18} color="#ff4444" />
            </TouchableOpacity>
        </View>
    </TouchableOpacity>
);

const renderReplacementItem = ({ item, index }) => {
    const isEditing = editingId === index;
    return (
        <TouchableOpacity
            style={[styles.replacementItem, isEditing && styles.replacementItemEditing]}
            onPress={() => handleEditReplacement(item, index)}
        >
            <View style={styles.replacementInfo}>
                <Text style={[styles.replacementText, {color: '#888', fontSize: 12, marginBottom: 2}]}>{item.original}</Text>
                <Ionicons name="arrow-down" size={12} color="#4a7cc7" style={{marginVertical: 2}} />
                <Text style={[styles.replacementText, {fontWeight: 'bold', color: '#fff'}]}>{item.replacement}</Text>
            </View>
            <View style={styles.replacementActions}>
                <TouchableOpacity onPress={() => handleDeleteReplacement(index)} style={styles.actionBtn}>
                    <Ionicons name="trash-outline" size={18} color="#ff4444" />
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
    );
};

const renderCleanerItem = ({ item, index }) => {
    const isEditing = cleanerEditingId === index;
    return (
        <View style={[styles.replacementItem, isEditing && styles.replacementItemEditing]}>
            <View style={styles.replacementInfo}>
                <Text style={[styles.replacementText, {color: '#ccc', textAlign: 'right'}]} numberOfLines={2}>{item}</Text>
            </View>
            <View style={styles.replacementActions}>
                <TouchableOpacity onPress={() => handleEditCleaner(item, index)} style={styles.actionBtn}>
                    <Ionicons name="create-outline" size={18} color="#4a7cc7" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteCleaner(item)} style={styles.actionBtn}>
                    <Ionicons name="trash-outline" size={18} color="#ff4444" />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const renderChapterItem = ({ item }) => {
    return (
        <TouchableOpacity
            style={[styles.drawerItem, item.number == chapterId && styles.drawerItemActive]}
            onPress={() => navigateChapter(item.number)}
        >
            <Text style={[styles.drawerItemTitle, item.number == chapterId && styles.drawerItemTextActive]}>
                {item.title || `فصل ${item.number}`}
            </Text>
            <Text style={styles.drawerItemSubtitle}>{item.number}</Text>
        </TouchableOpacity>
    );
};

// ----- Android continuous-scroll items (anchor chapter + appended sections) -----
const androidItems = useMemo(() => {
    if (Platform.OS !== 'android') return [];
    const items = [];
    const secs = [{
        number: parseInt(chapterId) || 1,
        title: chapter?.title,
        content: getProcessedContent,
        copyrightStart: chapter?.copyrightStart,
        copyrightEnd: chapter?.copyrightEnd,
        copyrightStyles: chapter?.copyrightStyles
    }, ...processedExtraSections];
    secs.forEach((sec, si) => {
        items.push({
            type: 'header', key: `h_${si}_${sec.number}`, number: sec.number,
            title: sec.title, copyrightStart: sec.copyrightStart, showSep: si > 0
        });
        (sec.content || '').split('\n').filter(l => l.trim() !== '').forEach((line, li) => {
            items.push({ type: 'line', key: `l_${si}_${sec.number}_${li}`, text: line, number: sec.number });
        });
        if (sec.copyrightEnd) items.push({ type: 'copy', key: `ce_${si}_${sec.number}`, text: sec.copyrightEnd, styles: sec.copyrightStyles });
    });
    return items;
}, [chapter, chapterId, getProcessedContent, processedExtraSections]);

const androidRestoreTriesRef = useRef(0);

const handleAndroidScroll = (e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const y = contentOffset.y;
    let cur = parseInt(chapterId) || 1;
    const ys = headerYsRef.current;
    Object.keys(ys).forEach(k => {
        const num = parseInt(k);
        if (ys[k] <= y + 120 && num > cur) cur = num;
    });
    setCurrentViewedChapter(prev => (prev === cur ? prev : cur));
    queueSaveScroll(cur, y);
    if (continuousMode && contentSize.height > 0 && y + layoutMeasurement.height >= contentSize.height - 1500) {
        fetchNextChapter();
    }
};

const handleAndroidContentSize = (w, h) => {
    const target = pendingRestoreRef.current;
    if (target <= 0 || restoredOnceRef.current) return;
    if (h >= target + 300) {
        restoredOnceRef.current = true;
        androidListRef.current?.scrollToOffset({ offset: target, animated: false });
        pendingRestoreRef.current = 0;
    } else {
        // Push towards the end so virtualization renders further items; retry next size change
        if (androidRestoreTriesRef.current < 80) {
            androidRestoreTriesRef.current += 1;
            androidListRef.current?.scrollToOffset({ offset: Math.max(0, h - 600), animated: false });
        } else {
            restoredOnceRef.current = true;
            pendingRestoreRef.current = 0;
        }
    }
};


if (loading) {
return (
<View style={[styles.loadingContainer, { backgroundColor: bgColor }]}>
<ActivityIndicator size="large" color="#4a7cc7" />
<Text style={[styles.loadingText, { color: textColor }]}>جاري التحميل…</Text>
</View>
);
}

const getHeaderSubtitle = () => {
    if (availableChapters) {
        const sorted = [...availableChapters].sort((a,b) => a - b);
        const index = sorted.indexOf(parseInt(currentViewedChapter));
        return `الفصل ${index + 1} من ${sorted.length}`;
    } else {
        return `الفصل ${currentViewedChapter} من ${realTotalChapters > 0 ? realTotalChapters : '؟'}`;
    }
};

const renderAndroidContent = () => (
  <View style={{ flex: 1 }}>
    <FlatList
      ref={androidListRef}
      data={androidItems}
      keyExtractor={(item) => item.key}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 60, paddingBottom: 150 }}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={true}
      onScroll={handleAndroidScroll}
      onContentSizeChanged={handleAndroidContentSize}
      scrollEventThrottle={16}
      renderItem={({ item }) => {
        if (item.type === 'header') {
          return (
            <TouchableOpacity activeOpacity={1} onPress={toggleMenu}
              onLayout={(e) => { headerYsRef.current[item.number] = e.nativeEvent.layout.y; }}>
              {item.showSep && <Text style={{ textAlign: 'center', color: 'rgba(128,128,128,0.55)', fontSize: 18, letterSpacing: 6, marginVertical: 25 }}>◆ ◆ ◆</Text>}
              <Text style={[styles.androidTitle, { color: textColor, fontSize: fontSize + 8, fontFamily: fontFamily.id === 'Cairo' || fontFamily.id === 'Amiri' ? fontFamily.id : undefined }]}>
                {item.title || `فصل ${item.number}`}
              </Text>
              {item.copyrightStart ? (
                <Text style={{ color: item.styles?.color || '#888', textAlign: 'center', fontSize: item.styles?.fontSize || 14, opacity: item.styles?.opacity || 1, marginBottom: 20 }}>
                  {item.copyrightStart}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        }
        if (item.type === 'copy') {
          return (
            <Text style={{ color: item.styles?.color || '#888', textAlign: 'center', fontSize: item.styles?.fontSize || 14, opacity: item.styles?.opacity || 1, marginVertical: 25 }}>
              {item.text}
            </Text>
          );
        }
        return (
          <TouchableOpacity activeOpacity={1} onPress={toggleMenu}>
            <Text style={{
              fontSize: fontSize,
              color: textColor,
              fontFamily: fontFamily.id === 'Cairo' || fontFamily.id === 'Amiri' ? fontFamily.id : undefined,
              lineHeight: fontSize * 1.8,
              textAlign: 'right',
              marginBottom: 20,
              writingDirection: 'rtl'
            }}>
              {item.text}
            </Text>
          </TouchableOpacity>
        );
      }}
      ListFooterComponent={() => (
        <View style={{ marginTop: 30 }}>
          {loadingNext && (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#4a7cc7" />
              <Text style={{ color: '#888', marginTop: 8, fontSize: 13 }}>جاري جلب الفصل التالي…</Text>
            </View>
          )}
          {endReached && !loadingNext && (
            <Text style={{ textAlign: 'center', color: 'rgba(128,128,128,0.6)', fontSize: 14, marginVertical: 20, letterSpacing: 1 }}>
              — وصلت إلى آخر فصل متاح —
            </Text>
          )}
          {authorProfile && (
            <TouchableOpacity onPress={() => !isOfflineMode && navigation.push('UserProfile', { userId: authorProfile._id })} style={styles.androidAuthorCard}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>الناشر: {authorProfile.name}</Text>
            </TouchableOpacity>
          )}
          {!isOfflineMode && (
              <TouchableOpacity onPress={() => setShowComments(true)} style={[styles.androidCommentBtn, { borderColor: textColor }]}>
                <Text style={{ color: textColor }}>عرض التعليقات ({commentCount})</Text>
              </TouchableOpacity>
          )}
          <TouchableOpacity style={{height: 100}} onPress={toggleMenu} />
        </View>
      )}
    />
  </View>
);

// ----- Full-screen error state (retry / back instead of being stuck) -----
if (errorInfo && !chapter && !loading) {
  return (
    <View style={[styles.errorContainer, { backgroundColor: bgColor }]}>
      <Ionicons name="cloud-offline-outline" size={64} color="#ff6b6b" />
      <Text style={styles.errorTitle}>تعذّر عرض الفصل</Text>
      <Text style={styles.errorMessage}>{errorInfo.message}</Text>
      <TouchableOpacity style={styles.errorBtn} onPress={fetchChapter}>
        <Ionicons name="refresh" size={20} color="#000" />
        <Text style={styles.errorBtnTextDark}>إعادة المحاولة</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.errorBtn, styles.errorBtnSecondary]} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={20} color="#fff" />
        <Text style={styles.errorBtnText}>رجوع</Text>
      </TouchableOpacity>
    </View>
  );
}

return (
<View style={[styles.container, { backgroundColor: bgColor }]}>
  <StatusBar hidden={!showMenu} barStyle={bgColor === '#fff' || bgColor === '#ffffff' ? 'dark-content' : 'light-content'} animated />

  {/* Top Bar */}
  <Animated.View style={[styles.topBar, { opacity: fadeAnim, paddingTop: insets.top + 10, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [-100, 0] }) }] }]} pointerEvents={showMenu ? 'auto' : 'none'}>
    <View style={styles.topBarContent}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}><Ionicons name="arrow-forward" size={26} color="#fff" /></TouchableOpacity>
      <View style={styles.headerInfo}>
        <Text style={styles.headerTitle} numberOfLines={1}>{chapter ? chapter.title : `فصل ${chapterId}`}</Text>
        <Text style={styles.headerSubtitle}>{getHeaderSubtitle()}</Text>
      </View>
    </View>
  </Animated.View>

  {/* Platforms */}
  {Platform.OS === 'web' ? (
      <iframe srcDoc={webHtml} style={{ flex: 1, border: 'none', backgroundColor: bgColor, width: '100%', height: '100%' }} />
  ) : Platform.OS === 'ios' ? (
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: baseHtml }}
        style={{ backgroundColor: bgColor, flex: 1 }}
        onMessage={onMessage}
        scrollEnabled={true}
        bounces={true}
        decelerationRate="normal"
        alwaysBounceVertical={true}
        showsVerticalScrollIndicator={false}
      />
  ) : (
      renderAndroidContent()
  )}

  {/* Bottom Bar */}
  <Animated.View style={[styles.bottomBar, { opacity: fadeAnim, paddingBottom: Math.max(insets.bottom, 20), transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [100, 0] }) }] }]} pointerEvents={showMenu ? 'auto' : 'none'}>
    <View style={styles.bottomBarContent}>

      <View style={styles.topIconsRow}>
          <TouchableOpacity onPress={openLeftDrawer} style={styles.circleIconBtn}>
              <Ionicons name="list" size={24} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setPanelTab('book'); setShowPanel(true); }} style={styles.circleIconBtn}>
              <Ionicons name="settings-outline" size={24} color="#fff" />
          </TouchableOpacity>
      </View>

      <View style={styles.navigationGroup}>
        <TouchableOpacity
            style={[styles.navButton, styles.prevButton]}
            onPress={() => navigateNextPrev(-1)}
        >
          <Ionicons name="chevron-forward" size={20} color="#fff" />
          <Text style={styles.prevText}>السابق</Text>
        </TouchableOpacity>

        <TouchableOpacity
            style={[styles.navButton, styles.nextButton]}
            onPress={() => navigateNextPrev(1)}
        >
          <Text style={styles.nextText}>التالي</Text>
          <Ionicons name="chevron-back" size={20} color="#000" />
        </TouchableOpacity>
      </View>

    </View>
  </Animated.View>

  {/* Drawers Container */}
  {drawerMode !== 'none' && (
      <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
          <TouchableWithoutFeedback onPress={closeDrawers}><Animated.View style={[styles.drawerBackdrop, { opacity: backdropAnim }]} /></TouchableWithoutFeedback>

          {/* Left Drawer (Chapters) */}
          <Animated.View style={[styles.drawerContent, {
              left: 0,
              right: 0,
              bottom: 0,
              height: BOTTOM_DRAWER_HEIGHT,
              borderTopWidth: 1,
              borderTopColor: '#333',
              paddingTop: 20,
              paddingBottom: insets.bottom + 20,
              transform: [{ translateY: slideAnim }]
          }]}>
              <View style={styles.drawerHeader}>
                  <TouchableOpacity onPress={closeDrawers}><Ionicons name="close" size={24} color="#888" /></TouchableOpacity>
                  <Text style={styles.drawerTitle}>الفصول ({sortedChapters.length})</Text>
                  <TouchableOpacity onPress={toggleSort} style={styles.sortButton}><Ionicons name={isAscending ? "arrow-down" : "arrow-up"} size={18} color="#4a7cc7" /></TouchableOpacity>
              </View>
              {loadingChapters ? (
                  <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><ActivityIndicator color="#4a7cc7" /></View>
              ) : (
                  <FlatList ref={flatListRef} data={sortedChapters} keyExtractor={(item) => item._id || item.number.toString()} renderItem={renderChapterItem} initialNumToRender={20} contentContainerStyle={styles.drawerList} showsVerticalScrollIndicator={true} indicatorStyle="white" />
              )}
          </Animated.View>

          {/* Right Drawer (Replacements OR Cleaner OR Copyright) */}
          {!isOfflineMode && (
          <Animated.View style={[styles.drawerContent, { right: 0, left: width * 0.15, top: 0, bottom: 0, borderLeftWidth: 1, borderLeftColor: '#333', paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, transform: [{ translateX: slideAnimRight }] }]}>
              {drawerMode === 'replacements' && (
                  <View style={{flex: 1}}>
                      {replacementViewMode === 'folders' && (
                          <View style={{flex: 1}}>
                              <View style={styles.drawerHeader}>
                                  <Text style={styles.drawerTitle}>مجلدات الاستبدال</Text>
                                  <TouchableOpacity onPress={closeDrawers}><Ionicons name="close" size={24} color="#888" /></TouchableOpacity>
                              </View>
                              <View style={styles.inputContainer}>
                                  <TouchableOpacity style={styles.addButton} onPress={() => { setNewFolderName(novel.title || ''); setShowFolderModal(true); }}>
                                      <Text style={styles.addButtonText}>إضافة مجلد جديد</Text>
                                      <Ionicons name="add-circle-outline" size={20} color="#fff" />
                                  </TouchableOpacity>
                              </View>
                              <FlatList data={folders} keyExtractor={(item) => item.id} renderItem={renderFolderItem} contentContainerStyle={styles.drawerList} />
                          </View>
                      )}
                      {replacementViewMode === 'list' && (
                          <View style={{flex: 1}}>
                              <View style={styles.drawerHeader}>
                                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                                      <TouchableOpacity onPress={backToFolders}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
                                      <Text style={styles.drawerTitle}>{folders.find(f => f.id === currentFolderId)?.name || 'كلمات'}</Text>
                                  </View>
                                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                                      <TouchableOpacity onPress={toggleSortOrder} style={styles.sortButton}><Ionicons name={replaceSortDesc ? "arrow-up" : "arrow-down"} size={18} color="#4a7cc7" /></TouchableOpacity>
                                      <TouchableOpacity onPress={closeDrawers}><Ionicons name="close" size={24} color="#888" /></TouchableOpacity>
                                  </View>
                              </View>
                              {/* Search Bar */}
                              <View style={{paddingHorizontal: 15, paddingBottom: 10}}>
                                  <View style={styles.searchBar}>
                                      <Ionicons name="search" size={16} color="#666" />
                                      <TextInput
                                          style={styles.searchInput}
                                          placeholder="بحث..."
                                          placeholderTextColor="#666"
                                          value={replaceSearch}
                                          onChangeText={setReplaceSearch}
                                      />
                                      {replaceSearch.length > 0 && (
                                          <TouchableOpacity onPress={() => setReplaceSearch('')}>
                                              <Ionicons name="close-circle" size={16} color="#666" />
                                          </TouchableOpacity>
                                      )}
                                  </View>
                              </View>
                              <View style={styles.inputContainer}>
                                 <View style={styles.inputRow}>
                                    <TextInput style={styles.textInput} placeholder="الكلمة الأصلية" placeholderTextColor="#666" value={newOriginal} onChangeText={setNewOriginal}/>
                                    <Ionicons name="arrow-down" size={20} color="#444" />
                                    <TextInput style={styles.textInput} placeholder="الكلمة البديلة" placeholderTextColor="#666" value={newReplacement} onChangeText={setNewReplacement}/>
                                 </View>
                                 <View style={{flexDirection: 'row', gap: 8}}>
                                     <TouchableOpacity style={[styles.addButton, {flex: 1}]} onPress={handleAddReplacement}>
                                         <Text style={styles.addButtonText}>{editingId !== null ? "تحديث" : "إضافة"}</Text>
                                         <Ionicons name={editingId !== null ? "save-outline" : "add-circle-outline"} size={20} color="#fff" />
                                     </TouchableOpacity>
                                     {editingId !== null && (
                                         <TouchableOpacity style={[styles.addButton, {backgroundColor: '#555', flex: 0}]} onPress={handleCancelEditReplacement}>
                                             <Ionicons name="close-outline" size={20} color="#fff" />
                                         </TouchableOpacity>
                                     )}
                                 </View>
                              </View>
                              <FlatList data={filteredSortedReplacements} keyExtractor={(item, idx) => idx.toString()} renderItem={renderReplacementItem} contentContainerStyle={styles.drawerList} />
                          </View>
                      )}
                  </View>
              )}
              {drawerMode === 'cleaner' && (
                  <View style={{flex: 1}}>
                      <View style={styles.drawerHeader}>
                          <Text style={[styles.drawerTitle, {color: '#ff4444'}]}>الحذف الشامل</Text>
                          <TouchableOpacity onPress={closeDrawers}><Ionicons name="close" size={24} color="#888" /></TouchableOpacity>
                      </View>
                      <View style={styles.inputContainer}>
                         <TextInput style={[styles.textInput, {height: 120, textAlignVertical: 'top'}]} placeholder="النص..." placeholderTextColor="#666" value={newCleanerWord} onChangeText={setNewCleanerWord} multiline/>
                         <View style={{flexDirection: 'row', gap: 8, marginTop: 10}}>
                             <TouchableOpacity style={[styles.addButton, {backgroundColor: '#b91c1c', flex: 1}]} onPress={handleExecuteCleaner} disabled={cleaningLoading}>
                                 {cleaningLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.addButtonText}>{cleanerEditingId !== null ? 'تحديث' : 'تنفيذ الحذف'}</Text>}
                             </TouchableOpacity>
                             {cleanerEditingId !== null && (
                                 <TouchableOpacity style={[styles.addButton, {backgroundColor: '#555', flex: 0}]} onPress={handleCancelEditCleaner}>
                                     <Ionicons name="close-outline" size={20} color="#fff" />
                                 </TouchableOpacity>
                             )}
                         </View>
                      </View>
                      <FlatList data={cleanerWords} keyExtractor={(_, index) => index.toString()} renderItem={renderCleanerItem} contentContainerStyle={styles.drawerList} />
                  </View>
              )}
              {drawerMode === 'copyright' && (
                  <View style={{flex: 1}}>
                      <View style={styles.drawerHeader}>
                          <Text style={[styles.drawerTitle, {color: '#4a7cc7'}]}>حقوق التطبيق</Text>
                          <TouchableOpacity onPress={closeDrawers}><Ionicons name="close" size={24} color="#888" /></TouchableOpacity>
                      </View>
                      <ScrollView contentContainerStyle={{padding: 15, paddingBottom: 100}} style={{flex: 1}}>
                          <View style={{marginBottom: 20}}>
                              <Text style={styles.cardSectionTitle}>تكرار الظهور</Text>
                              <View style={{flexDirection:'row-reverse', flexWrap:'wrap', gap: 10, marginBottom:10}}>
                                  {['always', 'random', 'every_x'].map(freq => (
                                      <TouchableOpacity
                                          key={freq}
                                          style={[styles.freqBtn, copyrightFrequency === freq && styles.freqBtnActive]}
                                          onPress={() => setCopyrightFrequency(freq)}
                                      >
                                          <Text style={[styles.freqBtnText, copyrightFrequency === freq && {color:'#fff'}]}>
                                              {freq === 'always' ? 'دائماً' : freq === 'random' ? 'عشوائي' : 'كل عدد فصول'}
                                          </Text>
                                      </TouchableOpacity>
                                  ))}
                              </View>
                              {copyrightFrequency === 'every_x' && (
                                  <View style={{flexDirection:'row-reverse', alignItems:'center', gap:10}}>
                                      <Text style={{color:'#ccc'}}>كل</Text>
                                      <TextInput
                                          style={[styles.textInput, {width: 60, textAlign:'center'}]}
                                          value={copyrightEveryX}
                                          onChangeText={setCopyrightEveryX}
                                          keyboardType='numeric'
                                      />
                                      <Text style={{color:'#ccc'}}>فصل</Text>
                                  </View>
                              )}
                          </View>

                          <View style={{marginBottom: 20}}>
                              <Text style={styles.cardSectionTitle}>اللون (Hex)</Text>
                              <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10}}>
                                <View style={{width: 30, height: 30, backgroundColor: copyrightStyle.color, borderRadius: 15, borderWidth: 1, borderColor: '#fff'}} />
                                <TextInput
                                    style={[styles.textInput, {flex: 1, textAlign: 'left'}]}
                                    placeholder="#RRGGBB"
                                    value={hexColorInput}
                                    onChangeText={(text) => {
                                        setHexColorInput(text);
                                        if (/^#[0-9A-F]{6}$/i.test(text)) {
                                            setCopyrightStyle(prev => ({...prev, color: text}));
                                        }
                                    }}
                                />
                              </View>

                              <Text style={styles.cardSectionTitle}>اختر لوناً</Text>
                              <View style={styles.colorPalette}>
                                  {ADVANCED_COLORS.map((c) => (
                                      <TouchableOpacity
                                          key={c.color}
                                          style={[styles.paletteCircle, {backgroundColor: c.color}, copyrightStyle.color === c.color && styles.paletteCircleActive]}
                                          onPress={() => {
                                               setCopyrightStyle(prev => ({...prev, color: c.color}));
                                               setHexColorInput(c.color);
                                          }}
                                      />
                                  ))}
                              </View>

                              <View style={styles.sliderRow}>
                                  <Text style={styles.sliderLabel}>{copyrightStyle.fontSize}px</Text>
                                  <CustomSlider
                                      minimumValue={10}
                                      maximumValue={30}
                                      step={1}
                                      value={copyrightStyle.fontSize}
                                      onValueChange={(val) => setCopyrightStyle(prev => ({...prev, fontSize: val}))}
                                      activeColor="#4a7cc7"
                                  />
                                  <Text style={styles.sliderTitle}>حجم الخط</Text>
                              </View>

                              <View style={styles.sliderRow}>
                                  <Text style={styles.sliderLabel}>{(copyrightStyle.opacity * 100).toFixed(0)}%</Text>
                                  <CustomSlider
                                      minimumValue={0.1}
                                      maximumValue={1}
                                      step={0.1}
                                      value={copyrightStyle.opacity}
                                      onValueChange={(val) => setCopyrightStyle(prev => ({...prev, opacity: val}))}
                                      activeColor="#4a7cc7"
                                  />
                                  <Text style={styles.sliderTitle}>الشفافية</Text>
                              </View>

                              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15}}>
                                  <View style={{flexDirection: 'row', gap: 10}}>
                                      {['left', 'center', 'right'].map(align => (
                                          <TouchableOpacity
                                            key={align}
                                            style={[styles.alignBtn, copyrightStyle.alignment === align && styles.alignBtnActive]}
                                            onPress={() => setCopyrightStyle(prev => ({...prev, alignment: align}))}
                                          >
                                              <Ionicons name={`options-outline`} size={16} color={copyrightStyle.alignment === align ? '#fff' : '#666'} />
                                          </TouchableOpacity>
                                      ))}
                                  </View>
                                  <Text style={styles.sliderTitle}>المحاذاة</Text>
                              </View>

                              <View style={styles.toggleRow}>
                                  <Switch
                                      value={copyrightStyle.isBold}
                                      onValueChange={(val) => setCopyrightStyle(prev => ({...prev, isBold: val}))}
                                      trackColor={{ false: "#333", true: "#4a7cc7" }}
                                      thumbColor={"#fff"}
                                  />
                                  <Text style={styles.toggleLabel}>خط عريض (Bold)</Text>
                              </View>
                          </View>

                          <Text style={styles.listLabel}>سيظهر هذا النص في بداية كل فصل</Text>
                          <TextInput
                              style={[styles.textInput, {height: 100, textAlignVertical: 'top', marginBottom: 20}]}
                              placeholder="مثال: حقوق النشر محفوظة لتطبيق زيوس..."
                              placeholderTextColor="#666"
                              value={copyrightStartText}
                              onChangeText={setCopyrightStartText}
                              multiline
                          />

                          <View style={{marginBottom: 20, borderTopWidth: 1, borderTopColor: '#333', paddingTop: 20}}>
                              <View style={styles.toggleRow}>
                                  <Switch
                                      value={enableSeparator}
                                      onValueChange={setEnableSeparator}
                                      trackColor={{ false: "#333", true: "#4a7cc7" }}
                                      thumbColor={"#fff"}
                                  />
                                  <Text style={[styles.toggleLabel, {fontWeight: 'bold'}]}>تفعيل الخط الفاصل تحت العنوان</Text>
                              </View>
                              <Text style={{color: '#888', fontSize: 10, textAlign: 'right', marginBottom: 10}}>
                                  سيتم وضع النص المخصص تحت عنوان الفصل مباشرة.
                              </Text>

                              <Text style={styles.listLabel}>نص الخط الفاصل</Text>
                              <TextInput
                                  style={[styles.textInput, {textAlign: 'center', letterSpacing: 2}]}
                                  placeholder="__________________"
                                  placeholderTextColor="#666"
                                  value={separatorText}
                                  onChangeText={setSeparatorText}
                              />
                          </View>

                          <Text style={styles.listLabel}>سيظهر هذا النص في نهاية كل فصل</Text>
                          <TextInput
                              style={[styles.textInput, {height: 100, textAlignVertical: 'top', marginBottom: 20}]}
                              placeholder="مثال: شكراً للقراءة على تطبيق زيوس..."
                              placeholderTextColor="#666"
                              value={copyrightEndText}
                              onChangeText={setCopyrightEndText}
                              multiline
                          />

                          <TouchableOpacity style={[styles.addButton, {backgroundColor: '#4a7cc7'}]} onPress={handleSaveCopyrights} disabled={copyrightLoading}>
                             {copyrightLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.addButtonText}>حفظ الحقوق</Text>}
                          </TouchableOpacity>
                          <Text style={{color:'#666', fontSize:11, marginTop:10, textAlign:'center'}}>
                              ملاحظة: هذا التغيير سيطبق فوراً على جميع فصول التطبيق.
                          </Text>
                      </ScrollView>
                  </View>
              )}
          </Animated.View>
          )}
      </View>
  )}

  <Modal visible={showFolderModal} transparent animationType="fade" onRequestClose={() => setShowFolderModal(false)}>
      <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>اسم المجلد</Text>
              <TextInput style={styles.modalInput} placeholder="اسم الرواية" placeholderTextColor="#666" value={newFolderName} onChangeText={setNewFolderName} textAlign="right"/>
              <View style={styles.modalButtons}>
                  <TouchableOpacity style={[styles.modalBtn, {backgroundColor: '#333'}]} onPress={() => setShowFolderModal(false)}><Text style={styles.modalBtnText}>إلغاء</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.modalBtn, {backgroundColor: '#4a7cc7'}]} onPress={handleCreateFolder}><Text style={styles.modalBtnText}>تم</Text></TouchableOpacity>
              </View>
          </View>
      </View>
  </Modal>

  {/* Comments Modal */}
  <Modal visible={showComments} transparent animationType="slide" onRequestClose={() => setShowComments(false)}>
      <View style={styles.commentsModalContainer}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowComments(false)} />
          <View style={styles.commentsSheet}>
              <View style={styles.commentsHandle} />
              <View style={styles.commentsHeader}>
                  <Text style={styles.commentsTitle}>تعليقات الفصل {chapterId}</Text>
                  <TouchableOpacity onPress={() => setShowComments(false)}><Ionicons name="close-circle" size={28} color="#555" /></TouchableOpacity>
              </View>
              <CommentsSection novelId={novelId} user={userInfo} chapterNumber={currentViewedChapter} />
          </View>
      </View>
  </Modal>

  {/* Reading tools panel (اللوحة) */}
  <NativeReaderPanel
    visible={showPanel}
    onClose={() => setShowPanel(false)}
    tab={panelTab}
    onTab={setPanelTab}
    isAdmin={isAdmin}
    onNovelPage={() => { setShowPanel(false); navigation.goBack(); }}
    onChapters={() => { setShowPanel(false); openLeftDrawer(); }}
    onWords={() => { setShowPanel(false); openRightDrawer('replacements'); }}
    isFavorite={isFavorite}
    onToggleFavorite={toggleFavorite}
    fontSize={fontSize}
    onChangeFontSize={changeFontSize}
    textBrightness={textBrightness}
    onChangeBrightness={(val) => { setTextBrightness(val); saveSettings({ textBrightness: val }); }}
    fontFamily={fontFamily}
    fonts={FONT_OPTIONS}
    onFontChange={handleFontChange}
    bgColor={bgColor}
    textColor={textColor}
    bgColorHexInput={bgColorHexInput}
    textColorHexInput={textColorHexInput}
    onBgHexChange={handleBgColorHexChange}
    onTextHexChange={handleTextColorHexChange}
    onBgPreset={changeTheme}
    onTextPreset={handleTextColorPreset}
    fmt={fmtSettings}
    onSaveFmt={saveFmt}
    continuousMode={continuousMode}
    onChangeContinuous={(val) => { setContinuousMode(val); saveSettings({ continuousMode: val }); }}
    enableSeparator={enableSeparator}
    onChangeSeparator={(val) => { setEnableSeparator(val); saveSettings({ enableSeparator: val }); }}
    separatorText={separatorText}
    onChangeSeparatorText={(val) => { setSeparatorText(val); saveSettings({ separatorText: val }); }}
    keepAwake={keepAwake}
    onChangeKeepAwake={(val) => { setKeepAwake(val); saveSettings({ keepAwake: val }); }}
    onOpenCleaner={() => { setShowPanel(false); openRightDrawer('cleaner'); }}
    onOpenCopyright={() => { setShowPanel(false); openRightDrawer('copyright'); }}
    reportSelected={reportSelected}
    onToggleReportType={toggleReportType}
    reportDetails={reportDetails}
    onChangeReportDetails={setReportDetails}
    onSubmitReport={submitReport}
  />

</View>
);
}

const styles = StyleSheet.create({
container: { flex: 1 },
loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
loadingText: { marginTop: 15, fontSize: 16 },
topBar: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(15,15,15,0.97)', zIndex: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
topBarContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 12 },
iconButton: { padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
headerInfo: { flex: 1, alignItems: 'flex-end', marginRight: 15 },
headerTitle: { color: '#fff', fontWeight: 'bold', fontSize: 17 },
headerSubtitle: { color: '#999', fontSize: 13 },
bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15,15,15,0.97)', zIndex: 10 },
bottomBarContent: { flexDirection: 'column', paddingHorizontal: 20, paddingTop: 15, gap: 15 },
topIconsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
circleIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
navigationGroup: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', gap: 15 },
navButton: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, gap: 5, justifyContent: 'center' },
prevButton: { backgroundColor: '#1a1a1a' },
nextButton: { backgroundColor: '#fff' },
prevText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
nextText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', alignItems: 'center' },
modalBackdrop: { ...StyleSheet.absoluteFillObject },
settingsSheet: { backgroundColor: '#000', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 20, width: '100%', minHeight: 500, maxHeight: '90%' },
settingsHandle: { width: 40, height: 5, backgroundColor: '#333', borderRadius: 3, alignSelf: 'center', marginVertical: 12 },
settingsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
settingsTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
settingsGrid: { gap: 15 },
settingsCard: { flexDirection: 'column', alignItems: 'center', backgroundColor: '#161616', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#333' },
cardIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#333', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
cardTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
cardSub: { color: '#888', fontSize: 12 },
settingSection: { marginBottom: 20 },
settingLabel: { color: '#888', fontSize: 13, marginBottom: 12, textAlign: 'right' },
settingRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 30 },
fontSizeBtn: { backgroundColor: '#333', width: 45, height: 45, borderRadius: 22.5, alignItems: 'center', justifyContent: 'center' },
fontSizeDisplay: { color: '#fff', fontSize: 22, fontWeight: 'bold', minWidth: 40, textAlign: 'center' },
fontScroll: { flexDirection: 'row-reverse', paddingVertical: 5 },
fontOptionBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: '#262626', marginLeft: 10, borderWidth: 1, borderColor: '#333' },
fontOptionBtnActive: { backgroundColor: '#4a7cc7', borderColor: '#4a7cc7' },
fontOptionText: { color: '#aaa', fontSize: 14 },
fontOptionTextActive: { color: '#fff', fontWeight: 'bold' },
themeRow: { flexDirection: 'row', justifyContent: 'space-around' },
themeContainer: { alignItems: 'center', gap: 8 },
themeOption: { width: 50, height: 50, borderRadius: 25 },
themeName: { color: '#888', fontSize: 12 },
drawerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
drawerContent: { position: 'absolute', backgroundColor: '#161616', shadowColor: '#000', shadowOffset: { width: 5, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 20 },
drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#2a2a2a', marginBottom: 5 },
drawerTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
sortButton: { padding: 5, backgroundColor: 'rgba(74, 124, 199, 0.1)', borderRadius: 8 },
drawerList: { paddingHorizontal: 10 },
drawerItem: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#222', justifyContent: 'space-between' },
drawerItemActive: { backgroundColor: 'rgba(74, 124, 199, 0.15)', borderRadius: 8, borderBottomColor: 'transparent', borderWidth: 1, borderColor: 'rgba(74, 124, 199, 0.3)' },
drawerItemTitle: { color: '#ccc', fontSize: 14, textAlign: 'right', marginBottom: 2 },
drawerItemTextActive: { color: '#4a7cc7', fontWeight: 'bold' },
drawerItemSubtitle: { color: '#666', fontSize: 11, textAlign: 'right' },
commentsModalContainer: { flex: 1, justifyContent: 'flex-end' },
commentsSheet: { height: '80%', backgroundColor: '#0a0a0a', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
commentsHandle: { width: 40, height: 5, backgroundColor: '#333', borderRadius: 3, alignSelf: 'center', marginTop: 10 },
commentsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#222' },
commentsTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
androidTitle: { fontWeight: 'bold', textAlign: 'center', marginBottom: 30, borderBottomWidth: 1, borderBottomColor: 'rgba(128,128,128,0.3)', paddingBottom: 15 },
androidAuthorCard: { backgroundColor: '#111', padding: 20, borderRadius: 12, marginBottom: 20, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
androidCommentBtn: { padding: 15, borderRadius: 8, borderWidth: 1, alignItems: 'center', marginBottom: 50 },
inputContainer: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#333', marginBottom: 10 },
inputRow: { flexDirection: 'column', gap: 10, marginBottom: 15 },
textInput: { backgroundColor: '#222', color: '#fff', borderRadius: 8, padding: 12, textAlign: 'right', fontSize: 14, borderWidth: 1, borderColor: '#333' },
addButton: { backgroundColor: '#4a7cc7', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 8, gap: 8 },
addButtonText: { color: '#fff', fontWeight: 'bold' },
listLabel: { color: '#666', fontSize: 12, textAlign: 'right', marginRight: 15, marginBottom: 10 },
replacementItem: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#333' },
replacementItemEditing: { borderColor: '#4a7cc7', backgroundColor: '#1a2a3a' },
replacementInfo: { flex: 1, alignItems: 'flex-end' },
replacementText: { color: '#ddd', fontSize: 14, textAlign: 'right' },
replacementActions: { flexDirection: 'column', gap: 8, paddingRight: 10, borderRightWidth: 1, borderRightColor: '#333' },
actionBtn: { padding: 5 },
emptyText: { color: '#555', textAlign: 'center', marginTop: 50, fontSize: 14 },
alertBox: { backgroundColor: 'rgba(255, 68, 68, 0.1)', borderColor: '#ff4444', borderWidth: 1, borderRadius: 8, padding: 10, flexDirection: 'row-reverse', gap: 10, margin: 15, alignItems: 'center' },
alertText: { color: '#ff4444', fontSize: 12, flex: 1, textAlign: 'right' },
modalContent: { width: '80%', backgroundColor: '#1a1a1a', borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
modalInput: { width: '100%', backgroundColor: '#222', color: '#fff', borderRadius: 8, padding: 12, textAlign: 'right', marginBottom: 20, borderWidth: 1, borderColor: '#333' },
modalButtons: { flexDirection: 'row', gap: 10, width: '100%' },
modalBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
modalBtnText: { color: '#fff', fontWeight: 'bold' },
searchBar: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#222', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, gap: 5, borderWidth: 1, borderColor: '#333' },
searchInput: { flex: 1, color: '#fff', textAlign: 'right', fontSize: 14 },

// --- REDESIGNED SETTINGS STYLES ---
designCard: { backgroundColor: '#111', borderRadius: 16, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: '#222' },
cardSectionTitle: { color: '#888', fontSize: 13, marginBottom: 12, textAlign: 'right', fontWeight: '600', letterSpacing: 0.5 },
fontList: { flexDirection: 'row-reverse', paddingVertical: 5 },
fontPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#1a1a1a', marginLeft: 10, borderWidth: 1, borderColor: '#333', minWidth: 80, alignItems: 'center' },
fontPillActive: { backgroundColor: '#4a7cc7', borderColor: '#4a7cc7' },
fontPillText: { color: '#888', fontSize: 13, fontWeight: '500' },
fontPillTextActive: { color: '#fff', fontWeight: 'bold' },
sizeControlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 12, padding: 5 },
sizeBtn: { width: 50, height: 45, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#222' },
sizeValue: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
themeGrid: { flexDirection: 'row-reverse', gap: 15, justifyContent: 'flex-start' },
themeCircle: { width: 45, height: 45, borderRadius: 22.5, borderWidth: 2, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
themeCircleActive: { borderColor: '#4a7cc7', borderWidth: 2 },

// --- ADVANCED FORMATTING STYLES ---
advancedCard: { backgroundColor: '#0f0f0f', borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#222' },
advancedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
advancedTitle: { color: '#4ade80', fontSize: 16, fontWeight: 'bold', letterSpacing: 0.5 },
previewRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 5 },
previewBox: { flexGrow: 1, paddingVertical: 10, paddingHorizontal: 15, borderRadius: 10, backgroundColor: '#161616', borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center', minWidth: '18%' },
previewText: { color: '#666', fontSize: 14, fontWeight: '600' },
colorPalette: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25, flexWrap: 'wrap', gap: 5 },
paletteCircle: { width: 32, height: 32, borderRadius: 16 },
paletteCircleActive: { borderWidth: 2, borderColor: '#fff' },
sliderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 25, gap: 10 },
sliderLabel: { color: '#4ade80', fontSize: 14, fontWeight: 'bold', width: 40 },
sliderTitle: { color: '#888', fontSize: 12, width: 70, textAlign: 'right' },
toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#161616', padding: 15, borderRadius: 12 },
toggleLabel: { color: '#888', fontSize: 13 },
alignBtn: { padding: 8, backgroundColor: '#1a1a1a', borderRadius: 8, borderWidth: 1, borderColor: '#333' },
alignBtnActive: { backgroundColor: '#4a7cc7', borderColor: '#4a7cc7' },
freqBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333' },
freqBtnActive: { backgroundColor: '#4a7cc7', borderColor: '#4a7cc7' },
freqBtnText: { color: '#888', fontSize: 12, fontWeight: 'bold' },
scrollSettingsContainer: { paddingBottom: 50 },

// --- ERROR STATE STYLES ---
errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
errorTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 20, marginBottom: 10 },
errorMessage: { color: '#999', fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 30 },
errorBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', paddingVertical: 14, paddingHorizontal: 30, borderRadius: 12, width: '100%', marginBottom: 12 },
errorBtnSecondary: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333' },
errorBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
errorBtnTextDark: { color: '#000', fontWeight: 'bold', fontSize: 16 },
});