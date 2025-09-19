/* ===========================================================================
   Brain Threat Analysis — SUMMARY
   Clean rebuild from WP + master.csv (STRICT CONTRACT honored in app.js)
   ---------------------------------------------------------------------------
   PURPOSE
   - Render a transparent, non-inferential summary of current responses.
   - Uses ONLY code-defined scores/tiers from SCORING + CONFIG.
   - Does not read CSV; helper text and brands are handled in app.js UI.
   - No heuristics. If data is missing, sections simply report "None selected"
     or raw totals that can be computed from provided inputs.

   INTEGRATION
   - app.js calls:
       SUMMARY.updateSummary(collectAllResponses())
       SUMMARY.reset()
   - This module reads from:
       window.SCORING (provided by assets/scoring.js)
       window.CONFIG  (provided by assets/config.js)
   =========================================================================== */

(function () {
  const $summary = document.getElementById("summary-content");

  // ------------- Utilities -------------

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function kvLine(label, value) {
    const row = el("div", "sum-row");
    const k = el("span", "sum-k", label + ": ");
    const v = el("span", "sum-v");
    if (typeof value === "string") v.textContent = value;
    else v.textContent = String(value);
    row.appendChild(k);
    row.appendChild(v);
    return row;
  }

  function listOrNone(arr, noneMsg = "None selected") {
    if (!Array.isArray(arr) || arr.length === 0) {
      const p = el("p", "sum-none", noneMsg);
      return p;
    }
    const ul = el("ul", "sum-list");
    arr.forEach(x => {
      const li = el("li", null, String(x));
      ul.appendChild(li);
    });
    return ul;
  }

  function groupList(obj, noneMsg = "None selected") {
    const wrap = document.createDocumentFragment();
    if (!obj || Object.keys(obj).length === 0) {
      wrap.appendChild(el("p", "sum-none", noneMsg));
      return wrap;
    }
    for (const cls of Object.keys(obj)) {
      const h = el("h4", "sum-h4", cls);
      wrap.appendChild(h);
      wrap.appendChild(listOrNone(obj[cls]));
    }
    return wrap;
  }

  // ------------- Renderers -------------

  function renderPersonal(block, personal) {
    const sec = el("section", "sum-sec");
    sec.appendChild(el("h3", "sum-h3", "Personal History"));

    // History (Yes flags with tiers)
    const hCard = el("div", "sum-card");
    hCard.appendChild(el("h4", "sum-h4", "Personal History Questionnaire"));
    if (personal?.history) {
      const { selected = [], tiers = {} } = personal.history;
      if (selected.length === 0) {
        hCard.appendChild(el("p", "sum-none", "No risk flags selected."));
      } else {
        const ul = el("ul", "sum-list");
        selected.forEach(k => {
          const t = tiers[k] ? ` — Tier: ${tiers[k]}` : "";
          const li = el("li", null, `${k}${t}`);
          ul.appendChild(li);
        });
        hCard.appendChild(ul);
      }
    }
    sec.appendChild(hCard);

    // Medical & Lifestyle (Yes flags with tiers)
    const mCard = el("div", "sum-card");
    mCard.appendChild(el("h4", "sum-h4", "Medical & Lifestyle"));
    if (personal?.medicalLifestyle) {
      const { selected = [], tiers = {} } = personal.medicalLifestyle;
      if (selected.length === 0) {
        mCard.appendChild(el("p", "sum-none", "No risk flags selected."));
      } else {
        const ul = el("ul", "sum-list");
        selected.forEach(k => {
          const t = tiers[k] ? ` — Tier: ${tiers[k]}` : "";
          ul.appendChild(el("li", null, `${k}${t}`));
        });
        mCard.appendChild(ul);
      }
    }
    sec.appendChild(mCard);

    // Sleep (total + severity tier if defined)
    const sCard = el("div", "sum-card");
    sCard.appendChild(el("h4", "sum-h4", "Sleep"));
    if (personal?.sleep) {
      sCard.appendChild(kvLine("Total (0–24)", personal.sleep.total ?? 0));
      sCard.appendChild(kvLine("Severity", personal.sleep.tier ?? "—"));
    }
    sec.appendChild(sCard);

    // Stress (total + tier)
    const pCard = el("div", "sum-card");
    pCard.appendChild(el("h4", "sum-h4", "Stress (PSS-4)"));
    if (personal?.stress) {
      pCard.appendChild(kvLine("Total (0–16)", personal.stress.total ?? 0));
      pCard.appendChild(kvLine("Tier", personal.stress.tier ?? "—"));
    }
    sec.appendChild(pCard);

    // Physical Activity (No flags with tiers)
    const aCard = el("div", "sum-card");
    aCard.appendChild(el("h4", "sum-h4", "Physical Activity"));
    if (personal?.activity) {
      const flags = personal.activity.noFlags || {};
      if (Object.keys(flags).length === 0) {
        aCard.appendChild(el("p", "sum-none", "Meets all activity targets selected."));
      } else {
        const ul = el("ul", "sum-list");
        for (const k of Object.keys(flags)) {
          ul.appendChild(el("li", null, `${k} — Tier: ${flags[k]}`));
        }
        aCard.appendChild(ul);
      }
    }
    sec.appendChild(aCard);

    block.appendChild(sec);
  }

  function renderSocial(block, social) {
    const sec = el("section", "sum-sec");
    sec.appendChild(el("h3", "sum-h3", "Social & Loneliness Assessment"));

    const sCard = el("div", "sum-card");
    sCard.appendChild(el("h4", "sum-h4", "LSNS-6"));
    sCard.appendChild(kvLine("Total (0–30)", social?.lsns6?.total ?? 0));
    sec.appendChild(sCard);

    const uCard = el("div", "sum-card");
    uCard.appendChild(el("h4", "sum-h4", "UCLA-3"));
    uCard.appendChild(kvLine("Total (3–9)", social?.ucla3?.total ?? 0));
    sec.appendChild(uCard);

    block.appendChild(sec);
  }

  function renderSensory(block, sensory) {
    const sec = el("section", "sum-sec");
    sec.appendChild(el("h3", "sum-h3", "Sensory Assessment"));

    const hCard = el("div", "sum-card");
    hCard.appendChild(el("h4", "sum-h4", "Hearing (HHIE-S)"));
    hCard.appendChild(kvLine("Total (0–40)", sensory?.hhie?.total ?? 0));
    sec.appendChild(hCard);

    const vCard = el("div", "sum-card");
    vCard.appendChild(el("h4", "sum-h4", "Vision (VFQ-3 of 7)"));
    vCard.appendChild(kvLine("Raw total (0–28)", sensory?.vfq3of7?.rawTotal ?? 0));
    sec.appendChild(vCard);

    block.appendChild(sec);
  }

  function renderMedications(block, meds) {
    const sec = el("section", "sum-sec");
    sec.appendChild(el("h3", "sum-h3", "Medication Threat Assessment"));

    const mCard = el("div", "sum-card");
    mCard.appendChild(el("h4", "sum-h4", "Selected Medications"));
    if (!meds || (Array.isArray(meds.selected) && meds.selected.length === 0)) {
      mCard.appendChild(el("p", "sum-none", "None selected"));
    } else {
      // Show by class grouping where available
      mCard.appendChild(groupList(meds.byClass, "None selected"));
    }
    sec.appendChild(mCard);

    block.appendChild(sec);
  }

  function renderExposure(block, label, section) {
    const sec = el("section", "sum-sec");
    sec.appendChild(el("h3", "sum-h3", label));

    const card = el("div", "sum-card");
    card.appendChild(el("h4", "sum-h4", "Selections"));
    if (!section || (Array.isArray(section.selected) && section.selected.length === 0)) {
      card.appendChild(el("p", "sum-none", "None selected"));
    } else {
      card.appendChild(listOrNone(section.selected));
    }

    // If weighted score was defined in instruments_config.json, show it
    if (section && typeof section.weighted === "number") {
      card.appendChild(kvLine("Weighted score", section.weighted));
    }

    sec.appendChild(card);
    block.appendChild(sec);
  }

  function renderAgeBmi(block, ageBmi) {
    // Optional section (only shows if any tier is available)
    const { ageTier, bmiTier } = (ageBmi || {});
    if (!ageTier && !bmiTier) return;

    const sec = el("section", "sum-sec");
    sec.appendChild(el("h3", "sum-h3", "Age & BMI Classification"));

    if (ageTier) sec.appendChild(kvLine("Age band", ageTier));
    if (bmiTier) sec.appendChild(kvLine("BMI band", bmiTier));

    block.appendChild(sec);
  }

  // ------------- Public API -------------

  const SUMMARY = {
    /**
     * Update the on-page summary based on current responses.
     * @param {Object} responses Flat map from app.js of all user inputs.
     */
    updateSummary(responses) {
      if (!$summary) return;
      $summary.innerHTML = "";

      // Pull optional age/BMI from inputs if you later add them to the UI.
      // For now they are undefined (classification section will hide).
      const age = undefined;
      const bmi = undefined;

      // Compute snapshot via SCORING; no heuristics.
      const snap = window.SCORING.compute(
        responses,
        window.CONFIG,
        window.__INSTRUMENTS__ || {}, // app.js can set this after loading JSON
        { age, bmi }
      );

      // Render sections in canonical order
      renderPersonal($summary, snap.personal);
      renderSocial($summary, snap.social);
      renderSensory($summary, snap.sensory);
      renderMedications($summary, snap.medications);
      renderExposure($summary, "Micro/Nanoplastic Exposure Assessment", snap.microplastics);
      renderExposure($summary, "Toxin Exposure Assessment", snap.toxins);
      renderExposure($summary, "Brain Threat Foods and Additives Assessment", snap.foods);
      renderAgeBmi($summary, snap.ageBmi);
    },

    /**
     * Clear the summary display (used when global Clear Form is pressed).
     */
    reset() {
      if ($summary) $summary.innerHTML = "";
    }
  };

  if (typeof window !== "undefined") {
    window.SUMMARY = SUMMARY;
  }
})();
