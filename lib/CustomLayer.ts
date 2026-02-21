import mapboxgl from "mapbox-gl";
import vertexSource from "./shaders/vertexShader.ts";
import fragmentSource from "./shaders/fragmentShader.ts";

/**
 * Callback fired when the layer is added to the map.
 * Responsible for setting up WebGL resources and shaders.
 */
type onAddCallback = (
  _: mapboxgl.Map,
  gl: WebGLRenderingContext,
  data: ComparisonLayerData
) => ComparisonLayerProgram;

/**
 * Callback fired during each render frame.
 * Responsible for drawing tiles using the WebGL program.
 */
type onRenderCallback = (
  gl: WebGLRenderingContext,
  _: number[],
  tiles: any[],
  program: ComparisonLayerProgram,
  data: ComparisonLayerData,
  width: number,
  height: number
) => void;

/**
 * Extended WebGL program with cached attribute and uniform locations.
 */
interface ComparisonLayerProgram extends WebGLProgram {
  aPos: number;
  uMatrix: WebGLUniformLocation | null;
  uTexture: WebGLUniformLocation | null;
  uOffsetX: WebGLUniformLocation | null;
  uOffsetY: WebGLUniformLocation | null;
  uDevicePixelRatio: WebGLUniformLocation | null;
  vertexBuffer: WebGLBuffer | null;
}

/**
 * Data object controlling the comparison layer visibility.
 * @property offsetX - Horizontal offset (0-1), where the overlay becomes visible
 * @property offsetY - Vertical offset (0-1), where the overlay becomes visible
 */
export type ComparisonLayerData = {
  offsetX: number;
  offsetY: number;
};

/**
 * A custom Mapbox GL JS layer for comparing raster tile sources.
 *
 * This layer overlays a secondary raster source on top of the base map,
 * using WebGL shaders for efficient rendering. The visible area can be
 * controlled via offsetX and offsetY properties.
 *
 * @example
 * ```typescript
 * const layer = new ComparisonLayer(
 *   "comparison-layer",
 *   "overlay-source",
 *   { type: "raster", tiles: ["https://example.com/{z}/{x}/{y}.png"] },
 *   { offsetX: 0.5, offsetY: 0 }
 * );
 * map.addLayer(layer);
 * ```
 */
export class ComparisonLayer implements mapboxgl.CustomLayerInterface {
  // References
  private map: mapboxgl.Map | null;
  protected gl: WebGLRenderingContext | null;
  // Mapbox members
  id: string;
  private tileSource: mapboxgl.AnySourceImpl | null;
  public readonly sourceId: string;
  type: "custom";
  private tileJson: mapboxgl.RasterSource;
  // Custom data
  private program: ComparisonLayerProgram | null;
  private sourceCache: any;
  private data: ComparisonLayerData;
  private mapWidth = 0;
  private mapHeight = 0;
  private observer: ResizeObserver | null = null;
  // Callbacks
  private onAddCallback: onAddCallback;
  private renderCallback: onRenderCallback;
  private preRenderCallback?: () => any;

  /**
   * Creates a new ComparisonLayer instance.
   *
   * @param id - Unique identifier for this layer
   * @param sourceId - Identifier for the raster source to overlay
   * @param tileJson - Mapbox RasterSource specification for the overlay tiles
   * @param data - Initial offset configuration (offsetX and offsetY, 0-1 range)
   * @param onAddCallback - Custom initialization callback (defaults to setupLayer)
   * @param renderCallback - Custom render callback (defaults to render)
   * @param preRenderCallback - Optional callback fired before each render
   */
  constructor(
    id: string,
    sourceId: string,
    tileJson: mapboxgl.RasterSource,
    data: ComparisonLayerData,
    onAddCallback: onAddCallback = setupLayer,
    renderCallback: onRenderCallback = render,
    preRenderCallback?: () => any
  ) {
    this.map = null;
    this.gl = null;
    this.id = id;
    this.sourceId = sourceId;
    this.tileSource = null;
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

    map.addSource(this.sourceId, this.tileJson);
    this.tileSource = this.map.getSource(this.sourceId);
    //@ts-ignore
    this.tileSource.on("data", this.onData.bind(this));
    //@ts-ignore
    this.sourceCache = this.map.style._sourceCaches[`other:${this.sourceId}`];

    // !IMPORTANT! hack to make mapbox mark the sourceCache as 'used' so it will initialise tiles.
    //@ts-ignore
    this.map.style._layers[this.id].source = this.sourceId;
    //@ts-ignore
    if (this.onAddCallback) {
      this.program = this.onAddCallback(map, gl, this.data);
    }

    // Update initial data
    const rect = map.getContainer().getBoundingClientRect();
    this.mapWidth = rect.width;
    this.mapHeight = rect.height;

    // Observe
    this.observer = new ResizeObserver(() => this.onResize(map));
    this.observer.observe(map.getContainer());
  }

