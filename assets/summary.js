// assets/summary.js
(function () {
  "use strict";

  // Public API:
  //   window.BT_SUMMARY.render(scoringObject)
  // Expects the structure returned by BT_SCORING.compute(...).
  // Writes a deterministic, text-only summary into #bt-summary-content.
  // No CSV reliance; bands/logic come exclusively from config + scoring.

  const CFG = window.BT_CONFIG || {
    ui: { ids: { summaryContent: "bt-summary-content" } },
  };

  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (sel, el = document) => el.querySelector(sel);

  function fmtBand(band) {
    if (!band || (!band.label && !band.level)) return "";
    if (band.label && band.level) return `${band.label} (${band.level})`;
    return band.label || band.level || "";
  }

  function fmtPct(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return "";
    return `${(Number(n)).toFixed(0)}%`;
  }

  function line(...parts) {
    // Join non-empty parts with " — " for consistent readability
    return parts.filter(Boolean).join(" — ");
  }

  function safeNum(n, digits = 0) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return "";
    const f = Number(n);
    return digits > 0 ? f.toFixed(digits) : String(Math.round(f));
  }

  function instrumentLine(inst) {
    // Deterministic one-liner per instrument, based on type
    switch (inst.type) {
      case "demographics": {
        const age = inst.age !== null && inst.age !== undefined ? `${inst.age}` : "";
        const ageBand = fmtBand(inst.ageBand);
        const bmi = inst.bmi !== null && inst.bmi !== undefined ? `${inst.bmi}` : "";
        const bmiBand = fmtBand(inst.bmiBand);

        const agePart = age ? `Age: ${age}${ageBand ? ` — ${ageBand}` : ""}` : "";
        const bmiPart = bmi ? `BMI: ${bmi}${bmiBand ? ` — ${bmiBand}` : ""}` : "";
        return line(inst.title || "Demographics", [agePart, bmiPart].filter(Boolean).join(" • "));
      }

      case "bmi": {
        const bmi = inst.bmi !== null && inst.bmi !== undefined ? `${inst.bmi}` : "";
        const bmiBand = fmtBand(inst.bmiBand);
        return line(inst.title || "BMI", [bmi ? `BMI: ${bmi}` : "", bmiBand].filter(Boolean).join(" • "));
      }

      case "likert": {
        const tot = safeNum(inst.total);
        const max = safeNum(inst.max);
        const band = fmtBand(inst.band);
        return line(inst.title, `Total: ${tot}/${max}`, band);
      }

      case "radio": {
        const tot = safeNum(inst.total);
        const band = fmtBand(inst.band);
        return line(inst.title, `Total: ${tot}`, band);
      }

      case "yn_list": {
        const tot = safeNum(inst.total);
        const max = safeNum(inst.max);
        const band = fmtBand(inst.band);
        return line(inst.title, `Total: ${tot}/${max}`, band);
      }

      case "weighted_select": {
        const tot = safeNum(inst.total);
        const max = safeNum(inst.max);
        const pct = fmtPct(inst.percent);
        const band = fmtBand(inst.band);
        return line(inst.title, `Score: ${tot}/${max}`, `Load: ${pct}`, band);
      }

      case "medications": {
        const tot = safeNum(inst.total);
        const checked = safeNum(inst.checkedCount);
        const band = fmtBand(inst.band);
        // Do not list individual meds here; totals only.
        return line(inst.title || "Medication Threat", `Selected: ${checked}`, `Weight: ${tot}`, band);
      }

      default: {
        // Unknown/unsupported instrument; preserve visibility in summary
        return line(inst.title || inst.key || "Instrument", "No summary available");
      }
    }
  }

  function sectionHeader(sec) {
    return `\n${sec.title || sec.key}\n${"=".repeat((sec.title || sec.key || "").length || 6)}`;
  }

  function sectionSummaryLine(sec) {
    if (!sec.summary) return "";
    const s = sec.summary;
    // Prefer percent summary if available
    if (s.percent !== null && s.percent !== undefined) {
      return line("Section Summary", `Load: ${fmtPct(s.percent)}`, fmtBand(s.band));
    }
    if (s.value !== null && s.value !== undefined) {
      return line("Section Summary", `Total: ${safeNum(s.value)}`, fmtBand(s.band));
    }
    return "";
  }

  function overallSummary(overall) {
    if (!overall) return "";
    if (overall.mode === "percent") {
      const pct = fmtPct(overall.percent);
      const b = fmtBand(overall.band);
      return `\nOverall\n-------\n${line("Aggregate Load", pct, b)}`;
    }
    // If overall not defined, return empty; summary remains per-section.
    return "";
  }

  // -----------------------------
  // Render
  // -----------------------------
  function render(scoring) {
    const target = $("#" + (CFG.ui?.ids?.summaryContent || "bt-summary-content"));
    if (!target) return;

    try {
      const lines = [];
      const sections = Array.isArray(scoring?.sections) ? scoring.sections : [];

      for (const sec of sections) {
        // Section header
        lines.push(sectionHeader(sec));

        // Interleave instruments; include sub-accordion label when present
        for (const inst of sec.instruments || []) {
          const prefix = inst.sub ? `[${inst.sub}] ` : "";
          lines.push(`• ${prefix}${instrumentLine(inst)}`);
        }

        // Optional per-section summary
        const secSum = sectionSummaryLine(sec);
        if (secSum) lines.push(secSum);
      }

      // Optional overall aggregation
      const ov = overallSummary(scoring?.overall);
      if (ov) lines.push(ov);

      // Final write
      target.textContent = lines.join("\n");
    } catch (err) {
      console.error("Summary render error:", err);
      // Keep prior content if rendering fails; app.js alert banner handles compute errors.
    }
  }

  window.BT_SUMMARY = { render };
})();
