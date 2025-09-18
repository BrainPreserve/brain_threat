/* BrainPreserve — Brain Threat Analysis
   APP RENDERER (UI + data loading + state management)
   - Reads config (JSON) + master CSV
   - Renders questionnaires (config-driven)
   - Tracks answers; computes scores; builds summaries
   - Wires Copy and Clear buttons
*/
(function(){
  // -----------------------------
  // Simple CSV parser (no external libs)
  // -----------------------------
  function parseCSV(text){
    // Handles commas inside quotes and double-quote escaping
    const rows = [];
    let i=0, field="", row=[], inQuotes=false;
    function pushField(){ row.push(field); field=""; }
    function pushRow(){ rows.push(row); row=[]; }
    while (i<text.length){
      const c = text[i++];
      if (inQuotes){
        if (c === '"'){
          if (text[i] === '"'){ field += '"'; i++; } else { inQuotes = false; }
        } else {
          field += c;
        }
      } else {
        if (c === '"'){ inQuotes = true; }
        else if (c === ','){ pushField(); }
        else if (c === '\n'){ pushField(); pushRow(); }
        else if (c === '\r'){ /* ignore */ }
        else { field += c; }
      }
    }
    // Last field/row
    if (field.length || row.length){ pushField(); pushRow(); }

    if (!rows.length) return [];
    const header = rows[0].map(h => String(h||"").trim());
    const out = [];
    for (let r=1; r<rows.length; r++){
      const obj = {};
      const cells = rows[r];
      if (!cells || cells.length===0) continue;
      let empty = true;
      for (let c=0; c<header.length; c++){
        const key = header[c] || `col_${c}`;
        const val = (cells[c]!==undefined && cells[c]!==null) ? String(cells[c]).trim() : "";
        if (val !== "") empty = false;
        obj[key] = val;
      }
      if (!empty) out.push(obj);
    }
    return out;
  }

  // -----------------------------
  // Loaders
  // -----------------------------
  async function loadJSON(url){
    const res = await fetch(url, { cache:"no-store" });
    if (!res.ok) throw new Error(`Failed to load ${url}`);
    return res.json();
  }

  async function loadText(url){
    const res = await fetch(url, { cache:"no-store" });
    if (!res.ok) throw new Error(`Failed to load ${url}`);
    return res.text();
  }

  async function loadData(){
    // 1) instruments_config.json → window.BT_CONFIG
    const cfgUrl = (window.BT_CFG && window.BT_CFG.paths && window.BT_CFG.paths.instrumentsConfig) || "data/instruments_config.json";
    const formCfg = await loadJSON(cfgUrl);
    try { Object.defineProperty(window, "BT_CONFIG", { value: formCfg, writable:false, configurable:false }); }
    catch(e){ window.BT_CONFIG = formCfg; }

    // 2) master.csv → parsed array
    const csvUrl = (window.BT_CFG && window.BT_CFG.paths && window.BT_CFG.paths.masterCSV) || "data/master.csv";
    const csvText = await loadText(csvUrl);
    const csvRows = parseCSV(csvText);
    return { formCfg, csvRows };
  }

  // -----------------------------
  // State
  // -----------------------------
  const STATE = {
    answers: {
      personal: {
        sex: null,
        age: null,
        units: "US",
        height: { ft: null, in: null, m: null },
        weight: { lb: null, kg: null },
        history: {},
        sleep: {},
        stress: {},
        activity: {}
      },
      social: {
        lsns: {},  // 0..5
        ucla: {}   // 1..3
      },
      sensory: {
        hhies: {}, // 0|2|4
        vfq7: {}   // 1..6
      }
    },
    csv: [],
    sections: [] // from config.sections
  };

  // -----------------------------
  // UI helpers
  // -----------------------------
  function el(tag, attrs={}, ...children){
    const node = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs||{})){
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function"){
        node.addEventListener(k.substring(2), v);
      } else if (v !== undefined && v !== null){
        node.setAttribute(k, v);
      }
    }
    for (const ch of children){
      if (ch === null || ch === undefined) continue;
      if (typeof ch === "string") node.appendChild(document.createTextNode(ch));
      else node.appendChild(ch);
    }
    return node;
  }

  function clearNode(node){ while(node.firstChild) node.removeChild(node.firstChild); }

  function caret(){
    return el("span", { class:"bt-caret", "aria-hidden":"true" }, "▸");
  }

  // -----------------------------
  // Renderers per subsection type
  // -----------------------------
  function render_demographics(sub, mount){
    const a = STATE.answers.personal;

    const sexSel = el("select", { id:"dem-sex", "aria-label":"Sex" },
      ...["","Female","Male","Other/Prefer not to say"].map(v => {
        const o = el("option", { value:v }, v===""?"Select…":v);
        if (a.sex===v) o.selected = true;
        return o;
      })
    );

    const ageInput = el("input", { type:"number", min:"18", max:"120", id:"dem-age", placeholder:"Age", "aria-label":"Age" });
    if (typeof a.age === "number") ageInput.value = String(a.age);

    const unitsSel = el("select", { id:"dem-units", "aria-label":"Units" },
      el("option", { value:"US" }, "US (ft/in, lb)"),
      el("option", { value:"Metric" }, "Metric (m, kg)")
    );
    unitsSel.value = a.units || "US";

    const heightUS = el("div", { class:"bt-row", id:"height-us" },
      el("input", { type:"number", min:"0", id:"h-ft", placeholder:"Height (ft)" }),
      el("input", { type:"number", min:"0", id:"h-in", placeholder:"Height (in)" })
    );
    if (a.height.ft!=null) heightUS.querySelector("#h-ft").value = String(a.height.ft);
    if (a.height.in!=null) heightUS.querySelector("#h-in").value = String(a.height.in);

    const heightM = el("div", { class:"bt-row", id:"height-m", style:"display:none" },
      el("input", { type:"number", step:"0.01", min:"0", id:"h-m", placeholder:"Height (m)" })
    );
    if (a.height.m!=null) heightM.querySelector("#h-m").value = String(a.height.m);

    const weightUS = el("div", { class:"bt-row", id:"weight-us" },
      el("input", { type:"number", min:"0", id:"w-lb", placeholder:"Weight (lb)" })
    );
    if (a.weight.lb!=null) weightUS.querySelector("#w-lb").value = String(a.weight.lb);

    const weightKG = el("div", { class:"bt-row", id:"weight-kg", style:"display:none" },
      el("input", { type:"number", step:"0.1", min:"0", id:"w-kg", placeholder:"Weight (kg)" })
    );
    if (a.weight.kg!=null) weightKG.querySelector("#w-kg").value = String(a.weight.kg);

    function syncUnits(){
      const u = unitsSel.value;
      if (u === "US"){
        heightUS.style.display = ""; weightUS.style.display = "";
        heightM.style.display = "none"; weightKG.style.display = "none";
      } else {
        heightUS.style.display = "none"; weightUS.style.display = "none";
        heightM.style.display = ""; weightKG.style.display = "";
      }
    }
    syncUnits();

    sexSel.addEventListener("change", () => { a.sex = sexSel.value || null; onChange(); });
    ageInput.addEventListener("input", () => { const n = Number(ageInput.value); a.age = isNaN(n)? null : n; onChange(); });
    unitsSel.addEventListener("change", () => { a.units = unitsSel.value; syncUnits(); onChange(); });
    heightUS.querySelector("#h-ft").addEventListener("input", e => { a.height.ft = toNum(e.target.value); onChange(); });
    heightUS.querySelector("#h-in").addEventListener("input", e => { a.height.in = toNum(e.target.value); onChange(); });
    heightM.querySelector("#h-m").addEventListener("input", e => { a.height.m  = toNum(e.target.value); onChange(); });
    weightUS.querySelector("#w-lb").addEventListener("input", e => { a.weight.lb = toNum(e.target.value); onChange(); });
    weightKG.querySelector("#w-kg").addEventListener("input", e => { a.weight.kg = toNum(e.target.value); onChange(); });

    mount.appendChild(el("div", { class:"bt-grid" },
      el("div", {}, el("label", { class:"bt-badge" }, "Sex"), sexSel),
      el("div", {}, el("label", { class:"bt-badge" }, "Age"), ageInput),
      el("div", {}, el("label", { class:"bt-badge" }, "Units"), unitsSel),
      el("div", {}, el("label", { class:"bt-badge" }, "Height"), heightUS, heightM),
      el("div", {}, el("label", { class:"bt-badge" }, "Weight"), weightUS, weightKG)
    ));
  }

  function render_yn_group(sub, mount, targetObj, yesKey, noKey){
    // yesKey/noKey describe which tier applies; we store "Yes"/"No"
    const grid = el("div", { class:"bt-grid" });
    (sub.items||[]).forEach(item => {
      const name = `${sub.id}__${item.id}`;
      const yes = el("input", { type:"radio", name, value:"Yes", id:`${name}_y` });
      const no  = el("input", { type:"radio", name, value:"No",  id:`${name}_n` });
      // restore state
      if (targetObj[item.id] === "Yes") yes.checked = true;
      if (targetObj[item.id] === "No")  no.checked  = true;
      yes.addEventListener("change", () => { targetObj[item.id] = "Yes"; onChange(); });
      no .addEventListener("change", () => { targetObj[item.id] = "No";  onChange(); });

      grid.appendChild(el("label", { class:"bt-opt" },
        yes, el("span", {}, "Yes"),
        el("span", { style:"width:8px" }),
        no,  el("span", {}, "No"),
        el("span", { style:"width:8px" }),
        el("span", { class:"bt-note" }, item.label)
      ));
    });
    if (sub.note && window.BT_CFG?.ui?.showSectionNotes){
      mount.appendChild(el("div", { class:"bt-help" }, sub.note));
    }
    mount.appendChild(grid);
  }

  function render_likert_group(sub, mount, targetObj){
    const scale = (window.BT_CONFIG.scales && window.BT_CONFIG.scales[sub.scale_ref]) || [];
    if (!scale.length) {
      mount.appendChild(el("div", { class:"bt-help" }, "Scale config missing."));
      return;
    }
    const grid = el("div", { class:"bt-grid" });
    (sub.items||[]).forEach(item => {
      const name = `${sub.id}__${item.id}`;
      const row = el("div", { class:"bt-row" }, el("div", { class:"bt-note" }, item.label));
      scale.forEach(opt => {
        const id = `${name}_${opt.value}`;
        const input = el("input", { type:"radio", name, id, value:String(opt.value) });
        if (Number(targetObj[item.id]) === Number(opt.value)) input.checked = true;
        input.addEventListener("change", () => { targetObj[item.id] = Number(opt.value); onChange(); });
        row.appendChild(el("label", { class:"bt-opt", for:id }, input, el("span", {}, opt.label)));
      });
      grid.appendChild(row);
    });
    if (sub.note && window.BT_CFG?.ui?.showSectionNotes){
      mount.appendChild(el("div", { class:"bt-help" }, sub.note));
    }
    mount.appendChild(grid);
  }

  function render_radio_group(sub, mount, targetObj){
    // LSNS/UCLA/HHIE/VFQ
    const grid = el("div", { class:"bt-grid" });
    (sub.items||[]).forEach(item => {
      const name = `${sub.id}__${item.id}`;
      const row = el("div", { class:"bt-row" }, el("div", { class:"bt-note" }, item.label));
      // Options may be via options_ref or inline options
      const opts = sub.options_ref
        ? (window.BT_CONFIG.scales && window.BT_CONFIG.scales[sub.options_ref]) || []
        : (sub.options || []);
      if (!Array.isArray(opts) || !opts.length){
        row.appendChild(el("div", { class:"bt-help" }, "Options missing in config."));
      } else {
        opts.forEach(opt => {
          const id = `${name}_${opt.value}`;
          const input = el("input", { type:"radio", name, id, value:String(opt.value) });
          if (Number(targetObj[item.id]) === Number(opt.value)) input.checked = true;
          input.addEventListener("change", () => { targetObj[item.id] = Number(opt.value); onChange(); });
          row.appendChild(el("label", { class:"bt-opt", for:id }, input, el("span", {}, opt.label)));
        });
      }
      grid.appendChild(row);
    });
    if (sub.note && window.BT_CFG?.ui?.showSectionNotes){
      mount.appendChild(el("div", { class:"bt-help" }, sub.note));
    }
    mount.appendChild(grid);
  }

  // -----------------------------
  // Section renderer from config
  // -----------------------------
  function renderSection(section){
    const mount = document.querySelector(`[data-mount="${section.id}"]`);
    if (!mount) return;

    clearNode(mount);

    // Remove "Loading…" placeholder if present
    const loadDiv = document.getElementById(`${section.id}-loading`);
    if (loadDiv) loadDiv.remove();

    (section.subsections||[]).forEach(sub => {
      const wrapper = el("details", { class:"bt-acc", open: !window.BT_CFG?.app?.startCollapsed });
      const sum = el("summary", {}, caret(), " ", sub.id === "demographics" ? "Demographics" :
                                   sub.id === "history_yesno" ? "Medical History & Lifestyle" :
                                   sub.id === "sleep" ? "Sleep" :
                                   sub.id === "stress" ? "Perceived Stress" :
                                   sub.id === "activity_yesno" ? "Physical Activity" :
                                   sub.id === "lsns6" ? "LSNS-6 (Social Network)" :
                                   sub.id === "ucla3" ? "UCLA-3 (Loneliness)" :
                                   sub.id === "hhies" ? "HHIE-S (Hearing)" :
                                   sub.id === "vfq7" ? "VFQ-3of7 (Vision)" : sub.id);
      wrapper.appendChild(sum);

      const inner = el("div", { style:"padding:10px;" });

      if (section.id === "personal"){
        if (sub.type === "demographics")       render_demographics(sub, inner);
        else if (sub.type === "yn_group" && sub.id==="history_yesno")  render_yn_group(sub, inner, STATE.answers.personal.history, "yesTier", null);
        else if (sub.type === "likert_group" && sub.id==="sleep")      render_likert_group(sub, inner, STATE.answers.personal.sleep);
        else if (sub.type === "likert_group" && sub.id==="stress")     render_likert_group(sub, inner, STATE.answers.personal.stress);
        else if (sub.type === "yn_group" && sub.id==="activity_yesno") render_yn_group(sub, inner, STATE.answers.personal.activity, null, "noTier");
      }
      else if (section.id === "social"){
        if (sub.id === "lsns6") render_radio_group(sub, inner, STATE.answers.social.lsns);
        if (sub.id === "ucla3") render_radio_group(sub, inner, STATE.answers.social.ucla);
      }
      else if (section.id === "sensory"){
        if (sub.id === "hhies") render_radio_group(sub, inner, STATE.answers.sensory.hhies);
        if (sub.id === "vfq7")  render_radio_group(sub, inner, STATE.answers.sensory.vfq7);
      }

      wrapper.appendChild(inner);
      mount.appendChild(wrapper);
    });
  }

  // -----------------------------
  // Scoring + Summary wiring
  // -----------------------------
  function computeAll(){
    if (!window.BT_Scoring) return { sections:[], overall:null };
    const results = [];
    try {
      results.push(window.BT_Scoring.computePersonal(STATE.answers.personal));
      results.push(window.BT_Scoring.computeSocial(STATE.answers.social));
      results.push(window.BT_Scoring.computeSensory(STATE.answers.sensory));
    } catch(err){
      console.error("Scoring error:", err);
    }
    const overall = window.BT_Scoring.combineSections(results);
    return { sections: results, overall };
  }

  function buildSummaries(secResults){
    if (!window.BT_Summary) return { per:{}, overall:"Summary unavailable." };
    const per = window.BT_Summary.buildSectionSummaries(secResults, STATE.csv);
    const overall = window.BT_Summary.buildOverallSummary(secResults);
    return { per, overall };
  }

  function renderSummaryBox(text){
    const box = document.getElementById("bt-summary-text");
    if (!box) return;
    box.textContent = text || (window.BT_CFG?.copy?.summaryEmpty || "Complete the sections to see a personalized summary here.");
  }

  function onChange(){
    const { sections, overall } = computeAll();
    const { per, overall: overallTxt } = buildSummaries(sections);
    // Compose a single combined narrative: per-section blocks + overall
    const combined = [
      per.personal || "",
      "",
      per.social || "",
      "",
      per.sensory || "",
      "",
      overallTxt || ""
    ].join("\n");
    renderSummaryBox(combined.trim());
  }

  // -----------------------------
  // Buttons: Copy + Clear
  // -----------------------------
  function wireButtons(){
    const copyBtn = document.getElementById("bt-copy");
    const resetBtn = document.getElementById("bt-reset");

    if (copyBtn){
      copyBtn.addEventListener("click", async () => {
        const box = document.getElementById("bt-summary-text");
        const txt = box ? box.textContent || "" : "";
        try {
          await navigator.clipboard.writeText(txt);
          copyBtn.textContent = "Copied";
          setTimeout(()=> copyBtn.textContent = "Copy Summary", 1200);
        } catch {
          copyBtn.textContent = "Copy failed";
          setTimeout(()=> copyBtn.textContent = "Copy Summary", 1500);
        }
      });
    }

    if (resetBtn){
      resetBtn.addEventListener("click", () => {
        // Reset state
        STATE.answers = {
          personal: {
            sex: null,
            age: null,
            units: "US",
            height: { ft: null, in: null, m: null },
            weight: { lb: null, kg: null },
            history: {},
            sleep: {},
            stress: {},
            activity: {}
          },
          social: { lsns:{}, ucla:{} },
          sensory:{ hhies:{}, vfq7:{} }
        };
        // Reset UI inputs
        document.querySelectorAll('input[type="radio"], input[type="number"], select').forEach(el=>{
          if (el.type === "radio") el.checked = false;
          else if (el.tagName === "SELECT") el.selectedIndex = 0;
          else el.value = "";
        });
        // Re-sync units layout after reset
        const unitsSel = document.getElementById("dem-units");
        if (unitsSel){ unitsSel.value = "US"; unitsSel.dispatchEvent(new Event("change")); }
        renderSummaryBox((window.BT_CFG?.copy?.summaryEmpty) || "Complete the sections to see a personalized summary here.");
      });
    }
  }

  // -----------------------------
  // Utilities
  // -----------------------------
  function toNum(v){ const n = Number(v); return isNaN(n) ? null : n; }

  // -----------------------------
  // Boot
  // -----------------------------
  async function boot(){
    try{
      const { formCfg, csvRows } = await loadData();
      STATE.sections = formCfg.sections || [];
      STATE.csv = csvRows || [];

      // Render each declared section
      for (const section of STATE.sections){
        renderSection(section);
      }

      // Initial summary text
      renderSummaryBox((window.BT_CFG?.copy?.summaryEmpty) || "Complete the sections to see a personalized summary here.");

      // Wire buttons
      wireButtons();

    } catch(err){
      console.error(err);
      renderSummaryBox("Failed to load configuration or data. Please check your repository paths.");
    }
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
