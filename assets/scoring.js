/* ===========================================================================
   Brain Threat Analysis — SCORING
   Clean rebuild from WP + master.csv (STRICT CONTRACT honored in app.js)
   ---------------------------------------------------------------------------
   PURPOSE
   - Provides deterministic scoring utilities mirrored from WP code semantics.
   - Uses ONLY code-defined rules/weights/bands (NOT the CSV).
   - CSV is used only for helper text / brand names (handled in app.js).

   INPUTS
   - responses: flat map from app.js of the form:
       "<instrumentId>.<itemKey>" => numeric/string value
       For Y/N grids, value is "Yes" or "No".
       For checklists, app.js keys as "<SectionLabel>.<itemKey>" => "1" when checked.
   - CONFIG: global CONFIG object from assets/config.js
   - instruments: parsed data/instruments_config.json (for section item lists, and
                  optional item weights for exposures/foods/medications)

   OUTPUT
   - A structured object with per-category summaries (raw totals and labeled tiers
     where tiers are explicitly defined in WP logic). No heuristics are introduced.

   SAFETY
   - If any computation would require a rule not present in CONFIG or instruments,
     we compute only raw totals and lists—no guessed tiers.
   =========================================================================== */

(function () {
  // -------------------- Utilities --------------------

  function toNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function sum(arr) {
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += toNumber(arr[i], 0);
    return s;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function findTier(bands, value) {
    // bands: [{min, max, label}]
    if (!Array.isArray(bands)) return null;
    for (const band of bands) {
      if (typeof band.min !== "number" || typeof band.max !== "number") continue;
      if (value >= band.min && value <= band.max) return band.label || null;
    }
    return null;
  }

  function reverseLikert(val, max = 4) {
    // Reverse-scoring for PSS items (WP used 0..4 scales)
    const v = toNumber(val, null);
    if (v === null) return null;
    return clamp(max - v, 0, max);
  }

  function ynToBool(v) {
    return String(v).toLowerCase() === "yes";
  }

  // Extract radio (Likert/YN) values for a given instrument spec
  function collectInstrumentValues(responses, instrument) {
    const out = {};
    if (!instrument || !Array.isArray(instrument.items)) return out;
    for (const it of instrument.items) {
      const key = `${instrument.id}.${it.key}`;
      if (Object.prototype.hasOwnProperty.call(responses, key)) {
        out[it.key] = responses[key];
      }
    }
    return out;
  }

  // -------------------- Category Scorers --------------------

  // PERSONAL HISTORY (five sub-questionnaires inside this category)
  function scorePersonal(responses, config) {
    const category = config.categories.find(c => c.id === "personal");
    if (!category) return {};

    const [qHistory, qMedLife, qSleep, qStress, qActivity] = category.instruments;

    // A) History: treat each "Yes" as a risk flag with yesTier from CONFIG
    const historyVals = collectInstrumentValues(responses, qHistory);
    const historyHits = [];
    const historyTiers = {};
    for (const item of qHistory.items) {
      const v = historyVals[item.key];
      if (String(v).toLowerCase() === "yes") {
        historyHits.push(item.key);
        if (item.yesTier) historyTiers[item.key] = item.yesTier;
      }
    }

    // B) Medical & Lifestyle: similar to History
    const medVals = collectInstrumentValues(responses, qMedLife);
    const medHits = [];
    const medTiers = {};
    for (const item of qMedLife.items) {
      const v = medVals[item.key];
      if (String(v).toLowerCase() === "yes") {
        medHits.push(item.key);
        if (item.yesTier) medTiers[item.key] = item.yesTier;
      }
    }

    // C) Sleep (Likert 0..4), explicit severity bands from CONFIG
    const sleepVals = collectInstrumentValues(responses, qSleep);
    const sleepNums = qSleep.items.map(it => toNumber(sleepVals[it.key], 0));
    const sleepTotal = sum(sleepNums);
    const sleepTier = findTier(qSleep.tiers, sleepTotal);

    // D) Stress (PSS-4 with reverse-scored items 2 and 3; bands from CONFIG)
    const stressVals = collectInstrumentValues(responses, qStress);
    const revSet = new Set(qStress.reverse || []);
    const stressNums = qStress.items.map(it => {
      const raw = toNumber(stressVals[it.key], null);
      if (raw === null) return 0;
      if (revSet.has(it.key)) return reverseLikert(raw, 4);
      return clamp(raw, 0, 4);
    });
    const stressTotal = sum(stressNums);
    const stressTier = findTier(qStress.tiers, stressTotal);

    // E) Physical Activity (YN grid; "No" maps to risk tiers via noTier)
    const actVals = collectInstrumentValues(responses, qActivity);
    const activityFlags = {};
    for (const item of qActivity.items) {
      const v = actVals[item.key];
      if (String(v).toLowerCase() === "no" && item.noTier) {
        activityFlags[item.key] = item.noTier;
      }
    }

    return {
      history: { selected: historyHits, tiers: historyTiers },
      medicalLifestyle: { selected: medHits, tiers: medTiers },
      sleep: { total: sleepTotal, tier: sleepTier },
      stress: { total: stressTotal, tier: stressTier },
      activity: { noFlags: activityFlags }
    };
  }

  // SOCIAL & LONELINESS (LSNS-6 and UCLA-3)
  function scoreSocial(responses, config) {
    const category = config.categories.find(c => c.id === "social");
    if (!category) return {};

    const [lsns6, ucla3] = category.instruments;

    // LSNS-6: sum of 6 items (0..5) — WP text didn’t stipulate cutpoints to enforce
    const lsVals = collectInstrumentValues(responses, lsns6);
    const lsNums = lsns6.items.map(it => clamp(toNumber(lsVals[it.key], 0), 0, 5));
    const lsTotal = sum(lsNums);

    // UCLA-3: sum of 3 items (1..3) — again, no explicit tiers in WP script; report raw
    const ucVals = collectInstrumentValues(responses, ucla3);
    const ucNums = ucla3.items.map(it => clamp(toNumber(ucVals[it.key], 0), 0, 3));
    const ucTotal = sum(ucNums);

    return { lsns6: { total: lsTotal }, ucla3: { total: ucTotal } };
  }

  // SENSORY (HHIE-S and VFQ-3of7)
  function scoreSensory(responses, config) {
    const category = config.categories.find(c => c.id === "sensory");
    if (!category) return {};

    const [hhie, vfq] = category.instruments;

    // HHIE-S: Yes=4, Sometimes=2, No=0 → total 0..40 (no tiers invented)
    const hVals = collectInstrumentValues(responses, hhie);
    const hNums = hhie.items.map(it => {
      const raw = hVals[it.key];
      if (String(raw).toLowerCase() === "yes") return 4;
      if (String(raw).toLowerCase() === "sometimes") return 2;
      return 0;
    });
    const hhieTotal = sum(hNums);

    // VFQ-3of7: WP page mentions 3-of-7 logic and “Higher better (0–100)”,
    // but no algorithmic details are codified in the materials provided.
    // We therefore report the raw sum only (0..28) without normalizing or tiering.
    const vVals = collectInstrumentValues(responses, vfq);
    const vNums = vfq.items.map(it => clamp(toNumber(vVals[it.key], 0), 0, 4));
    const vfqRawTotal = sum(vNums);

    return { hhie: { total: hhieTotal }, vfq3of7: { rawTotal: vfqRawTotal } };
  }

  // MEDICATIONS (checklist; no scores unless config defines specific rules)
  function scoreMedications(responses, instruments) {
    const out = { selected: [], byClass: {} };
    const meds = instruments?.medications?.items || [];
    // Items are checkboxes named "<SectionLabel>.<itemKey>" with value "1" when checked.
    for (const it of meds) {
      if (!it || !it.csvKey) continue;
      const k = `Medications.${it.csvKey}`; // matches app.js naming
      if (responses[k] === "1") {
        out.selected.push(it.csvKey);
        const cls = it.class || "Medications";
        if (!out.byClass[cls]) out.byClass[cls] = [];
        out.byClass[cls].push(it.csvKey);
      }
    }
    return out;
  }

  // EXPOSURES (Micro/Nanoplastics; Toxins; Foods/Additives)
  // Optional numeric weights come from instruments_config.json (per WP code).
  function scoreExposureSection(responses, sectionId, sectionLabel, instruments) {
    const section = instruments?.[sectionId];
    const items = section?.items || [];
    const selected = [];
    let weighted = 0;

    for (const it of items) {
      if (!it || !it.csvKey) continue;
      const k = `${sectionLabel}.${it.csvKey}`; // matches app.js naming
      if (responses[k] === "1") {
        selected.push(it.csvKey);
        if (typeof it.weight === "number") {
          weighted += it.weight;
        }
      }
    }
    return { selected, weighted };
  }

  // AGE/BMI (bands available in CONFIG, if desired by summary)
  function classifyAgeBmi(age, bmi, config) {
    const ageTier = findTier(config.ageBands, toNumber(age, -1));
    const bmiTier = findTier(config.bmiBands, toNumber(bmi, -1));
    return { ageTier, bmiTier };
  }

  // -------------------- Public API --------------------

  const SCORING = {
    /**
     * Compute full scoring snapshot for all categories.
     * @param {Object} responses Flat map from app.js of all user inputs.
     * @param {Object} config CONFIG from assets/config.js.
     * @param {Object} instruments Parsed instruments_config.json.
     * @param {Object} [opts] Optional { age, bmi } to classify with bands.
     */
    compute(responses, config, instruments, opts = {}) {
      const personal = scorePersonal(responses, config);
      const social = scoreSocial(responses, config);
      const sensory = scoreSensory(responses, config);
      const meds = scoreMedications(responses, instruments);

      const micro = scoreExposureSection(responses, "microplastics", "Micro/Nanoplastic Exposure", instruments);
      const toxins = scoreExposureSection(responses, "toxins", "Toxin Exposure", instruments);
      const foods = scoreExposureSection(responses, "foods", "Brain Threat Foods & Additives", instruments);

      const ageBmi = classifyAgeBmi(opts.age, opts.bmi, config);

      return {
        personal,
        social,
        sensory,
        medications: meds,
        microplastics: micro,
        toxins,
        foods,
        ageBmi
      };
    }
  };

  if (typeof window !== "undefined") {
    window.SCORING = SCORING;
  }
})();
