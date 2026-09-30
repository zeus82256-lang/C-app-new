/**
 * 🛡️ مسارات الأمان:
 *   POST /api/security/captcha  → تحقق Turnstile وإصدار رمز مرور مؤقت (عام)
 *   GET  /api/security/honeypot → فخ السكرابرز — حظر فوري (عام، يُفهرس عمداً)
 *   GET  /api/admin/security/bans  → قائمة الحظر (admin)
 *   POST /api/admin/security/unban → فك حظر (admin)
 *   GET  /api/admin/security/stats → إحصاءات (admin)
 */
const security = require('../services/security.service');

module.exports = (app, verifyToken, verifyAdmin) => {
  // بوابة الكابتشا — عامة (الزائر المقيّد يحتاجها)
  app.post('/api/security/captcha', async (req, res) => {
    try {
      const { token } = req.body || {};
      if (!token) return res.status(400).json({ message: 'توكن التحقق مفقود' });
      if (!security.hasTurnstile()) {
        return res.status(400).json({ message: 'الكابتشا غير مضبوطة على الخادم' });
      }
      const ip = security.getIp(req);
      const pass = await security.issueCaptchaPass(token, ip);
      if (!pass) return res.status(400).json({ message: 'فشل التحقق — أعد المحاولة' });
      res.json({ pass });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  });

  // 🕳️ فخ السكرابر — أي زيارة هنا = حظر فوري (يعالجه الوسيط في index.js)
  app.get('/api/security/honeypot', (req, res) => {
    res.status(403).json({ message: 'Blocked' });
  });

  // ═══ الإدارة ═══
  app.get('/api/admin/security/bans', verifyAdmin, async (req, res) => {
    res.json({ bans: security.listBans() });
  });

  app.post('/api/admin/security/unban', verifyAdmin, async (req, res) => {
    const { ip } = req.body || {};
    if (!ip) return res.status(400).json({ message: 'ip مطلوب' });
    security.unbanIp(ip);
    res.json({ success: true });
  });

  app.get('/api/admin/security/stats', verifyAdmin, async (req, res) => {
    res.json(security.securityStats());
  });
};
