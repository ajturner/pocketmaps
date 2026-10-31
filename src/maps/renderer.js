/**
 * Provider-agnostic map image renderer: serialises requests through a single
 * provider, composites markers, caches PNG data URLs by spec.
 */
import { mapKey } from '../booklet.js';

const MARKER = {
  fill: '#d7263d',
  stroke: '#ffffff',
  radius: 7,          // CSS px, plain marker
  labelRadius: 8.5,   // CSS px, numbered marker
  font: 'bold 10px system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
};

export class MapImageRenderer {
  /** @param {import('./provider.js').MapProvider} provider */
  constructor(provider) {
    this.provider = provider;
    this.cache = new Map();
    this._queue = Promise.resolve();
  }

  /** @returns {Promise<string>} PNG data URL */
  image(spec) {
    const key = mapKey(spec);
    if (this.cache.has(key)) return this.cache.get(key);
    const job = this._queue.then(() => this._render(spec)).catch((err) => { this.cache.delete(key); throw err; });
    this._queue = job.catch(() => {});
    this.cache.set(key, job);
    return job;
  }

  async _render(spec) {
    const { canvas, pixelRatio, project } = await this.provider.render(spec);
    drawMarkers(canvas, pixelRatio, project, spec.markers || []);
    return canvas.toDataURL('image/png');
  }

  dispose() { this.provider.dispose(); }
}

export function drawMarkers(canvas, pixelRatio, project, markers) {
  if (!markers.length) return;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(pixelRatio, pixelRatio);
  const w = canvas.width / pixelRatio, h = canvas.height / pixelRatio;
  // Draw labelled markers last so their numbers stay readable when crowded.
  const ordered = [...markers].sort((a, b) => (a.label ? 1 : 0) - (b.label ? 1 : 0));
  for (const m of ordered) {
    const { x, y } = project(m.lon, m.lat);
    const r = m.label ? MARKER.labelRadius : MARKER.radius;
    const cx = Math.min(Math.max(x, r + 1), w - r - 1);
    const cy = Math.min(Math.max(y, r + 1), h - r - 1);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = MARKER.fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = MARKER.stroke;
    ctx.stroke();
    if (m.label) {
      ctx.fillStyle = '#fff';
      ctx.font = MARKER.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.label, cx, cy + 0.5);
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }
  ctx.restore();
}
