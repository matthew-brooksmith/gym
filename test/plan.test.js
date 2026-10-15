const test = require('node:test');
const assert = require('node:assert');
const P = require('../plan.js');

const fresh = () => P.syncLifts(P.defaultState());

test('estimates fill every lift and follow body mass', () => {
  let s = fresh();
  assert.strictEqual(s.lifts.hip_thrust.weight, 75);
  s.profile.bodyMass = 90;
  s = P.syncLifts(s);
  assert.strictEqual(s.lifts.hip_thrust.weight, 90);
});

test('user-entered weights survive a body mass change', () => {
  let s = P.setWeight(fresh(), 'bench', 82.5);
  s.profile.bodyMass = 60;
  s = P.syncLifts(s);
  assert.strictEqual(s.lifts.bench.weight, 82.5);
});

test('hitting the top of the range on every set adds load', () => {
  const s = P.setWeight(fresh(), 'hip_thrust', 100);
  const out = P.progress('hip_thrust', s.lifts.hip_thrust, [12, 12, 12, 12]);
  assert.strictEqual(out.change, 'up');
  assert.strictEqual(out.lift.weight, 105);
});

test('in range holds weight', () => {
  const s = P.setWeight(fresh(), 'hip_thrust', 100);
  const out = P.progress('hip_thrust', s.lifts.hip_thrust, [12, 11, 10, 9]);
  assert.strictEqual(out.change, 'hold');
  assert.strictEqual(out.lift.weight, 100);
});

test('two misses in a row drop 10%', () => {
  const s = P.setWeight(fresh(), 'bench', 80);
  const a = P.progress('bench', s.lifts.bench, [5, 5, 4, 4]);
  assert.strictEqual(a.lift.weight, 80);
  const b = P.progress('bench', a.lift, [5, 5, 4, 4]);
  assert.strictEqual(b.change, 'down');
  assert.strictEqual(b.lift.weight, 72.5);
});

test('unloaded holds progress by seconds', () => {
  const s = fresh();
  const out = P.progress('spanish_squat', s.lifts.spanish_squat, [45, 45, 45, 45]);
  assert.strictEqual(out.lift.bonus, 5);
  const t = P.nextSession(Object.assign({}, s, { sessionCount: 3, lifts: Object.assign({}, s.lifts, { spanish_squat: out.lift }) }));
  const sq = t.exercises.find((e) => e.id === 'spanish_squat');
  assert.strictEqual(sq.min, 35);
  assert.strictEqual(sq.max, 50);
});

test('rotation alternates lower and upper and advances', () => {
  let s = fresh();
  const ids = [];
  for (let i = 0; i < 7; i++) { ids.push(P.nextSession(s).id); s = P.completeSession(s, {}).state; }
  assert.deepStrictEqual(ids, ['lower_a', 'upper_a', 'yoga', 'lower_b', 'upper_b', 'yoga', 'lower_a']);
});

test('deload weeks halve sets and do not progress', () => {
  let s = P.setWeight(fresh(), 'hip_thrust', 100);
  s.sessionCount = 30;
  const sess = P.nextSession(s);
  assert.ok(sess.deload);
  assert.strictEqual(sess.exercises[0].sets, 2);
  const r = P.completeSession(s, { hip_thrust: [12, 12] });
  assert.strictEqual(r.state.lifts.hip_thrust.weight, 100);
  assert.ok(!P.isDeload(36));
});

test('legs get more weekly sets than any upper group', () => {
  const v = P.weeklyVolume();
  const legs = v.quads + v.glutes + v.hamstrings + v.calves + v.adductors;
  assert.ok(legs > v.chest + v.back);
});

test('no deep knee-flexion movements in the library', () => {
  const names = Object.values(P.EXERCISES).map((e) => e.name.toLowerCase()).join(' ');
  for (const bad of ['back squat', 'front squat', 'lunge', 'pistol', 'jump', 'sissy', 'hack squat']) assert.ok(!names.includes(bad), bad);
});

test('nutrition', () => {
  const n = P.nutrition({ bodyMass: 80, height: 180, age: 30, sex: 'male' });
  assert.strictEqual(n.bmi, 24.7);
  assert.strictEqual(n.proteinLow, 128);
  assert.ok(n.leanGain > n.maintenance);
});

test('weight actually used overrides the suggestion and is remembered as the last attempt', () => {
  const s = P.setWeight(fresh(), 'bench', 80);
  const r = P.completeSession(Object.assign({}, s, { sessionCount: 1 }), { bench: { weight: 85, reps: [10, 10, 10, 10] } }, '2026-10-15');
  const lift = r.state.lifts.bench;
  assert.strictEqual(lift.weight, 87.5);
  assert.deepStrictEqual(lift.last, { date: '2026-10-15', weight: 85, results: [10, 10, 10, 10], unit: 'reps', change: 'up', message: '+2.5 kg → 87.5 kg' });
});

test('targets carry rest and effort guidance', () => {
  const t = P.nextSession(fresh()).exercises;
  assert.strictEqual(t[0].rest, '2–3 min');
  assert.match(t.find((e) => e.id === 'leg_press_shallow').effort, /never grind/);
});

test('a logged estimate is kept when body mass changes', () => {
  let s = fresh();
  s = P.completeSession(s, { hip_thrust: { reps: [10, 10, 10, 10] } }).state;
  s.profile.bodyMass = 100;
  s = P.syncLifts(s);
  assert.strictEqual(s.lifts.hip_thrust.weight, 75);
});

test('yoga days are an hour with no lifts, and appear in the upcoming strip', () => {
  const s = Object.assign(fresh(), { sessionCount: 2 });
  const sess = P.nextSession(s);
  assert.strictEqual(sess.id, 'yoga');
  assert.strictEqual(sess.minutes, 60);
  assert.strictEqual(sess.exercises.length, 0);
  const r = P.completeSession(s, {});
  assert.strictEqual(r.state.sessionCount, 3);
  assert.strictEqual(r.state.history[0].name, 'Yoga');
  assert.deepStrictEqual(P.upcoming(fresh(), 6).map((d) => d.short), ['Legs A', 'Upper A', 'Yoga', 'Legs B', 'Upper B', 'Yoga']);
});
