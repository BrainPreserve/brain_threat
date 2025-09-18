/* BrainPreserve — Brain Threat Analysis (Option B)
   Dynamic category renderer (no whitelist) + per-category clearing + collapsed carets.
   Supports instrument types: demographics, bmi, yn_list, likert, radio, weighted_select, medications.
   Relies on assets/config.js for paths: CFG.paths.configJson and CFG.paths.masterCsv (CSV not used here directly).
*/
(function () {
  'use strict';

  // ---------------------------
  // CONFIG (read from assets/config.js)
  // ---------------------------
  if (!window.CFG || !CFG.paths || !CFG.paths.configJson) {
    console.error('CFG.paths.configJson is missing. Ensure assets/config.js sets CFG.paths.configJson.');
    return;
  }

  // Basic helpers
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $all = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const el = (tag, attrs = {}, html = '') => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') n.className = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else n.setAttribute(k, v);
    });
    if (html) n.innerHTML = html;
    return n;
  };

  // Carets
  const CARET_CLOSED = (window.BP_UI && BP_UI.caretClosed) || '▸';
  const CARET_OPEN   = (window.BP_UI && BP_UI.caretOpen)   || '▾';

  // Collapse everything at startup
  function collapseAllCats(root) {
    $all('details.bt-cat', root).forEach(d => d.removeAttribute('open'));
  }

  // Reset inputs inside a container
  function resetInputs(scope) {
    $all('input[type=radio], input[type=checkbox]', scope).forEach(i => (i.checked = false));
    $all('input[type=number], input[type=text]', scope).forEach(i => (i.value = ''));
    $all('select', scope).forEach(s => (s.value = ''));
  }

  // Emit section update (summary.js listens)
  function emitSectionUpdate(id, label, scoreObj) {
    try {
      window.dispatchEvent(new CustomEvent('bt:sectionUpdate', { detail: { id, label, ...(scoreObj || {}) } }));
    } catch (e) {
      // no-op
    }
  }

  // ---------------------------
  // RENDERERS PER INSTRUMENT TYPE
  // ---------------------------
  const R = {};

  // 1) DEMOGRAPHICS
  R.demographics = function (host, inst) {
    const wrap = el('div', { class: 'bt-inst' });
    // Sex
    const sexRow = el('div', { class: 'bt-row' });
    sexRow.appendChild(el('div', { class: 'bt-lbl' }, '<b>Sex</b>'));
    (inst.items?.find(i => i.key === 'sex')?.options || ['Female', 'Male', 'Other/Prefer not to say']).forEach(opt => {
      const id = 'sex_' + Math.random().toString(36).slice(2, 7);
      const lab = el('label', { class: 'bt-opt' });
      lab.appendChild(el('input', { type: 'radio', name: 'bp_sex', value: String(opt) }));
      lab.appendChild(document.createTextNode(' ' + String(opt)));
      sexRow.appendChild(lab);
    });
    wrap.appendChild(sexRow);

    // Age
    const ageRow = el('div', { class: 'bt-row' });
    ageRow.appendChild(el('label', { class: 'bt-lbl' }, '<b>Age (years)</b>'));
    ageRow.appendChild(el('input', { type: 'number', min: '18', max: '120', step: '1', 'data-out': 'age' }));
    wrap.appendChild(ageRow);

    host.appendChild(wrap);
  };

  // 2) BMI
  R.bmi = function (host, inst) {
    const wrap = el('div', { class: 'bt-inst' });

    const unitRow = el('div', { class: 'bt-row' });
    unitRow.appendChild(el('div', { class: 'bt-lbl' }, '<b>Units</b>'));
    ['US (lb, ft/in)', 'Metric (kg, m)'].forEach((label, idx) => {
      const lab = el('label', { class: 'bt-opt' });
      lab.appendChild(el('input', { type: 'radio', name: 'bp_units', value: idx === 0 ? 'US' : 'Metric', ...(idx === 0 ? { checked: 'checked' } : {}) }));
      lab.appendChild(document.createTextNode(' ' + label));
      unitRow.appendChild(lab);
    });
    wrap.appendChild(unitRow);

    // US fields
    const us = el('div', { class: 'bt-row', 'data-us': '1' });
    us.appendChild(el('span', { class: 'bt-lbl' }, '<b>US</b>'));
    us.appendChild(el('input', { type: 'number', placeholder: 'Height (ft)', min: '3', max: '8', step: '1', 'data-id': 'height-ft' }));
    us.appendChild(el('input', { type: 'number', placeholder: 'Height (in)', min: '0', max: '11', step: '1', 'data-id': 'height-in' }));
    us.appendChild(el('input', { type: 'number', placeholder: 'Weight (lb)', min: '50', max: '600', step: '1', 'data-id': 'weight-lb' }));
    wrap.appendChild(us);

    // Metric fields
    const met = el('div', { class: 'bt-row', 'data-metric': '1', style: 'display:none' });
    met.appendChild(el('span', { class: 'bt-lbl' }, '<b>Metric</b>'));
    met.appendChild(el('input', { type: 'number', placeholder: 'Height (m)', step: '0.01', min: '1.0', max: '2.5', 'data-id': 'height-m' }));
    met.appendChild(el('input', { type: 'number', placeholder: 'Weight (kg)', step: '0.1', min: '30', max: '250', 'data-id': 'weight-kg' }));
    wrap.appendChild(met);

    // Mini outputs
    const outs = el('div', { class: 'bt-mini' }, `
      <span class="bt-badge">BMI <span data-out="bmi-val">—</span></span>
      <span class="bt-badge">Tier <span data-out="bmi-tier">—</span></span>
    `);
    wrap.appendChild(outs);

    // Wire units toggle + BMI calc
    wrap.addEventListener('input', () => {
      const units = $('input[name="bp_units"]:checked', wrap)?.value || 'US';
      $('[data-us]', wrap).style.display = units === 'US' ? '' : 'none';
      $('[data-metric]', wrap).style.display = units === 'Metric' ? '' : 'none';

      // compute BMI if possible
      let bmi = null;
      if (units === 'US') {
        const ft = parseFloat($('[data-id="height-ft"]', wrap)?.value || '');
        const inch = parseFloat($('[data-id="height-in"]', wrap)?.value || '');
        const lb = parseFloat($('[data-id="weight-lb"]', wrap)?.value || '');
        if (ft > 0 && inch >= 0 && lb > 0) {
          const m = (ft * 12 + inch) * 0.0254;
          const kg = lb * 0.45359237;
          bmi = kg / (m * m);
        }
      } else {
        const m = parseFloat($('[data-id="height-m"]', wrap)?.value || '');
        const kg = parseFloat($('[data-id="weight-kg"]', wrap)?.value || '');
        if (m > 0 && kg > 0) bmi = kg / (m * m);
      }
      const setOut = (k, v) => { const t = $(`[data-out="${k}"]`, wrap); if (t) t.textContent = v; };
      setOut('bmi-val', bmi ? bmi.toFixed(1) : '—');

      // Tier from config bands if provided
      const band = (x, bands) => {
        if (!bands) return '—';
        for (const b of bands) if (x >= b.min && x <= b.max) return b.label;
        return '—';
      };
      const bmiBands = inst?.bands?.bmi;
      setOut('bmi-tier', bmi ? band(bmi, bmiBands) : '—');

      emitSectionUpdate('personal', 'Personal Assessment', { bmi: bmi ? +bmi.toFixed(1) : null });
    });

    host.appendChild(wrap);
  };

  // 3) Y/N LIST (history or activity)
  R.yn_list = function (host, inst) {
    const grid = el('div', { class: 'bt-grid' });
    (inst.items || []).forEach(it => {
      const card = el('div', { class: 'bt-card' });
      card.innerHTML = `
        <div class="bt-lbl" style="font-weight:600;margin-bottom:6px">${it.label}</div>
        <label class="bt-opt"><input type="radio" name="yn_${it.key}" value="Yes"> Yes</label>
        <label class="bt-opt"><input type="radio" name="yn_${it.key}" value="No"> No</label>
        <div class="bt-note">${it.yesTier ? `Yes → ${it.yesTier} risk.` : it.noTier ? `No → ${it.noTier} risk.` : ''}</div>
      `;
      grid.appendChild(card);
    });
    host.appendChild(grid);
  };

  // 4) LIKERT (score = sum; optional reverseKeys)
  R.likert = function (host, inst) {
    const SCALE = inst.options || [
      { label: 'Never', value: 0 },
      { label: 'Rarely', value: 1 },
      { label: 'Sometimes', value: 2 },
      { label: 'Often', value: 3 },
      { label: 'Always', value: 4 }
    ];
    (inst.items || []).forEach(q => {
      const row = el('div', { class: 'bt-row' });
      row.appendChild(el('div', { class: 'bt-lbl' }, `<b>${q.label}</b>`));
      SCALE.forEach(opt => {
        const lab = el('label', { class: 'bt-opt' });
        lab.appendChild(el('input', { type: 'radio', name: inst.id + '_' + q.key, value: String(opt.value) }));
        lab.appendChild(document.createTextNode(' ' + opt.label));
        row.appendChild(lab);
      });
      host.appendChild(row);
    });

    // Score summary line (optional visual)
    const sumLine = el('div', { class: 'bt-mini' }, `<span class="bt-badge"><span data-out="${inst.id}-score">0</span></span>`);
    host.appendChild(sumLine);

    host.addEventListener('input', () => {
      const rev = new Set(inst.reverseKeys || []);
      let sum = 0;
      (inst.items || []).forEach(q => {
        const val = parseInt($(`input[name="${inst.id}_${q.key}"]:checked`, host)?.value || '', 10);
        if (!isNaN(val)) sum += rev.has(q.key) ? (4 - val) : val;
      });
      const out = $(`[data-out="${inst.id}-score"]`, host);
      if (out) out.textContent = String(sum);
      emitSectionUpdate(inst.id, inst.title, { score: sum });
    });
  };

  // 5) RADIO (N items share same scale defined in options)
  R.radio = function (host, inst) {
    const SCALE = inst.options || [];
    (inst.items || []).forEach(q => {
      const row = el('div', { class: 'bt-row' });
      row.appendChild(el('div', { class: 'bt-lbl' }, `<b>${q.label}</b>`));
      (q.options || SCALE).forEach(opt => {
        const lab = el('label', { class: 'bt-opt' });
        lab.appendChild(el('input', { type: 'radio', name: inst.id + '_' + q.key, value: String(opt.value) }));
        lab.appendChild(document.createTextNode(' ' + opt.label));
        row.appendChild(lab);
      });
      host.appendChild(row);
    });
  };

  // 6) WEIGHTED SELECT (0–3 frequency × per-item weight)
  R.weighted_select = function (host, inst) {
    const SCALE = inst.scale || [
      { label: 'Never (0)', value: 0 },
      { label: 'Occasionally (1)', value: 1 },
      { label: 'Regularly (2)', value: 2 },
      { label: 'Frequently (3)', value: 3 }
    ];
    (inst.items || []).forEach(it => {
      const row = el('div', { class: 'bt-row' });
      row.appendChild(el('div', { class: 'bt-lbl' }, `<b>${it.label}</b> <span class="bt-note">(weight ${it.weight || 1})</span>`));
      const sel = el('select', { 'data-weight': String(it.weight || 1), 'data-key': it.key, class: 'bt-sel' });
      sel.appendChild(el('option', { value: '' }, 'Choose Your Answer'));
      SCALE.forEach(opt => sel.appendChild(el('option', { value: String(opt.value) }, opt.label)));
      row.appendChild(sel);
      host.appendChild(row);
    });

    // Live score (percent of max) for summary.js
    function compute() {
      const selects = $all('select.bt-sel', host);
      let score = 0, max = 0;
      selects.forEach(sel => {
        const w = Number(sel.getAttribute('data-weight') || 1);
        const v = Number(sel.value || 0);
        score += v * w;
        max += 3 * w;
      });
      const pct = max ? Math.round((score / max) * 100) : 0;
      emitSectionUpdate(inst.id, inst.title, { score: Math.round(score), max: Math.round(max), pct });
    }
    host.addEventListener('change', compute);
    compute();
  };

  // 7) MEDICATIONS (class → meds; statusOptions 0/1/2; current use drives risk)
  R.medications = function (host, inst) {
    const classes = inst.classes || [];
    const statuses = inst.statusOptions || [
      { label: 'No / Never used', value: 0 },
      { label: 'Taken in the past', value: 1 },
      { label: 'Currently taking', value: 2 }
    ];

    classes.forEach(cls => {
      const block = el('div', { class: 'bt-card' });
      block.innerHTML = `<div class="bt-lbl" style="font-weight:700;margin-bottom:8px">${cls.class}</div>`;
      (cls.meds || []).forEach(m => {
        const row = el('div', { class: 'bt-row' });
        row.appendChild(el('span', { class: 'bt-badge' }, m));
        statuses.forEach(s => {
          const lab = el('label', { class: 'bt-opt' });
          lab.appendChild(el('input', { type: 'radio', name: `med_${cls.class}_${m}`, value: String(s.value) }));
          lab.appendChild(document.createTextNode(' ' + s.label));
          row.appendChild(lab);
        });
        block.appendChild(row);
      });
      host.appendChild(block);
    });

    function compute() {
      // Simple composite: sum baseRisk for “currently taking” (value==2)
      let score = 0, current = 0;
      classes.forEach(cls => {
        (cls.meds || []).forEach(m => {
          const v = Number($(`input[name="med_${cls.class}_${m}"]:checked`, host)?.value || 0);
          if (v === 2) { score += (cls.baseRisk || 1); current++; }
        });
      });
      emitSectionUpdate(inst.id, inst.title, { score, current });
    }
    host.addEventListener('change', compute);
    compute();
  };

  // ---------------------------
  // CATEGORY RENDERER
  // ---------------------------
  function renderCategory(container, cat) {
    // details shell
    const details = el('details', { class: 'bt-cat' }); // start collapsed (no open attr)
    const sum = el('summary', { class: 'bt-sum' });
    const caret = el('span', { class: 'bt-caret' }, CARET_CLOSED);
    const title = el('span', { class: 'bt-title' }, ' ' + (cat.title || cat.id));
    sum.appendChild(caret);
    sum.appendChild(title);
    details.appendChild(sum);

    const body = el('div', { class: 'bt-body' });
    if (cat.note) body.appendChild(el('div', { class: 'bt-note' }, cat.note));

    // instruments
    (cat.instruments || []).forEach(inst => {
      const instWrap = el('div', { class: 'bt-inst-wrap' });
      instWrap.appendChild(el('div', { class: 'bt-inst-title' }, `<b>${inst.title || inst.id}</b>`));
      const mount = el('div', { class: 'bt-inst-mount' });
      instWrap.appendChild(mount);

      const fn = R[inst.type];
      if (typeof fn === 'function') {
        fn(mount, inst);
      } else {
        mount.appendChild(el('div', { class: 'bt-note' }, `Unsupported instrument type: ${inst.type}`));
      }
      body.appendChild(instWrap);
    });

    // Per-category clear button
    const clearLbl = cat.clearLabel || (window.CFG && CFG.ui && CFG.ui.categoryClearLabel) || 'Clear This Section';
    const btnRow = el('div', { class: 'bt-btnrow' });
    const clr = el('button', { type: 'button', class: 'bt-btn bt-btn-clear' }, clearLbl);
    btnRow.appendChild(clr);
    body.appendChild(btnRow);

    clr.addEventListener('click', () => {
      resetInputs(body);
      details.removeAttribute('open'); // re-collapse
      emitSectionUpdate(cat.id, cat.title, { cleared: true });
    });

    // caret toggle
    details.addEventListener('toggle', () => {
      const isOpen = details.open;
      caret.textContent = isOpen ? CARET_OPEN : CARET_CLOSED;
    });

    details.appendChild(body);
    container.appendChild(details);
  }

  // Build nav pills dynamically
  function renderTopNav(navHost, cats) {
    if (!navHost) return;
    navHost.innerHTML = ''; // clear existing
    cats.forEach(cat => {
      const b = el('button', { type: 'button', class: 'bt-pill' }, cat.title || cat.id);
      b.addEventListener('click', () => {
        const elCat = $(`details.bt-cat[data-id="${cat.id}"]`);
        if (elCat) { elCat.setAttribute('open', 'open'); elCat.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
      navHost.appendChild(b);
    });
    // Add Summary pill if a summary card exists
    const summaryEl = $('[data-role="summary-card"]') || $('.summary-card');
    if (summaryEl) {
      const sb = el('button', { type: 'button', class: 'bt-pill' }, 'Summary');
      sb.addEventListener('click', () => summaryEl.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      navHost.appendChild(sb);
    }
  }

  // Global clear form button wiring (if present in page under summary)
  function wireGlobalClear() {
    const btn = document.querySelector('[data-action="reset"], .bp-btn[data-action="reset"]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      $all('details.bt-cat').forEach(d => {
        resetInputs(d);
        d.removeAttribute('open');
      });
    });
  }

  // ---------------------------
  // MAIN
  // ---------------------------
  async function main() {
    // Fetch JSON config
    const res = await fetch(CFG.paths.configJson, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load instruments config: ' + res.status);
    const cfg = await res.json();

    // Targets
    const mount = document.getElementById('bt-app') || document.body; // fallback
    const catHost = $('#bt-categories', mount) || mount; // where cards go
    const navHost = $('#bt-topnav') || document.querySelector('.bt-topnav');

    // Render all categories present in JSON (no whitelist)
    catHost.innerHTML = '';
    (cfg.categories || []).forEach(cat => {
      // add data-id to enable nav scroll
      const container = el('div', { });
      renderCategory(container, cat);
      const card = container.firstElementChild;
      card.setAttribute('data-id', cat.id);
      catHost.appendChild(card);
    });

    // Top nav
    renderTopNav(navHost, cfg.categories || []);

    // Start collapsed
    collapseAllCats(catHost);

    // Global clear
    wireGlobalClear();
  }

  // Kick off
  document.addEventListener('DOMContentLoaded', () => {
    main().catch(err => {
      console.error(err);
      alert('Failed to initialize app. Open console for details.');
    });
  });

  // ---------------------------
  // Minimal styles (only if your page doesn’t already include them)
  // ---------------------------
  const css = `
  .bt-topnav{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 16px}
  .bt-pill{border:1px solid #e5e7eb;background:#f8fafc;padding:6px 12px;border-radius:999px;font-weight:600;cursor:pointer}
  .bt-cat{border:1px solid #e5e7eb;border-radius:14px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.04);margin:12px 0}
  .bt-cat > summary{list-style:none;display:flex;gap:8px;align-items:center;padding:12px 14px;cursor:pointer;font-weight:700}
  .bt-cat > summary::-webkit-details-marker{display:none}
  .bt-body{padding:12px 14px}
  .bt-caret{display:inline-block;width:1em;text-align:center}
  .bt-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px 0}
  .bt-opt{display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;cursor:pointer}
  .bt-lbl{min-width:220px}
  .bt-badge{display:inline-block;padding:3px 8px;border-radius:9999px;border:1px solid #e5e7eb;background:#f9fafb}
  .bt-note{color:#6b7280;font-size:.9rem;margin:4px 0 8px}
  .bt-mini{display:flex;gap:10px;margin:8px 0}
  .bt-btnrow{margin-top:8px}
  .bt-btn{background:#111827;color:#fff;border:none;border-radius:9999px;padding:8px 12px;font-weight:600;cursor:pointer}
  `;
  const styleTag = el('style'); styleTag.textContent = css; document.head.appendChild(styleTag);
})();
