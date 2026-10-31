import { describe, it, expect } from 'vitest';
import {
  sheetLayout, sheetGrid, placeCapacity, sheetsNeeded, indexPageCount, buildBooklet, placesBounds,
} from '../src/booklet.js';

const place = (i) => ({ name: `Place ${i}`, description: `Desc ${i}`, lon: -77 + i * 0.01, lat: 38 + i * 0.01 });
const places = (n) => Array.from({ length: n }, (_, i) => place(i + 1));

describe('sheetLayout', () => {
  it('maps a single sheet to the classic PocketMod order', () => {
    const grid = sheetGrid(0, 1).map((row) => row.map((c) => c.page));
    // Portrait sheet, top row first. Rotated to landscape this reads 5 4 3 2 / 6 7 8 1.
    expect(grid).toEqual([[6, 5], [7, 4], [8, 3], [1, 2]]);
  });

  it('rotates left column clockwise and right column counter-clockwise', () => {
    const grid = sheetGrid(0, 1);
    for (const row of grid) {
      expect(row[0].rotation).toBe(90);
      expect(row[1].rotation).toBe(-90);
    }
  });

  it('nests multiple sheets like a saddle-stitched booklet', () => {
    const pagesOn = (s, n) => sheetLayout(s, n).map((x) => x.page);
    expect(pagesOn(0, 2)).toEqual([1, 2, 3, 4, 13, 14, 15, 16]);
    expect(pagesOn(1, 2)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(pagesOn(0, 3)).toEqual([1, 2, 3, 4, 21, 22, 23, 24]);
    expect(pagesOn(2, 3)).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it('covers every page exactly once across all sheets', () => {
    for (const n of [1, 2, 3, 4]) {
      const all = [];
      for (let s = 0; s < n; s++) all.push(...sheetLayout(s, n).map((x) => x.page));
      expect([...all].sort((a, b) => a - b)).toEqual(Array.from({ length: 8 * n }, (_, i) => i + 1));
    }
  });
});

describe('capacity', () => {
  it('matches the legacy PAGE_COUNTS table for simple and overview modes', () => {
    // Legacy: simple 6/14/22/30, overview 3/7/11/15 for 1-4 sheets. The legacy
    // index always took one page; ours grows with entry count.
    expect(placeCapacity(1)).toBe(6);
    expect(placeCapacity(1, { overview: true })).toBe(3);
    expect(placeCapacity(2)).toBe(14);
    expect(placeCapacity(2, { overview: true })).toBe(7);
    expect(placeCapacity(3, { overview: true })).toBe(11);
  });

  it('accounts for index pages growing with entries', () => {
    expect(indexPageCount(14)).toBe(1);
    expect(indexPageCount(15)).toBe(2);
    expect(indexPageCount(38)).toBe(2);
    expect(indexPageCount(39)).toBe(3);
    // 3 sheets = 24 pages: 1 title + 21 places + 2 index = 24
    expect(placeCapacity(3)).toBe(21);
  });

  it('picks the smallest sheet count that fits', () => {
    expect(sheetsNeeded(6)).toBe(1);
    expect(sheetsNeeded(7)).toBe(2);
    expect(sheetsNeeded(3, { overview: true })).toBe(1);
    expect(sheetsNeeded(4, { overview: true })).toBe(2);
  });
});

describe('buildBooklet', () => {
  it('fills one sheet with title, places and index', () => {
    const b = buildBooklet(places(6), { title: 'T' });
    expect(b.sheets).toBe(1);
    expect(b.pages.map((p) => p.type)).toEqual(['title', 'place', 'place', 'place', 'place', 'place', 'place', 'index']);
    expect(b.pages.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(b.places.map((p) => p.page)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('pads with notes pages and pins the index to the back', () => {
    const b = buildBooklet(places(3), { title: 'T' });
    expect(b.sheets).toBe(1);
    expect(b.pages.map((p) => p.type)).toEqual(['title', 'place', 'place', 'place', 'notes', 'notes', 'notes', 'index']);
  });

  it('puts overview pages on even pages facing their place page', () => {
    const b = buildBooklet(places(3), { title: 'T', overview: true });
    const types = b.pages.map((p) => p.type);
    expect(types).toEqual(['title', 'overview', 'place', 'overview', 'place', 'overview', 'place', 'index']);
    for (const p of b.pages) if (p.type === 'overview') expect(p.number % 2).toBe(0);
  });

  it('drops places that do not fit a fixed sheet count and reports it', () => {
    const b = buildBooklet(places(20), { title: 'T', sheets: 1 });
    expect(b.places.length).toBe(6);
    expect(b.dropped).toBe(14);
  });

  it('splits a long index across pages with the map on the first', () => {
    const b = buildBooklet(places(21), { title: 'T' });
    expect(b.sheets).toBe(3);
    const idx = b.pages.filter((p) => p.type === 'index');
    expect(idx.length).toBe(2);
    expect(idx[0].entries.length).toBe(14);
    expect(idx[1].entries.length).toBe(7);
    expect(idx[0].map).toBeTruthy();
    expect(idx[1].map).toBeNull();
    expect(idx[0].map.markers[0].label).toBe('2');
    expect(b.pages.at(-1).type).toBe('index');
    expect(b.pages.length).toBe(24);
  });

  it('caps sheets at maxSheets in auto mode', () => {
    const b = buildBooklet(places(200), { title: 'T', maxSheets: 2 });
    expect(b.sheets).toBe(2);
    expect(b.places.length).toBe(14);
  });
});

describe('placesBounds', () => {
  it('expands a degenerate bounds box', () => {
    const [[a, b], [c, d]] = placesBounds([{ lon: 1, lat: 2 }]);
    expect(c - a).toBeGreaterThan(0);
    expect(d - b).toBeGreaterThan(0);
  });
});
