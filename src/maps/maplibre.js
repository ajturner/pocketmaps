/**
 * MapLibre GL JS provider. One hidden map instance is reused for every render:
 * resize the container, jump the camera, wait for idle, copy the canvas.
 */
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre derives its worker URL from import.meta.url at runtime, which bundlers cannot
// follow. Let Vite bundle the worker and hand MapLibre the resulting URL instead.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(maplibreWorkerUrl);
import { MapProvider } from './provider.js';
import { cleanText } from '../places.js';

export const MAPLIBRE_STYLES = {
  'OpenFreeMap Liberty': 'https://tiles.openfreemap.org/styles/liberty',
  'OpenFreeMap Bright': 'https://tiles.openfreemap.org/styles/bright',
  'OpenFreeMap Positron': 'https://tiles.openfreemap.org/styles/positron',
};

/** Fallback attribution for styles whose sources do not declare any. Keyed by URL prefix. */
const KNOWN_ATTRIBUTION = [
  ['https://tiles.openfreemap.org/', '© OpenFreeMap · © OpenMapTiles · Data © OpenStreetMap contributors'],
];

export class MapLibreProvider extends MapProvider {
  /**
   * @param {object} options
   * @param {string} [options.style]      style URL or style JSON
   * @param {number} [options.pixelRatio]
   * @param {number} [options.timeoutMs]  give up waiting for tiles after this long
   */
  constructor(options = {}) {
    super(options);
    this.style = options.style || MAPLIBRE_STYLES['OpenFreeMap Liberty'];
    this.timeoutMs = options.timeoutMs ?? 20000;
    this.fitPadding = options.fitPadding ?? 18;
    this.maxFitZoom = options.maxFitZoom ?? 15;
    this._map = null;
    this._container = null;
    this._attribution = '';
  }

  get name() { return 'maplibre'; }
  get attribution() { return this._attribution; }

  async _ensureMap() {
    if (this._map) return this._map;
    const container = document.createElement('div');
    Object.assign(container.style, { position: 'fixed', left: '-10000px', top: '0', width: '256px', height: '256px', pointerEvents: 'none' });
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);
    this._container = container;

    const map = new MapLibreMap({
      container,
      style: this.style,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      pixelRatio: this.pixelRatio,
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      center: [0, 0],
      zoom: 1,
    });
    this._map = map;
    await new Promise((resolve, reject) => {
      map.once('load', resolve);
      map.once('error', (e) => reject(e.error || new Error('Map style failed to load')));
    });
    await this._waitForIdle(map); // lets TileJSON-backed sources fetch their metadata (and attribution)
    this._attribution = collectAttribution(map) || knownAttribution(this.style);
    return map;
  }

  async prepare() { await this._ensureMap(); }

  /** @param {import('./provider.js').MapSpec} spec */
  async render(spec) {
    const map = await this._ensureMap();
    this._container.style.width = `${spec.width}px`;
    this._container.style.height = `${spec.height}px`;
    map.resize();

    if (spec.kind === 'bounds') {
      map.fitBounds(spec.bounds, { padding: this.fitPadding, maxZoom: this.maxFitZoom, animate: false, duration: 0 });
    } else {
      map.jumpTo({ center: spec.center, zoom: this.zooms[spec.level] ?? this.zooms.street, bearing: 0, pitch: 0 });
    }
    await this._waitForIdle(map);

    const src = map.getCanvas();
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    canvas.getContext('2d').drawImage(src, 0, 0);
    const pixelRatio = src.width / spec.width;
    const project = (lon, lat) => { const p = map.project([lon, lat]); return { x: p.x, y: p.y }; };
    return { canvas, pixelRatio, project };
  }

  _waitForIdle(map) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; clearTimeout(timer); resolve(); } };
      const timer = setTimeout(() => { console.warn('maplibre: render timed out, using partial tiles'); finish(); }, this.timeoutMs);
      map.once('idle', finish);
      map.triggerRepaint();
    });
  }

  dispose() {
    this._map?.remove();
    this._container?.remove();
    this._map = null;
    this._container = null;
  }
}

function collectAttribution(map) {
  const parts = new Set();
  for (const id of Object.keys(map.getStyle()?.sources || {})) {
    const src = map.getSource(id);
    const text = src?.attribution || map.getStyle().sources[id]?.attribution;
    if (text) parts.add(cleanText(text).replace(/\s+/g, ' '));
  }
  return [...parts].join(' · ');
}

function knownAttribution(style) {
  if (typeof style !== 'string') return '';
  return KNOWN_ATTRIBUTION.find(([prefix]) => style.startsWith(prefix))?.[1] || '';
}
