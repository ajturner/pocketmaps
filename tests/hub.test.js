import { describe, it, expect } from 'vitest';
import { isHubUrl, parseHubUrl, decodeHubFilters, filtersToWhere } from '../src/sources/hub.js';
import { detectSourceType } from '../src/sources/index.js';

// Real URL captured from hub.arcgis.com after selecting District = PARKS, 7A and enabling Address.
const REAL = 'https://hub.arcgis.com/datasets/CoRedlands::street-trees/explore?filters=eyJESVNUUklDVCI6WyJQQVJLUyIsIjdBIl0sIkFERFJFU1MiOlswLDMyMDgwXX0%3D&location=34.049661%2C-117.173648%2C12';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');

describe('isHubUrl', () => {
  it('recognises dataset pages on any Hub site', () => {
    expect(isHubUrl(REAL)).toBe(true);
    expect(isHubUrl('https://opendata.dc.gov/datasets/1096a3383ff74d919f43879d3f071989_0/about')).toBe(true);
    expect(isHubUrl('https://city.hub.arcgis.com/maps/abc::parks')).toBe(true);
  });
  it('leaves download links and REST endpoints to the other sources', () => {
    expect(isHubUrl('https://opendata.dc.gov/datasets/1096a3383ff74d919f43879d3f071989_0.geojson')).toBe(false);
    expect(isHubUrl('https://services.arcgis.com/x/arcgis/rest/services/datasets/FeatureServer/0')).toBe(false);
    expect(detectSourceType(REAL)).toBe('hub');
    expect(detectSourceType('https://opendata.dc.gov/datasets/1096a3383ff74d919f43879d3f071989_0.geojson')).toBe('geojson');
  });
});

describe('parseHubUrl', () => {
  it('parses slugs and filters', () => {
    const p = parseHubUrl(REAL);
    expect(p.slug).toBe('CoRedlands::street-trees');
    expect(p.itemId).toBeNull();
    expect(p.filters).toEqual({ DISTRICT: ['PARKS', '7A'], ADDRESS: [0, 32080] });
  });
  it('parses item ids with layer suffix or layer param', () => {
    expect(parseHubUrl('https://x.org/datasets/1096A3383FF74D919F43879D3F071989_3/explore')).toMatchObject({ itemId: '1096a3383ff74d919f43879d3f071989', layer: 3 });
    expect(parseHubUrl('https://x.org/datasets/1096a3383ff74d919f43879d3f071989/about?layer=2')).toMatchObject({ layer: 2 });
    expect(parseHubUrl('https://x.org/datasets/1096a3383ff74d919f43879d3f071989')).toMatchObject({ layer: null });
  });
});

describe('decodeHubFilters', () => {
  it('handles unicode, url-safe base64, missing padding and junk', () => {
    expect(decodeHubFilters(b64({ NAME: ['Café'] }))).toEqual({ NAME: ['Café'] });
    expect(decodeHubFilters(b64({ A: ['?>'] }).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))).toEqual({ A: ['?>'] });
    expect(decodeHubFilters('not base64!!')).toEqual({});
    expect(decodeHubFilters(null)).toEqual({});
  });
});

describe('filtersToWhere', () => {
  const fields = [
    { name: 'DISTRICT', type: 'esriFieldTypeString' },
    { name: 'ADDRESS', type: 'esriFieldTypeInteger' },
    { name: 'Height', type: 'esriFieldTypeDouble' },
    { name: 'Planted', type: 'esriFieldTypeDate' },
    { name: 'Code', type: 'esriFieldTypeSmallInteger' },
  ];
  it('builds IN lists and numeric ranges from the real Hub URL', () => {
    expect(filtersToWhere(parseHubUrl(REAL).filters, fields).where).toBe("DISTRICT IN ('PARKS', '7A') AND ADDRESS BETWEEN 0 AND 32080");
  });
  it('matches field names case-insensitively and escapes quotes', () => {
    expect(filtersToWhere({ district: ["O'Brien"] }, fields).where).toBe("DISTRICT = 'O''Brien'");
  });
  it('converts date ranges to timestamps', () => {
    const t0 = Date.UTC(2020, 0, 1), t1 = Date.UTC(2021, 5, 30, 12, 0, 5);
    expect(filtersToWhere({ Planted: [t0, t1] }, fields).where).toBe("Planted BETWEEN timestamp '2020-01-01 00:00:00' AND timestamp '2021-06-30 12:00:05'");
  });
  it('treats a coded numeric list longer than two as IN, and handles nulls', () => {
    expect(filtersToWhere({ Code: [1, 2, 3] }, fields).where).toBe('Code IN (1, 2, 3)');
    expect(filtersToWhere({ DISTRICT: ['A', null] }, fields).where).toBe("(DISTRICT = 'A' OR DISTRICT IS NULL)");
    expect(filtersToWhere({ Height: [70, null] }, fields).where).toBe('Height >= 70');
  });
  it('skips fields the layer does not have', () => {
    expect(filtersToWhere({ NOPE: ['x'], DISTRICT: ['A'] }, fields)).toEqual({ where: "DISTRICT = 'A'", skipped: ['NOPE'] });
  });
});
