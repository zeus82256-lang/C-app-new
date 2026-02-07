const cloudinary = require('cloudinary').v2;

// إعداد Cloudinary
// الأولوية لمتغيرات البيئة (Vercel)، والقيم النصية كاحتياط للتطوير المحلي
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'djuhxdjj',
  api_key: process.env.CLOUDINARY_API_KEY || '516595746612747',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'Uek7YCx4pxjrrDlUC44jFYG9ZrQ'
});

console.log("☁️ Cloudinary Configured Successfully");

module.exports = cloudinary;
