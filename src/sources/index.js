/**
 * Source façade. Everything downstream only sees the shape returned here:
 *   { type, url, name, description, displayField, fields, geometryType, attribution, where, features }
 */
import { isFeatureServiceUrl, loadFeatureService } from './featureService.js';
import { loadGeoJsonUrl, loadGeoJsonFile } from './geojson.js';
import { isHubUrl, parseHubUrl, resolveHubDataset } from './hub.js';

export { isFeatureServiceUrl, isHubUrl };

export function detectSourceType(url) {
  if (!url) return null;
  if (isFeatureServiceUrl(url)) return 'feature-service';
  if (isHubUrl(url)) return 'hub';
  return 'geojson';
}

/**
 * @param {{url?:string, file?:File, where?:string, token?:string, maxFeatures?:number, onStatus?:(s:string)=>void}} req
 */
export async function loadSource(req) {
  if (req.file) return loadGeoJsonFile(req.file, req);
  if (!req.url) throw new Error('Provide a URL or a file');
  const url = req.url.trim();
  if (isFeatureServiceUrl(url)) return loadFeatureService(url, req);
  if (isHubUrl(url)) return loadHubDataset(url, req);
  return loadGeoJsonUrl(url, req);
}

/**
 * Hub dataset page: resolve to its layer, translate the page's filters into a
 * where clause (needs the layer's field types), then query like any layer.
 * An explicit req.where wins over the page's filters.
 */
async function loadHubDataset(url, req) {
  req.onStatus?.('Resolving Hub dataset…');
  const parsed = parseHubUrl(url);
  const { layerUrl, name } = await resolveHubDataset(parsed);
  const source = await loadFeatureService(layerUrl, {
    ...req,
    where: req.where || parsed.where || undefined,
    hubFilters: parsed.filters,
  });
  return { ...source, type: 'hub', hubUrl: url, name: name || source.name };
}
