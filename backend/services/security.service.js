/**
 * 🛡️ خدمة حماية الخادم — الحد من الطلبات + الحظر التلقائي + الكابتشا.
 *
 * - عدّاد نافذة منزلقة في الذاكرة لكل IP (خفيف جداً — لا قاعدة بيانات).
 *   • المسار العام: 240 طلب/دقيقة
 *   • فتح الفصول: 40 فصلاً/دقيقة (حد حماية المحتوى الأساسي)
 *   • جمع التحليلات: 60/دقيقة
 * - تجاوز حدود الفصول → 429 captchaRequired إن ضُبطت مفاتيح Turnstile،
 *   وإلا حظر مؤقت تلقائي 15 دقيقة.
 * - فخ السكرابر (honeypot): حظر فوري دائم الحصة.
 * - رمز مرور الكابتشا: JWT قصير (15 د) بعد التحقق من التوكن لدى Cloudflare.
 *
 * ملاحظة صدق: القوائم في الذاكرة تُمسح مع إعادة تشغيل الحاوية — هذا مقصود
 * (إعادة التشغيل نادرة، والاستمرارية الدائمة غير ضرورية لحماية فعالة).
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// ─── الحالة في الذاكرة ───
const windows = new Map();   // ip → { global: [ts], chapters: [ts], collect: [ts] }
const bans = new Map();      // ip → { reason, until, requests }
const lastMinuteTotal = new Map(); // ip → count (لإحصاءات الأمان)

const LIMITS = {
  global: { max: 240, windowMs: 60_000 },
  chapters: { max: 40, windowMs: 60_000 },
  collect: { max: 60, windowMs: 60_000 },
};
const TEMP_BAN_MS = 15 * 60 * 1000;
const HONEYPOT_BAN_MS = 24 * 60 * 60 * 1000;

const hasTurnstile = () => !!process.env.TURNSTILE_SECRET;
const CHAPTER_RE = /^\/api\/novels\/[^/]+\/chapters\//;

function trimWindow(arr, windowMs) {
  const cutoff = Date.now() - windowMs;
  while (arr.length && arr[0] < cutoff) arr.shift();
}

function getIp(req) {
  return (
    req.headers['cf-connecting-ip'] ||
    req.headers['x-real-ip'] ||
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * الوسيط الرئيسي — يُركّب قبل كل المسارات.
 * req.ipSecurity = { banned, tempBanned } للاستخدام الأدنى.
 */
function securityMiddleware(req, res, next) {
  const ip = getIp(req);

  // 1) محظور؟
  const ban = bans.get(ip);
  if (ban && ban.until > Date.now()) {
    ban.requests++;
    return res.status(403).json({
      message: 'تم حظر عنوان IP الخاص مؤقتاً بسبب نشاط مخالف (نسخ آلي أو طلبات مفرطة).',
      until: ban.until,
    });
  }
  if (ban) bans.delete(ip); // انتهى الحظر

  // 2) فخ السكرابر — حظر فوري
  if (req.path === '/api/security/honeypot') {
    bans.set(ip, { reason: 'فخ السكرابر (honeypot)', until: Date.now() + HONEYPOT_BAN_MS, requests: 1 });
    return res.status(403).json({ message: 'تم رصد نشاط آلي مخالف وحظر العنوان.' });
  }

  // 3) النوافذ المنزلقة
  if (!windows.has(ip)) windows.set(ip, { global: [], chapters: [], collect: [] });
  const w = windows.get(ip);

  trimWindow(w.global, LIMITS.global.windowMs);
  w.global.push(Date.now());
  lastMinuteTotal.set(ip, w.global.length);

  // تتبع فتح الفصول
  const isChapterReq = CHAPTER_RE.test(req.path);
  if (isChapterReq) {
    trimWindow(w.chapters, LIMITS.chapters.windowMs);
    w.chapters.push(Date.now());
    if (w.chapters.length > LIMITS.chapters.max) {
      if (hasTurnstile()) {
        return res.status(429).json({
          message: 'سرعة غير طبيعية في فتح الفصول — يلزم تحقق بشري.',
          captchaRequired: true,
        });
      }
      // لا كابتشا مضبوطة → حظر مؤقت مباشر
      bans.set(ip, { reason: 'فتح فصول بسرعة غير طبيعية', until: Date.now() + TEMP_BAN_MS, requests: w.chapters.length });
      return res.status(429).json({ message: 'طلبات كثيرة جداً — تم تقييد العنوان مؤقتاً. حاول بعد 15 دقيقة.' });
    }
  }

  // حد عام (مخفف: نحظر فقط عند ضعف الحد مضاعفاً — الغرض إسقاط الطوفان)
  if (w.global.length > LIMITS.global.max * 2) {
    bans.set(ip, { reason: 'طوفان طلبات عام', until: Date.now() + TEMP_BAN_MS, requests: w.global.length });
    return res.status(429).json({ message: 'حجم طلبات غير طبيعي — تم تقييد العنوان مؤقتاً.' });
  }

  // تنظيف دوري للذاكرة (كل ~5000 طلب)
  if (windows.size > 20000) {
    const now = Date.now();
    for (const [k, v] of windows) {
      if (!v.global.length || now - v.global[v.global.length - 1] > 10 * 60_000) windows.delete(k);
    }
  }

  next();
}

