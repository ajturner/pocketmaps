/**
 * Per-place links, printed as QR codes on place pages.
 *
 * A link template is any URL with placeholders:
 *   {latitude} {longitude}   the place's position (WGS84, 6 decimals)
 *   {name}                   the place's display name
 *   {FIELD}                  any attribute of the feature, matched case-insensitively
 * Values are URL-encoded where they land, so names with spaces or "&" are safe.
 */
import qrcode from 'qrcode-generator';

export const LINK_PRESETS = [
  { id: 'google', label: 'Google Maps', template: 'https://www.google.com/maps/search/?api=1&query={latitude},{longitude}' },
  { id: 'google-directions', label: 'Google Maps directions', template: 'https://www.google.com/maps/dir/?api=1&destination={latitude},{longitude}' },
  { id: 'apple', label: 'Apple Maps', template: 'https://maps.apple.com/?ll={latitude},{longitude}&q={name}' },
  { id: 'osm', label: 'OpenStreetMap', template: 'https://www.openstreetmap.org/?mlat={latitude}&mlon={longitude}#map=18/{latitude}/{longitude}' },
  { id: 'waze', label: 'Waze', template: 'https://waze.com/ul?ll={latitude},{longitude}&navigate=yes' },
  { id: 'geo', label: 'Device map app (geo:)', template: 'geo:{latitude},{longitude}?q={latitude},{longitude}({name})' },
];

export const DEFAULT_LINK_TEMPLATE = LINK_PRESETS[0].template;

/** Where printed index QR codes point when the generator runs somewhere a phone cannot reach. */
export const PUBLIC_SITE_URL = 'https://ajturner.github.io/pocketmaps/';

/**
 * Base URL for links printed in a booklet: the site serving the generator, unless
 * that is a local dev server, in which case the public site.
 */
export function siteBaseUrl(loc = globalThis.location) {
  const local = !loc || !/^https?:$/.test(loc.protocol) || /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/.test(loc.hostname);
  if (local) return PUBLIC_SITE_URL;
  return loc.origin + loc.pathname.replace(/[^/]*$/, '');
}

/**
 * Query string that URLSearchParams reads back identically, but leaves characters
 * that are legal in a query (/ : , = ' { } @) unescaped. Printed QR codes stay
 * smaller, so their modules stay large enough to scan.
 */
export function compactQuery(query) {
  const enc = (v) => encodeURIComponent(v).replace(/%20/g, '+')
    .replace(/%(2F|3A|2C|3D|7B|7D|40)/gi, (m) => decodeURIComponent(m));
  return [...new URLSearchParams(query)].map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
}

/** Link to the online map of a booklet. `query` holds the booklet's parameters. */
export function viewerUrl(query, base = siteBaseUrl()) {
  const qs = compactQuery(query);
  return `${base}view.html${qs ? `?${qs}` : ''}`;
}

/** Placeholders always available, shown as chips in the editor. */
export const BUILTIN_PLACEHOLDERS = ['latitude', 'longitude', 'name'];

export function presetFor(template) {
  return LINK_PRESETS.find((p) => p.template === template) || null;
}

/**
 * @param {string} template
 * @param {{lat:number, lon:number, name?:string, properties?:object}} place
 * @returns {string} the filled URL, or '' when the template is blank
 */
export function fillLinkTemplate(template, place) {
  if (!template || !template.trim()) return '';
  const props = place.properties || {};
  const lower = new Map(Object.keys(props).map((k) => [k.toLowerCase(), k]));
  return template.trim().replace(/\{([^{}]+)\}/g, (match, rawKey) => {
    const key = rawKey.trim().toLowerCase();
    if (key === 'latitude' || key === 'lat') return place.lat.toFixed(6);
    if (key === 'longitude' || key === 'lon' || key === 'lng') return place.lon.toFixed(6);
    if (key === 'name') return encodeURIComponent(place.name ?? '');
    const real = lower.get(key);
    if (real === undefined) return match; // leave unknown placeholders visible so mistakes are noticed
    const v = props[real];
    return v == null ? '' : encodeURIComponent(String(v));
  });
}

/** Placeholders in a template that neither the builtins nor the fields can fill. */
export function unknownPlaceholders(template, fields = []) {
  const known = new Set([...BUILTIN_PLACEHOLDERS, 'lat', 'lon', 'lng', ...fields.map((f) => f.name.toLowerCase())]);
  return [...(template || '').matchAll(/\{([^{}]+)\}/g)].map((m) => m[1].trim()).filter((k) => !known.has(k.toLowerCase()));
}

/**
 * QR code as a scalable SVG string. Medium error correction keeps a short link
 * readable at about 0.6 in. on plain paper; long links use 'L' so the modules stay larger.
 */
export function qrSvg(text, level = 'M') {
  const qr = qrcode(0, level);
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 1, margin: 0, scalable: true });
}
