/**
 * Online map for a printed PocketMap (view.html).
 *
 * The index page of a booklet carries a QR code to this page with the same
 * parameters the generator used, so it rebuilds the same list of places with
 * the same page numbers, shows them on an ArcGIS map, and links back to the
 * generator to print a fresh copy.
 */
import './view.css';
import { loadSource } from './sources/index.js';
import { inferFields, featuresToPlaces } from './places.js';
import { buildBooklet } from './booklet.js';
import { fillLinkTemplate, presetFor, DEFAULT_LINK_TEMPLATE } from './links.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const prettyName = (n) => String(n || '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();

function showError(message) {
  $('vw-skeleton').hidden = true;
  $('vw-error').hidden = false;
  $('vw-error-msg').textContent = message;
  $('vw-title').textContent = 'PocketMap';
}

/** Same steps as the generator, so places and page numbers match the print. */
async function loadBooklet() {
  const url = params.get('url');
  if (!url) throw new Error('This link has no data source. Open it from a printed PocketMap, or make one from the home page.');
  const source = await loadSource({ url, where: params.get('where') || '', maxFeatures: Number(params.get('max')) || 200 });
  const guess = inferFields(source.fields, { displayField: source.displayField });
  const nameField = params.get('name') || guess.nameField;
  const descriptionField = params.has('desc') ? params.get('desc') : guess.descriptionField;
  const { places } = featuresToPlaces(source.features, {
    nameField, descriptionField: descriptionField || null, descriptionTemplate: params.get('template') || null,
  });
  if (!places.length) throw new Error('The data source returned no places with a location.');
  const booklet = buildBooklet(places, { overview: params.get('overview') === '1', sheets: params.get('sheets') || 'auto' });
  const template = params.get('qr') === '0' ? DEFAULT_LINK_TEMPLATE : params.get('qrlink') || DEFAULT_LINK_TEMPLATE;
  for (const p of booklet.places) p.link = fillLinkTemplate(template, p);
  return { source, booklet, linkLabel: presetFor(template)?.label || 'Open link' };
}

function renderHeader({ source, booklet }) {
  const title = params.get('title') || prettyName(source.name);
  document.title = `${title} · PocketMap Live`;
  $('vw-title').textContent = title;
  const host = source.url ? new URL(source.url).host : 'a local file';
  $('vw-subtitle').textContent = `${booklet.places.length} places · ${booklet.sheets} sheet${booklet.sheets === 1 ? '' : 's'} · live from ${host}`;
  $('vw-asof').textContent = `Loaded live ${new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}. A printed copy shows the data as it was when printed.`;
  const print = $('vw-print');
  print.href = `app.html${location.search}`;
  print.disabled = false;
}

function renderList(places, onSelect) {
  const list = $('vw-list');
  for (const p of places) {
    const item = document.createElement('calcite-list-item');
    item.label = p.name;
    if (p.description) item.description = p.description.length > 120 ? `${p.description.slice(0, 117)}…` : p.description;
    item.value = String(p.page);
    item.setAttribute('value', String(p.page));
    const badge = document.createElement('span');
    badge.slot = 'content-start';
    badge.className = 'vw-page';
    badge.textContent = p.page;
    badge.title = `Page ${p.page} of the booklet`;
    item.append(badge);
    item.addEventListener('calciteListItemSelect', () => onSelect(p.page));
    list.append(item);
  }
  $('vw-skeleton').hidden = true;
  list.hidden = false;
}

