// web/src/reader/wordsStore.js
// Galaxy Novels-style word replacement store ("تغيير الكلمات").
// Two scopes exactly like Galaxy: "هذه الرواية" (per-novel) and "كل الروايات" (global).
// Replaces the old folders ("مجلدات") model with a flat two-scope glossary.
//
// Item shape: { id, original, replacement, exact, color }
//   - original    : word/phrase to find (trimmed)
//   - replacement : what to put in its place ('' = delete the word)
//   - exact       : true  → "كلمة مستقلة" (standalone word only, boundary-aware)
//                   false → "استبدال ذكي" (smart: replace everywhere the phrase occurs)
//   - color       : hex string → "تلوين البديل" (color the replacement inside the chapter), null = off

import AsyncStorage from '@react-native-async-storage/async-storage';

export const WORDS_KEY = '@reader_words_v3';
export const LEGACY_FOLDERS_KEY = '@reader_folders_v2';
export const LEGACY_REPLACEMENTS_KEY = '@reader_replacements';
export const WORDS_DEFAULT_COLOR = '#0ea5e9';

// Palette shown as quick-pick dots in the color section (Galaxy color-grid style)
export const WORDS_PALETTE = [
    '#0ea5e9', '#38bdf8', '#06b6d4', '#14b8a6', '#10b981', '#22c55e',
    '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444', '#ec4899',
    '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#f43f5e', '#fb7185',
    '#ffffff', '#cbd5e1', '#94a3b8', '#64748b', '#334155', '#0f172a',
];

const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

export const normalizeItem = (raw) => ({
    id: raw && raw.id ? String(raw.id) : rid(),
    original: String((raw && raw.original) || '').trim(),
    replacement: String((raw && raw.replacement) || '').trim(),
    exact: !!(raw && raw.exact),
    color: (raw && typeof raw.color === 'string' && HEX_RE.test(raw.color)) ? raw.color : null,
});

const dedupe = (list) => {
    const seen = new Set();
    const out = [];
    (list || []).forEach((it) => {
        if (!it || !it.original) return;
        const key = it.original.toLowerCase() + '\u0000' + it.replacement;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(it);
    });
    return out;
};

const emptyStore = () => ({ novel: {}, global: [] });

const sanitizeStore = (parsed) => {
    const store = emptyStore();
    if (parsed && typeof parsed === 'object') {
        if (parsed.novel && typeof parsed.novel === 'object') {
            Object.keys(parsed.novel).forEach((k) => {
                if (Array.isArray(parsed.novel[k])) store.novel[k] = dedupe(parsed.novel[k].map(normalizeItem));
            });
        }
        if (Array.isArray(parsed.global)) store.global = dedupe(parsed.global.map(normalizeItem));
    }
    return store;
};

export const novelScopeOf = (store, novelId) => {
    if (!store || !store.novel) return [];
    return store.novel[String(novelId || 'unknown')] || [];
};

export async function saveWordsStore(store) {
    try {
        const safe = store && store.novel ? store : emptyStore();
        await AsyncStorage.setItem(WORDS_KEY, JSON.stringify(safe));
    } catch (e) { }
}

// Load the full store; migrates the legacy folders model once per novel.
// Migration keeps the old effective behaviour: the folder matching the novel
// title (or the legacy default/first one) becomes this novel's scope.
export async function loadWordsStore(novelId, novelTitle) {
    let store = emptyStore();
    try {
        const raw = await AsyncStorage.getItem(WORDS_KEY);
        if (raw) store = sanitizeStore(JSON.parse(raw));
    } catch (e) { }

    const key = String(novelId || 'unknown');
    if (!Array.isArray(store.novel[key])) {
        store.novel[key] = [];
        try {
            let legacy = [];
            const foldersRaw = await AsyncStorage.getItem(LEGACY_FOLDERS_KEY);
            if (foldersRaw) legacy = JSON.parse(foldersRaw) || [];
            else {
                const oldest = await AsyncStorage.getItem(LEGACY_REPLACEMENTS_KEY);
                if (oldest) legacy = [{ name: String(novelTitle || ''), replacements: JSON.parse(oldest) || [] }];
            }
            const title = String(novelTitle || '');
            const match = legacy.find((f) => f && f.name === title)
                || legacy.find((f) => f && f.id === 'default_migrated')
                || legacy[0];
            if (match && Array.isArray(match.replacements) && match.replacements.length) {
                store.novel[key] = dedupe(match.replacements.map(normalizeItem));
            }
        } catch (e) { }
        await saveWordsStore(store); // persist (also marks migration as done for this novel)
    }
    return store;
}

// Global first, then this novel's — novel-scope rules win on collisions.
export function effectiveTerms(store, novelId) {
    const globalItems = (store && store.global) || [];
    const novelItems = novelScopeOf(store, novelId);
    return [...globalItems, ...novelItems].filter((t) => t.original);
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeDollar = (s) => String(s == null ? '' : s).replace(/\$/g, '$$$$');

// "كلمة مستقلة" — boundary-aware replace (never corrupts neighbouring Arabic words)
const replaceExact = (content, original, replacement) => {
    const escaped = escapeRegex(original);
    const safeRepl = escapeDollar(replacement);
    if (/^[A-Za-z0-9]/.test(original)) {
        try { return content.replace(new RegExp('\\b' + escaped + '\\b', 'g'), safeRepl); } catch (e) { }
    }
    try {
        const re = new RegExp('(?<![\\u0600-\\u06FF\\w])' + escaped + '(?![\\u0600-\\u06FF\\w])', 'g');
        return content.replace(re, safeRepl);
    } catch (e) {
        return content.replace(new RegExp(escaped, 'g'), safeRepl);
    }
};

// "استبدال ذكي" — replace every occurrence of the phrase (regex-escaped, $-safe)
const replaceSmart = (content, original, replacement) => {
    try {
        return content.replace(new RegExp(escapeRegex(original), 'g'), escapeDollar(replacement));
    } catch (e) {
        return content;
    }
};

// Apply the replacement list to raw chapter text.
export function replaceTermsInText(content, terms) {
    let out = String(content == null ? '' : content);
    (terms || []).forEach((t) => {
        if (!t || !t.original) return;
        const repl = t.replacement == null ? '' : String(t.replacement);
        out = t.exact ? replaceExact(out, t.original, repl) : replaceSmart(out, t.original, repl);
    });
    return out;
}

// Terms whose replacement should be colored inside the chapter ("تلوين البديل").
// Coloring targets the replacement text as it appears AFTER replacement.
export function buildColoredTerms(terms) {
    const map = new Map(); // escaped-html-later; here keyed by raw replacement text
    (terms || []).forEach((t) => {
        if (!t || !t.color || !t.replacement) return;
        map.set(t.replacement, t.color);
    });
    return Array.from(map.entries()).map(([term, color]) => ({ term, color }));
}

// Escape text for safe embedding in HTML text nodes (same policy as the readers)
export const escapeHtmlText = (text) => String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Build { pattern, color } list ready for the single-pass line formatter.
// Called AFTER replacements ran, so the colored word is the replacement itself.
export function buildColoredRegexSources(coloredTerms) {
    return (coloredTerms || []).map(({ term, color }) => ({
        src: escapeRegex(escapeHtmlText(term)),
        color,
        escaped: escapeHtmlText(term),
    })).filter((x) => x.src.length > 0);
}

export const sortWordsList = (list) => (list || []).slice().sort((a, b) =>
    String(a.original || '').localeCompare(String(b.original || ''), 'ar'));
