# mapboxgl-comparison

[![npm version](https://badge.fury.io/js/mapboxgl-comparison.svg)](https://www.npmjs.com/package/mapboxgl-comparison)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight, high-performance comparison layer for Mapbox GL JS. Overlay and compare raster tile sources using WebGL shaders — without the overhead of multiple map instances.

## Features

- **Single map instance** — No duplicate maps or data, just efficient shader-based rendering
- **Dual-axis comparison** — Control visibility via both X and Y offsets
- **WebGL-powered** — GPU-accelerated rendering for smooth performance
- **TypeScript support** — Full type definitions included
- **Framework-agnostic** — Works with vanilla JS, React, Vue, or any framework

## Installation

```bash
npm install mapboxgl-comparison mapbox-gl
```

## Requirements

- **mapbox-gl**: ^3.3.0 or higher
- Modern browser with WebGL support

## Quick Start

```typescript
import mapboxgl from "mapbox-gl";
import { ComparisonLayer } from "mapboxgl-comparison";

mapboxgl.accessToken = "YOUR_MAPBOX_TOKEN";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/streets-v12",
  center: [-74.5, 40],
  zoom: 9,
});

// Create the comparison layer
const comparisonLayer = new ComparisonLayer(
  "comparison-layer",      // Unique layer ID
  "overlay-source",        // Source ID for the overlay tiles
  {
    type: "raster",
    tiles: ["https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png"],
  },
  { offsetX: 0.5, offsetY: 0 }  // Initial position (0-1 range)
);

// Add to map
map.once("load", () => {
  map.addLayer(comparisonLayer);
});

// Update position dynamically
comparisonLayer.updateData({ offsetX: 0.7, offsetY: 0 });
```

## API Reference

### `ComparisonLayer`

A custom Mapbox GL JS layer for comparing raster tile sources.

#### Constructor

```typescript
new ComparisonLayer(
  id: string,                     // Unique layer identifier
  sourceId: string,               // Source ID for overlay tiles
  tileJson: RasterSource | null,  // Raster source spec, or null to render an existing source
  data: {                         // Initial offset configuration
    offsetX: number;              // Horizontal offset (0-1)
    offsetY: number;              // Vertical offset (0-1)
    opacity?: number;             // Overlay opacity (0-1, default 1)
  }
)
```

#### External-source mode

Pass `null` as `tileJson` to render a raster source your app already owns. The
layer then never calls `addSource`/`removeSource` — it only draws from the
existing source's tile cache. Keep the source "used" (so mapbox loads and
updates its tiles) by also adding a regular raster layer with
`'raster-opacity': 0`:

```typescript
map.addSource("overlay-source", { type: "raster", tiles: [url] });
map.addLayer({
  id: "overlay-loader",
  type: "raster",
  source: "overlay-source",
  paint: { "raster-opacity": 0 },
});
map.addLayer(new ComparisonLayer("comparison-layer", "overlay-source", null, { offsetX: 0.5, offsetY: 0 }));
```

This is the recommended mode for apps whose framework (e.g. react-map-gl)
owns source lifecycles and restores them across style swaps.

#### Methods

| Method | Description |
|--------|-------------|
| `updateData(data)` | Updates the offset values and triggers a repaint |
| `onRemove()` | Cleans up resources when layer is removed |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Layer identifier |
| `sourceId` | `string` | Overlay source identifier |
| `type` | `"custom"` | Mapbox layer type |

## Rendering notes

- **Alpha blending**: tiles are composited with premultiplied-alpha blending
  (matching how mapbox uploads raster textures), and fully transparent texels
  are discarded — bounded tile sources with transparent padding render
  correctly over the basemap.
- **Device-pixel clipping**: the comparison edge is computed in device pixels,
  so it is exact on any `devicePixelRatio` (retina, browser zoom).
- **Globe projection**: rendering is skipped while the map is in true globe
  projection (low zoom); above the globe-to-mercator transition zoom the
  overlay renders normally.

## How It Works

Unlike [mapbox-gl-compare](https://github.com/mapbox/mapbox-gl-compare), which creates two separate map instances, this library uses a single map with a custom WebGL layer. The overlay raster tiles are rendered via fragment shaders, with visibility controlled by `offsetX` and `offsetY` uniforms.

This approach offers:

- **Lower memory usage** — One map instance instead of two
- **Better performance** — No synchronization overhead between maps
- **Simpler API** — Just update offset values to control visibility

## Use Cases

- Compare historical vs. current imagery
- Overlay sensor data on base maps
- Visualize before/after scenarios
- Display alternative routing options

## Browser Support

Requires WebGL support. Compatible with all modern browsers:

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## License

MIT © [Vinicius Carra](https://github.com/vinicarra)

## Acknowledgments

Inspired by [Stamen's work on raster map shaders](https://stamen.com/making-a-snappy-raster-map-with-shaders/).