/** وسطي خفيف لمسار جمع التحليلات (حد خاص) */
function collectRateLimit(req, res, next) {
  const ip = getIp(req);
  const w = windows.get(ip) || windows.set(ip, { global: [], chapters: [], collect: [] }).get(ip);
  trimWindow(w.collect, LIMITS.collect.windowMs);
  w.collect.push(Date.now());
  if (w.collect.length > LIMITS.collect.max) {
    return res.status(429).json({ message: 'أحداث تحليلات كثيرة جداً' });
  }
  next();
}

// ─── الكابتشا (Cloudflare Turnstile) ───

async function verifyTurnstileToken(token, ip) {
  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET,
        response: token,
        remoteip: ip || undefined,
      }),
    });
    const data = await res.json();
    return !!data.success;
  } catch {
    return false;
  }
}

/**
 * تُستدعى من مسار /api/security/captcha:
 * تحقق من توكن Turnstile ثم إصدار رمز مرور مؤقت.
 */
async function issueCaptchaPass(token, ip) {
  const ok = await verifyTurnstileToken(token, ip);
  if (!ok) return null;
  const pass = jwt.sign({ ip, kind: 'captcha-pass' }, process.env.JWT_SECRET || 'moon-secret', { expiresIn: '15m' });
  return pass;
}

/** هل رمز المرور صالح؟ (يستخدمه وسيط فحص اختياري) */
function checkCaptchaPass(passToken) {
  try {
    const decoded = jwt.verify(passToken, process.env.JWT_SECRET || 'moon-secret');
    return decoded.kind === 'captcha-pass';
  } catch {
    return false;
  }
}

/** إحصاءات الأمان للوحة الإدارة */
function securityStats() {
  let requestsLastMinute = 0;
  const now = Date.now();
  for (const [, w] of windows) {
    const arr = w.global.filter((t) => t > now - 60_000);
    requestsLastMinute += arr.length;
  }
  return {
    bannedIps: bans.size,
    trackedIps: windows.size,
    requestsLastMinute,
    captchaChallenges: hasTurnstile() ? 'Turnstile مفعّل' : 'تهدئة زمنية',
    turnstileEnabled: hasTurnstile(),
  };
}

function listBans() {
  return [...bans.entries()].map(([ip, v]) => ({ ip, reason: v.reason, until: v.until, requests: v.requests }));
}

function unbanIp(ip) {
  return bans.delete(ip);
}

module.exports = {
  securityMiddleware,
  collectRateLimit,
  getIp,
  issueCaptchaPass,
  checkCaptchaPass,
  securityStats,
  listBans,
  unbanIp,
  hasTurnstile,
};
