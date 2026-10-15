(function () {
  'use strict';
  const P = window.GymPlan;
  const KEY = 'gym-plan-v1';
  const TAB_KEY = 'gym-plan-tab';

  // ---------- storage: browser always, plus the account store when this runs as a published artifact ----------
  function revive(raw) {
    return P.syncLifts(Object.assign(P.defaultState(), raw));
  }
  function loadLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return revive(JSON.parse(raw));
    } catch (e) { /* storage blocked or corrupt */ }
    return null;
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  let state = loadLocal() || P.syncLifts(P.defaultState());
  let cloud = null;          // db doc ref once connected
  let cloudTimer = null;
  let cloudWrite = Promise.resolve();
  let saveStatus = 'Saved on this device';

  function save() {
    saveLocal();
    if (!cloud) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => {
      const json = JSON.stringify(state);
      cloudWrite = cloudWrite.then(() => cloud.set({ json, updatedAt: new Date().toISOString() }))
        .then(() => setStatus('Saved to your account'))
        .catch(() => setStatus('Saved on this device only (account save failed)'));
    }, 600);
  }

  async function connectCloud() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    let db;
    try { db = await window.claude.use('db'); } catch (e) { return; }
    if (!db) return;
    const ref = db.doc('plan/state');
    try {
      const snap = await ref.get();
      const data = snap.exists ? snap.data() : null;
      if (data && typeof data.json === 'string') {
        state = revive(JSON.parse(data.json));
        saveLocal();
      } else {
        await ref.set({ json: JSON.stringify(state), updatedAt: new Date().toISOString() });
      }
      cloud = ref;
      setStatus('Saved to your account');
      render();
    } catch (e) {
      setStatus('Saved on this device only');
    }
  }

  function setStatus(text) {
    saveStatus = text;
    const el = document.getElementById('save-status');
    if (el) el.textContent = text;
  }

  // ---------- helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => (Math.round(n * 100) / 100).toString();
  const unitShort = (u) => (u === 'sec' ? 's' : '');
  const dateLabel = (iso) => {
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };
  const fmtClock = (sec) => {
    const s = Math.max(0, Math.round(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const GROUP_ORDER = ['glutes', 'quads', 'hamstrings', 'adductors', 'calves', 'knee stability', 'chest', 'back', 'shoulders', 'arms', 'core'];

  let tab = 'today';
  try { tab = localStorage.getItem(TAB_KEY) || 'today'; } catch (e) { /* ignore */ }
  let lastOutcomes = null;
  let armed = null;          // id of a button waiting for its confirming second tap

  // ---------- Today ----------
  function lastLine(ex, lift) {
    const last = lift.last;
    if (last) {
      const sets = last.results.join(' · ') + unitShort(last.unit);
      const load = last.weight ? `${fmt(last.weight)} kg × ` : '';
      return `<p class="last">Last time, ${esc(dateLabel(last.date))}: <b>${load}${esc(sets)}</b> <span class="${esc(last.change)}">· ${esc(last.message)}</span></p>`;
    }
    return '';
  }

  function exerciseCard(ex, lift, draft) {
    const d = draft[ex.id] || {};
    const reps = d.reps || [];
    const big = ex.loaded
      ? `<span class="kg">${fmt(ex.weight)}</span><span class="unit">kg${ex.perHand ? ' each hand' : ''}</span>`
      : `<span class="kg text">${ex.unit === 'sec' ? 'Hold' : 'Band'}</span><span class="unit">${ex.unit === 'sec' ? 'bodyweight' : 'or light cable'}</span>`;
    const setInputs = Array.from({ length: ex.sets }, (_, i) =>
      `<label class="field">Set ${i + 1}<input type="number" min="0" inputmode="numeric" id="r-${ex.id}-${i}" data-ex="${ex.id}" data-set="${i}" value="${esc(reps[i] ?? '')}" placeholder="${ex.max}"></label>`
    ).join('');
    const weightInput = ex.loaded
      ? `<label class="field weight">Weight used (kg)<input type="number" min="0" step="0.5" inputmode="decimal" id="w-${ex.id}" data-ex="${ex.id}" data-weight="1" value="${esc(d.weight ?? fmt(ex.weight))}"></label>`
      : '';
    return `<article class="ex">
      <header><h3>${esc(ex.name)}</h3><span class="chip">${esc(ex.group)}</span></header>
      <div class="target">
        <div class="try"><span class="label">Try</span>${big}</div>
        <dl class="spec">
          <div><dt>Sets</dt><dd>${ex.sets} × ${ex.min}–${ex.max}${unitShort(ex.unit)}</dd></div>
          <div><dt>Rest</dt><dd>${esc(ex.rest)}</dd></div>
          <div><dt>Effort</dt><dd>${esc(ex.effort)}</dd></div>
        </dl>
      </div>
      ${lastLine(ex, lift)}
      ${ex.kneeNote ? `<details class="knee"><summary>Notes</summary><p>${esc(ex.kneeNote)}</p></details>` : ''}
      <div class="log"><div class="log-row">${weightInput}${setInputs}</div>
        <div class="timer-btns">
          ${ex.unit === 'sec' ? `<button type="button" class="chipbtn" data-hold="${ex.id}" data-min="${ex.min}" data-max="${ex.max}">Start hold</button>` : ''}
          <button type="button" class="chipbtn" data-rest="${ex.restSec}" data-name="${esc(ex.name)}">Rest ${fmtClock(ex.restSec)}</button>
        </div></div>
    </article>`;
  }

  function outcomesPanel() {
    if (!lastOutcomes) return '';
    const rows = lastOutcomes.map((o) => {
      const next = o.weight != null ? `${fmt(o.next)} kg` : '';
      return `<li><span>${esc(o.name)}</span><span class="n ${esc(o.change)}">${esc(next || o.message)}</span></li>`;
    }).join('');
    return `<section class="panel flash"><h2>Workout saved. Next time:</h2><ul class="done-list">${rows}</ul></section>`;
  }

  function renderToday() {
    const s = P.nextSession(state);
    const draft = state.draft && state.draft.index === s.index ? state.draft.log : {};
    const kind = s.id.startsWith('lower') ? 'Leg day' : 'Upper day';
    return `${outcomesPanel()}
      <section class="head">
        <span class="eyebrow">Session ${s.index + 1} · ${kind}</span>
        <h1>${esc(s.name)}</h1>
        ${s.deload ? '<span class="pill">Deload week: half the sets, same weights, nothing moves up</span>' : ''}
      </section>
      ${s.exercises.map((ex) => exerciseCard(ex, state.lifts[ex.id], draft)).join('')}
      <button type="button" class="primary" id="finish">${armed === 'finish' ? 'Nothing logged. Tap again to skip this session' : 'Finish workout'}</button>`;
  }

  // ---------- All lifts ----------
  function renderLifts() {
    const ids = [];
    for (const day of P.ROTATION) for (const id of day.exercises) if (!ids.includes(id)) ids.push(id);
    const byGroup = {};
    for (const id of ids) (byGroup[P.EXERCISES[id].group] = byGroup[P.EXERCISES[id].group] || []).push(id);
    const rows = GROUP_ORDER.filter((g) => byGroup[g]).map((g) => {
      const head = `<tr class="group"><td colspan="3">${esc(g)}</td></tr>`;
      return head + byGroup[g].map((id) => {
        const ex = P.EXERCISES[id];
        const lift = state.lifts[id];
        const bonus = lift.bonus || 0;
        const target = `${ex.sets} × ${ex.min + bonus}–${ex.max + bonus}${unitShort(ex.unit)}`;
        const next = ex.increment
          ? `<input type="number" step="0.5" min="0" inputmode="decimal" id="l-${id}" data-lift="${id}" value="${fmt(lift.weight)}" class="${lift.source === 'estimate' ? 'estimate' : ''}" aria-label="${esc(ex.name)} next weight">${ex.perHand ? ' <span class="muted small">/hand</span>' : ''}`
          : '<span class="muted">—</span>';
        const last = lift.last
          ? `${lift.last.weight ? fmt(lift.last.weight) + ' kg × ' : ''}${lift.last.results.join(', ')}${unitShort(lift.last.unit)} <span class="muted small">${esc(dateLabel(lift.last.date))}</span>`
          : '<span class="muted">Not yet</span>';
        return `<tr><td>${esc(ex.name)}<br><span class="muted small">${target}</span><div class="lastmini small">Last: ${last}</div></td><td>${next}</td><td class="lastcol">${last}</td></tr>`;
      }).join('');
    }).join('');
    return `<section class="head"><span class="eyebrow">Next weight for every exercise</span><h1>All lifts</h1></section>
      <section class="panel"><div class="table-wrap"><table>
        <thead><tr><th>Exercise</th><th>Next (kg)</th><th class="lastcol">Last attempt</th></tr></thead>
        <tbody>${rows}</tbody></table></div></section>`;
  }

  // ---------- Me ----------
  function renderMe() {
    const p = state.profile;
    const n = P.nutrition(p);
    let food = '';
    if (n) {
      const stats = [['BMI', n.bmi], ['Protein', `${n.proteinLow}–${n.proteinHigh} g/day`]];
      if (n.maintenance) stats.push(['Maintenance', `${n.maintenance} kcal`], ['Lean gain', `${n.leanGain} kcal`]);
      food = `<dl class="stats">${stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
    }
    const vol = P.weeklyVolume();
    const max = Math.max(...Object.values(vol));
    const bars = GROUP_ORDER.filter((g) => vol[g]).map((g) =>
      `<div class="bar"><span>${esc(g)}</span><span class="track"><span class="fill" style="width:${(vol[g] / max) * 100}%"></span></span><span class="num">${vol[g]}</span></div>`).join('');
    const hist = state.history.length
      ? state.history.slice(0, 15).map((h) => `<details class="hist"><summary>${esc(dateLabel(h.date))} · ${esc(h.name)}${h.deload ? ' (deload)' : ''}</summary><ul>` +
          h.outcomes.map((o) => `<li>${esc(o.name)}: ${o.weight ? fmt(o.weight) + ' kg × ' : ''}${esc(o.results.join(', ') || 'not logged')} <span class="${esc(o.change)}">→ ${esc(o.message)}</span></li>`).join('') +
          '</ul></details>').join('')
      : '';
    const inApk = /; wv\)/.test(navigator.userAgent);
    const backup = cloud || inApk ? '' : `<section class="panel"><h2>Backup</h2>
        <p class="muted small">Your data is saved in this browser only. Export it to move it to another device.</p>
        <div class="grid2"><button type="button" class="secondary" id="export">Export</button>
        <label class="secondary" style="text-align:center;display:grid;place-items:center;border:1px solid var(--line);border-radius:10px;cursor:pointer;font:600 18px var(--display);text-transform:uppercase;letter-spacing:.04em">Import<input type="file" id="import" accept="application/json" hidden></label></div></section>`;

    return `<section class="head"><span class="eyebrow">Body stats</span><h1>Me</h1></section>
      <section class="panel">
        <form id="profile" class="grid2">
          <label class="field">Body mass (kg)<input id="p-mass" name="bodyMass" type="number" step="0.1" min="30" inputmode="decimal" value="${esc(p.bodyMass ?? '')}" required></label>
          <label class="field">Height (cm)<input id="p-height" name="height" type="number" step="0.5" min="120" inputmode="decimal" value="${esc(p.height ?? '')}" required></label>
          <label class="field">Age (optional)<input id="p-age" name="age" type="number" min="14" max="99" inputmode="numeric" value="${esc(p.age ?? '')}"></label>
          <label class="field">Sex (optional)<select id="p-sex" name="sex">
            <option value=""${p.sex ? '' : ' selected'}>—</option>
            <option value="male"${p.sex === 'male' ? ' selected' : ''}>Male</option>
            <option value="female"${p.sex === 'female' ? ' selected' : ''}>Female</option></select></label>
          <button type="submit" class="primary" style="grid-column:1/-1">Save body stats</button>
        </form>
        ${food}
      </section>
      <section class="panel"><h2>Sets per muscle</h2>${bars}</section>
      ${hist ? `<section class="panel"><h2>History</h2>${hist}</section>` : ''}
      ${backup}
      <button type="button" class="secondary danger" id="reset">${armed === 'reset' ? 'Tap again to erase everything' : 'Erase all weights and history'}</button>`;
  }

  // ---------- render + events ----------
  function render() {
    document.querySelectorAll('nav.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $('#view').innerHTML = tab === 'lifts' ? renderLifts() : tab === 'me' ? renderMe() : renderToday();
  }

  function readDraft() {
    const log = {};
    document.querySelectorAll('#view input[data-ex]').forEach((el) => {
      const id = el.dataset.ex;
      log[id] = log[id] || { reps: [] };
      if (el.dataset.weight) log[id].weight = el.value === '' ? null : Number(el.value);
      else log[id].reps[Number(el.dataset.set)] = el.value === '' ? null : Number(el.value);
    });
    return log;
  }

  document.querySelector('nav.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    armed = null;
    try { localStorage.setItem(TAB_KEY, tab); } catch (err) { /* ignore */ }
    render();
    window.scrollTo(0, 0);
  });

  const view = $('#view');

  // ---------- timers ----------
  // Rest counts down from the exercise's rest time and starts automatically when
  // a set is logged. Hold counts up for timed exercises and fills in the set.
  // Times are kept as timestamps so they stay right if the screen sleeps.
  let timer = null;
  let tick = null;
  let audio = null;

  function alertDone() {
    try { if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 250]); } catch (e) { /* ignore */ }
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.3, 0.6].forEach((t) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.25, audio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + t + 0.2);
        o.connect(g).connect(audio.destination);
        o.start(audio.currentTime + t);
        o.stop(audio.currentTime + t + 0.22);
      });
    } catch (e) { /* no audio */ }
  }

  function startRest(sec, name) {
    timer = { kind: 'rest', name, end: Date.now() + sec * 1000, alerted: false };
    runTimer();
  }
  function startHold(exId, min, max) {
    timer = { kind: 'hold', exId, min, max, start: Date.now(), alerted: false };
    runTimer();
  }
  function stopTimer() {
    timer = null;
    clearInterval(tick);
    $('#timer').hidden = true;
  }
  function runTimer() {
    clearInterval(tick);
    if (audio && audio.state === 'suspended') audio.resume();
    drawTimer();
    tick = setInterval(drawTimer, 250);
  }
  function drawTimer() {
    if (!timer) return;
    const el = $('#timer');
    el.hidden = false;
    if (timer.kind === 'rest') {
      const left = (timer.end - Date.now()) / 1000;
      const done = left <= 0;
      if (done && !timer.alerted) { timer.alerted = true; alertDone(); }
      el.className = done ? 'timer done' : 'timer';
      el.innerHTML = `<div class="t-main"><span class="t-label">${done ? 'Rest over' : 'Rest'}</span><span class="t-clock">${done ? 'Go' : fmtClock(Math.ceil(left))}</span></div>
        <div class="t-btns"><button type="button" data-t="minus">−15</button><button type="button" data-t="plus">+15</button><button type="button" data-t="stop">${done ? 'Close' : 'Skip'}</button></div>`;
    } else {
      const secs = (Date.now() - timer.start) / 1000;
      if (secs >= timer.max && !timer.alerted) { timer.alerted = true; alertDone(); }
      el.className = secs >= timer.min ? 'timer done' : 'timer';
      el.innerHTML = `<div class="t-main"><span class="t-label">Hold ${timer.min}–${timer.max}s</span><span class="t-clock">${Math.floor(secs)}s</span></div>
        <div class="t-btns"><button type="button" data-t="hold-done">Done</button><button type="button" data-t="stop">Cancel</button></div>`;
    }
  }

  $('#timer').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-t]');
    if (!b || !timer) return;
    const t = b.dataset.t;
    if (t === 'stop') stopTimer();
    else if (t === 'minus') { timer.end -= 15000; drawTimer(); }
    else if (t === 'plus') { timer.end = Math.max(timer.end, Date.now()) + 15000; timer.alerted = false; drawTimer(); }
    else if (t === 'hold-done') {
      const secs = Math.floor((Date.now() - timer.start) / 1000);
      const exId = timer.exId;
      const empty = Array.from(document.querySelectorAll(`#view input[data-ex="${exId}"][data-set]`)).find((i) => i.value === '');
      if (empty) {
        empty.value = secs;
        empty.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const restBtn = empty && empty.closest('.ex').querySelector('button[data-rest]');
      if (restBtn) startRest(Number(restBtn.dataset.rest), restBtn.dataset.name);
      else stopTimer();
    }
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden && timer) drawTimer(); });

  view.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.dataset.set || el.value === '') return;
    if (timer && timer.kind === 'hold') return;
    const restBtn = el.closest('.ex').querySelector('button[data-rest]');
    if (restBtn) startRest(Number(restBtn.dataset.rest), restBtn.dataset.name);
  });

  view.addEventListener('input', (e) => {
    if (!e.target.dataset.ex) return;
    state.draft = { index: state.sessionCount, log: readDraft() };
    if (armed === 'finish') { armed = null; $('#finish').textContent = 'Finish workout'; }
    save();
  });

  view.addEventListener('change', (e) => {
    const id = e.target.dataset.lift;
    if (!id) return;
    state = P.setWeight(state, id, e.target.value);
    save();
    e.target.classList.remove('estimate');
  });

  view.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.rest) { startRest(Number(t.dataset.rest), t.dataset.name); return; }
    if (t.dataset.hold) { startHold(t.dataset.hold, Number(t.dataset.min), Number(t.dataset.max)); return; }
    if (t.id === 'finish') {
      const log = readDraft();
      const empty = Object.values(log).every((x) => x.reps.every((v) => v == null));
      if (empty && armed !== 'finish') { armed = 'finish'; t.textContent = 'Nothing logged. Tap again to skip this session'; return; }
      armed = null;
      const res = P.completeSession(state, log);
      state = res.state;
      delete state.draft;
      lastOutcomes = res.outcomes;
      stopTimer();
      save();
      render();
      window.scrollTo(0, 0);
    } else if (t.id === 'reset') {
      if (armed !== 'reset') { armed = 'reset'; render(); return; }
      armed = null;
      state = P.syncLifts(P.defaultState());
      lastOutcomes = null;
      save();
      render();
    } else if (t.id === 'export') {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `gym-plan-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  });

  view.addEventListener('submit', (e) => {
    if (e.target.id !== 'profile') return;
    e.preventDefault();
    const f = e.target.elements;
    state.profile = {
      bodyMass: Number(f.bodyMass.value),
      height: Number(f.height.value),
      age: f.age.value ? Number(f.age.value) : null,
      sex: f.sex.value,
    };
    state = P.syncLifts(state);
    save();
    render();
  });

  view.addEventListener('change', async (e) => {
    if (e.target.id !== 'import') return;
    const file = e.target.files[0];
    if (!file) return;
    try {
      state = revive(JSON.parse(await file.text()));
      save();
      render();
    } catch (err) {
      setStatus('That file is not a Gym Plan backup');
    }
  });

  render();
  connectCloud();

  // Installed-app mode (GitHub Pages): cache the app so it opens offline.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !window.claude) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* not installable here */ });
  }
})();
