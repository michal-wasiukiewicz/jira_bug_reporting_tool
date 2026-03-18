// ═══════════════════════════════════════════════════════
//  KONFIGURACJA — edytuj tutaj
// ═══════════════════════════════════════════════════════
const PROXY_BASE = 'http://localhost:5000';
const CONFIG = {
  proxy: { host: 'localhost', port: 5000 },
  apps: [
    { id: 'app1', name: 'Portal Klienta',    modules: ['Logowanie','Dashboard','Płatności','Raporty','Ustawienia'],         api_url: 'http://your-api/app1/version' },
    { id: 'app2', name: 'Panel Admina',      modules: ['Użytkownicy','Role i uprawnienia','Logi systemowe','Konfiguracja'], api_url: 'http://your-api/app2/version' },
    { id: 'app3', name: 'Aplikacja Mobilna', modules: ['Onboarding','Główny ekran','Powiadomienia','Profil'],              api_url: 'http://your-api/app3/version' },
  ],
  defaults: {
    browser_os:           'Chrome / Windows 11',
    severity_options:     ['S1 - Blocker','S2 - Critical','S3 - Major','S4 - Minor','S5 - Trivial'],
    repeatability_options:['100%','Często','Sporadycznie','Raz'],
    impact_options:       ['Krytyczny','Wysoki','Średni','Niski'],
  }
};
// ═══════════════════════════════════════════════════════

// ── Theme ──────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = next === 'dark' ? '🌙' : '☀️';
  const lbl = document.getElementById('theme-label');
  if (lbl) lbl.textContent = next === 'dark' ? 'Dark' : 'Light';
  localStorage.setItem('jbf-theme', next);
}
(function applyStoredTheme() {
  const t = localStorage.getItem('jbf-theme');
  if (!t) return;
  document.documentElement.setAttribute('data-theme', t);
  document.addEventListener('DOMContentLoaded', () => {
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = t === 'dark' ? '🌙' : '☀️';
    const lbl = document.getElementById('theme-label');
    if (lbl) lbl.textContent = t === 'dark' ? 'Dark' : 'Light';
  });
})();

// ── Accordion (v4 only) ───────────────────────────────
function toggleAcc(id) {
  document.getElementById(id).classList.toggle('open');
}

// ── Force toggle ──────────────────────────────────────
// Each field or section can be "forced" = include in markup even if empty.
// Data stored in a Set of field ids.
const forcedFields = new Set();

function toggleForce(fieldId, btn) {
  if (forcedFields.has(fieldId)) {
    forcedFields.delete(fieldId);
    btn.setAttribute('data-forced', 'false');
    btn.textContent = '·';
    btn.title = 'Dołącz do opisu mimo braku treści';
  } else {
    forcedFields.add(fieldId);
    btn.setAttribute('data-forced', 'true');
    btn.textContent = '+';
    btn.title = 'Kliknij aby wykluczyć';
  }
  update();
}

// ── isEmpty helper ────────────────────────────────────
function isEmpty(val) {
  return !val || val.trim() === '';
}

// ── should include field/section in markup? ───────────
function include(fieldId, value) {
  if (!isEmpty(value)) return true;          // has content → always include
  return forcedFields.has(fieldId);           // empty but forced → include
}

// ── Update empty-state dimming on inputs ──────────────
function updateEmptyStates() {
  const fields = ['description','ver','branch','env','appVer','browser-os','steps','actual','expected','testdata'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('data-empty', isEmpty(el.value) ? 'true' : 'false');
  });
  const sev = document.getElementById('severity');
  const rep = document.getElementById('repeatability');
  const imp = document.getElementById('impact');
  if (sev) sev.setAttribute('data-empty', isEmpty(sev.value) ? 'true' : 'false');
  if (rep) rep.setAttribute('data-empty', isEmpty(rep.value) ? 'true' : 'false');
  if (imp) imp.setAttribute('data-empty', isEmpty(imp.value) ? 'true' : 'false');
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

// ── App change → modules ──────────────────────────────
function onAppChange() {
  const appId = document.getElementById('app-select').value;
  const mod   = document.getElementById('module-select');
  mod.innerHTML = '<option value="">—</option>';
  if (appId) {
    const app = CONFIG.apps.find(a => a.id === appId);
    if (app) app.modules.forEach(m => mod.appendChild(new Option(m, m)));
  }
  update();
}

