import mapboxgl from "mapbox-gl";
import "./style.css";
import { ComparisonLayer } from "../lib/CustomLayer";

mapboxgl.accessToken =
  "pk.eyJ1IjoidmluaWNpdXNjYXJyYSIsImEiOiJja2oxZG50bG4yeGl6MnZyeGJ4M2cwOGt5In0.WF4Lrt_ImpReZHCxLQQ9Rw";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div>
    <h1>Mapboxgl Comparison</h1>
    <div>
      <input id="offset" name="offset" type="range" min="0" max="1" step="0.01" />
      <label for="offset">Offset</label>
    </div>
    <div id="map" />
  </div>
`;

const map = new mapboxgl.Map({
  container: "map", // container ID
  style: "mapbox://styles/mapbox/streets-v12", // style URL
  center: [-74.5, 40], // starting position [lng, lat]
  zoom: 9, // starting zoom
  projection: {
    name: "mercator",
  },
});

let data = {
  offset: 500,
};

let layer = new ComparisonLayer(
  "layer01",
  "source01",
  {
    type: "raster",
    tiles: ["https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png"],
  },
  data
);

map.once("load", () => {
  map.addLayer(layer);
});

// Input range
const input = document.querySelector("#offset");
input?.addEventListener("input", (event) => {
  const value = (event.target as any).value as number;
  const width = map.getContainer().getBoundingClientRect().width * value;

  layer.updateData({ offset: width });

  map.triggerRepaint();
});
