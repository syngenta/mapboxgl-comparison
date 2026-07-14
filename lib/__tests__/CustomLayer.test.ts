import { describe, expect, it, vi } from "vitest";
import { ComparisonLayer, render } from "../CustomLayer";
import type { ComparisonLayerData } from "../CustomLayer";

type FakeProgram = {
  aPos: number;
  uMatrix: object;
  uTexture: object;
  uClipX: object;
  uClipY: object;
  uOpacity: object;
  vertexBuffer: object;
};

const makeProgram = (): FakeProgram => ({
  aPos: 0,
  uMatrix: { u: "uMatrix" },
  uTexture: { u: "uTexture" },
  uClipX: { u: "uClipX" },
  uClipY: { u: "uClipY" },
  uOpacity: { u: "uOpacity" },
  vertexBuffer: { buffer: true }
});

const makeGl = () =>
  (({
    drawingBufferWidth: 2000,
    drawingBufferHeight: 1000,
    BLEND: "BLEND",
    ONE: "ONE",
    ONE_MINUS_SRC_ALPHA: "ONE_MINUS_SRC_ALPHA",
    TEXTURE0: "TEXTURE0",
    TEXTURE_2D: "TEXTURE_2D",
    TEXTURE_WRAP_S: "TEXTURE_WRAP_S",
    TEXTURE_WRAP_T: "TEXTURE_WRAP_T",
    TEXTURE_MIN_FILTER: "TEXTURE_MIN_FILTER",
    TEXTURE_MAG_FILTER: "TEXTURE_MAG_FILTER",
    CLAMP_TO_EDGE: "CLAMP_TO_EDGE",
    LINEAR: "LINEAR",
    ARRAY_BUFFER: "ARRAY_BUFFER",
    FLOAT: "FLOAT",
    TRIANGLES: "TRIANGLES",
    LESS: "LESS",
    useProgram: vi.fn(),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniformMatrix4fv: vi.fn(),
    enable: vi.fn(),
    blendFuncSeparate: vi.fn(),
    activeTexture: vi.fn(),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    bindBuffer: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    depthFunc: vi.fn(),
    drawArrays: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn()
  } as unknown) as WebGLRenderingContext);

const makeSourceCache = (tiles: any[] = []) => ({
  getVisibleCoordinates: vi.fn(() => tiles.map((_, i) => i)),
  getTile: vi.fn((i: number) => tiles[i]),
  update: vi.fn()
});

const makeMap = ({
  sourceCache = makeSourceCache(),
  projectionName = "mercator"
}: { sourceCache?: any; projectionName?: string } = {}) => {
  const source = { on: vi.fn(), off: vi.fn() };
  return {
    on: vi.fn(),
    off: vi.fn(),
    addSource: vi.fn(),
    removeSource: vi.fn(),
    getSource: vi.fn(() => source),
    triggerRepaint: vi.fn(),
    getContainer: vi.fn(() => ({
      getBoundingClientRect: () => ({ width: 1000, height: 500 })
    })),
    style: {
      getOwnSourceCache: vi.fn(() => sourceCache),
      _sourceCaches: {},
      _layers: { layer01: {} }
    },
    transform: { projection: { name: projectionName } },
    painter: { transform: {} },
    _source: source
  };
};

const addLayer = (
  map: any,
  data: ComparisonLayerData = { offsetX: 0.5, offsetY: 0 },
  tileJson: any = null
) => {
  const program = makeProgram();
  const onAddCallback = vi.fn(() => program) as any;
  const renderCallback = vi.fn() as any;
  const layer = new ComparisonLayer(
    "layer01",
    "source01",
    tileJson,
    data,
    onAddCallback,
    renderCallback
  );
  const gl = makeGl();
  layer.onAdd(map, gl);
  return { layer, gl, program, onAddCallback, renderCallback };
};

describe("ComparisonLayer (external-source mode)", () => {
  it("does not add or own the source", () => {
    const map = makeMap();
    const { layer } = addLayer(map);

    expect(map.addSource).not.toHaveBeenCalled();
    expect(map.on).not.toHaveBeenCalled();
    expect(map.style.getOwnSourceCache).toHaveBeenCalledWith("source01");

    layer.onRemove();
    expect(map.removeSource).not.toHaveBeenCalled();
  });

  it("falls back to _sourceCaches when getOwnSourceCache is unavailable", () => {
    const sourceCache = makeSourceCache();
    const map = makeMap();
    map.style.getOwnSourceCache = undefined as any;
    map.style._sourceCaches = { "other:source01": sourceCache };
    const { layer, gl, renderCallback } = addLayer(map);

    layer.render(gl, []);
    expect(renderCallback).toHaveBeenCalled();
  });

  it("re-resolves the source cache lazily when it appears after onAdd", () => {
    const sourceCache = makeSourceCache();
    const map = makeMap();
    map.style.getOwnSourceCache = vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValue(sourceCache);
    const { layer, gl, renderCallback } = addLayer(map);

    layer.render(gl, []);
    expect(renderCallback).toHaveBeenCalledTimes(1);
  });

  it("skips rendering while the source cache is missing", () => {
    const map = makeMap();
    map.style.getOwnSourceCache = vi.fn(() => null);
    map.style._sourceCaches = {};
    const { layer, gl, renderCallback } = addLayer(map);

    layer.render(gl, []);
    expect(renderCallback).not.toHaveBeenCalled();
  });
});

