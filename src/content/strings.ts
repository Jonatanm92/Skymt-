import type { Lang } from '../core/settings';

// All player-facing text. Keys are stable ids used by content and UI.
const S = {
  'title.name': { en: 'SKYMT', sv: 'SKYMT' },
  'title.sub': { en: 'Det som dröjer', sv: 'Det som dröjer' },
  'menu.continue': { en: 'Continue', sv: 'Fortsätt' },
  'menu.begin': { en: 'Begin', sv: 'Börja' },
  'menu.new': { en: 'Begin anew', sv: 'Börja om' },
  'menu.settings': { en: 'Settings', sv: 'Inställningar' },
  'menu.resume': { en: 'Resume', sv: 'Fortsätt' },
  'menu.rest': { en: 'Return to last resting place', sv: 'Återvänd till senaste viloplats' },
  'menu.quit': { en: 'Leave to title', sv: 'Till titelskärmen' },
  'menu.back': { en: 'Back', sv: 'Tillbaka' },
  'menu.confirmNew': {
    en: 'Begin anew? This journey will be forgotten.',
    sv: 'Börja om? Den här vandringen glöms bort.',
  },
  'menu.yes': { en: 'Forget it', sv: 'Glöm den' },
  'menu.no': { en: 'Keep it', sv: 'Behåll den' },
  'menu.paused': { en: 'Still', sv: 'Stilla' },
  'set.master': { en: 'Volume', sv: 'Volym' },
  'set.music': { en: 'Music', sv: 'Musik' },
  'set.ambience': { en: 'Ambience', sv: 'Miljöljud' },
  'set.sfx': { en: 'Effects', sv: 'Effekter' },
  'set.subtitles': { en: 'Sound captions', sv: 'Ljudtexter' },
  'set.textSize': { en: 'Text size', sv: 'Textstorlek' },
  'set.lang': { en: 'Language', sv: 'Språk' },
  'set.brightness': { en: 'Brightness', sv: 'Ljusstyrka' },
  'set.motion': { en: 'Camera motion', sv: 'Kamerarörelse' },
  'set.quality': { en: 'Quality', sv: 'Kvalitet' },
  'set.fullscreen': { en: 'Fullscreen', sv: 'Helskärm' },
  'opt.on': { en: 'On', sv: 'På' },
  'opt.off': { en: 'Off', sv: 'Av' },
  'opt.small': { en: 'Small', sv: 'Liten' },
  'opt.medium': { en: 'Medium', sv: 'Mellan' },
  'opt.large': { en: 'Large', sv: 'Stor' },
  'opt.full': { en: 'Full', sv: 'Full' },
  'opt.reduced': { en: 'Reduced', sv: 'Minskad' },
  'opt.low': { en: 'Low', sv: 'Låg' },
  'opt.high': { en: 'High', sv: 'Hög' },
  'opt.lang': { en: 'English', sv: 'Svenska' },
  'menu.hintKeys': {
    en: 'A/D move · Space jump · F hum (hold) · E look · Esc pause',
    sv: 'A/D gå · Mellanslag hoppa · F nynna (håll) · E titta · Esc paus',
  },

  'chapter.num': { en: 'I', sv: 'I' },
  'chapter.name': { en: 'Djupet', sv: 'Djupet' },
  'chapter.gloss': { en: 'the depth', sv: '' },

  'inspect.hand': {
    en: 'A hand, pressed into the stone. Larger than all of me.',
    sv: 'En hand, tryckt in i stenen. Större än hela jag.',
  },
  'inspect.frame': { en: 'A frame around nothing.', sv: 'En ram kring ingenting.' },
  'inspect.chair': {
    en: 'Made for someone to sit in. To wait in.',
    sv: 'Gjord för någon att sitta i. Att vänta i.',
  },
  'inspect.gate': {
    en: 'Three veins run into it. It is listening.',
    sv: 'Tre ådror löper in i den. Den lyssnar.',
  },

  'cap.humming': { en: '[someone is humming]', sv: '[någon nynnar]' },
  'memory.1': { en: 'I know this.', sv: 'Den här kan jag.' },
  'memory.2': { en: "I don't know how I know it.", sv: 'Jag vet inte hur jag kan den.' },
  'memory.3': {
    en: 'Something is missing. It has a shape, but no name.',
    sv: 'Något saknas. Det har en form, men inget namn.',
  },
  'root.dark': { en: 'It turned toward the stone.', sv: 'Den vände sig mot stenen.' },
  'gate.wait': { en: 'It is waiting for more light.', sv: 'Den väntar på mer ljus.' },
  'cap.gate': { en: '[deep stone, moving]', sv: '[djup sten som rör sig]' },
  'cap.answer': { en: '[far above, someone answers]', sv: '[långt ovanför svarar någon]' },
  'end.1': { en: 'The rest of the song.', sv: 'Resten av sången.' },
  'end.2': { en: 'Someone is still up there.', sv: 'Någon dröjer sig kvar där uppe.' },
  'end.card': {
    en: 'Chapter I ends here. The ascent continues.',
    sv: 'Kapitel I slutar här. Uppstigningen fortsätter.',
  },
  'end.thanks': { en: 'Thank you for playing.', sv: 'Tack för att du spelade.' },

  'hint.move.k': { en: 'A  D', sv: 'A  D' },
  'hint.move.g': { en: '◂ ▸', sv: '◂ ▸' },
  'hint.jump.k': { en: 'Space', sv: 'Mellanslag' },
  'hint.jump.g': { en: 'Ⓐ', sv: 'Ⓐ' },
  'hint.climb.k': { en: 'Space · hold toward the edge', sv: 'Mellanslag · håll mot kanten' },
  'hint.climb.g': { en: 'Ⓐ · hold toward the edge', sv: 'Ⓐ · håll mot kanten' },
  'hint.hum.k': { en: 'hold F', sv: 'håll F' },
  'hint.hum.g': { en: 'hold RB', sv: 'håll RB' },
  'hint.sing.k': { en: 'hold F … longer', sv: 'håll F … längre' },
  'hint.sing.g': { en: 'hold RB … longer', sv: 'håll RB … längre' },
  'hint.interact.k': { en: 'E', sv: 'E' },
  'hint.interact.g': { en: 'Ⓧ', sv: 'Ⓧ' },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof S;

let lang: Lang = 'en';
export function setLang(l: Lang) {
  lang = l;
}
export function t(key: string): string {
  const e = (S as Record<string, Record<Lang, string>>)[key];
  return e ? e[lang] : key;
}