async function renderMap(places, linkLabel) {
  const mapEl = $('vw-map');
  await customElements.whenDefined('arcgis-map'); // the SDK script defines $arcgis as it registers components
  const [FeatureLayer, Graphic, Point, Extent, reactiveUtils] = await $arcgis.import([
    '@arcgis/core/layers/FeatureLayer.js',
    '@arcgis/core/Graphic.js',
    '@arcgis/core/geometry/Point.js',
    '@arcgis/core/geometry/Extent.js',
    '@arcgis/core/core/reactiveUtils.js',
  ]);
  await mapEl.viewOnReady();

  const graphics = places.map((p, i) => new Graphic({
    geometry: new Point({ longitude: p.lon, latitude: p.lat }),
    attributes: { ObjectID: i + 1, page: p.page, name: p.name, description: p.description || '', link: p.link || '' },
  }));

  const layer = new FeatureLayer({
    title: 'Places',
    source: graphics,
    objectIdField: 'ObjectID',
    geometryType: 'point',
    spatialReference: { wkid: 4326 },
    fields: [
      { name: 'ObjectID', type: 'oid' },
      { name: 'page', type: 'integer', alias: 'Page' },
      { name: 'name', type: 'string', alias: 'Name' },
      { name: 'description', type: 'string', alias: 'Description' },
      { name: 'link', type: 'string', alias: 'Link' },
    ],
    renderer: {
      type: 'simple',
      symbol: { type: 'simple-marker', style: 'circle', size: 22, color: '#d7263d', outline: { color: '#ffffff', width: 2 } },
    },
    labelingInfo: [{
      labelExpressionInfo: { expression: 'Text($feature.page)' },
      labelPlacement: 'center-center',
      symbol: { type: 'text', color: '#ffffff', font: { size: 9, weight: 'bold', family: 'sans-serif' } },
    }],
    popupTemplate: {
      title: '{name}',
      outFields: ['*'],
      content: ({ graphic }) => popupContent(graphic.attributes, linkLabel),
    },
  });
  mapEl.map.add(layer);

  const lons = places.map((p) => p.lon), lats = places.map((p) => p.lat);
  const pad = 0.01;
  const extent = new Extent({
    xmin: Math.min(...lons) - pad, ymin: Math.min(...lats) - pad, xmax: Math.max(...lons) + pad, ymax: Math.max(...lats) + pad,
    spatialReference: { wkid: 4326 },
  });
  await mapEl.view.goTo(extent.expand(1.15), { animate: false }).catch(() => {});
  mapEl.view.constraints.snapToZoom = false;

  // Selecting a place on the map highlights it in the list.
  reactiveUtils.watch(() => mapEl.view.popup?.selectedFeature, (feature) => {
    const page = feature?.attributes?.page;
    for (const item of $('vw-list').querySelectorAll('calcite-list-item')) item.selected = item.value === String(page);
    $('vw-list').querySelector(`calcite-list-item[value="${page}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  return async (page) => {
    const { features } = await layer.queryFeatures({ where: `page = ${Number(page)}`, returnGeometry: true, outFields: ['*'] });
    if (!features.length) return;
    const target = features[0].geometry;
    await mapEl.view.goTo({ target, zoom: Math.max(mapEl.view.zoom, 16) }).catch(() => {});
    mapEl.view.openPopup({ features, location: target });
  };
}

/** Popup body built from DOM nodes, so attribute text is never parsed as HTML. */
function popupContent(attrs, linkLabel) {
  const root = document.createElement('div');
  root.className = 'vw-popup';
  if (attrs.description) {
    const p = document.createElement('p');
    p.textContent = attrs.description;
    p.style.cssText = 'margin:0 0 .6rem;white-space:pre-line';
    root.append(p);
  }
  const links = document.createElement('div');
  links.className = 'vw-popup-links';
  links.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:.4rem 1rem';
  const page = document.createElement('span');
  page.textContent = `Page ${attrs.page} in the booklet`;
  links.append(page);
  if (/^(https?:|geo:)/i.test(attrs.link)) {
    const a = document.createElement('a');
    a.href = attrs.link;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = `Open in ${linkLabel}`;
    a.style.fontWeight = '600';
    links.append(a);
  }
  root.append(links);
  return root;
}

function responsivePanel() {
  const panel = $('vw-panel');
  const mq = matchMedia('(max-width: 720px)');
  const print = $('vw-print');
  const apply = () => {
    // Phones: list docks under the map instead of beside it, and the header button shortens.
    panel.slot = mq.matches ? 'panel-bottom' : 'panel-start';
    panel.layout = mq.matches ? 'horizontal' : 'vertical';
    panel.heightScale = mq.matches ? 'l' : 'm';
    print.textContent = mq.matches ? 'Print a copy' : 'Print your own copy';
    print.scale = mq.matches ? 's' : 'm';
  };
  mq.addEventListener('change', apply);
  apply();
}

responsivePanel();
try {
  const data = await loadBooklet();
  renderHeader(data);
  // The list does not wait for the map, and still works if the map fails.
  const mapReady = renderMap(data.booklet.places, data.linkLabel);
  renderList(data.booklet.places, async (page) => (await mapReady)(page));
  await mapReady.catch((err) => {
    console.error(err);
    $('vw-error').hidden = false;
    $('vw-error').querySelector('[slot="title"]').textContent = 'The map could not load';
    $('vw-error-msg').textContent = err.message || String(err);
  });
} catch (err) {
  console.error(err);
  showError(err.message);
}
