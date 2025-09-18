// BrainPreserve — global config consumed by assets/app.js, scoring.js, summary.js
// Paths are relative to site root. Keep filenames/lowercase exactly.
window.CFG = {
  paths: {
    // MUST exist and be publicly readable
    configJson: 'data/instruments_config.json',
    masterCsv:  'data/master.csv'
  },
  ui: {
    startCollapsed: true,
    categoryClearLabel: 'Clear This Section',
    caretClosed: '▸',
    caretOpen:   '▾'
  }
};

// Optional: expose carets for any code that reads BP_UI
window.BP_UI = { caretClosed: '▸', caretOpen: '▾' };

// Simple runtime sanity checks (shows a visible message if something is missing)
(function(){
  function panic(msg){
    // Visible inline message so you aren’t staring at a blank page
    var box = document.querySelector('#bt-categories') || document.body;
    var div = document.createElement('div');
    div.style.cssText = 'margin:12px 0;padding:12px;border:1px solid #ef4444;background:#fff1f2;color:#991b1b;border-radius:10px';
    div.textContent = msg;
    box.prepend(div);
  }

  if (!window.CFG || !CFG.paths || !CFG.paths.configJson) {
    panic('Configuration missing: CFG.paths.configJson not set (assets/config.js).');
    return;
  }

  // Proactively check the JSON path so failures are obvious
  fetch(CFG.paths.configJson, { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + CFG.paths.configJson);
      return r.json();
    })
    .then(j => {
      if (!j || !Array.isArray(j.categories) || j.categories.length === 0) {
        panic('Loaded instruments_config.json but it has no categories.');
      }
    })
    .catch(err => {
      panic('Cannot load ' + CFG.paths.configJson + ': ' + (err && err.message ? err.message : err));
    });
})();
