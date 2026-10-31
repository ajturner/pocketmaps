import './styles.css';
import { loadSource, detectSourceType } from './sources/index.js';
import { inferFields, featuresToPlaces } from './places.js';
import { buildBooklet } from './booklet.js';
import { renderSheets, renderProof, hydrateMaps } from './render.js';
import { createMapProvider } from './maps/provider.js';
import { MapImageRenderer } from './maps/renderer.js';
import { MAPLIBRE_STYLES } from './maps/maplibre.js';

const $ = (id) => document.getElementById(id);
const ui = {
  sourceForm: $('source-form'), url: $('url'), file: $('file'), where: $('where'), max: $('max'), load: $('load'), summary: $('source-summary'),
  bookletForm: $('booklet-form'), title: $('title'), subtitle: $('subtitle'), nameField: $('name-field'), descField: $('desc-field'), template: $('desc-template'),
  overview: $('overview'), sheets: $('sheets'), paper: $('paper'), style: $('style'), detail: $('detail'), generate: $('generate'), copyLink: $('copy-link'),
  status: $('status'), progress: $('progress'), print: $('print'),
  sheetsView: $('sheets-view'), proofView: $('proof'), viewRadios: document.querySelectorAll('input[name="view"]'), folds: $('folds'), pageStyle: $('page-style'),
  whereRow: $('where-row'),
};

const state = window.__pocketmaps = { source: null, booklet: null, provider: null, providerKey: null, renderer: null, specs: new Map(), busy: false };

