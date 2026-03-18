// ═══════════════════════════════════════════════════════
//  Konfiguracja ładowana z serwera (/config)
//  Uruchom: python jira_bug_reporter.py  →  http://localhost:5000
// ═══════════════════════════════════════════════════════
const SERVER_BASE = '';   // pusty = ten sam origin (serwer serwuje pliki)
let CONFIG = null;

async function loadConfig() {
  const r = await fetch('/config');
  if (!r.ok) throw new Error(`Błąd ładowania config: HTTP ${r.status}`);
  CONFIG = await r.json();
  console.log('[config] Załadowano:', CONFIG.apps.map(a => a.name));
}

// ── Theme — ładuje z config, zapisuje z powrotem ───────
function applyTheme(theme, darkMode) {
  const link = document.getElementById('theme-css');
  if (link) link.href = `theme-${theme}.css`;
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = darkMode ? '🌙' : '☀️';
  const lbl = document.getElementById('theme-label');
  if (lbl) lbl.textContent = darkMode ? 'Dark' : 'Light';
  document.querySelectorAll('.style-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.style === theme);
  });
}

async function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const newDark = !isDark;
  applyTheme(CONFIG.theme || 'bugreporter', newDark);
  try {
    await fetch('/config/dark_mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dark_mode: newDark }),
    });
  } catch(e) { console.warn('[theme] Zapis dark_mode nieudany:', e.message); }
}

async function switchStyle(theme) {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  CONFIG.theme = theme;
  applyTheme(theme, isDark);
  try {
    await fetch('/config/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    });
  } catch(e) { console.warn('[theme] Zapis theme nieudany:', e.message); }
}

// ── Accordion (v4 only) ───────────────────────────────
function toggleAcc(id) {
  document.getElementById(id).classList.toggle('open');
}

// ── Force toggle ──────────────────────────────────────
// Logic:
//   filled field  → included by default, btn shows "+" (green)
//   empty field   → excluded by default, btn shows "−" (dim)
//   empty+forced  → included despite empty, btn shows "+" (amber)
//   filled+excluded → excluded despite content, btn shows "−" (accent/red)
//
// excludedFields = user explicitly excluded a filled field
// forcedFields   = user explicitly forced an empty field
const excludedFields = new Set();
const forcedFields   = new Set();

function toggleForce(fieldId, btn) {
  const el    = document.getElementById(fieldId);
  const value = el ? el.value : '';
  const filled = !isEmpty(value);

  if (filled) {
    // filled field: toggle excluded
    if (excludedFields.has(fieldId)) {
      excludedFields.delete(fieldId);
      // back to default: included
    } else {
      excludedFields.add(fieldId);
    }
  } else {
    // empty field: toggle forced
    if (forcedFields.has(fieldId)) {
      forcedFields.delete(fieldId);
    } else {
      forcedFields.add(fieldId);
    }
  }
  update(); // update() calls updateForceBtns() internally
}

// ── isEmpty helper ────────────────────────────────────
function isEmpty(val) {
  return !val || val.trim() === '';
}

// ── should include field/section in markup? ───────────
function include(fieldId, value) {
  if (excludedFields.has(fieldId)) return false;   // explicitly excluded
  if (!isEmpty(value)) return true;                 // filled → include
  return forcedFields.has(fieldId);                 // empty but forced → include
}

// ── Update force button states ────────────────────────
// Called after every update(). Finds all [data-field-id] buttons and
// sets their visual state based on field content + sets.
function updateForceBtns() {
  document.querySelectorAll('[data-field-id]').forEach(btn => {
    const fieldId = btn.getAttribute('data-field-id');
    const el      = document.getElementById(fieldId);
    const value   = el ? el.value : '';
    const filled  = !isEmpty(value);
    const excluded = excludedFields.has(fieldId);
    const forced   = forcedFields.has(fieldId);

    if (filled && !excluded) {
      // default included state
      btn.textContent = '+';
      btn.setAttribute('data-state', 'included');
      btn.title = 'Pole wypełnione — kliknij aby wykluczyć z opisu';
    } else if (filled && excluded) {
      // manually excluded
      btn.textContent = '−';
      btn.setAttribute('data-state', 'excluded');
      btn.title = 'Pole wykluczone — kliknij aby dołączyć';
    } else if (!filled && forced) {
      // empty but forced
      btn.textContent = '+';
      btn.setAttribute('data-state', 'forced');
      btn.title = 'Puste pole wymuszone — kliknij aby nie dołączać';
    } else {
      // empty, not included
      btn.textContent = '−';
      btn.setAttribute('data-state', 'empty');
      btn.title = 'Pole puste — kliknij aby mimo to dołączyć';
    }
  });

  // attachments special case
  document.querySelectorAll('[data-field-id="attachments"]').forEach(btn => {
    const hasScreenshot = document.getElementById('has-screenshot')?.checked;
    const hasLogs       = document.getElementById('has-logs')?.checked;
    const hasContent    = hasScreenshot || hasLogs;
    const excluded      = excludedFields.has('attachments');
    const forced        = forcedFields.has('attachments');

    if (hasContent && !excluded) {
      btn.textContent = '+'; btn.setAttribute('data-state','included');
      btn.title = 'Sekcja wypełniona — kliknij aby wykluczyć';
    } else if (hasContent && excluded) {
      btn.textContent = '−'; btn.setAttribute('data-state','excluded');
      btn.title = 'Sekcja wykluczona — kliknij aby dołączyć';
    } else if (!hasContent && forced) {
      btn.textContent = '+'; btn.setAttribute('data-state','forced');
      btn.title = 'Pusta sekcja wymuszona — kliknij aby nie dołączać';
    } else {
      btn.textContent = '−'; btn.setAttribute('data-state','empty');
      btn.title = 'Sekcja pusta — kliknij aby mimo to dołączyć';
    }
  });
}

// ── Update empty-state dimming on inputs ──────────────
function updateEmptyStates() {
  const fields = ['description','ver','branch','env','appVer','browser-os','steps','actual','expected','testdata'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('data-empty', isEmpty(el.value) ? 'true' : 'false');
  });
  ['severity','repeatability','impact'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('data-empty', isEmpty(el.value) ? 'true' : 'false');
  });
}

