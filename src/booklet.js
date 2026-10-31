/**
 * Booklet model: turns a list of places into logical pages, and logical pages
 * into PocketMod sheets.
 *
 * Terminology
 * - page:     one logical booklet page (1-based page numbers)
 * - sheet:    one physical piece of paper, holding 8 pages in a 2 x 4 grid
 * - cell:     one of the 8 grid positions on a sheet, lettered a-h
 * - position: a page's slot on its sheet, 1-8, in reading order
 *
 * Geometry is for a portrait sheet. Each cell holds a page rotated 90 degrees
 * so that the page top points at the sheet's vertical centre line. Left-column
 * pages rotate clockwise (+90), right-column pages counter-clockwise (-90).
 * Rotating the finished sheet to landscape gives the classic PocketMod layout:
 *
 *     5 4 3 2   (upside down)
 *     6 7 8 1
 */

export const PAGES_PER_SHEET = 8;

/** Sheet position (1-8) to cell letter. Same table as mmPDF / pocketmod.rb. */
export const POSITION_TO_CELL = { 1: 'a', 2: 'b', 3: 'd', 4: 'f', 5: 'h', 6: 'g', 7: 'e', 8: 'c' };

/** Cell letter to grid location. Row 0 is the top of the portrait sheet. */
export const CELLS = {
  a: { row: 3, col: 0 }, b: { row: 3, col: 1 },
  c: { row: 2, col: 0 }, d: { row: 2, col: 1 },
  e: { row: 1, col: 0 }, f: { row: 1, col: 1 },
  g: { row: 0, col: 0 }, h: { row: 0, col: 1 },
};

/** Rotation in degrees (CSS, clockwise positive) for a column. */
export function rotationForColumn(col) {
  return col === 0 ? 90 : -90;
}

/**
 * Which page numbers land on which positions of one sheet.
 * Sheets nest like a saddle-stitched booklet: sheet 1 carries the first four
 * and last four pages, sheet 2 the next four from each end, and so on.
 * @param {number} sheetIndex 0-based
 * @param {number} sheetCount total sheets
 * @returns {Array<{position:number, cell:string, row:number, col:number, rotation:number, page:number}>}
 */
export function sheetLayout(sheetIndex, sheetCount) {
  const first = 4 * sheetIndex + 1;
  const last = PAGES_PER_SHEET * sheetCount - 4 * sheetIndex;
  const slots = [];
  for (let position = 1; position <= PAGES_PER_SHEET; position++) {
    const page = position <= 4 ? first + (position - 1) : last - 3 + (position - 5);
    const cell = POSITION_TO_CELL[position];
    const { row, col } = CELLS[cell];
    slots.push({ position, cell, row, col, rotation: rotationForColumn(col), page });
  }
  return slots;
}

/**
 * The same information arranged as a 4 x 2 grid for rendering.
 * @returns {Array<Array<{page:number, rotation:number, cell:string}>>} rows[4][2]
 */
export function sheetGrid(sheetIndex, sheetCount) {
  const grid = Array.from({ length: 4 }, () => [null, null]);
  for (const slot of sheetLayout(sheetIndex, sheetCount)) {
    grid[slot.row][slot.col] = { page: slot.page, rotation: slot.rotation, cell: slot.cell };
  }
  return grid;
}

/** Number of index pages needed for n entries. */
export function indexPageCount(n, { firstPage = 14, perPage = 24 } = {}) {
  if (n <= firstPage) return 1;
  return 1 + Math.ceil((n - firstPage) / perPage);
}

/** Pages one place consumes. */
function pagesPerPlace(overview) {
  return overview ? 2 : 1;
}

/**
 * Most places that fit on a given number of sheets, leaving room for the
 * title page and the index.
 */
export function placeCapacity(sheets, { overview = false, index = {} } = {}) {
  const budget = PAGES_PER_SHEET * sheets - 1; // title page
  const k = pagesPerPlace(overview);
  for (let n = Math.floor(budget / k); n >= 0; n--) {
    if (n * k + indexPageCount(n, index) <= budget) return n;
  }
  return 0;
}

/** Smallest sheet count that holds n places. */
export function sheetsNeeded(n, opts = {}) {
  let sheets = 1;
  while (placeCapacity(sheets, opts) < n) sheets++;
  return sheets;
}

