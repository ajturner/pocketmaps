# PocketMaps codebase notes

Review of the 2008-era Ruby code, written to inform a rewrite as a web application.

## What it produces

A **PocketMod** is a single letter or A4 sheet printed on one side, folded into a
tiny 8-page booklet. A **PocketMap** is a PocketMod whose pages are:

1. **Title page** (page 1): "PocketMap", the KML document name, today's date.
2. **One or two pages per place**, in document order:
   - *Simple mode* (one page): street-level map image (zoom 17) at the top,
     then the place name in bold and up to ~200 characters of description below.
     If the description contains a Flickr image URL, the small Flickr thumbnail
     is placed instead of the text.
   - *Overview mode* (`overview: true`, two pages, always starting on an even
     page): a preceding page with a city map (zoom 14, large) and a region map
     (zoom 11, small, bottom), then the street page as above.
3. **Index page** (pushed to the last page of the last sheet): "Index" heading,
   one dotted-leader line per place (`Name...... page`), and a small extent map
   at the bottom with numbered markers for every place.

Capacity per sheet count is hard-coded in `Pocketmap::PAGE_COUNTS`:
simple 6/14/22/30 places for 1-4 sheets, overview 3/7/11/15.

## Files

| File | Role |
|------|------|
| `pocketmod.rb` | Generic PocketMod imposition engine. Subclass of `PDF::Writer`. Buffers text and images per logical page, then writes them rotated into the right cell of the physical sheet. Port of Aaron Straup Cope's mmPDF (PHP). |
| `pocketmap.rb` | `Pocketmap < Pocketmod`. Fetches KML, extracts placemarks, fetches map thumbnails, lays out title/place/index pages. Includes a `__FILE__ == $0` demo runner. |
| `README.md` | Three sentences and a slide image. |

## Pipeline (pocketmap.rb)

```
Pocketmap.new(config)
  -> add_map(url, max)            # dispatch on host: platial/google/delicious/mapufacture, else raw KML
     -> add_kml_file(url)         # Hpricot XML parse; recurses into NetworkLink hrefs
        -> add_place(name, desc, lat, lon)   # per <Placemark> with a <Point>
           -> get_img(...)        # fetch map PNG from a ModestMaps ws-compose server, cache in /tmp by MD5(url)
           -> add_map_image(...)  # Pocketmod#add_some_image with fixed dims/offsets
           -> add_some_text(...)  # buffered text block
           -> @index[name] = {page, lat, lon}
  -> Output(filename)
     -> add_titlepage, add_index
     -> Pocketmod#Output(name, sheets)   # imposition + save_as
```

**Inputs:** only KML point placemarks (plus URL rewriting for Google My Maps,
Platial, delicious, Mapufacture). Lines/polygons are ignored. Dedupe is by
MD5 of name+description.

**Map imagery:** a ModestMaps `ws-compose` server at `modestmaps.server`
(demo uses `http://127.0.0.1:9999/`) with a custom marker syntax:
`?provider=P&height=H&width=W&method=center&latitude=..&longitude=..&zoom=Z&marker=mark_i,lat,lon,100,100,radius,balloon[,text]`
or `method=extent&bbox=minlat,minlon,maxlat,maxlon` for the index map.
Image sizes requested: street/city 380x380, region/index 190x380.
A Yahoo Maps Image API fallback exists but is a stub that discards its result.

**Place content massaging:** HTML entity decoding, tag stripping, `<br>` to
newline, provider-specific description extraction, 200-char truncation.

## Imposition model (pocketmod.rb)

- Physical page is portrait: letter 612x792 pt (A4 supported). Margin 10 pt.
- The sheet is divided into a 4-row x 2-column grid of cells, each 198 x 306 pt.
  Every cell is a logical page **rotated 90 degrees**, so a page is
  `@sect_width` = h/4 - 2*margin = 178 pt wide (along the physical y axis) and
  `@sect_height` = w/2 - 2*margin = 286 pt tall (along the physical x axis).
- Left-column cells are type `D` (content rotated 270, drawn leftward from the
  sheet centre line); right-column cells are type `U` (rotated 90, drawn
  rightward). Cells are lettered a-h by row then column.