// ── Populate selects ───────────────────────────────────
function populateSelects() {
  const d = CONFIG.defaults;
  const fill = (id, arr) => {
    const el = document.getElementById(id);
    if (el) arr.forEach(v => el.appendChild(new Option(v, v)));
  };
  fill('severity',      d.severity_options);
  fill('repeatability', d.repeatability_options);
  fill('impact',        d.impact_options);
  CONFIG.apps.forEach(a => {
    const el = document.getElementById('app-select');
    if (el) el.appendChild(new Option(a.name, a.id));
  });
  const bos = document.getElementById('browser-os');
  if (bos) bos.value = d.browser_os;
  update();
}

// ── Multiselect dropdown ───────────────────────────────
// Przechowuje zaznaczone moduły
let msSelected = [];

function msToggle() {
  const wrap = document.getElementById('ms-modules');
  wrap.classList.toggle('open');
  if (wrap.classList.contains('open')) {
    // kliknięcie poza — zamknij
    setTimeout(() => document.addEventListener('click', msClickOutside, { once: true }), 0);
  }
}

function msClickOutside(e) {
  const wrap = document.getElementById('ms-modules');
  if (wrap && !wrap.contains(e.target)) {
    wrap.classList.remove('open');
  }
}

function msKeydown(e) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); msToggle(); }
  if (e.key === 'Escape') document.getElementById('ms-modules').classList.remove('open');
}

function msRebuild(modules) {
  // Wyczyść zaznaczenie jeśli moduły się zmieniły
  msSelected = [];
  const dropdown = document.getElementById('ms-dropdown');
  dropdown.innerHTML = '';
  modules.forEach(m => {
    const opt = document.createElement('div');
    opt.className = 'ms-option';
    opt.textContent = m;
    opt.dataset.value = m;
    opt.addEventListener('click', (e) => { e.stopPropagation(); msSelectOption(m); });
    dropdown.appendChild(opt);
  });
  msRenderTrigger();
  update();
}

