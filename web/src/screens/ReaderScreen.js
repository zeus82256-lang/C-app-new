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

const { width, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAWER_WIDTH = width * 0.85;
const BOTTOM_DRAWER_HEIGHT = SCREEN_HEIGHT * 0.5;

const ZEUS_SECRET = "Z3uS_N0v3l_2026_S3cr3t_K3y";

// ---------- Fixed decryptContent ----------
const decryptContent = (encoded) => {
    try {
        if (!encoded) return "";

        const safeAtob = (str) => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
            let output = '';
            let i = 0;
            str = str.replace(/=+$/, '');
            while (i < str.length) {
                const a = chars.indexOf(str.charAt(i++));
                const b = chars.indexOf(str.charAt(i++));
                const c = chars.indexOf(str.charAt(i++));
                const d = chars.indexOf(str.charAt(i++));
                if (a !== -1 && b !== -1) {
                    const bytes = (a << 2) | (b >> 4);
                    output += String.fromCharCode(bytes);
                    if (c !== -1) {
                        const bytes2 = ((b & 15) << 4) | (c >> 2);
                        output += String.fromCharCode(bytes2);
                        if (d !== -1) {
                            const bytes3 = ((c & 3) << 6) | d;
                            output += String.fromCharCode(bytes3);
                        }
                    }
                }
            }
            return output;
        };

        const binaryStr = safeAtob(encoded);
        let result = "";

        for (let i = 0; i < binaryStr.length; i++) {
            let charCode = binaryStr.charCodeAt(i);
            charCode = (charCode - 3 + 256) % 256;
            const offset = (i * 7) % 13;
            charCode = (charCode - offset + 256) % 256;
            charCode = charCode ^ ZEUS_SECRET.charCodeAt(i % ZEUS_SECRET.length);
            result += String.fromCharCode(charCode);
        }

        return decodeURIComponent(result);
    } catch (e) {
        console.warn("Decryption error:", e);
        return encoded;
    }
};

