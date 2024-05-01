import mapboxgl from "mapbox-gl";
import vertexSource from "./shaders/vertexShader.ts";
import fragmentSource from "./shaders/fragmentShader.ts";

type onAddCallback = (
  _: mapboxgl.Map,
  gl: WebGLRenderingContext,
  data: ComparisonLayerData
) => ComparisonLayerProgram;

type onRenderCallback = (
  gl: WebGLRenderingContext,
  _: number[],
  tiles: any[],
  program: ComparisonLayerProgram,
  data: ComparisonLayerData
) => void;

interface ComparisonLayerProgram extends WebGLProgram {
  aPos: number;
  uMatrix: WebGLUniformLocation | null;
  uTexture: WebGLUniformLocation | null;
  uOffset: WebGLUniformLocation | null;
  uDevicePixelRatio: WebGLUniformLocation | null;
  vertexBuffer: WebGLBuffer | null;
}

type ComparisonLayerData = {
  offset: number;
  devicePixelRatio: number;
};

export class ComparisonLayer implements mapboxgl.CustomLayerInterface {
  // References
  map: mapboxgl.Map | null;
  gl: WebGLRenderingContext | null;
  // Mapbox members
  id: string;
  tileSource: mapboxgl.AnySourceImpl | null;
  source: string;
  type: "custom";
  tileJson: mapboxgl.RasterSource;
  // Custom data
  program: ComparisonLayerProgram | null;
  sourceCache: any;
  data: ComparisonLayerData;
  // Callbacks
  onAddCallback: onAddCallback;
  renderCallback: onRenderCallback;
  preRenderCallback?: () => any;

  constructor(
    id: string,
    tileJson: mapboxgl.RasterSource,
    onAddCallback: onAddCallback,
    renderCallback: onRenderCallback,
    data: ComparisonLayerData,
    preRenderCallback?: () => any
  ) {
    this.map = null;
    this.gl = null;
    this.id = id;
    this.tileSource = null;
    this.source = this.id + "Source";
    this.type = "custom";
    this.tileJson = tileJson;
    this.program = null;
    this.onAddCallback = onAddCallback;
    this.renderCallback = renderCallback;
    this.preRenderCallback = preRenderCallback;
    this.data = data;
  }

  onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext) {
    this.map = map;
    this.gl = gl;
    map.on("move", this.move.bind(this));
    map.on("zoom", this.zoom.bind(this));

    map.addSource(this.source, this.tileJson);
    this.tileSource = this.map.getSource(this.source);
    //@ts-ignore
    this.tileSource.on("data", this.onData.bind(this));
    //@ts-ignore
    this.sourceCache = this.map.style._sourceCaches[`other:${this.source}`];

    // !IMPORTANT! hack to make mapbox mark the sourceCache as 'used' so it will initialise tiles.
    //@ts-ignore
    this.map.style._layers[this.id].source = this.source;
    //@ts-ignore
    if (this.onAddCallback) {
      this.program = this.onAddCallback(map, gl, this.data);
    }
  }

  move() {
    this.updateTiles();
  }

  zoom() {}

  onData(e: any) {
    if (e.sourceDataType === "content") this.updateTiles();
  }

  updateTiles() {
    //@ts-ignore
    this.sourceCache.update(this.map.painter.transform);
  }

  prerender(gl: WebGLRenderingContext, matrix: number[]) {
    if (this.preRenderCallback)
      this.preRenderCallback(
        //@ts-ignore
        gl,
        matrix,
        this.sourceCache
          .getVisibleCoordinates()
          //@ts-ignore
          .map((tileid) => this.sourceCache.getTile(tileid))
      );
  }

  render(gl: WebGLRenderingContext, matrix: number[]) {
    if (this.renderCallback && this.program)
      this.renderCallback(
        //@ts-ignore
        gl,
        matrix,
        this.sourceCache
          .getVisibleCoordinates()
          //@ts-ignore
          .map((tileid) => this.sourceCache.getTile(tileid)),
        this.program,
        this.data
      );
  }
}

export function setupLayer(
  _: mapboxgl.Map,
  gl: WebGLRenderingContext,
  data: ComparisonLayerData
) {
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  if (!vertexShader) {
    throw new Error("[shader] failed to create vertex shader");
  }
  gl.shaderSource(vertexShader, vertexSource);
  gl.compileShader(vertexShader);

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!fragmentShader) {
    throw new Error("[shader] failed to create fragment shader");
  }
  gl.shaderSource(fragmentShader, fragmentSource);
  gl.compileShader(fragmentShader);

  const program = gl.createProgram() as ComparisonLayerProgram | null;
  if (!program) {
    throw new Error("[program] failed to create program");
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.validateProgram(program);

  program.aPos = gl.getAttribLocation(program, "aPos");
  program.uMatrix = gl.getUniformLocation(program, "uMatrix");
  program.uTexture = gl.getUniformLocation(program, "uTexture");
  program.uOffset = gl.getUniformLocation(program, "uOffset");
  program.uDevicePixelRatio = gl.getUniformLocation(
    program,
    "uDevicePixelRatio"
  );

  const vertexArray = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);

  program.vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, program.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertexArray, gl.STATIC_DRAW);

  // Initialize data
  gl.useProgram(program);
  gl.uniform1f(program.uOffset, data.offset);
  gl.uniform1f(program.uDevicePixelRatio, data.devicePixelRatio);

  return program;
}

export function render(
  gl: WebGLRenderingContext,
  _: number[],
  tiles: any[],
  program: ComparisonLayerProgram,
  data: ComparisonLayerData
) {
  gl.useProgram(program);
  gl.uniform1f(program.uOffset, data.offset);
  gl.uniform1f(program.uDevicePixelRatio, data.devicePixelRatio);
  tiles.forEach((tile) => {
    if (!tile.texture) return;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tile.texture.texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.bindBuffer(gl.ARRAY_BUFFER, program.vertexBuffer);
    gl.enableVertexAttribArray(program.aPos);
    gl.vertexAttribPointer(program.aPos, 2, gl.FLOAT, false, 0, 0);

    gl.uniformMatrix4fv(program.uMatrix, false, tile.tileID.projMatrix);
    gl.uniform1i(program.uTexture, 0);
    gl.depthFunc(gl.LESS);
    //gl.enable(gl.BLEND);
    //gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  });
}
