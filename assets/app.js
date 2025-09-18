/* BrainPreserve — Brain Threat Analysis (Option B)
   Dynamic renderer + CSV augmentation (threat text and medication brand names).
   Supports: demographics, bmi, yn_list, likert, radio, weighted_select, medications.
*/
(function () {
  'use strict';

  // ---------- Guards ----------
  if (!window.CFG || !CFG.paths || !CFG.paths.configJson) {
    console.error('CFG.paths.configJson missing (assets/config.js).');
    return;
  }

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

  const CARET_CLOSED = (window.BP_UI && BP_UI.caretClosed) || '▸';
  const CARET_OPEN   = (window.BP_UI && BP_UI.caretOpen)   || '▾';

  function resetInputs(scope) {
    $all('input[type=radio],input[type=checkbox]', scope).forEach(i => (i.checked = false));
    $all('input[type=number],input[type=text]', scope).forEach(i => (i.value = ''));
    $all('select', scope).forEach(s => (s.value = ''));
  }
  function emitSectionUpdate(id, label, scoreObj) {
    try { window.dispatchEvent(new CustomEvent('bt:sectionUpdate', { detail: { id, label, ...(scoreObj || {}) } })); }
    catch (e) {}
  }

  // ---------- CSV loader (master.csv) ----------
  async function loadCsv(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed CSV: ' + res.status + ' ' + path);
    const text = await res.text();

    // Simple CSV parse (no quotes-in-quotes edge cases expected in keys/brands/threat)
    const lines = text.replace(/\r/g, '').split('\n').filter(x => x.trim().length);
    const hdr = lines.shift().split(',').map(h => h.trim());
    const H = Object.fromEntries(hdr.map((h, i) => [h.toLowerCase(), i]));

    const rows = lines.map(line => {
      const cells = line.split(','); // your master.csv keys/brand/threat columns are simple text
      const o = {};
      Object.entries(H).forEach(([k, idx]) => { o[k] = (cells[idx] || '').trim(); });
      return o;
    });

    return { hdr: H, rows };
  }

  function buildLookups(csv) {
    const H = csv.hdr;
    // Flexible header detection (case-insensitive, accepts variants)
    const keyCol    = H['item_key'] ?? H['key'] ?? H['id'] ?? -1;
    const threatCol = H['threat'] ?? H['example'] ?? H['human_text'] ?? -1;
    const brandCol  = H['brand'] ?? H['brand_name'] ?? H['brand_names'] ?? -1;
    const genericCol= H['generic'] ?? H['med'] ?? H['medication'] ?? -1;

    const threatByKey = {};
    const brandByGeneric = {};

    csv.rows.forEach(r => {
      // threats (for exposure/foods/toxins list items)
      if (keyCol >= 0) {
        const k = (r[Object.keys(H)[keyCol]] || r['item_key'] || r['key'] || r['id'] || '').toString().trim().toLowerCase();
        if (k && threatCol >= 0) {
          const t = r[Object.keys(H)[threatCol]] || '';
          if (t) threatByKey[k] = t;
        }
      }
      // meds brand names
      const g = genericCol >= 0 ? (r[Object.keys(H)[genericCol]] || '').toString().trim().toLowerCase() : '';
      if (g && brandCol >= 0) {
        const b = r[Object.keys(H)[brandCol]] || '';
        if (b) brandByGeneric[g] = b;
      }
    });

    return { threatByKey, brandByGeneric };
  }

  // ---------- Renderers ----------
  const R = {};

  R.demographics = function (host, inst) {
    const wrap = el('div', { class: 'bt-inst' });
    // Sex
    const sexRow = el('div', { class: 'bt-row' });
    sexRow.appendChild(el('div', { class: 'bt-lbl' }, '<b>Sex</b>'));
    (inst.items?.find(i => i.key === 'sex')?.options || ['Female', 'Male', 'Other/Prefer not to say']).forEach(opt => {
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

  R.bmi = function (host, inst) {
    const wrap = el('div', { class: 'bt-inst' });
    const unitRow = el('div', { class: 'bt-row' });
    unitRow.appendChild(el('div', { class: 'bt-lbl' }, '<b>Units</b>'));
    ['US (lb, ft/in)', 'Metric (kg, m)'].forEach((label, i) => {
      const lab = el('label', { class: 'bt-opt' });
      lab.appendChild(el('input', { type: 'radio', name: 'bp_units', value: i === 0 ? 'US' : 'Metric', ...(i === 0 ? { checked: 'checked' } : {}) }));
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

  // Shared: append threat text after a label if found
  function labelWithThreat(baseLabel, key, lookups) {
    const t = lookups?.threatByKey?.[String(key || '').toLowerCase()];
    return t ? `${baseLabel} — ${t}` : baseLabel;
  }

  R.yn_list = function (host, inst, lookups) {
    const grid = el('div', { class: 'bt-grid' });
    (inst.items || []).forEach(it => {
      const card = el('div', { class: 'bt-card' });
      const shown = labelWithThreat(it.label, (it.csvKey || it.key), lookups);
      card.innerHTML = `
        <div class="bt-lbl" style="font-weight:600;margin-bottom:6px">${shown}</div>
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
      { label: 'Never', value: 0 }, { label: 'Rarely', value: 1 },
      { label: 'Sometimes', value: 2 }, { label: 'Often', value: 3 }, { label: 'Always', value: 4 }
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

  R.weighted_select = function (host, inst, lookups) {
    const SCALE = inst.scale || [
      { label: 'Never (0)', value: 0 },
      { label: 'Occasionally (1)', value: 1 },
      { label: 'Regularly (2)', value: 2 },
      { label: 'Frequently (3)', value: 3 }
    ];
    (inst.items || []).forEach(it => {
      const row = el('div', { class: 'bt-row' });
      const shown = labelWithThreat(it.label, (it.csvKey || it.key), lookups);
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
      selects.forEach(sel => {
        const w = Number(sel.getAttribute('data-weight') || 1);
        const v = Number(sel.value || 0);
        score += v * w; max += 3 * w;
      });
      const pct = max ? Math.round((score / max) * 100) : 0;
      emitSectionUpdate(inst.id, inst.title, { score: Math.round(score), max: Math.round(max), pct });
    }
    host.addEventListener('change', compute);
    compute();
  };

  R.medications = function (host, inst, lookups) {
    const classes = inst.classes || [];
    const statuses = inst.statusOptions || [
      { label: 'No / Never used', value: 0 },
      { label: 'Taken in the past', value: 1 },
      { label: 'Currently taking', value: 2 }
    ];

    classes.forEach(cls => {
      const block = el('div', { class: 'bt-card' });
      block.innerHTML = `<div class="bt-lbl" style="font-weight:700;margin-bottom:8px">${cls.class}</div>`;
      (cls.meds || []).forEach(generic => {
        const brand = lookups?.brandByGeneric?.[String(generic).toLowerCase()];
        const display = brand ? `${generic} (${brand})` : generic;
        const row = el('div', { class: 'bt-row' });
        row.appendChild(el('span', { class: 'bt-badge' }, display));
        statuses.forEach(s => {
          const lab = el('label', { class: 'bt-opt' });
          lab.appendChild(el('input', { type: 'radio', name: `med_${cls.class}_${generic}`, value: String(s.value) }));
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
        (cls.meds || []).forEach(g => {
          const v = Number($(`input[name="med_${cls.class}_${g}"]:checked`, host)?.value || 0);
          if (v === 2) { score += (cls.baseRisk || 1); current++; }
        });
      });
      emitSectionUpdate(inst.id, inst.title, { score, current });
    }
    host.addEventListener('change', compute);
    compute();
  };

  // ---------- Category renderer ----------
  function renderCategory(container, cat, lookups) {
    const details = el('details', { class: 'bt-cat' });
    const sum = el('summary', { class: 'bt-sum' });
    const caret = el('span', { class: 'bt-caret' }, CARET_CLOSED);
    sum.appendChild(caret);
    sum.appendChild(el('span', { class: 'bt-title' }, ' ' + (cat.title || cat.id)));
    details.appendChild(sum);

    const body = el('div', { class: 'bt-body' });
    if (cat.note) body.appendChild(el('div', { class: 'bt-note' }, cat.note));

    (cat.instruments || []).forEach(inst => {
      const instWrap = el('div', { class: 'bt-inst-wrap' });
      instWrap.appendChild(el('div', { class: 'bt-inst-title' }, `<b>${inst.title || inst.id}</b>`));
      const mount = el('div', { class: 'bt-inst-mount' });
      instWrap.appendChild(mount);
      const fn = R[inst.type];
      if (typeof fn === 'function') fn(mount, inst, lookups);
      else mount.appendChild(el('div', { class: 'bt-note' }, `Unsupported instrument type: ${inst.type}`));
      body.appendChild(instWrap);
    });

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

  function collapseAllCats(root) {
    $all('details.bt-cat', root).forEach(d => d.removeAttribute('open'));
  }
  function wireGlobalClear() {
    const btn = document.querySelector('[data-action="reset"], .bp-btn[data-action="reset"]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      $all('details.bt-cat').forEach(d => { resetInputs(d); d.removeAttribute('open'); });
    });
  }

  // ---------- Main ----------
  async function main() {
    const [cfgRes, csvRes] = await Promise.all([
      fetch(CFG.paths.configJson, { cache: 'no-store' }),
      CFG.paths.masterCsv ? loadCsv(CFG.paths.masterCsv) : Promise.resolve(null)
    ]);
    if (!cfgRes.ok) throw new Error('Failed JSON: ' + cfgRes.status);
    const cfg = await cfgRes.json();

    const lookups = csvRes ? buildLookups(csvRes) : {};
    const mount = document.getElementById('bt-categories') || document.body;
    const navHost = document.getElementById('bt-topnav') || document.querySelector('.bt-topnav');

    mount.innerHTML = '';
    (cfg.categories || []).forEach(cat => {
      const tmp = el('div');
      renderCategory(tmp, cat, lookups);
      const card = tmp.firstElementChild;
      card.setAttribute('data-id', cat.id);
      mount.appendChild(card);
    });

    renderTopNav(navHost, cfg.categories || []);
    collapseAllCats(mount);
    wireGlobalClear();

    // Minimal styles (only if page lacks them)
    const css = `
    .bt-topnav{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 16px}
    .bt-pill{border:1px solid #e5e7eb;background:#f8fafc;padding:6px 12px;border-radius:999px;font-weight:600;cursor:pointer}
    .bt-cat{border:1px solid #e5e7eb;border-radius:14px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.04);margin:12px 0}
    .bt-cat>summary{list-style:none;display:flex;gap:8px;align-items:center;padding:12px 14px;cursor:pointer;font-weight:700}
    .bt-cat>summary::-webkit-details-marker{display:none}
    .bt-body{padding:12px 14px}
    .bt-caret{display:inline-block;width:1em;text-align:center}
    .bt-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px 0}
    .bt-opt{display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;cursor:pointer}
    .bt-lbl{min-width:240px}
    .bt-badge{display:inline-block;padding:3px 8px;border-radius:9999px;border:1px solid #e5e7eb;background:#f9fafb}
    .bt-note{color:#6b7280;font-size:.9rem;margin:4px 0 8px}
    .bt-mini{display:flex;gap:10px;margin:8px 0}
    .bt-btnrow{margin-top:8px}
    .bt-btn{background:#111827;color:#fff;border:none;border-radius:999px;padding:8px 12px;font-weight:600;cursor:pointer}
    `;
    const styleTag = el('style'); styleTag.textContent = css; document.head.appendChild(styleTag);
  }

  document.addEventListener('DOMContentLoaded', () => {
    main().catch(err => { console.error(err); alert('Init failed. See console.'); });
  });
})();
