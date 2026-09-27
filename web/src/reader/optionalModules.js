// حماية موحّدة للوحدة الاختيارية الأصلية (منع إطفاء الشاشة).
// إذا حُذفت الوحدة الأصلية أو تغيّر إصدارها بشكل غير متوافق، يبقى التطبيق
// يعمل بالكامل وتُعطَّل هذه الميزة فقط بدل انهيار التطبيق عند الإقلاع.
let KeepAwake = {
    activateKeepAwakeAsync: async () => { },
    deactivateKeepAwake: () => { },
};

try {
    const mod = require('expo-keep-awake');
    if (mod && typeof mod.activateKeepAwakeAsync === 'function' && typeof mod.deactivateKeepAwake === 'function') {
        KeepAwake = mod;
    }
} catch (e) { }

export { KeepAwake };