  move() {
    this.updateTiles();
  }

  zoom() {}

  private onResize(map: mapboxgl.Map) {
    const rect = map.getContainer().getBoundingClientRect();
    if (rect) {
      this.mapWidth = rect.width;
      this.mapHeight = rect.height;
      this.map?.triggerRepaint();
    }
  }

  onData(e: any) {
    if (e.sourceDataType === "content") this.updateTiles();
  }

  updateTiles() {
    //@ts-ignore
    this.sourceCache.update(this.map.painter.transform);
  }

  /**
   * Updates the comparison offset data and triggers a map repaint.
   * @param data - New offset values (offsetX and offsetY, 0-1 range)
   */
  updateData(data: ComparisonLayerData) {
    this.data = data;
    this.map?.triggerRepaint();
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
        this.data,
        this.mapWidth,
        this.mapHeight
      );
  }

  /**
   * Cleans up resources when the layer is removed from the map.
   * Removes event listeners, disconnects the ResizeObserver, and cleans up WebGL resources.
   */
  onRemove() {
    if (this.map) {
      this.map.off("move", this.move.bind(this));
      this.map.off("zoom", this.zoom.bind(this));

      if (this.tileSource) {
        //@ts-ignore
        this.tileSource.off("data", this.onData.bind(this));
      }

      if (this.map.getSource(this.sourceId)) {
        this.map.removeSource(this.sourceId);
      }
    }

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.gl && this.program) {
      if (this.program.vertexBuffer) {
        this.gl.deleteBuffer(this.program.vertexBuffer);
      }
      this.gl.deleteProgram(this.program);
      this.program = null;
    }

    this.map = null;
    this.gl = null;
    this.tileSource = null;
    this.sourceCache = null;
  }
}

/**
 * Sets up the WebGL program with vertex and fragment shaders.
 * Creates and configures the shader program used for rendering tiles.
 *
 * @param _ - Mapbox map instance (unused)
 * @param gl - WebGL rendering context
 * @param data - Initial offset data for shader uniforms
 * @returns Configured ComparisonLayerProgram with cached locations
 * @throws Error if shader creation or program linking fails
 */
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

  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(vertexShader);
    gl.deleteShader(vertexShader);
    throw new Error(`[shader] vertex shader compilation failed: ${info}`);
  }

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!fragmentShader) {
    gl.deleteShader(vertexShader);
    throw new Error("[shader] failed to create fragment shader");
  }
  gl.shaderSource(fragmentShader, fragmentSource);
  gl.compileShader(fragmentShader);

  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(fragmentShader);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`[shader] fragment shader compilation failed: ${info}`);
  }

  const program = gl.createProgram() as ComparisonLayerProgram | null;
  if (!program) {
    throw new Error("[program] failed to create program");
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`[program] shader program linking failed: ${info}`);
  }

  gl.validateProgram(program);

  program.aPos = gl.getAttribLocation(program, "aPos");
  program.uMatrix = gl.getUniformLocation(program, "uMatrix");
  program.uTexture = gl.getUniformLocation(program, "uTexture");
  program.uOffsetX = gl.getUniformLocation(program, "uOffsetX");
  program.uOffsetY = gl.getUniformLocation(program, "uOffsetY");
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
  gl.uniform1f(program.uOffsetX, data.offsetX);
  gl.uniform1f(program.uOffsetY, data.offsetY);
  gl.uniform1f(program.uDevicePixelRatio, window.devicePixelRatio);

  return program;
}

/**
 * Renders visible tiles using the WebGL program.
 * Binds textures and draws triangles for each tile within the offset bounds.
 *
 * @param gl - WebGL rendering context
 * @param _ - Transformation matrix (unused)
 * @param tiles - Array of visible tiles to render
 * @param program - Compiled WebGL program with cached locations
 * @param data - Current offset data controlling visibility bounds
 * @param width - Map container width in pixels
 * @param height - Map container height in pixels
 */
export function render(
  gl: WebGLRenderingContext,
  _: number[],
  tiles: any[],
  program: ComparisonLayerProgram,
  data: ComparisonLayerData,
  width: number,
  height: number
) {
  gl.useProgram(program);
  gl.uniform1f(program.uOffsetX, data.offsetX * width);
  gl.uniform1f(program.uOffsetY, data.offsetY * height);
  gl.uniform1f(program.uDevicePixelRatio, window.devicePixelRatio);
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
