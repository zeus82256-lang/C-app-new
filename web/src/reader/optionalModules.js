// حماية موحّدة للوحدات الاختيارية الأصلية (TTS / منع إطفاء الشاشة).
// إذا حُذفت الوحدة الأصلية أو تغيّر إصدارها بشكل غير متوافق، يبقى التطبيق
// يعمل بالكامل وتُعطَّل هذه الميزتين فقط بدل انهيار التطبيق عند الإقلاع.
let Speech = {
    speak: () => { },
    stop: () => { },
    isSpeakingAsync: async () => false,
};
let KeepAwake = {
    activateKeepAwakeAsync: async () => { },
    deactivateKeepAwake: () => { },
};

try {
    const mod = require('expo-speech');
    if (mod && typeof mod.speak === 'function' && typeof mod.stop === 'function') {
        Speech = mod;
    }
} catch (e) { }

try {
    const mod = require('expo-keep-awake');
    if (mod && typeof mod.activateKeepAwakeAsync === 'function' && typeof mod.deactivateKeepAwake === 'function') {
        KeepAwake = mod;
    }
} catch (e) { }

export { Speech, KeepAwake };
