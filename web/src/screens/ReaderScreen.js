import React, { useState, useRef, useEffect, useMemo, useCallback, useContext } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Text,
  StatusBar,
  Dimensions,
  Alert,
  Modal,
  TextInput,
  Switch,
  BackHandler,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { Speech, KeepAwake } from '../reader/optionalModules';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { incrementView } from '../services/api';
import CommentsSection from '../components/CommentsSection';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getOfflineChapterContent } from '../services/offlineStorage';
import buildWorShell from '../reader/worShell';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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

// Process a single content line: brackets / markdown / dialogue / custom marks
const processLineHTML = (line, S) => {
    let processedLine = escapeHtmlText(line);

    // Bracket formatting [ ]
    {
        let openB = '', closeB = '';
        if (S.selectedBracketStyle === 'guillemets') { openB = '«'; closeB = '»'; }
        else if (S.selectedBracketStyle === 'curly') { openB = '“'; closeB = '”'; }
        else if (S.selectedBracketStyle === 'straight') { openB = '"'; closeB = '"'; }
        else if (S.selectedBracketStyle === 'single') { openB = '‘'; closeB = '’'; }
        const innerStart = openB ? `<span class="bq-style">${escapeHtmlText(openB)}</span>` : '';
        const innerEnd = closeB ? `<span class="bq-style">${escapeHtmlText(closeB)}</span>` : '';
        processedLine = processedLine.replace(/\[(.*?)\]/g, (match, content) => (
            `<span class="bracket-formatted"><span class="bmark">[</span>${innerStart}${content}${innerEnd}<span class="bmark">]</span></span>`
        ));
    }

    // Markdown bold **
    {
        let openQ = '', closeQ = '';
        if (S.selectedMarkdownStyle === 'guillemets') { openQ = '«'; closeQ = '»'; }
        else if (S.selectedMarkdownStyle === 'curly') { openQ = '“'; closeQ = '”'; }
        else if (S.selectedMarkdownStyle === 'straight') { openQ = '"'; closeQ = '"'; }
        else if (S.selectedMarkdownStyle === 'single') { openQ = '‘'; closeQ = '’'; }
        const qStart = openQ ? `<span class="mq-style">${escapeHtmlText(openQ)}</span>` : '';
        const qEnd = closeQ ? `<span class="mq-style">${escapeHtmlText(closeQ)}</span>` : '';
        processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, (match, content) => (
            `<span class="cm-markdown-bold"><span class="mmark">**</span>${qStart}${content}${qEnd}<span class="mmark">**</span></span>`
        ));
    }

    // Dialogue quotes
    {
        let quoteRegex;
        if (S.selectedQuoteStyle === 'guillemets') quoteRegex = /(«)([\s\S]*?)(»)/g;
        else if (S.selectedQuoteStyle === 'curly') quoteRegex = /([“])([\s\S]*?)([”])/g;
        else if (S.selectedQuoteStyle === 'straight') quoteRegex = /(")([\s\S]*?)(")/g;
        else if (S.selectedQuoteStyle === 'single') quoteRegex = /(['‘])([\s\S]*?)(['’])/g;
        else quoteRegex = /([“"«])([\s\S]*?)([”"»])/g;
        processedLine = processedLine.replace(quoteRegex, (match, open, content, close) => (
            `<span class="cm-dialogue-text"><span class="qmark">${open}</span>${content}<span class="qmark">${close}</span></span>`
        ));
    }

    // Custom formatting
    if (S.customOpenMark && S.customOpenMark.trim() && S.customCloseMark && S.customCloseMark.trim()) {
        const escapedOpen = S.customOpenMark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedClose = S.customCloseMark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const customRegex = new RegExp(`${escapedOpen}(.*?)${escapedClose}`, 'g');
        processedLine = processedLine.replace(customRegex, (match, content) => (
            `<span class="custom-formatted"><span class="cmark">${escapeHtmlText(S.customOpenMark)}</span>${content}<span class="cmark">${escapeHtmlText(S.customCloseMark)}</span></span>`
        ));
    }

    return processedLine;
};

// Build one chapter <section> in the Galaxy reading-page style
const buildWorSectionHTML = (sec, idx, S) => {
    const style = sec.copyrightStyles || {};
    const copyrightCSS = `color:${style.color || '#888'};opacity:${style.opacity || 1};text-align:${style.alignment || 'center'};font-weight:${style.isBold ? '700' : '400'};font-size:${style.fontSize || 14}px;line-height:1.6`;
    const lines = (sec.content || '').split('\n').filter(line => line.trim() !== '');
    const paragraphs = lines.map(line => `<p>${processLineHTML(line, S)}</p>`).join('');
    const sepHTML = idx > 0 ? `<div class="wor-chapter-sep"><span class="sep-orn">◆</span></div>` : '';
    const titleHTML = `<div class="wor-chapter-title-block${idx > 0 ? ' wor-chapter-title-block--sub' : ''}">${escapeHtmlText(sec.title || '')}</div>`;
    const customSep = idx === 0 && S.enableSeparator ? `<div class="wor-custom-sep">${escapeHtmlText(S.separatorText)}</div>` : '';
    const startHTML = sec.copyrightStart ? `<div class="wor-app-copyright" style="${copyrightCSS}">${escapeHtmlText(sec.copyrightStart)}</div><div class="wor-chapter-divider"></div>` : '';
    const endHTML = sec.copyrightEnd ? `<div class="wor-chapter-divider"></div><div class="wor-app-copyright" style="${copyrightCSS}">${escapeHtmlText(sec.copyrightEnd)}</div>` : '';
    return `<section class="wor-chapter-sec" data-ch="${sec.number}">${sepHTML}${titleHTML}${customSep}${startHTML}<div>${paragraphs}</div>${endHTML}</section>`;
};

// ----- Default reader settings (Galaxy reader defaults) -----
const DEFAULT_SETTINGS = {
    fontSize: 18,
    lineHeight: 2.3,
    wordSpacing: 0,
    brightness: 1.05,
    fontWeight: '400',
    direction: 'rtl',
    fontValue: 'default',
    bgColor: '#000000',
    textColor: '#ffffff',
    accent: '#808080',
    bgPreset: 'black',
    customColors: false,
    // advanced formatting
    enableDialogue: false, dialogueColor: '#4ade80', dialogueSize: 100,
    hideQuotes: false, selectedQuoteStyle: 'all',
    enableMarkdown: false, markdownColor: '#ffffff', markdownSize: 100, hideMarkdownMarks: false, selectedMarkdownStyle: 'all',
    enableBracket: false, bracketColor: '#3b82f6', bracketSize: 110, hideBracketMarks: false, selectedBracketStyle: 'all',
    enableCustom: false, customOpenMark: '', customCloseMark: '', customColor: '#f97316', customSize: 105, hideCustomMarks: false,
    // tools
    showProgressBar: true,
    progressBarColor: '#00ffff',
    continuousMode: false,
    autoScroll: false,
    ttsEnabled: false,
    keepAwake: false,
    hideTitle: false,
    tapToToggle: true,
    enableSeparator: true,
    separatorText: '________________________________________',
    dockOpen: true,
};

