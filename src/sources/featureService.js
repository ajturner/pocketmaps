import { filtersToWhere } from './hub.js';

/**
 * ArcGIS Feature Service layer source.
 *
 * Accepts a layer URL in any of these shapes:
 *   https://host/arcgis/rest/services/Name/FeatureServer/0
 *   https://host/arcgis/rest/services/Name/FeatureServer/0?where=STATUS%3D'Open'
 *   https://host/arcgis/rest/services/Name/FeatureServer/0/query?where=...&geometry=...&f=geojson
 * Any query parameters on the URL are forwarded to the /query request, so a
 * filter built elsewhere (a Hub download link, a Map Viewer query) just works.
 * MapServer layers that support query are accepted too.
 */

const LAYER_RE = /^(.*\/(?:Feature|Map)Server\/\d+)(?:\/query)?\/?$/i;

export function isFeatureServiceUrl(url) {
  try {
    const u = new URL(url);
    return LAYER_RE.test(u.origin + u.pathname);
  } catch {
    return false;
  }
}

/** @returns {{layerUrl:string, params:Record<string,string>}} */
export function parseFeatureServiceUrl(url) {
  const u = new URL(url);
  const m = (u.origin + u.pathname).match(LAYER_RE);
  if (!m) throw new Error('Not a Feature Service layer URL (expected .../FeatureServer/<layerId>)');
  const params = {};
  for (const [k, v] of u.searchParams) params[k] = v;
  delete params.f;
  return { layerUrl: m[1], params };
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
  const json = await res.json();
  if (json && json.error) {
    const details = json.error.details?.length ? ` (${json.error.details.join('; ')})` : '';
    throw new Error(`${json.error.message || 'ArcGIS error'}${details}`);
  }
  return json;
}

/** Layer metadata: name, fields, displayField, geometryType, maxRecordCount, copyrightText, ... */
export async function fetchLayerInfo(layerUrl, { token } = {}) {
  const u = new URL(layerUrl);
  u.searchParams.set('f', 'json');
  if (token) u.searchParams.set('token', token);
  return getJson(u.toString());
}

/**
 * Query features as GeoJSON, paging until done or maxFeatures reached.
 * @param {string} layerUrl
 * @param {object} opts
 * @param {Record<string,string>} [opts.params]  extra query params (where, geometry, ...)
 * @param {string} [opts.where]     overrides params.where when set
 * @param {string} [opts.outFields='*']
 * @param {string} [opts.token]
 * @param {number} [opts.maxFeatures=500]
 * @param {number} [opts.pageSize=200]
 * @param {(msg:string)=>void} [opts.onStatus]
 */
export async function queryFeatures(layerUrl, opts = {}) {
  const { params = {}, where, outFields = '*', token, maxFeatures = 500, pageSize = 200, onStatus = () => {} } = opts;
  const features = [];
  let offset = 0;
  for (;;) {
    const u = new URL(layerUrl.replace(/\/$/, '') + '/query');
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set('where', where || params.where || '1=1');
    u.searchParams.set('outFields', outFields || params.outFields || '*');
    u.searchParams.set('returnGeometry', 'true');
    u.searchParams.set('outSR', '4326');
    u.searchParams.set('f', 'geojson');
    u.searchParams.set('resultOffset', String(offset));
    u.searchParams.set('resultRecordCount', String(Math.min(pageSize, maxFeatures - features.length)));
    if (token) u.searchParams.set('token', token);

    onStatus(`Fetching features ${offset + 1}…`);
    const json = await getJson(u.toString());
    const batch = json.features || [];
    features.push(...batch);
    const more = json.properties?.exceededTransferLimit ?? json.exceededTransferLimit ?? false;
    if (!more || batch.length === 0 || features.length >= maxFeatures) break;
    offset += batch.length;
  }
  return features;
}

/** Load a layer end to end. Returns the common source shape used by the app. */
export async function loadFeatureService(url, opts = {}) {
  const { layerUrl, params } = parseFeatureServiceUrl(url);
  const token = opts.token || params.token;
  opts.onStatus?.('Reading layer info…');
  const info = await fetchLayerInfo(layerUrl, { token });
  // Hub filters need field types to become SQL, so they are translated here.
  let where = opts.where || params.where || '';
  let skippedFilters = [];
  if (!opts.where && opts.hubFilters && Object.keys(opts.hubFilters).length) {
    const built = filtersToWhere(opts.hubFilters, info.fields || []);
    skippedFilters = built.skipped;
    where = [params.where && params.where !== '1=1' ? `(${params.where})` : '', built.where].filter(Boolean).join(' AND ');
  }
  const features = await queryFeatures(layerUrl, { ...opts, params, token, where: where || '1=1' });
  return {
    type: 'feature-service',
    url: layerUrl,
    name: info.name || layerUrl.split('/').slice(-3, -2)[0] || 'Feature layer',
    description: info.description || '',
    displayField: info.displayField || null,
    fields: (info.fields || []).map((f) => ({ name: f.name, alias: f.alias, type: f.type })),
    geometryType: info.geometryType || null,
    attribution: info.copyrightText || '',
    where,
    skippedFilters,
    features,
  };
}
