// web/src/reader/worFonts.js
// The 29 reader fonts offered by the Galaxy Novels reader (exact data-value /
// data-name / data-family triples extracted from the original reader markup).
// `google` holds the Google Fonts family used to lazy-load the font inside the
// reader WebView. thmanyah Serif Text is a device-local font on the original
// site (no web file) — it gracefully falls back to Amiri, exactly like there.

export const WOR_FONTS = [
  { value: 'default',            name: 'الخط العادي',           family: 'inherit', google: null },
  { value: 'thmanyah-serif-text',name: 'خط ثمانية للنصوص',      family: '"thmanyah Serif Text", "Thmanyah Serif Text", "Thmanyah", Amiri, Georgia, serif', google: null },
  { value: 'cairo',              name: 'خط كايرو',              family: 'Cairo, Tahoma, Arial, sans-serif', google: 'Cairo:wght@300;400;600;700;900' },
  { value: 'tajawal',            name: 'خط تجوال',              family: 'Tajawal, Tahoma, Arial, sans-serif', google: 'Tajawal:wght@300;400;500;700;900' },
  { value: 'amiri',              name: 'خط أميري',              family: 'Amiri, Georgia, serif', google: 'Amiri:wght@400;700' },
  { value: 'noto-naskh-arabic',  name: 'خط نوتو نسخ العربي',    family: '"Noto Naskh Arabic", Amiri, Georgia, serif', google: 'Noto+Naskh+Arabic:wght@400;500;600;700' },
  { value: 'readex-pro',         name: 'خط ريدكس برو',          family: '"Readex Pro", Tahoma, Arial, sans-serif', google: 'Readex+Pro:wght@300;400;500;600;700' },
  { value: 'scheherazade-new',   name: 'خط شهرزاد الجديد',      family: '"Scheherazade New", Amiri, Georgia, serif', google: 'Scheherazade+New:wght@400;700' },
  { value: 'changa',             name: 'خط تشانغا',             family: 'Changa, Tahoma, Arial, sans-serif', google: 'Changa:wght@300;400;500;600;700;800' },
  { value: 'el-messiri',         name: 'خط المسيري',            family: '"El Messiri", Tahoma, Arial, sans-serif', google: 'El+Messiri:wght@400;500;600;700' },
  { value: 'harmattan',          name: 'خط هارماتان',           family: 'Harmattan, Tahoma, Arial, sans-serif', google: 'Harmattan:wght@400;500;600;700' },
  { value: 'reem-kufi',          name: 'خط ريم كوفي',           family: '"Reem Kufi", Tahoma, Arial, sans-serif', google: 'Reem+Kufi:wght@400;500;600;700' },
  { value: 'markazi-text',       name: 'خط مركزي',              family: '"Markazi Text", Amiri, Georgia, serif', google: 'Markazi+Text:wght@400;500;600;700' },
  { value: 'lateef',             name: 'خط لطيف',               family: 'Lateef, Amiri, Georgia, serif', google: 'Lateef:wght@400;700' },
  { value: 'mirza',              name: 'خط ميرزا',              family: 'Mirza, Amiri, Georgia, serif', google: 'Mirza:wght@400;700' },
  { value: 'lalezar',            name: 'خط لاليزار',            family: 'Lalezar, Tahoma, Arial, sans-serif', google: 'Lalezar' },
  { value: 'baloo-bhaijaan-2',   name: 'خط بالو بهيجان',        family: '"Baloo Bhaijaan 2", Tahoma, Arial, sans-serif', google: 'Baloo+Bhaijaan+2:wght@400;500;600;700;800' },
  { value: 'aref-ruqaa',         name: 'خط عارف رقعة',          family: '"Aref Ruqaa", Amiri, Georgia, serif', google: 'Aref+Ruqaa:wght@400;700' },
  { value: 'rakkas',             name: 'خط ركاس',               family: 'Rakkas, Amiri, Georgia, serif', google: 'Rakkas' },
  { value: 'vazirmatn',          name: 'خط وزيرمتن',            family: 'Vazirmatn, Tahoma, Arial, sans-serif', google: 'Vazirmatn:wght@300;400;500;700;900' },
  { value: 'almarai',            name: 'خط المراعي',            family: 'Almarai, Tahoma, Arial, sans-serif', google: 'Almarai:wght@300;400;700;800' },
  { value: 'changa-one',         name: 'خط تشانغا ون',          family: '"Changa One", Tahoma, Arial, sans-serif', google: 'Changa+One' },
  { value: 'katibeh',            name: 'خط كاتبة',              family: 'Katibeh, Amiri, Georgia, serif', google: 'Katibeh' },
  { value: 'kufam',              name: 'خط كوفام',              family: 'Kufam, Tahoma, Arial, sans-serif', google: 'Kufam:wght@400;500;600;700;800' },
  { value: 'mada',               name: 'خط مدى',                family: 'Mada, Tahoma, Arial, sans-serif', google: 'Mada:wght@300;400;500;700;900' },
  { value: 'qahiri',             name: 'خط قاهري',              family: 'Qahiri, Tahoma, Arial, sans-serif', google: 'Qahiri' },
  { value: 'ruwudu',             name: 'خط روودو',              family: 'Ruwudu, Amiri, Georgia, serif', google: 'Ruwudu:wght@400;700' },
  { value: 'noto-kufi-arabic',   name: 'خط نوتو كوفي العربي',   family: '"Noto Kufi Arabic", Tahoma, Arial, sans-serif', google: 'Noto+Kufi+Arabic:wght@400;500;600;700' },
  { value: 'noto-sans-arabic',   name: 'خط نوتو سانس العربي',   family: '"Noto Sans Arabic", Tahoma, Arial, sans-serif', google: 'Noto+Sans+Arabic:wght@300;400;500;700;900' },
];

// Google Fonts that ship with the reader out of the box (loaded on first
// launch so the font panel shows real previews immediately).
export const WOR_PRELOAD_FONTS = ['cairo', 'tajawal', 'amiri', 'noto-naskh-arabic', 'readex-pro', 'scheherazade-new'];

export const worFontByValue = (value) => WOR_FONTS.find(f => f.value === value) || WOR_FONTS[0];