function msSelectOption(value) {
  if (msSelected.includes(value)) {
    msSelected = msSelected.filter(v => v !== value);
  } else {
    msSelected.push(value);
  }
  msRenderTrigger();
  msRenderDropdown();
  update();
}

function msRemoveTag(value, e) {
  e.stopPropagation();
  msSelected = msSelected.filter(v => v !== value);
  msRenderTrigger();
  msRenderDropdown();
  update();
}

function msRenderTrigger() {
  const trigger = document.getElementById('ms-trigger');
  if (msSelected.length === 0) {
    trigger.innerHTML = '<span class="ms-placeholder">— wybierz —</span>';
  } else {
    trigger.innerHTML = msSelected.map(v =>
      `<span class="ms-tag">${v}<span class="ms-remove" onclick="msRemoveTag('${v.replace(/'/g,"\\'")}',event)">×</span></span>`
    ).join('');
  }
}

function msRenderDropdown() {
  document.querySelectorAll('#ms-dropdown .ms-option').forEach(opt => {
    opt.classList.toggle('selected', msSelected.includes(opt.dataset.value));
  });
}

// ── App change → moduły ───────────────────────────────
function onAppChange() {
  const appId = document.getElementById('app-select').value;
  if (appId) {
    const app = CONFIG.apps.find(a => a.id === appId);
    msRebuild(app ? app.modules : []);
  } else {
    msRebuild([]);
  }
  update();
}

