/* BrainPreserve — Brain Threat Analysis
   APP RENDERER (UI + data loading + state management)
   - Renders config-driven questionnaires
   - Guarantees: ALL category cards and ALL questionnaires start collapsed
   - Per-section and global clear both recollapse
*/
(function(){
  // ---------- CSV parser ----------
  function parseCSV(text){
    const rows = []; let i=0, field="", row=[], inQuotes=false;
    function pushField(){ row.push(field); field=""; }
    function pushRow(){ rows.push(row); row=[]; }
    while (i<text.length){
      const c = text[i++]; if (inQuotes){
        if (c === '"'){ if (text[i] === '"'){ field += '"'; i++; } else { inQuotes=false; } }
        else { field += c; }
      } else {
        if (c === '"') inQuotes=true;
        else if (c === ',') pushField();
        else if (c === '\n'){ pushField(); pushRow(); }
        else if (c !== '\r') field += c;
      }
    }
    if (field.length || row.length){ pushField(); pushRow(); }
    if (!rows.length) return [];
    const header = rows[0].map(h => String(h||"").trim()); const out=[];
    for (let r=1; r<rows.length; r++){
      const obj={}; const cells=rows[r]; if (!cells || !cells.length) continue; let empty=true;
      for (let c=0;c<header.length;c++){ const key=header[c]||`col_${c}`; const val=(cells[c]!=null)?String(cells[c]).trim():""; if (val!=="") empty=false; obj[key]=val; }
      if (!empty) out.push(obj);
    }
    return out;
  }

  // ---------- Loaders ----------
  async function loadJSON(url){ const res=await fetch(url,{cache:"no-store"}); if(!res.ok) throw new Error(`Failed to load ${url}`); return res.json(); }
  async function loadText(url){ const res=await fetch(url,{cache:"no-store"}); if(!res.ok) throw new Error(`Failed to load ${url}`); return res.text(); }
  async function loadData(){
    const cfgUrl = (window.BT_CFG?.paths?.instrumentsConfig) || "data/instruments_config.json";
    const formCfg = await loadJSON(cfgUrl);
    try { Object.defineProperty(window,"BT_CONFIG",{value:formCfg,writable:false,configurable:false}); } catch(e){ window.BT_CONFIG=formCfg; }
    const csvUrl = (window.BT_CFG?.paths?.masterCSV) || "data/master.csv";
    const csvRows = parseCSV(await loadText(csvUrl));
    return { formCfg, csvRows };
  }

  // ---------- State ----------
  const STATE = {
    answers: {
      personal:{ sex:null, age:null, units:"US", height:{ft:null,in:null,m:null}, weight:{lb:null,kg:null}, history:{}, sleep:{}, stress:{}, activity:{} },
      social:{ lsns:{}, ucla:{} },
      sensory:{ hhies:{}, vfq7:{} }
    },
    csv:[], sections:[]
  };

  // ---------- Helpers ----------
  function el(tag, attrs={}, ...children){
    const node=document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)){
      if (k==="class") node.className=v;
      else if (k==="html") node.innerHTML=v;
      else if (k.startsWith("on") && typeof v==="function") node.addEventListener(k.substring(2), v);
      else if (v!=null) node.setAttribute(k,v);
    }
    for (const ch of children){ if (ch==null) continue; node.appendChild(typeof ch==="string"?document.createTextNode(ch):ch); }
    return node;
  }
  function clearNode(n){ while(n.firstChild) n.removeChild(n.firstChild); }
  function caret(){ return el("span",{class:"bt-caret","aria-hidden":"true"},"▸"); }
  function toNum(v){ const n=Number(v); return isNaN(n)?null:n; }

  // ---------- Collapse controls ----------
  function recollapseAll(){
    document.querySelectorAll('details.bt-cat, details.bt-acc').forEach(d => d.removeAttribute('open'));
  }
  function recollapseSection(sectionId){
    const card = document.querySelector(`details.bt-cat[data-section="${sectionId}"]`);
    if (card) card.removeAttribute('open');
    card?.querySelectorAll('details.bt-acc').forEach(d => d.removeAttribute('open'));
  }
  function hardCollapseAll(){
    recollapseAll();
    requestAnimationFrame(recollapseAll);
    setTimeout(recollapseAll, 0);
    setTimeout(recollapseAll, 50);
  }

  // ---------- Renderers ----------
  function render_demographics(sub, mount){
    const a=STATE.answers.personal;
    const sexSel = el("select",{id:"dem-sex","aria-label":"Sex"},
      ...["","Female","Male","Other/Prefer not to say"].map(v=>{const o=el("option",{value:v},v===""?"Select…":v); if(a.sex===v) o.selected=true; return o;})
    );
    const ageInput = el("input",{type:"number",min:"18",max:"120",id:"dem-age",placeholder:"Age","aria-label":"Age"});
    if (typeof a.age==="number") ageInput.value=String(a.age);
    const unitsSel = el("select",{id:"dem-units","aria-label":"Units"},
      el("option",{value:"US"},"US (ft/in, lb)"),
      el("option",{value:"Metric"},"Metric (m, kg)")
    ); unitsSel.value=a.units||"US";
    const heightUS = el("div",{class:"bt-row",id:"height-us"}, el("input",{type:"number",min:"0",id:"h-ft",placeholder:"Height (ft)"}), el("input",{type:"number",min:"0",id:"h-in",placeholder:"Height (in)"}));
    if (a.height.ft!=null) heightUS.querySelector("#h-ft").value=String(a.height.ft);
    if (a.height.in!=null) heightUS.querySelector("#h-in").value=String(a.height.in);
    const heightM  = el("div",{class:"bt-row",id:"height-m",style:"display:none"}, el("input",{type:"number",step:"0.01",min:"0",id:"h-m",placeholder:"Height (m)"}));
    if (a.height.m!=null) heightM.querySelector("#h-m").value=String(a.height.m);
    const weightUS = el("div",{class:"bt-row",id:"weight-us"}, el("input",{type:"number",min:"0",id:"w-lb",placeholder:"Weight (lb)"}));
    if (a.weight.lb!=null) weightUS.querySelector("#w-lb").value=String(a.weight.lb);
    const weightKG = el("div",{class:"bt-row",id:"weight-kg",style:"display:none"}, el("input",{type:"number",step:"0.1",min:"0",id:"w-kg",placeholder:"Weight (kg)"}));
    if (a.weight.kg!=null) weightKG.querySelector("#w-kg").value=String(a.weight.kg);

    function syncUnits(){
      const u=unitsSel.value;
      if (u==="US"){ heightUS.style.display=""; weightUS.style.display=""; heightM.style.display="none"; weightKG.style.display="none"; }
      else { heightUS.style.display="none"; weightUS.style.display="none"; heightM.style.display=""; weightKG.style.display=""; }
    }
    syncUnits();

    sexSel.addEventListener("change",()=>{ a.sex=sexSel.value||null; onChange(); });
    ageInput.addEventListener("input",()=>{ const n=Number(ageInput.value); a.age=isNaN(n)?null:n; onChange(); });
    unitsSel.addEventListener("change",()=>{ a.units=unitsSel.value; syncUnits(); onChange(); });
    heightUS.querySelector("#h-ft").addEventListener("input",e=>{ a.height.ft=toNum(e.target.value); onChange(); });
    heightUS.querySelector("#h-in").addEventListener("input",e=>{ a.height.in=toNum(e.target.value); onChange(); });
    heightM.querySelector("#h-m").addEventListener("input",e=>{ a.height.m=toNum(e.target.value); onChange(); });
    weightUS.querySelector("#w-lb").addEventListener("input",e=>{ a.weight.lb=toNum(e.target.value); onChange(); });
    weightKG.querySelector("#w-kg").addEventListener("input",e=>{ a.weight.kg=toNum(e.target.value); onChange(); });

    mount.appendChild(el("div",{class:"bt-grid"},
      el("div",{}, el("label",{class:"bt-badge"},"Sex"), sexSel),
      el("div",{}, el("label",{class:"bt-badge"},"Age"), ageInput),
      el("div",{}, el("label",{class:"bt-badge"},"Units"), unitsSel),
      el("div",{}, el("label",{class:"bt-badge"},"Height"), heightUS, heightM),
      el("div",{}, el("label",{class:"bt-badge"},"Weight"), weightUS, weightKG)
    ));
  }

  function render_yn_group(sub, mount, targetObj){
    const grid=el("div",{class:"bt-grid"});
    (sub.items||[]).forEach(item=>{
      const name=`${sub.id}__${item.id}`;
      const yes=el("input",{type:"radio",name,value:"Yes",id:`${name}_y`});
      const no =el("input",{type:"radio",name,value:"No", id:`${name}_n`});
      if (targetObj[item.id]==="Yes") yes.checked=true;
      if (targetObj[item.id]==="No")  no.checked=true;
      yes.addEventListener("change",()=>{ targetObj[item.id]="Yes"; onChange(); });
      no .addEventListener("change",()=>{ targetObj[item.id]="No";  onChange(); });
      grid.appendChild(el("label",{class:"bt-opt"}, yes,el("span",{},"Yes"), el("span",{style:"width:8px"}), no,el("span",{},"No"), el("span",{style:"width:8px"}), el("span",{class:"bt-note"},item.label)));
    });
    if (sub.note && window.BT_CFG?.ui?.showSectionNotes) mount.appendChild(el("div",{class:"bt-help"},sub.note));
    mount.appendChild(grid);
  }

  function render_likert_group(sub, mount, targetObj){
    const scale=(window.BT_CONFIG.scales?.[sub.scale_ref])||[];
    if (!scale.length){ mount.appendChild(el("div",{class:"bt-help"},"Scale config missing.")); return; }
    const grid=el("div",{class:"bt-grid"});
    (sub.items||[]).forEach(item=>{
      const name=`${sub.id}__${item.id}`;
      const row=el("div",{class:"bt-row"}, el("div",{class:"bt-note"},item.label));
      scale.forEach(opt=>{
        const id=`${name}_${opt.value}`;
        const input=el("input",{type:"radio",name,id,value:String(opt.value)});
        if (Number(targetObj[item.id])===Number(opt.value)) input.checked=true;
        input.addEventListener("change",()=>{ targetObj[item.id]=Number(opt.value); onChange(); });
        row.appendChild(el("label",{class:"bt-opt",for:id}, input, el("span",{},opt.label)));
      });
      grid.appendChild(row);
    });
    if (sub.note && window.BT_CFG?.ui?.showSectionNotes) mount.appendChild(el("div",{class:"bt-help"},sub.note));
    mount.appendChild(grid);
  }

  // item.options → sub.options_ref → sub.options
  function render_radio_group(sub, mount, targetObj){
    const grid=el("div",{class:"bt-grid"});
    (sub.items||[]).forEach(item=>{
      const name=`${sub.id}__${item.id}`;
      const row=el("div",{class:"bt-row"}, el("div",{class:"bt-note"},item.label));
      let opts=[];
      if (Array.isArray(item.options)&&item.options.length){ opts=item.options; }
      else if (sub.options_ref && Array.isArray(window.BT_CONFIG.scales?.[sub.options_ref])){ opts=window.BT_CONFIG.scales[sub.options_ref]; }
      else if (Array.isArray(sub.options)&&sub.options.length){ opts=sub.options; }
      if (!opts.length){ row.appendChild(el("div",{class:"bt-help"},"Options missing in config.")); }
      else {
        opts.forEach(opt=>{
          const id=`${name}_${opt.value}`;
          const input=el("input",{type:"radio",name,id,value:String(opt.value)});
          if (Number(targetObj[item.id])===Number(opt.value)) input.checked=true;
          input.addEventListener("change",()=>{ targetObj[item.id]=Number(opt.value); onChange(); });
          row.appendChild(el("label",{class:"bt-opt",for:id}, input, el("span",{},opt.label)));
        });
      }
      grid.appendChild(row);
    });
    if (sub.note && window.BT_CFG?.ui?.showSectionNotes) mount.appendChild(el("div",{class:"bt-help"},sub.note));
    mount.appendChild(grid);
  }

  function renderSection(section){
    const mount=document.querySelector(`[data-mount="${section.id}"]`);
    const cat  =document.querySelector(`details.bt-cat[data-section="${section.id}"]`);
    if (!mount || !cat) return;
    document.getElementById(`${section.id}-loading`)?.remove();
    clearNode(mount);

    (section.subsections||[]).forEach(sub=>{
      // Questionnaire accordions (start closed)
      const wrapper=el("details",{class:"bt-acc"});
      const sum=el("summary",{}, caret()," ",
        sub.id==="demographics"?"Demographics":
        sub.id==="history_yesno"?"Medical History & Lifestyle":
        sub.id==="sleep"?"Sleep":
        sub.id==="stress"?"Perceived Stress":
        sub.id==="activity_yesno"?"Physical Activity":
        sub.id==="lsns6"?"LSNS-6 (Social Network)":
        sub.id==="ucla3"?"UCLA-3 (Loneliness)":
        sub.id==="hhies"?"HHIE-S (Hearing)":
        sub.id==="vfq7"?"VFQ-3of7 (Vision)":sub.id
      );
      wrapper.appendChild(sum);
      const inner=el("div",{style:"padding:10px;"});
      if (section.id==="personal"){
        if (sub.type==="demographics") render_demographics(sub,inner);
        else if (sub.type==="yn_group" && sub.id==="history_yesno") render_yn_group(sub,inner,STATE.answers.personal.history);
        else if (sub.type==="likert_group" && sub.id==="sleep")     render_likert_group(sub,inner,STATE.answers.personal.sleep);
        else if (sub.type==="likert_group" && sub.id==="stress")    render_likert_group(sub,inner,STATE.answers.personal.stress);
        else if (sub.type==="yn_group" && sub.id==="activity_yesno")render_yn_group(sub,inner,STATE.answers.personal.activity);
      } else if (section.id==="social"){
        if (sub.id==="lsns6") render_radio_group(sub,inner,STATE.answers.social.lsns);
        if (sub.id==="ucla3") render_radio_group(sub,inner,STATE.answers.social.ucla);
      } else if (section.id==="sensory"){
        if (sub.id==="hhies") render_radio_group(sub,inner,STATE.answers.sensory.hhies);
        if (sub.id==="vfq7")  render_radio_group(sub,inner,STATE.answers.sensory.vfq7);
      }
      wrapper.appendChild(inner);
      mount.appendChild(wrapper);
    });

    // Per-section Clear button
    mount.appendChild(
      el("div",{class:"bt-row",style:"margin-top:10px"},
        el("button",{type:"button",class:"bt-btn secondary",onClick:()=>{ resetSectionState(section.id); recollapseSection(section.id);
          // clear inputs just in this category
          const scope = document.querySelector(`details.bt-cat[data-section="${section.id}"]`);
          scope?.querySelectorAll('input[type="radio"], input[type="number"], select').forEach(el=>{
            if (el.type==="radio") el.checked=false;
            else if (el.tagName==="SELECT") el.selectedIndex=0;
            else el.value="";
          });
          // Personal layout back to US
          if (section.id==="personal"){
            const unitsSel=scope?.querySelector("#dem-units");
            const heightUS=scope?.querySelector("#height-us");
            const weightUS=scope?.querySelector("#weight-us");
            const heightM =scope?.querySelector("#height-m");
            const weightKG=scope?.querySelector("#weight-kg");
            if (unitsSel) unitsSel.value="US";
            if (heightUS) heightUS.style.display="";
            if (weightUS) weightUS.style.display="";
            if (heightM)  heightM.style.display="none";
            if (weightKG) weightKG.style.display="none";
          }
          onChange();
        }},"Clear This Section")
      )
    );
  }

  // ---------- Scoring + Summary ----------
  function computeAll(){
    if (!window.BT_Scoring) return {sections:[],overall:null};
    const results=[]; try{
      results.push(window.BT_Scoring.computePersonal(STATE.answers.personal));
      results.push(window.BT_Scoring.computeSocial(STATE.answers.social));
      results.push(window.BT_Scoring.computeSensory(STATE.answers.sensory));
    }catch(e){ console.error(e); }
    const overall = window.BT_Scoring.combineSections(results);
    return { sections:results, overall };
  }
  function buildSummaries(secResults){
    if (!window.BT_Summary) return { per:{}, overall:"Summary unavailable." };
    return { per: window.BT_Summary.buildSectionSummaries(secResults, STATE.csv),
             overall: window.BT_Summary.buildOverallSummary(secResults) };
  }
  function renderSummaryBox(text){
    const box=document.getElementById("bt-summary-text");
    box && (box.textContent = text || (window.BT_CFG?.copy?.summaryEmpty || "Complete the sections to see a personalized summary here."));
  }
  function onChange(){
    const { sections } = computeAll();
    const { per, overall } = buildSummaries(sections);
    renderSummaryBox([per.personal||"","",per.social||"","",per.sensory||"","",overall||""].join("\n").trim());
  }

  // ---------- Buttons ----------
  function wireButtons(){
    const copyBtn=document.getElementById("bt-copy");
    const resetBtn=document.getElementById("bt-reset");
    copyBtn?.addEventListener("click",async ()=>{
      const txt=document.getElementById("bt-summary-text")?.textContent||"";
      try{ await navigator.clipboard.writeText(txt); copyBtn.textContent="Copied"; setTimeout(()=>copyBtn.textContent="Copy Summary",1200);}catch{ copyBtn.textContent="Copy failed"; setTimeout(()=>copyBtn.textContent="Copy Summary",1500); }
    });
    resetBtn?.addEventListener("click",()=>{
      STATE.answers={
        personal:{ sex:null, age:null, units:"US", height:{ft:null,in:null,m:null}, weight:{lb:null,kg:null}, history:{}, sleep:{}, stress:{}, activity:{} },
        social:{ lsns:{}, ucla:{} },
        sensory:{ hhies:{}, vfq7:{} }
      };
      document.querySelectorAll('input[type="radio"], input[type="number"], select').forEach(el=>{
        if (el.type==="radio") el.checked=false; else if (el.tagName==="SELECT") el.selectedIndex=0; else el.value="";
      });
      // Personal layout back to US
      const pScope=document.querySelector('details.bt-cat[data-section="personal"]');
      if (pScope){
        const unitsSel=pScope.querySelector("#dem-units");
        const heightUS=pScope.querySelector("#height-us");
        const weightUS=pScope.querySelector("#weight-us");
        const heightM =pScope.querySelector("#height-m");
        const weightKG=pScope.querySelector("#weight-kg");
        if (unitsSel) unitsSel.value="US";
        if (heightUS) heightUS.style.display="";
        if (weightUS) weightUS.style.display="";
        if (heightM)  heightM.style.display="none";
        if (weightKG) weightKG.style.display="none";
      }
      hardCollapseAll();
      renderSummaryBox(window.BT_CFG?.copy?.summaryEmpty || "Complete the sections to see a personalized summary here.");
    });
  }

  // ---------- Boot ----------
  async function boot(){
    try{
      const { formCfg, csvRows } = await loadData();
      STATE.sections = formCfg.sections || [];
      STATE.csv = csvRows || [];
      for (const section of STATE.sections) renderSection(section);
      hardCollapseAll(); // force both category & questionnaire collapse
      renderSummaryBox(window.BT_CFG?.copy?.summaryEmpty || "Complete the sections to see a personalized summary here.");
      wireButtons();
    }catch(err){
      console.error(err);
      renderSummaryBox("Failed to load configuration or data. Please check your repository paths.");
    }
  }
  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
