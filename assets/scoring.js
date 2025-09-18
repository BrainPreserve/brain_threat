/* BrainPreserve — Brain Threat Analysis
   SCORING ENGINE (no UI here)
   - Pure functions that compute scores, tiers, and normalized percentages.
   - Reads bands and settings from:
       1) window.BT_CFG (from assets/config.js)  [always available]
       2) window.BT_CONFIG (JSON from data/instruments_config.json) [available by the time app.js calls us]
   - Exposes a single global: window.BT_Scoring
*/
(function(){
  // -----------------------------
  // Helpers
  // -----------------------------
  function getConfig(){
    // BT_CFG is loaded first; BT_CONFIG is loaded by app.js before scoring is called.
    const base = (typeof window!=="undefined" && window.BT_CFG) ? window.BT_CFG : { paths:{}, ui:{} };
    const form = (typeof window!=="undefined" && window.BT_CONFIG) ? window.BT_CONFIG : { bands:{}, scales:{} };
    return { base, form };
  }

  function pickBand(value, bands){
    if (bands && Array.isArray(bands)) {
      for (const b of bands){
        if (value >= b.min && value <= b.max) return b.label;
      }
    }
    return "—";
  }

  function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
  function pct(score, max){ return max>0 ? Math.round((score / max) * 100) : 0; }

  // Map text tiers to a 1..4 threat weight for composite building
  // (Higher = worse threat; used only for internal normalization.)
  const TIER_WEIGHT = {
    "Very High": 4, "very high": 4,
    "High": 3, "high": 3, "Significant/High Risk (26–40) — Refer": 4,
    "Moderate": 2, "moderate": 2, "Mild–Moderate Risk (10–24)": 2,
    "Some/Lower": 1, "Lower": 1, "neutral": 1, "some": 1, "No significant sleep concerns": 1, "Low": 1, "Low Stress": 1,
    "Low loneliness": 1, "Low risk (socially well-connected)": 1, "Low Risk (0–8)": 1
  };

  function tierWeight(label){
    if (!label) return 1;
    return TIER_WEIGHT.hasOwnProperty(label) ? TIER_WEIGHT[label] : 1;
  }

  // -----------------------------
  // Personal: Demographics (Age/BMI), History (Y/N), Sleep (Likert), Stress (Likert), Activity (Y/N)
  // answers.personal: {
  //   sex: "Female" | "Male" | "Other...",
  //   age: number | null,
  //   units: "US" | "Metric",
  //   height: { ft?, in?, m? }, weight: { lb?, kg? },
  //   history: { heart?: "Yes"|"No", ... },
  //   sleep: { sleep1..sleep6?: 0..4 },
  //   stress:{ stress1..stress4?: 0..4 },
  //   activity:{ steps?:"Yes"|"No", aerobic?:"Yes"|"No", strength?:"Yes"|"No" }
  // }
  // -----------------------------
  function computeBMI(units, height, weight){
    if (units === "US"){
      const ft = parseFloat(height?.ft), inches = parseFloat(height?.in), lb = parseFloat(weight?.lb);
      if (ft>0 && inches>=0 && lb>0){
        const m = (ft*12 + inches)*0.0254;
        const kg = lb*0.45359237;
        return kg/(m*m);
      }
      return null;
    } else {
      const m = parseFloat(height?.m), kg = parseFloat(weight?.kg);
      if (m>0 && kg>0) return kg/(m*m);
      return null;
    }
  }

  function sumLikert(group, reverseIds){
    // group: {key: 0..4}; reverseIds: Set of ids to reverse (4 - v)
    let sum = 0, answered = 0;
    if (!group) return { sum:0, answered:0 };
    for (const [k, vRaw] of Object.entries(group)){
      const v = Number(vRaw);
      if (!isNaN(v)){
        const vv = reverseIds && reverseIds.has(k) ? (4 - v) : v;
        sum += vv; answered++;
      }
    }
    return { sum, answered };
  }

  function computePersonal(answers){
    const { form } = getConfig();
    const bands = form.bands || {};
    const sleepBands = bands.sleepBands || [];
    const stressBands = bands.stressBands || [];
    const ageBands = bands.ageBands || [];
    const bmiBands = bands.bmiBands || [];

    // Age/BMI tiers (textual)
    const age = Number(answers?.age);
    const ageTier = isNaN(age) ? "—" : pickBand(age, ageBands);

    const bmiVal = computeBMI(answers?.units, answers?.height, answers?.weight);
    const bmiTier = typeof bmiVal === "number" ? pickBand(bmiVal, bmiBands) : "—";

    // History Y/N → if Yes, use mapped tier; we'll normalize to a 1..4 weight list
    const historyDefs = (form.sections.find(s=>s.id==="personal")?.subsections.find(ss=>ss.id==="history_yesno")?.items) || [];
    const historyRisks = [];
    let historyScore=0, historyMax = historyDefs.length * 4;
    if (answers?.history){
      for (const def of historyDefs){
        const v = answers.history[def.id]; // "Yes" | "No" | undefined
        if (v === "Yes"){
          historyRisks.push({ id:def.id, tier:def.yesTier });
          historyScore += tierWeight(def.yesTier);
        }
      }
    }

    // Sleep Likert 0..4 * 6
    const { sum:sleepSum } = sumLikert(answers?.sleep, /*reverse*/null);
    const sleepTier = pickBand(sleepSum, sleepBands);
    const sleepScore = sleepSum;     // 0..24
    const sleepMax   = 24;

    // Stress Likert 0..4 * 4 (reverse items 2,3)
    const rev = new Set(["stress2","stress3"]);
    const { sum:stressSum } = sumLikert(answers?.stress, rev);
    const stressTier = pickBand(stressSum, stressBands);
    const stressScore = stressSum;   // 0..16
    const stressMax   = 16;

    // Activity Y/N → if "No", use noTier
    const activityDefs = (form.sections.find(s=>s.id==="personal")?.subsections.find(ss=>ss.id==="activity_yesno")?.items) || [];
    const activityRisks = [];
    let activityScore=0, activityMax = activityDefs.length * 4;
    if (answers?.activity){
      for (const def of activityDefs){
        const v = answers.activity[def.id];
        if (v === "No"){
          activityRisks.push({ id:def.id, tier:def.noTier });
          activityScore += tierWeight(def.noTier);
        }
      }
    }

    // Convert age/BMI tiers into normalized threat weights (1..4) so they also contribute to composite
    const ageW = tierWeight(ageTier), bmiW = tierWeight(bmiTier);
    const ageMax=4, bmiMax=4;

    // Personal composite (normalized across all parts)
    const parts = [
      {score:ageW,       max:ageMax},
      {score:bmiW,       max:bmiMax},
      {score:historyScore, max:historyMax},
      {score:activityScore,max:activityMax},
      {score:sleepScore, max:sleepMax},
      {score:stressScore,max:stressMax}
    ];
    const totScore = parts.reduce((a,p)=>a+p.score,0);
    const totMax   = parts.reduce((a,p)=>a+p.max,0);
    const totPct   = pct(totScore, totMax);

    // Map to overall personal tier using the same 0–100 → 4 bins as global for stability
    const personalTier =
      (totPct>=75) ? "Very High" :
      (totPct>=50) ? "High"      :
      (totPct>=25) ? "Moderate"  : "Low";

    return {
      id: "personal",
      score: totScore, max: totMax, pct: totPct, tier: personalTier,
      details: {
        age: { value: isNaN(age)? null : age, tier: ageTier, weight: ageW },
        bmi: { value: typeof bmiVal==="number" ? Number(bmiVal.toFixed(1)) : null, tier: bmiTier, weight: bmiW },
        history: { risks: historyRisks, score: historyScore, max: historyMax },
        activity:{ risks: activityRisks, score: activityScore, max: activityMax },
        sleep:   { sum: sleepScore, max: sleepMax, tier: sleepTier },
        stress:  { sum: stressScore, max: stressMax, tier: stressTier }
      }
    };
  }

  // -----------------------------
  // Social & Loneliness
  // answers.social: {
  //   lsns: { lsns1..lsns6?: 0..5 },   // lower total = worse network
  //   ucla: { ucla1..ucla3?: 1..3 }    // higher total = more lonely
  // }
  // -----------------------------
  function computeSocial(answers){
    const { form } = getConfig();
    const bands = form.bands || {};
    const lsnsBands = bands.lsnsBands || [];
    const uclaBands = bands.uclaBands || [];

    // LSNS sum 0..30 (lower is worse)
    const { sum:lsnsSum } = sumLikert(answers?.lsns, /*reverse*/null); // values already 0..5
    const lsnsTier = pickBand(lsnsSum, lsnsBands);

    // UCLA sum 3..9 (higher is worse)
    // Our inputs are 1..3 per item; sumLikert (0..4) isn't used here; compute directly:
    let uclaSum=0, uclaAnswered=0;
    if (answers?.ucla){
      for (const v of Object.values(answers.ucla)){
        const n = Number(v);
        if (!isNaN(n)){ uclaSum += n; uclaAnswered++; }
      }
    }
    const uclaTier = pickBand(uclaSum, uclaBands);

    // Convert to threat where higher = worse (match your WP logic):
    const lsnsThreat = 30 - lsnsSum; // 0 (best)..30 (worst)
    const uclaThreat = uclaSum - 3;  // 0 (best)..6 (worst)

    const score = lsnsThreat + uclaThreat; // 0..36
    const max   = 36;
    const p     = pct(score, max);

    const tier =
      (p>=75) ? "Very High" :
      (p>=50) ? "High"      :
      (p>=25) ? "Moderate"  : "Low";

    return {
      id: "social",
      score, max, pct: p, tier,
      details: {
        lsns: { sum: lsnsSum, tier: lsnsTier },
        ucla: { sum: uclaSum, tier: uclaTier }
      }
    };
  }

  // -----------------------------
  // Sensory (Hearing: HHIE-S; Vision: VFQ-3-of-7)
  // answers.sensory: {
  //   hhies: { h1..h10?: 0|2|4 },  // Yes=4, Sometimes=2, No=0
  //   vfq7:  { v1..v7?: 1..6 }     // routing uses 3 of 7 items
  // }
  // -----------------------------
  function scoreHHIES(h){
    // Sum 10 items, 0..40
    let sum=0, answered=0;
    if (h){
      for (const v of Object.values(h)){
        const n = Number(v); if (!isNaN(n)){ sum+=n; answered++; }
      }
    }
    return { sum, answered };
  }

  function scoreVFQ3of7(v){
    // Reproduce your validated 3-of-7 routing.
    // Returns score 0..100 (higher = better)
    if (!v) return { score:null, used:[], complete:false };

    const A11b = Number(v["v1"]); // required first
    if (isNaN(A11b)) return { score:null, used:[], complete:false };

    let p = 1.145 - 0.085*A11b;
    const used = ["1"];

    function need(name){ const n = Number(v[name]); return isNaN(n) ? null : n; }

    if (A11b === 1){
      const A3 = need("v2"); if (A3===null) return { score:null, used, complete:false };
      p -= 0.043*A3; used.push("2");
      if (A3 < 3){
        const q2 = need("v4"); if (q2===null) return { score:null, used, complete:false };
        p -= 0.029*q2; used.push("4");
      } else {
        const q17 = need("v5"); if (q17===null) return { score:null, used, complete:false };
        p -= 0.054*q17; used.push("5");
      }
    } else {
      const q11 = need("v3"); if (q11===null) return { score:null, used, complete:false };
      p -= 0.104*q11; used.push("3");
      if (q11 === 1){
        const q24 = need("v6"); if (q24===null) return { score:null, used, complete:false };
        p -= 0.058*q24; used.push("6");
      } else {
        const A9 = need("v7"); if (A9===null) return { score:null, used, complete:false };
        p -= 0.031*A9; used.push("7");
      }
    }

    p = clamp(p, 0.001, 0.999);
    const score = 72.63 - 31.44*p - 9.423*Math.log(p/(1-p));
    // Program-level functional tiers (higher=better) will be assigned in summary/renderer.
    return { score: clamp(score, 0, 100), used, complete:true };
  }

  function computeSensory(answers){
    const { form } = getConfig();
    const hhBands = (form.bands && form.bands.hhiesBands) || [];

    // HHIE-S
    const { sum:hhSum } = scoreHHIES(answers?.hhies);
    const hhTier = pickBand(hhSum, hhBands);  // text like "Low Risk (0–8)" etc.

    // VFQ-3-of-7 (higher = better). We convert to threat (100 - score) for composite.
    const vres = scoreVFQ3of7(answers?.vfq7);
    const vfqScore = (vres && vres.complete) ? vres.score : null;

    // Normalize to a composite threat percentage for the Sensory section:
    //  - Hearing threat component: hhSum / 40 (0..1)
    //  - Vision threat component: (100 - vfq)/100 (0..1) if available; if not answered, weight only hearing.
    let compScore=0, compMax=0;

    // Hearing contributes 40 points of threat space; Vision contributes 100 points.
    compScore += hhSum; compMax += 40;
    if (typeof vfqScore === "number"){
      compScore += (100 - vfqScore); // 0 (best) .. 100 (worst)
      compMax   += 100;
    }

    const p = pct(compScore, compMax || 40); // avoid /0; if no vision, use 40

    const tier =
      (p>=75) ? "Very High" :
      (p>=50) ? "High"      :
      (p>=25) ? "Moderate"  : "Low";

    return {
      id: "sensory",
      score: compScore, max: compMax || 40, pct: p, tier,
      details: {
        hearing: { sum: hhSum, tier: hhTier, max: 40 },
        vision:  { score: vfqScore, used: (vres?.used)||[], complete: !!(vres && vres.complete) }
      }
    };
  }

  // -----------------------------
  // Combine sections → Overall Risk Tier
  // Input: array of section results: [{id, score, max, pct, tier}, ...]
  // Uses BT_CFG.overallRiskTiers thresholds on 0..100 composite.
  // -----------------------------
  function combineSections(sections){
    const { base } = getConfig();
    const tiers = base.overallRiskTiers || [
      {minPct:0, maxPct:24, label:"Low"},
      {minPct:25, maxPct:49, label:"Moderate"},
      {minPct:50, maxPct:74, label:"High"},
      {minPct:75, maxPct:100,label:"Very High"}
    ];
    // Weighted average by each section's max space to avoid bias
    let totScore=0, totMax=0;
    for (const s of sections){
      if (typeof s?.score === "number" && typeof s?.max === "number" && s.max>0){
        totScore += s.score;
        totMax   += s.max;
      }
    }
    const totalPct = pct(totScore, totMax);
    let label = "Low";
    for (const t of tiers){
      if (totalPct >= t.minPct && totalPct <= t.maxPct){ label = t.label; break; }
    }
    return { totalPct, tier: label, score: totScore, max: totMax };
  }

  // -----------------------------
  // Public API
  // -----------------------------
  const API = {
    computePersonal,
    computeSocial,
    computeSensory,
    combineSections
  };

  try { Object.defineProperty(window, "BT_Scoring", { value: API, writable:false, configurable:false }); }
  catch(e){ window.BT_Scoring = API; }
})();