// ── App status check ──────────────────────────────────
async function checkProxy() {
  const dot   = document.getElementById('proxy-dot');
  const label = document.getElementById('proxy-label');
  try {
    const r = await fetch(`${SERVER_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      dot.className = (dot.className.includes('status-dot') ? 'status-dot' : 'dot') + ' online';
      if (label) label.textContent = `app status | ${CONFIG.proxy.port}`;
      return;
    }
  } catch {}
  dot.className = (dot.className.includes('status-dot') ? 'status-dot' : 'dot') + ' error';
  if (label) label.textContent = 'app offline';
}

// ── API fetch ──────────────────────────────────────────
async function fetchVersion() {
  const appId = document.getElementById('app-select').value;
  if (!appId) { showToast('Wybierz aplikację', 'error'); return; }
  const btn = document.getElementById('fetch-btn');
  const fb  = document.getElementById('api-feedback');
  btn.textContent = '⟳'; btn.classList.add('loading');
  if (fb) fb.className = fb.className.replace(/\b(success|error|ok|err)\b/g, '');
  try {
    const r = await fetch(`${SERVER_BASE}/api/version/${appId}`, { signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
    document.getElementById('ver').value    = d.ver    || '';
    document.getElementById('branch').value = d.branch || '';
    document.getElementById('env').value    = d.env    || '';
    document.getElementById('appVer').value = d.appVer || '';
    if (fb) { fb.textContent = `✓ Pobrano (${new Date().toLocaleTimeString('pl')})`; fb.className = fb.className.includes('api-fb') ? 'api-fb ok' : 'api-feedback success'; }
    showToast('✓ Dane pobrane', 'success');
  } catch(e) {
    if (fb) { fb.textContent = `✗ ${e.message}`; fb.className = fb.className.includes('api-fb') ? 'api-fb err' : 'api-feedback error'; }
    showToast('✗ ' + e.message, 'error');
  } finally { btn.textContent = '⟳ API'; btn.classList.remove('loading'); update(); }
}

// ── Get values ─────────────────────────────────────────
function getValues() {
  return {
    severity:      document.getElementById('severity').value,
    repeatability: document.getElementById('repeatability').value,
    impact:        document.getElementById('impact').value,
    description:   document.getElementById('description').value.trim(),
    module: [...msSelected],
    ver:           document.getElementById('ver').value.trim(),
    branch:        document.getElementById('branch').value.trim(),
    env:           document.getElementById('env').value.trim(),
    appVer:        document.getElementById('appVer').value.trim(),
    browserOs:     document.getElementById('browser-os').value.trim(),
    steps:         document.getElementById('steps').value.trim(),
    actual:        document.getElementById('actual').value.trim(),
    expected:      document.getElementById('expected').value.trim(),
    testdata:      document.getElementById('testdata').value.trim(),
    hasScreenshot: document.getElementById('has-screenshot').checked,
    hasLogs:       document.getElementById('has-logs').checked,
  };
}

// ── Update ─────────────────────────────────────────────
function update() {
  const v = getValues();
  updateEmptyStates();
  updateForceBtns();
  const st   = v.severity ? `[${v.severity.split(' ')[0]}]` : '[S?]';
  // modules: [Mod1][Mod2] bez spacji
  const mt   = v.module.length ? v.module.map(m => `[${m}]`).join('') : '[Moduł]';
  const ds   = v.description ? v.description.slice(0,50)+(v.description.length>50?'…':'') : 'Opis...';
  document.getElementById('summary-preview').textContent = `${st}${mt} ${ds}`;
  document.getElementById('preview-output').textContent  = buildMarkup(v);
}

// ── Build markup — pełny (podgląd + zapis do pliku) ────
// zawiera h1 z summary na górze
function buildMarkup(v) {
  return _buildLines(v, true).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Build markup — do kopiowania (bez h1 summary) ──────
function buildMarkupForCopy(v) {
  return _buildLines(v, false).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function _buildLines(v, includeSummaryH1) {
  const st  = v.severity ? `[${v.severity.split(' ')[0]}]` : '[S?]';
  const mt  = v.module.length ? v.module.map(m => `[${m}]`).join('') : '[Moduł]';
  const ds  = v.description ? v.description.slice(0,50)+(v.description.length>50?'…':'') : 'Opis...';
  const L   = [];

  if (includeSummaryH1) {
    L.push(`h1. ${st}${mt} ${ds}`, '');
  }

  // Description
  if (include('description', v.description)) {
    L.push('h2. 📝 Description');
    L.push(v.description || '_(brak opisu)_');
    L.push('');
  }

  // Environment — show section if at least one row would appear
  const envFields = ['ver','branch','env','appVer','browser-os'];
  const envValues = [v.ver, v.branch, v.env, v.appVer, v.browserOs];
  const anyEnvIncluded = envFields.some((id, i) => include(id, envValues[i]));
  if (anyEnvIncluded) {
    L.push('h2. 💻 Environment', '|| Pole || Wartość ||');
    if (include('ver',        v.ver))       L.push(`| *Version* | ${v.ver       || '—'} |`);
    if (include('branch',     v.branch))    L.push(`| *Branch*  | ${v.branch    || '—'} |`);
    if (include('env',        v.env))       L.push(`| *Env*     | ${v.env       || '—'} |`);
    if (include('appVer',     v.appVer))    L.push(`| *App Ver* | ${v.appVer    || '—'} |`);
    if (include('browser-os', v.browserOs)) L.push(`| *System*  | ${v.browserOs || '—'} |`);
    L.push('');
  }

  // Steps
  if (include('steps', v.steps)) {
    L.push('h2. 🛠 Steps to Reproduce');
    if (v.steps) {
      v.steps.split('\n').filter(l => l.trim()).forEach(l => L.push(`# ${l.trim()}`));
    } else {
      L.push('# _(brak kroków)_');
    }
    L.push('');
  }

  // Actual result
  if (include('actual', v.actual)) {
    L.push('h2. ❌ Actual Result');
    L.push(v.actual || '_(brak)_');
    L.push('');
  }

  // Expected result
  if (include('expected', v.expected)) {
    L.push('h2. ✅ Expected Result');
    L.push(v.expected || '_(brak)_');
    L.push('');
  }

  // Test data
  if (include('testdata', v.testdata)) {
    L.push('h2. 🗂 Test Data');
    L.push(v.testdata || '_(brak)_');
    L.push('');
  }

  // Metadata — include if any meta field would appear
  const metaFields = ['severity','repeatability','impact'];
  const metaValues = [v.severity, v.repeatability, v.impact];
  const anyMetaIncluded = metaFields.some((id, i) => include(id, metaValues[i]))
    || include('attachments', v.hasScreenshot || v.hasLogs ? 'yes' : '');
  if (anyMetaIncluded) {
    L.push('h2. 📊 Metadata');
    if (include('severity',     v.severity))      L.push(`* *Severity:* ${v.severity}`);
    if (include('repeatability',v.repeatability)) L.push(`* *Repeatability:* ${v.repeatability}`);
    if (include('impact',       v.impact))        L.push(`* *Business Impact:* ${v.impact}`);
    if (include('attachments',  v.hasScreenshot || v.hasLogs ? 'yes' : '')) {
      L.push(`* *Screenshots:* ${v.hasScreenshot ? 'TAK ✓' : 'NIE'}`);
      L.push(`* *Logs:* ${v.hasLogs ? 'TAK ✓' : 'NIE'}`);
    }
  }

  return L;
}

