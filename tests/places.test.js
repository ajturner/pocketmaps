import { describe, it, expect } from 'vitest';
import { inferFields, cleanText, truncate, fillTemplate, geometryPoint, featuresToPlaces, fieldsFromFeatures } from '../src/places.js';

describe('inferFields', () => {
  it('prefers displayField, then name-like and description-like fields', () => {
    const fields = [{ name: 'OBJECTID', type: 'esriFieldTypeOID' }, { name: 'SITE_NAME', type: 'esriFieldTypeString' }, { name: 'ADDRESS', type: 'esriFieldTypeString' }];
    expect(inferFields(fields)).toEqual({ nameField: 'SITE_NAME', descriptionField: 'ADDRESS' });
    expect(inferFields(fields, { displayField: 'ADDRESS' }).nameField).toBe('ADDRESS');
  });
  it('falls back to the first string field', () => {
    expect(inferFields([{ name: 'foo', type: 'string' }, { name: 'bar', type: 'string' }])).toEqual({ nameField: 'foo', descriptionField: 'bar' });
  });
});

describe('cleanText', () => {
  it('strips html, decodes entities and normalises whitespace', () => {
    expect(cleanText('<b>Caf&eacute;</b> &amp; Bar<br>Open &#x2014; late  <i>daily</i>')).toBe('Café & Bar\nOpen — late daily');
    expect(cleanText(null)).toBe('');
    expect(cleanText(42)).toBe('42');
  });
});

describe('truncate', () => {
  it('cuts on a word boundary with an ellipsis', () => {
    expect(truncate('one two three four five', 12)).toBe('one two…');
    expect(truncate('short', 12)).toBe('short');
  });
});

describe('fillTemplate', () => {
  it('fills fields case-insensitively and tidies empty joins', () => {
    expect(fillTemplate('{Address}, {CITY}, {missing}', { ADDRESS: '1 Main St', city: 'Oakland' })).toBe('1 Main St, Oakland');
  });
});

describe('geometryPoint', () => {
  it('handles points, multipoints and bbox centres', () => {
    expect(geometryPoint({ type: 'Point', coordinates: [1, 2] })).toEqual([1, 2]);
    expect(geometryPoint({ type: 'MultiPoint', coordinates: [[3, 4], [5, 6]] })).toEqual([3, 4]);
    expect(geometryPoint({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] })).toEqual([1, 1]);
    expect(geometryPoint(null)).toBeNull();
  });
});

describe('featuresToPlaces', () => {
  const features = [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-122, 37] }, properties: { NAME: 'A', ADDR: '1 St' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-122, 37] }, properties: { NAME: 'A', ADDR: '1 St' } },
    { type: 'Feature', geometry: null, properties: { NAME: 'B' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-121, 36] }, properties: { NAME: '', ADDR: '2 St' } },
  ];
  it('dedupes, skips missing geometry and names unnamed places', () => {
    const { places, skipped } = featuresToPlaces(features, { nameField: 'NAME', descriptionField: 'ADDR' });
    expect(places.map((p) => p.name)).toEqual(['A', 'Place 4']);
    expect(places[0].description).toBe('1 St');
    expect(skipped).toEqual({ noGeometry: 1, duplicate: 1 });
  });
  it('keeps same-named places at different locations', () => {
    const twins = [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-122, 37] }, properties: { NAME: 'Oak' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-122.001, 37] }, properties: { NAME: 'Oak' } },
    ];
    expect(featuresToPlaces(twins, { nameField: 'NAME' }).places).toHaveLength(2);
  });
  it('uses a template when given', () => {
    const { places } = featuresToPlaces(features.slice(0, 1), { nameField: 'NAME', descriptionTemplate: '{addr} ({name})' });
    expect(places[0].description).toBe('1 St (A)');
  });
  it('infers fields from properties', () => {
    expect(fieldsFromFeatures(features).map((f) => f.name)).toEqual(['NAME', 'ADDR']);
  });
});