// ---------- helpers ----------
const prettyName = (n) => String(n || '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
function status(msg, kind = '') {
  ui.status.textContent = msg;
  ui.status.className = `status ${kind}`;
}
function setBusy(b) {
  state.busy = b;
  ui.load.disabled = b;
  ui.generate.disabled = b || !state.source;
  document.body.classList.toggle('busy', b);
}
function fillSelect(select, fields, chosen, allowNone) {
  select.replaceChildren();
  if (allowNone) select.append(new Option('(none)', ''));
  for (const f of fields) select.append(new Option(f.alias && f.alias !== f.name ? `${f.alias} (${f.name})` : f.name, f.name));
  if (chosen && fields.some((f) => f.name === chosen)) select.value = chosen;
}
function applyPaper() {
  const paper = ui.paper.value;
  document.documentElement.dataset.paper = paper;
  ui.pageStyle.textContent = `@page { size: ${paper === 'a4' ? 'A4' : 'letter'} portrait; margin: 0; }`;
}
function updateSourceKindUI() {
  const kind = detectSourceType(ui.url.value.trim());
  ui.whereRow.hidden = kind !== 'feature-service';
}

// ---------- provider ----------
async function getRenderer() {
  const key = `maplibre|${ui.style.value}|${ui.detail.value}`;
  if (state.renderer && state.providerKey === key) return state.renderer;
  state.renderer?.dispose();
  const provider = await createMapProvider('maplibre', { style: ui.style.value, pixelRatio: Number(ui.detail.value) });
  state.provider = provider;
  state.renderer = new MapImageRenderer(provider);
  state.providerKey = key;
  return state.renderer;
}

// ---------- load ----------
async function loadData() {
  if (state.busy) return;
  setBusy(true);
  ui.summary.textContent = '';
  try {
    const file = ui.file.files?.[0];
    const url = ui.url.value.trim();
    if (!file && !url) throw new Error('Enter a data URL or choose a GeoJSON file.');
    const source = await loadSource({
      url: file ? null : url, file, where: ui.where.value.trim(), maxFeatures: Number(ui.max.value) || 200,
      onStatus: (m) => status(m, 'working'),
    });
    state.source = source;
    const guess = inferFields(source.fields, { displayField: source.displayField });
    fillSelect(ui.nameField, source.fields, params.get('name') || guess.nameField, false);
    fillSelect(ui.descField, source.fields, params.has('desc') ? params.get('desc') : guess.descriptionField, true);
    if (!ui.title.value || ui.title.dataset.auto === '1') { ui.title.value = prettyName(source.name); ui.title.dataset.auto = '1'; }
    if (!ui.subtitle.value && source.where && source.where !== '1=1') ui.subtitle.value = source.where;
    const geom = source.geometryType ? source.geometryType.replace(/^esriGeometry/, '') : 'unknown geometry';
    ui.summary.textContent = `${source.features.length} features · ${geom} · ${source.fields.length} fields`;
    status(`Loaded "${source.name}". Choose fields, then generate.`, 'ok');
    ui.bookletForm.hidden = false;
  } catch (err) {
    console.error(err);
    state.source = null;
    status(`Could not load data: ${err.message}`, 'error');
  } finally {
    setBusy(false);
  }
}

// ---------- generate ----------
async function generate() {
  if (state.busy || !state.source) return;
  setBusy(true);
  try {
    status('Building booklet…', 'working');
    const { places, skipped } = featuresToPlaces(state.source.features, {
      nameField: ui.nameField.value,
      descriptionField: ui.descField.value || null,
      descriptionTemplate: ui.template.value.trim() || null,
    });
    if (!places.length) throw new Error('No features with usable geometry.');

    const renderer = await getRenderer();
    status('Loading basemap…', 'working');
    await state.provider.prepare();
    const booklet = buildBooklet(places, {
      title: ui.title.value.trim() || state.source.name,
      subtitle: ui.subtitle.value.trim(),
      overview: ui.overview.checked,
      sheets: ui.sheets.value,
      attribution: [state.source.attribution, state.provider.attribution].filter(Boolean).join(' · '),
    });
    state.booklet = booklet;
    state.specs = new Map();
    const ctx = { specs: state.specs, folds: ui.folds.checked };
    ui.sheetsView.replaceChildren(renderSheets(booklet, ctx));
    ui.proofView.replaceChildren(renderProof(booklet, ctx));

    const notes = [];
    if (booklet.dropped) notes.push(`${booklet.dropped} place${booklet.dropped === 1 ? '' : 's'} did not fit on ${booklet.sheets} sheet${booklet.sheets === 1 ? '' : 's'}`);
    if (skipped.noGeometry) notes.push(`${skipped.noGeometry} without geometry skipped`);
    if (skipped.duplicate) notes.push(`${skipped.duplicate} duplicates skipped`);

    ui.progress.hidden = false;
    const errors = await hydrateMaps(document, state.specs, renderer, (done, total) => {
      ui.progress.max = total; ui.progress.value = done;
      status(`Rendering maps ${done}/${total}…`, 'working');
    });
    ui.progress.hidden = true;
    const summary = `${booklet.places.length} places on ${booklet.sheets} sheet${booklet.sheets === 1 ? '' : 's'} (${booklet.pages.length} pages).`;
    if (errors.length) status(`${summary} ${errors.length} map${errors.length === 1 ? '' : 's'} failed: ${errors[0].message}`, 'error');
    else status([summary, ...notes].join(' '), notes.length ? 'warn' : 'ok');
    history.replaceState(null, '', permalink());
  } catch (err) {
    console.error(err);
    status(`Could not generate: ${err.message}`, 'error');
  } finally {
    setBusy(false);
  }
}

// ---------- permalink ----------
const params = new URLSearchParams(location.search);
function permalink() {
  const p = new URLSearchParams();
  if (ui.url.value.trim()) p.set('url', ui.url.value.trim());
  if (!ui.whereRow.hidden && ui.where.value.trim() && ui.where.value.trim() !== '1=1') p.set('where', ui.where.value.trim());
  if (ui.title.dataset.auto !== '1' && ui.title.value.trim()) p.set('title', ui.title.value.trim());
  if (ui.subtitle.value.trim()) p.set('subtitle', ui.subtitle.value.trim());
  if (ui.nameField.value) p.set('name', ui.nameField.value);
  if (ui.descField.value) p.set('desc', ui.descField.value);
  if (ui.template.value.trim()) p.set('template', ui.template.value.trim());
  if (ui.overview.checked) p.set('overview', '1');
  if (ui.sheets.value !== 'auto') p.set('sheets', ui.sheets.value);
  if (ui.paper.value !== 'letter') p.set('paper', ui.paper.value);
  if (ui.style.value !== MAPLIBRE_STYLES['OpenFreeMap Liberty']) p.set('style', ui.style.value);
  if (ui.max.value !== '200') p.set('max', ui.max.value);
  const qs = p.toString();
  return location.pathname + (qs ? `?${qs}` : '');
}
function applyParams() {
  if (params.get('url')) ui.url.value = params.get('url');
  if (params.get('where')) ui.where.value = params.get('where');
  if (params.get('title')) { ui.title.value = params.get('title'); ui.title.dataset.auto = '0'; }
  if (params.get('subtitle')) ui.subtitle.value = params.get('subtitle');
  if (params.get('template')) ui.template.value = params.get('template');
  if (params.get('overview') === '1') ui.overview.checked = true;
  if (params.get('sheets')) ui.sheets.value = params.get('sheets');
  if (params.get('paper')) ui.paper.value = params.get('paper');
  if (params.get('style')) { if (![...ui.style.options].some((o) => o.value === params.get('style'))) ui.style.append(new Option('Custom style', params.get('style'))); ui.style.value = params.get('style'); }
  if (params.get('max')) ui.max.value = params.get('max');
}

// ---------- wire up ----------
for (const [label, url] of Object.entries(MAPLIBRE_STYLES)) ui.style.append(new Option(label, url));
applyParams();
applyPaper();
updateSourceKindUI();

ui.sourceForm.addEventListener('submit', (e) => { e.preventDefault(); loadData(); });
ui.bookletForm.addEventListener('submit', (e) => { e.preventDefault(); generate(); });
ui.url.addEventListener('input', updateSourceKindUI);
ui.file.addEventListener('change', () => { if (ui.file.files?.length) { ui.url.value = ''; updateSourceKindUI(); } });
ui.title.addEventListener('input', () => { ui.title.dataset.auto = ui.title.value ? '0' : '1'; });
ui.paper.addEventListener('change', applyPaper);
ui.print.addEventListener('click', () => window.print());
ui.copyLink.addEventListener('click', async () => {
  const link = location.origin + permalink();
  try { await navigator.clipboard.writeText(link); status('Link copied.', 'ok'); } catch { prompt('Copy this link', link); }
});
ui.folds.addEventListener('change', () => document.body.classList.toggle('hide-folds', !ui.folds.checked));
for (const r of ui.viewRadios) r.addEventListener('change', () => {
  const proof = document.querySelector('input[name="view"]:checked').value === 'pages';
  ui.sheetsView.hidden = proof;
  ui.proofView.hidden = !proof;
});

setBusy(false);
if (params.get('url')) {
  loadData().then(() => { if (state.source && params.get('go') !== '0') generate(); });
}
