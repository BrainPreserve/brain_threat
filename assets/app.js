/* ===========================================================================
   Brain Threat Analysis — APP
   Clean rebuild from WP + master.csv (STRICT CONTRACT)
   ---------------------------------------------------------------------------
   - Uses ONLY `master.csv` (threat, brand_name) for UI helper text & med brands
   - Scoring/bands/tiers/weights are in code (CONFIG/SCORING), never CSV
   - NO heuristics. If a required csvKey is missing, show RED BANNER and STOP
   - All fetch() use { cache: "no-store" }
   - Seven top-level categories, all collapsed on load (▸ closed; ▾ open)
   - Each category has “Clear This Section” that resets only that section & re-collapses
   - Sensory has TWO collapsed sub-accordions (HHIE-S, VFQ-3of7)
   - Global “Copy Summary” and “Clear Form” sit BELOW the Summary
   - File paths are fixed:
       data/instruments_config.json
       data/master.csv
       assets/config.js
       assets/app.js
       assets/scoring.js
       assets/summary.js
   =========================================================================== */

(() => {
  const CSV_PATH = "data/master.csv";
  const INSTR_PATH = "data/instruments_config.json";

  // State containers (populated after data loads)
  const STATE = {
    threatByKey: Object.create(null), // item_key.toLowerCase() => threat (helper text)
    brandByKey: Object.create(null),  // item_key.toLowerCase() => brand_name
    csvKeys: new Set(),               // canonical lowercased keys from CSV
    instruments: null,                // parsed instruments_config.json
  };

  // DOM refs
  const $app = document.getElementById("app");
  const $cats = document.getElementById("categories");
  const $banner = document.getElementById("error-banner");
  const $copySummary = document.getElementById("copy-summary-btn");
  const $clearForm = document.getElementById("clear-form-btn");
  const $summaryContent = document.getElementById("summary-content");

  // ---------- Utilities ----------

  function showRedBanner(headline, details) {
    const extra = details ? `<pre style="white-space:pre-wrap;margin-top:8px;">${escapeHTML(details)}</pre>` : "";
    $banner.innerHTML =
      `<div><strong>❗️ERROR — STRICT CONTRACT VIOLATION</strong><br>${escapeHTML(headline)}${extra}</div>`;
    $banner.style.display = "block";
  }

  function hideRedBanner() {
    $banner.style.display = "none";
    $banner.textContent = "";
  }

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function lc(s) { return String(s || "").trim().toLowerCase(); }

  // Minimal CSV parser (no external deps), expects first row headers
  async function loadCSV(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
    const text = await res.text();

    // Split lines, handle CRLF
    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    // Basic CSV split that supports quoted cells with commas
    function parseLine(line) {
      const out = [];
      let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (ch === "," && !inQ) {
          out.push(cur);
          cur = "";
        } else {
          cur += ch;
        }
      }
      out.push(cur);
      return out;
    }

    const headers = parseLine(lines[0]).map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseLine(lines[i]);
      if (cols.every(c => c.trim() === "")) continue; // skip blank row
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (cols[idx] ?? "").trim(); });
      rows.push(obj);
    }
    return { headers, rows };
  }

  async function loadJSON(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
    return res.json();
  }

  function requireColumns(headers, required) {
    const missing = required.filter(r => !headers.includes(r));
    if (missing.length) {
      throw new Error(`master.csv is missing required columns: ${missing.join(", ")}`);
    }
  }

  // Build strict dictionaries (ONLY threat & brand_name)
  function buildCsvDictionaries(csv) {
    const { headers, rows } = csv;
    requireColumns(headers, ["instrument_id", "item_key", "threat", "brand_name"]);

    const threatByKey = Object.create(null);
    const brandByKey = Object.create(null);
    const keySet = new Set();

    for (const r of rows) {
      const key = lc(r["item_key"]);
      if (!key) continue;
      keySet.add(key);
      // STRICT: only these two mappings from CSV
      threatByKey[key] = r["threat"] || "";
      brandByKey[key] = r["brand_name"] || "";
    }

    STATE.threatByKey = threatByKey;
    STATE.brandByKey = brandByKey;
    STATE.csvKeys = keySet;
  }

  // Validate that every item that declares a csvKey exists in master.csv
  function validateInstrumentCsvKeys(instruments) {
    const missing = [];
    const addMissing = (section, itemKey) => missing.push(`${section}: ${itemKey}`);

    // Helper: walk items arrays looking for csvKey
    function checkItems(sectionName, items) {
      for (const it of items) {
        if (it && typeof it.csvKey === "string" && it.csvKey.length > 0) {
          const k = lc(it.csvKey);
          if (!STATE.csvKeys.has(k)) addMissing(sectionName, it.csvKey);
        }
      }
    }

    // Check across known blocks
    if (instruments.medications?.items) {
      checkItems("Medications", instruments.medications.items);
    }
    if (instruments.microplastics?.items) {
      checkItems("Micro/Nanoplastic Exposure", instruments.microplastics.items);
    }
    if (instruments.toxins?.items) {
      checkItems("Toxin Exposure", instruments.toxins.items);
    }
    if (instruments.foods?.items) {
      checkItems("Brain Threat Foods & Additives", instruments.foods.items);
    }

    if (missing.length) {
      showRedBanner(
        "One or more items declare csvKey values that are NOT present in master.csv. Rendering halted.",
        `Missing csvKey matches:\n• ${missing.join("\n• ")}`
      );
      throw new Error("Missing csvKey(s) in CSV");
    }
  }

  // ---------- Rendering helpers ----------

  function makeAccordion({ id, label, startOpen = false }) {
    const wrap = document.createElement("section");
    wrap.className = "bp-accordion";
    wrap.dataset.accId = id;

    const header = document.createElement("button");
    header.type = "button";
    header.className = "bp-acc-header";
    header.setAttribute("aria-expanded", startOpen ? "true" : "false");
    header.innerHTML = `<span class="caret">${startOpen ? "▾" : "▸"}</span> <span>${escapeHTML(label)}</span>`;

    const body = document.createElement("div");
    body.className = "bp-acc-body";
    body.style.display = startOpen ? "block" : "none";

    // toggle
    header.addEventListener("click", () => {
      const open = header.getAttribute("aria-expanded") === "true";
      header.setAttribute("aria-expanded", String(!open));
      header.querySelector(".caret").textContent = open ? "▸" : "▾";
      body.style.display = open ? "none" : "block";
    });

    // per-section Clear
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "section-clear-btn";
    clearBtn.textContent = "Clear This Section";
    clearBtn.addEventListener("click", () => {
      resetSectionInputs(body);
      // re-collapse
      header.setAttribute("aria-expanded", "false");
      header.querySelector(".caret").textContent = "▸";
      body.style.display = "none";
      // trigger summary refresh
      if (window.SUMMARY && typeof window.SUMMARY.updateSummary === "function") {
        window.SUMMARY.updateSummary(collectAllResponses());
      }
    });

    body.appendChild(clearBtn);

    wrap.appendChild(header);
    wrap.appendChild(body);
    return { wrap, header, body, clearBtn };
  }

  function resetSectionInputs(container) {
    const inputs = container.querySelectorAll("input, select, textarea");
    inputs.forEach(inp => {
      if (inp.type === "checkbox" || inp.type === "radio") {
        inp.checked = false;
      } else {
        inp.value = "";
      }
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function renderLikertGroup(parent, instrument, scaleMap) {
    const form = document.createElement("div");
    form.className = "instrument";
    const title = document.createElement("h3");
    title.textContent = instrument.label;
    form.appendChild(title);

    instrument.items.forEach(item => {
      const row = document.createElement("div");
      row.className = "item-row";

      const q = document.createElement("div");
      q.className = "item-label";
      q.textContent = item.label;
      row.appendChild(q);

      const opts = document.createElement("div");
      opts.className = "item-options";

      Object.entries(scaleMap).forEach(([lab, val]) => {
        const id = `${instrument.id}.${item.key}.${lab}`;
        const lbl = document.createElement("label");
        lbl.className = "opt";
        const inp = document.createElement("input");
        inp.type = "radio";
        inp.name = `${instrument.id}.${item.key}`;
        inp.value = String(val);
        inp.id = id;
        lbl.setAttribute("for", id);
        lbl.appendChild(inp);
        lbl.appendChild(document.createTextNode(" " + labelHuman(lab)));
        opts.appendChild(lbl);
      });

      row.appendChild(opts);
      form.appendChild(row);
    });

    parent.appendChild(form);
  }

  function labelHuman(s) {
    return String(s)
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function renderYNGrid(parent, instrument) {
    const form = document.createElement("div");
    form.className = "instrument";
    const title = document.createElement("h3");
    title.textContent = instrument.label;
    form.appendChild(title);

    instrument.items.forEach(item => {
      const row = document.createElement("div");
      row.className = "item-row";

      const q = document.createElement("div");
      q.className = "item-label";
      q.textContent = item.label;
      row.appendChild(q);

      const opts = document.createElement("div");
      opts.className = "item-options";
      ["Yes", "No"].forEach(lab => {
        const id = `${instrument.id}.${item.key}.${lab}`;
        const lbl = document.createElement("label");
        lbl.className = "opt";
        const inp = document.createElement("input");
        inp.type = "radio";
        inp.name = `${instrument.id}.${item.key}`;
        inp.value = lab;
        inp.id = id;
        lbl.setAttribute("for", id);
        lbl.appendChild(inp);
        lbl.appendChild(document.createTextNode(" " + lab));
        opts.appendChild(lbl);
      });

      row.appendChild(opts);
      form.appendChild(row);
    });

    parent.appendChild(form);
  }

  function makeHelperSpan(text) {
    const span = document.createElement("div");
    span.className = "helper-text";
    span.textContent = text;
    return span;
  }

  function renderChecklistWithHelpers(parent, sectionLabel, items, mode) {
    // mode: "meds" (use brand), "helper" (use threat helper text)
    const form = document.createElement("div");
    form.className = "instrument";
    const title = document.createElement("h3");
    title.textContent = sectionLabel;
    form.appendChild(title);

    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "item-row checklist";

      const lbl = document.createElement("label");
      lbl.className = "opt block";
      const inp = document.createElement("input");
      inp.type = "checkbox";
      inp.name = `${sectionLabel}.${item.key || item.csvKey || ""}`;
      inp.value = "1";
      lbl.appendChild(inp);

      const displayKey = item.key || item.csvKey || "";
      const baseName = item.label || displayKey;
      let finalLabel = baseName;

      if (mode === "meds") {
        // Append brand name in parentheses; STRICT: brand must be from CSV
        const b = STATE.brandByKey[lc(item.csvKey || item.key)];
        if (b && b.trim()) {
          finalLabel = `${baseName} (${b})`;
        } else {
          // Brand is expected for medications; if missing, error out
          showRedBanner(
            "Medication brand_name missing in CSV for one or more items.",
            `Missing brand_name for: ${displayKey}`
          );
          throw new Error(`Missing brand for ${displayKey}`);
        }
      }

      lbl.appendChild(document.createTextNode(" " + finalLabel));
      row.appendChild(lbl);

      if (mode === "helper") {
        const t = STATE.threatByKey[lc(item.csvKey || item.key)] || "";
        // STRICT: helper text must be present for these sections
        if (!t) {
          showRedBanner(
            "Required helper text (threat column) missing in CSV.",
            `Section: ${sectionLabel}\nitem_key: ${displayKey}`
          );
          throw new Error(`Missing helper text for ${displayKey}`);
        }
        row.appendChild(makeHelperSpan(t));
      }

      form.appendChild(row);
    });

    parent.appendChild(form);
  }

  // Gather responses for scoring/summary
  function collectAllResponses() {
    // Build a flat map keyed by "<instrumentId>.<itemKey>" => value
    const out = Object.create(null);
    const allInputs = $cats.querySelectorAll("input");
    allInputs.forEach(inp => {
      if (inp.type === "radio") {
        if (inp.checked) {
          const [instrumentId, itemKey] = inp.name.split(".");
          out[`${instrumentId}.${itemKey}`] = inp.value;
        }
      } else if (inp.type === "checkbox") {
        const [sectionLabel, itemKey] = (inp.name || "").split(".");
        if (inp.checked) {
          out[`${sectionLabel}.${itemKey}`] = "1";
        }
      }
    });
    return out;
  }

  function wireLiveUpdates() {
    $cats.addEventListener("change", () => {
      if (window.SUMMARY && typeof window.SUMMARY.updateSummary === "function") {
        window.SUMMARY.updateSummary(collectAllResponses());
      }
    });
  }

  function wireGlobalButtons() {
    // Copy Summary: copies visible text from #summary-content
    $copySummary?.addEventListener("click", async () => {
      try {
        const text = ($summaryContent?.innerText || "").trim();
        await navigator.clipboard.writeText(text);
      } catch (e) {
        // fallback: select + copy
        const tmp = document.createElement("textarea");
        tmp.value = ($summaryContent?.innerText || "").trim();
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand("copy");
        document.body.removeChild(tmp);
      }
    });

    // Clear Form: resets all inputs across all sections and re-collapses them
    $clearForm?.addEventListener("click", () => {
      const sections = $cats.querySelectorAll(".bp-accordion");
      sections.forEach(sec => {
        const body = sec.querySelector(".bp-acc-body");
        resetSectionInputs(body);
        // re-collapse
        const header = sec.querySelector(".bp-acc-header");
        header?.setAttribute("aria-expanded", "false");
        const caret = header?.querySelector(".caret");
        if (caret) caret.textContent = "▸";
        if (body) body.style.display = "none";
      });

      // Reset summary
      if (window.SUMMARY && typeof window.SUMMARY.reset === "function") {
        window.SUMMARY.reset();
      } else {
        $summaryContent.innerHTML = "";
      }
    });
  }

  // ---------- BUILD UI ----------

  function renderAll() {
    // Ensure cleaned slate
    $cats.innerHTML = "";
    hideRedBanner();

    // 1) Personal History (with nested questionnaires)
    const secPersonal = makeAccordion({ id: "personal", label: "Personal History", startOpen: false });
    // Sub-forms inside this section, all collapsed individually using smaller accordions
    // a) Personal History questionnaire (yes-tier mapping)
    renderYNGrid(secPersonal.body, CONFIG.categories[0].instruments[0]);
    // b) Medical & Lifestyle questionnaire
    renderYNGrid(secPersonal.body, CONFIG.categories[0].instruments[1]);
    // c) Sleep Likert
    renderLikertGroup(secPersonal.body, CONFIG.categories[0].instruments[2], CONFIG.categories[0].instruments[2].scale);
    // d) Stress Likert (with reverse scoring handled in SCORING later)
    renderLikertGroup(secPersonal.body, CONFIG.categories[0].instruments[3], CONFIG.categories[0].instruments[3].scale);
    // e) Physical Activity Y/N
    renderYNGrid(secPersonal.body, CONFIG.categories[0].instruments[4]);
    $cats.appendChild(secPersonal.wrap);

    // 2) Social & Loneliness
    const secSocial = makeAccordion({ id: "social", label: "Social & Loneliness Assessment", startOpen: false });
    renderLikertGroup(secSocial.body, CONFIG.categories[1].instruments[0], CONFIG.categories[1].instruments[0].scale); // LSNS-6
    renderLikertGroup(secSocial.body, CONFIG.categories[1].instruments[1], CONFIG.categories[1].instruments[1].scale); // UCLA-3
    $cats.appendChild(secSocial.wrap);

    // 3) Sensory Assessment (with TWO sub-accordions)
    const secSensory = makeAccordion({ id: "sensory", label: "Sensory Assessment", startOpen: false });
    // Sub: HHIE-S
    const subHearing = makeAccordion({ id: "hearing", label: "Hearing (HHIE-S)", startOpen: false });
    renderLikertGroup(subHearing.body, CONFIG.categories[2].instruments[0], CONFIG.categories[2].instruments[0].scale);
    secSensory.body.appendChild(subHearing.wrap);
    // Sub: VFQ-3of7
    const subVision = makeAccordion({ id: "vision", label: "Vision (VFQ-3 of 7)", startOpen: false });
    renderLikertGroup(subVision.body, CONFIG.categories[2].instruments[1], CONFIG.categories[2].instruments[1].scale);
    secSensory.body.appendChild(subVision.wrap);
    $cats.appendChild(secSensory.wrap);

    // 4) Medications (from instruments_config.json, with brand names)
    const secMeds = makeAccordion({ id: "meds", label: "Medication Threat Assessment", startOpen: false });
    if (STATE.instruments?.medications?.items?.length) {
      // Group by class if provided; otherwise flat
      const groups = groupBy(STATE.instruments.medications.items, it => it.class || "Medications");
      for (const [gname, items] of groups.entries()) {
        renderChecklistWithHelpers(secMeds.body, gname, items, "meds");
      }
    }
    $cats.appendChild(secMeds.wrap);

    // 5) Micro/Nanoplastic Exposure (helper text required)
    const secMicro = makeAccordion({ id: "microplastics", label: "Micro/Nanoplastic Exposure Assessment", startOpen: false });
    if (STATE.instruments?.microplastics?.items?.length) {
      renderChecklistWithHelpers(secMicro.body, "Micro/Nanoplastic Exposure", STATE.instruments.microplastics.items, "helper");
    }
    $cats.appendChild(secMicro.wrap);

    // 6) Toxin Exposure (helper text required)
    const secTox = makeAccordion({ id: "toxins", label: "Toxin Exposure Assessment", startOpen: false });
    if (STATE.instruments?.toxins?.items?.length) {
      renderChecklistWithHelpers(secTox.body, "Toxin Exposure", STATE.instruments.toxins.items, "helper");
    }
    $cats.appendChild(secTox.wrap);

    // 7) Brain Threat Foods and Additives (helper text required)
    const secFoods = makeAccordion({ id: "foods", label: "Brain Threat Foods and Additives Assessment", startOpen: false });
    if (STATE.instruments?.foods?.items?.length) {
      renderChecklistWithHelpers(secFoods.body, "Brain Threat Foods & Additives", STATE.instruments.foods.items, "helper");
    }
    $cats.appendChild(secFoods.wrap);

    // Live updates to summary/scoring
    wireLiveUpdates();
  }

  function groupBy(arr, fn) {
    const m = new Map();
    for (const x of arr || []) {
      const k = String(fn(x));
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  }

  // ---------- INIT ----------

  async function init() {
    try {
      hideRedBanner();

      // 1) Load CSV and build strict dictionaries
      const csv = await loadCSV(CSV_PATH);
      buildCsvDictionaries(csv);

      // 2) Load instruments_config.json (declares items & csvKey per item)
      const instruments = await loadJSON(INSTR_PATH);
      STATE.instruments = instruments;

      // 3) Validate that every declared csvKey exists in CSV
      validateInstrumentCsvKeys(instruments);

      // 4) Render full UI
      renderAll();

      // 5) Wire global buttons after UI exists
      wireGlobalButtons();

      // 6) Initial empty summary
      if (window.SUMMARY && typeof window.SUMMARY.updateSummary === "function") {
        window.SUMMARY.updateSummary(collectAllResponses());
      }
    } catch (err) {
      // If we reach here, a strict violation or load error occurred
      if ($banner.style.display !== "block") {
        showRedBanner("Initialization failed.", String(err && err.message ? err.message : err));
      }
      // Do not proceed further (STOP)
      console.error(err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
