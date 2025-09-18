/* BrainPreserve — Brain Threat Analysis
   Global configuration only (no scoring logic here).
   You can tweak titles or paths later without touching any other files.
*/
(function(){
  const CFG = {
    app: {
      title: "BrainPreserve — Brain Threat Analysis (Standalone)",
      // If true, each section starts collapsed (the renderer decides actual behavior)
      startCollapsed: false,
      // Large, readable UI by default
      preferredFontStack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial'
    },

    paths: {
      // JSON that defines all questionnaires, item text, options, and bands
      instrumentsConfig: "data/instruments_config.json",
      // Your single source of truth for threats/risks/mitigation (already prepared)
      masterCSV: "data/master.csv"
    },

    ui: {
      // Show “Copy Summary” and “Clear Form” buttons on the Summary card
      showSummaryButtons: true,
      // Add subtle section notes under headings when available
      showSectionNotes: true,
      // When true, renderer shows a tiny “Loading questions…” placeholder until data is ready
      showLoadingPlaceholders: true
    },

    // Overall risk tier mapping for the TOTAL/combined picture.
    // The app will compute a 0–100 composite percentage from section scores, then map to tiers here.
    overallRiskTiers: [
      { minPct: 0,   maxPct: 24,  label: "Low" },
      { minPct: 25,  maxPct: 49,  label: "Moderate" },
      { minPct: 50,  maxPct: 74,  label: "High" },
      { minPct: 75,  maxPct: 100, label: "Very High" }
    ],

    // VFQ-3of7 routing: keep here so scoring.js can read a single setting
    routing: {
      vfqThreeOfSeven: true
    },

    // Text blocks the Summary module can reuse (kept here so you can adjust tone in one place)
    copy: {
      summaryIntro: "This tool summarizes screening results for coaching and referral guidance; it does not diagnose disease.",
      summaryEmpty: "Complete the sections to see a personalized summary here."
    }
  };

  // Expose as a single read-only global
  try { Object.defineProperty(window, "BT_CFG", { value: CFG, writable: false, configurable: false }); }
  catch(e){ window.BT_CFG = CFG; }
})();