// ── Proxy check ────────────────────────────────────────
async function checkProxy() {
  const dot   = document.getElementById('proxy-dot');
  const label = document.getElementById('proxy-label');
  try {
    const r = await fetch(`${PROXY_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      dot.className = (dot.className.includes('status-dot') ? 'status-dot' : 'dot') + ' online';
      if (label) label.textContent = `proxy :${CONFIG.proxy.port}`;
      return;
    }
  } catch {}
  dot.className = (dot.className.includes('status-dot') ? 'status-dot' : 'dot') + ' error';
  if (label) label.textContent = 'proxy offline';
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
    const r = await fetch(`${PROXY_BASE}/api/version/${appId}`, { signal: AbortSignal.timeout(6000) });
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
    module:        document.getElementById('module-select').value,
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
  const st = v.severity ? `[${v.severity.split(' ')[0]}]` : '[S?]';
  const mt = v.module   ? `[${v.module}]` : '[Moduł]';
  const ds = v.description ? v.description.slice(0,50)+(v.description.length>50?'…':'') : 'Opis...';
  document.getElementById('summary-preview').textContent = `${st} ${mt} ${ds}`;
  document.getElementById('preview-output').textContent  = buildMarkup(v);
}

// ── Build markup — fully optional sections ─────────────
function buildMarkup(v) {
  const st = v.severity ? `[${v.severity.split(' ')[0]}]` : '[S?]';
  const mt = v.module || 'Moduł';
  const ds = v.description ? v.description.slice(0,50)+(v.description.length>50?'…':'') : 'Opis...';
  const L  = [];

  // h1 always (it's the ticket title line)
  L.push(`h1. ${st} [${mt}] ${ds}`, '');

  // Description
  if (include('description', v.description)) {
    L.push('h2. 📝 Description');
    L.push(v.description || '_(brak opisu)_');
    L.push('');
  }

  // Environment — include section if any env field is filled or forced
  const envFields  = ['ver','branch','env','appVer','browser-os'];
  const envValues  = [v.ver, v.branch, v.env, v.appVer, v.browserOs];
  const anyEnvSet  = envValues.some(x => !isEmpty(x));
  const anyEnvForced = envFields.some(id => forcedFields.has(id));
  if (anyEnvSet || anyEnvForced) {
    L.push('h2. 💻 Environment', '|| Pole || Wartość ||');
    if (include('ver',        v.ver))      L.push(`| *Version* | ${v.ver      || '—'} |`);
    if (include('branch',     v.branch))   L.push(`| *Branch*  | ${v.branch   || '—'} |`);
    if (include('env',        v.env))      L.push(`| *Env*     | ${v.env      || '—'} |`);
    if (include('appVer',     v.appVer))   L.push(`| *App Ver* | ${v.appVer   || '—'} |`);
    if (include('browser-os', v.browserOs))L.push(`| *System*  | ${v.browserOs|| '—'} |`);
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

  // Metadata — include if any meta field filled or forced
  const metaFields  = ['severity','repeatability','impact'];
  const metaValues  = [v.severity, v.repeatability, v.impact];
  const screenshotHasValue = v.hasScreenshot;
  const logsHasValue = v.hasLogs;
  const anyMetaSet  = metaValues.some(x => !isEmpty(x)) || screenshotHasValue || logsHasValue;
  const anyMetaForced = metaFields.some(id => forcedFields.has(id)) || forcedFields.has('attachments');
  if (anyMetaSet || anyMetaForced) {
    L.push('h2. 📊 Metadata');
    if (include('severity',     v.severity))     L.push(`* *Severity:* ${v.severity}`);
    if (include('repeatability',v.repeatability))L.push(`* *Repeatability:* ${v.repeatability}`);
    if (include('impact',       v.impact))       L.push(`* *Business Impact:* ${v.impact}`);
    // attachments — always include if checked, or if forced
    if (v.hasScreenshot || v.hasLogs || forcedFields.has('attachments')) {
      L.push(`* *Screenshots:* ${v.hasScreenshot ? 'TAK ✓' : 'NIE'}`);
      L.push(`* *Logs:* ${v.hasLogs ? 'TAK ✓' : 'NIE'}`);
    }
  }

  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
async function copyToClipboard() { await _copy(document.getElementById('preview-output').textContent, 'copy-btn', '✓ Markup skopiowany'); }
async function copySummary()     { await _copy(document.getElementById('summary-preview').textContent, 'copy-summary-btn', '✓ Summary skopiowane'); }
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
  if (!proxyOnline) { showToast('✗ Proxy offline — uruchom proxy.py', 'error'); return; }
  const btn  = document.getElementById('save-btn');
  const info = document.getElementById('save-info');
  const origHtml = btn.innerHTML;
  btn.classList.add('saving'); btn.textContent = '…';
  try {
    const r = await fetch(`${PROXY_BASE}/save-report`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: document.getElementById('summary-preview').textContent,
        markup:  document.getElementById('preview-output').textContent,
      }),
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

// ── Toast ──────────────────────────────────────────────
let _toastTimer;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Init ───────────────────────────────────────────────
function init() {
  populateSelects();
  checkProxy();
  ['actual','testdata'].forEach(id => {
    const ta = document.getElementById(id);
    if (!ta) return;
    ta.addEventListener('mouseup', () => trackSelection(id));
    ta.addEventListener('keyup',   () => trackSelection(id));
  });
}
