// assets/scoring.js
(function () {
  "use strict";

  // Public API: window.BT_SCORING.compute(payload)
  // - Reads ONLY from instruments_config.json (payload.config) and current responses (payload.responses)
  // - Applies EXACT scoring/banding rules encoded in the config (no CSV influence)
  // - Returns a structured object that summary.js will render

  // -----------------------------
  // Utilities
  // -----------------------------
  const isNum = (v) => v !== null && v !== undefined && !Number.isNaN(Number(v));
  const toNum = (v, d = 0) => (isNum(v) ? Number(v) : d);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Map a numeric value into a band from config: [{min, max, label, level}]
  function bandFromCuts(value, bands = []) {
    for (const b of bands) {
      if ((b.min === undefined || value >= b.min) && (b.max === undefined || value <= b.max)) {
        return { label: b.label || "", level: b.level || "", min: b.min, max: b.max };
      }
    }
    return { label: "", level: "" };
  }

  // Map a PERCENT (0–100) into bands
  function bandFromPercent(pct, percentBands = []) {
    return bandFromCuts(pct, percentBands);
  }

  // Likert computation (supports reverse-scored items)
  // inst.likert.scaleMax: number (e.g., 4)
  // inst.items: [{ key, reverse?: true }]
  function computeLikert(inst, responses) {
    const scaleMax = toNum(inst.likert?.scaleMax, 4);
    let total = 0;
    let answered = 0;

    if (Array.isArray(inst.items)) {
      for (const it of inst.items) {
        const raw = toNum(responses[it.key], null);
        if (raw === null) continue;
        const val = it.reverse ? clamp(scaleMax - raw, 0, scaleMax) : clamp(raw, 0, scaleMax);
        total += val;
        answered += 1;
      }
    }
    const res = {
      type: "likert",
      total,
      answered,
      max: (Array.isArray(inst.items) ? inst.items.length : 0) * scaleMax,
      bands: inst.likert?.bands || [],
    };
    const b = bandFromCuts(total, res.bands);
    return { ...res, band: b };
  }

  // Radio group as numeric sum (used if a scale is modeled via radio instead of likert)
  function computeRadio(inst, responses) {
    let total = 0;
    let answered = 0;
    if (Array.isArray(inst.items)) {
      for (const it of inst.items) {
        const raw = responses[it.key];
        if (raw === undefined || raw === "") continue;
        total += toNum(raw, 0);
        answered += 1;
      }
    }
    const res = {
      type: "radio",
      total,
      answered,
      max: Array.isArray(inst.items)
        ? inst.items.reduce((m, it) => Math.max(m, toNum(it.maxValue ?? it.max ?? 0)), 0)
        : 0,
      bands: inst.bands || [],
    };
    const b = bandFromCuts(total, res.bands);
    return { ...res, band: b };
  }

  // Y/N list: sum points for checked items (supports per-item scoreIfChecked / scoreIfUnchecked)
  function computeYnList(inst, responses) {
    let total = 0;
    let answered = 0;

    if (Array.isArray(inst.items)) {
      for (const it of inst.items) {
        const v = responses[it.key];
        if (v === undefined) continue;
        answered += 1;
        const checked = v === "1" || v === 1 || v === true || v === "true";
        const pts = checked ? toNum(it.scoreIfChecked, 0) : toNum(it.scoreIfUnchecked, 0);
        total += pts;
      }
    }
    const res = {
      type: "yn_list",
      total,
      answered,
      max: Array.isArray(inst.items)
        ? inst.items.reduce(
            (acc, it) => acc + Math.max(toNum(it.scoreIfChecked, 0), toNum(it.scoreIfUnchecked, 0)),
            0
          )
        : 0,
      bands: inst.bands || [],
    };
    const b = bandFromCuts(total, res.bands);
    return { ...res, band: b };
  }

  // Weighted selects (each item has options with numeric weights)
  // Computes sum, max, percent-of-max, then maps percent into percentBands
  function computeWeightedSelect(inst, responses) {
    let total = 0;
    let max = 0;
    let answered = 0;

    if (Array.isArray(inst.items)) {
      for (const it of inst.items) {
        const options = Array.isArray(it.options) ? it.options : [];
        const selected = toNum(responses[it.key], null);
        const maxOpt = options.reduce((m, op) => Math.max(m, toNum(op.value, 0)), 0);
        max += maxOpt;

        if (selected !== null) {
          answered += 1;
          total += clamp(selected, 0, maxOpt);
        }
      }
    }
    const pct = max > 0 ? (total / max) * 100 : 0;
    const res = {
      type: "weighted_select",
      total,
      max,
      percent: pct,
      answered,
      percentBands: inst.percentBands || [],
    };
    const b = bandFromPercent(pct, res.percentBands);
    return { ...res, band: b };
  }

  // Medications: sum weights of selected meds
  // inst.classes: [{ key, title, meds: [{ key, weight }] }]
  // Optional: inst.bands for total→tier mapping
  function computeMedications(inst, responses) {
    let total = 0;
    let checkedCount = 0;

    if (Array.isArray(inst.classes)) {
      for (const cls of inst.classes) {
        if (!Array.isArray(cls.meds)) continue;
        for (const med of cls.meds) {
          const v = responses[med.key];
          const isChecked = v === "1" || v === 1 || v === true || v === "true";
          if (isChecked) {
            checkedCount += 1;
            total += toNum(med.weight, 0);
          }
        }
      }
    }
    const res = {
      type: "medications",
      total,
      checkedCount,
      bands: inst.bands || [],
    };
    const b = bandFromCuts(total, res.bands);
    return { ...res, band: b };
  }

  // Demographics: compute age band; BMI band from height (cm) & weight (kg) using config cut-points
  function computeDemographics(inst, responses) {
    let age = null;
    let bmi = null;
    let ageBand = { label: "", level: "" };
    let bmiBand = { label: "", level: "" };

    if (inst.fields?.age?.key) {
      const a = toNum(responses[inst.fields.age.key], null);
      if (a !== null) {
        age = a;
        ageBand = bandFromCuts(a, inst.ageBands || []);
      }
    }
    if (inst.fields?.height?.key && inst.fields?.weight?.key) {
      const hCm = toNum(responses[inst.fields.height.key], null);
      const wKg = toNum(responses[inst.fields.weight.key], null);
      if (hCm && wKg) {
        const hM = hCm / 100;
        const calc = wKg / (hM * hM);
        bmi = Math.round(calc * 10) / 10;
        bmiBand = bandFromCuts(bmi, inst.bmiBands || []);
      }
    }
    return {
      type: "demographics",
      age,
      ageBand,
      bmi,
      bmiBand,
    };
  }

  // BMI-only instrument (if present separately)
  function computeBmi(inst, responses) {
    let bmi = null;
    let bmiBand = { label: "", level: "" };
    if (inst.fields?.height?.key && inst.fields?.weight?.key) {
      const hCm = toNum(responses[inst.fields.height.key], null);
      const wKg = toNum(responses[inst.fields.weight.key], null);
      if (hCm && wKg) {
        const hM = hCm / 100;
        const calc = wKg / (hM * hM);
        bmi = Math.round(calc * 10) / 10;
        bmiBand = bandFromCuts(bmi, inst.bmiBands || []);
      }
    }
    return { type: "bmi", bmi, bmiBand };
  }

  // -----------------------------
  // Dispatcher
  // -----------------------------
  function computeInstrument(inst, responses) {
    switch (inst.type) {
      case "demographics":
        return computeDemographics(inst, responses);
      case "bmi":
        return computeBmi(inst, responses);
      case "yn_list":
        return computeYnList(inst, responses);
      case "likert":
        return computeLikert(inst, responses);
      case "radio":
        return computeRadio(inst, responses);
      case "weighted_select":
        return computeWeightedSelect(inst, responses);
      case "medications":
        return computeMedications(inst, responses);
      default:
        return { type: "unknown", note: `Unsupported instrument type: ${inst.type}` };
    }
  }

  // Aggregate per-category summaries if requested by config
  function summarizeCategory(catKey, catDef, instResults) {
    // Optional custom aggregation in config.categories[].summary:
    //   { mode: "sum|percent|custom", sources: ["instKey1","instKey2"], bands: [...] }
    const summaryDef = catDef.summary;
    if (!summaryDef) return null;

    const byKey = Object.create(null);
    instResults.forEach((r) => (byKey[r.key] = r));

    let value = null;
    let percent = null;

    if (summaryDef.mode === "sum") {
      value = 0;
      for (const k of summaryDef.sources || []) {
        const r = byKey[k];
        if (!r) continue;
        if (isNum(r.total)) value += Number(r.total);
      }
    } else if (summaryDef.mode === "percent") {
      // Weighted-select style percent (sum totals / sum max)
      let t = 0,
        m = 0;
      for (const k of summaryDef.sources || []) {
        const r = byKey[k];
        if (!r) continue;
        t += toNum(r.total, 0);
        m += toNum(r.max, 0);
      }
      percent = m > 0 ? (t / m) * 100 : 0;
    } else if (typeof summaryDef.compute === "function") {
      // Not used in static build; reserved for future extensions
    }

    const bands = summaryDef.percentBands || summaryDef.bands || [];
    const band =
      percent !== null ? bandFromPercent(percent, bands) : value !== null ? bandFromCuts(value, bands) : { label: "", level: "" };

    return {
      type: "category_summary",
      value,
      percent,
      band,
    };
  }

  // -----------------------------
  // MAIN
  // -----------------------------
  function compute(payload) {
    const config = payload?.config || {};
    const responses = payload?.responses || {};
    const out = {
      sections: [],
      overall: {},
      debug: { missingInstruments: [] },
    };

    const categories = Array.isArray(config.categories) ? config.categories : [];
    for (const cat of categories) {
      const instResults = [];

      // flat instruments
      if (Array.isArray(cat.instruments)) {
        for (const inst of cat.instruments) {
          const result = computeInstrument(inst, responses);
          instResults.push({ key: inst.key, title: inst.title || "", ...result });
        }
      }

      // sub-accordions instruments
      if (Array.isArray(cat.subAccordions)) {
        for (const sub of cat.subAccordions) {
          if (!Array.isArray(sub.instruments)) continue;
          for (const inst of sub.instruments) {
            const result = computeInstrument(inst, responses);
            instResults.push({ key: inst.key, title: inst.title || "", sub: sub.key, ...result });
          }
        }
      }

      const catSummary = summarizeCategory(cat.key, cat, instResults);

      out.sections.push({
        key: cat.key,
        title: cat.title || "",
        instruments: instResults,
        summary: catSummary,
      });
    }

    // Optional overall aggregator (e.g., sum of category percentages or weighted scheme)
    if (typeof config.overall?.compute === "string") {
      // reserved for future inline expressions (not used here)
    } else if (config.overall?.mode === "percent") {
      let t = 0,
        m = 0;
      for (const sec of out.sections) {
        // sum all weighted_select style instruments
        for (const inst of sec.instruments) {
          if (inst.type === "weighted_select") {
            t += toNum(inst.total, 0);
            m += toNum(inst.max, 0);
          }
        }
      }
      const pct = m > 0 ? (t / m) * 100 : 0;
      const band = bandFromPercent(pct, config.overall.percentBands || []);
      out.overall = { mode: "percent", percent: pct, band };
    } else {
      out.overall = {};
    }

    return out;
  }

  window.BT_SCORING = { compute };
})();