// old font ids -> Galaxy font values (settings migration)
const LEGACY_FONT_MAP = { Cairo: 'cairo', Amiri: 'amiri', Noto: 'noto-kufi-arabic', Geeza: 'default', Arial: 'default', Times: 'default' };

// Theme cycle for the topbar toggle
const THEME_CYCLE = [
    { bgPreset: 'black', bgColor: '#000000', textColor: '#ffffff' },
    { bgPreset: '__light__', bgColor: '#f3efe7', textColor: '#1c1c1c' },
    { bgPreset: 'soft', bgColor: '#16181d', textColor: '#eef1f6' },
    { bgPreset: 'charcoal', bgColor: '#232323', textColor: '#f3f3f3' },
];

const isLightColor = (hex) => {
    const h = String(hex || '#000000').replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(full || '000000', 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
};

export default function ReaderScreen({ route, navigation }) {
    const { userInfo } = useContext(AuthContext);
    const { showToast } = useToast();
    const { novel, chapterId, isOfflineMode, availableChapters } = route.params;

    // ----- data state -----
    const [chapter, setChapter] = useState(null);
    const [loading, setLoading] = useState(true);
    const [realTotalChapters, setRealTotalChapters] = useState(novel.chaptersCount || 0);
    const [commentCount, setCommentCount] = useState(0);
    const [authorProfile, setAuthorProfile] = useState(null);
    const [isFavorite, setIsFavorite] = useState(false);

    // ----- settings (single object, persisted in @reader_settings_v4) -----
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const settingsRef = useRef(DEFAULT_SETTINGS);
    const setSettingsBoth = useCallback((patchOrFn) => {
        setSettings(prev => {
            const patch = typeof patchOrFn === 'function' ? patchOrFn(prev) : patchOrFn;
            const next = { ...prev, ...patch };
            settingsRef.current = next;
            return next;
        });
    }, []);

    // ----- replacements (folders) -----
    const [folders, setFolders] = useState([]);
    const foldersRef = useRef([]);
    const [currentFolderId, setCurrentFolderId] = useState(null);
    const currentFolderIdRef = useRef(null);
    const [showFolderModal, setShowFolderModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    // ----- admin: cleaner -----
    const [cleanerWords, setCleanerWords] = useState([]);
    const [newCleanerWord, setNewCleanerWord] = useState('');
    const [cleanerEditingId, setCleanerEditingId] = useState(null);
    const [cleanerOldWord, setCleanerOldWord] = useState('');
    const [cleaningLoading, setCleaningLoading] = useState(false);
    const [showCleaner, setShowCleaner] = useState(false);

    // ----- admin: copyright -----
    const [copyrightStartText, setCopyrightStartText] = useState('');
    const [copyrightEndText, setCopyrightEndText] = useState('');
    const [copyrightLoading, setCopyrightLoading] = useState(false);
    const [copyrightStyle, setCopyrightStyle] = useState({ color: '#888888', opacity: 1, alignment: 'center', isBold: true, fontSize: 14 });
    const [copyrightFrequency, setCopyrightFrequency] = useState('always');
    const [copyrightEveryX, setCopyrightEveryX] = useState('5');
    const [showCopyright, setShowCopyright] = useState(false);

    // ----- chapters list -----
    const [chaptersList, setChaptersList] = useState([]);

    // ----- continuous scroll -----
    const [extraSections, setExtraSections] = useState([]);
    const [loadingNext, setLoadingNext] = useState(false);
    const [endReached, setEndReached] = useState(false);
    const [currentViewedChapter, setCurrentViewedChapter] = useState(parseInt(chapterId) || 1);
    const [errorInfo, setErrorInfo] = useState(null);

    const [showComments, setShowComments] = useState(false);

    const insets = useSafeAreaInsets();
    const webViewRef = useRef(null);
    const webReadyRef = useRef(false);
    const webQueueRef = useRef([]);
    const scrollSaveTimer = useRef(null);
    const pendingRestoreRef = useRef(0);
    const loadingNextRef = useRef(false);
    const autoScrollNextRef = useRef(false);
    const ttsStopRef = useRef(false);

    const novelId = novel._id || novel.id || novel.novelId;
    const isAdmin = userInfo?.role === 'admin';

    // ========================= WebView bridge =========================
    const postToWeb = useCallback((obj) => {
        if (!webViewRef.current) return;
        if (!webReadyRef.current) {
            webQueueRef.current.push(obj);
            return;
        }
        try {
            const json = JSON.stringify(obj);
            webViewRef.current.injectJavaScript(`window.__wor && window.__wor.receive(${json}); true;`);
        } catch (e) { }
    }, []);

    const flushWebQueue = useCallback(() => {
        webReadyRef.current = true;
        const queue = webQueueRef.current;
        webQueueRef.current = [];
        queue.forEach(obj => postToWeb(obj));
    }, [postToWeb]);

    const sendSettings = useCallback((s) => {
        postToWeb({ kind: 'settings', settings: { ...s, customColors: s.customColors } });
    }, [postToWeb]);

    const sendChapters = useCallback((list) => {
        postToWeb({ kind: 'chapters', list: list || chaptersListRef.current });
    }, [postToWeb]);

    const chaptersListRef = useRef([]);
    useEffect(() => { chaptersListRef.current = chaptersList; }, [chaptersList]);

    const sendWords = useCallback((nextFolders, nextActiveId) => {
        postToWeb({
            kind: 'words',
            folders: nextFolders !== undefined ? nextFolders : foldersRef.current,
            activeId: nextActiveId !== undefined ? nextActiveId : currentFolderIdRef.current,
        });
    }, [postToWeb]);

    const sendFav = useCallback((value) => {
        postToWeb({ kind: 'fav', value });
    }, [postToWeb]);

    const sendChapterToWeb = useCallback((chapterData, opts = {}) => {
        if (!chapterData) return;
        const S = settingsRef.current;
        const number = opts.number || parseInt(chapterId) || 1;
        const sorted = (availableChapters && availableChapters.length > 0)
            ? [...availableChapters].sort((a, b) => a - b)
            : null;
        let hasPrev = true, hasNext = true, position = number, total = realTotalChapters;
        if (sorted) {
            const idx = sorted.indexOf(number);
            hasPrev = idx > 0;
            hasNext = idx !== -1 && idx < sorted.length - 1;
            position = idx + 1;
            total = sorted.length;
        } else {
            hasPrev = number > 1;
            hasNext = !(realTotalChapters > 0 && number >= realTotalChapters);
        }
        const percent = total > 0 ? Math.min(100, Math.round((position / total) * 100)) : 0;
        const html = buildWorSectionHTML({
            number,
            title: chapterData.title,
            content: chapterData.processedContent || '',
            copyrightStart: chapterData.copyrightStart,
            copyrightEnd: chapterData.copyrightEnd,
            copyrightStyles: chapterData.copyrightStyles,
        }, 0, S);
        postToWeb({
            kind: 'chapter',
            number,
            title: chapterData.title || `فصل ${number}`,
            novelTitle: novel.title || '',
            total,
            percent: `${percent}%`,
            percentValue: percent,
            hasPrev,
            hasNext,
            html,
            commentCount: commentCountRef.current,
            showCommentsButton: !isOfflineMode,
            authorCard: authorProfileRef.current
                ? { name: authorProfileRef.current.name || novel.author || '', avatar: authorProfileRef.current.picture || '', banner: authorProfileRef.current.banner || '' }
                : null,
            isFavorite: isFavoriteRef.current,
            scrollOffset: pendingRestoreRef.current || 0,
        });
    }, [postToWeb, novel.title, availableChapters, realTotalChapters, isOfflineMode]);

    const commentCountRef = useRef(0);
    useEffect(() => {
        commentCountRef.current = commentCount;
        postToWeb({ kind: 'commentCount', count: commentCount });
    }, [commentCount]); // eslint-disable-line react-hooks/exhaustive-deps
    const authorProfileRef = useRef(null);
    useEffect(() => { authorProfileRef.current = authorProfile; }, [authorProfile]);
    const isFavoriteRef = useRef(false);
    useEffect(() => { isFavoriteRef.current = isFavorite; }, [isFavorite]);

    // ========================= settings persistence =========================
    const saveSettings = async (patch) => {
        try {
            const current = await AsyncStorage.getItem('@reader_settings_v4');
            const existing = current ? JSON.parse(current) : {};
            await AsyncStorage.setItem('@reader_settings_v4', JSON.stringify({ ...existing, ...patch }));
        } catch (e) { }
    };

    const applySettingsPatch = useCallback((patch, persist = true) => {
        setSettingsBoth(prev => ({ ...prev, ...patch }));
        if (persist) saveSettings(patch);
        postToWeb({ kind: 'settings', settings: patch });
    }, [postToWeb, setSettingsBoth]);

    const loadSettings = async () => {
        try {
            const saved = await AsyncStorage.getItem('@reader_settings_v4');
            if (saved) {
                const p = JSON.parse(saved);
                const patch = {};
                // galaxy keys
                ['fontSize', 'lineHeight', 'wordSpacing', 'brightness', 'fontWeight', 'direction', 'fontValue',
                    'bgColor', 'textColor', 'accent', 'bgPreset', 'customColors',
                    'enableDialogue', 'dialogueColor', 'dialogueSize', 'hideQuotes', 'selectedQuoteStyle',
                    'enableMarkdown', 'markdownColor', 'markdownSize', 'hideMarkdownMarks', 'selectedMarkdownStyle',
                    'enableBracket', 'bracketColor', 'bracketSize', 'hideBracketMarks', 'selectedBracketStyle',
                    'enableCustom', 'customOpenMark', 'customCloseMark', 'customColor', 'customSize', 'hideCustomMarks',
                    'showProgressBar', 'progressBarColor', 'continuousMode', 'autoScroll', 'ttsEnabled', 'keepAwake',
                    'hideTitle', 'tapToToggle', 'enableSeparator', 'separatorText', 'dockOpen']
                    .forEach(k => { if (p[k] !== undefined) patch[k] = p[k]; });
                // legacy v4 keys
                if (p.textBrightness !== undefined && patch.brightness === undefined) patch.brightness = p.textBrightness;
                if (p.fontId && patch.fontValue === undefined) patch.fontValue = LEGACY_FONT_MAP[p.fontId] || 'default';
                setSettingsBoth(prev => ({ ...prev, ...patch }));
                settingsRef.current = { ...settingsRef.current, ...patch };
            }
        } catch (e) { }
    };

    // ========================= replacements (folders) =========================
    const saveFoldersData = async (newFolders) => {
        foldersRef.current = newFolders;
        setFolders(newFolders);
        try { await AsyncStorage.setItem('@reader_folders_v2', JSON.stringify(newFolders)); } catch (e) { }
        sendWords(newFolders);
    };

    const loadFoldersAndPrefs = async () => {
        try {
            let parsedFolders = [];
            const savedFolders = await AsyncStorage.getItem('@reader_folders_v2');
            if (savedFolders) {
                parsedFolders = JSON.parse(savedFolders);
            } else {
                const oldReplacements = await AsyncStorage.getItem('@reader_replacements');
                if (oldReplacements) {
                    parsedFolders = [{ id: 'default_migrated', name: 'عام (قديم)', replacements: JSON.parse(oldReplacements) }];
                    await AsyncStorage.setItem('@reader_folders_v2', JSON.stringify(parsedFolders));
                }
            }
            foldersRef.current = parsedFolders;
            setFolders(parsedFolders);
            sendWords(parsedFolders);

            // default active folder = one named after the novel, else first
            const match = parsedFolders.find(f => f.name === (novel.title || ''));
            const activeId = match ? match.id : (parsedFolders[0] ? parsedFolders[0].id : null);
            currentFolderIdRef.current = activeId;
            setCurrentFolderId(activeId);
        } catch (e) { }
    };

    const handleCreateFolder = () => {
        if (!newFolderName.trim()) return;
        const newFolder = { id: Date.now().toString(), name: newFolderName.trim(), replacements: [] };
        const updated = [...folders, newFolder];
        currentFolderIdRef.current = newFolder.id;
        setCurrentFolderId(newFolder.id);
        saveFoldersData(updated);
        setShowFolderModal(false);
        setNewFolderName('');
        showToast('تم إنشاء المجلد', 'success');
    };

    const handleDeleteFolder = (folderId) => {
        const folder = folders.find(f => f.id === folderId);
        Alert.alert('حذف المجلد', `سيتم حذف المجلد "${folder ? folder.name : ''}" وجميع الكلمات داخله.`, [
            { text: 'إلغاء', style: 'cancel' },
            {
                text: 'حذف', style: 'destructive', onPress: () => {
                    const updated = folders.filter(f => f.id !== folderId);
                    if (currentFolderIdRef.current === folderId) {
                        const next = updated[0] ? updated[0].id : null;
                        currentFolderIdRef.current = next;
                        setCurrentFolderId(next);
                    }
                    saveFoldersData(updated);
                    showToast('تم حذف المجلد', 'success');
                }
            }
        ]);
    };

    const wordsAction = useCallback((msg) => {
        const list = foldersRef.current;
        const activeId = msg.id || currentFolderIdRef.current;
        const idx = list.findIndex(f => f.id === activeId);
        if (msg.action === 'selectFolder') {
            currentFolderIdRef.current = msg.id;
            setCurrentFolderId(msg.id);
            return;
        }
        if (msg.action === 'createFolderPrompt') {
            setNewFolderName(novel.title || '');
            setShowFolderModal(true);
            return;
        }
        if (msg.action === 'deleteFolder') {
            handleDeleteFolder(msg.id);
            return;
        }
        if (idx === -1) {
            showToast('أنشئ مجلداً أولاً', 'warning');
            return;
        }
        const folder = list[idx];
        const reps = [...(folder.replacements || [])];
        let toastText = '';
        if (msg.action === 'addRep') {
            if (!msg.original || !msg.original.trim()) { showToast('اكتب الكلمة الأصلية أولاً', 'warning'); return; }
            reps.push({ original: msg.original.trim(), replacement: (msg.replacement || '').trim() });
            toastText = 'تمت إضافة الكلمة';
        } else if (msg.action === 'updateRep') {
            if (msg.idx == null || !reps[msg.idx]) return;
            reps[msg.idx] = { original: (msg.original || '').trim(), replacement: (msg.replacement || '').trim() };
            toastText = 'تم تحديث الكلمة';
        } else if (msg.action === 'deleteRep') {
            if (msg.idx == null || !reps[msg.idx]) return;
            reps.splice(msg.idx, 1);
            toastText = 'تم حذف الكلمة';
        }
        const updated = [...list];
        updated[idx] = { ...folder, replacements: reps };
        saveFoldersData(updated);
        postToWeb({ kind: 'wordsSaved', folders: updated, activeId, toast: toastText });
    }, [folders, novel.title, postToWeb, saveFoldersData, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

    const activeReplacementsList = useMemo(() => {
        if (!currentFolderId) return [];
        const folder = folders.find(f => f.id === currentFolderId);
        return folder ? folder.replacements : [];
    }, [folders, currentFolderId]);

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

    const processedExtraSections = useMemo(() => (
        extraSections.map(sec => ({ ...sec, content: applyReplacements(sec.rawContent) }))
    ), [extraSections, applyReplacements]);

    // ========================= scroll persistence =========================
    const scrollKeyFor = (chNum) => `@reader_scroll_v1_${novelId}_${chNum}`;

    const saveScrollPosition = async (chNum, offset) => {
        try {
            if (!chNum || offset == null || offset < 0) return;
            await AsyncStorage.setItem(scrollKeyFor(chNum), JSON.stringify({ offset: Math.round(offset), savedAt: Date.now() }));
        } catch (e) { }
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
        if (!settingsRef.current.continuousMode && parseInt(chNum) !== parseInt(chapterId)) return;
        if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
        scrollSaveTimer.current = setTimeout(() => saveScrollPosition(chNum, offset), 600);
    };

    const clearScrollFor = async (chNum) => {
        try { await AsyncStorage.removeItem(scrollKeyFor(chNum)); } catch (e) { }
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
        } catch (error) { }
    };

    // ========================= fetching =========================
    const fetchChapters = async () => {
        try {
            const res = await api.get(`/api/novels/${novelId}/chapters`);
            if (res.data && Array.isArray(res.data)) {
                setChaptersList(res.data);
                sendChapters(res.data);
            }
        } catch (error) { }
    };

    const fetchAuthorData = async () => {
        if (novel.authorEmail) {
            try {
                const res = await api.get(`/api/user/stats?email=${novel.authorEmail}`);
                if (res.data && res.data.user) setAuthorProfile(res.data.user);
            } catch (e) { }
        }
    };

    const fetchCleanerWords = async () => {
        try {
            const res = await api.get('/api/admin/cleaner');
            setCleanerWords(res.data);
        } catch (e) { }
    };

    const fetchCopyrights = async () => {
        try {
            const res = await api.get('/api/admin/copyright');
            setCopyrightStartText(res.data.startText || '');
            setCopyrightEndText(res.data.endText || '');
            if (res.data.styles) setCopyrightStyle(prev => ({ ...prev, ...res.data.styles }));
            if (res.data.frequency) setCopyrightFrequency(res.data.frequency);
            if (res.data.everyX) setCopyrightEveryX(res.data.everyX.toString());
            if (res.data.chapterSeparatorText) setSettingsBoth(prev => ({ ...prev, separatorText: res.data.chapterSeparatorText }));
            if (res.data.enableChapterSeparator !== undefined) setSettingsBoth(prev => ({ ...prev, enableSeparator: res.data.enableChapterSeparator }));
        } catch (e) { }
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
                enableChapterSeparator: settingsRef.current.enableSeparator,
                chapterSeparatorText: settingsRef.current.separatorText
            });
            showToast("تم حفظ إعدادات الحقوق", "success");
            fetchChapter();
        } catch (error) {
            showToast("فشل الحفظ", "error");
        } finally {
            setCopyrightLoading(false);
        }
    };

    const fetchFavoriteStatus = async () => {
        if (isOfflineMode) return;
        try {
            const res = await api.get(`/api/novel/status/${novelId}`);
            if (res.data) {
                setIsFavorite(!!res.data.isFavorite);
                isFavoriteRef.current = !!res.data.isFavorite;
                sendFav(!!res.data.isFavorite);
            }
        } catch (e) { }
    };

    const toggleFavorite = async () => {
        if (isOfflineMode) { showToast('لا يمكن التعديل بدون إنترنت', 'warning'); return; }
        const newStatus = !isFavoriteRef.current;
        isFavoriteRef.current = newStatus;
        setIsFavorite(newStatus);
        sendFav(newStatus);
        try {
            await api.post('/api/novel/update', {
                novelId, title: novel.title, cover: novel.cover, author: novel.author || novel.translator,
                isFavorite: newStatus
            });
            showToast(newStatus ? 'تمت الإضافة للمفضلة' : 'تم الحذف من المفضلة', newStatus ? 'success' : 'info');
        } catch (e) {
            isFavoriteRef.current = !newStatus;
            setIsFavorite(!newStatus);
            sendFav(!newStatus);
            showToast('فشلت العملية', 'error');
        }
    };

    const fetchCommentCount = async () => {
        try {
            const res = await api.get(`/api/novels/${novelId}/comments?chapterNumber=${chapterId}`);
            if (res.data && Array.isArray(res.data)) setCommentCount(res.data.length);
        } catch (e) { }
    };

    const fetchChapter = async () => {
        setLoading(true);
        setErrorInfo(null);
        setExtraSections([]);
        setEndReached(false);
        setLoadingNext(false);
        loadingNextRef.current = false;
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
                throw new Error('الفصل غير متوفر بدون اتصال');
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

            // push to web
            if (chapterData) {
                const processed = applyReplacements(chapterData.content || '');
                setTimeout(() => {
                    sendChapterToWeb({ ...chapterData, processedContent: processed });
                    sendSettings(settingsRef.current);
                }, 0);
            }

            if (!isOfflineMode) {
                incrementView(novelId, chapterId);
                updateProgressOnServer(chapterData, chapterId);
                fetchCommentCount();
            }
        } catch (error) {
            const status = error?.response?.status;
            let message = 'فشل تحميل الفصل. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.';
            if (status === 403) message = 'هذا الفصل غير متاح حالياً (خاص أو لم يُنشر بعد).';
            else if (status === 404) message = 'الفصل غير موجود. ربما تم حذفه أو تغيير ترقيمه.';
            else if (isOfflineMode) message = 'الفصل غير متوفر بدون اتصال. حمّله مسبقاً لتقرأه أوفلاين.';
            setErrorInfo({ message, status });
        } finally {
            setLoading(false);
        }
    };

    // ----- continuous scroll: fetch + append the NEXT chapter -----
    const fetchNextChapter = async () => {
        if (loadingNextRef.current || endReached) return;
        const S = settingsRef.current;
        if (!S.continuousMode) return;
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
            postToWeb({ kind: 'endReached' });
            return;
        }
        loadingNextRef.current = true;
        setLoadingNext(true);
        postToWeb({ kind: 'loadingNext', value: true });
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
                postToWeb({ kind: 'endReached' });
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
            const html = buildWorSectionHTML({
                number: section.number,
                title: section.title,
                content: applyReplacements(section.rawContent),
                copyrightStart: section.copyrightStart,
                copyrightEnd: section.copyrightEnd,
                copyrightStyles: section.copyrightStyles
            }, 1, settingsRef.current);
            postToWeb({ kind: 'appendChapter', number: nextNum, html });
            if (autoScrollNextRef.current) {
                autoScrollNextRef.current = false;
                setTimeout(() => {
                    webViewRef.current?.injectJavaScript(`var el=document.querySelector('section[data-ch="${nextNum}"]'); if(el){ window.scrollTo({top: el.offsetTop - 8, behavior:'smooth'}); } true;`);
                }, 350);
            }
        } catch (e) {
            setEndReached(true);
            postToWeb({ kind: 'endReached' });
        } finally {
            loadingNextRef.current = false;
            setLoadingNext(false);
            postToWeb({ kind: 'loadingNext', value: false });
        }
    };

    // ========================= navigation =========================
    const navigateChapter = (targetId) => {
        if (parseInt(targetId) === parseInt(chapterId)) return;
        clearScrollFor(targetId);
        setTimeout(() => {
            navigation.replace('Reader', { novel, chapterId: targetId, isOfflineMode, availableChapters });
        }, 120);
    };

    const navigateNextPrev = (offset) => {
        const S = settingsRef.current;
        // Continuous mode: "next" scrolls to the already-appended section or fetches it
        if (S.continuousMode && offset > 0) {
            const anchorNum = parseInt(chapterId) || 1;
            const secNums = [anchorNum, ...processedExtraSections.map(x => x.number)];
            const idx = secNums.indexOf(currentViewedChapter);
            const nextSec = idx !== -1 ? secNums[idx + 1] : (processedExtraSections.length ? null : undefined);
            if (nextSec) {
                webViewRef.current?.injectJavaScript(`var el=document.querySelector('section[data-ch="${nextSec}"]'); if(el){ window.scrollTo({top: el.offsetTop - 8, behavior:'smooth'}); } true;`);
                return;
            }
            if (endReached) {
                showToast('أنت في آخر فصل متاح', 'info');
                return;
            }
            autoScrollNextRef.current = true;
            fetchNextChapter();
            return;
        }
        if (availableChapters && availableChapters.length > 0) {
            const currentNum = parseInt(chapterId);
            const sortedAvailable = [...availableChapters].sort((a, b) => a - b);
            const currentIndex = sortedAvailable.indexOf(currentNum);
            if (currentIndex === -1) return;
            const nextIndex = currentIndex + offset;
            if (nextIndex >= 0 && nextIndex < sortedAvailable.length) {
                const nextChapId = sortedAvailable[nextIndex];
                if (offset > 0) clearScrollFor(nextChapId);
                navigation.replace('Reader', { novel, chapterId: nextChapId, isOfflineMode, availableChapters });
            } else {
                showToast(offset > 0 ? 'أنت في آخر فصل منزل.' : 'أنت في أول فصل منزل.', 'info');
            }
        } else {
            const nextNum = parseInt(chapterId) + offset;
            if (offset < 0 && nextNum < 1) return;
            if (offset > 0 && realTotalChapters > 0 && nextNum > realTotalChapters) {
                showToast('أنت في آخر فصل متاح.', 'info');
                return;
            }
            if (offset > 0) clearScrollFor(nextNum);
            navigation.replace('Reader', { novel, chapterId: nextNum, isOfflineMode });
        }
    };

    const handleThemeCycle = () => {
        const S = settingsRef.current;
        let idx = THEME_CYCLE.findIndex(t => t.bgPreset === S.bgPreset);
        if (idx === -1) idx = THEME_CYCLE.findIndex(t => t.bgColor.toLowerCase() === String(S.bgColor).toLowerCase());
        const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
        applySettingsPatch({
            bgPreset: next.bgPreset,
            bgColor: next.bgColor,
            textColor: next.textColor,
            customColors: false,
        });
    };

    // ========================= admin tools =========================
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
                showToast(cleanerEditingId !== null ? 'تم التحديث بنجاح' : 'تم الحذف من جميع الفصول بنجاح', 'success');
                fetchChapter();
            } catch (e) {
                showToast('فشل تنفيذ العملية', 'error');
            } finally {
                setCleaningLoading(false);
            }
        };

        if (cleanerEditingId !== null) {
            Alert.alert('تأكيد التحديث', `سيتم تحديث "${cleanerOldWord}" إلى "${newCleanerWord.trim()}" في جميع الفصول.`, [
                { text: 'إلغاء', style: 'cancel' },
                { text: 'تحديث', style: 'destructive', onPress: executeAction }
            ]);
        } else {
            Alert.alert('تأكيد الحذف الشامل', `سيتم حذف أي فقرة أو نص مطابق لـ "${newCleanerWord.trim()}" من جميع الفصول في السيرفر.`, [
                { text: 'إلغاء', style: 'cancel' },
                { text: 'تنفيذ الحذف', style: 'destructive', onPress: executeAction }
            ]);
        }
    };

    const handleDeleteCleaner = (item) => {
        Alert.alert('حذف', 'هل تريد إزالة هذا النص من القائمة؟', [
            { text: 'إلغاء' },
            {
                text: 'حذف', style: 'destructive', onPress: async () => {
                    try {
                        await api.delete(`/api/admin/cleaner/${encodeURIComponent(item)}`);
                        fetchCleanerWords();
                        if (newCleanerWord === item) {
                            setNewCleanerWord('');
                            setCleanerEditingId(null);
                            setCleanerOldWord('');
                        }
                    } catch (e) { showToast('فشل الحذف', 'error'); }
                }
            }
        ]);
    };

    const submitReport = async (msg) => {
        try {
            await api.post('/api/reports', {
                novelId,
                novelTitle: novel.title,
                chapterNumber: parseInt(chapterId) || 1,
                chapterTitle: chapter ? chapter.title : '',
                types: msg.types || [],
                details: msg.details || '',
            });
            showToast('تم إرسال البلاغ، شكراً لك!', 'success');
        } catch (e) {
            showToast('تعذر إرسال البلاغ الآن', 'error');
        }
    };

    // ========================= TTS (القراءة الصوتية) =========================
    const stripForTTS = (text) => String(text || '')
        .replace(/\*\*/g, '')
        .replace(/\[(\/?)[a-z]+\]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    useEffect(() => {
        ttsStopRef.current = false;
        if (settings.ttsEnabled && chapter) {
            const text = stripForTTS(getProcessedContent);
            if (text) {
                Speech.stop();
                const chunks = [];
                for (let i = 0; i < text.length; i += 2700) chunks.push(text.slice(i, i + 2700));
                let idx = 0;
                const speakNext = () => {
                    if (ttsStopRef.current || idx >= chunks.length) return;
                    const cur = chunks[idx];
                    idx += 1;
                    Speech.speak(cur, { language: 'ar', rate: 1.0, onDone: speakNext, onError: speakNext });
                };
                speakNext();
            }
        } else {
            Speech.stop();
        }
        return () => { ttsStopRef.current = true; Speech.stop(); };
    }, [settings.ttsEnabled, chapter, getProcessedContent]); // eslint-disable-line react-hooks/exhaustive-deps

    // ========================= keep awake =========================
    useEffect(() => {
        if (settings.keepAwake) {
            KeepAwake.activateKeepAwakeAsync().catch(() => { });
        } else {
            KeepAwake.deactivateKeepAwake().catch(() => { });
        }
    }, [settings.keepAwake]);

    // ========================= init =========================
    const backPressPendingRef = useRef(false);
    const webAliveRef = useRef(0);

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
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            // if the web side has been silent for a while (JS failed to boot), leave directly
            if (Date.now() - webAliveRef.current > 4000 && webAliveRef.current !== 0) {
                navigation.goBack();
                return true;
            }
            backPressPendingRef.current = true;
            postToWeb({ kind: 'backPress' });
            setTimeout(() => {
                if (backPressPendingRef.current) {
                    backPressPendingRef.current = false;
                    navigation.goBack();
                }
            }, 450);
            return true;
        });
        return () => {
            backHandler.remove();
            if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
            Speech.stop();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                sendChapters(list);
            } else if (novel.chapters && novel.chapters.length > 0) {
                setChaptersList(novel.chapters);
                sendChapters(novel.chapters);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [novel.chapters, availableChapters, isOfflineMode]);

    // Keep server reading-progress in sync with the chapter actually being viewed
    useEffect(() => {
        if (chapter && !isOfflineMode) updateProgressOnServer(chapter, currentViewedChapter);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentViewedChapter]);

    // ========================= WebView message handler =========================
    const onMessage = (event) => {
        const msg = event?.nativeEvent?.data;
        if (!msg) return;
        webAliveRef.current = Date.now();
        let data = null;
        try { data = JSON.parse(msg); } catch (e) { return; }
        if (!data || !data.t) return;
        switch (data.t) {
            case 'ready': {
                backPressPendingRef.current = false;
                flushWebQueue();
                sendSettings(settingsRef.current);
                sendChapters();
                sendWords();
                sendFav(isFavoriteRef.current);
                // re-send the chapter (in case it loaded before web was ready)
                if (chapter) {
                    const processed = applyReplacements(chapter.content);
                    sendChapterToWeb({ ...chapter, processedContent: processed });
                }
                break;
            }
            case 'scroll': {
                const chNum = parseInt(data.chapter) || currentViewedChapter;
                setCurrentViewedChapter(prev => (parseInt(prev) === chNum ? prev : chNum));
                queueSaveScroll(chNum, data.offset);
                break;
            }
            case 'needNext':
                fetchNextChapter();
                break;
            case 'nav': {
                if (data.dir === 'next') navigateNextPrev(1);
                else if (data.dir === 'prev') navigateNextPrev(-1);
                else if (data.to) {
                    const map = {
                        home: 'MainTabs', downloads: 'Downloads', settings: 'Settings',
                        contact: 'ContactUs', about: 'AboutApp',
                    };
                    if (data.to === 'novel') {
                        navigation.goBack();
                    } else if (map[data.to]) {
                        navigation.navigate(map[data.to]);
                    }
                }
                break;
            }
            case 'goto':
                if (data.number) navigateChapter(parseInt(data.number));
                break;
            case 'novelPage':
                navigation.goBack();
                break;
            case 'comments':
                setShowComments(true);
                break;
            case 'fav':
                toggleFavorite();
                break;
            case 'settings':
                if (data.patch) applySettingsPatch(data.patch);
                break;
            case 'words':
                wordsAction(data);
                break;
            case 'wordsOpen':
                sendWords();
                break;
            case 'report':
                submitReport(data);
                break;
            case 'tool':
                if (data.tool === 'cleaner') setShowCleaner(true);
                else if (data.tool === 'copyright') setShowCopyright(true);
                break;
            case 'themeCycle':
                handleThemeCycle();
                break;
            case 'exit':
                backPressPendingRef.current = false;
                navigation.goBack();
                break;
            case 'profile':
                if (authorProfile && !isOfflineMode) {
                    navigation.push('UserProfile', { userId: authorProfile._id });
                }
                break;
            case 'error':
                console.log('[wor reader] web error:', data.message);
                break;
            default:
                break;
        }
    };

    // ========================= shell html (built once) =========================
    const shellHtml = useMemo(() => buildWorShell({
        safeTop: insets.top,
        safeBottom: insets.bottom,
        novelTitle: novel.title || '',
        novelCover: novel.cover || '',
        userName: userInfo?.username || userInfo?.name || '',
        userRole: userInfo?.role || '',
        initialSettings: { ...settingsRef.current, continuousMode: settingsRef.current.continuousMode },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    // re-send chapters when the list changes
    useEffect(() => { if (webReadyRef.current) sendChapters(); }, [chaptersList]); // eslint-disable-line react-hooks/exhaustive-deps

    // ========================= render =========================
    const lightBg = isLightColor(settings.bgColor);

    return (
        <View style={[styles.container, { backgroundColor: settings.bgColor }]}>
            <StatusBar
                barStyle={lightBg ? 'dark-content' : 'light-content'}
                backgroundColor={settings.bgColor}
            />

            <WebView
                ref={webViewRef}
                source={{ html: shellHtml, baseUrl: 'https://app.zuesnovels.local' }}
                originWhitelist={['*']}
                style={{ flex: 1, backgroundColor: settings.bgColor }}
                javaScriptEnabled
                domStorageEnabled
                allowFileAccess
                allowUniversalAccessFromFileURLs
                setSupportMultipleWindows={false}
                showsVerticalScrollIndicator={false}
                onMessage={onMessage}
                cacheMode="LOAD_DEFAULT"
                // opaque=false keeps the shell's own background visible without white flashes
                opacity={1}
            />

            {/* loading overlay */}
            {loading && !errorInfo && (
                <View style={[styles.loadingOverlay, { backgroundColor: settings.bgColor }]}>
                    <ActivityIndicator size="large" color={lightBg ? '#333' : '#fff'} />
                    <Text style={[styles.loadingText, { color: lightBg ? '#333' : '#fff' }]}>جاري التحميل…</Text>
                </View>
            )}

            {/* error state */}
            {errorInfo && (
                <View style={[styles.errorContainer, { backgroundColor: settings.bgColor }]}>
                    <Ionicons name="cloud-offline-outline" size={64} color={lightBg ? '#555' : '#888'} />
                    <Text style={[styles.errorTitle, { color: lightBg ? '#111' : '#fff' }]}>تعذّر عرض الفصل</Text>
                    <Text style={[styles.errorMessage, { color: lightBg ? '#444' : '#999' }]}>{errorInfo.message}</Text>
                    <TouchableOpacity style={styles.errorBtn} onPress={fetchChapter}>
                        <Ionicons name="refresh" size={20} color="#000" />
                        <Text style={styles.errorBtnTextDark}>إعادة المحاولة</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.errorBtn, styles.errorBtnSecondary]} onPress={() => navigation.goBack()}>
                        <Ionicons name="arrow-back" size={20} color="#fff" />
                        <Text style={styles.errorBtnText}>رجوع</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* comments modal */}
            <Modal visible={showComments} animationType="slide" onRequestClose={() => setShowComments(false)}>
                <View style={styles.commentsSheet}>
                    <View style={styles.commentsHandle} />
                    <View style={styles.commentsHeader}>
                        <Text style={styles.commentsTitle}>تعليقات الفصل {chapterId}</Text>
                        <TouchableOpacity onPress={() => setShowComments(false)}>
                            <Ionicons name="close" size={24} color="#888" />
                        </TouchableOpacity>
                    </View>
                    {isOfflineMode ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{ color: '#666' }}>التعليقات غير متاحة بدون اتصال</Text>
                        </View>
                    ) : (
                        <CommentsSection novelId={novelId} user={userInfo} chapterNumber={currentViewedChapter} />
                    )}
                </View>
            </Modal>

            {/* folder creation modal */}
            <Modal visible={showFolderModal} transparent animationType="fade" onRequestClose={() => setShowFolderModal(false)}>
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowFolderModal(false)} />
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>اسم المجلد</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="اسم المجلد"
                            placeholderTextColor="#666"
                            value={newFolderName}
                            onChangeText={setNewFolderName}
                            textAlign="right"
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#333' }]} onPress={() => setShowFolderModal(false)}>
                                <Text style={styles.modalBtnText}>إلغاء</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#fff' }]} onPress={handleCreateFolder}>
                                <Text style={[styles.modalBtnText, { color: '#000' }]}>تم</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* admin: cleaner modal */}
            <Modal visible={showCleaner} animationType="slide" onRequestClose={() => setShowCleaner(false)}>
                <View style={styles.adminSheet}>
                    <View style={styles.adminHeader}>
                        <Text style={[styles.adminTitle, { color: '#ff4444' }]}>الحذف الشامل</Text>
                        <TouchableOpacity onPress={() => setShowCleaner(false)}>
                            <Ionicons name="close" size={24} color="#888" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.adminBody}>
                        <Text style={styles.adminHint}>يحذف النص المطابق من جميع الفصول في السيرفر (للمشرفين).</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.textInput}
                                placeholder="النص المراد حذفه أو تعديله"
                                placeholderTextColor="#666"
                                value={newCleanerWord}
                                onChangeText={setNewCleanerWord}
                                textAlign="right"
                                multiline
                            />
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity style={[styles.addButton, { flex: 1 }]} onPress={handleExecuteCleaner} disabled={cleaningLoading}>
                                    {cleaningLoading
                                        ? <ActivityIndicator color="#000" />
                                        : <Text style={styles.addButtonText}>{cleanerEditingId !== null ? 'تحديث' : 'تنفيذ الحذف'}</Text>}
                                </TouchableOpacity>
                                {cleanerEditingId !== null && (
                                    <TouchableOpacity
                                        style={[styles.addButton, { backgroundColor: '#555', flex: 0, paddingHorizontal: 16 }]}
                                        onPress={() => { setCleanerEditingId(null); setCleanerOldWord(''); setNewCleanerWord(''); }}
                                    >
                                        <Ionicons name="close" size={18} color="#fff" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                        <View style={{ maxHeight: SCREEN_HEIGHT * 0.45 }}>
                            {(cleanerWords || []).map((item, index) => (
                                <View key={`${item}_${index}`} style={styles.replacementItem}>
                                    <Text style={styles.replacementText} numberOfLines={2}>{item}</Text>
                                    <View style={{ flexDirection: 'row', gap: 12 }}>
                                        <TouchableOpacity onPress={() => { setNewCleanerWord(item); setCleanerEditingId(index); setCleanerOldWord(item); }}>
                                            <Ionicons name="create-outline" size={18} color="#8b95a5" />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => handleDeleteCleaner(item)}>
                                            <Ionicons name="trash-outline" size={18} color="#ff4444" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                            {(!cleanerWords || cleanerWords.length === 0) && (
                                <Text style={{ color: '#666', textAlign: 'center', marginTop: 20 }}>لا توجد كلمات محذوفة بعد</Text>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* admin: copyright modal */}
            <Modal visible={showCopyright} animationType="slide" onRequestClose={() => setShowCopyright(false)}>
                <View style={styles.adminSheet}>
                    <View style={styles.adminHeader}>
                        <Text style={[styles.adminTitle, { color: '#8b95a5' }]}>حقوق التطبيق</Text>
                        <TouchableOpacity onPress={() => setShowCopyright(false)}>
                            <Ionicons name="close" size={24} color="#888" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.adminBody}>
                        <Text style={styles.adminCardTitle}>تكرار الظهور</Text>
                        <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                            {[['always', 'كل فصل'], ['everyX', `كل ${copyrightEveryX || 'X'} فصول`], ['never', 'إيقاف']].map(([val, label]) => (
                                <TouchableOpacity
                                    key={val}
                                    style={[styles.freqBtn, copyrightFrequency === val && styles.freqBtnActive]}
                                    onPress={() => setCopyrightFrequency(val)}
                                >
                                    <Text style={[styles.freqBtnText, copyrightFrequency === val && { color: '#000' }]}>{label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {copyrightFrequency === 'everyX' && (
                            <TextInput
                                style={[styles.textInput, { marginBottom: 14 }]}
                                placeholder="عدد الفصول (X)"
                                placeholderTextColor="#666"
                                value={copyrightEveryX}
                                onChangeText={setCopyrightEveryX}
                                keyboardType="numeric"
                                textAlign="right"
                            />
                        )}

                        <Text style={styles.adminCardTitle}>نص البداية (يظهر أعلى الفصل)</Text>
                        <TextInput
                            style={[styles.textInput, { marginBottom: 14, minHeight: 70 }]}
                            placeholder="مثال: حقوق النشر محفوظة لتطبيق زيوس..."
                            placeholderTextColor="#666"
                            value={copyrightStartText}
                            onChangeText={setCopyrightStartText}
                            textAlign="right"
                            multiline
                        />

                        <Text style={styles.adminCardTitle}>نص النهاية (يظهر أسفل الفصل)</Text>
                        <TextInput
                            style={[styles.textInput, { marginBottom: 14, minHeight: 70 }]}
                            placeholder="مثال: شكراً للقراءة على تطبيق زيوس..."
                            placeholderTextColor="#666"
                            value={copyrightEndText}
                            onChangeText={setCopyrightEndText}
                            textAlign="right"
                            multiline
                        />

                        <Text style={styles.adminCardTitle}>نمط النص</Text>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                            {['#888888', '#ffffff', '#f97316', '#4ade80', '#3b82f6'].map(c => (
                                <TouchableOpacity
                                    key={c}
                                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: 2, borderColor: copyrightStyle.color === c ? '#fff' : 'transparent' }}
                                    onPress={() => setCopyrightStyle(prev => ({ ...prev, color: c }))}
                                />
                            ))}
                            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                                {['right', 'center', 'left'].map(a => (
                                    <TouchableOpacity
                                        key={a}
                                        style={[styles.alignBtn, copyrightStyle.alignment === a && styles.alignBtnActive]}
                                        onPress={() => setCopyrightStyle(prev => ({ ...prev, alignment: a }))}
                                    >
                                        <Text style={{ color: '#fff', fontSize: 11 }}>{a === 'right' ? 'يمين' : a === 'center' ? 'وسط' : 'يسار'}</Text>
                                    </TouchableOpacity>
                                ))}
                                <TouchableOpacity
                                    style={[styles.alignBtn, copyrightStyle.isBold && styles.alignBtnActive]}
                                    onPress={() => setCopyrightStyle(prev => ({ ...prev, isBold: !prev.isBold }))}
                                >
                                    <Text style={{ color: '#fff', fontSize: 11 }}>عريض</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <Switch
                                value={settings.enableSeparator}
                                onValueChange={(val) => applySettingsPatch({ enableSeparator: val })}
                                trackColor={{ false: '#333', true: '#8b95a5' }}
                                thumbColor="#fff"
                            />
                            <Text style={{ color: '#ccc', fontWeight: 'bold' }}>تفعيل الخط الفاصل تحت العنوان</Text>
                        </View>
                        {settings.enableSeparator && (
                            <TextInput
                                style={[styles.textInput, { marginBottom: 14 }]}
                                placeholder="__________________"
                                placeholderTextColor="#666"
                                value={settings.separatorText}
                                onChangeText={(val) => applySettingsPatch({ separatorText: val })}
                                textAlign="right"
                            />
                        )}

                        <TouchableOpacity style={[styles.addButton, { marginBottom: 30 }]} onPress={handleSaveCopyrights} disabled={copyrightLoading}>
                            {copyrightLoading ? <ActivityIndicator color="#000" /> : <Text style={styles.addButtonText}>حفظ الحقوق</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },

    // loading / error
    loadingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 50 },
    loadingText: { marginTop: 14, fontSize: 15, fontWeight: '600' },
    errorContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', padding: 30, zIndex: 60 },
    errorTitle: { fontSize: 22, fontWeight: 'bold', marginTop: 20, marginBottom: 10 },
    errorMessage: { fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 30 },
    errorBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', paddingVertical: 14, paddingHorizontal: 30, borderRadius: 14, width: '100%', marginBottom: 12 },
    errorBtnSecondary: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2e2e2e' },
    errorBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    errorBtnTextDark: { color: '#000', fontWeight: 'bold', fontSize: 16 },

    // comments
    commentsSheet: { flex: 1, backgroundColor: '#0a0a0a' },
    commentsHandle: { width: 40, height: 5, backgroundColor: '#333', borderRadius: 3, alignSelf: 'center', marginTop: 10 },
    commentsHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#222' },
    commentsTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

    // folder modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', alignItems: 'center' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject },
    modalContent: { width: '80%', marginBottom: '30%', backgroundColor: '#181818', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#2e2e2e' },
    modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
    modalInput: { width: '100%', backgroundColor: '#1d1d1d', color: '#fff', borderRadius: 10, padding: 12, textAlign: 'right', marginBottom: 20, borderWidth: 1, borderColor: '#2e2e2e' },
    modalButtons: { flexDirection: 'row', gap: 10, width: '100%' },
    modalBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    modalBtnText: { color: '#fff', fontWeight: 'bold' },

    // admin sheets
    adminSheet: { flex: 1, backgroundColor: '#0d0d0d' },
    adminHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#242424' },
    adminTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
    adminBody: { flex: 1, padding: 18 },
    adminHint: { color: '#888', fontSize: 12, marginBottom: 14, textAlign: 'right', lineHeight: 20 },
    adminCardTitle: { color: '#999', fontSize: 13, fontWeight: '700', marginBottom: 8, textAlign: 'right' },
    inputRow: { marginBottom: 16, gap: 10 },
    textInput: { backgroundColor: '#1d1d1d', color: '#fff', borderRadius: 10, padding: 12, textAlign: 'right', fontSize: 14, borderWidth: 1, borderColor: '#2e2e2e' },
    addButton: { backgroundColor: '#fff', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 10, gap: 8 },
    addButtonText: { color: '#000', fontWeight: 'bold' },
    replacementItem: { backgroundColor: '#181818', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#2a2a2a' },
    replacementText: { color: '#ddd', fontSize: 13, flex: 1, textAlign: 'right', marginRight: 10 },
    alignBtn: { padding: 8, backgroundColor: '#1a1a1a', borderRadius: 8, borderWidth: 1, borderColor: '#2e2e2e' },
    alignBtnActive: { backgroundColor: '#8b95a5', borderColor: '#8b95a5' },
    freqBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2e2e2e' },
    freqBtnActive: { backgroundColor: '#8b95a5', borderColor: '#8b95a5' },
    freqBtnText: { color: '#888', fontSize: 12, fontWeight: 'bold' },
});
