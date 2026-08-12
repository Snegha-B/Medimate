/**
 * Voice Service — MediMate Phase 3
 * Uses browser's built-in Web Speech API (speechSynthesis & SpeechRecognition)
 * No external dependencies required.
 */

// Language code → BCP-47 locale map for speechSynthesis
const LANG_LOCALE_MAP = {
  en: 'en-IN',
  hi: 'hi-IN',
  kn: 'kn-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  ml: 'ml-IN',
};

/**
 * Speak text using browser speechSynthesis.
 * @param {string} text - Text to speak
 * @param {string} lang - Language code (en/hi/kn/ta/te/ml)
 * @param {number} speed - Speech rate (0.5 – 2.0)
 */
export function speak(text, lang = 'en', speed = 1.0) {
  if (!window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel(); // Cancel any ongoing speech
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_LOCALE_MAP[lang] || 'en-IN';
    utterance.rate = speed;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onerror = (err) => {
      console.warn('[VoiceService] SpeechSynthesis utterance error:', err);
    };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[VoiceService] speak failed:', err);
  }
}

/**
 * Stop any ongoing speech.
 */
export function stopSpeaking() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Build a detailed medicine spoken summary and speak it.
 * @param {object} med - Medication object
 * @param {string} lang - Language code
 * @param {number} speed - Speech rate
 */
export function readMedicine(med, lang = 'en', speed = 1.0) {
  const foodInstruction = med.timing_instruction === 'before_food'
    ? (lang === 'en' ? 'before food' : 'खाने से पहले')
    : (lang === 'en' ? 'after food' : 'खाने के बाद');

  const slots = [];
  if (med.morning) slots.push(lang === 'en' ? 'morning' : 'सुबह');
  if (med.afternoon) slots.push(lang === 'en' ? 'afternoon' : 'दोपहर');
  if (med.evening) slots.push(lang === 'en' ? 'evening' : 'शाम');
  if (med.night) slots.push(lang === 'en' ? 'night' : 'रात');

  const slotText = slots.join(', ');

  const textByLang = {
    en: `${med.name}. Dosage: ${med.dosage}. Take ${slotText}. ${foodInstruction}. ${med.days_remaining ?? med.duration_days} days remaining. ${med.remaining_tablets} tablets left.`,
    hi: `${med.name}। खुराक: ${med.dosage}। ${slotText} में लें। ${foodInstruction}। ${med.days_remaining ?? med.duration_days} दिन बचे हैं। ${med.remaining_tablets} गोलियाँ बची हैं।`,
    kn: `${med.name}. ಡೋಸ್: ${med.dosage}. ${slotText} ತೆಗೆದುಕೊಳ್ಳಿ. ${foodInstruction}. ${med.days_remaining ?? med.duration_days} ದಿನಗಳು ಉಳಿದಿವೆ. ${med.remaining_tablets} ಮಾತ್ರೆಗಳು ಉಳಿದಿವೆ.`,
    ta: `${med.name}. அளவு: ${med.dosage}. ${slotText} எடுக்கவும். ${foodInstruction}. ${med.days_remaining ?? med.duration_days} நாட்கள் மீதம். ${med.remaining_tablets} மாத்திரைகள் உள்ளன.`,
    te: `${med.name}. మోతాదు: ${med.dosage}. ${slotText} తీసుకోండి. ${foodInstruction}. ${med.days_remaining ?? med.duration_days} రోజులు మిగిలాయి. ${med.remaining_tablets} మాత్రలు మిగిలాయి.`,
    ml: `${med.name}. ഡോസ്: ${med.dosage}. ${slotText} കഴിക്കുക. ${foodInstruction}. ${med.days_remaining ?? med.duration_days} ദിവസങ്ങൾ ബാക്കിയുണ്ട്. ${med.remaining_tablets} ഗുളികകൾ ബാക്കിയുണ്ട്.`,
  };

  const text = textByLang[lang] || textByLang['en'];
  speak(text, lang, speed);
}

/**
 * Build a time-of-day voice reminder message and speak it.
 * Greeting is based on the SCHEDULED time, not the current clock.
 * @param {object} schedule - Schedule item with medication info
 * @param {string} lang - Language code
 * @param {number} speed - Speech rate
 */
