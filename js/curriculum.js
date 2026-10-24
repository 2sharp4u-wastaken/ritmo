// The learning path. The coach walks through it in order; the child never picks.
// pattern: one cycle of sticking. '>' before a letter = accent. sub = notes per metronome beat.

export const BELTS = [
  { id: 'white',  name: 'חגורה לבנה',  color: '#F2F4F8', ink: '#5D6B8A' },
  { id: 'yellow', name: 'חגורה צהובה', color: '#FFD33D', ink: '#6B4E00' },
  { id: 'orange', name: 'חגורה כתומה', color: '#FF8A2A', ink: '#5A2600' },
  { id: 'green',  name: 'חגורה ירוקה', color: '#2DBE7E', ink: '#04391F' },
  { id: 'blue',   name: 'חגורה כחולה', color: '#3B6CF6', ink: '#FFFFFF' },
  { id: 'black',  name: 'חגורה שחורה', color: '#1A2747', ink: '#FFD33D' },
];

export const UNITS = [
  { id: 'u1', title: 'צעדים ראשונים', belt: 1 },
  { id: 'u2', title: 'התאומים',       belt: 2 },
  { id: 'u3', title: 'הפרדידל',       belt: 3 },
  { id: 'u4', title: 'המכה החזקה',    belt: 4 },
  { id: 'u5', title: 'מצב ארנב',      belt: 5 },
];

export const SKILLS = [
  { id: 'r4', unit: 'u1', title: 'ימין צועד', pattern: 'R', sub: 1, start: 60, target: 80,
    teach: ['בוא נתחיל מהבסיס: רק יד ימין.', 'מכה אחת על כל טיק של המטרונום. בדיוק ביחד איתו.', 'המקל קופץ למעלה אחרי כל מכה, כמו כדורסל.'],
    look: 'רק יד ימין. יד שמאל נחה.' },
  { id: 'l4', unit: 'u1', title: 'שמאל צועד', pattern: 'L', sub: 1, start: 60, target: 80,
    teach: ['עכשיו תור יד שמאל.', 'היא בדרך כלל קצת עצלנית, אז נלמד אותה להיות חזקה כמו ימין.', 'מכה על כל טיק.'],
    look: 'רק יד שמאל. יד ימין נחה.' },
  { id: 'rl', unit: 'u1', title: 'ימין-שמאל', pattern: 'RL', sub: 2, start: 60, target: 80,
    teach: ['עכשיו שתי הידיים, אחת אחרי השנייה: ימין, שמאל, ימין, שמאל.', 'שתי מכות על כל טיק.', 'שתי הידיים צריכות להישמע אותו דבר.'],
    look: 'ימין-שמאל-ימין-שמאל, כמו הליכה.' },

  { id: 'dbl1', unit: 'u2', title: 'תאומים לאט', pattern: 'RRLL', sub: 2, start: 50, target: 70,
    teach: ['הכירו את התאומים: שתי מכות באותה יד.', 'ימין-ימין, שמאל-שמאל.', 'המכה השנייה אוהבת להתחבא. אנחנו רוצים לשמוע אותה חזק כמו הראשונה.'],
    look: 'שתיים בימין, שתיים בשמאל.' },
  { id: 'dbl2', unit: 'u2', title: 'תאומים שווים', pattern: 'RRLL', sub: 2, start: 64, target: 84,
    teach: ['עכשיו אותם תאומים, קצת יותר מהר.', 'אני מקשיב במיוחד למכה השנייה. שתהיה חזקה!'],
    look: 'שתיים בימין, שתיים בשמאל. המכה השנייה חזקה.' },

  { id: 'half', unit: 'u3', title: 'חצי פרדידל', pattern: 'RLRR', sub: 2, start: 52, target: 72,
    teach: ['הגיע הזמן לפרדידל! מתחילים מחצי.', 'ימין, שמאל, ימין-ימין.', 'שתי מכות לחוד ואז תאומים.'],
    look: 'ימין-שמאל-ימין-ימין, ושוב מימין.' },
  { id: 'halfL', unit: 'u3', title: 'חצי פרדידל משמאל', pattern: 'LRLL', sub: 2, start: 52, target: 72,
    teach: ['עכשיו אותו דבר, אבל מתחילים בשמאל.', 'שמאל, ימין, שמאל-שמאל.'],
    look: 'שמאל-ימין-שמאל-שמאל.' },
  { id: 'para', unit: 'u3', title: 'הפרדידל המלא', pattern: 'RLRRLRLL', sub: 2, start: 48, target: 66,
    teach: ['עכשיו מחברים את שני החצאים. זה הפרדידל המלא!', 'פָּ-רָה-דִי-דֶל, פָּ-רָה-דִי-דֶל.', 'שים לב: אחרי התאומים, היד השנייה מתחילה.'],
    look: 'R L R R  L R L L — אומרים בקול פרדידל.' },
  { id: 'para2', unit: 'u3', title: 'פרדידל זורם', pattern: 'RLRRLRLL', sub: 2, start: 62, target: 84,
    teach: ['אותו פרדידל, קצת יותר מהר.', 'אם מתבלבלים, לא נורא. אני אוריד מהירות.'],
    look: 'R L R R  L R L L' },

  { id: 'acc1', unit: 'u4', title: 'אקצנט על אחת', pattern: '>RLRL', sub: 2, start: 60, target: 80,
    teach: ['עכשיו לומדים את המכה החזקה, קוראים לה אקצנט.', 'המכה הראשונה מכל ארבע חזקה, השאר רכות.', 'מרימים גבוה רק את המקל של המכה החזקה.'],
    look: 'המכה עם החץ חזקה, השאר נמוך ורך.' },
  { id: 'paraAcc', unit: 'u4', title: 'פרדידל עם אקצנט', pattern: '>RLRR>LRLL', sub: 2, start: 52, target: 72,
    teach: ['עכשיו האקצנט עובר לפרדידל.', 'המכה הראשונה בכל חצי חזקה.', 'זה כבר נשמע כמו מתופף אמיתי!'],
    look: 'R חזק, L R R רך. L חזק, R L L רך.' },

  { id: 'boss', unit: 'u5', title: 'מבחן האלוף', pattern: '>RLRR>LRLL', sub: 4, start: 46, target: 64,
    teach: ['זה השלב האחרון: פרדידל מהיר, ארבע מכות על כל טיק.', 'מתחילים לאט ומגבירים לאט.', 'מי שעובר את זה מקבל חגורה שחורה!'],
    look: 'פרדידל עם אקצנט, ארבע מכות על כל טיק.' },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map(s => [s.id, s]));

// Parse pattern into notes: [{hand:'R', acc:false}, ...]
export function parsePattern(p) {
  const out = []; let acc = false;
  for (const c of p) { if (c === '>') { acc = true; continue; } if (c === 'R' || c === 'L') { out.push({ hand: c, acc }); acc = false; } }
  return out;
}
export function unitOf(skill) { return UNITS.find(u => u.id === skill.unit); }
export function isLastInUnit(skill) { const list = SKILLS.filter(s => s.unit === skill.unit); return list[list.length - 1].id === skill.id; }
