const test = require('node:test');
const assert = require('node:assert');
const P = require('../plan.js');

const log = (state, entries, date) => {
  let d = P.draftFor(state);
  for (const e of entries) d = P.addExercise(d, state, e.name);
  d.entries.forEach((x, i) => { x.sets = entries[i].sets.map((s) => Object.assign({}, s)); });
  return P.finishSession(state, d, date);
};

test('days run in a fixed order and wrap around', () => {
  let s = P.defaultState();
  assert.deepStrictEqual(P.upcoming(s, 5), ['Legs A', 'Upper A', 'Legs B', 'Upper B', 'Legs A']);
  s = P.finishSession(s, P.draftFor(s));
  assert.strictEqual(P.currentDay(s), 'Upper A');
  assert.strictEqual(s.history.length, 0, 'an empty session is skipped, not saved');
});

test('logged sets are saved and empty rows dropped', () => {
  const s = log(P.defaultState(), [{ name: 'Hip thrust', sets: [{ kg: 100, reps: 10 }, { kg: 100, reps: 9 }, { kg: null, reps: null }] }], '2026-10-29');
  assert.deepStrictEqual(s.history[0], { date: '2026-10-29', day: 'Legs A', entries: [{ name: 'Hip thrust', sets: [{ kg: 100, reps: 10 }, { kg: 100, reps: 9 }] }] });
  assert.deepStrictEqual(P.exerciseNames(s), ['Hip thrust']);
  assert.strictEqual(P.lastFor(s, 'hip THRUST').sets.length, 2);
});

test('a day starts with the exercises from last time on that day', () => {
  let s = log(P.defaultState(), [{ name: 'Leg press', sets: [{ kg: 120, reps: 12 }] }, { name: 'Calf raise', sets: [{ kg: 60, reps: 15 }, { kg: 60, reps: 14 }] }]);
  for (let i = 0; i < 3; i++) s = P.finishSession(s, P.draftFor(s));
  assert.strictEqual(P.currentDay(s), 'Legs A');
  const d = P.draftFor(s);
  assert.deepStrictEqual(d.entries.map((e) => e.name), ['Leg press', 'Calf raise']);
  assert.strictEqual(d.entries[1].sets.length, 2);
  assert.ok(d.entries.every((e) => e.sets.every((x) => x.kg === null && x.reps === null)));
});

test('adding an existing name reuses its spelling and ignores duplicates', () => {
  const s = log(P.defaultState(), [{ name: 'Lat pulldown', sets: [{ kg: 50, reps: 10 }] }]);
  let d = P.addExercise(P.draftFor(s), s, '  lat   PULLDOWN ');
  d = P.addExercise(d, s, 'Lat pulldown');
  assert.deepStrictEqual(d.entries.map((e) => e.name), ['Lat pulldown']);
});

test('best set is the heaviest', () => {
  let s = log(P.defaultState(), [{ name: 'Bench', sets: [{ kg: 60, reps: 10 }] }], '2026-10-01');
  s = log(s, [{ name: 'Bench', sets: [{ kg: 65, reps: 6 }, { kg: 60, reps: 8 }] }], '2026-10-05');
  assert.deepStrictEqual(P.bestFor(s, 'Bench'), { kg: 65, reps: 6, date: '2026-10-05' });
});

test('v1 plan history carries over and yoga is dropped', () => {
  const v1 = {
    profile: { bodyMass: 80, height: 180 },
    sessionCount: 5,
    lifts: {},
    history: [
      { date: '2026-10-20', session: 'yoga_b', name: 'Yoga', outcomes: [] },
      { date: '2026-10-18', session: 'lower_b', name: 'Lower B', outcomes: [
        { name: 'Spanish squat isometric (45–60°)', results: [40, 40], weight: null },
        { name: 'Low-box step-up (knee ≤ 60°)', results: [], weight: 20 },
      ] },
      { date: '2026-10-15', session: 'lower_a', name: 'Lower A', outcomes: [{ name: 'Barbell hip thrust', results: [12, 11], weight: 90 }] },
    ],
  };
  const s = P.migrate(v1);
  assert.strictEqual(s.version, 2);
  assert.strictEqual(s.profile.bodyMass, 80);
  assert.strictEqual(s.history.length, 2);
  assert.deepStrictEqual(s.history[1].entries[0], { name: 'Barbell hip thrust', sets: [{ kg: 90, reps: 12 }, { kg: 90, reps: 11 }] });
  assert.deepStrictEqual(P.exerciseNames(s), ['Spanish squat isometric (45–60°)', 'Barbell hip thrust']);
  assert.strictEqual(P.currentDay(s), 'Legs A');
});

test('days can be renamed and reordered', () => {
  let s = P.defaultState();
  s = P.finishSession(s, P.draftFor(s));
  s = P.setDays(s, ['Push', 'Pull', ' ', 'Upper A', 'Legs']);
  assert.deepStrictEqual(s.days, ['Push', 'Pull', 'Upper A', 'Legs']);
  assert.strictEqual(P.currentDay(s), 'Upper A');
});

test('help links search YouTube for the exercise', () => {
  assert.strictEqual(P.helpUrl('Hip thrust'), 'https://www.youtube.com/results?search_query=Hip%20thrust%20form');
});

test('nutrition', () => {
  const n = P.nutrition({ bodyMass: 80, height: 180, age: 30, sex: 'male' });
  assert.strictEqual(n.bmi, 24.7);
  assert.strictEqual(n.proteinLow, 128);
  assert.ok(n.leanGain > n.maintenance);
});
