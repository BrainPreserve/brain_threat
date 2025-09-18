// assets/summary.js
(function () {
  "use strict";

  // Public API:
  //   window.BT_SUMMARY.render(scoringObject)
  //
  // Responsibilities:
  // - Convert the structured output from BT_SCORING.compute(...) into a deterministic,
  //   human-readable text summary.
  // - Do NOT read CSV; do NOT infer thresholds. We only format what scoring.js already computed.
  // - Respect global containers/IDs defined in assets/config.js.

  const CFG = window.BT_CONFIG || {
    ui: { ids: { summaryContent: "bt-summary-content" } },
  };

  // -----------------------------
  // Helpers (pure formatting)
  // -----------------------------
  const isNum = (v) => v !== null && v !== undefined && !Number.isNaN(Number(v));
  const toFixed = (v, d = 1) => (isNum(v) ? Number(v).toFixed(d) : "");

  function bandLabel(band) {
    if (!band || (!band.label && !band.level)) return "";
    if (band.label && band.level) return `${band.label} (${band.level})`;
    return band.label || band.level || "";
  }

  function line(...xs) {
    return xs.filter(Boolean).join(" ");
  }

  // Per-instrument one-liner—never invents values; only prints what exists.
  function instrumentLine(inst) {
    const t = (s) => (s ? s : "");
    switch (inst.type) {
      case "likert": {
        const core = line(
          `• ${t(inst.title)}`,
          isNum(inst.total) ? `
