/**
 * Placeholder for an ArcGIS Maps SDK for JavaScript provider.
 *
 * To implement: create a hidden MapView with a basemap style (and an API key),
 * set `view.extent` / `view.center` + `view.zoom` per spec, await
 * `reactiveUtils.whenOnce(() => !view.updating)`, then `view.takeScreenshot()`
 * and project with `view.toScreen(new Point({longitude, latitude}))`.
 * Everything else (markers, caching, page layout) is provider-agnostic.
 */
import { MapProvider } from './provider.js';

export class ArcGISProvider extends MapProvider {
  get name() { return 'arcgis'; }
  async render() {
    throw new Error('ArcGIS Maps SDK provider is not implemented yet. Use the MapLibre provider.');
  }
}