- Logical page to cell map (`@page_types`): 1->a, 2->b, 3->d, 4->f, 5->h,
  6->g, 7->e, 8->c. That is the standard PocketMod fold order.
- Multiple sheets are nested booklet-style: sheet 1 holds pages 1-4 and the
  last 4, sheet 2 holds 5-8 and the next-to-last 4, and so on.
- Fold guide lines are drawn when `folds` is set; a border mode exists.
- Text: `add_some_text` buffers `{x, y, txt, rot}` per page; at output,
  `write_text_block` emits up to 6 wrapped lines (`line[:lines] || 5`, inclusive
  range) via `PDF::Writer#add_text_wrap`, 10 pt font, each line stepped 10 pt
  along the rotated baseline. There is no real pagination: overflow text is
  silently dropped after 6 lines. Page numbers are drawn rotated at each cell
  edge.
- Images: `add_some_image` loads with RMagick, rotates 90/270 to match the cell,
  resizes to w x h, writes a temp JPEG, then `place_image` converts the
  page-local (x, y) offset into physical sheet coordinates and buffers the blob.
  Images are emitted with `PDF::Writer#add_image` at output.

## Coordinate conventions worth keeping

Page-local offsets are expressed as if the page were upright: `x` runs across
the 178 pt width, `y` runs down the 286 pt height from the top. The map image is
placed at (-5, -15) with size 190x190 so it bleeds slightly past the page edge;
text starts at y=200; the small region/index map sits at y=180 with size 80x190.

## Dependencies and era

Ruby 1.8 code: `hpricot` (abandoned), `htmlentities`, `pdf-writer` (abandoned,
incompatible with Ruby 1.9+), `RMagick`, `open-uri`. None of the data sources
still exist (Platial, Mapufacture, delicious maps, Yahoo Maps Image API,
Google My Maps KML `output=nl`). Running this today would require a Ruby 1.8
environment and a self-hosted ModestMaps compose server.

## Bugs and dead code observed

- `str_replace` and `html_entity_decode` are PHP functions never defined in
  Ruby; the Platial, Google and delicious branches would raise `NoMethodError`.
- `return null` in `add_kml_file` should be `nil`.
- `url << "&fill=..." if fill && balloon` relies on `fill` resolving to
  `PDF::Writer#fill`, which fills an empty path and returns self. Works by
  accident.
- `write_page_number`: `odd = (pg % 2) ? 1 : 0` is always 1 in Ruby (0 is
  truthy), so even pages get the odd placement.
- `add_index` computes `page_use` from `@buffer.keys.length`, not from the
  index size, and `limit = 35` overrides the computed leader width.
- The bottom third of `pocketmod.rb` (`TextWithDirection`, `Image`,
  `simple_get`) is unconverted PHP and is never called.
- QR code support, `calculate_page_use_for_idx`, and text pagination are
  stubbed or commented out.
- Temp files go to `/tmp` with MD5 names and are never cleaned up on error.

## Implications for a web rewrite

Things the old code gets right that the new version should preserve:

- The page model: title, N place pages, index with numbered overview map.
- The PocketMod cell geometry and page-to-cell order, including the nested
  multi-sheet imposition.
- Rotated layout with a bleed on the map image and fixed text region.
- Place dedupe and description cleanup (strip HTML, truncate).
- Per-place street map plus optional overview pair.
- Caching map tiles/images by request key.

Things that should change:

- Input becomes GeoJSON (any URL or file) and ArcGIS Feature Service layer
  queries with a `where` filter, `outFields`, and optional geometry filter,
  fetched as `f=geojson`. Points only at first, with centroid fallback for
  lines/polygons.
- Title, name field and description field become user choices (or inferred
  from layer metadata: layer name, display field, popup template).
- Map imagery rendered client-side rather than from a compose server.
- PDF produced in the browser so the app can be a static site.

## Status (2026-10-30)

The web rewrite is in place: see `README.md` for the architecture. The legacy
Ruby lives in `legacy/ruby/`. Decisions taken: MapLibre GL behind a
`MapProvider` interface (ArcGIS Maps SDK stubbed for later), HTML/CSS
imposition printed by the browser, overview pages, growing index, and nested
multi-sheet booklets all kept.
