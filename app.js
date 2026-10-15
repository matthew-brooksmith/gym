(function () {
  'use strict';
  const P = window.GymPlan;
  const KEY = 'gym-plan-v1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return P.syncLifts(Object.assign(P.defaultState(), JSON.parse(raw)));
    } catch (e) { /* storage unavailable or corrupt: start fresh */ }
    return P.syncLifts(P.defaultState());
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  let state = load();
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function loadLabel(ex) {
    if (!ex.loaded) return ex.unit === 'sec' ? 'bodyweight' : 'band / bodyweight';
    return `${ex.weight} kg${ex.perHand ? ' each hand' : ''}`;
  }

  function renderSession() {
    const s = P.nextSession(state);
    const day = s.index + 1;
    $('#next-title').textContent = `Next: ${s.name}`;
    $('#next-meta').innerHTML = `Session ${day}` + (s.deload ? ' <span class="tag">Deload week: half the sets, same weights, no progression</span>' : '');
    const draft = state.draft && state.draft.index === s.index ? state.draft.log : {};
    $('#session-exercises').innerHTML = s.exercises.map((ex) => {
      const inputs = Array.from({ length: ex.sets }, (_, i) => {
        const v = draft[ex.id] && draft[ex.id][i] != null ? draft[ex.id][i] : '';
        return `<input type="number" min="0" inputmode="numeric" data-ex="${ex.id}" data-set="${i}" value="${esc(v)}" placeholder="${ex.max}" aria-label="${esc(ex.name)} set ${i + 1}">`;
      }).join('');
      return `<div class="ex">
        <div class="ex-head"><span class="ex-name">${esc(ex.name)}</span>
          <span>${ex.sets} × ${ex.min}–${ex.max} ${ex.unit === 'sec' ? 's' : ''} @ ${loadLabel(ex)}</span></div>
        ${ex.kneeNote ? `<div class="ex-note">${esc(ex.kneeNote)}</div>` : ''}
        <div class="sets">${inputs}</div>
      </div>`;
    }).join('');
  }

  function readLog() {
    const log = {};
    document.querySelectorAll('#session-exercises input').forEach((el) => {
      const id = el.dataset.ex;
      log[id] = log[id] || [];
      log[id][Number(el.dataset.set)] = el.value === '' ? null : Number(el.value);
    });
    return log;
  }

  function renderProfile() {
    const f = $('#profile-form');
    for (const k of ['bodyMass', 'height', 'age', 'sex']) f.elements[k].value = state.profile[k] ?? '';
    const n = P.nutrition(state.profile);
    if (!n) { $('#nutrition').textContent = ''; return; }
    let txt = `BMI ${n.bmi}. Protein ${n.proteinLow}–${n.proteinHigh} g/day.`;
    txt += n.maintenance
      ? ` About ${n.maintenance} kcal maintains; about ${n.leanGain} kcal for slow muscle gain.`
      : ' Add age and sex for a calorie estimate.';
    $('#nutrition').textContent = txt;
  }

  function renderWeights() {
    const rows = [];
    const seen = new Set();
    for (const day of P.ROTATION) {
      for (const id of day.exercises) {
        if (seen.has(id)) continue;
        seen.add(id);
        const ex = P.EXERCISES[id];
        const lift = state.lifts[id];
        const range = `${ex.sets}×${ex.min + (lift.bonus || 0)}–${ex.max + (lift.bonus || 0)}${ex.unit === 'sec' ? 's' : ''}`;
        const cell = ex.increment
          ? `<input type="number" step="${ex.increment}" min="0" data-lift="${id}" value="${lift.weight}" class="${lift.source === 'estimate' ? 'estimate' : ''}">${ex.perHand ? ' <span class="muted">/hand</span>' : ''}`
          : '<span class="muted">reps/time</span>';
        rows.push(`<tr><td>${esc(ex.name)}</td><td>${range}</td><td>${cell}</td></tr>`);
      }
    }
    $('#weights tbody').innerHTML = rows.join('');
  }

  function renderVolume() {
    const vol = P.weeklyVolume();
    const max = Math.max(...Object.values(vol));
    $('#volume').innerHTML = Object.entries(vol).sort((a, b) => b[1] - a[1]).map(([g, n]) =>
      `<div class="bar"><span>${esc(g)}</span><span><span class="fill" style="width:${(n / max) * 100}%"></span></span><span>${n}</span></div>`
    ).join('');
  }

  function renderHistory() {
    if (!state.history.length) { $('#history').textContent = 'No sessions yet.'; return; }
    $('#history').innerHTML = state.history.slice(0, 12).map((h) =>
      `<details><summary>${esc(h.date)} · ${esc(h.name)}${h.deload ? ' (deload)' : ''}</summary><ul>` +
      h.outcomes.map((o) => `<li><span class="${o.change}">${esc(o.name)}</span>: ${esc(o.results.filter((r) => r != null).join(', ') || '—')} → ${esc(o.message)}</li>`).join('') +
      '</ul></details>'
    ).join('');
  }

  function renderOutcomes(outcomes) {
    const el = $('#outcomes');
    el.hidden = false;
    el.innerHTML = '<h3>Updated</h3><ul>' + outcomes.map((o) =>
      `<li class="${o.change}">${esc(o.name)}: ${esc(o.message)}</li>`).join('') + '</ul>';
  }

  function render() {
    renderSession(); renderProfile(); renderWeights(); renderVolume(); renderHistory();
  }

  $('#session-exercises').addEventListener('input', () => {
    state.draft = { index: state.sessionCount, log: readLog() };
    save();
  });

  $('#session-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const log = readLog();
    const empty = Object.values(log).every((sets) => sets.every((v) => v == null));
    if (empty && !confirm('Nothing logged. Skip this session and move on?')) return;
    const res = P.completeSession(state, log);
    state = res.state;
    delete state.draft;
    save();
    render();
    renderOutcomes(res.outcomes);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('#profile-form').addEventListener('submit', (e) => {
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

  $('#weights').addEventListener('change', (e) => {
    const id = e.target.dataset.lift;
    if (!id) return;
    state = P.setWeight(state, id, e.target.value);
    save();
    render();
  });

  $('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gym-plan-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      state = P.syncLifts(Object.assign(P.defaultState(), JSON.parse(await file.text())));
      save();
      render();
    } catch (err) {
      alert('That file could not be read as a Gym Plan backup.');
    }
    e.target.value = '';
  });

  $('#reset').addEventListener('click', () => {
    if (!confirm('Erase all weights and history?')) return;
    state = P.syncLifts(P.defaultState());
    save();
    render();
    $('#outcomes').hidden = true;
  });

  render();
})();
