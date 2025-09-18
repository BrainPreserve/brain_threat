/* BrainPreserve — Brain Threat Analysis (Option B)
   STRICT CSV binding + helper/brand injection + sensory sub-wrappers + deterministic collapse.
   Columns used (must exist in data/master.csv): item_key, threat, brand_name
*/
(function () {
  'use strict';

  // ---------------- Core guards ----------------
  if (!window.CFG || !CFG.paths || !CFG.paths.configJson || !CFG.paths.masterCsv) {
    console.error('CFG missing. Ensure assets/config.js sets CFG.paths.configJson and CFG.paths.masterCsv.');
    return;
  }

  // ---------------- DOM helpers ----------------
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $all = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const el = (tag, attrs = {}, html = '') => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else n.setAttribute(k, v);
    }
    if (html) n.innerHTML = html;
    return n;
  };
  const CARET_CLOSED = (CFG.ui && CFG.ui.caretClosed) || '▸';
  const CARET_OPEN   = (CFG.ui && CFG.ui.caretOpen)   || '▾';

  function banner(msg) {
    const box = $('#bt-categories') || document.body;
    const d = el('div', { style: 'margin:12px 0;padding:12px;border:1px solid #ef4444;background:#fff1f2;color:#991b1b;border-radius:10px' });
    d.textContent = msg;
    box.prepend(d);
  }
  function resetInputs(scope) {
    $all('input[type=radio],input[type=checkbox]', scope).forEach(i => (i.checked = false));
    $all('input[type=number],input[type=text]', scope).forEach(i => (i.value = ''));
    $all('select', scope).forEach(s => (s.value = ''));
  }
  function emitSectionUpdate(id, label, scoreObj) {
    try { window.dispatchEvent(new CustomEvent('bt:sectionUpdate', { detail: { id, label, ...(scoreObj || {}) } })); } catch (e) {}
  }

  // ---------------- CSV loader (strict schema) ----------------
  async function loadCsvStrict(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('CSV HTTP ' + res.status);
    const text = (await res.text()).replace(/\r/g, '');
    const lines = text.split('\n').filter(x => x.trim().length);
    if (!lines.length) throw new Error('CSV empty');
    const hdr = lines[0].split(',').map(h => h.trim());
    const idx = Object.fromEntries(hdr.map((h, i) => [h, i]));
    // Schema check
    const required = ['item_key', 'threat', 'brand_name'];
    const missing = required.filter(c => !(c in idx));
    if (missing.length) {
      banner('CSV schema mismatch: missing columns ' + missing.join(', ') + ' in data/master.csv');
      return { rows: [], threatByKey: {}, brandByKey: {} };
    }
    const rows = lines.slice(1).map(line => {
      const cells = line.split(',');
      return {
        item_key: (cells[idx['item_key']] || '').trim(),
        threat: (cells[idx['threat']] || '').trim(),
        brand_name: (cells[idx['brand_name']] || '').trim()
      };
    });
    // Lookups (case-insensitive by item_key)
    const threatByKey = {};
    const brandByKey = {};
    rows.forEach(r => {
      const k = r.item_key.toLowerCase();
      if (k) {
        if (r.threat) threatByKey[k] = r.threat;
        if (r.brand_name) brandByKey[k] = r.brand_name;
      }
    });
    return { rows, threatByKey, brandByKey };
  }

  // ---------------- Label augmentation ----------------
  function withThreat(baseLabel, csvKey, look) {
    const t = look.threatByKey[String(csvKey || '').toLowerCase()];
    return t ? `${baseLabel} — ${t}` : baseLabel;
  }
  function withBrand(genericOrKey, look) {
    const b = look.brandByKey[String(genericOrKey || '').toLowerCase()];
    return b ? `${genericOrKey} (${b})` : genericOrKey;
  }

  // ---------------- Instrument renderers ----------------
  const R = {};

  R.demographics = function (host, inst) {
    const wrap = el('div', { class: 'bt-inst' });
    // Sex
    const sexRow = el('div', { class: 'bt-row' });
    sexRow.appendChild(el('div', { class: 'bt-lbl' }, '<b>Sex</b>'));
    (inst.items?.find(i => i.key === 'sex')?.options || ['Female','Male','Other/Prefer not to say']).forEach(opt => {
      const lab = el('label', { class: 'bt-opt' });
      lab.appendChild(el('input', { type: 'radio', name: 'bp_sex', value: String(opt) }));
      lab.appendChild(document.createTextNode(' ' + String(opt)));
      sexRow.appendChild(lab);
    });
    wrap.appendChild(sexRow);
    // Age
    const ageRow = el('div', { class: 'bt-row' });
    ageRow.appendChild(el('label', { class: 'bt-lbl' }, '<b>Age (years)</b>'));
    ageRow.appendChild(el('input', { type: 'number', min: '18', max: '120', step: '1' }));
    wrap.appendChild(ageRow);
    host.appendChild(wrap);
  };

  R.bmi = function (host, inst) {
    const wrap = el('div', { class: 'bt-inst' });
    const unitRow = el('div', { class: 'bt-row' });
    unitRow.appendChild(el('div', { class: 'bt-lbl' }, '<b>Units</b>'));
    ['US (lb, ft/in)', 'Metric (kg, m)'].forEach((label, i) => {
      const lab = el('label', { class: 'bt-opt' });
      lab.appendChild(el('input', { type: 'radio', name: 'bp_units', value: i ? 'Metric' : 'US', ...(i ? {} : { checked: 'checked' }) }));
      lab.appendChild(document.createTextNode(' ' + label));
      unitRow.appendChild(lab);
    });
    wrap.appendChild(unitRow);

    const us = el('div', { class: 'bt-row', 'data-us': '1' });
    us.appendChild(el('span', { class: 'bt-lbl' }, '<b>US</b>'));
    us.appendChild(el('input', { type: 'number', placeholder: 'Height (ft)', min: '3', max: '8', step: '1', 'data-id': 'height-ft' }));
    us.appendChild(el('input', { type: 'number', placeholder: 'Height (in)', min: '0', max: '11', step: '1', 'data-id': 'height-in' }));
    us.appendChild(el('input', { type: 'number', placeholder: 'Weight (lb)', min: '50', max: '600', step: '1', 'data-id': 'weight-lb' }));
    wrap.appendChild(us);

    const met = el('div', { class: 'bt-row', 'data-metric': '1', style: 'display:none' });
    met.appendChild(el('span', { class: 'bt-lbl' }, '<b>Metric</b>'));
    met.appendChild(el('input', { type: 'number', placeholder: 'Height (m)', step: '0.01', min: '1.0', max: '2.5', 'data-id': 'height-m' }));
    met.appendChild(el('input', { type: 'number', placeholder: 'Weight (kg)', step: '0.1', min: '30', max: '250', 'data-id': 'weight-kg' }));
    wrap.appendChild(met);

    const outs = el('div', { class: 'bt-mini' }, `
      <span class="bt-badge">BMI <span data-out="bmi-val">—</span></span>
      <span class="bt-badge">Tier <span data-out="bmi-tier">—</span></span>
    `);
    wrap.appendChild(outs);

    wrap.addEventListener('input', () => {
      const units = $('input[name="bp_units"]:checked', wrap)?.value || 'US';
      $('[data-us]', wrap).style.display = units === 'US' ? '' : 'none';
      $('[data-metric]', wrap).style.display = units === 'Metric' ? '' : 'none';

      let bmi = null;
      if (units === 'US') {
        const ft = parseFloat($('[data-id="height-ft"]', wrap)?.value || '');
        const inch = parseFloat($('[data-id="height-in"]', wrap)?.value || '');
        const lb = parseFloat($('[data-id="weight-lb"]', wrap)?.value || '');
        if (ft > 0 && inch >= 0 && lb > 0) {
          const m = (ft * 12 + inch) * 0.0254; const kg = lb * 0.45359237; bmi = kg / (m * m);
        }
      } else {
        const m = parseFloat($('[data-id="height-m"]', wrap)?.value || '');
        const kg = parseFloat($('[data-id="weight-kg"]', wrap)?.value || '');
        if (m > 0 && kg > 0) bmi = kg / (m * m);
      }
      const setOut = (k, v) => { const t = $(`[data-out="${k}"]`, wrap); if (t) t.textContent = v; };
      setOut('bmi-val', bmi ? bmi.toFixed(1) : '—');

      const band = (x, bands) => bands ? (bands.find(b => x >= b.min && x <= b.max)?.label || '—') : '—';
      setOut('bmi-tier', bmi ? band(bmi, inst?.bands?.bmi) : '—');
      emitSectionUpdate('personal', 'Personal Assessment', { bmi: bmi ? +bmi.toFixed(1) : null });
    });

    host.appendChild(wrap);
  };

  R.yn_list = function (host, inst, look) {
    const grid = el('div', { class: 'bt-grid' });
    (inst.items || []).forEach(it => {
      const show = withThreat(it.label, (it.csvKey || it.key), look);
      const card = el('div', { class: 'bt-card' });
      card.innerHTML = `
        <div class="bt-lbl" style="font-weight:600;margin-bottom:6px">${show}</div>
        <label class="bt-opt"><input type="radio" name="yn_${it.key}" value="Yes"> Yes</label>
        <label class="bt-opt"><input type="radio" name="yn_${it.key}" value="No"> No</label>
        <div class="bt-note">${it.yesTier ? `Yes → ${it.yesTier} risk.` : it.noTier ? `No → ${it.noTier} risk.` : ''}</div>
      `;
      grid.appendChild(card);
    });
    host.appendChild(grid);
  };

  R.likert = function (host, inst) {
    const SCALE = inst.options || [
      { label: 'Never', value: 0 }, { label: 'Rarely', value: 1 }, { label: 'Sometimes', value: 2 },
      { label: 'Often', value: 3 }, { label: 'Always', value: 4 }
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
  };

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

  R.weighted_select = function (host, inst, look) {
    const SCALE = inst.scale || [
      { label: 'Never (0)', value: 0 }, { label: 'Occasionally (1)', value: 1 },
      { label: 'Regularly (2)', value: 2 }, { label: 'Frequently (3)', value: 3 }
    ];
    (inst.items || []).forEach(it => {
      const shown = withThreat(it.label, (it.csvKey || it.key), look);
      const row = el('div', { class: 'bt-row' });
      row.appendChild(el('div', { class: 'bt-lbl' }, `<b>${shown}</b> <span class="bt-note">(weight ${it.weight || 1})</span>`));
      const sel = el('select', { 'data-weight': String(it.weight || 1), 'data-key': it.key, class: 'bt-sel' });
      sel.appendChild(el('option', { value: '' }, 'Choose Your Answer'));
      SCALE.forEach(opt => sel.appendChild(el('option', { value: String(opt.value) }, opt.label)));
      row.appendChild(sel);
      host.appendChild(row);
    });

    function compute() {
      const selects = $all('select.bt-sel', host);
      let score = 0, max = 0;
      selects.forEach(sel => { const w = +sel.getAttribute('data-weight') || 1; const v = +(sel.value || 0); score += v * w; max += 3 * w; });
      const pct = max ? Math.round((score / max) * 100) : 0;
      emitSectionUpdate(inst.id, inst.title, { score: Math.round(score), max: Math.round(max), pct });
    }
    host.addEventListener('change', compute);
    compute();
  };

  R.medications = function (host, inst, look) {
    const classes = inst.classes || [];
    const statuses = inst.statusOptions || [
      { label: 'No / Never used', value: 0 }, { label: 'Taken in the past', value: 1 }, { label: 'Currently taking', value: 2 }
    ];
    classes.forEach(cls => {
      const block = el('div', { class: 'bt-card' });
      block.innerHTML = `<div class="bt-lbl" style="font-weight:700;margin-bottom:8px">${cls.class}</div>`;
      (cls.meds || []).forEach(key => {
        const display = withBrand(key, look);
        const row = el('div', { class: 'bt-row' });
        row.appendChild(el('span', { class: 'bt-badge' }, display));
        statuses.forEach(s => {
          const lab = el('label', { class: 'bt-opt' });
          lab.appendChild(el('input', { type: 'radio', name: `med_${cls.class}_${key}`, value: String(s.value) }));
          lab.appendChild(document.createTextNode(' ' + s.label));
          row.appendChild(lab);
        });
        block.appendChild(row);
      });
      host.appendChild(block);
    });

    function compute() {
      let score = 0, current = 0;
      classes.forEach(cls => {
        (cls.meds || []).forEach(key => {
          const v = Number($(`input[name="med_${cls.class}_${key}"]:checked`, host)?.value || 0);
          if (v === 2) { score += (cls.baseRisk || 1); current++; }
        });
      });
      emitSectionUpdate(inst.id, inst.title, { score, current });
    }
    host.addEventListener('change', compute);
    compute();
  };

  // ---------------- Sensory wrapper (two sub-accordions) ----------------
  function renderSensory(host, cat, look) {
    // HHIE-S
    const d1 = el('details', { class: 'bt-sub' }); // collapsed by default
    const s1 = el('summary', { class: 'bt-sum' }); s1.appendChild(el('span', { class: 'bt-caret' }, CARET_CLOSED)); s1.appendChild(el('span', {}, ' Hearing (HHIE-S)'));
    d1.appendChild(s1);
    const b1 = el('div', { class: 'bt-body' });
    const instH = cat.instruments.find(i => i.id === 'hhies');
    if (instH) R.radio(b1, instH);
    d1.addEventListener('toggle', () => { s1.firstChild.textContent = d1.open ? CARET_OPEN : CARET_CLOSED; });
    host.appendChild(d1);

    // VFQ-3of7
    const d2 = el('details', { class: 'bt-sub' });
    const s2 = el('summary', { class: 'bt-sum' }); s2.appendChild(el('span', { class: 'bt-caret' }, CARET_CLOSED)); s2.appendChild(el('span', {}, ' Vision (VFQ-3of7)'));
    d2.appendChild(s2);
    const b2 = el('div', { class: 'bt-body' });
    const instV = cat.instruments.find(i => i.id === 'vfq3of7');
    if (instV) R.radio(b2, instV);
    d2.addEventListener('toggle', () => { s2.firstChild.textContent = d2.open ? CARET_OPEN : CARET_CLOSED; });
    host.appendChild(d2);
  }

  // ---------------- Category renderer ----------------
  function renderCategory(container, cat, look) {
    const details = el('details', { class: 'bt-cat' }); // collapsed (no open attr)
    const sum = el('summary', { class: 'bt-sum' });
    const caret = el('span', { class: 'bt-caret' }, CARET_CLOSED);
    sum.appendChild(caret);
    sum.appendChild(el('span', { class: 'bt-title' }, ' ' + (cat.title || cat.id)));
    details.appendChild(sum);
    const body = el('div', { class: 'bt-body' });
    if (cat.note) body.appendChild(el('div', { class: 'bt-note' }, cat.note));

    // Sensory special-case: split into two sub-accordions
    if (cat.id === 'sensory') {
      renderSensory(body, cat, look);
    } else {
      (cat.instruments || []).forEach(inst => {
        const instWrap = el('div', { class: 'bt-inst-wrap' });
        instWrap.appendChild(el('div', { class: 'bt-inst-title' }, `<b>${inst.title || inst.id}</b>`));
        const mount = el('div', { class: 'bt-inst-mount' });
        instWrap.appendChild(mount);
        const fn = R[inst.type];
        if (typeof fn === 'function') fn(mount, inst, look);
        else mount.appendChild(el('div', { class: 'bt-note' }, `Unsupported instrument type: ${inst.type}`));
        body.appendChild(instWrap);
      });
    }

    const btnRow = el('div', { class: 'bt-btnrow' });
    const clearLbl = cat.clearLabel || (CFG.ui && CFG.ui.categoryClearLabel) || 'Clear This Section';
    const clr = el('button', { type: 'button', class: 'bt-btn bt-btn-clear' }, clearLbl);
    btnRow.appendChild(clr);
    clr.addEventListener('click', () => { resetInputs(body); details.removeAttribute('open'); emitSectionUpdate(cat.id, cat.title, { cleared: true }); });
    body.appendChild(btnRow);

    details.addEventListener('toggle', () => { caret.textContent = details.open ? CARET_OPEN : CARET_CLOSED; });
    details.appendChild(body);
    container.appendChild(details);
  }

  function renderTopNav(navHost, cats) {
    if (!navHost) return;
    navHost.innerHTML = '';
    cats.forEach(cat => {
      const b = el('button', { type: 'button', class: 'bt-pill' }, cat.title || cat.id);
      b.addEventListener('click', () => {
        const elCat = document.querySelector(`details.bt-cat[data-id="${cat.id}"]`);
        if (elCat) { elCat.setAttribute('open', 'open'); elCat.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
      navHost.appendChild(b);
    });
    const summaryEl = $('[data-role="summary-card"]') || $('.summary-card');
    if (summaryEl) {
      const sb = el('button', { type: 'button', class: 'bt-pill' }, 'Summary');
      sb.addEventListener('click', () => summaryEl.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      navHost.appendChild(sb);
    }
  }

  function collapseAllCats(root) { $all('details.bt-cat', root).forEach(d => d.removeAttribute('open')); }
  function wireGlobalClear() {
    const btn = document.querySelector('[data-action="reset"], .bp-btn[data-action="reset"]');
    if (!btn) return;
    btn.addEventListener('click', () => { $all('details.bt-cat').forEach(d => { resetInputs(d); d.removeAttribute('open'); }); });
  }

  // ---------------- Main ----------------
  async function main() {
    const [cfgRes, csvLook] = await Promise.all([
      fetch(CFG.paths.configJson, { cache: 'no-store' }),
      loadCsvStrict(CFG.paths.masterCsv)
    ]);
    if (!cfgRes.ok) throw new Error('JSON HTTP ' + cfgRes.status);
    const cfg = await cfgRes.json();

    const mount = $('#bt-categories') || document.body;
    const navHost = $('#bt-topnav') || document.querySelector('.bt-topnav');

    mount.innerHTML = '';
    (cfg.categories || []).forEach(cat => {
      const tmp = el('div');
      renderCategory(tmp, cat, csvLook);
      const card = tmp.firstElementChild;
      card.setAttribute('data-id', cat.id);
      mount.appendChild(card);
    });

    renderTopNav(navHost, cfg.categories || []);
    collapseAllCats(mount);
    wireGlobalClear();

    // Minimal styles for sub-accordions (sensory)
    const css = `
      .bt-sub{border:1px solid #e5e7eb;border-radius:10px;background:#fff;margin:10px 0}
      .bt-sub>summary{list-style:none;display:flex;gap:8px;align-items:center;padding:10px 12px;cursor:pointer;font-weight:600}
      .bt-sub>summary::-webkit-details-marker{display:none}
    `;
    const st = el('style'); st.textContent = css; document.head.appendChild(st);
  }

  document.addEventListener('DOMContentLoaded', () => {
    main().catch(err => { console.error(err); banner('Initialization failed. See console for details.'); });
  });
})();
