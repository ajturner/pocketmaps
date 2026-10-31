/**
 * Source façade. Everything downstream only sees the shape returned here:
 *   { type, url, name, description, displayField, fields, geometryType, attribution, where, features }
 */
import { isFeatureServiceUrl, loadFeatureService } from './featureService.js';
import { loadGeoJsonUrl, loadGeoJsonFile } from './geojson.js';

export { isFeatureServiceUrl };

export function detectSourceType(url) {
  if (!url) return null;
  return isFeatureServiceUrl(url) ? 'feature-service' : 'geojson';
}

/**
 * @param {{url?:string, file?:File, where?:string, token?:string, maxFeatures?:number, onStatus?:(s:string)=>void}} req
 */
export async function loadSource(req) {
  if (req.file) return loadGeoJsonFile(req.file, req);
  if (!req.url) throw new Error('Provide a URL or a file');
  const url = req.url.trim();
  if (isFeatureServiceUrl(url)) return loadFeatureService(url, req);
  return loadGeoJsonUrl(url, req);
}
