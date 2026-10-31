# PocketMaps

Fold a pocket-sized map booklet from any ArcGIS Feature Service layer or GeoJSON file, entirely in the browser.

A **PocketMod** is one sheet of paper, printed on one side and folded into an eight-page booklet. A **PocketMap** fills those pages with a title page, one map page per place (optionally paired with a city and region overview page), and an index with a numbered overview map. Several sheets nest together for longer booklets.

![pocketmaps](http://image.slidesharecdn.com/refreshdc-the-how-of-geo-1232637125612989-1/95/refreshdc-the-how-of-geo-215-728.jpg?cb=1232637674)

## Using it

1. Paste a data URL and click **Load data**:
   - an ArcGIS Hub dataset page from any Hub site, such as its Explore view. Filters applied in Hub become the where clause.
   - an ArcGIS Feature Service layer, e.g. `https://services.arcgis.com/…/FeatureServer/0`, with an optional **where** clause. Query parameters already on the URL (`where`, `geometry`, `token`, …) are forwarded, so a filtered `/query?…` link works as-is.
   - any GeoJSON URL, or a local `.geojson` file.
2. Pick the title, the name field, and a description field or a `{FIELD}` template.
3. Choose simple or overview pages, sheet count (auto by default), paper size and basemap, then **Generate booklet**.
4. **Print / Save PDF** at 100% scale, portrait, single sided. Fold instructions are in the app.

### Hub bookmarklet

Open the app, expand **Use from ArcGIS Hub**, and drag the **PocketMap** button to your bookmarks bar. On any Hub dataset page, filtered or not, click the bookmark and the app opens with that layer and its filters. The bookmarklet only sends the page address; the app resolves the dataset through the Hub API (item id or `org::slug`) and translates Hub's `filters` parameter, base64 JSON such as `{"DISTRICT":["PARKS"],"DBH":[30,200]}`, into SQL using the layer's field types.

The **Pages** view shows the booklet in reading order for proofing. **Copy link** produces a URL that rebuilds the same booklet, for example:

```
?url=https://services.arcgis.com/V6ZHFr6zdgNZuVG0/arcgis/rest/services/Landscape_Trees/FeatureServer/0
&where=Condition%3D'Good'+AND+Height+>+70&name=Cmn_Name&template=%7BSci_Name%7D+%C2%B7+%7BHeight%7D+ft&overview=1
```

Supported parameters: `url`, `where`, `title`, `subtitle`, `name`, `desc`, `template`, `overview=1`, `sheets`, `paper=a4`, `style`, `max`, and `go=0` to load without generating.

## Development

```
npm install
npm run dev       # http://localhost:5173
npm test          # vitest: imposition, pagination, place parsing, source URL handling
npm run build     # static site in dist/
```

No server is required; `dist/` deploys to any static host. A GitHub Pages workflow is in `.github/workflows/`.

## How it is built

```
src/
  booklet.js          pages, sheet nesting, cell order, capacity   (pure, tested)
  places.js           feature -> place normalisation, field inference, text cleanup
  sources/            featureService.js, geojson.js, hub.js (Hub URL + filter translation), index.js (facade)
  maps/
    provider.js       MapProvider contract + createMapProvider() factory
    maplibre.js       MapLibre GL implementation (hidden map, canvas capture)
    arcgis.js         stub for an ArcGIS Maps SDK implementation
    renderer.js       marker compositing, caching, serial queue
  render.js           DOM for pages, imposed sheets, proof view
  main.js             UI wiring and permalinks
  styles.css          page layout, rotated cells, print rules
legacy/ruby/          the 2008 Ruby/PDF::Writer original
NOTES.md              review notes on the legacy code and what was preserved
```

**Imposition** is done with HTML and CSS. A sheet is a 2 x 4 grid; each cell holds a page rotated 90 degrees so that page tops meet at the sheet's centre line. Rotated to landscape the sheet reads `5 4 3 2` over `6 7 8 1`, the standard PocketMod layout. Extra sheets nest like a saddle-stitched booklet (sheet 1 holds pages 1-4 and the last four). The browser's print engine produces the PDF.

**Maps** are rendered by a `MapProvider`. The provider only has to return a basemap canvas and a lon/lat to pixel projection for a given centre+zoom or bounds; markers, numbering, caching and layout are shared. To switch engines, implement `render()` in a new file next to `maplibre.js` and add a case to `createMapProvider()`. `arcgis.js` sketches what an ArcGIS Maps SDK version needs.

## Credits

Based on Aaron Straup Cope's mmPDF (PHP) and the 2008 Ruby port. Basemaps by default from [OpenFreeMap](https://openfreemap.org) (© OpenMapTiles, data © OpenStreetMap contributors).

Andrew Turner — http://highearthorbit.com
