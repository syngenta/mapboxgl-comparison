# mapboxgl-comparison

The project aims to facilitate creating comparison _raster layer_ maps. This is achieved by using a custom layer implementation to avoid instantiating multiple maps, duplicating data and hindering performance.

This project is unopinated on how and if you want to change the comparison _offset_, check out the examples.

![](https://github.com/vinicarra/mapboxgl-comparison/blob/master/example/demo.gif)

## Why should I pick this?

The most famous comparison layer library for mapbox is https://github.com/mapbox/mapbox-gl-compare. It's a great and easy-to-use library to setup and compare two completely different maps.

However, if you're looking to _just_ compare raster-layers this library can be more powerful because it only renders a single map and everything else is handled by shaders.

Therefore you should only pick this library if your goal is to simply compare raster-layers without duplicating maps (or data), otherwise stick to the famous _mapbox-gl-compare_.

## Referência

Stamen - https://stamen.com/making-a-snappy-raster-map-with-shaders/
