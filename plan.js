/*
 * Plan engine: exercise library, starting-weight estimates, progression rules.
 * Pure functions with no DOM access, so it runs in the browser (window.GymPlan)
 * and under Node for tests (module.exports).
 */
(function (root) {
  'use strict';

  // kneeNote explains why a movement is in (or how to keep it knee-safe).
  // ratio: starting load as a fraction of body mass when no weight is entered.
  // perHand: the weight is per dumbbell. unit: 'reps' or 'sec'.
  // increment 0 means unloaded/band work: progress by adding reps/seconds.
  const EXERCISES = {
    hip_thrust: { name: 'Barbell hip thrust', group: 'glutes', sets: 4, min: 8, max: 12, increment: 5, ratio: 1.0,
      kneeNote: 'Knees stay at ~90° and do not move under load. Main glute builder.' },
    rdl: { name: 'Romanian deadlift', group: 'hamstrings', sets: 4, min: 8, max: 10, increment: 5, ratio: 0.8,
      kneeNote: 'Soft, fixed knee bend; all movement is at the hip.' },
    leg_press_shallow: { name: 'Leg press (stop at ~60° knee bend)', group: 'quads', sets: 3, min: 10, max: 15, increment: 10, ratio: 1.5,
      kneeNote: 'Closed-chain and guided. Set the stops or depth so knees never pass ~60°; feet higher on the plate shifts work to glutes.' },
    leg_press_heavy: { name: 'Leg press, heavier (stop at ~60° knee bend)', group: 'quads', sets: 4, min: 8, max: 12, increment: 10, ratio: 1.8,
      kneeNote: 'Same shallow range as day A, heavier load. Stop the set if the kneecap feels unsteady.' },
    leg_curl: { name: 'Seated leg curl', group: 'hamstrings', sets: 4, min: 10, max: 15, increment: 2.5, ratio: 0.35,
      kneeNote: 'Machine-guided and unloaded through the joint; hamstrings help stabilise the knee.' },
    calf_standing: { name: 'Standing calf raise', group: 'calves', sets: 4, min: 10, max: 15, increment: 5, ratio: 0.8,
      kneeNote: 'Straight knees.' },
    calf_seated: { name: 'Seated calf raise', group: 'calves', sets: 3, min: 12, max: 20, increment: 5, ratio: 0.5,
      kneeNote: 'Knees fixed at 90° with no movement.' },
    tke: { name: 'Cable terminal knee extension (VMO)', group: 'knee stability', sets: 3, min: 15, max: 20, increment: 2.5, ratio: 0.2,
      kneeNote: 'Face the stack with the strap behind your knee, straighten the last ~30° and squeeze the inner quad (VMO) for 1–2s. A band works too if no cable is free.' },
    spanish_squat: { name: 'Spanish squat isometric (45–60°)', group: 'quads', sets: 4, min: 30, max: 45, unit: 'sec', increment: 0, ratio: 0,
      kneeNote: 'Strap behind the knees, sit back to a fixed shallow angle and hold. Builds quad/VMO strength with very little shear on the kneecap.' },
    step_up: { name: 'Low-box step-up (knee ≤ 60°)', group: 'quads', sets: 3, min: 10, max: 12, increment: 2, ratio: 0.15, perHand: true,
      kneeNote: 'Box about mid-shin height. Drive through the whole foot and keep the knee tracking over the 2nd toe; no caving inward.' },
    hip_abduction: { name: 'Cable hip abduction', group: 'glutes', sets: 3, min: 12, max: 20, increment: 2.5, ratio: 0.12,
      kneeNote: 'Ankle strap, standing leg soft and still. Glute med strength stops the knee collapsing inward, the main cause of kneecap instability under load.' },
    cable_adduction: { name: 'Cable hip adduction', group: 'adductors', sets: 3, min: 12, max: 15, increment: 2.5, ratio: 0.15,
      kneeNote: 'Ankle strap, straight working leg. Adductors add a lot of inner-thigh size and help control the knee side to side.' },
    cable_pull_through: { name: 'Cable pull-through', group: 'glutes', sets: 3, min: 10, max: 15, increment: 2.5, ratio: 0.35,
      kneeNote: 'Rope between the legs, hinge at the hips with a soft, fixed knee bend, then drive the hips forward.' },
    cable_kickback: { name: 'Cable glute kickback', group: 'glutes', sets: 3, min: 12, max: 15, increment: 2.5, ratio: 0.1,
      kneeNote: 'Ankle strap, kick back and slightly out with the knee kept at one fixed angle.' },
    copenhagen: { name: 'Copenhagen plank (short lever, knee on bench)', group: 'adductors', sets: 3, min: 20, max: 40, unit: 'sec', increment: 0, ratio: 0,
      kneeNote: 'Adductors help control the knee in the frontal plane. Start with the knee on the bench, not the ankle.' },
    single_leg_balance: { name: 'Single-leg balance, soft knee', group: 'knee stability', sets: 2, min: 30, max: 60, unit: 'sec', increment: 0, ratio: 0,
      kneeNote: 'Proprioception for knee control. Progress to eyes closed or an unstable pad once 60s is easy.' },

    bench: { name: 'Bench press', group: 'chest', sets: 4, min: 6, max: 10, increment: 2.5, ratio: 0.75 },
    incline_db: { name: 'Incline dumbbell press', group: 'chest', sets: 3, min: 8, max: 12, increment: 2, ratio: 0.25, perHand: true },
    row: { name: 'Chest-supported row', group: 'back', sets: 4, min: 8, max: 12, increment: 2.5, ratio: 0.6 },
    cable_row: { name: 'Seated cable row', group: 'back', sets: 3, min: 10, max: 12, increment: 2.5, ratio: 0.55 },
    pulldown: { name: 'Lat pulldown', group: 'back', sets: 3, min: 8, max: 12, increment: 2.5, ratio: 0.6 },
    ohp: { name: 'Seated dumbbell shoulder press', group: 'shoulders', sets: 3, min: 8, max: 12, increment: 2, ratio: 0.2, perHand: true },
    lateral_raise: { name: 'Dumbbell lateral raise', group: 'shoulders', sets: 3, min: 12, max: 20, increment: 1, ratio: 0.08, perHand: true },
    face_pull: { name: 'Cable face pull', group: 'shoulders', sets: 3, min: 12, max: 20, increment: 2.5, ratio: 0.2 },
    triceps: { name: 'Triceps rope pushdown', group: 'arms', sets: 3, min: 10, max: 15, increment: 2.5, ratio: 0.3 },
    curl: { name: 'Dumbbell curl', group: 'arms', sets: 3, min: 8, max: 12, increment: 1, ratio: 0.12, perHand: true },
    pallof: { name: 'Pallof press', group: 'core', sets: 3, min: 10, max: 15, increment: 2.5, ratio: 0.15 },
    cable_crunch: { name: 'Cable crunch', group: 'core', sets: 3, min: 10, max: 15, increment: 2.5, ratio: 0.4 },
  };

  // Sessions rotate in this order regardless of how many days a week you train,
  // so legs get 2 of every 4 sessions.
  const ROTATION = [
    { id: 'lower_a', name: 'Lower A: glutes & hamstrings',
      exercises: ['hip_thrust', 'rdl', 'leg_press_shallow', 'leg_curl', 'hip_abduction', 'cable_adduction', 'calf_standing', 'tke'] },
    { id: 'upper_a', name: 'Upper A: horizontal push & pull',
      exercises: ['bench', 'row', 'ohp', 'pulldown', 'lateral_raise', 'triceps', 'pallof'] },
    { id: 'lower_b', name: 'Lower B: knee-safe quads & stability',
      exercises: ['spanish_squat', 'leg_press_heavy', 'step_up', 'cable_pull_through', 'cable_kickback', 'copenhagen', 'calf_seated', 'tke', 'single_leg_balance'] },
    { id: 'upper_b', name: 'Upper B: incline, back & arms',
      exercises: ['incline_db', 'cable_row', 'pulldown', 'face_pull', 'curl', 'triceps', 'cable_crunch'] },
  ];

  // Every 6th week (24 sessions in, if you train 4x) is a deload: half the sets, same weights.
  const DELOAD_EVERY = 24;
  const DELOAD_LENGTH = 4;
  const STRIKES_TO_DELOAD = 2;
  const DELOAD_FACTOR = 0.9;
  const UNLOADED_STEP = { reps: 2, sec: 5 };

  function roundTo(value, step) {
    if (!step) return Math.round(value);
    return Math.round(Math.round(value / step) * step * 100) / 100;
  }

  function estimateWeight(id, bodyMass) {
    const ex = EXERCISES[id];
    if (!ex.increment || !bodyMass) return 0;
    return Math.max(ex.increment, roundTo(bodyMass * ex.ratio, ex.increment));
  }

  function defaultState() {
    return { profile: { bodyMass: 75, height: 178, age: null, sex: '' }, lifts: {}, sessionCount: 0, history: [] };
  }

  // Fill in any lift the user hasn't set from body mass. Estimates are refreshed
  // when body mass changes; weights the user entered or earned are kept.
  function syncLifts(state) {
    const lifts = Object.assign({}, state.lifts);
    for (const id of Object.keys(EXERCISES)) {
      const cur = lifts[id];
      if (!cur || cur.source === 'estimate') {
        lifts[id] = Object.assign({ bonus: 0, strikes: 0 }, cur, {
          weight: estimateWeight(id, state.profile.bodyMass),
          source: 'estimate',
        });
      }
    }
    return Object.assign({}, state, { lifts });
  }

  function setWeight(state, id, weight) {
    const lifts = Object.assign({}, state.lifts);
    lifts[id] = Object.assign({ bonus: 0, strikes: 0 }, lifts[id], { weight: Number(weight) || 0, source: 'user', strikes: 0 });
    return Object.assign({}, state, { lifts });
  }

  function isDeload(sessionCount) {
    return sessionCount % DELOAD_EVERY >= DELOAD_EVERY - DELOAD_LENGTH;
  }

  function targetFor(id, lift, deload) {
    const ex = EXERCISES[id];
    const bonus = (lift && lift.bonus) || 0;
    return {
      id,
      name: ex.name,
      group: ex.group,
      unit: ex.unit || 'reps',
      sets: deload ? Math.ceil(ex.sets / 2) : ex.sets,
      min: ex.min + bonus,
      max: ex.max + bonus,
      weight: lift ? lift.weight : 0,
      perHand: !!ex.perHand,
      loaded: ex.increment > 0,
      kneeNote: ex.kneeNote || '',
      rest: restFor(ex),
      effort: effortFor(id, ex),
    };
  }

  // Hypertrophy guidance: heavier, lower-rep work needs longer rest to keep
  // the next set productive; isolation work recovers faster.
  function restFor(ex) {
    if (ex.unit === 'sec') return '60 s';
    return ex.min <= 8 ? '2–3 min' : '60–90 s';
  }

  // How close to failure to take each set. Knee-loaded movements stay further
  // from failure so form never breaks down around the kneecap.
  const KNEE_LOADED = ['leg_press_shallow', 'leg_press_heavy', 'step_up', 'spanish_squat'];
  function effortFor(id, ex) {
    if (ex.unit === 'sec' || !ex.increment) return 'Controlled, full squeeze each rep';
    if (KNEE_LOADED.includes(id)) return 'Stop 2 reps before failure, never grind';
    if (ex.min <= 8) return 'Stop 1–2 reps before failure';
    return 'Last set to 0–1 reps before failure';
  }

  function nextSession(state) {
    const day = ROTATION[state.sessionCount % ROTATION.length];
    const deload = isDeload(state.sessionCount);
    return {
      index: state.sessionCount,
      id: day.id,
      name: day.name,
      deload,
      exercises: day.exercises.map((id) => targetFor(id, state.lifts[id], deload)),
    };
  }

  // Double progression. results[i] is reps (or seconds) achieved on set i.
  //  - every set at the top of the range  -> add load (or reps/seconds if unloaded)
  //  - any set below the bottom of range  -> a strike; 2 strikes in a row -> drop 10%
  //  - otherwise                          -> same weight, aim for more reps
  // `used` is the weight actually lifted, when it differs from the suggestion.
  function progress(id, current, results, used) {
    const ex = EXERCISES[id];
    const lift = Object.assign({}, current);
    if (ex.increment && Number(used) > 0 && Number(used) !== lift.weight) {
      Object.assign(lift, { weight: Number(used), source: 'user', strikes: 0 });
    }
    const t = targetFor(id, lift, false);
    const done = results.filter((r) => r !== null && r !== undefined && r !== '').map(Number);
    const next = Object.assign({}, lift);
    if (done.length < ex.sets) return { lift: next, change: 'incomplete', message: 'Not all sets logged, holding.' };

    if (done.every((r) => r >= t.max)) {
      next.strikes = 0;
      next.source = 'progressed';
      if (ex.increment) {
        next.weight = roundTo(lift.weight + ex.increment, ex.increment);
        return { lift: next, change: 'up', message: `+${ex.increment} kg${ex.perHand ? ' per hand' : ''} → ${next.weight} kg` };
      }
      const step = UNLOADED_STEP[t.unit];
      next.bonus = (lift.bonus || 0) + step;
      return { lift: next, change: 'up', message: `Target now ${t.min + step}–${t.max + step} ${t.unit}` };
    }

    if (done.some((r) => r < t.min)) {
      next.strikes = (lift.strikes || 0) + 1;
      if (next.strikes >= STRIKES_TO_DELOAD) {
        next.strikes = 0;
        next.source = 'progressed';
        if (ex.increment) {
          next.weight = Math.max(ex.increment, roundTo(lift.weight * DELOAD_FACTOR, ex.increment));
          return { lift: next, change: 'down', message: `Missed twice, reset to ${next.weight} kg` };
        }
        next.bonus = Math.max(0, (lift.bonus || 0) - UNLOADED_STEP[t.unit]);
        return { lift: next, change: 'down', message: 'Missed twice, target eased' };
      }
      return { lift: next, change: 'hold', message: 'Below range, same target next time' };
    }

    next.strikes = 0;
    return { lift: next, change: 'hold', message: 'In range, same weight, chase more reps' };
  }

  // Apply a whole session's log and advance the rotation.
  // log: { [exerciseId]: { reps: number[], weight?: number } } (a bare reps array also works)
  function completeSession(state, log, date) {
    const session = nextSession(state);
    const day = date || new Date().toISOString().slice(0, 10);
    const lifts = Object.assign({}, state.lifts);
    const outcomes = [];
    for (const ex of session.exercises) {
      const entry = Array.isArray(log[ex.id]) ? { reps: log[ex.id] } : (log[ex.id] || {});
      const results = (entry.reps || []).filter((r) => r !== null && r !== undefined && r !== '').map(Number);
      let out;
      if (session.deload) {
        const lift = Object.assign({}, lifts[ex.id]);
        if (ex.loaded && Number(entry.weight) > 0) Object.assign(lift, { weight: Number(entry.weight), source: 'user' });
        out = { lift, change: 'hold', message: 'Deload week, same target next time' };
      } else {
        out = progress(ex.id, lifts[ex.id], results, entry.weight);
      }
      const used = ex.loaded ? (Number(entry.weight) > 0 ? Number(entry.weight) : lifts[ex.id].weight) : null;
      if (results.length) {
        if (out.lift.source === 'estimate') out.lift.source = 'logged';
        out.lift.last = { date: day, weight: used, results, unit: ex.unit, change: out.change, message: out.message };
      }
      lifts[ex.id] = out.lift;
      outcomes.push({ id: ex.id, name: ex.name, change: out.change, message: out.message, results, weight: used, next: out.lift.weight });
    }
    const record = { date: day, session: session.id, name: session.name, deload: session.deload, outcomes };
    return {
      state: Object.assign({}, state, { lifts, sessionCount: state.sessionCount + 1, history: [record].concat(state.history).slice(0, 60) }),
      outcomes,
    };
  }

  // Hard sets per muscle group across one full rotation (≈ one week at 4 sessions/week).
  function weeklyVolume() {
    const vol = {};
    for (const day of ROTATION) {
      for (const id of day.exercises) {
        const g = EXERCISES[id].group;
        vol[g] = (vol[g] || 0) + EXERCISES[id].sets;
      }
    }
    return vol;
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

  const api = { EXERCISES, ROTATION, estimateWeight, defaultState, syncLifts, setWeight, nextSession, progress, completeSession, isDeload, weeklyVolume, nutrition, roundTo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GymPlan = api;
})(typeof window !== 'undefined' ? window : globalThis);
