import './site.css';
import { EXAMPLES, exampleHref } from './examples.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const chipClass = (kind) => (/hub/i.test(kind) ? 'chip hub' : /geojson/i.test(kind) ? 'chip geojson' : 'chip');

document.getElementById('example-grid').innerHTML = EXAMPLES.map((ex) => `
  <a class="example" href="${esc(exampleHref(ex))}">
    <div class="thumb"><img src="examples/${ex.id}.jpg" alt="" loading="lazy" width="640" height="400" onerror="this.remove()"></div>
    <div class="body">
      <div class="meta"><span>${esc(ex.place)}</span><span class="${chipClass(ex.kind)}">${esc(ex.kind)}</span></div>
      <h3>${esc(ex.title)}</h3>
      <p>${esc(ex.blurb)}</p>
      <span class="go">Build this booklet →</span>
    </div>
  </a>`).join('');

// Hero: a real printed sheet, plus a folded booklet sitting on it.
document.getElementById('hero-art').innerHTML = `
  <svg viewBox="0 0 420 420">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#15202b" flood-opacity="0.18"/></filter>
      <clipPath id="sheet-clip"><rect x="0" y="0" width="255" height="330" rx="3"/></clipPath>
    </defs>
    <g transform="translate(40 36) rotate(-7 127 165)" filter="url(#shadow)">
      <rect width="255" height="330" rx="3" fill="#fff"/>
      <image href="examples/hero-sheet.jpg" width="255" height="330" preserveAspectRatio="xMidYMid slice" clip-path="url(#sheet-clip)"/>
    </g>
    <g transform="translate(232 196) rotate(8 70 95)" filter="url(#shadow)">
      <rect x="8" y="8" width="132" height="176" rx="3" fill="#ece7da"/>
      <rect width="132" height="176" rx="3" fill="#fff"/>
      <clipPath id="cover-clip"><rect width="132" height="176" rx="3"/></clipPath>
      <image href="examples/hero-cover.jpg" width="132" height="176" preserveAspectRatio="xMidYMin slice" clip-path="url(#cover-clip)"/>
      <path d="M0 0 V176" stroke="#15202b" stroke-opacity="0.25" stroke-width="2"/>
    </g>
  </svg>`;
