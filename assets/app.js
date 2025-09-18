// assets/app.js
(function () {
  "use strict";

  // -------------------------------
  // Access global deterministic config
  // -------------------------------
  const CFG = window.BT_CONFIG;
  if (!CFG) {
    console.error("BT_CONFIG missing. Ensure assets/config.js loads before assets/app.js");
    return;
  }

  // -------------------------------
  // DOM helpers
  // -------------------------------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "dataset" && v && typeof v === "object") {
        Object.entries(v).forEach(([dk, dv]) => (node.dataset[dk] = dv));
      } else if (k === "style" && v && typeof v === "object") {
        Object.assign(node.style, v);
      } else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2), v);
      } else {
        node.setAttribute(k, v);
      }
    });
    for (const c of children.flat()) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  };

  // -------------------------------
  // Alert banner (visible, red)
  // -------------------------------
  const alertEl = () => $("#" + CFG.ui.ids.alert);
  function showAlert(msg) {
    const a = alertEl();
    if (!a) return;
    a.style.display = "block";
    a.textContent = msg;
  }
  function appendAlertLine(msg) {
    const a = alertEl();
    if (!a) return;
    a.style.display = "block";
    a.textContent = (a.textContent ? a.textContent + "\n" : "") + msg;
  }
  function clearAlert() {
    const a = alertEl();
    if (!a) return;
    a.style.display = "none";
    a.textContent = "";
  }

  // -------------------------------
  // CSV parsing (robust to quotes)
  // -------------------------------
  function parseCsv(text) {
    // Returns { headers: string[], rows: Array<Object> }
    const rows = [];
    let i = 0, field = "", row = [], inQuotes = false;
    const out = [];

    function pushField() {
      // Trim only trailing CR
      if (field.endsWith("\r")) field = field.slice(0, -1);
      out.push(field);
      field = "";
    }
    function pushRow() {
      rows.push(out.slice());
      out.length = 0;
    }
    while (i < text.length) {
      const c = text[i++];
      if (inQuotes) {
        if (c === '"') {
          if (text[i] === '"') {
            field += '"'; // escaped quote
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ",") {
          pushField();
        } else if (c === "\n") {
          pushField();
          pushRow();
        } else {
          field += c;
        }
      }
    }
    // Last field/row
    if (field.length || out.length) {
      pushField();
      pushRow();
    }
    if (rows.length === 0) return { headers: [], rows: [] };

    const headers = rows[0];
    const objs = rows.slice(1).map((r) => {
      const o = {};
      headers.forEach((h, idx) => (o[h] = r[idx] ?? ""));
      return o;
    });
    return { headers, rows: objs };
  }

  // -------------------------------
  // Data loaders
  // -------------------------------
  async function loadText(url) {
    const res = await fetch(url, CFG.fetchInit);
    if (!res.ok) throw new Error(`Fetch failed ${url}: ${res.status}`);
    return res.text();
  }
  async function loadJson(url) {
    const res = await fetch(url, CFG.fetchInit);
    if (!res.ok) throw new Error(`Fetch failed ${url}: ${res.status}`);
    return res.json();
  }

  // -------------------------------
  // Strict CSV contract & lookups
  // -------------------------------
  function buildCsvLookups(parsed) {
    // Validate required headers
    const missing = (CFG.csv.requiredHeaders || []).filter((h) => !parsed.headers.includes(h));
    if (missing.length) {
      const msg = `CSV missing required header(s): ${missing.join(", ")}`;
      console.error(msg, { headers: parsed.headers });
      if (CFG.strict.redBannerOnMissing) showAlert(msg);
      // Continue but mark as invalid
    }

    const threatByKey = Object.create(null);
    const brandByKey = Object.create(null);
    const norm = (k) =>
      CFG.csv.normalizeKeysToLowerCase && typeof k === "string" ? k.trim().toLowerCase() : (k || "");

    for (const r of parsed.rows) {
      const k = norm(r["item_key"]);
      if (!k) continue;
      if (CFG.csv.lookups?.threatByKey) threatByKey[k] = r["threat"] || "";
      if (CFG.csv.lookups?.brandByKey) brandByKey[k] = r["brand_name"] || "";
    }
    return { threatByKey, brandByKey, normalize: norm, headers: parsed.headers };
  }

  // -------------------------------
  // Rendering
  // -------------------------------
  const root = () => $("#" + CFG.ui.ids.categories);

  function makeCard(title) {
    const caret = el("span", { class: CFG.ui.classes.caret }, CFG.ui.uiCaretClosed || CFG.ui.caretClosed);
    const header = el(
      "div",
      { class: CFG.ui.classes.cardHeader, role: "button", tabindex: "0" },
      el("div", { class: "title" }, caret, title)
    );
    const body = el("div", { class: CFG.ui.classes.cardBody });
    const card = el("section", { class: CFG.ui.classes.card, "data-collapsed": "1" }, header, body);

    function setCollapsed(collapsed) {
      card.dataset.collapsed = collapsed ? "1" : "0";
      body.style.display = collapsed ? "none" : "block";
      caret.textContent = collapsed ? CFG.ui.caretClosed : CFG.ui.caretOpen;
    }
    const toggle = () => setCollapsed(card.dataset.collapsed !== "0");

    header.addEventListener("click", toggle);
    header.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });

    // default collapsed/open from config
    setCollapsed(!!CFG.ui.startCollapsed);

    return { card, body, setCollapsed };
  }

  function withThreatSuffix(labelText, csvKey, lookups) {
    const k = lookups.normalize(csvKey);
    const threat = k ? lookups.threatByKey[k] : "";
    return threat ? `${labelText} — ${threat}` : labelText;
  }

  function withBrandForMedication(genericText, csvKey, lookups) {
    const k = lookups.normalize(csvKey);
    const brand = k ? lookups.brandByKey[k] : "";
    if (brand) return `${genericText} (${brand})`;
    return genericText;
  }

  function ensureMappingOrWarn(csvKey, contextLabel) {
    if (!csvKey) return;
    const keyNorm = csvKey.trim().toLowerCase();
    const missingThreat = CFG.strict.redBannerOnMissing && !_LOOKUPS.threatByKey[keyNorm];
    // For meds we allow threat to be empty; we still want to warn if both threat and brand are empty AND the key doesn't exist at all.
    const existsInEither =
      _LOOKUPS.threatByKey.hasOwnProperty(keyNorm) || _LOOKUPS.brandByKey.hasOwnProperty(keyNorm);
    if (!existsInEither) {
      const msg = `CSV item_key not found: "${csvKey}" (used by "${contextLabel}")`;
      console.error(msg);
      appendAlertLine(msg);
    }
    // If only threat missing (non-med contexts), that's allowed (it just won't append text).
  }

  // -------------------------------
  // Instrument renderers
  // Rely ONLY on instruments_config.json schema (no guessing).
  // Each item must carry a stable "key" and, where applicable, an explicit "csvKey".
  // -------------------------------
  const R = {
    // Group renderer (category with instruments and optional sub-accordions)
    category(group, container) {
      const { card, body, setCollapsed } = makeCard(group.title);
      card.dataset.categoryKey = group.key;

      // Instruments (flat)
      if (Array.isArray(group.instruments)) {
        group.instruments.forEach((inst) => R.instrument(inst, body, group));
      }

      // Sub-accordions (e.g., Sensory: Hearing, Vision)
      if (Array.isArray(group.subAccordions) && group.subAccordions.length) {
        group.subAccordions.forEach((sub) => {
          const subHeader = el(
            "div",
            { class: CFG.ui.classes.cardHeader, role: "button", tabindex: "0" },
            el("div", { class: "title" }, el("span", { class: CFG.ui.classes.caret }, CFG.ui.caretClosed), sub.title)
          );
          const subBody = el("div", { class: CFG.ui.classes.cardBody });
          const wrapper = el("div", { class: CFG.ui.classes.card, "data-collapsed": "1" }, subHeader, subBody);
          body.appendChild(wrapper);

          function setSubCollapsed(collapsed) {
            wrapper.dataset.collapsed = collapsed ? "1" : "0";
            subBody.style.display = collapsed ? "none" : "block";
            $(".caret", subHeader).textContent = collapsed ? CFG.ui.caretClosed : CFG.ui.caretOpen;
          }
          const toggleSub = () => setSubCollapsed(wrapper.dataset.collapsed !== "0");

          subHeader.addEventListener("click", toggleSub);
          subHeader.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleSub();
            }
          });

          setSubCollapsed(!!CFG.ui.startCollapsed);

          // render instruments within sub-accordion
          if (Array.isArray(sub.instruments)) {
            sub.instruments.forEach((inst) => R.instrument(inst, subBody, group));
          }
        });
      }

      // Per-category "Clear This Section"
      const actions = el("div", { class: CFG.ui.classes.cardActions });
      const btnClear = el("button", { type: "button", class: "ghost" }, CFG.ui.sectionClearLabel);
      btnClear.addEventListener("click", () => {
        clearSection(card);
        setCollapsed(true);
        dispatchRecompute();
      });
      actions.appendChild(btnClear);
      body.appendChild(actions);

      container.appendChild(card);
    },

    instrument(inst, container, group) {
      // Simple container for instrument
      const block = el("div", { class: "instrument", "data-inst-key": inst.key });
      if (inst.title) {
        block.appendChild(el("h3", {}, inst.title));
      }
      // Render by type — the schema is defined entirely by instruments_config.json
      switch (inst.type) {
        case "demographics":
          R.demographics(inst, block);
          break;
        case "bmi":
          R.bmi(inst, block);
          break;
        case "yn_list":
          R.ynList(inst, block);
          break;
        case "likert":
          R.likert(inst, block);
          break;
        case "radio":
          R.radio(inst, block);
          break;
        case "weighted_select":
          R.weightedSelect(inst, block);
          break;
        case "medications":
          R.medications(inst, block);
          break;
        default:
          // Unknown instrument type — hard error banner
          const msg = `Unknown instrument type "${inst.type}" in "${inst.key}"`;
          console.error(msg, inst);
          appendAlertLine(msg);
      }
      container.appendChild(block);
    },

    demographics(inst, container) {
      // Expected fields provided by config; we do not invent any
      // age input
      if (inst.fields?.age) {
        const f = inst.fields.age;
        const id = `age_${inst.key}`;
        const label = el("label", { for: id }, f.label || "Age (years)");
        const input = el("input", { id, type: "number", min: "0", step: "1", "data-key": f.key || "age" });
        input.addEventListener("input", dispatchRecompute);
        container.append(label, el("br"), input);
      }
      // sex radio (if present)
      if (inst.fields?.sex && Array.isArray(inst.fields.sex.options)) {
        const g = el("div", { class: "field-group" }, el("div", {}, inst.fields.sex.label || "Sex"));
        inst.fields.sex.options.forEach((opt, idx) => {
          const id = `sex_${inst.key}_${idx}`;
          const label = el("label", { for: id, style: { marginRight: "12px" } }, opt.label);
          const input = el("input", {
            id,
            type: "radio",
            name: inst.fields.sex.key || `sex_${inst.key}`,
            value: opt.value,
            "data-key": inst.fields.sex.key || "sex",
          });
          input.addEventListener("change", dispatchRecompute);
          g.append(input, label);
        });
        container.appendChild(g);
      }
    },

    bmi(inst, container) {
      // height/weight numeric fields; keys supplied by config
      const h = inst.fields?.height;
      const w = inst.fields?.weight;
      if (h) {
        const id = `height_${inst.key}`;
        container.append(el("label", { for: id }, h.label || "Height (cm)"), el("br"));
        const input = el("input", {
          id,
          type: "number",
          step: "0.1",
          min: "0",
          "data-key": h.key || "height_cm",
        });
        input.addEventListener("input", dispatchRecompute);
        container.append(input, el("br"));
      }
      if (w) {
        const id = `weight_${inst.key}`;
        container.append(el("label", { for: id }, w.label || "Weight (kg)"), el("br"));
        const input = el("input", {
          id,
          type: "number",
          step: "0.1",
          min: "0",
          "data-key": w.key || "weight_kg",
        });
        input.addEventListener("input", dispatchRecompute);
        container.append(input);
      }
    },

    ynList(inst, container) {
      // Render checkboxes or radios per config.items[].control ("checkbox"|"radio")
      if (!Array.isArray(inst.items)) return;
      inst.items.forEach((it, idx) => {
        const id = `${inst.key}_${idx}`;
        const inputType = it.control === "radio" ? "radio" : "checkbox";
        const rawLabel = it.label || it.key || id;

        // label augmentation with CSV threat (if available)
        const augmented = withThreatSuffix(rawLabel, it.csvKey, _LOOKUPS);
        ensureMappingOrWarn(it.csvKey, rawLabel);

        const label = el("label", { for: id, style: { display: "inline-block", margin: "6px 8px 6px 0" } }, augmented);
        const input = el("input", {
          id,
          type: inputType,
          name: inst.key + (inputType === "radio" ? "" : `_${idx}`),
          value: "1",
          "data-key": it.key,
          "data-inst": inst.key,
        });
        input.addEventListener("change", dispatchRecompute);

        const row = el("div", { class: "row" }, input, label);
        container.appendChild(row);
      });
    },

    likert(inst, container) {
      // Likert 0..N with radio buttons per item
      if (!Array.isArray(inst.items)) return;
      inst.items.forEach((it, i) => {
        const g = el("div", { class: "likert" });
        const baseId = `${inst.key}_${i}`;
        const rawLabel = it.label || it.key || baseId;
        const augmented = withThreatSuffix(rawLabel, it.csvKey, _LOOKUPS);
        ensureMappingOrWarn(it.csvKey, rawLabel);
        g.appendChild(el("div", { style: { margin: "6px 0" } }, augmented));

        const scale = Array.isArray(inst.scale) ? inst.scale : [0, 1, 2, 3, 4];
        scale.forEach((val, j) => {
          const id = `${baseId}_${val}`;
          const lab = el("label", { for: id, style: { marginRight: "10px" } }, String(val));
          const input = el("input", {
            id,
            type: "radio",
            name: baseId,
            value: String(val),
            "data-key": it.key,
            "data-inst": inst.key,
          });
          input.addEventListener("change", dispatchRecompute);
          g.append(input, lab);
        });
        container.appendChild(g);
      });
    },

    radio(inst, container) {
      // Single-choice radio instrument (e.g., small scales)
      if (!Array.isArray(inst.items)) return;
      const name = inst.key;
      inst.items.forEach((it, idx) => {
        const id = `${name}_${idx}`;
        const rawLabel = it.label || it.key || id;
        const augmented = withThreatSuffix(rawLabel, it.csvKey, _LOOKUPS);
        ensureMappingOrWarn(it.csvKey, rawLabel);
        const input = el("input", {
          id,
          type: "radio",
          name,
          value: it.value ?? "1",
          "data-key": it.key,
          "data-inst": inst.key,
        });
        input.addEventListener("change", dispatchRecompute);
        const label = el("label", { for: id, style: { marginRight: "12px" } }, augmented);
        container.append(input, label);
      });
    },

    weightedSelect(inst, container) {
      // Each item is a select with fixed weights (e.g., 0..3). Items MUST specify options in config.
      if (!Array.isArray(inst.items)) return;
      inst.items.forEach((it, i) => {
        const id = `${inst.key}_${i}`;
        const rawLabel = it.label || it.key || id;
        const augmented = withThreatSuffix(rawLabel, it.csvKey, _LOOKUPS);
        ensureMappingOrWarn(it.csvKey, rawLabel);

        const label = el("label", { for: id, style: { display: "block", margin: "8px 0 4px" } }, augmented);
        const sel = el("select", {
          id,
          "data-key": it.key,
          "data-inst": inst.key,
        });
        (Array.isArray(it.options) ? it.options : []).forEach((op) => {
          sel.appendChild(el("option", { value: String(op.value) }, op.label));
        });
        sel.addEventListener("change", dispatchRecompute);
        container.append(label, sel);
      });
    },

    medications(inst, container) {
      // Render class -> meds (checkboxes). Display "generic (Brand)" where brand exists in CSV.
      if (!Array.isArray(inst.classes)) return;
      inst.classes.forEach((cls) => {
        if (cls.title) container.appendChild(el("h4", {}, cls.title));
        if (!Array.isArray(cls.meds)) return;
        cls.meds.forEach((m, idx) => {
          const id = `${inst.key}_${cls.key}_${idx}`;
          const baseLabel = m.label || m.key || id;
          const display = withBrandForMedication(baseLabel, m.csvKey, _LOOKUPS);
          ensureMappingOrWarn(m.csvKey, baseLabel);

          const input = el("input", {
            id,
            type: "checkbox",
            name: `${inst.key}_${cls.key}`,
            value: "1",
            "data-key": m.key,
            "data-inst": inst.key,
          });
          input.addEventListener("change", dispatchRecompute);
          const label = el("label", { for: id, style: { marginRight: "12px" } }, display);
          container.append(input, label, el("br"));
        });
      });
    },
  };

  // -------------------------------
  // Collection & recompute
  // -------------------------------
  function collectResponses() {
    // Returns a flat map { key: value } using each control's data-key
    const data = Object.create(null);
    $$("[data-key]").forEach((inp) => {
      const k = inp.dataset.key;
      if (!k) return;
      if (inp.type === "radio") {
        if (inp.checked) data[k] = inp.value;
      } else if (inp.type === "checkbox") {
        data[k] = (data[k] || 0) || inp.checked ? (inp.checked ? 1 : 0) : 0; // last write wins; on/off
        // Above ensures a single checkbox sets 1/0. If multiple with same key, last wins (config should avoid that).
      } else if (inp.tagName === "SELECT") {
        data[k] = inp.value;
      } else {
        data[k] = inp.value;
      }
    });
    return data;
  }

  function dispatchRecompute() {
    const payload = {
      responses: collectResponses(),
      config: window.BT_INSTRUMENTS_CONFIG, // loaded later
    };
    // scoring.js should expose window.BT_SCORING.compute(payload)
    try {
      if (window.BT_SCORING && typeof window.BT_SCORING.compute === "function") {
        const scoring = window.BT_SCORING.compute(payload);
        // summary.js should expose window.BT_SUMMARY.render(scoring)
        if (window.BT_SUMMARY && typeof window.BT_SUMMARY.render === "function") {
          window.BT_SUMMARY.render(scoring);
        }
      }
    } catch (err) {
      console.error("Recompute error:", err);
      appendAlertLine(`Compute error: ${err.message}`);
    }
  }

  // -------------------------------
  // Clearing helpers
  // -------------------------------
  function clearSection(cardEl) {
    $$("[data-key]", cardEl).forEach((inp) => {
      if (inp.type === "radio" || inp.type === "checkbox") {
        inp.checked = false;
      } else if (inp.tagName === "SELECT") {
        inp.selectedIndex = 0;
      } else {
        inp.value = "";
      }
    });
  }
  function clearAll() {
    $$(".card").forEach((c) => clearSection(c));
    // Recollapse everything
    $$(".card").forEach((c) => {
      const header = $("." + CFG.ui.classes.cardHeader, c);
      const caret = $("." + CFG.ui.classes.caret, header);
      const body = $("." + CFG.ui.classes.cardBody, c);
      c.dataset.collapsed = "1";
      if (body) body.style.display = "none";
      if (caret) caret.textContent = CFG.ui.caretClosed;
    });
    // clear banner & summary
    clearAlert();
    const sc = $("#" + CFG.ui.ids.summaryContent);
    if (sc) sc.textContent = "Complete or update the questionnaires above to generate a summary here.";
    dispatchRecompute();
  }

  // -------------------------------
  // Wire global buttons
  // -------------------------------
  function wireGlobalButtons() {
    const btnCopy = $("#" + CFG.ui.ids.copySummaryBtn);
    if (btnCopy) {
      btnCopy.addEventListener("click", async () => {
        const text = $("#" + CFG.ui.ids.summaryContent)?.textContent || "";
        try {
          await navigator.clipboard.writeText(text);
        } catch (e) {
          console.warn("Clipboard write failed; falling back to prompt");
          window.prompt("Copy summary:", text);
        }
      });
    }
    const btnClear = $("#" + CFG.ui.ids.clearAllBtn);
    if (btnClear) btnClear.addEventListener("click", clearAll);
  }

  // -------------------------------
  // Main bootstrap
  // -------------------------------
  let _LOOKUPS = { threatByKey: {}, brandByKey: {}, normalize: (x) => x || "" };

  async function boot() {
    try {
      clearAlert();
      wireGlobalButtons();

      // Load config and CSV
      const [cfgJson, csvText] = await Promise.all([
        loadJson(CFG.paths.configJson),
        loadText(CFG.paths.masterCsv),
      ]);

      // Expose instruments config globally (read-only)
      window.BT_INSTRUMENTS_CONFIG = Object.freeze(cfgJson);

      // Parse CSV and build lookups
      const parsed = parseCsv(csvText);
      _LOOKUPS = buildCsvLookups(parsed);

      // Render categories strictly from config
      const container = root();
      if (!container) {
        const msg = "Root container not found: #" + CFG.ui.ids.categories;
        console.error(msg);
        showAlert(msg);
        return;
      }
      container.innerHTML = "";
      if (!Array.isArray(cfgJson.categories) || !cfgJson.categories.length) {
        const msg = "Config has no categories (data/instruments_config.json)";
        console.error(msg, cfgJson);
        showAlert(msg);
        return;
      }

      // Build each category
      cfgJson.categories.forEach((cat) => R.category(cat, container));

      // After render, verify that every rendered item with csvKey maps to CSV; if not, banner lines already appended.
      // Trigger initial compute (in case defaults exist)
      dispatchRecompute();
    } catch (err) {
      console.error("Bootstrap failure", err);
      showAlert(`Initialization error: ${err.message}`);
    }
  }

  // Kick off
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
