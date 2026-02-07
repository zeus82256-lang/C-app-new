const admin = require("firebase-admin");

// دالة لمحاولة استخراج إعدادات Firebase سواء من متغيرات البيئة أو من ملف محلي (للتطوير)
const getServiceAccount = () => {
  // 1. الخيار الأول: القراءة من متغير البيئة في Vercel (Stringified JSON)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
      console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable");
      throw e;
    }
  }
  
  // 2. الخيار الثاني: القراءة من الملف المحلي (فقط أثناء التطوير المحلي)
  // المسار هنا يعود خطوة واحدة للخلف للوصول إلى backend/serviceAccountKey.json
  try {
    return require("../serviceAccountKey.json");
  } catch (e) {
    console.warn("⚠️ Local serviceAccountKey.json not found. Ensure FIREBASE_SERVICE_ACCOUNT is set in env vars.");
    return null;
  }
};

const serviceAccount = getServiceAccount();

if (serviceAccount) {
  // التأكد من عدم تهيئة التطبيق مرتين
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("🔥 Firebase Admin Initialized Successfully via Env/File");
  }
} else {
  console.error("❌ Firebase Admin Config Missing! Check environment variables.");
}

const db = admin.firestore();

module.exports = { admin, db };