export function speakReminder(schedule, lang = 'en', speed = 1.0) {
  // Derive greeting from the scheduled_time field (HH:MM:SS or HH:MM string)
  let hour = new Date().getHours(); // fallback
  if (schedule.scheduled_time) {
    const parts = String(schedule.scheduled_time).split(':');
    if (parts.length >= 2) hour = parseInt(parts[0], 10);
  }

  let greeting = 'Morning';
  if (hour >= 5 && hour < 12) greeting = 'Morning';
  else if (hour >= 12 && hour < 17) greeting = 'Afternoon';
  else if (hour >= 17 && hour < 21) greeting = 'Evening';
  else greeting = 'Night';

  const name = schedule.medication_name || 'medicine';
  const dosage = schedule.dosage || '1 tablet';
  const food = schedule.timing_instruction === 'before_food'
    ? (lang === 'en' ? 'before breakfast' : 'खाने से पहले')
    : (lang === 'en' ? 'after breakfast' : 'खाने के बाद');

  // Format display time (e.g. "8:30 AM")
  let displayTime = '';
  if (schedule.scheduled_time) {
    const parts = String(schedule.scheduled_time).split(':');
    if (parts.length >= 2) {
      let h = parseInt(parts[0], 10);
      const m = parts[1].padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      if (h > 12) h -= 12;
      if (h === 0) h = 12;
      displayTime = `${h}:${m} ${ampm}`;
    }
  }

  const textByLang = {
    en: `Good ${greeting}. ${displayTime ? `It is now ${displayTime}. ` : ''}This is your medicine reminder. Please take ${name} ${dosage} ${food}. Once you've taken it, tap Take Now. If you want to postpone it, tap Snooze.`,
    hi: `${greeting === 'Morning' ? 'सुप्रभात' : greeting === 'Afternoon' ? 'नमस्कार' : greeting === 'Evening' ? 'शुभ संध्या' : 'शुभ रात्रि'}। ${displayTime ? `अभी ${displayTime} बज रहे हैं। ` : ''}यह आपकी दवाई की याद है। कृपया ${name} ${dosage} ${food} लें। लेने के बाद Take Now दबाएं। बाद में लेना हो तो Snooze दबाएं।`,
    kn: `${greeting === 'Morning' ? 'ಶುಭೋದಯ' : greeting === 'Afternoon' ? 'ನಮಸ್ಕಾರ' : 'ಶುಭ ಸಂಜೆ'}. ಈಗ ನಿಮ್ಮ ${name} ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯ. ${food} ${dosage} ತೆಗೆದುಕೊಳ್ಳಿ.`,
    ta: `${greeting === 'Morning' ? 'காலை வணக்கம்' : greeting === 'Afternoon' ? 'மதிய வணக்கம்' : 'மாலை வணக்கம்'}. இப்போது உங்கள் ${name} எடுக்கும் நேரம். ${food} ${dosage} எடுக்கவும்.`,
    te: `${greeting === 'Morning' ? 'శుభోదయం' : greeting === 'Afternoon' ? 'నమస్కారం' : 'శుభ సాయంత్రం'}. ఇప్పుడు మీ ${name} తీసుకునే సమయం. ${food} ${dosage} తీసుకోండి.`,
    ml: `${greeting === 'Morning' ? 'സുപ്രഭാതം' : greeting === 'Afternoon' ? 'നമസ്കാരം' : 'ശുഭ സന്ധ്യ'}. ഇപ്പോൾ നിങ്ങളുടെ ${name} കഴിക്കേണ്ട സമയമാണ്. ${food} ${dosage} കഴിക്കുക.`,
  };

  const text = textByLang[lang] || textByLang['en'];
  speak(text, lang, speed);
}

// Voice Command action constants
export const VOICE_ACTIONS = {
  TAKE: 'TAKE',
  SKIP: 'SKIP',
  SNOOZE: 'SNOOZE',
  READ: 'READ',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Parse voice command text into an action constant.
 * @param {string} text - Recognized speech text
 * @returns {string} - One of VOICE_ACTIONS
 */
export function parseVoiceCommand(text) {
  const lower = (text || '').toLowerCase();

  const takeKeywords = ['taken', 'take', 'took', 'have taken', 'completed', 'done', 'लिया', 'ಔಷಧ ತೆಗೆದುಕೊಂಡೆ', 'எடுத்தேன்', 'తీసుకున్నాను', 'കഴിച്ചു'];
  const skipKeywords = ['skip', 'skipping', 'छोड़', 'ಬಿಡಿ', 'தவிர்', 'దాటవేయండి', 'ഒഴിവാക്കുക'];
  const snoozeKeywords = ['snooze', 'later', 'remind', 'remind me later', 'स्नूज़', 'ಸ್ನೂಜ್', 'ஒத்திடு', 'స్నూజ్', 'സ്നൂസ്'];
  const readKeywords = ['read', 'tell me', 'what medicines', 'medicines today', 'पढ़', 'ಓದಿ', 'படிக்க', 'చదవండి', 'വായിക്കുക'];

  if (takeKeywords.some(k => lower.includes(k))) return VOICE_ACTIONS.TAKE;
  if (skipKeywords.some(k => lower.includes(k))) return VOICE_ACTIONS.SKIP;
  if (snoozeKeywords.some(k => lower.includes(k))) return VOICE_ACTIONS.SNOOZE;
  if (readKeywords.some(k => lower.includes(k))) return VOICE_ACTIONS.READ;

  return VOICE_ACTIONS.UNKNOWN;
}

/**
 * Start voice recognition and call onResult with recognized text.
 * @param {function} onResult - Callback with (text, action)
 * @param {string} lang - Language code for recognition
 */
export function startListening(onResult, lang = 'en') {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Speech Recognition not supported in this browser.');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = LANG_LOCALE_MAP[lang] || 'en-IN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    const action = parseVoiceCommand(text);
    onResult(text, action);
  };

  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    onResult('', VOICE_ACTIONS.UNKNOWN);
  };

  recognition.start();
  return recognition;
}
