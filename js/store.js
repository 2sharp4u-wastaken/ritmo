// Local persistence: profiles, progress, calibration, history.
import { SKILLS, UNITS } from './curriculum.js';

const KEY = 'ritmo-coach-v1';
let db = null;

function blankProfile(name, avatar) {
  return {
    id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name, avatar, createdAt: Date.now(),
    settings: { surface: 'pad', headphones: false, sessionMin: 10, voice: true, voiceRate: 1, volume: 0.9 },
    calib: {},
    skillIdx: 0, skills: {},
    xp: 0, streak: 0, lastSessionDay: '', days: {},
    sessions: [], rounds: [], weakTally: {},
    onboarded: false,
  };
}

export function load() {
  try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { db = null; }
  if (!db || !db.profiles) db = { version: 1, active: null, profiles: {} };
  return db;
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
export function all() { return Object.values(db.profiles).sort((a, b) => a.createdAt - b.createdAt); }
export function active() { return db.active ? db.profiles[db.active] : null; }
export function setActive(id) { db.active = id; save(); }
export function create(name, avatar) { const p = blankProfile(name, avatar); db.profiles[p.id] = p; db.active = p.id; save(); return p; }
export function remove(id) { delete db.profiles[id]; if (db.active === id) db.active = null; save(); }
export function resetProgress(p) {
  const keep = { id: p.id, name: p.name, avatar: p.avatar, createdAt: p.createdAt, settings: p.settings, calib: p.calib, onboarded: true };
  Object.assign(p, blankProfile(p.name, p.avatar), keep); save();
}
export function exportAll() { return JSON.stringify(db, null, 1); }
export function importAll(text) {
  const d = JSON.parse(text);
  if (!d || !d.profiles) throw new Error('bad');
  db = d; save();
}

export function skillState(p, id) {
  if (!p.skills[id]) p.skills[id] = { bpm: null, best: 0, rounds: 0, lastTs: 0, mastered: false, masteredTs: 0, tests: [], recent: [], strength: 0 };
  return p.skills[id];
}
export function currentSkill(p) { return SKILLS[Math.min(p.skillIdx, SKILLS.length - 1)]; }
export function allDone(p) { return p.skillIdx >= SKILLS.length; }
export function beltIndex(p) {
  let b = 0;
  UNITS.forEach(u => { const list = SKILLS.filter(s => s.unit === u.id); if (list.every(s => skillState(p, s.id).mastered)) b = Math.max(b, u.belt); });
  return b;
}
export function dayKey(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function yesterdayKey() { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); }
export function calib(p) { return p.calib[p.settings.surface] || null; }
export function addRound(p, r) { p.rounds.push(r); if (p.rounds.length > 400) p.rounds.splice(0, p.rounds.length - 400); }
export function tallyWeak(p, list) {
  Object.keys(p.weakTally).forEach(k => p.weakTally[k] *= 0.85);
  list.forEach(k => p.weakTally[k] = (p.weakTally[k] || 0) + 1);
}
export function finishSession(p, s) {
  const today = dayKey();
  if (p.lastSessionDay !== today) {
    p.streak = p.lastSessionDay === yesterdayKey() ? p.streak + 1 : 1;
    p.lastSessionDay = today;
  }
  p.sessions.push(s); if (p.sessions.length > 200) p.sessions.shift();
  save();
}
export function addPracticeTime(p, sec) { const k = dayKey(); p.days[k] = (p.days[k] || 0) + sec; }
export function streakAlive(p) { return p.lastSessionDay === dayKey() || p.lastSessionDay === yesterdayKey() ? p.streak : 0; }
