/* BrainPreserve — Brain Threat Analysis
   SUMMARY ENGINE (deterministic, “GPT-like” narratives; no UI code)
   - Inputs:
       • section results from BT_Scoring (personal/social/sensory)
       • optional CSV rows from BT_Data (loaded by app.js from data/master.csv)
   - Outputs:
       • Per-section narrative (bullet points + coaching guidance)
       • Overall narrative (integrates sections; adds next-step coaching)
   - Exposes: window.BT_Summary
*/
(function(){
  // -----------------------------
  // Helpers
  // -----------------------------
  function fmt(val){ return (val===null || val===undefined || Number.isNaN(val)) ? "—" : String(val); }
  function pct(n){ return (typeof n==="number" ? `${n}%` : "—"); }
  function dedupe(arr){ return Array.from(new Set(arr.filter(Boolean))); }

  // Pull relevant CSV rows per section. We keep a conservative, deterministic map.
  // Your master.csv includes instrument_id values like: activity, foods, hearing, history, loneliness,
  // meds, microplastics, personal, socialization, stress, toxins, vision, etc.
  // We group them by section so summaries can cite threats/mechanisms/mitigation where appropriate.
  const SECTION_CSV_MAP = {
    personal: ["personal", "history", "activity", "sleep", "stress"],
    social:   ["socialization", "loneliness"],
    sensory:  ["hearing", "vision"]
  };

  function selectCsvForSection(sectionId, csvRows){
    if (!Array.isArray(csvRows) || !csvRows.length) return [];
    const keys = SECTION_CSV_MAP[sectionId] || [];
    const sel  = csvRows.filter(r => r && keys.includes(String(r.instrument_id||"").toLowerCase()));
    // Keep it bounded for readability; app.js may pass a lot of rows.
    return sel.slice(0, 200);
  }

  function takeTopText(rows, field, maxItems){
    if (!Array.isArray(rows)) return [];
    const texts = rows.map(r => (r && r[field]) ? String(r[field]).trim() : "").filter(Boolean);
    // Normalize punctuation/spacing lightly
    const cleaned = texts.map(t => t.replace(/\s+/g,' ').replace(/\s+([,.;:])/g,'$1'));
    return dedupe(cleaned).slice(0, maxItems);
  }

  // Deterministic, tier-based guidance sentences (kept here to centralize tone)
  function guidanceForTier(domain, tier){
    // domain ∈ "Personal", "Social", "Sensory"
    const G = {
      Personal: {
        Low: [
          "Maintain current routines and continue periodic screening.",
          "Reinforce sleep regularity, daily physical activity, and balanced nutrition."
        ],
        Moderate: [
          "Tighten sleep window, optimize light exposure, and add ≥150 min/wk aerobic activity.",
          "Address modifiable medical risks with coach-guided habit plans."
        ],
        High: [
          "Prioritize structured sleep hygiene and progressive activity; coordinate with PCP for risk factor management.",
          "Schedule near-term coaching touchpoints to support adherence."
        ],
        "Very High": [
          "Escalate coordinated care: formal evaluation for sleep or cardiometabolic contributors.",
          "Set weekly goals with active monitoring and feedback loops."
        ]
      },
      Social: {
        Low: [
          "Leverage existing social network for engagement and accountability.",
          "Maintain 2–3 meaningful interactions per week."
        ],
        Moderate: [
          "Increase planned interactions to 2–3×/week and add interest-based groups.",
          "Consider structured social prescriptions (classes, clubs, volunteer roles)."
        ],
        High: [
          "Implement coach-guided social activation plan with concrete scheduling.",
          "Screen for mood symptoms; pair with light-to-moderate physical activity."
        ],
        "Very High": [
          "Intensive social connection plan with caregiver/family support.",
          "Evaluate for depression or anxiety and coordinate referral as needed."
        ]
      },
      Sensory: {
        Low: [
          "Maintain routine eye and hearing care; optimize lighting and listening environments."
        ],
        Moderate: [
          "Update refraction; trial task lighting and contrast tools; consider audiology consult."
        ],
        High: [
          "Arrange audiology assessment; assess for cataract/retina disease; environmental adaptations."
        ],
        "Very High": [
          "Expedited referral for comprehensive evaluation and low-vision/hearing support services."
        ]
      }
    };
    const list = (G[domain] && G[domain][tier]) ? G[domain][tier] : [];
    return list.slice(0, 2); // keep it concise and deterministic
  }

  // Compose a bullet block with optional CSV-sourced details
  function composeSectionBlock(title, tier, details, csvRows){
    const lines = [];
    lines.push(`${title}`);
    lines.push(`• Risk tier: ${tier}.`);

    // Domain-specific detail lines
    if (details && title.startsWith("Personal")){
      const age = details.age ? `${fmt(details.age.value)} → ${fmt(details.age.tier)}` : "—";
      const bmi = details.bmi ? `${fmt(details.bmi.value)} → ${fmt(details.bmi.tier)}` : "—";
      lines.push(`• Age: ${age}.`);
      lines.push(`• BMI: ${bmi}.`);
      if (details.history && Array.isArray(details.history.risks) && details.history.risks.length){
        const riskTxt = details.history.risks.map(r => r && r.tier ? r.tier : "").filter(Boolean);
        if (riskTxt.length) lines.push(`• Medical/Lifestyle flags: ${dedupe(riskTxt).join(", ")}.`);
      }
      if (details.sleep)  lines.push(`• Sleep score: ${fmt(details.sleep.sum)}/${fmt(details.sleep.max)} → ${fmt(details.sleep.tier)}.`);
      if (details.stress) lines.push(`• Stress score: ${fmt(details.stress.sum)}/${fmt(details.stress.max)} → ${fmt(details.stress.tier)}.`);
    }

    if (details && title.startsWith("Social")){
      if (details.lsns)  lines.push(`• LSNS-6: ${fmt(details.lsns.sum)}/30 → ${fmt(details.lsns.tier)}.`);
      if (details.ucla)  lines.push(`• UCLA-3: ${fmt(details.ucla.sum)}/9 → ${fmt(details.ucla.tier)}.`);
    }

    if (details && title.startsWith("Sensory")){
      if (details.hearing) lines.push(`• HHIE-S: ${fmt(details.hearing.sum)}/40 → ${fmt(details.hearing.tier)}.`);
      if (details.vision){
        const vtxt = (typeof details.vision.score === "number") ? `${details.vision.score.toFixed(1)}/100` : "—";
        lines.push(`• VFQ-3of7: ${vtxt}.`);
      }
    }

    // CSV-based clinical context (threats/mechanisms/mitigation)
    const threats     = takeTopText(csvRows, "threat", 3);
    const mechanisms  = takeTopText(csvRows, "mechanisms", 3);
    const mitigation  = takeTopText(csvRows, "mitigation_strategies", 4);

    if (threats.length){    lines.push("\nKey risk themes"); threats.forEach(t => lines.push(`• ${t}`)); }
    if (mechanisms.length){ lines.push("\nMechanisms (plausible pathways)"); mechanisms.forEach(m => lines.push(`• ${m}`)); }
    if (mitigation.length){ lines.push("\nActionable mitigation"); mitigation.forEach(a => lines.push(`• ${a}`)); }

    // Deterministic guidance based on tier
    const domain = title.split(" ")[0]; // "Personal" | "Social" | "Sensory"
    const recs = guidanceForTier(domain, tier);
    if (recs.length){
      lines.push("\nCoaching guidance (immediate focus)");
      recs.forEach(r => lines.push(`• ${r}`));
    }

    return lines.join("\n");
  }

  // -----------------------------
  // Public API
  // -----------------------------
  function buildSectionSummaries(sectionResults, csvAllRows){
    // sectionResults: array of { id, tier, details, ... } from BT_Scoring
    // csvAllRows: parsed array from master.csv (optional but recommended)
    const out = {};
    for (const s of (sectionResults||[])){
      const csvSubset = selectCsvForSection(s.id, csvAllRows);
      const title =
        (s.id==="personal") ? "Personal Assessment" :
        (s.id==="social")   ? "Social & Loneliness" :
        (s.id==="sensory")  ? "Sensory (Hearing • Vision)" : (s.id||"Section");
      out[s.id] = composeSectionBlock(title, s.tier, s.details||{}, csvSubset);
    }
    return out; // { personal: "…", social: "…", sensory: "…" }
  }

  function buildOverallSummary(sectionResults){
    // Compute overall via BT_Scoring.combineSections, then add deterministic plan lines
    if (!window.BT_Scoring) return "Summary unavailable (scoring not loaded).";
    const comb = window.BT_Scoring.combineSections(sectionResults||[]);
    const lines = [];
    lines.push("Overall Risk Summary");
    lines.push(`• Composite risk: ${comb.tier} (${pct(comb.totalPct)} of total threat space).`);

    // Identify top two sections by contribution (percent of their own max)
    const ranked = (sectionResults||[])
      .map(s => ({ id:s.id, label:(s.id==="personal"?"Personal":s.id==="social"?"Social & Loneliness":s.id==="sensory"?"Sensory":"Section"),
                   pct: (typeof s.pct==="number"? s.pct : 0), tier: s.tier }))
      .sort((a,b)=> (b.pct - a.pct));
    const top = ranked.slice(0,2);
    if (top.length){
      lines.push("\nHighest-priority domains");
      top.forEach(t => lines.push(`• ${t.label}: ${t.tier} (${t.pct}%)`));
    }

    // Deterministic next steps by overall tier
    const tier = comb.tier;
    const NEXT = {
      Low: [
        "Maintain protective routines; re-screen on a regular cadence.",
        "Continue foundational actions: sleep regularity, activity, nutrition, social engagement."
      ],
      Moderate: [
        "Implement 1–2 targeted behavior changes this week with coach follow-up.",
        "Begin lightweight monitoring (sleep schedule, steps, stress triggers)."
      ],
      High: [
        "Initiate a structured 4–8 week plan with weekly adherence checks.",
        "Coordinate with PCP for medical contributors and consider referrals (sleep, audiology, vision) where indicated."
      ],
      "Very High": [
        "Prioritize medical evaluation and multi-domain intervention; set short-interval follow-ups.",
        "Deploy monitoring (e.g., sleep diary/actigraphy proxy, step goals, BP/HRV if available) to provide feedback."
      ]
    };
    (NEXT[tier]||[]).forEach(n => lines.push(`• ${n}`));

    // Footer line from config (tone consistency)
    const foot = (window.BT_CFG && window.BT_CFG.copy && window.BT_CFG.copy.summaryIntro) || "";
    if (foot) lines.push(`\n${foot}`);

    return lines.join("\n");
  }

  const API = {
    buildSectionSummaries,
    buildOverallSummary
  };

  try { Object.defineProperty(window, "BT_Summary", { value: API, writable:false, configurable:false }); }
  catch(e){ window.BT_Summary = API; }
})();
