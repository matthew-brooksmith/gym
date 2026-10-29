/*
 * Tracker engine: workout days in a fixed order, exercises the user names,
 * and the weight × reps logged for each set. Pure functions with no DOM
 * access, so it runs in the browser (window.GymPlan) and under Node for tests.
 */
(function (root) {
  'use strict';

  const DEFAULT_DAYS = ['Legs A', 'Upper A', 'Legs B', 'Upper B'];
  const DEFAULT_SETS = 3;
  const HISTORY_CAP = 500;
  // Old plan ids → day names, for carrying v1 history over.
  const V1_DAYS = { lower_a: 'Legs A', upper_a: 'Upper A', lower_b: 'Legs B', upper_b: 'Upper B' };
  // v1 rotation had 6 slots (yoga at 2 and 5); map each to the next lifting day.
  const V1_SLOT_TO_DAY = [0, 1, 2, 2, 3, 0];

  function defaultState() {
    return { version: 2, profile: { bodyMass: 75, height: 178, age: null, sex: '' }, days: DEFAULT_DAYS.slice(), dayIndex: 0, history: [] };
  }

  const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
  const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const sameName = (a, b) => cleanName(a).toLowerCase() === cleanName(b).toLowerCase();

  // Accept anything stored (v2, a v1 plan, a backup file) and return a v2 state.
  function migrate(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    if (raw.version === 2) {
      const s = Object.assign(base, raw);
      s.profile = Object.assign(defaultState().profile, raw.profile);
      if (!Array.isArray(s.days) || !s.days.length) s.days = DEFAULT_DAYS.slice();
      s.dayIndex = ((Number(s.dayIndex) || 0) % s.days.length + s.days.length) % s.days.length;
      s.history = Array.isArray(s.history) ? s.history : [];
      return s;
    }
    const history = [];
    for (const h of raw.history || []) {
      const day = V1_DAYS[h.session];
      if (!day) continue;
      const entries = (h.outcomes || [])
        .filter((o) => o.results && o.results.length)
        .map((o) => ({ name: o.name, sets: o.results.map((r) => ({ kg: num(o.weight), reps: num(r) })) }));
      if (entries.length) history.push({ date: h.date, day, entries });
    }
    return Object.assign(base, {
      profile: Object.assign(base.profile, raw.profile),
      history,
      dayIndex: V1_SLOT_TO_DAY[(Number(raw.sessionCount) || 0) % 6],
    });
  }

  // Every exercise name ever logged, most recently used first.
  function exerciseNames(state) {
    const out = [];
    for (const h of state.history) for (const e of h.entries) if (!out.some((n) => sameName(n, e.name))) out.push(e.name);
    return out;
  }

  // The last logged attempt at an exercise: { date, day, sets }.
  function lastFor(state, name) {
    for (const h of state.history) {
      const e = h.entries.find((x) => sameName(x.name, name));
      if (e) return { date: h.date, day: h.day, sets: e.sets };
    }
    return null;
  }

  // Heaviest set and when it was done.
  function bestFor(state, name) {
    let best = null;
    for (const h of state.history) {
      const e = h.entries.find((x) => sameName(x.name, name));
      if (!e) continue;
      for (const s of e.sets) {
        if (s.kg != null && (!best || s.kg > best.kg || (s.kg === best.kg && (s.reps || 0) > (best.reps || 0)))) best = { kg: s.kg, reps: s.reps, date: h.date };
      }
    }
    return best;
  }

  const emptySets = (n) => Array.from({ length: n }, () => ({ kg: null, reps: null }));

  function entryFor(state, name) {
    const last = lastFor(state, name);
    return { name: cleanName(name), sets: emptySets(last ? last.sets.length : DEFAULT_SETS) };
  }

  // A new day starts with the exercises done last time on that day, in the same order.
  function templateFor(state, dayName) {
    const h = state.history.find((x) => x.day === dayName);
    return h ? h.entries.map((e) => entryFor(state, e.name)) : [];
  }

  function currentDay(state) {
    return state.days[state.dayIndex % state.days.length];
  }

  // The session being logged: the saved draft, or a fresh one from the template.
  function draftFor(state) {
    const day = currentDay(state);
    if (state.draft && state.draft.day === day && state.draft.dayIndex === state.dayIndex) return state.draft;
    return { day, dayIndex: state.dayIndex, entries: templateFor(state, day) };
  }

  function addExercise(draft, state, name) {
    const n = cleanName(name);
    if (!n || draft.entries.some((e) => sameName(e.name, n))) return draft;
    const known = exerciseNames(state).find((x) => sameName(x, n));
    return Object.assign({}, draft, { entries: draft.entries.concat(entryFor(state, known || n)) });
  }

  function upcoming(state, n) {
    return Array.from({ length: n }, (_, i) => state.days[(state.dayIndex + i) % state.days.length]);
  }

  // Save the session (sets with nothing typed are dropped) and move to the next day.
  function finishSession(state, draft, date) {
    const entries = draft.entries
      .map((e) => ({ name: cleanName(e.name), sets: e.sets.map((s) => ({ kg: num(s.kg), reps: num(s.reps) })).filter((s) => s.reps != null) }))
      .filter((e) => e.name && e.sets.length);
    const history = entries.length
      ? [{ date: date || new Date().toISOString().slice(0, 10), day: draft.day, entries }].concat(state.history).slice(0, HISTORY_CAP)
      : state.history;
    const next = Object.assign({}, state, { history, dayIndex: (state.dayIndex + 1) % state.days.length });
    delete next.draft;
    return next;
  }

  function setDays(state, names) {
    const days = names.map(cleanName).filter(Boolean);
    if (!days.length) return state;
    const cur = currentDay(state);
    const idx = days.indexOf(cur);
    const next = Object.assign({}, state, { days, dayIndex: idx >= 0 ? idx : 0 });
    delete next.draft;
    return next;
  }

  function helpUrl(name) {
    return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(cleanName(name) + ' form');
  }

  function nutrition(profile) {
    const { bodyMass, height, age, sex } = profile;
    if (!bodyMass || !height) return null;
    const m = height / 100;
    const out = {
      bmi: Math.round((bodyMass / (m * m)) * 10) / 10,
      proteinLow: Math.round(bodyMass * 1.6),
      proteinHigh: Math.round(bodyMass * 2.2),
      maintenance: null,
      leanGain: null,
    };
    if (age && (sex === 'male' || sex === 'female')) {
      // Mifflin-St Jeor BMR × 1.55 (training 3–5 days a week)
      const bmr = 10 * bodyMass + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);
      out.maintenance = Math.round((bmr * 1.55) / 10) * 10;
      out.leanGain = out.maintenance + 250;
    }
    return out;
  }

  const api = { DEFAULT_DAYS, defaultState, migrate, exerciseNames, lastFor, bestFor, templateFor, currentDay, draftFor, addExercise, upcoming, finishSession, setDays, helpUrl, nutrition };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GymPlan = api;
})(typeof window !== 'undefined' ? window : globalThis);
