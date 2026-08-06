/**
 * MediMate Multilingual Translations
 * Supports: English (en), Hindi (hi), Kannada (kn), Tamil (ta), Telugu (te), Malayalam (ml)
 */

const translations = {
  en: {
    // Navigation / Headings
    myMedications: 'My Medications',
    todaySchedule: "Today's Schedule",
    settings: 'Settings & Preferences',
    addPrescription: 'Add Prescription',

    // Medicine Card
    readMedicine: '🔊 Read Medicine',
    remainingTablets: 'tablets remaining',
    daysRemaining: 'days remaining',
    nextReminder: 'Next Reminder',
    beforeFood: 'Before Food',
    afterFood: 'After Food',
    active: 'Active',
    completed: 'Completed',
    doseHistory: 'Dose History',

    // Schedule Actions
    takeNow: 'Take Now',
    snooze: 'Snooze',
    skip: 'Skip',
    voiceCommand: '🎤 Voice',
    morning: 'Morning Doses',
    afternoon: 'Afternoon Doses',
    evening: 'Evening & Night Doses',

    // Settings
    language: 'Preferred Language',
    voiceReminders: 'Voice Reminders',
    speechSpeed: 'Speech Speed',
    reminderRepeat: 'Reminder Repeat Count',
    elderMode: 'Elder Mode',
    highContrast: 'High Contrast Mode',
    largeText: 'Large Text Mode',
    languageVoice: 'Language & Voice',
    accessibility: 'Accessibility',
    saveSettings: 'Save Settings',

    // Voice Reminder Messages
    reminderGreeting: (timeOfDay) => `Good ${timeOfDay}.`,
    reminderMessage: (name, timing, food) =>
      `It is time to take your ${name}. Please take ${timing} ${food}.`,
    takenMsg: 'Medicine marked as taken. Stay healthy!',
    snoozeMsg: 'Reminder snoozed for 10 minutes.',
    skipMsg: 'Medicine skipped.',
  },

  hi: {
    myMedications: 'मेरी दवाइयाँ',
    todaySchedule: 'आज का कार्यक्रम',
    settings: 'सेटिंग्स',
    addPrescription: 'पर्ची जोड़ें',

    readMedicine: '🔊 दवाई पढ़ें',
    remainingTablets: 'गोलियाँ बची हैं',
    daysRemaining: 'दिन बचे हैं',
    nextReminder: 'अगला रिमाइंडर',
    beforeFood: 'खाने से पहले',
    afterFood: 'खाने के बाद',
    active: 'सक्रिय',
    completed: 'पूर्ण',
    doseHistory: 'खुराक इतिहास',

    takeNow: 'अभी लें',
    snooze: 'स्नूज़',
    skip: 'छोड़ें',
    voiceCommand: '🎤 आवाज़',
    morning: 'सुबह की खुराक',
    afternoon: 'दोपहर की खुराक',
    evening: 'शाम और रात की खुराक',

    language: 'पसंदीदा भाषा',
    voiceReminders: 'आवाज़ रिमाइंडर',
    speechSpeed: 'बोलने की गति',
    reminderRepeat: 'रिमाइंडर दोहराएं',
    elderMode: 'बुजुर्ग मोड',
    highContrast: 'उच्च कंट्रास्ट',
    largeText: 'बड़ा टेक्स्ट',
    languageVoice: 'भाषा और आवाज़',
    accessibility: 'सुगम्यता',
    saveSettings: 'सेटिंग्स सहेजें',

    reminderGreeting: (timeOfDay) => `${timeOfDay} नमस्ते।`,
    reminderMessage: (name, timing, food) =>
      `अब आपकी ${name} लेने का समय है। कृपया ${food} के साथ ${timing} लें।`,
    takenMsg: 'दवाई ले ली गई। स्वस्थ रहें!',
    snoozeMsg: 'रिमाइंडर 10 मिनट के लिए स्नूज़ किया गया।',
    skipMsg: 'दवाई छोड़ दी गई।',
  },

  kn: {
    myMedications: 'ನನ್ನ ಔಷಧಗಳು',
    todaySchedule: 'ಇಂದಿನ ವೇಳಾಪಟ್ಟಿ',
    settings: 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
    addPrescription: 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಸೇರಿಸಿ',

    readMedicine: '🔊 ಔಷಧ ಓದಿ',
    remainingTablets: 'ಮಾತ್ರೆಗಳು ಉಳಿದಿವೆ',
    daysRemaining: 'ದಿನಗಳು ಉಳಿದಿವೆ',
    nextReminder: 'ಮುಂದಿನ ನೆನಪೂಡಿಕೆ',
    beforeFood: 'ಊಟಕ್ಕಿಂತ ಮುಂಚೆ',
    afterFood: 'ಊಟದ ನಂತರ',
    active: 'ಸಕ್ರಿಯ',
    completed: 'ಪೂರ್ಣ',
    doseHistory: 'ಡೋಸ್ ಇತಿಹಾಸ',

    takeNow: 'ಈಗ ತೆಗೆದುಕೊಳ್ಳಿ',
    snooze: 'ಸ್ನೂಜ್',
    skip: 'ಬಿಡಿ',
    voiceCommand: '🎤 ಧ್ವನಿ',
    morning: 'ಬೆಳಿಗ್ಗೆ ಡೋಸ್',
    afternoon: 'ಮಧ್ಯಾಹ್ನ ಡೋಸ್',
    evening: 'ಸಂಜೆ ಮತ್ತು ರಾತ್ರಿ ಡೋಸ್',

    language: 'ಆದ್ಯ ಭಾಷೆ',
    voiceReminders: 'ಧ್ವನಿ ನೆನಪೂಡಿಕೆ',
    speechSpeed: 'ಮಾತಿನ ವೇಗ',
    reminderRepeat: 'ನೆನಪೂಡಿಕೆ ಪುನರಾವರ್ತನೆ',
    elderMode: 'ಹಿರಿಯ ಮೋಡ್',
    highContrast: 'ಹೆಚ್ಚಿನ ಕಾಂಟ್ರಾಸ್ಟ್',
    largeText: 'ದೊಡ್ಡ ಪಠ್ಯ',
    languageVoice: 'ಭಾಷೆ ಮತ್ತು ಧ್ವನಿ',
    accessibility: 'ಪ್ರವೇಶಿಸುವಿಕೆ',
    saveSettings: 'ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ಉಳಿಸಿ',

    reminderGreeting: (timeOfDay) => `${timeOfDay} ನಮಸ್ಕಾರ.`,
    reminderMessage: (name, timing, food) =>
      `ಈಗ ನಿಮ್ಮ ${name} ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯ. ${food} ${timing} ತೆಗೆದುಕೊಳ್ಳಿ.`,
    takenMsg: 'ಔಷಧ ತೆಗೆದುಕೊಳ್ಳಲಾಯಿತು. ಆರೋಗ್ಯವಾಗಿರಿ!',
    snoozeMsg: 'ನೆನಪೂಡಿಕೆ 10 ನಿಮಿಷ ಮುಂದೂಡಲಾಗಿದೆ.',
    skipMsg: 'ಔಷಧ ತಪ್ಪಿಸಲಾಗಿದೆ.',
  },

  ta: {
    myMedications: 'என் மருந்துகள்',
    todaySchedule: 'இன்றைய அட்டவணை',
    settings: 'அமைப்புகள்',
    addPrescription: 'மருந்துச்சீட்டு சேர்க்கவும்',

    readMedicine: '🔊 மருந்தை படிக்கவும்',
    remainingTablets: 'மாத்திரைகள் உள்ளன',
    daysRemaining: 'நாட்கள் மீதம்',
    nextReminder: 'அடுத்த நினைவூட்டல்',
    beforeFood: 'சாப்பிடுவதற்கு முன்',
    afterFood: 'சாப்பிட்ட பிறகு',
    active: 'செயல்பாட்டில்',
    completed: 'முடிந்தது',
    doseHistory: 'மருந்து வரலாறு',

    takeNow: 'இப்போது எடுக்கவும்',
    snooze: 'ஒத்திடு',
    skip: 'தவிர்க்கவும்',
    voiceCommand: '🎤 குரல்',
    morning: 'காலை மருந்துகள்',
    afternoon: 'மதியம் மருந்துகள்',
    evening: 'மாலை மற்றும் இரவு மருந்துகள்',

    language: 'விருப்பமான மொழி',
    voiceReminders: 'குரல் நினைவூட்டல்',
    speechSpeed: 'பேச்சு வேகம்',
    reminderRepeat: 'நினைவூட்டல் மீண்டும்',
    elderMode: 'மூத்தோர் பயன்முறை',
    highContrast: 'அதிக கான்ட்ராஸ்ட்',
    largeText: 'பெரிய உரை',
    languageVoice: 'மொழி மற்றும் குரல்',
    accessibility: 'அணுகல்',
    saveSettings: 'அமைப்புகளை சேமி',

    reminderGreeting: (timeOfDay) => `வணக்கம், ${timeOfDay}.`,
    reminderMessage: (name, timing, food) =>
      `இப்போது உங்கள் ${name} எடுக்கும் நேரம். ${food} ${timing} எடுக்கவும்.`,
    takenMsg: 'மருந்து எடுக்கப்பட்டது. ஆரோக்கியமாக இருங்கள்!',
    snoozeMsg: 'நினைவூட்டல் 10 நிமிடங்களுக்கு ஒத்திடப்பட்டது.',
    skipMsg: 'மருந்து தவிர்க்கப்பட்டது.',
  },

  te: {
    myMedications: 'నా మందులు',
    todaySchedule: 'నేటి షెడ్యూల్',
    settings: 'సెట్టింగ్‌లు',
    addPrescription: 'ప్రిస్క్రిప్షన్ జోడించండి',

    readMedicine: '🔊 మందు చదవండి',
    remainingTablets: 'మాత్రలు మిగిలాయి',
    daysRemaining: 'రోజులు మిగిలాయి',
    nextReminder: 'తదుపరి రిమైండర్',
    beforeFood: 'తినడానికి ముందు',
    afterFood: 'తిన్న తర్వాత',
    active: 'చురుకుగా',
    completed: 'పూర్తయింది',
    doseHistory: 'మోతాదు చరిత్ర',

    takeNow: 'ఇప్పుడు తీసుకోండి',
    snooze: 'స్నూజ్',
    skip: 'దాటవేయండి',
    voiceCommand: '🎤 వాయిస్',
    morning: 'ఉదయం మోతాదులు',
    afternoon: 'మధ్యాహ్నం మోతాదులు',
    evening: 'సాయంత్రం మరియు రాత్రి మోతాదులు',

    language: 'ఇష్టమైన భాష',
    voiceReminders: 'వాయిస్ రిమైండర్‌లు',
    speechSpeed: 'మాట వేగం',
    reminderRepeat: 'రిమైండర్ పునరావృతం',
    elderMode: 'వృద్ధుల మోడ్',
    highContrast: 'అధిక కాంట్రాస్ట్',
    largeText: 'పెద్ద అక్షరాలు',
    languageVoice: 'భాష మరియు వాయిస్',
    accessibility: 'యాక్సెసిబిలిటీ',
    saveSettings: 'సెట్టింగ్‌లు సేవ్ చేయండి',

    reminderGreeting: (timeOfDay) => `${timeOfDay} నమస్కారం.`,
    reminderMessage: (name, timing, food) =>
      `ఇప్పుడు మీ ${name} తీసుకునే సమయం. ${food} ${timing} తీసుకోండి.`,
    takenMsg: 'మందు తీసుకోబడింది. ఆరోగ్యంగా ఉండండి!',
    snoozeMsg: 'రిమైండర్ 10 నిమిషాలకు వాయిదా వేయబడింది.',
    skipMsg: 'మందు దాటవేయబడింది.',
  },

  ml: {
    myMedications: 'എന്റെ മരുന്നുകൾ',
    todaySchedule: 'ഇന്നത്തെ ഷെഡ്യൂൾ',
    settings: 'ക്രമീകരണങ്ങൾ',
    addPrescription: 'പ്രിസ്ക്രിപ്ഷൻ ചേർക്കുക',

    readMedicine: '🔊 മരുന്ന് വായിക്കുക',
    remainingTablets: 'ഗുളികകൾ ബാക്കിയുണ്ട്',
    daysRemaining: 'ദിവസങ്ങൾ ബാക്കിയുണ്ട്',
    nextReminder: 'അടുത്ത ഓർമ്മപ്പെടുത്തൽ',
    beforeFood: 'ഭക്ഷണത്തിന് മുമ്പ്',
    afterFood: 'ഭക്ഷണത്തിന് ശേഷം',
    active: 'സജീവം',
    completed: 'പൂർത്തിയായി',
    doseHistory: 'ഡോസ് ചരിത്രം',

    takeNow: 'ഇപ്പോൾ കഴിക്കുക',
    snooze: 'സ്നൂസ്',
    skip: 'ഒഴിവാക്കുക',
    voiceCommand: '🎤 ശബ്ദം',
    morning: 'രാവിലത്തെ ഡോസ്',
    afternoon: 'ഉച്ചക്ക് ശേഷം ഡോസ്',
    evening: 'വൈകുന്നേരവും രാത്രിയും ഡോസ്',

    language: 'ഇഷ്ടഭാഷ',
    voiceReminders: 'ശബ്ദ ഓർമ്മപ്പെടുത്തൽ',
    speechSpeed: 'സംസാര വേഗത',
    reminderRepeat: 'ഓർമ്മപ്പെടുത്തൽ ആവർത്തനം',
    elderMode: 'മൂത്തവർ മോഡ്',
    highContrast: 'ഉയർന്ന കോൺട്രാസ്റ്റ്',
    largeText: 'വലിയ ടെക്സ്റ്റ്',
    languageVoice: 'ഭാഷയും ശബ്ദവും',
    accessibility: 'ആക്സസിബിലിറ്റി',
    saveSettings: 'ക്രമീകരണങ്ങൾ സംരക്ഷിക്കുക',

    reminderGreeting: (timeOfDay) => `${timeOfDay} നമസ്കാരം.`,
    reminderMessage: (name, timing, food) =>
      `ഇപ്പോൾ നിങ്ങളുടെ ${name} കഴിക്കേണ്ട സമയമാണ്. ${food} ${timing} കഴിക്കുക.`,
    takenMsg: 'മരുന്ന് കഴിച്ചു. ആരോഗ്യമായിരിക്കുക!',
    snoozeMsg: 'ഓർമ്മപ്പെടുത്തൽ 10 മിനിറ്റ് നീട്ടി.',
    skipMsg: 'മരുന്ന് ഒഴിവാക്കി.',
  },
};

export default translations;

export function t(lang, key, ...args) {
  const langDict = translations[lang] || translations['en'];
  const val = langDict[key] ?? translations['en'][key];
  if (typeof val === 'function') return val(...args);
  return val ?? key;
}

export const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिंदी (Hindi)' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'te', label: 'తెలుగు (Telugu)' },
  { code: 'ml', label: 'മലയാളം (Malayalam)' },
];
