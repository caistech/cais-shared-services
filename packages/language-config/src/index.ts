/**
 * @caistech/language-config — Shared language definitions for all CAIS projects.
 * 80+ languages with TTS provider mapping.
 * Extracted from Mova's lingoCore.ts. Used by: Mova, TourLingo, ConferenceLingo.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  ttsProvider: 'elevenlabs' | 'google';
}

// =============================================================================
// ELEVENLABS PREMIUM LANGUAGES (31)
// =============================================================================

export const ELEVENLABS_LANGUAGE_CODES: string[] = [
  'en', 'pl', 'de', 'es', 'fr', 'it', 'hi', 'pt', 'zh', 'ko',
  'nl', 'tr', 'sv', 'id', 'tl', 'ja', 'uk', 'el', 'cs', 'fi',
  'ro', 'da', 'bg', 'ms', 'sk', 'hr', 'ar', 'ta', 'vi', 'hu', 'no',
];

// =============================================================================
// ALL SUPPORTED LANGUAGES (80+)
// =============================================================================

export const SUPPORTED_LANGUAGES: Language[] = [
  // TIER 1: ELEVENLABS PREMIUM (31)
  { code: 'en', name: 'English', flag: '\u{1F1EC}\u{1F1E7}', nativeName: 'English', ttsProvider: 'elevenlabs' },
  { code: 'zh', name: 'Chinese (Simplified)', flag: '\u{1F1E8}\u{1F1F3}', nativeName: '\u7B80\u4F53\u4E2D\u6587', ttsProvider: 'elevenlabs' },
  { code: 'ja', name: 'Japanese', flag: '\u{1F1EF}\u{1F1F5}', nativeName: '\u65E5\u672C\u8A9E', ttsProvider: 'elevenlabs' },
  { code: 'ko', name: 'Korean', flag: '\u{1F1F0}\u{1F1F7}', nativeName: '\uD55C\uAD6D\uC5B4', ttsProvider: 'elevenlabs' },
  { code: 'vi', name: 'Vietnamese', flag: '\u{1F1FB}\u{1F1F3}', nativeName: 'Ti\u1EBFng Vi\u1EC7t', ttsProvider: 'elevenlabs' },
  { code: 'id', name: 'Indonesian', flag: '\u{1F1EE}\u{1F1E9}', nativeName: 'Bahasa Indonesia', ttsProvider: 'elevenlabs' },
  { code: 'ms', name: 'Malay', flag: '\u{1F1F2}\u{1F1FE}', nativeName: 'Bahasa Melayu', ttsProvider: 'elevenlabs' },
  { code: 'tl', name: 'Filipino', flag: '\u{1F1F5}\u{1F1ED}', nativeName: 'Tagalog', ttsProvider: 'elevenlabs' },
  { code: 'hi', name: 'Hindi', flag: '\u{1F1EE}\u{1F1F3}', nativeName: '\u0939\u093F\u0928\u094D\u0926\u0940', ttsProvider: 'elevenlabs' },
  { code: 'ta', name: 'Tamil', flag: '\u{1F1EE}\u{1F1F3}', nativeName: '\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD', ttsProvider: 'elevenlabs' },
  { code: 'de', name: 'German', flag: '\u{1F1E9}\u{1F1EA}', nativeName: 'Deutsch', ttsProvider: 'elevenlabs' },
  { code: 'fr', name: 'French', flag: '\u{1F1EB}\u{1F1F7}', nativeName: 'Fran\u00E7ais', ttsProvider: 'elevenlabs' },
  { code: 'es', name: 'Spanish', flag: '\u{1F1EA}\u{1F1F8}', nativeName: 'Espa\u00F1ol', ttsProvider: 'elevenlabs' },
  { code: 'it', name: 'Italian', flag: '\u{1F1EE}\u{1F1F9}', nativeName: 'Italiano', ttsProvider: 'elevenlabs' },
  { code: 'pt', name: 'Portuguese', flag: '\u{1F1F5}\u{1F1F9}', nativeName: 'Portugu\u00EAs', ttsProvider: 'elevenlabs' },
  { code: 'nl', name: 'Dutch', flag: '\u{1F1F3}\u{1F1F1}', nativeName: 'Nederlands', ttsProvider: 'elevenlabs' },
  { code: 'sv', name: 'Swedish', flag: '\u{1F1F8}\u{1F1EA}', nativeName: 'Svenska', ttsProvider: 'elevenlabs' },
  { code: 'da', name: 'Danish', flag: '\u{1F1E9}\u{1F1F0}', nativeName: 'Dansk', ttsProvider: 'elevenlabs' },
  { code: 'no', name: 'Norwegian', flag: '\u{1F1F3}\u{1F1F4}', nativeName: 'Norsk', ttsProvider: 'elevenlabs' },
  { code: 'fi', name: 'Finnish', flag: '\u{1F1EB}\u{1F1EE}', nativeName: 'Suomi', ttsProvider: 'elevenlabs' },
  { code: 'pl', name: 'Polish', flag: '\u{1F1F5}\u{1F1F1}', nativeName: 'Polski', ttsProvider: 'elevenlabs' },
  { code: 'uk', name: 'Ukrainian', flag: '\u{1F1FA}\u{1F1E6}', nativeName: '\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430', ttsProvider: 'elevenlabs' },
  { code: 'cs', name: 'Czech', flag: '\u{1F1E8}\u{1F1FF}', nativeName: '\u010Ce\u0161tina', ttsProvider: 'elevenlabs' },
  { code: 'sk', name: 'Slovak', flag: '\u{1F1F8}\u{1F1F0}', nativeName: 'Sloven\u010Dina', ttsProvider: 'elevenlabs' },
  { code: 'hu', name: 'Hungarian', flag: '\u{1F1ED}\u{1F1FA}', nativeName: 'Magyar', ttsProvider: 'elevenlabs' },
  { code: 'ro', name: 'Romanian', flag: '\u{1F1F7}\u{1F1F4}', nativeName: 'Rom\u00E2n\u0103', ttsProvider: 'elevenlabs' },
  { code: 'bg', name: 'Bulgarian', flag: '\u{1F1E7}\u{1F1EC}', nativeName: '\u0411\u044A\u043B\u0433\u0430\u0440\u0441\u043A\u0438', ttsProvider: 'elevenlabs' },
  { code: 'hr', name: 'Croatian', flag: '\u{1F1ED}\u{1F1F7}', nativeName: 'Hrvatski', ttsProvider: 'elevenlabs' },
  { code: 'el', name: 'Greek', flag: '\u{1F1EC}\u{1F1F7}', nativeName: '\u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC', ttsProvider: 'elevenlabs' },
  { code: 'tr', name: 'Turkish', flag: '\u{1F1F9}\u{1F1F7}', nativeName: 'T\u00FCrk\u00E7e', ttsProvider: 'elevenlabs' },
  { code: 'ar', name: 'Arabic', flag: '\u{1F1F8}\u{1F1E6}', nativeName: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629', ttsProvider: 'elevenlabs' },

  // TIER 2: GOOGLE CLOUD TTS (50+ additional)
  { code: 'zh-TW', name: 'Chinese (Traditional)', flag: '\u{1F1F9}\u{1F1FC}', nativeName: '\u7E41\u9AD4\u4E2D\u6587', ttsProvider: 'google' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', flag: '\u{1F1E7}\u{1F1F7}', nativeName: 'Portugu\u00EAs (Brasil)', ttsProvider: 'google' },
  { code: 'es-MX', name: 'Spanish (Mexico)', flag: '\u{1F1F2}\u{1F1FD}', nativeName: 'Espa\u00F1ol (M\u00E9xico)', ttsProvider: 'google' },
  { code: 'en-US', name: 'English (US)', flag: '\u{1F1FA}\u{1F1F8}', nativeName: 'English (US)', ttsProvider: 'google' },
  { code: 'en-AU', name: 'English (Australia)', flag: '\u{1F1E6}\u{1F1FA}', nativeName: 'English (AU)', ttsProvider: 'google' },
  { code: 'fr-CA', name: 'French (Canada)', flag: '\u{1F1E8}\u{1F1E6}', nativeName: 'Fran\u00E7ais (Canada)', ttsProvider: 'google' },
  { code: 'bn', name: 'Bengali', flag: '\u{1F1E7}\u{1F1E9}', nativeName: '\u09AC\u09BE\u0982\u09B2\u09BE', ttsProvider: 'google' },
  { code: 'te', name: 'Telugu', flag: '\u{1F1EE}\u{1F1F3}', nativeName: '\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41', ttsProvider: 'google' },
  { code: 'mr', name: 'Marathi', flag: '\u{1F1EE}\u{1F1F3}', nativeName: '\u092E\u0930\u093E\u0920\u0940', ttsProvider: 'google' },
  { code: 'gu', name: 'Gujarati', flag: '\u{1F1EE}\u{1F1F3}', nativeName: '\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0', ttsProvider: 'google' },
  { code: 'kn', name: 'Kannada', flag: '\u{1F1EE}\u{1F1F3}', nativeName: '\u0C95\u0CA8\u0CCD\u0CA8\u0CA1', ttsProvider: 'google' },
  { code: 'ml', name: 'Malayalam', flag: '\u{1F1EE}\u{1F1F3}', nativeName: '\u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02', ttsProvider: 'google' },
  { code: 'pa', name: 'Punjabi', flag: '\u{1F1EE}\u{1F1F3}', nativeName: '\u0A2A\u0A70\u0A1C\u0A3E\u0A2C\u0A40', ttsProvider: 'google' },
  { code: 'ur', name: 'Urdu', flag: '\u{1F1F5}\u{1F1F0}', nativeName: '\u0627\u0631\u062F\u0648', ttsProvider: 'google' },
  { code: 'ne', name: 'Nepali', flag: '\u{1F1F3}\u{1F1F5}', nativeName: '\u0928\u0947\u092A\u093E\u0932\u0940', ttsProvider: 'google' },
  { code: 'si', name: 'Sinhala', flag: '\u{1F1F1}\u{1F1F0}', nativeName: '\u0DC3\u0DD2\u0D82\u0DC4\u0DBD', ttsProvider: 'google' },
  { code: 'th', name: 'Thai', flag: '\u{1F1F9}\u{1F1ED}', nativeName: '\u0E44\u0E17\u0E22', ttsProvider: 'google' },
  { code: 'my', name: 'Burmese', flag: '\u{1F1F2}\u{1F1F2}', nativeName: '\u1019\u103C\u1014\u103A\u1019\u102C\u1018\u102C\u101E\u102C', ttsProvider: 'google' },
  { code: 'km', name: 'Khmer', flag: '\u{1F1F0}\u{1F1ED}', nativeName: '\u1781\u17D2\u1798\u17C2\u179A', ttsProvider: 'google' },
  { code: 'lo', name: 'Lao', flag: '\u{1F1F1}\u{1F1E6}', nativeName: '\u0EA5\u0EB2\u0EA7', ttsProvider: 'google' },
  { code: 'ru', name: 'Russian', flag: '\u{1F1F7}\u{1F1FA}', nativeName: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439', ttsProvider: 'google' },
  { code: 'sr', name: 'Serbian', flag: '\u{1F1F7}\u{1F1F8}', nativeName: '\u0421\u0440\u043F\u0441\u043A\u0438', ttsProvider: 'google' },
  { code: 'sl', name: 'Slovenian', flag: '\u{1F1F8}\u{1F1EE}', nativeName: 'Sloven\u0161\u010Dina', ttsProvider: 'google' },
  { code: 'lt', name: 'Lithuanian', flag: '\u{1F1F1}\u{1F1F9}', nativeName: 'Lietuvi\u0173', ttsProvider: 'google' },
  { code: 'lv', name: 'Latvian', flag: '\u{1F1F1}\u{1F1FB}', nativeName: 'Latvie\u0161u', ttsProvider: 'google' },
  { code: 'et', name: 'Estonian', flag: '\u{1F1EA}\u{1F1EA}', nativeName: 'Eesti', ttsProvider: 'google' },
  { code: 'he', name: 'Hebrew', flag: '\u{1F1EE}\u{1F1F1}', nativeName: '\u05E2\u05D1\u05E8\u05D9\u05EA', ttsProvider: 'google' },
  { code: 'fa', name: 'Persian', flag: '\u{1F1EE}\u{1F1F7}', nativeName: '\u0641\u0627\u0631\u0633\u06CC', ttsProvider: 'google' },
  { code: 'sw', name: 'Swahili', flag: '\u{1F1F0}\u{1F1EA}', nativeName: 'Kiswahili', ttsProvider: 'google' },
  { code: 'af', name: 'Afrikaans', flag: '\u{1F1FF}\u{1F1E6}', nativeName: 'Afrikaans', ttsProvider: 'google' },
  { code: 'ka', name: 'Georgian', flag: '\u{1F1EC}\u{1F1EA}', nativeName: '\u10E5\u10D0\u10E0\u10D7\u10E3\u10DA\u10D8', ttsProvider: 'google' },
];

// =============================================================================
// HELPERS
// =============================================================================

export function isElevenLabsLanguage(code: string): boolean {
  return ELEVENLABS_LANGUAGE_CODES.includes(code.split('-')[0]);
}

export function getLanguageByCode(code: string): Language | undefined {
  return SUPPORTED_LANGUAGES.find(l => l.code === code);
}

export function getTTSProvider(code: string): 'elevenlabs' | 'google' {
  return isElevenLabsLanguage(code) ? 'elevenlabs' : 'google';
}

export const POPULAR_LANGUAGES = SUPPORTED_LANGUAGES.filter(l =>
  ['en', 'zh', 'ja', 'ko', 'ms', 'ar', 'fr', 'es', 'de', 'hi', 'th', 'vi', 'id'].includes(l.code)
);
