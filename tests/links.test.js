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

describe('siteBaseUrl and viewerUrl', async () => {
  const { siteBaseUrl, viewerUrl, PUBLIC_SITE_URL } = await import('../src/links.js');
  const loc = (href) => { const u = new URL(href); return { protocol: u.protocol, hostname: u.hostname, origin: u.origin, pathname: u.pathname }; };
  it('uses the serving site, or the public site from a dev server', () => {
    expect(siteBaseUrl(loc('https://ajturner.github.io/pocketmaps/app.html?x=1'))).toBe('https://ajturner.github.io/pocketmaps/');
    expect(siteBaseUrl(loc('https://maps.example.gov/tools/pocket/app.html'))).toBe('https://maps.example.gov/tools/pocket/');
    expect(siteBaseUrl(loc('http://localhost:5173/app.html'))).toBe(PUBLIC_SITE_URL);
    expect(siteBaseUrl(loc('http://127.0.0.1:4173/app.html'))).toBe(PUBLIC_SITE_URL);
    expect(siteBaseUrl(undefined)).toBe(PUBLIC_SITE_URL);
  });
  it('builds a view.html link carrying the booklet parameters', () => {
    expect(viewerUrl({ url: 'https://x/FeatureServer/0', where: "A='b'" }, 'https://s/'))
      .toBe("https://s/view.html?url=https://x/FeatureServer/0&where=A='b'");
  });
  it('round-trips every parameter through URLSearchParams', async () => {
    const { compactQuery } = await import('../src/links.js');
    const q = { url: 'https://h/FeatureServer/0?token=a&b=c', where: "N LIKE '%A & B%' AND X+1=2", title: 'Café #1 / 2', template: '{County} County, Maine · {Status}' };
    expect(Object.fromEntries(new URLSearchParams(compactQuery(q)))).toEqual(q);
  });
});

describe('booklet index link', async () => {
  const { buildBooklet } = await import('../src/booklet.js');
  const places = Array.from({ length: 20 }, (_, i) => ({ name: `P${i}`, description: '', lon: i * 0.01, lat: 0 }));
  it('puts the link and a reserved map corner on the first index page only', () => {
    const b = buildBooklet(places, { indexLink: 'https://s/view.html?x' });
    const idx = b.pages.filter((p) => p.type === 'index');
    expect(idx.length).toBe(2);
    expect(idx[0].link).toBe('https://s/view.html?x');
    expect(idx[0].map.padding.right).toBeGreaterThan(idx[0].map.padding.left);
    expect(idx[1].link).toBe('');
    expect(buildBooklet(places).pages.find((p) => p.type === 'index').map.padding).toBeUndefined();
  });
});