describe("ComparisonLayer (owned-source mode)", () => {
  const tileJson = { type: "raster", tiles: ["https://example.com/{z}/{x}/{y}.png"] };

  it("adds the source, marks it used, and removes it on onRemove", () => {
    const map = makeMap();
    const { layer } = addLayer(map, { offsetX: 0.5, offsetY: 0 }, tileJson);

    expect(map.addSource).toHaveBeenCalledWith("source01", tileJson);
    expect(map.style._layers.layer01).toEqual({ source: "source01" });
    expect(map._source.on).toHaveBeenCalledWith("data", expect.any(Function));
    expect(map.on).toHaveBeenCalledWith("move", expect.any(Function));

    layer.onRemove();
    expect(map.removeSource).toHaveBeenCalledWith("source01");
    expect(map.off).toHaveBeenCalledWith("move", map.on.mock.calls[0][1]);
    expect(map._source.off).toHaveBeenCalledWith(
      "data",
      map._source.on.mock.calls[0][1]
    );
  });
});

describe("ComparisonLayer.render guards", () => {
  it("skips rendering when offsetX <= 0", () => {
    const map = makeMap();
    const { layer, gl, renderCallback } = addLayer(map, { offsetX: 0, offsetY: 0 });

    layer.render(gl, []);
    expect(renderCallback).not.toHaveBeenCalled();

    layer.updateData({ offsetX: 0.4, offsetY: 0 });
    expect(map.triggerRepaint).toHaveBeenCalled();
    layer.render(gl, []);
    expect(renderCallback).toHaveBeenCalledTimes(1);
  });

  it("skips rendering in true-globe projection", () => {
    const map = makeMap({ projectionName: "globe" });
    const { layer, gl, renderCallback } = addLayer(map);

    layer.render(gl, []);
    expect(renderCallback).not.toHaveBeenCalled();
  });

  it("passes visible tiles to the render callback", () => {
    const tiles = [{ texture: { texture: {} }, tileID: { projMatrix: [1] } }];
    const map = makeMap({ sourceCache: makeSourceCache(tiles) });
    const { layer, gl, program, renderCallback } = addLayer(map);

    layer.render(gl, []);
    expect(renderCallback).toHaveBeenCalledWith(
      gl,
      [],
      tiles,
      program,
      { offsetX: 0.5, offsetY: 0 },
      1000,
      500
    );
  });
});

describe("ComparisonLayer.onRemove", () => {
  it("deletes the WebGL program and vertex buffer", () => {
    const map = makeMap();
    const { layer, gl, program } = addLayer(map);

    layer.onRemove();
    expect(gl.deleteBuffer).toHaveBeenCalledWith(program.vertexBuffer);
    expect(gl.deleteProgram).toHaveBeenCalledWith(program);
  });
});

describe("default render()", () => {
  const data: ComparisonLayerData = { offsetX: 0.25, offsetY: 0 };

  it("clips in device pixels and blends with premultiplied alpha", () => {
    const gl = makeGl();
    const program = makeProgram() as any;
    const tile = { texture: { texture: { id: "tex" } }, tileID: { projMatrix: [42] } };

    render(gl, [], [tile], program, data, 1000, 500);

    expect(gl.uniform1f).toHaveBeenCalledWith(program.uClipX, 0.25 * 2000);
    expect(gl.uniform1f).toHaveBeenCalledWith(program.uClipY, 0);
    expect(gl.uniform1f).toHaveBeenCalledWith(program.uOpacity, 1);
    expect(gl.enable).toHaveBeenCalledWith("BLEND");
    expect(gl.blendFuncSeparate).toHaveBeenCalledWith(
      "ONE",
      "ONE_MINUS_SRC_ALPHA",
      "ONE",
      "ONE_MINUS_SRC_ALPHA"
    );
    expect(gl.uniformMatrix4fv).toHaveBeenCalledWith(program.uMatrix, false, [42]);
    expect(gl.drawArrays).toHaveBeenCalledWith("TRIANGLES", 0, 6);
  });

  it("applies the opacity uniform", () => {
    const gl = makeGl();
    const program = makeProgram() as any;

    render(gl, [], [], program, { ...data, opacity: 0.4 }, 1000, 500);
    expect(gl.uniform1f).toHaveBeenCalledWith(program.uOpacity, 0.4);
  });

  it("skips tiles without a texture", () => {
    const gl = makeGl();
    const program = makeProgram() as any;

    render(gl, [], [{ texture: null }], program, data, 1000, 500);
    expect(gl.drawArrays).not.toHaveBeenCalled();
  });
});
