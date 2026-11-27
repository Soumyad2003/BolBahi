/**
 * Converts BolBahi Hinglish talkback phrases into natural Devanagari Hindi/Hinglish
 * so both Hindi TTS voices (hi-IN) and Gemini TTS read every kirana bill aloud clearly.
 */

const PHRASE_MAP: Array<[RegExp, string]> = [
  [/\bWalk-in Cash Customer\b/gi, 'वॉक-इन कैश कस्टमर'],
  [/\bAashirvaad Atta\b/gi, 'आशीर्वाद आटा'],
  [/\bFortune Refined Oil\b/gi, 'फॉर्च्यून रिफाइंड तेल'],
  [/\bIndia Gate Basmati Rice\b/gi, 'इंडिया गेट बासमती चावल'],
  [/\bTata Salt\b/gi, 'टाटा नमक'],
  [/\bToor Dal\b/gi, 'तूर दाल'],
  [/\bAmul Taaza Milk\b/gi, 'अमूल ताज़ा दूध'],
  [/\bMadhur Sugar\b/gi, 'मधुर चीनी'],
  [/\bRed Label Tea\b/gi, 'रेड लेबल चाय'],
  [/\bMaggi Noodles\b/gi, 'मैगी नूडल्स'],
  [/\bParle-G Biscuit\b/gi, 'पार्ले जी बिस्किट'],
  [/\bSurf Excel Small\b/gi, 'सर्फ एक्सेल छोटा'],
  [/\bColgate Toothpaste\b/gi, 'कोलगेट टूथपेस्ट'],
  [/\bOnion\b/gi, 'प्याज़'],
  [/\bPotato\b/gi, 'आलू'],
  [/\bEggs\b/gi, 'अंडे'],
  [/\bRajesh Sharma\b/gi, 'राजेश शर्मा'],
  [/\bVikram Sharma\b/gi, 'विक्रम शर्मा'],
  [/\bSunita Verma\b/gi, 'सुनीता वर्मा'],
  [/\bRaju Yadav\b/gi, 'राजू यादव'],
  [/\bMeena Nair\b/gi, 'मीना नायर'],
  [/\bSharma ji\b/gi, 'शर्मा जी'],
  [/\bWhatsApp receipt\b/gi, 'व्हाट्सऐप रसीद'],
  [/\bWhatsApp order\b/gi, 'व्हाट्सऐप ऑर्डर'],
  [/\bWhatsApp\b/gi, 'व्हाट्सऐप'],
  [/\bConfirm karein\??/gi, 'कन्फर्म करें?'],
  [/\bBill save ho gaya\b/gi, 'बिल सेव हो गया'],
  [/\bBill update ho gaya\b/gi, 'बिल अपडेट हो गया'],
  [/\bNaya total\b/gi, 'नया कुल'],
  [/\bAaj ka galla\b/gi, 'आज का गल्ला'],
  [/\btotal bikri\b/gi, 'कुल बिक्री'],
  [/\bKul udhaar\b/gi, 'कुल उधार'],
  [/\bKhata khol diya hai\b/gi, 'खाता खोल दिया है'],
  [/\bPichla bill undo ho gaya\b/gi, 'पिछला बिल अनडू हो गया'],
  [/\bDraft cancel kar diya\b/gi, 'ड्राफ्ट कैंसिल कर दिया'],
  [/\bDemo data reset ho gaya\b/gi, 'डेमो डेटा रीसेट हो गया'],
  [/\bAwaaz clear nahi aayi\b/gi, 'आवाज़ साफ़ नहीं आई'],
  [/\bphir se boliye\b/gi, 'फिर से बोलिए'],
  [/\bready hai\b/gi, 'तैयार है'],
  [/\bSab items ka stock full hai\b/gi, 'सभी आइटम का स्टॉक पूरा है'],
  [/\bKuch mangwane ki zaroorat nahi\b/gi, 'कुछ मंगवाने की ज़रूरत नहीं'],
  [/\bitems kam hain\b/gi, 'आइटम कम हैं'],
  [/\bRate kitna lagana hai\??/gi, 'रेट कितना लगाना है?'],
  [/\bka rate missing hai\b/gi, 'का रेट नहीं है'],
  [/\bka rate daalein pehle\b/gi, 'का रेट पहले डालें'],
  [/\bPehle customer select karein\b/gi, 'पहले कस्टमर चुनें'],
  [/\bcustomer list mein save ho gaye\b/gi, 'कस्टमर लिस्ट में सेव हो गए'],
  [/\bstock add ho gaya\b/gi, 'स्टॉक जुड़ गया'],
  [/\bjama ho gaya\b/gi, 'जमा हो गया'],
  [/\brupaye wapas dene hain\b/gi, 'रुपये वापस देने हैं'],
  [/\budhaar baaki hai\b/gi, 'उधार बाकी है'],
  [/\bkoi udhaar baaki nahi hai\b/gi, 'कोई उधार बाकी नहीं है'],
  [/\bbaaki hai\b/gi, 'बाकी है'],
  [/\bDo\b/g, 'दो'],
  [/\bhain\b/gi, 'हैं'],
  [/\bhai\b/gi, 'है'],
  [/\bya\b/gi, 'या'],
  [/\baur\b/gi, 'और'],
  [/\bka\b/gi, 'का'],
  [/\bke\b/gi, 'के'],
  [/\bki\b/gi, 'की'],
  [/\bmein\b/gi, 'में'],
  [/\brupaye\b/gi, 'रुपये'],
  [/\budhaar\b/gi, 'उधार'],
  [/\bcash\b/gi, 'कैश'],
  [/\bUPI\b/gi, 'यूपीआई'],
  [/\btotal\b/gi, 'कुल'],
  [/\bbills\b/gi, 'बिल'],
  [/\bbill\b/gi, 'बिल'],
  [/\bitems\b/gi, 'आइटम'],
  [/\bitem\b/gi, 'आइटम'],
  [/\bkg\b/gi, 'किलो'],
  [/\bpkt\b/gi, 'पैकेट'],
  [/\bpc\b/gi, 'पीस'],
  [/\bL\b/g, 'लीटर'],
];

/**
 * Converts Hinglish BolBahi reply text into Devanagari Hindi/Hinglish for Hindi speech synthesis.
 * Preserves numbers and Devanagari text already present.
 */
export function toDevanagariHindiSpeech(text: string): string {
  if (!text.trim()) return '';
  let out = text.replace(/₹\s*/g, '');
  for (const [pattern, replacement] of PHRASE_MAP) {
    out = out.replace(pattern, replacement);
  }
  // Clean punctuation for smoother Hindi cadence
  out = out.replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim();
  return out;
}

/**
 * Prepares Roman Hinglish text for Indian English (en-IN) speech synthesis.
 */
export function toHinglishSpeech(text: string): string {
  if (!text.trim()) return '';
  return text
    .replace(/₹\s*(\d+(?:\.\d+)?)/g, '$1 rupees')
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}
