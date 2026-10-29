(function () {
  'use strict';
  const P = window.GymPlan;
  const KEY = 'gym-plan-v1';
  const TAB_KEY = 'gym-plan-tab';
  const REST_SEC = 120;

  // ---------- storage: browser always, plus the account store when this runs as a published artifact ----------
  const revive = (raw) => P.migrate(raw);
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

  let state = loadLocal() || P.defaultState();
  let cloud = null;          // db doc ref once connected
  let cloudTimer = null;
  let cloudWrite = Promise.resolve();

  function save() {
    saveLocal();
    if (!cloud) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => {
      const json = JSON.stringify(state);
      cloudWrite = cloudWrite.then(() => cloud.set({ json, updatedAt: new Date().toISOString() })).catch(() => { /* kept locally */ });
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
      render();
    } catch (e) { /* stay local */ }
  }

  // ---------- helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => (Math.round(n * 100) / 100).toString();
  const dateLabel = (iso) => {
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };
  const fmtClock = (sec) => {
    const s = Math.max(0, Math.round(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const setText = (s) => (s.kg != null ? `${fmt(s.kg)}×${s.reps}` : `${s.reps}`);
  const setsText = (sets) => sets.map(setText).join(', ');

  let tab = 'today';
  try { tab = localStorage.getItem(TAB_KEY) || 'today'; } catch (e) { /* ignore */ }
  if (!['today', 'lifts', 'me'].includes(tab)) tab = 'today';
  let armed = null;          // id of a button waiting for its confirming second tap
  let justSaved = null;      // the session just finished, shown once

  function draft() {
    state.draft = P.draftFor(state);
    return state.draft;
  }

  // ---------- Today ----------
  function exerciseCard(e, i) {
    const last = P.lastFor(state, e.name);
    const rows = e.sets.map((s, j) => {
      const prev = last && (last.sets[j] || last.sets[last.sets.length - 1]);
      return `<div class="setrow"><span class="setno">${j + 1}</span>
        <label class="field">${j ? '' : 'kg'}<input aria-label="Set ${j + 1} kg" type="number" min="0" step="0.5" inputmode="decimal" data-e="${i}" data-s="${j}" data-f="kg" value="${esc(s.kg ?? '')}" placeholder="${prev && prev.kg != null ? fmt(prev.kg) : ''}"></label>
        <label class="field">${j ? '' : 'Reps'}<input aria-label="Set ${j + 1} reps" type="number" min="0" inputmode="numeric" data-e="${i}" data-s="${j}" data-f="reps" value="${esc(s.reps ?? '')}" placeholder="${prev ? esc(prev.reps ?? '') : ''}"></label></div>`;
    }).join('');
    const rm = armed === `rm-${i}`;
    return `<article class="ex">
      <header><h3>${esc(e.name)}</h3><button type="button" class="x${rm ? ' armed' : ''}" data-remove="${i}" aria-label="Remove ${esc(e.name)}">${rm ? 'Remove?' : '×'}</button></header>
      ${last ? `<p class="last">Last, ${esc(dateLabel(last.date))}: <b>${esc(setsText(last.sets))}</b></p>` : ''}
      <div class="sets">${rows}</div>
      <div class="timer-btns">
        <button type="button" class="chipbtn" data-addset="${i}">+ Set</button>
        <button type="button" class="chipbtn" data-rest="${REST_SEC}">Rest ${fmtClock(REST_SEC)}</button>
        <a class="chipbtn" href="${esc(P.helpUrl(e.name))}" target="_blank" rel="noopener">Help ▶</a>
      </div>
    </article>`;
  }

  function addPanel(d) {
    const used = d.entries.map((e) => e.name.toLowerCase());
    const names = P.exerciseNames(state).filter((n) => !used.includes(n.toLowerCase())).sort((a, b) => a.localeCompare(b));
    const pick = names.length
      ? `<select id="pick" aria-label="Previous exercises"><option value="">Previous exercises…</option>${names.map((n) => `<option>${esc(n)}</option>`).join('')}</select>`
      : '';
    return `<section class="panel add">
      ${pick}
      <form id="new-ex" class="addrow"><input id="new-name" type="text" placeholder="New exercise" autocomplete="off" aria-label="New exercise"><button type="submit" class="chipbtn">Add</button></form>
    </section>`;
  }

  function savedPanel() {
    if (!justSaved) return '';
    return `<section class="panel flash"><h2>Saved: ${esc(justSaved.day)}</h2><ul class="done-list">${justSaved.entries.map((e) =>
      `<li><span>${esc(e.name)}</span><span class="n">${esc(setsText(e.sets))}</span></li>`).join('')}</ul></section>`;
  }

  function scheduleStrip() {
    return `<ol class="strip">${P.upcoming(state, Math.min(6, Math.max(state.days.length, 4))).map((d, i) =>
      `<li class="${i === 0 ? 'now' : ''}">${esc(d)}</li>`).join('')}</ol>`;
  }

  function renderToday() {
    const d = draft();
    const n = state.history.length + 1;
    return `${savedPanel()}
      ${scheduleStrip()}
      <section class="head">
        <span class="eyebrow">Session ${n}</span>
        <h1>${esc(d.day)}</h1>
      </section>
      ${d.entries.map(exerciseCard).join('')}
      ${addPanel(d)}
      <button type="button" class="primary" id="finish">${armed === 'finish' ? 'Nothing logged. Tap again to skip' : 'Finish workout'}</button>`;
  }

  // ---------- Lifts ----------
  function renderLifts() {
    const names = P.exerciseNames(state).sort((a, b) => a.localeCompare(b));
    const rows = names.map((n) => {
      const last = P.lastFor(state, n);
      const best = P.bestFor(state, n);
      return `<tr><td>${esc(n)}<div class="muted small">${esc(dateLabel(last.date))} · ${esc(setsText(last.sets))}</div></td>
        <td class="n">${best ? `${fmt(best.kg)} kg<div class="muted small">×${esc(best.reps)}</div>` : '<span class="muted">—</span>'}</td></tr>`;
    }).join('');
    return `<section class="head"><h1>Lifts</h1></section>
      ${names.length ? `<section class="panel"><div class="table-wrap"><table>
        <thead><tr><th>Exercise · last</th><th class="n">Best</th></tr></thead>
        <tbody>${rows}</tbody></table></div></section>` : ''}`;
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
    const hist = state.history.slice(0, 20).map((h) => `<details class="hist"><summary>${esc(dateLabel(h.date))} · ${esc(h.day)}</summary><ul>` +
      h.entries.map((e) => `<li>${esc(e.name)}: ${esc(setsText(e.sets))}</li>`).join('') + '</ul></details>').join('');
    const inApk = /; wv\)/.test(navigator.userAgent);
    const backup = cloud || inApk ? '' : `<section class="panel"><h2>Backup</h2>
        <div class="grid2"><button type="button" class="secondary" id="export">Export</button>
        <label class="secondary" style="text-align:center;display:grid;place-items:center;border:1px solid var(--line);border-radius:10px;cursor:pointer;font:600 18px var(--display);text-transform:uppercase;letter-spacing:.04em">Import<input type="file" id="import" accept="application/json" hidden></label></div></section>`;

    return `<section class="head"><h1>Me</h1></section>
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
      <section class="panel"><h2>Days, in order</h2>
        <form id="days"><textarea id="days-list" rows="${Math.max(4, state.days.length)}" aria-label="Days, one per line">${esc(state.days.join('\n'))}</textarea>
        <button type="submit" class="secondary">Save days</button></form>
      </section>
      ${hist ? `<section class="panel"><h2>History</h2>${hist}</section>` : ''}
      ${backup}
      <button type="button" class="secondary danger" id="reset">${armed === 'reset' ? 'Tap again to erase everything' : 'Erase all history'}</button>`;
  }

  // ---------- render + events ----------
  function render() {
    document.querySelectorAll('nav.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $('#view').innerHTML = tab === 'lifts' ? renderLifts() : tab === 'me' ? renderMe() : renderToday();
  }

  document.querySelector('nav.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    armed = null;
    justSaved = null;
    try { localStorage.setItem(TAB_KEY, tab); } catch (err) { /* ignore */ }
    render();
    window.scrollTo(0, 0);
  });

  const view = $('#view');

  // ---------- rest timer ----------
  // Counts down and starts automatically when reps are entered. Kept as a
  // timestamp so it stays right if the screen sleeps.
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

  function startRest(sec) {
    timer = { end: Date.now() + sec * 1000, alerted: false };
    clearInterval(tick);
    if (audio && audio.state === 'suspended') audio.resume();
    drawTimer();
    tick = setInterval(drawTimer, 250);
  }
  function stopTimer() {
    timer = null;
    clearInterval(tick);
    $('#timer').hidden = true;
  }
  function drawTimer() {
    if (!timer) return;
    const el = $('#timer');
    el.hidden = false;
    const left = (timer.end - Date.now()) / 1000;
    const done = left <= 0;
    if (done && !timer.alerted) { timer.alerted = true; alertDone(); }
    el.className = done ? 'timer done' : 'timer';
    el.innerHTML = `<div class="t-main"><span class="t-label">${done ? 'Rest over' : 'Rest'}</span><span class="t-clock">${done ? 'Go' : fmtClock(Math.ceil(left))}</span></div>
      <div class="t-btns"><button type="button" data-t="minus">−15</button><button type="button" data-t="plus">+15</button><button type="button" data-t="stop">${done ? 'Close' : 'Skip'}</button></div>`;
  }

  $('#timer').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-t]');
    if (!b || !timer) return;
    const t = b.dataset.t;
    if (t === 'stop') stopTimer();
    else if (t === 'minus') { timer.end -= 15000; drawTimer(); }
    else if (t === 'plus') { timer.end = Math.max(timer.end, Date.now()) + 15000; timer.alerted = false; drawTimer(); }
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden && timer) drawTimer(); });

  // ---------- Today events ----------
  view.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.e == null) return;
    const d = draft();
    d.entries[Number(el.dataset.e)].sets[Number(el.dataset.s)][el.dataset.f] = el.value === '' ? null : Number(el.value);
    if (armed === 'finish') { armed = null; $('#finish').textContent = 'Finish workout'; }
    save();
  });

  view.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.f === 'reps' && el.value !== '') startRest(REST_SEC);
    if (el.id === 'pick' && el.value) {
      state.draft = P.addExercise(draft(), state, el.value);
      save();
      render();
    }
  });

  function hasData(entry) {
    return entry.sets.some((s) => s.kg != null || s.reps != null);
  }

  view.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.rest) { startRest(Number(t.dataset.rest)); return; }
    if (t.dataset.addset) {
      const entry = draft().entries[Number(t.dataset.addset)];
      const prev = entry.sets[entry.sets.length - 1];
      entry.sets.push({ kg: prev ? prev.kg : null, reps: null });
      save();
      render();
      return;
    }
    if (t.dataset.remove) {
      const i = Number(t.dataset.remove);
      const d = draft();
      if (hasData(d.entries[i]) && armed !== `rm-${i}`) { armed = `rm-${i}`; render(); return; }
      armed = null;
      d.entries.splice(i, 1);
      save();
      render();
      return;
    }
    if (t.id === 'finish') {
      const d = draft();
      const empty = !d.entries.some((x) => x.sets.some((s) => s.reps != null));
      if (empty && armed !== 'finish') { armed = 'finish'; t.textContent = 'Nothing logged. Tap again to skip'; return; }
      armed = null;
      const before = state.history.length;
      state = P.finishSession(state, d);
      justSaved = state.history.length > before ? state.history[0] : null;
      stopTimer();
      save();
      render();
      window.scrollTo(0, 0);
    } else if (t.id === 'reset') {
      if (armed !== 'reset') { armed = 'reset'; render(); return; }
      armed = null;
      state = Object.assign(P.defaultState(), { profile: state.profile, days: state.days });
      justSaved = null;
      save();
      render();
    } else if (t.id === 'export') {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `gym-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  });

  view.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = e.target.id;
    if (id === 'new-ex') {
      const name = $('#new-name').value;
      state.draft = P.addExercise(draft(), state, name);
      save();
      render();
    } else if (id === 'days') {
      state = P.setDays(state, $('#days-list').value.split('\n'));
      save();
      render();
    } else if (id === 'profile') {
      const f = e.target.elements;
      state.profile = {
        bodyMass: Number(f.bodyMass.value),
        height: Number(f.height.value),
        age: f.age.value ? Number(f.age.value) : null,
        sex: f.sex.value,
      };
      save();
      render();
    }
  });

  view.addEventListener('change', async (e) => {
    if (e.target.id !== 'import') return;
    const file = e.target.files[0];
    if (!file) return;
    try {
      state = revive(JSON.parse(await file.text()));
      save();
      render();
    } catch (err) { /* not a backup file */ }
  });

  render();
  connectCloud();

  // Installed-app mode (GitHub Pages): cache the app so it opens offline.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !window.claude) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* not installable here */ });
  }
})();
