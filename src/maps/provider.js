/**
 * Map provider contract.
 *
 * A provider turns a MapSpec into a basemap raster plus a projection function.
 * Markers are NOT drawn by the provider; the shared renderer composites them
 * on top so every provider produces identical symbology. That keeps the
 * provider surface tiny, which is what makes swapping MapLibre for the ArcGIS
 * Maps SDK (or a static tile API) a one-file change.
 *
 * @typedef {object} MapSpec
 * @property {'center'|'bounds'} kind
 * @property {string} level            'street' | 'city' | 'region' | 'extent' (provider maps to a zoom)
 * @property {[number,number]} [center] [lon, lat] when kind === 'center'
 * @property {[[number,number],[number,number]]} [bounds] [[minLon,minLat],[maxLon,maxLat]] when kind === 'bounds'
 * @property {number} width            CSS px
 * @property {number} height           CSS px
 * @property {Array<{lon:number,lat:number,label?:string}>} [markers]  passed so a provider may use them for padding/fit, never for drawing
 *
 * @typedef {object} RenderedBasemap
 * @property {HTMLCanvasElement} canvas   a canvas the caller owns (width*pixelRatio x height*pixelRatio)
 * @property {number} pixelRatio
 * @property {(lon:number, lat:number) => {x:number, y:number}} project   lon/lat to CSS px within the image
 */

export const DEFAULT_ZOOMS = { street: 16, city: 13, region: 10 };

export class MapProvider {
  /** @param {{pixelRatio?:number, zooms?:Partial<typeof DEFAULT_ZOOMS>}} options */
  constructor(options = {}) {
    this.pixelRatio = options.pixelRatio ?? 2;
    this.zooms = { ...DEFAULT_ZOOMS, ...(options.zooms || {}) };
  }
  /** Human readable name for the UI. */
  get name() { return 'abstract'; }
  /** Attribution text for the basemap, available after prepare() or the first render. */
  get attribution() { return ''; }
  /** Load styles/metadata up front so attribution is known before layout. Optional. */
  async prepare() {}
  /** @param {MapSpec} spec @returns {Promise<RenderedBasemap>} */
  async render(spec) { throw new Error(`${this.name}: render() not implemented`); }
  /** Release GL contexts, DOM nodes, etc. */
  dispose() {}
}

/**
 * Factory. Add a case here (and a file next to this one) to support another engine.
 * @param {'maplibre'|'arcgis'} kind
 */
export async function createMapProvider(kind, options = {}) {
  switch (kind) {
    case 'maplibre': {
      const { MapLibreProvider } = await import('./maplibre.js');
      return new MapLibreProvider(options);
    }
    case 'arcgis': {
      const { ArcGISProvider } = await import('./arcgis.js');
      return new ArcGISProvider(options);
    }
    default:
      throw new Error(`Unknown map provider "${kind}"`);
  }
}
