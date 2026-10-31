/**
 * GeoJSON source: a URL or a local File. Accepts a FeatureCollection, a single
 * Feature, or a bare geometry.
 */
import { fieldsFromFeatures } from '../places.js';

export function normalizeGeoJson(json) {
  if (!json || typeof json !== 'object') throw new Error('Not a GeoJSON object');
  if (json.type === 'FeatureCollection') return json.features || [];
  if (json.type === 'Feature') return [json];
  if (json.type && json.coordinates) return [{ type: 'Feature', geometry: json, properties: {} }];
  if (Array.isArray(json.features)) return json.features; // lenient
  throw new Error(`Unsupported GeoJSON type "${json.type}"`);
}

export async function loadGeoJsonUrl(url, { onStatus = () => {} } = {}) {
  onStatus('Fetching GeoJSON…');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} fetching GeoJSON`);
  const json = await res.json();
  const name = json.name || decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || 'GeoJSON').replace(/\.(geo)?json$/i, '');
  return fromJson(json, { url, name });
}

export async function loadGeoJsonFile(file, { onStatus = () => {} } = {}) {
  onStatus(`Reading ${file.name}…`);
  const json = JSON.parse(await file.text());
  return fromJson(json, { url: null, name: json.name || file.name.replace(/\.(geo)?json$/i, '') });
}

function fromJson(json, { url, name }) {
  const features = normalizeGeoJson(json);
  return {
    type: 'geojson',
    url,
    name,
    description: json.description || '',
    displayField: null,
    fields: fieldsFromFeatures(features),
    geometryType: features[0]?.geometry?.type || null,
    attribution: json.attribution || json.copyright || '',
    where: '',
    features,
  };
}
