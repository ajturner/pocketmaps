/**
 * Turn GeoJSON features into the flat "place" records the booklet consumes,
 * and the heuristics for picking name / description fields.
 */

const NAME_PATTERNS = [/^name$/i, /^title$/i, /name/i, /title/i, /label/i, /^site/i, /^facility/i];
const DESC_PATTERNS = [/^desc/i, /description/i, /address/i, /summary/i, /notes?$/i, /comment/i, /^info/i];
const SKIP_FIELDS = /^(objectid|fid|globalid|shape|shape_length|shape_area|shape__length|shape__area|id)$/i;

/** @typedef {{name:string, type?:string, alias?:string}} FieldInfo */

/**
 * Choose sensible default fields.
 * @param {FieldInfo[]} fields
 * @param {{displayField?:string}} [hints]
 */
export function inferFields(fields, hints = {}) {
  const names = fields.map((f) => f.name);
  const stringFields = fields.filter((f) => !f.type || /string|text/i.test(f.type)).map((f) => f.name);
  const pick = (patterns, exclude) => {
    for (const re of patterns) {
      const hit = stringFields.find((n) => re.test(n) && n !== exclude && !SKIP_FIELDS.test(n));
      if (hit) return hit;
    }
    return null;
  };
  let nameField = hints.displayField && names.includes(hints.displayField) ? hints.displayField : pick(NAME_PATTERNS);
  if (!nameField) nameField = stringFields.find((n) => !SKIP_FIELDS.test(n)) || names[0] || null;
  let descriptionField = pick(DESC_PATTERNS, nameField);
  if (!descriptionField) descriptionField = stringFields.find((n) => n !== nameField && !SKIP_FIELDS.test(n)) || null;
  return { nameField, descriptionField };
}

/** Collect field names and rough types from feature properties. */
export function fieldsFromFeatures(features, sample = 100) {
  const seen = new Map();
  for (const f of features.slice(0, sample)) {
    for (const [k, v] of Object.entries(f.properties || {})) {
      if (!seen.has(k)) seen.set(k, { name: k, type: v == null ? 'string' : typeof v });
      else if (seen.get(k).type !== 'string' && typeof v === 'string') seen.get(k).type = 'string';
    }
  }
  return [...seen.values()];
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®', deg: '°',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·', frac12: '½', frac14: '¼',
  aacute: 'á', agrave: 'à', acirc: 'â', auml: 'ä', atilde: 'ã', aring: 'å', aelig: 'æ', ccedil: 'ç',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï', ntilde: 'ñ',
  oacute: 'ó', ograve: 'ò', ocirc: 'ô', ouml: 'ö', otilde: 'õ', oslash: 'ø', uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü', szlig: 'ß',
  Aacute: 'Á', Agrave: 'À', Eacute: 'É', Egrave: 'È', Iacute: 'Í', Oacute: 'Ó', Ouml: 'Ö', Uacute: 'Ú', Uuml: 'Ü', Ntilde: 'Ñ', Ccedil: 'Ç',
};

/** Decode entities, turn <br> and block ends into newlines, strip remaining tags, collapse whitespace. */
export function cleanText(value) {
  if (value == null) return '';
  let s = String(value);
  s = s.replace(/<!\[CDATA\[|\]\]>/g, '');
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n');
  if (typeof DOMParser !== 'undefined') {
    s = new DOMParser().parseFromString(s, 'text/html').documentElement.textContent || '';
  }
  s = s.replace(/<[^>]*>/g, '');
  s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code] ?? ENTITIES[code.toLowerCase()] ?? m;
  });
  s = s.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  return s;
}

export function truncate(s, max = 220) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.5 ? cut.slice(0, at) : cut).trimEnd() + '…';
}

/** Fill a "{FIELD}" template from properties. Field names are matched case-insensitively. */
export function fillTemplate(template, props) {
  const lower = new Map(Object.keys(props || {}).map((k) => [k.toLowerCase(), k]));
  return template.replace(/\{([^}]+)\}/g, (_, key) => {
    const real = lower.get(key.trim().toLowerCase());
    const v = real === undefined ? undefined : props[real];
    return v == null ? '' : String(v);
  }).replace(/\s*,\s*,/g, ',').replace(/^[\s,]+|[\s,]+$/g, '');
}

/** A representative [lon, lat] for any GeoJSON geometry (bbox centre for non-points). */
export function geometryPoint(geometry) {
  if (!geometry) return null;
  const { type, coordinates, geometries } = geometry;
  if (type === 'Point') return isFinitePair(coordinates) ? [coordinates[0], coordinates[1]] : null;
  if (type === 'MultiPoint') return isFinitePair(coordinates?.[0]) ? [coordinates[0][0], coordinates[0][1]] : null;
  if (type === 'GeometryCollection') {
    for (const g of geometries || []) { const p = geometryPoint(g); if (p) return p; }
    return null;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (c) => {
    if (isFinitePair(c) && typeof c[0] === 'number') {
      if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0];
      if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1];
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(coordinates);
  return Number.isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : null;
}

function isFinitePair(c) {
  return Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]);
}

/**
 * @param {Array} features GeoJSON features
 * @param {object} opts
 * @param {string} opts.nameField
 * @param {string} [opts.descriptionField]
 * @param {string} [opts.descriptionTemplate]  overrides descriptionField when set, e.g. "{ADDRESS}, {CITY}"
 * @param {number} [opts.maxLength=220]
 * @returns {{places: Array, skipped: {noGeometry:number, duplicate:number}}}
 */
export function featuresToPlaces(features, opts) {
  const { nameField, descriptionField, descriptionTemplate, maxLength = 220 } = opts;
  const seen = new Set();
  const places = [];
  const skipped = { noGeometry: 0, duplicate: 0 };
  features.forEach((f, i) => {
    const pt = geometryPoint(f.geometry);
    if (!pt) { skipped.noGeometry++; return; }
    const props = f.properties || {};
    const name = cleanText(props[nameField]) || `Place ${i + 1}`;
    const raw = descriptionTemplate ? fillTemplate(descriptionTemplate, props) : (descriptionField ? props[descriptionField] : '');
    const description = truncate(cleanText(raw), maxLength);
    // Same name, text and position (to ~1 m) is a true duplicate; same species at another spot is not.
    const key = `${name}\u0000${description}\u0000${pt[0].toFixed(5)},${pt[1].toFixed(5)}`;
    if (seen.has(key)) { skipped.duplicate++; return; }
    seen.add(key);
    places.push({ id: f.id ?? props.OBJECTID ?? props.objectid ?? i, name, description, lon: pt[0], lat: pt[1], properties: props });
  });
  return { places, skipped };
}
