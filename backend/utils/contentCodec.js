// ============================================================
// contentCodec.js — ترميز/فك ترميز محتوى الفصول
// بعد التحديث: التخزين والإرسال كلها نص صريح، وتبقى هذه الأداة
// فقط لفك تشفير الفصول القديمة المحفوظة بصيغة XOR+base64 تلقائياً.
// ============================================================

const ZEUS_SECRET = 'Z3uS_N0v3l_2026_S3cr3t_K3y';

/**
 * يفك تشفير النص القديم (XOR + offset + rotation + base64).
 * إذا كان النص صريحاً أصلاً يعيده كما هو دون أي تعديل.
 */
function tryDecryptObfuscated(text) {
    if (!text) return '';
    const value = String(text);

    // النص الصريح يحتوي مسافات/أسطر/حروف عربية → ليس base64 → أعده كما هو
    const compact = value.replace(/\s+/g, '');
    if (compact.length < 16) return value;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return value;
    if (compact.length % 4 !== 0) return value;

    try {
        const binary = Buffer.from(compact, 'base64').toString('binary');
        let result = '';
        for (let i = 0; i < binary.length; i++) {
            let charCode = binary.charCodeAt(i);
            charCode = (charCode - 3 + 256) % 256;          // عكس Rotation
            charCode = (charCode - ((i * 7) % 13) + 256) % 256; // عكس Offset
            charCode = charCode ^ ZEUS_SECRET.charCodeAt(i % ZEUS_SECRET.length); // عكس XOR
            result += String.fromCharCode(charCode);
        }
        const decoded = decodeURIComponent(result);
        // تحقق أن الناتج نص مقروء فعلاً وليس ناتج فك خاطئ
        if (decoded && /[\u0600-\u06FFa-zA-Z]/.test(decoded) && !decoded.includes('\uFFFD')) {
            return decoded;
        }
        return value;
    } catch (e) {
        return value;
    }
}

module.exports = { tryDecryptObfuscated, ZEUS_SECRET };