/**
 * Build the full list of logical pages.
 *
 * @param {Array<{name:string, description:string, lon:number, lat:number}>} places
 * @param {object} options
 * @param {string}  options.title
 * @param {string}  [options.subtitle]
 * @param {boolean} [options.overview=false]   add a city/region overview page before each place page
 * @param {number|'auto'} [options.sheets='auto']
 * @param {number}  [options.maxSheets=8]
 * @param {boolean} [options.coverMap=true]
 * @param {{firstPage:number, perPage:number}} [options.index]
 * @returns {{pages: Array<object>, places: Array<object>, sheets: number, dropped: number}}
 */
export function buildBooklet(places, options = {}) {
  const {
    title = 'PocketMap',
    subtitle = '',
    overview = false,
    coverMap = true,
    maxSheets = 8,
    index: indexOpts = {},
    date = new Date(),
    attribution = '',
  } = options;

  let sheets = options.sheets === undefined || options.sheets === 'auto'
    ? Math.min(maxSheets, sheetsNeeded(places.length, { overview, index: indexOpts }))
    : Number(options.sheets);
  if (!Number.isFinite(sheets) || sheets < 1) sheets = 1;

  const capacity = placeCapacity(sheets, { overview, index: indexOpts });
  const kept = places.slice(0, capacity).map((p, i) => ({ ...p, ordinal: i + 1 }));
  const dropped = places.length - kept.length;

  const totalPages = PAGES_PER_SHEET * sheets;
  const pages = [];
  const push = (page) => { pages.push({ ...page, number: pages.length + 1 }); return pages.length; };

  // 1. Title page
  push({
    type: 'title',
    title,
    subtitle,
    date,
    count: kept.length,
    attribution,
    map: coverMap && kept.length ? extentMapSpec(kept, { labels: false }) : null,
  });

  // 2. Place pages. In overview mode the overview page sits on an even page so
  //    it faces the place page across the spread.
  for (const place of kept) {
    if (overview) {
      if (pages.length % 2 !== 1) push({ type: 'notes' });
      push({ type: 'overview', place, maps: { city: pointMapSpec(place, 'city'), region: pointMapSpec(place, 'region') } });
    }
    place.page = push({ type: 'place', place, map: pointMapSpec(place, 'street') });
  }

  // 3. Filler pages, then the index pinned to the last pages of the last sheet.
  const indexPages = indexPageCount(kept.length, indexOpts);
  const indexStart = totalPages - indexPages + 1;
  while (pages.length < indexStart - 1) push({ type: 'notes' });

  const { firstPage = 14, perPage = 24 } = indexOpts;
  const entries = kept.map((p) => ({ name: p.name, page: p.page, lon: p.lon, lat: p.lat }));
  let cursor = 0;
  for (let i = 0; i < indexPages; i++) {
    const take = i === 0 ? firstPage : perPage;
    push({
      type: 'index',
      first: i === 0,
      entries: entries.slice(cursor, cursor + take),
      map: i === 0 && kept.length ? extentMapSpec(kept, { labels: true }) : null,
      attribution: i === indexPages - 1 ? attribution : '',
    });
    cursor += take;
  }

  return { pages, places: kept, sheets, dropped, indexPages };
}

/** Map request for a single place at a named zoom level. Sizes are CSS px at 96 dpi. */
export function pointMapSpec(place, level) {
  const sizes = {
    street: { width: 264, height: 250 },
    city: { width: 264, height: 240 },
    region: { width: 264, height: 125 },
  };
  return {
    kind: 'center',
    level,
    center: [place.lon, place.lat],
    markers: [{ lon: place.lon, lat: place.lat }],
    ...sizes[level],
  };
}

/** Map request covering every place, optionally labelled with page numbers. */
export function extentMapSpec(places, { labels = true, width = 264, height = 135 } = {}) {
  return {
    kind: 'bounds',
    level: 'extent',
    bounds: placesBounds(places),
    markers: places.map((p) => ({ lon: p.lon, lat: p.lat, label: labels ? String(p.page ?? p.ordinal) : undefined })),
    width,
    height,
  };
}

export function placesBounds(places) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const p of places) {
    if (p.lon < minLon) minLon = p.lon;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lon > maxLon) maxLon = p.lon;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  // Degenerate (single point or identical points): give the map something to fit.
  if (maxLon - minLon < 0.002) { minLon -= 0.001; maxLon += 0.001; }
  if (maxLat - minLat < 0.002) { minLat -= 0.001; maxLat += 0.001; }
  return [[minLon, minLat], [maxLon, maxLat]];
}

/** Stable string key for caching rendered map images. */
export function mapKey(spec) {
  return JSON.stringify(spec);
}
