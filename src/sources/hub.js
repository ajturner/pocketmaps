/**
 * ArcGIS Hub dataset pages.
 *
 * Accepts any Hub site (or hub.arcgis.com) dataset URL, for example:
 *   https://opendata.example.gov/datasets/<itemId>_<layer>/explore?filters=<base64>&location=…
 *   https://hub.arcgis.com/datasets/CoRedlands::street-trees/explore?filters=…
 *   https://site.hub.arcgis.com/datasets/<itemId>/about?layer=2
 *
 * Hub stores attribute filters in `filters` as base64-encoded JSON keyed by field:
 *   {"DISTRICT":["PARKS","7A"]}   -> DISTRICT IN ('PARKS','7A')
 *   {"ADDRESS":[0,32080]}         -> ADDRESS BETWEEN 0 AND 32080   (numeric field)
 *   {"CREATED":[t0,t1]}           -> CREATED BETWEEN timestamp … AND timestamp …  (date field, epoch ms)
 */

const HUB_API = 'https://hub.arcgis.com/api/v3/datasets';
const ITEM_RE = /^([0-9a-f]{32})(?:_(\d+))?$/i;
const PATH_RE = /\/(?:datasets|maps)\/([^/?#]+)/i;
const DOWNLOAD_EXT = /\.(geojson|json|csv|zip|kml|kmz|xlsx|gpkg)$/i;

export function isHubUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(PATH_RE);
    return Boolean(m) && !DOWNLOAD_EXT.test(m[1]) && !/\/rest\/services\//i.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * @returns {{origin:string, ref:string, itemId:string|null, layer:number|null, slug:string|null, filters:object, where:string|null}}
 */
export function parseHubUrl(url) {
  const u = new URL(url);
  const m = u.pathname.match(PATH_RE);
  if (!m) throw new Error('Not a Hub dataset URL (expected …/datasets/<id or slug>)');
  const ref = decodeURIComponent(m[1]);
  const item = ref.match(ITEM_RE);
  const layerParam = u.searchParams.get('layer');
  const layer = item?.[2] != null ? Number(item[2]) : layerParam != null && layerParam !== '' ? Number(layerParam) : null;
  return {
    origin: u.origin,
    ref,
    itemId: item ? item[1].toLowerCase() : null,
    layer: Number.isFinite(layer) ? layer : null,
    slug: item ? null : ref,
    filters: decodeHubFilters(u.searchParams.get('filters')),
    where: u.searchParams.get('where'),
  };
}

/** Decode Hub's base64 JSON filter param. Tolerates URL-safe base64 and missing padding. */
export function decodeHubFilters(param) {
  if (!param) return {};
  let b64 = param.trim().replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes));
    return json && typeof json === 'object' && !Array.isArray(json) ? json : {};
  } catch {
    try { return JSON.parse(param); } catch { return {}; }
  }
}

const NUMERIC = /integer|smallinteger|double|single|oid|biginteger|float|number/i;
const DATE = /date|timestamp/i;

const sqlString = (v) => `'${String(v).replace(/'/g, "''")}'`;
const sqlTimestamp = (ms) => {
  const d = new Date(Number(ms));
  const p = (n) => String(n).padStart(2, '0');
  return `timestamp '${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}'`;
};

/**
 * Turn Hub filters into a SQL where clause using the layer's field types.
 * Unknown fields are skipped so a stale filter cannot break the query.
 * @param {object} filters
 * @param {Array<{name:string,type?:string}>} fields
 * @returns {{where:string, skipped:string[]}}
 */
export function filtersToWhere(filters, fields = []) {
  const byLower = new Map(fields.map((f) => [f.name.toLowerCase(), f]));
  const clauses = [];
  const skipped = [];
  for (const [key, raw] of Object.entries(filters || {})) {
    const field = byLower.get(key.toLowerCase());
    if (fields.length && !field) { skipped.push(key); continue; }
    const name = field?.name || key;
    const type = field?.type || '';
    const values = Array.isArray(raw) ? raw : [raw];
    if (!values.length) continue;

    const isDate = DATE.test(type);
    const isNumeric = !isDate && NUMERIC.test(type);
    const isRange = (isDate || isNumeric) && values.length === 2 && values.every((v) => v === null || typeof v === 'number');
    if (isRange) {
      const [lo, hi] = values;
      const fmt = isDate ? sqlTimestamp : (v) => String(v);
      if (lo != null && hi != null) clauses.push(`${name} BETWEEN ${fmt(lo)} AND ${fmt(hi)}`);
      else if (lo != null) clauses.push(`${name} >= ${fmt(lo)}`);
      else if (hi != null) clauses.push(`${name} <= ${fmt(hi)}`);
      continue;
    }

    const nonNull = values.filter((v) => v !== null && v !== undefined);
    const parts = [];
    if (nonNull.length) {
      const list = nonNull.map((v) => (isNumeric && Number.isFinite(Number(v)) ? String(Number(v)) : sqlString(v)));
      parts.push(list.length === 1 ? `${name} = ${list[0]}` : `${name} IN (${list.join(', ')})`);
    }
    if (nonNull.length < values.length) parts.push(`${name} IS NULL`);
    clauses.push(parts.length > 1 ? `(${parts.join(' OR ')})` : parts[0]);
  }
  return { where: clauses.join(' AND '), skipped };
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function layerUrlFrom(serviceUrl, layer) {
  if (!serviceUrl) return null;
  const clean = serviceUrl.replace(/\/+$/, '').replace(/\/query$/i, '');
  if (/\/(Feature|Map)Server\/\d+$/i.test(clean)) return clean;
  if (/\/(Feature|Map)Server$/i.test(clean)) return `${clean}/${layer ?? 0}`;
  return null;
}

/**
 * Resolve a parsed Hub URL to a queryable layer.
 * Tries the global Hub API, then the site's own API (enterprise or private sites),
 * then the ArcGIS item itself.
 * @returns {Promise<{layerUrl:string, name:string}>}
 */
export async function resolveHubDataset(parsed) {
  const attempts = [];
  const datasetId = parsed.itemId ? `${parsed.itemId}${parsed.layer != null ? `_${parsed.layer}` : ''}` : null;
  for (const base of new Set([HUB_API, `${parsed.origin}/api/v3/datasets`])) {
    attempts.push(async () => {
      const url = datasetId ? `${base}/${datasetId}` : `${base}?filter%5Bslug%5D=${encodeURIComponent(parsed.slug)}`;
      const json = await getJson(url);
      const data = Array.isArray(json.data) ? json.data[0] : json.data;
      if (!data) throw new Error('not found');
      const layer = parsed.layer ?? (String(data.id).match(/_(\d+)$/)?.[1] ?? null);
      return { layerUrl: layerUrlFrom(data.attributes?.url, layer == null ? null : Number(layer)), name: data.attributes?.name || data.attributes?.title };
    });
  }
  if (parsed.itemId) {
    attempts.push(async () => {
      const item = await getJson(`https://www.arcgis.com/sharing/rest/content/items/${parsed.itemId}?f=json`);
      if (item.error) throw new Error(item.error.message);
      return { layerUrl: layerUrlFrom(item.url, parsed.layer), name: item.title };
    });
  }
  const errors = [];
  for (const attempt of attempts) {
    try {
      const r = await attempt();
      if (r.layerUrl) return r;
      errors.push('dataset is not a feature layer');
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(`Could not resolve Hub dataset "${parsed.ref}" to a feature layer (${[...new Set(errors)].join('; ')})`);
}
