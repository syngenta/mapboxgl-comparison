import mapboxgl from "mapbox-gl";
import "./style.css";
import { ComparisonLayer } from "../lib/CustomLayer";

mapboxgl.accessToken =
  "pk.eyJ1IjoidmluaWNpdXNjYXJyYSIsImEiOiJja2oxZG50bG4yeGl6MnZyeGJ4M2cwOGt5In0.WF4Lrt_ImpReZHCxLQQ9Rw";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div>
    <h1>Mapboxgl Comparison</h1>
    <div>
      <input id="offsetX" name="offset" type="range" min="0" max="1" step="0.01" />
      <label for="offsetX">OffsetX</label>
      <input id="offsetY" name="offset" type="range" min="0" max="1" step="0.01" />
      <label for="offsetY">OffsetY</label>
    </div>
    <div id="map">
      <div id="divider" />
    </div>
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
  offsetX: 0,
  offsetY: 0,
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
const inputX = document.querySelector("#offsetX");
const inputY = document.querySelector("#offsetY");
const divider: HTMLElement | null = document.querySelector("#divider");
inputX?.addEventListener("input", (event) => {
  const value = (event.target as any).value as number;
  const width = Math.max(
    0,
    map.getContainer().getBoundingClientRect().width * value - 3
  );

  data = { offsetX: value, offsetY: data.offsetY };

  layer.updateData(data);
  divider?.style.setProperty("--left", `${width}px`);
});

inputY?.addEventListener("input", (event) => {
  const value = (event.target as any).value as number;

  data = { offsetX: data.offsetX, offsetY: value };

  layer.updateData(data);
});