// ── wrapCode ──────────────────────────────────────────
function wrapCode(fieldId, lang = 'json') {
  const ta    = document.getElementById(fieldId);
  const hint  = document.getElementById(`hint-${fieldId}`);
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const open  = `{code:${lang}}\n`;
  const close = `\n{code}`;

  if (start === end) {
    const before = ta.value.slice(0, start);
    const after  = ta.value.slice(start);
    ta.value = before + open + close + after;
    const cur = start + open.length;
    ta.setSelectionRange(cur, cur);
    if (hint) {
      hint.textContent = '✓ Wstawiono pusty blok — wpisz kod w środku';
      hint.classList.add('has-selection', 'sel');
      setTimeout(() => { hint.textContent = 'zaznacz lub kliknij bez zaznaczenia'; hint.classList.remove('has-selection','sel'); }, 2800);
    }
  } else {
    const before   = ta.value.slice(0, start);
    const selected = ta.value.slice(start, end);
    const after    = ta.value.slice(end);
    ta.value = before + open + selected + close + after;
    ta.setSelectionRange(start + open.length + selected.length + close.length, start + open.length + selected.length + close.length);
  }
  ta.focus(); update();
}

// ── unwrapCode ────────────────────────────────────────
function unwrapCode(fieldId) {
  const ta    = document.getElementById(fieldId);
  const hint  = document.getElementById(`hint-${fieldId}`);
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  if (start === end) {
    const prev = ta.value;
    ta.value = ta.value.replace(/\{code(?::[a-z]+)?\}\n?/gi,'').replace(/\n?\{code\}/gi,'');
    if (ta.value === prev && hint) {
      hint.textContent = '— brak bloków kodu';
      hint.classList.add('has-selection','sel');
      setTimeout(() => { hint.textContent='zaznacz lub kliknij bez zaznaczenia'; hint.classList.remove('has-selection','sel'); }, 2200);
      return;
    }
  } else {
    const before   = ta.value.slice(0, start);
    const selected = ta.value.slice(start, end);
    const after    = ta.value.slice(end);
    const cleaned  = selected.replace(/\{code(?::[a-z]+)?\}\n?/gi,'').replace(/\n?\{code\}/gi,'');
    ta.value = before + cleaned + after;
    ta.setSelectionRange(start, start + cleaned.length);
  }
  ta.focus(); update();
}

// ── Track selection ────────────────────────────────────
function trackSelection(id) {
  const ta   = document.getElementById(id);
  const hint = document.getElementById(`hint-${id}`);
  if (!hint) return;
  const has = ta.selectionStart !== ta.selectionEnd;
  hint.classList.toggle('has-selection', has);
  hint.classList.toggle('sel', has);
  hint.textContent = has
    ? `✓ zaznaczono ${ta.selectionEnd - ta.selectionStart} znaków`
    : 'zaznacz lub kliknij bez zaznaczenia';
}

