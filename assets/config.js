// assets/config.js
(function () {
  "use strict";

  // Global, deterministic configuration consumed by assets/app.js, assets/scoring.js, and assets/summary.js
  const CONFIG = {
    // ---- Data locations (do not change without explicit approval) ----
    paths: {
      configJson: "data/instruments_config.json", // structure & scoring come from code/config, not CSV
      masterCsv:  "data/master.csv",              // helper/example text (threat), medication brand names
    },

    // Always bypass caches to prevent stale assets during iteration/deploys
    fetchInit: {
      cache: "no-store",
    },

    // ---- UI defaults / invariants ----
    ui: {
      startCollapsed: true,                 // all 7 category cards + sub-accordions start collapsed
      caretClosed: "▸",                     // right-pointing caret when closed
      caretOpen:   "▾",                     // down-pointing caret when open
      sectionClearLabel: "Clear This Section",
      ids: {
        alert: "bt-alert",                  // red-banner assertion container
        categories: "bt-categories",        // container where all category cards render
        summaryContent: "bt-summary-content",
        copySummaryBtn: "btn-copy-summary",
        clearAllBtn: "btn-clear-all",
      },
      classes: {
        card: "card",
        cardHeader: "card-header",
        cardBody: "card-body",
        caret: "caret",
        cardActions: "card-actions",
        btnPrimary: "primary",
        btnDanger: "danger",
        btnGhost: "ghost",
      },
    },

    // ---- CSV contract (STRICT) ----
    csv: {
      // Require these headers exactly; the app will raise a visible RED BANNER if any are missing.
      requiredHeaders: ["instrument_id", "item_key", "threat", "brand_name"],
      // Build lookups ONLY as specified; keys are normalized to lower-case before lookup.
      lookups: {
        threatByKey: true, // threatByKey[item_key.toLowerCase()] = threat
        brandByKey:  true, // brandByKey[item_key.toLowerCase()]  = brand_name
      },
      normalizeKeysToLowerCase: true,
    },

    // ---- Determinism & guardrails ----
    strict: {
      // If a required CSV column is missing OR an item’s csvKey does not map, show a RED banner and log details.
      redBannerOnMissing: true,
      // Do not infer/guess fields, options, or thresholds from CSV.
      noHeuristics: true,
    },
  };

  // Expose to other modules
  window.BT_CONFIG = CONFIG;
})();
