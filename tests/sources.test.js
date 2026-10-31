import { describe, it, expect } from 'vitest';
import { isFeatureServiceUrl, parseFeatureServiceUrl } from '../src/sources/featureService.js';
import { normalizeGeoJson } from '../src/sources/geojson.js';
import { detectSourceType } from '../src/sources/index.js';

describe('feature service urls', () => {
  const base = 'https://services.arcgis.com/abc/arcgis/rest/services/Trees/FeatureServer/0';
  it('recognises layer, query and MapServer urls', () => {
    expect(isFeatureServiceUrl(base)).toBe(true);
    expect(isFeatureServiceUrl(base + '/query?where=1%3D1&f=geojson')).toBe(true);
    expect(isFeatureServiceUrl(base.replace('FeatureServer', 'MapServer'))).toBe(true);
    expect(isFeatureServiceUrl('https://example.com/data.geojson')).toBe(false);
    expect(isFeatureServiceUrl('https://services.arcgis.com/abc/arcgis/rest/services/Trees/FeatureServer')).toBe(false);
    expect(detectSourceType('https://example.com/x.json')).toBe('geojson');
  });
  it('splits the layer url from forwarded query params and drops f', () => {
    const { layerUrl, params } = parseFeatureServiceUrl(base + "/query?where=STATUS%3D'Open'&geometry=1,2,3,4&f=geojson");
    expect(layerUrl).toBe(base);
    expect(params).toEqual({ where: "STATUS='Open'", geometry: '1,2,3,4' });
  });
});

describe('normalizeGeoJson', () => {
  it('accepts collections, features and geometries', () => {
    expect(normalizeGeoJson({ type: 'FeatureCollection', features: [1, 2] })).toEqual([1, 2]);
    expect(normalizeGeoJson({ type: 'Feature', geometry: null, properties: {} })).toHaveLength(1);
    expect(normalizeGeoJson({ type: 'Point', coordinates: [0, 0] })[0].geometry.type).toBe('Point');
    expect(() => normalizeGeoJson({ type: 'Nope' })).toThrow();
  });
});