// ── Copy / Save ────────────────────────────────────────
async function copyToClipboard() {
  // kopiuj markup BEZ h1 summary
  const v      = getValues();
  const markup = buildMarkupForCopy(v);
  await _copy(markup, 'copy-btn', '✓ Markup skopiowany (bez summary)');
}
async function copySummary() {
  await _copy(document.getElementById('summary-preview').textContent, 'copy-summary-btn', '✓ Summary skopiowane');
}
async function _copy(text, btnId, msg) {
  const btn = document.getElementById(btnId);
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.innerHTML;
    btn.textContent = '✓'; btn.classList.add('copied');
    showToast(msg, 'success');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1800);
  } catch { showToast('✗ Błąd schowka', 'error'); }
}

async function saveToFile() {
  const proxyOnline = document.getElementById('proxy-dot').classList.contains('online');
  if (!proxyOnline) { showToast('✗ Serwer offline — uruchom jira_bug_reporter.py', 'error'); return; }
  const btn     = document.getElementById('save-btn');
  const info    = document.getElementById('save-info');
  const origHtml = btn.innerHTML;
  btn.classList.add('saving'); btn.textContent = '…';
  // zapis zawiera PEŁNY markup (z h1 summary)
  const fullMarkup = document.getElementById('preview-output').textContent;
  const summary    = document.getElementById('summary-preview').textContent;
  try {
    const r = await fetch('/save-report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, markup: fullMarkup }),
    });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
    if (info) {
      info.style.display = 'flex';
      info.innerHTML = `<span>✓ Zapisano:</span><span class="save-path sp">${d.path}</span><button class="save-close sc" onclick="document.getElementById('save-info').style.display='none'">✕</button>`;
    }
    showToast(`✓ ${d.filename}`, 'success');
  } catch(e) { showToast(`✗ ${e.message}`, 'error'); }
  finally { btn.innerHTML = origHtml; btn.classList.remove('saving'); }
}

// ── Shutdown server ────────────────────────────────────
async function shutdownServer() {
  const btn = document.querySelector('.shutdown-btn');
  if (!confirm('Czy na pewno chcesz wyłączyć serwer?\nStrona przestanie działać.')) return;
  if (btn) { btn.textContent = '…'; btn.disabled = true; }
  try {
    await fetch('/shutdown', { method: 'POST' });
  } catch {}
  // Pokaż komunikat — serwer nie odpowie już po zamknięciu
  document.body.innerHTML = `
    <div style="
      min-height:100vh; display:flex; align-items:center; justify-content:center;
      background:#0b0d14; font-family:'DM Sans',sans-serif; color:#dde2f0; text-align:center;
    ">
      <div>
        <div style="font-size:48px;margin-bottom:20px">⏻</div>
        <div style="font-size:22px;font-weight:600;margin-bottom:10px">Serwer wyłączony</div>
        <div style="font-size:14px;color:#8892a8">Możesz zamknąć tę kartę przeglądarki.</div>
        <div style="margin-top:28px;font-size:12px;color:#252a3a;font-family:monospace">
          Aby ponownie uruchomić: <code style="color:#4ade80">python jira_bug_reporter.py</code>
        </div>
      </div>
    </div>`;
}

// ── Toast ──────────────────────────────────────────────
let _toastTimer;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Init ───────────────────────────────────────────────
async function init() {
  await loadConfig();
  applyTheme(CONFIG.theme || 'bugreporter', CONFIG.dark_mode !== false);
  populateSelects();
  checkProxy();
  ['actual','testdata'].forEach(id => {
    const ta = document.getElementById(id);
    if (!ta) return;
    ta.addEventListener('mouseup', () => trackSelection(id));
    ta.addEventListener('keyup',   () => trackSelection(id));
  });
}