const obfuscate = (text) => {
    try {
        const encoded = encodeURIComponent(text);
        let result = "";
        for (let i = 0; i < encoded.length; i++) {
            result += String.fromCharCode(encoded.charCodeAt(i) ^ ZEUS_SECRET.charCodeAt(i % ZEUS_SECRET.length));
        }
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        let output = '';
        for (let block, charCode, idx = 0, map = chars; result.charAt(idx | 0) || (map = '=', idx % 1); output += map.charAt(63 & block >> 8 - idx % 1 * 8)) {
            charCode = result.charCodeAt(idx += 3 / 4);
            if (charCode > 0xFF) throw new Error("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
            block = block << 8 | charCode;
        }
        return output;
    } catch (e) {
        return text;
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

const BG_COLOR_PRESETS = [
    { color: '#0a0a0a', name: 'أسود' },
    { color: '#2d2d2d', name: 'داكن' },
    { color: '#1a1a2e', name: 'كحلي' },
    { color: '#1a0a0a', name: 'أحمر داكن' },
    { color: '#0a1a0a', name: 'أخضر داكن' },
    { color: '#0a0a1a', name: 'أزرق داكن' },
    { color: '#ffffff', name: 'أبيض' },
    { color: '#f5f0e8', name: 'بيج' },
    { color: '#e8f4f0', name: 'نعناع فاتح' },
    { color: '#fdf6e3', name: 'كريمي' },
];

const QUOTE_STYLES = [
    { id: 'all', label: 'بدون', preview: 'لا شيء' },
    { id: 'guillemets', label: '« »', preview: '«نص»' },
    { id: 'curly', label: '“ ”', preview: '“نص”' },
    { id: 'straight', label: '" "', preview: '"نص"' },
    { id: 'single', label: '‘ ’', preview: '‘نص’' },
];

export default function ReaderScreen({ route, navigation }) {
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
const [showSettings, setShowSettings] = useState(false);
const [settingsView, setSettingsView] = useState('main');
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

const insets = useSafeAreaInsets();
const webViewRef = useRef(null);
const flatListRef = useRef(null);
const androidListRef = useRef(null);

const novelId = novel._id || novel.id || novel.novelId;
const isAdmin = userInfo?.role === 'admin';

useEffect(() => {
    loadSettings();
    loadFoldersAndPrefs();
    if (!isOfflineMode) {
        fetchAuthorData();
        if (isAdmin) {
            fetchCleanerWords();
            fetchCopyrights();
        }
    }
}, []);

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

const getProcessedContent = useMemo(() => {
    if (!chapter || !chapter.content) return '';
    let content = decryptContent(chapter.content);
    activeReplacementsList.forEach(rep => {
        if (rep.original && rep.replacement) {
            const escapedOriginal = rep.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedOriginal, 'g');
            content = content.replace(regex, rep.replacement);
        }
    });
    return content;
}, [chapter, activeReplacementsList]);

const updateProgressOnServer = async (currentChapter) => {
  if (!currentChapter || isOfflineMode) return;
  try {
    await api.post('/api/novel/update', {
      novelId: novelId,
      title: novel.title,
      cover: novel.cover,
      author: novel.author || novel.translator,
      lastChapterId: parseInt(chapterId),
      lastChapterTitle: currentChapter.title
    });
  } catch (error) {
    console.error("Failed to update progress on server");
  }
};

const fetchChapter = async () => {
    setLoading(true);
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

        setChapter(chapterData);
        if (availableChapters) {
             setRealTotalChapters(availableChapters.length);
        } else if (chapterData.totalChapters) {
            setRealTotalChapters(chapterData.totalChapters);
        }

        if (!isOfflineMode) {
            incrementView(novelId, chapterId);
            updateProgressOnServer(chapterData);
            fetchCommentCount();
        }
    } catch (error) {
        console.error("Error fetching chapter:", error);
        Alert.alert("خطأ", "فشل تحميل الفصل. تأكد من اتصالك أو أن الفصل منزّل.");
    } finally {
        setLoading(false);
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
    setShowSettings(false);
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
    if (availableChapters && availableChapters.length > 0) {
        const currentNum = parseInt(chapterId);
        const sortedAvailable = [...availableChapters].sort((a,b) => a - b);
        const currentIndex = sortedAvailable.indexOf(currentNum);
        if (currentIndex === -1) return;
        const nextIndex = currentIndex + offset;
        if (nextIndex >= 0 && nextIndex < sortedAvailable.length) {
            const nextChapId = sortedAvailable[nextIndex];
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
        navigation.replace('Reader', { novel, chapterId: nextNum, isOfflineMode });
    }
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

const androidTextLines = useMemo(() => {
  if (Platform.OS !== 'android') return [];
  return getProcessedContent.split('\n').filter(line => line.trim() !== '');
}, [getProcessedContent]);

const generateHTML = () => {
if (!chapter) return '';

const startCopy = chapter.copyrightStart;
const endCopy = chapter.copyrightEnd;
const style = chapter.copyrightStyles || {};

const copyrightCSS = `
    color: ${style.color || '#888'};
    opacity: ${style.opacity || 1};
    text-align: ${style.alignment || 'center'};
    font-weight: ${style.isBold ? 'bold' : 'normal'};
    font-size: ${style.fontSize || 14}px;
    line-height: 1.5;
    padding: 15px 0;
    margin: 10px 0;
    font-family: sans-serif;
`;

const dividerCSS = `
    .chapter-divider {
        border: none;
        height: 1px;
        background-color: rgba(128,128,128,0.3);
        margin: 10px 0 30px 0;
        width: 100%;
    }
`;

const customSeparatorHTML = enableSeparator ? `<div style="text-align:center; color: rgba(128,128,128,0.5); font-size: ${fontSize}px; padding: 10px 0; margin: 5px 0 20px 0; letter-spacing: 2px; user-select: none;">${separatorText}</div>` : '';
const dividerHTML = `<div class="chapter-divider"></div>`;

const titleHTML = `<div class="title">${chapter.title}</div>`;

const startHTML = startCopy ? `
    <!-- START: COPYRIGHTS -->
    <div class="app-copyright start" style="${copyrightCSS}">
        ${startCopy}
    </div>
    ${dividerHTML}
` : '';

const endHTML = endCopy ? `
    ${dividerHTML}
    <!-- END: COPYRIGHTS -->
    <div class="app-copyright end" style="${copyrightCSS}">
        ${endCopy}
    </div>
` : '';

const formattedContent = getProcessedContent
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
        let processedLine = line;

        // Bracket formatting [ ]
        if (enableBracket) {
            const bracketClass = hideBracketMarks ? 'bracket-mark-hidden' : 'bracket-mark-visible';
            let openB = '', closeB = '';
            if (selectedBracketStyle === 'guillemets') { openB = '«'; closeB = '»'; }
            else if (selectedBracketStyle === 'curly') { openB = '“'; closeB = '”'; }
            else if (selectedBracketStyle === 'straight') { openB = '"'; closeB = '"'; }
            else if (selectedBracketStyle === 'single') { openB = '‘'; closeB = '’'; }

            processedLine = processedLine.replace(/\[(.*?)\]/g, (match, content) => {
                const innerStart = openB ? `<span class="bracket-quote-style">${openB}</span>` : '';
                const innerEnd = closeB ? `<span class="bracket-quote-style">${closeB}</span>` : '';
                return `<span class="bracket-formatted"><span class="${bracketClass}">[</span>${innerStart}${content}${innerEnd}<span class="${bracketClass}">]</span></span>`;
            });
        }

        // Markdown
        if (enableMarkdown) {
            const markClass = hideMarkdownMarks ? 'mark-hidden' : 'mark-visible';
            let openQuote = '', closeQuote = '';
            if (selectedMarkdownStyle === 'guillemets') { openQuote = '«'; closeQuote = '»'; }
            else if (selectedMarkdownStyle === 'curly') { openQuote = '“'; closeQuote = '”'; }
            else if (selectedMarkdownStyle === 'straight') { openQuote = '"'; closeQuote = '"'; }
            else if (selectedMarkdownStyle === 'single') { openQuote = '‘'; closeQuote = '’'; }

            processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, (match, content) => {
                const quoteStart = openQuote ? `<span class="cm-quote-style">${openQuote}</span>` : '';
                const quoteEnd = closeQuote ? `<span class="cm-quote-style">${closeQuote}</span>` : '';
                return `<span class="cm-markdown-bold"><span class="${markClass}">**</span>${quoteStart}${content}${quoteEnd}<span class="${markClass}">**</span></span>`;
            });
        }

        // Dialogue
        if (enableDialogue) {
            const quoteClass = hideQuotes ? 'quote-mark hidden' : 'quote-mark';
            let quoteRegex;
            if (selectedQuoteStyle === 'guillemets') {
                quoteRegex = /(«)([\s\S]*?)(»)/g;
            } else if (selectedQuoteStyle === 'curly') {
                quoteRegex = /([“])([\s\S]*?)([”])/g;
            } else if (selectedQuoteStyle === 'straight') {
                quoteRegex = /(")([\s\S]*?)(")/g;
            } else if (selectedQuoteStyle === 'single') {
                quoteRegex = /(['‘])([\s\S]*?)(['’])/g;
            } else {
                quoteRegex = /([“"«])([\s\S]*?)([”"»])/g;
            }

            processedLine = processedLine.replace(quoteRegex, (match, open, content, close) => {
                return `<span class="cm-dialogue-text"><span class="${quoteClass}">${open}</span>${content}<span class="${quoteClass}">${close}</span></span>`;
            });
        }

        // Custom formatting
        if (enableCustom && customOpenMark.trim() && customCloseMark.trim()) {
            const customClass = hideCustomMarks ? 'custom-mark-hidden' : 'custom-mark-visible';
            const escapedOpen = customOpenMark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const escapedClose = customCloseMark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const customRegex = new RegExp(`${escapedOpen}(.*?)${escapedClose}`, 'g');
            processedLine = processedLine.replace(customRegex, (match, content) => {
                return `<span class="custom-formatted"><span class="${customClass}">${customOpenMark}</span>${content}<span class="${customClass}">${customCloseMark}</span></span>`;
            });
        }

        return `<p>${processedLine}</p>`;
    })
    .join('');

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

const obfuscatedFinalContent = obfuscate(formattedContent);

const brightnessStyle = `filter: brightness(${textBrightness});`;

return `
  <!DOCTYPE html>
  <html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
      ${fontImports}
      * { -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; box-sizing: border-box; }
      body, html {
        margin: 0; padding: 0; background-color: ${bgColor}; color: ${textColor};
        font-family: ${fontFamily.family}; line-height: 1.8;
        -webkit-overflow-scrolling: touch;
        overflow-x: hidden;
        ${brightnessStyle}
      }
      .container { padding: 25px 20px 120px 20px; width: 100%; max-width: 800px; margin: 0 auto; }

      .title {
        font-size: ${fontSize + 8}px; font-weight: bold; margin-bottom: 20px;
        color: ${bgColor === '#fff' || bgColor === '#ffffff' ? '#000' : '#fff'};
        padding-bottom: 10px; font-family: ${fontFamily.family};
        text-align: right;
      }

      ${dividerCSS}

      .content-area { font-size: ${fontSize}px; text-align: justify; word-wrap: break-word; }
      p { margin-bottom: 1.5em; }

      .cm-dialogue-text {
          color: ${enableDialogue ? dialogueColor : 'inherit'};
          font-size: ${dialogueSize}%;
          font-weight: bold;
          transition: color 0.3s ease, font-size 0.3s ease;
      }
      .cm-markdown-bold {
          font-weight: bold;
          color: ${enableMarkdown ? markdownColor : 'inherit'};
          font-size: ${markdownSize}%;
          transition: color 0.3s ease, font-size 0.3s ease;
      }
      .cm-quote-style { opacity: 1; }
      .quote-mark { opacity: 1; transition: opacity 0.3s ease; }
      .quote-mark.hidden { opacity: 0; font-size: 0; }
      .mark-visible { opacity: 1; }
      .mark-hidden { opacity: 0; font-size: 0; }

      .bracket-formatted {
          color: ${enableBracket ? bracketColor : 'inherit'};
          font-size: ${bracketSize}%;
          font-weight: bold;
          transition: color 0.3s ease, font-size 0.3s ease;
      }
      .bracket-quote-style { opacity: 1; }
      .bracket-mark-visible { opacity: 1; }
      .bracket-mark-hidden { opacity: 0; font-size: 0; }

      .custom-formatted {
          color: ${enableCustom ? customColor : 'inherit'};
          font-size: ${customSize}%;
          font-weight: bold;
          transition: color 0.3s ease, font-size 0.3s ease;
      }
      .custom-mark-visible { opacity: 1; }
      .custom-mark-hidden { opacity: 0; font-size: 0; }

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
    </style>
  </head>
  <body>
    <div class="container" id="clickable-area">
      ${titleHTML}
      ${customSeparatorHTML}

      ${startHTML}

      <div class="content-area" id="main-content-area">
        <div style="text-align: center; padding: 20px; opacity: 0.5;">جاري التحميل الآمن...</div>
      </div>

      ${endHTML}

      ${publisherBanner}
      ${commentsButton}
    </div>
    <script>
      (function() {
          const _S = "${ZEUS_SECRET}";
          const _D = "${obfuscatedFinalContent}";

          function decrypt(encoded) {
            try {
              const text = atob(encoded);
              let result = "";
              for (let i = 0; i < text.length; i++) {
                result += String.fromCharCode(text.charCodeAt(i) ^ _S.charCodeAt(i % _S.length));
              }
              return decodeURIComponent(result);
            } catch (e) { return "خطأ في تحميل المحتوى الآمن."; }
          }

          document.getElementById('main-content-area').innerHTML = decrypt(_D);

          function sendMessage(msg) {
              if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(msg); }
              else if (window.parent) { window.parent.postMessage(msg, '*'); }
          }
          document.addEventListener('click', function(e) {
            try {
                if (e.target.closest('#commentsBtn')) { e.stopPropagation(); sendMessage('openComments'); return; }
                if (e.target.closest('#authorCard')) { e.stopPropagation(); sendMessage('openProfile'); return; }
                var selection = window.getSelection();
                if (selection && selection.toString().length > 0) return;
                sendMessage('toggleMenu');
            } catch(err) {}
          });
      })();
    </script>
  </body>
  </html>
`;
};

const onMessage = (event) => {
    if (event && event.nativeEvent && event.nativeEvent.data) {
        const msg = event.nativeEvent.data;
        if (msg === 'toggleMenu') {
            toggleMenu();
        } else if (msg === 'openComments') {
            setShowComments(true);
        } else if (msg === 'openProfile') {
            if (authorProfile && !isOfflineMode) {
                navigation.push('UserProfile', { userId: authorProfile._id });
            }
        }
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
        const index = sorted.indexOf(parseInt(chapterId));
        return `الفصل ${index + 1} من ${sorted.length}`;
    } else {
        return `الفصل ${chapterId} من ${realTotalChapters > 0 ? realTotalChapters : '؟'}`;
    }
};

const renderAndroidContent = () => (
  <View style={{ flex: 1 }}>
    <FlatList
      ref={androidListRef}
      data={androidTextLines}
      keyExtractor={(_, index) => index.toString()}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 60, paddingBottom: 150 }}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={true}
      ListHeaderComponent={() => (
        <TouchableOpacity activeOpacity={1} onPress={toggleMenu}>
          <Text style={[styles.androidTitle, { color: textColor, fontSize: fontSize + 8, fontFamily: fontFamily.id === 'Cairo' || fontFamily.id === 'Amiri' ? fontFamily.id : undefined }]}>
            {chapter ? chapter.title : ''}
          </Text>
        </TouchableOpacity>
      )}
      renderItem={({ item }) => (
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
            {item}
          </Text>
        </TouchableOpacity>
      )}
      ListFooterComponent={() => (
        <View style={{ marginTop: 30 }}>
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
      <iframe srcDoc={generateHTML()} style={{ flex: 1, border: 'none', backgroundColor: bgColor, width: '100%', height: '100%' }} />
  ) : Platform.OS === 'ios' ? (
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: generateHTML() }}
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

          <TouchableOpacity onPress={() => { setSettingsView('main'); setShowSettings(true); }} style={styles.circleIconBtn}>
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
          <Animated.View style={[styles.drawerContent, { right: 0, left: width * 0.15, borderLeftWidth: 1, borderLeftColor: '#333', paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, transform: [{ translateX: slideAnimRight }] }]}>
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
              <CommentsSection novelId={novelId} user={userInfo} chapterNumber={chapterId} />
          </View>
      </View>
  </Modal>

  {/* Unified Settings Modal */}
  <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
    <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowSettings(false)} />

        <View style={styles.settingsSheet}>
            <View style={styles.settingsHandle} />

            {settingsView === 'main' ? (
                <ScrollView contentContainerStyle={styles.scrollSettingsContainer}>
                    <View style={styles.settingsHeader}>
                        <Text style={styles.settingsTitle}>الإعدادات</Text>
                        <TouchableOpacity onPress={() => setShowSettings(false)}><Ionicons name="close-circle" size={30} color="#555" /></TouchableOpacity>
                    </View>
                    <View style={styles.settingsGrid}>
                        <TouchableOpacity style={styles.settingsCard} onPress={() => setSettingsView('appearance')}>
                            <View style={styles.cardIcon}>
                                <Ionicons name="text-outline" size={32} color="#fff" />
                            </View>
                            <Text style={styles.cardTitle}>مظهر القراءة</Text>
                            <Text style={styles.cardSub}>الخط، الحجم، الألوان</Text>
                        </TouchableOpacity>

                        {!isOfflineMode && (
                        <TouchableOpacity style={styles.settingsCard} onPress={() => openRightDrawer('replacements')}>
                            <View style={[styles.cardIcon, { backgroundColor: '#4a7cc7' }]}>
                                <Ionicons name="swap-horizontal-outline" size={32} color="#fff" />
                            </View>
                            <Text style={styles.cardTitle}>استبدال الكلمات</Text>
                            <Text style={styles.cardSub}>تغيير كلمات داخل الفصل</Text>
                        </TouchableOpacity>
                        )}

                        {!isOfflineMode && isAdmin && (
                            <>
                                <TouchableOpacity style={[styles.settingsCard, {borderColor: '#b91c1c'}]} onPress={() => openRightDrawer('cleaner')}>
                                    <View style={[styles.cardIcon, { backgroundColor: '#b91c1c' }]}>
                                        <Ionicons name="trash-outline" size={32} color="#fff" />
                                    </View>
                                    <Text style={[styles.cardTitle, {color: '#ff4444'}]}>الحذف الشامل</Text>
                                    <Text style={styles.cardSub}>حذف حقوق/نصوص من السيرفر</Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={[styles.settingsCard, {borderColor: '#4a7cc7'}]} onPress={() => openRightDrawer('copyright')}>
                                    <View style={[styles.cardIcon, { backgroundColor: '#1e3a8a' }]}>
                                        <Ionicons name="information-circle-outline" size={32} color="#fff" />
                                    </View>
                                    <Text style={[styles.cardTitle, {color: '#4a7cc7'}]}>حقوق التطبيق</Text>
                                    <Text style={styles.cardSub}>إضافة نص في بداية ونهاية كل فصل</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </ScrollView>
            ) : (
                // Appearance View
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 50}}>
                    <View style={styles.settingsHeader}>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                            <TouchableOpacity onPress={() => setSettingsView('main')} style={{padding: 5}}>
                                <Ionicons name="arrow-back" size={24} color="#fff" />
                            </TouchableOpacity>
                            <Text style={styles.settingsTitle}>مظهر القراءة</Text>
                        </View>
                        <TouchableOpacity onPress={() => setShowSettings(false)}><Ionicons name="close-circle" size={30} color="#555" /></TouchableOpacity>
                    </View>

                    {/* Font Section */}
                    <View style={styles.designCard}>
                        <Text style={styles.cardSectionTitle}>نوع الخط</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fontList}>
                            {FONT_OPTIONS.map((font) => (
                                <TouchableOpacity
                                    key={font.id}
                                    onPress={() => handleFontChange(font)}
                                    style={[styles.fontPill, fontFamily.id === font.id && styles.fontPillActive]}
                                >
                                    <Text style={[styles.fontPillText, fontFamily.id === font.id && styles.fontPillTextActive]}>{font.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    {/* Size Section */}
                    <View style={styles.designCard}>
                        <Text style={styles.cardSectionTitle}>حجم الخط</Text>
                        <View style={styles.sizeControlRow}>
                            <TouchableOpacity onPress={() => changeFontSize(-2)} style={styles.sizeBtn}><Ionicons name="remove" size={20} color="#fff" /></TouchableOpacity>
                            <Text style={styles.sizeValue}>{fontSize}</Text>
                            <TouchableOpacity onPress={() => changeFontSize(2)} style={styles.sizeBtn}><Ionicons name="add" size={20} color="#fff" /></TouchableOpacity>
                        </View>
                    </View>

                    {/* Background Color Section */}
                    <View style={styles.designCard}>
                        <Text style={styles.cardSectionTitle}>لون الخلفية</Text>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10}}>
                            <View style={{width: 30, height: 30, backgroundColor: bgColor, borderRadius: 15, borderWidth: 1, borderColor: '#fff'}} />
                            <TextInput
                                style={[styles.textInput, {flex: 1, textAlign: 'left'}]}
                                placeholder="#RRGGBB"
                                placeholderTextColor="#666"
                                value={bgColorHexInput}
                                onChangeText={handleBgColorHexChange}
                            />
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={styles.colorPalette}>
                                {BG_COLOR_PRESETS.map((c) => (
                                    <TouchableOpacity
                                        key={c.color}
                                        style={[styles.paletteCircle, {backgroundColor: c.color}, bgColor === c.color && styles.paletteCircleActive]}
                                        onPress={() => changeTheme(c.color)}
                                    />
                                ))}
                            </View>
                        </ScrollView>
                    </View>

                    {/* Text Color Section */}
                    <View style={styles.designCard}>
                        <Text style={styles.cardSectionTitle}>لون النص</Text>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10}}>
                            <View style={{width: 30, height: 30, backgroundColor: textColor, borderRadius: 15, borderWidth: 1, borderColor: '#fff'}} />
                            <TextInput
                                style={[styles.textInput, {flex: 1, textAlign: 'left'}]}
                                placeholder="#RRGGBB"
                                placeholderTextColor="#666"
                                value={textColorHexInput}
                                onChangeText={handleTextColorHexChange}
                            />
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={styles.colorPalette}>
                                {ADVANCED_COLORS.filter(c => c.color !== '#000000' || true).map((c) => (
                                    <TouchableOpacity
                                        key={c.color}
                                        style={[styles.paletteCircle, {backgroundColor: c.color}, textColor === c.color && styles.paletteCircleActive]}
                                        onPress={() => handleTextColorPreset(c.color)}
                                    />
                                ))}
                            </View>
                        </ScrollView>
                    </View>

                    {/* Text Brightness Control */}
                    <View style={styles.designCard}>
                        <Text style={styles.cardSectionTitle}>سطوع النص</Text>
                        <View style={styles.sliderRow}>
                            <Text style={styles.sliderLabel}>{Math.round(textBrightness * 100)}%</Text>
                            <CustomSlider
                                minimumValue={0.3}
                                maximumValue={1.5}
                                step={0.05}
                                value={textBrightness}
                                onValueChange={(val) => { setTextBrightness(val); saveSettings({ textBrightness: val }); }}
                                activeColor="#4a7cc7"
                            />
                            <Text style={styles.sliderTitle}>التعتيم</Text>
                        </View>
                    </View>

                    {/* DIALOGUE FORMATTING CARD */}
                    <View style={[styles.advancedCard, !enableDialogue && {opacity: 0.8}]}>
                        <View style={styles.advancedHeader}>
                            <Switch
                                value={enableDialogue}
                                onValueChange={(val) => { setEnableDialogue(val); saveSettings({ enableDialogue: val }); }}
                                trackColor={{ false: "#333", true: "#4ade80" }}
                                thumbColor={"#fff"}
                            />
                            <View style={{height: 1, flex: 1, backgroundColor: '#333', marginHorizontal: 15}} />
                            <Text style={styles.advancedTitle}>تنسيق الحوار</Text>
                        </View>

                        {enableDialogue && (
                            <>
                                <Text style={[styles.cardSectionTitle, {marginTop: 10}]}>اختر نمط الأقواس</Text>
                                <View style={styles.previewRow}>
                                    {QUOTE_STYLES.map((style) => (
                                        <TouchableOpacity
                                            key={style.id}
                                            style={[
                                                styles.previewBox,
                                                selectedQuoteStyle === style.id && {backgroundColor: '#1a4030', borderColor: '#4ade80'}
                                            ]}
                                            onPress={() => { setSelectedQuoteStyle(style.id); saveSettings({ selectedQuoteStyle: style.id }); }}
                                        >
                                            <Text style={[
                                                styles.previewText,
                                                selectedQuoteStyle === style.id && {color: '#4ade80'}
                                            ]}>{style.preview}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <Text style={styles.cardSectionTitle}>اللون</Text>
                                <View style={styles.colorPalette}>
                                    {ADVANCED_COLORS.map((c) => (
                                        <TouchableOpacity
                                            key={c.color}
                                            style={[styles.paletteCircle, {backgroundColor: c.color}, dialogueColor === c.color && styles.paletteCircleActive]}
                                            onPress={() => { setDialogueColor(c.color); saveSettings({ dialogueColor: c.color }); }}
                                        />
                                    ))}
                                </View>

                                <View style={styles.sliderRow}>
                                    <Text style={styles.sliderLabel}>{dialogueSize}%</Text>
                                    <CustomSlider
                                        minimumValue={80}
                                        maximumValue={150}
                                        step={5}
                                        value={dialogueSize}
                                        onValueChange={(val) => { setDialogueSize(val); saveSettings({ dialogueSize: val }); }}
                                        activeColor="#4ade80"
                                    />
                                    <Text style={styles.sliderTitle}>حجم الحوار</Text>
                                </View>

                                <View style={styles.toggleRow}>
                                    <Switch
                                        value={hideQuotes}
                                        onValueChange={(val) => { setHideQuotes(val); saveSettings({ hideQuotes: val }); }}
                                        trackColor={{ false: "#333", true: "#4ade80" }}
                                        thumbColor={"#fff"}
                                    />
                                    <Text style={styles.toggleLabel}>إخفاء علامات التنسيق</Text>
                                </View>
                            </>
                        )}
                    </View>

                    {/* MARKDOWN FORMATTING CARD */}
                    <View style={[styles.advancedCard, !enableMarkdown && {opacity: 0.8}]}>
                        <View style={styles.advancedHeader}>
                            <Switch
                                value={enableMarkdown}
                                onValueChange={(val) => { setEnableMarkdown(val); saveSettings({ enableMarkdown: val }); }}
                                trackColor={{ false: "#333", true: "#fff" }}
                                thumbColor={"#fff"}
                            />
                            <View style={{height: 1, flex: 1, backgroundColor: '#333', marginHorizontal: 15}} />
                            <Text style={styles.advancedTitle}>الخط العريض (BOLD)</Text>
                        </View>

                        {enableMarkdown && (
                            <>
                                <Text style={[styles.cardSectionTitle, {marginTop: 10}]}>اختر نمط الأقواس</Text>
                                <View style={styles.previewRow}>
                                    {QUOTE_STYLES.map((style) => (
                                        <TouchableOpacity
                                            key={style.id}
                                            style={[
                                                styles.previewBox,
                                                selectedMarkdownStyle === style.id && {backgroundColor: '#333', borderColor: '#fff'}
                                            ]}
                                            onPress={() => { setSelectedMarkdownStyle(style.id); saveSettings({ selectedMarkdownStyle: style.id }); }}
                                        >
                                            <Text style={[
                                                styles.previewText,
                                                selectedMarkdownStyle === style.id && {color: '#fff'}
                                            ]}>{style.preview}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <View style={styles.sliderRow}>
                                    <Text style={styles.sliderLabel}>{markdownSize}%</Text>
                                    <CustomSlider
                                        minimumValue={80}
                                        maximumValue={150}
                                        step={5}
                                        value={markdownSize}
                                        onValueChange={(val) => { setMarkdownSize(val); saveSettings({ markdownSize: val }); }}
                                        activeColor="#fff"
                                    />
                                    <Text style={styles.sliderTitle}>حجم الخط العريض</Text>
                                </View>

                                <View style={styles.toggleRow}>
                                    <Switch
                                        value={hideMarkdownMarks}
                                        onValueChange={(val) => { setHideMarkdownMarks(val); saveSettings({ hideMarkdownMarks: val }); }}
                                        trackColor={{ false: "#333", true: "#fff" }}
                                        thumbColor={"#fff"}
                                    />
                                    <Text style={styles.toggleLabel}>إخفاء علامات التنسيق (مثل **)</Text>
                                </View>
                            </>
                        )}
                    </View>

                    {/* NEW: BRACKET FORMATTING CARD */}
                    <View style={[styles.advancedCard, !enableBracket && {opacity: 0.8}]}>
                        <View style={styles.advancedHeader}>
                            <Switch
                                value={enableBracket}
                                onValueChange={(val) => { setEnableBracket(val); saveSettings({ enableBracket: val }); }}
                                trackColor={{ false: "#333", true: "#3b82f6" }}
                                thumbColor={"#fff"}
                            />
                            <View style={{height: 1, flex: 1, backgroundColor: '#333', marginHorizontal: 15}} />
                            <Text style={[styles.advancedTitle, {color: '#3b82f6'}]}>الأقواس المربعة [ ]</Text>
                        </View>

                        {enableBracket && (
                            <>
                                <Text style={[styles.cardSectionTitle, {marginTop: 10}]}>اختر نمط الأقواس الداخلية</Text>
                                <View style={styles.previewRow}>
                                    {QUOTE_STYLES.map((style) => (
                                        <TouchableOpacity
                                            key={style.id}
                                            style={[
                                                styles.previewBox,
                                                selectedBracketStyle === style.id && {backgroundColor: '#1a2a40', borderColor: '#3b82f6'}
                                            ]}
                                            onPress={() => { setSelectedBracketStyle(style.id); saveSettings({ selectedBracketStyle: style.id }); }}
                                        >
                                            <Text style={[
                                                styles.previewText,
                                                selectedBracketStyle === style.id && {color: '#3b82f6'}
                                            ]}>{style.preview}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <Text style={styles.cardSectionTitle}>اللون</Text>
                                <View style={styles.colorPalette}>
                                    {ADVANCED_COLORS.map((c) => (
                                        <TouchableOpacity
                                            key={c.color}
                                            style={[styles.paletteCircle, {backgroundColor: c.color}, bracketColor === c.color && styles.paletteCircleActive]}
                                            onPress={() => { setBracketColor(c.color); saveSettings({ bracketColor: c.color }); }}
                                        />
                                    ))}
                                </View>

                                <View style={styles.sliderRow}>
                                    <Text style={styles.sliderLabel}>{bracketSize}%</Text>
                                    <CustomSlider
                                        minimumValue={80}
                                        maximumValue={150}
                                        step={5}
                                        value={bracketSize}
                                        onValueChange={(val) => { setBracketSize(val); saveSettings({ bracketSize: val }); }}
                                        activeColor="#3b82f6"
                                    />
                                    <Text style={styles.sliderTitle}>حجم النص</Text>
                                </View>

                                <View style={styles.toggleRow}>
                                    <Switch
                                        value={hideBracketMarks}
                                        onValueChange={(val) => { setHideBracketMarks(val); saveSettings({ hideBracketMarks: val }); }}
                                        trackColor={{ false: "#333", true: "#3b82f6" }}
                                        thumbColor={"#fff"}
                                    />
                                    <Text style={styles.toggleLabel}>إخفاء الأقواس [ ]</Text>
                                </View>
                            </>
                        )}
                    </View>

                    {/* NEW: CUSTOM FORMATTING CARD */}
                    <View style={[styles.advancedCard, !enableCustom && {opacity: 0.8}]}>
                        <View style={styles.advancedHeader}>
                            <Switch
                                value={enableCustom}
                                onValueChange={(val) => { setEnableCustom(val); saveSettings({ enableCustom: val }); }}
                                trackColor={{ false: "#333", true: "#f97316" }}
                                thumbColor={"#fff"}
                            />
                            <View style={{height: 1, flex: 1, backgroundColor: '#333', marginHorizontal: 15}} />
                            <Text style={[styles.advancedTitle, {color: '#f97316'}]}>تنسيق مخصص</Text>
                        </View>

                        {enableCustom && (
                            <>
                                <Text style={[styles.cardSectionTitle, {marginTop: 10}]}>علامة البداية</Text>
                                <TextInput
                                    style={[styles.textInput, {marginBottom: 10}]}
                                    placeholder="مثال: <"
                                    placeholderTextColor="#666"
                                    value={customOpenMark}
                                    onChangeText={(val) => { setCustomOpenMark(val); saveSettings({ customOpenMark: val }); }}
                                    textAlign="center"
                                />
                                <Text style={styles.cardSectionTitle}>علامة النهاية</Text>
                                <TextInput
                                    style={[styles.textInput, {marginBottom: 15}]}
                                    placeholder="مثال: >"
                                    placeholderTextColor="#666"
                                    value={customCloseMark}
                                    onChangeText={(val) => { setCustomCloseMark(val); saveSettings({ customCloseMark: val }); }}
                                    textAlign="center"
                                />

                                <Text style={styles.cardSectionTitle}>اللون</Text>
                                <View style={styles.colorPalette}>
                                    {ADVANCED_COLORS.map((c) => (
                                        <TouchableOpacity
                                            key={c.color}
                                            style={[styles.paletteCircle, {backgroundColor: c.color}, customColor === c.color && styles.paletteCircleActive]}
                                            onPress={() => { setCustomColor(c.color); saveSettings({ customColor: c.color }); }}
                                        />
                                    ))}
                                </View>

                                <View style={styles.sliderRow}>
                                    <Text style={styles.sliderLabel}>{customSize}%</Text>
                                    <CustomSlider
                                        minimumValue={80}
                                        maximumValue={150}
                                        step={5}
                                        value={customSize}
                                        onValueChange={(val) => { setCustomSize(val); saveSettings({ customSize: val }); }}
                                        activeColor="#f97316"
                                    />
                                    <Text style={styles.sliderTitle}>حجم النص</Text>
                                </View>

                                <View style={styles.toggleRow}>
                                    <Switch
                                        value={hideCustomMarks}
                                        onValueChange={(val) => { setHideCustomMarks(val); saveSettings({ hideCustomMarks: val }); }}
                                        trackColor={{ false: "#333", true: "#f97316" }}
                                        thumbColor={"#fff"}
                                    />
                                    <Text style={styles.toggleLabel}>إخفاء علامات التنسيق</Text>
                                </View>
                            </>
                        )}
                    </View>

                    <View style={{height: 50}} />
                </ScrollView>
            )}
        </View>
    </View>
  </Modal>
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
});