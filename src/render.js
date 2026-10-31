/**
 * DOM rendering: logical pages, imposed sheets, and a flat proof view.
 * Map images start as placeholders carrying a `data-map-key`; hydrateMaps()
 * fills them in once the provider has rendered each spec.
 */
import { sheetGrid, mapKey } from './booklet.js';

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('data-')) node.setAttribute(k, v);
    else node[k] = v;
  }
  append(node, ...children);
  return node;
};
/** DOM append that skips null/undefined so optional children can be written inline. */
const append = (node, ...children) => { for (const c of children.flat()) if (c != null) node.append(c); return node; };

function mapImg(spec, specs, cls = '') {
  const key = mapKey(spec);
  specs.set(key, spec);
  return el('img', { class: `map ${cls}`.trim(), alt: '', 'data-map-key': key, width: spec.width, height: spec.height });
}

const fmtDate = (d) => d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

/** @param {object} page @param {{specs: Map}} ctx */
export function renderPage(page, ctx) {
  const node = el('article', { class: `page page-${page.type}`, 'data-number': page.number, 'data-type': page.type });
  switch (page.type) {
    case 'title':
      append(node,
        el('div', { class: 'title-block' },
          el('div', { class: 'eyebrow', text: 'PocketMap' }),
          el('h1', { text: page.title }),
          page.subtitle ? el('p', { class: 'subtitle', text: page.subtitle }) : null,
        ),
        page.map ? mapImg(page.map, ctx.specs, 'cover') : null,
        el('div', { class: 'meta' },
          el('div', { text: `${page.count} ${page.count === 1 ? 'place' : 'places'}` }),
          el('div', { text: fmtDate(page.date) }),
        ),
        page.attribution ? el('div', { class: 'attribution', text: page.attribution }) : null,
      );
      break;
    case 'place':
      append(node,
        mapImg(page.map, ctx.specs, 'street'),
        el('div', { class: 'body' },
          el('h2', { text: page.place.name }),
          page.place.description ? el('p', { text: page.place.description }) : null,
        ),
      );
      break;
    case 'overview':
      append(node,
        mapImg(page.maps.city, ctx.specs, 'city'),
        el('div', { class: 'caption', text: page.place.name }),
        mapImg(page.maps.region, ctx.specs, 'region'),
      );
      break;
    case 'notes':
      append(node, el('h2', { text: 'Notes' }), el('div', { class: 'ruled' }));
      break;
    case 'index':
      append(node,
        page.first ? el('h2', { text: 'Index' }) : null,
        page.map ? mapImg(page.map, ctx.specs, 'extent') : null,
        el('ol', { class: 'entries' }, page.entries.map((e) =>
          el('li', {},
            el('span', { class: 'name', text: e.name }),
            el('span', { class: 'leader' }),
            el('span', { class: 'pg', text: String(e.page) }),
          ))),
        page.attribution ? el('div', { class: 'attribution', text: page.attribution }) : null,
      );
      break;
  }
  if (page.type !== 'title') append(node, el('div', { class: 'pagenum', text: String(page.number) }));
  return node;
}

function foldOverlay() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'folds');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  const line = (x1, y1, x2, y2, cls) => {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('class', cls);
    svg.append(l);
  };
  line(0, 25, 100, 25, 'fold'); line(0, 50, 100, 50, 'fold'); line(0, 75, 100, 75, 'fold');
  line(50, 0, 50, 25, 'fold'); line(50, 75, 50, 100, 'fold');
  line(50, 25, 50, 75, 'cut');
  return svg;
}

/**
 * @param {{pages:Array, sheets:number}} booklet
 * @param {{specs:Map, folds?:boolean}} ctx
 */
export function renderSheets(booklet, ctx) {
  const byNumber = new Map(booklet.pages.map((p) => [p.number, p]));
  const frag = document.createDocumentFragment();
  for (let s = 0; s < booklet.sheets; s++) {
    const sheet = el('section', { class: 'sheet', 'data-sheet': s + 1 });
    for (const row of sheetGrid(s, booklet.sheets)) {
      for (const slot of row) {
        const cell = el('div', { class: `cell ${slot.rotation > 0 ? 'left' : 'right'}`, 'data-cell': slot.cell });
        const page = byNumber.get(slot.page);
        cell.append(page ? renderPage(page, ctx) : el('article', { class: 'page page-blank' }));
        sheet.append(cell);
      }
    }
    if (ctx.folds !== false) sheet.append(foldOverlay());
    frag.append(sheet);
  }
  return frag;
}

export function renderProof(booklet, ctx) {
  const frag = document.createDocumentFragment();
  for (const page of booklet.pages) frag.append(renderPage(page, ctx));
  return frag;
}

/**
 * Render every map referenced under `root` through the renderer.
 * @param {ParentNode} root
 * @param {Map} specs
 * @param {import('./maps/renderer.js').MapImageRenderer} renderer
 * @param {(done:number, total:number)=>void} [onProgress]
 */
export async function hydrateMaps(root, specs, renderer, onProgress = () => {}) {
  const imgs = [...root.querySelectorAll('img[data-map-key]')];
  const keys = [...new Set(imgs.map((i) => i.dataset.mapKey))];
  let done = 0;
  const errors = [];
  onProgress(0, keys.length);
  for (const key of keys) {
    const targets = imgs.filter((i) => i.dataset.mapKey === key);
    try {
      const url = await renderer.image(specs.get(key));
      for (const img of targets) img.src = url;
    } catch (err) {
      errors.push(err);
      for (const img of targets) img.classList.add('failed');
    }
    onProgress(++done, keys.length);
  }
  return errors;
}
