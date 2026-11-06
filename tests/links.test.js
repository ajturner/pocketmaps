import { describe, it, expect } from 'vitest';
import { fillLinkTemplate, unknownPlaceholders, qrSvg, presetFor, LINK_PRESETS, DEFAULT_LINK_TEMPLATE } from '../src/links.js';

const place = { lat: 35.6104483150623, lon: -82.4411930023927, name: 'Café & Bar', properties: { OBJECTID: 7, Website: 'https://x.org/a b', Empty: null } };

describe('fillLinkTemplate', () => {
  it('defaults to Google Maps with 6-decimal coordinates', () => {
    expect(fillLinkTemplate(DEFAULT_LINK_TEMPLATE, place)).toBe('https://www.google.com/maps/search/?api=1&query=35.610448,-82.441193');
  });
  it('encodes names and field values, case-insensitively', () => {
    expect(fillLinkTemplate('https://e.com/?q={name}&id={objectid}&w={WEBSITE}&e={empty}', place))
      .toBe('https://e.com/?q=Caf%C3%A9%20%26%20Bar&id=7&w=https%3A%2F%2Fx.org%2Fa%20b&e=');
  });
  it('accepts lat/lon/lng aliases and leaves unknown placeholders visible', () => {
    expect(fillLinkTemplate('{lat},{lng} {nope}', place)).toBe('35.610448,-82.441193 {nope}');
  });
  it('returns empty for a blank template', () => {
    expect(fillLinkTemplate('  ', place)).toBe('');
  });
  it('fills every preset without leftovers', () => {
    for (const p of LINK_PRESETS) expect(fillLinkTemplate(p.template, place)).not.toMatch(/[{}]/);
  });
});

describe('unknownPlaceholders', () => {
  it('reports placeholders that cannot be filled', () => {
    expect(unknownPlaceholders('{latitude} {Website} {nope}', [{ name: 'Website' }])).toEqual(['nope']);
  });
});

describe('qrSvg and presets', () => {
  it('produces a scalable svg', () => {
    const svg = qrSvg('https://www.google.com/maps/search/?api=1&query=1,2');
    expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 \d+ \d+"/);
  });
  it('recognises preset templates', () => {
    expect(presetFor(DEFAULT_LINK_TEMPLATE).id).toBe('google');
    expect(presetFor('https://custom/{name}')).toBeNull();
  });
});
