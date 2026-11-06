import './site.css';
import { sheetLayout } from './booklet.js';

/*
 * Step-by-step fold diagrams, drawn as inline SVG.
 * The sheet is shown landscape (11 x 8.5), the way you hold it to fold:
 *   top row    5 4 3 2   (printed upside down)
 *   bottom row 6 7 8 1   (page 1 is the cover)
 * This matches the imposition in booklet.js once the portrait print is turned sideways.
 */

const W = 264, H = 204;            // landscape sheet in diagram units
const PW = W / 4, PH = H / 2;      // one panel
const TOP = [5, 4, 3, 2], BOTTOM = [6, 7, 8, 1];
let uid = 0;

const svg = (w, h, body, label) => {
  const id = `m${++uid}`;
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">
    <defs><marker id="${id}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M1 1 L9 5 L1 9" fill="none" stroke="#15202b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
    ${body.replaceAll('MARKER', `url(#${id})`)}</svg>`;
};
const arrow = (d) => `<path class="dg-arrow" d="${d}" marker-end="MARKER"/>`;
const line = (x1, y1, x2, y2, cls) => `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const text = (x, y, s, cls = 'dg-label') => `<text class="${cls}" x="${x}" y="${y}">${s}</text>`;

/** Landscape sheet with numbered panels and light creases. */
function sheet(x, y, { numbers = true, creases = [], scale = 1, back = false } = {}) {
  const w = W * scale, h = H * scale, pw = PW * scale, ph = PH * scale;
  let out = `<rect class="dg-sheet${back ? ' back' : ''}" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`;
  if (numbers && !back) {
    out += `<rect class="dg-cover" x="${x + 3 * pw}" y="${y + ph}" width="${pw}" height="${ph}"/>`;
    TOP.forEach((n, i) => {
      const cx = x + pw * (i + 0.5), cy = y + ph / 2;
      out += `<text class="dg-panel-num" x="${cx}" y="${cy}" transform="rotate(180 ${cx} ${cy})">${n}</text>`;
    });
    BOTTOM.forEach((n, i) => {
      out += `<text class="dg-panel-num${n === 1 ? ' cover' : ''}" x="${x + pw * (i + 0.5)}" y="${y + ph * 1.5}">${n}</text>`;
    });
  }
  for (const c of creases) {
    if (c === 'h') out += line(x, y + ph, x + w, y + ph, 'dg-crease');
    else out += line(x + pw * c, y, x + pw * c, y + h, 'dg-crease');
  }
  return out;
}

const STEPS = [
  {
    title: 'Print, then turn the sheet sideways',
    text: 'Print one side at 100% scale. Hold the sheet landscape so page 1 is upright in the bottom right corner. The top row is printed upside down, which is correct.',
    draw: () => svg(360, 230, `
      ${sheet(48, 10)}
      ${text(180, 228, 'top row upside down · page 1 is the cover', 'dg-label')}`, 'Landscape sheet with eight numbered panels'),
  },
  {
    title: 'Fold in half, short edges together',
    text: 'Bring the left edge over to the right edge, crease firmly, and unfold.',
    draw: () => svg(360, 230, `
      ${sheet(48, 18)}
      ${line(180, 12, 180, 228, 'dg-fold')}
      ${arrow('M70 30 C 110 -6, 210 -6, 290 26')}`, 'Fold the sheet in half left to right'),
  },
  {
    title: 'Fold both ends to the middle',
    text: 'Fold each short edge in to the centre crease, crease, and unfold. You now have four columns.',
    draw: () => svg(360, 230, `
      ${sheet(48, 18, { creases: [2] })}
      ${line(114, 12, 114, 228, 'dg-fold')}${line(246, 12, 246, 228, 'dg-fold')}
      ${arrow('M58 34 C 80 4, 130 4, 170 30')}
      ${arrow('M302 34 C 280 4, 230 4, 190 30')}`, 'Fold both ends to the centre crease'),
  },
  {
    title: 'Fold in half again and cut',
    text: 'Fold in half the same way as step 2. Starting at the folded edge, cut along the middle crease for one panel, stopping at the first crossing crease.',
    draw: () => {
      const x = 114, y = 18, w = W / 2;
      return svg(360, 230, `
        <rect class="dg-sheet back" x="${x}" y="${y}" width="${w}" height="${H}" rx="2"/>
        ${line(x + PW, y, x + PW, y + H, 'dg-crease')}${line(x, y + PH, x + w, y + PH, 'dg-crease')}
        <line x1="${x}" y1="${y}" x2="${x}" y2="${y + H}" stroke="#15202b" stroke-width="3"/>
        ${line(x, y + PH, x + PW, y + PH, 'dg-cut')}
        <text class="dg-scissors" x="${x + PW + 4}" y="${y + PH + 8}">✂</text>
        <text class="dg-label strong" x="${x - 10}" y="${y + H / 2 + 50}" transform="rotate(-90 ${x - 10} ${y + H / 2 + 50})">folded edge</text>
        ${text(x + PW / 2, y + PH - 8, 'cut', 'dg-label strong')}`, 'Folded sheet with a cut from the fold along the middle crease');
    },
  },
  {
    title: 'Unfold, then fold the long way',
    text: 'Open the sheet. There is now a slit across the middle two panels. Fold it in half the long way, folding the upside-down row behind so pages 6, 7, 8 and 1 face you.',
    draw: () => svg(360, 230, `
      ${sheet(48, 18, { creases: [1, 2, 3] })}
      ${line(48 + PW, 18 + PH, 48 + 3 * PW, 18 + PH, 'dg-cut')}
      ${line(40, 18 + PH, 320, 18 + PH, 'dg-fold')}
      ${arrow('M330 30 C 352 60, 352 100, 330 116')}
      ${text(180, 14, 'fold the top half behind', 'dg-label strong')}`, 'Sheet with slit, folded in half lengthwise'),
  },
  {
    title: 'Push the ends together',
    text: 'Hold the strip by its ends with the fold on top and push them toward each other. The slit opens into a diamond.',
    draw: () => {
      const x = 48, y = 92;
      const strip = `
        <path class="dg-sheet" d="M${x} ${y} H${x + PW} L${x + 2 * PW} ${y - 52} L${x + 3 * PW} ${y} H${x + W} V${y + PH} H${x} Z"/>
        <path class="dg-sheet back" d="M${x + PW} ${y} L${x + 2 * PW} ${y + 40} L${x + 3 * PW} ${y} L${x + 2 * PW} ${y - 52} Z"/>
        ${[6, 7, 8, 1].map((n, i) => `<text class="dg-panel-num${n === 1 ? ' cover' : ''}" x="${x + PW * (i + 0.5)}" y="${y + PH * 0.7}">${n}</text>`).join('')}`;
      return svg(360, 230, `${strip}
        ${arrow(`M8 ${y + PH / 2} H${x - 6}`)}${arrow(`M352 ${y + PH / 2} H${x + W + 6}`)}
        ${text(x + 2 * PW, y - 60, 'slit opens', 'dg-label strong')}`, 'Strip pushed from both ends so the slit opens');
    },
  },
  {
    title: 'Flatten into a plus, then close the book',
    text: 'Keep pushing until the paper forms a plus shape of four wings. Fold the wings together so page 1 is on the front.',
    draw: () => {
      const c = 120, s = 34, l = 72;   // plus centre, half-width, wing length
      const plus = `<path class="dg-sheet" d="M${c - s} ${c - s - l} h${2 * s} v${l} h${l} v${2 * s} h${-l} v${l} h${-2 * s} v${-l} h${-l} v${-2 * s} h${l} Z" transform="translate(-6 -12)"/>`;
      const bx = 262, by = 62;
      return svg(360, 230, `${plus}
        ${arrow('M212 108 H246')}
        <rect class="dg-sheet" x="${bx + 6}" y="${by + 6}" width="${PW}" height="${PH}" rx="2"/>
        <rect class="dg-sheet" x="${bx}" y="${by}" width="${PW}" height="${PH}" rx="2"/>
        <rect class="dg-cover" x="${bx}" y="${by}" width="${PW}" height="${PH}"/>
        <text class="dg-panel-num cover" x="${bx + PW / 2}" y="${by + PH / 2}">1</text>
        ${text(114, 226, 'top view: four wings', 'dg-label')}${text(bx + PW / 2, by + PH + 26, 'finished', 'dg-label strong')}`, 'Plus shape folded into a booklet');
    },
  },
  {
    title: 'More than one sheet? Nest them',
    text: 'Fold each sheet into its own booklet. Open sheet 1 at its middle and slip sheet 2 inside, sheet 3 inside sheet 2, and so on. The table below shows which pages each sheet carries.',
    draw: () => {
      const y = 50, w = 70, h = 108;
      return svg(360, 230, `
        <rect class="dg-sheet" x="${40}" y="${y}" width="${w}" height="${h}" rx="2"/>
        <rect class="dg-sheet" x="${40 + w}" y="${y}" width="${w}" height="${h}" rx="2"/>
        <text class="dg-panel-num" x="${40 + w / 2}" y="${y + h / 2}">4</text>
        <text class="dg-panel-num" x="${40 + 1.5 * w}" y="${y + h / 2}">13</text>
        ${text(40 + w, y + h + 22, 'sheet 1, open at its middle', 'dg-label strong')}
        <rect class="dg-sheet" x="250" y="${y + 6}" width="${w - 8}" height="${h - 12}" rx="2"/>
        <text class="dg-panel-num cover" x="${250 + (w - 8) / 2}" y="${y + h / 2}">5</text>
        ${text(250 + (w - 8) / 2, y + h + 22, 'sheet 2', 'dg-label strong')}
        ${arrow(`M244 ${y + h / 2} C 210 ${y + h / 2 - 30}, 160 ${y - 10}, ${40 + w + 4} ${y + 18}`)}`, 'Second booklet slipped inside the first');
    },
  },
];

function renderSteps() {
  const list = document.getElementById('fold-steps');
  list.innerHTML = STEPS.map((s) => `
    <li class="fold-step">
      <figure>${s.draw()}</figure>
      <div class="text"><h3>${s.title}</h3><p>${s.text}</p></div>
    </li>`).join('');
}

function legend() {
  const sw = (cls) => `<svg width="34" height="10" aria-hidden="true"><line class="${cls}" x1="2" y1="5" x2="32" y2="5"/></svg>`;
  document.getElementById('legend').innerHTML = `
    <span>${sw('dg-fold')}fold here</span>
    <span>${sw('dg-crease')}existing crease</span>
    <span>${sw('dg-cut')}cut</span>`;
}

/** Which pages are on which sheet, straight from the imposition code. */
function renderNesting(count) {
  const ranges = (pages) => {
    const sorted = [...pages].sort((a, b) => a - b);
    const out = [];
    for (const p of sorted) {
      const last = out.at(-1);
      if (last && p === last[1] + 1) last[1] = p; else out.push([p, p]);
    }
    return out.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(' and ');
  };
  const rows = [];
  for (let s = 0; s < count; s++) {
    const pages = sheetLayout(s, count).map((x) => x.page);
    rows.push(`<tr><td>Sheet ${s + 1}</td><td>pages ${ranges(pages)}</td><td>${s === 0 ? 'outside, carries the cover' : `inside sheet ${s}`}</td></tr>`);
  }
  document.getElementById('nest-table').innerHTML = `<table><thead><tr><th>Sheet</th><th>Carries</th><th>Goes</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

renderSteps();
legend();
const select = document.getElementById('sheet-count');
select.addEventListener('change', () => renderNesting(Number(select.value)));
renderNesting(Number(select.value));
