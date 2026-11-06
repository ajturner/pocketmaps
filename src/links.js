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
 * QR code as a scalable SVG string. Medium error correction keeps it readable
 * at about 0.6 in. printed on plain paper.
 */
export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 1, margin: 0, scalable: true });
}
