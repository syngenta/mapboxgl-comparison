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
  uClipX: WebGLUniformLocation | null;
  uClipY: WebGLUniformLocation | null;
  uOpacity: WebGLUniformLocation | null;
  vertexBuffer: WebGLBuffer | null;
}

/**
 * Data object controlling the comparison layer visibility.
 * @property offsetX - Horizontal offset (0-1); the overlay is visible left of it
 * @property offsetY - Vertical offset (0-1); the overlay is visible above it
 * @property opacity - Overlay opacity (0-1, default 1)
 */
export type ComparisonLayerData = {
  offsetX: number;
  offsetY: number;
  opacity?: number;
};

/**
 * A custom Mapbox GL JS layer for comparing raster tile sources.
 *
 * This layer overlays a secondary raster source on top of the base map,
 * using WebGL shaders for efficient rendering. The visible area can be
 * controlled via offsetX and offsetY properties.
 *
 * Two source modes:
 * - **Owned source** (pass `tileJson`): the layer adds the raster source
 *   itself and keeps its tile cache updated on map movement.
 * - **External source** (pass `null` for `tileJson`): the layer only renders
 *   an existing raster source. The host app owns the source lifecycle — add
 *   the source plus a regular raster layer with `'raster-opacity': 0` so
 *   mapbox marks the source as used and loads/updates tiles through its
 *   normal pipeline. This mode survives style swaps as long as the host
 *   re-adds the source and this layer.
 *
 * @example
 * ```typescript
 * // Owned source
 * const layer = new ComparisonLayer(
 *   "comparison-layer",
 *   "overlay-source",
 *   { type: "raster", tiles: ["https://example.com/{z}/{x}/{y}.png"] },
 *   { offsetX: 0.5, offsetY: 0 }
 * );
 * map.addLayer(layer);
 *
 * // External source (host owns "overlay-source")
 * const layer = new ComparisonLayer(
 *   "comparison-layer",
 *   "overlay-source",
 *   null,
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
  private tileJson: mapboxgl.RasterSource | null;
  // Custom data
  private program: ComparisonLayerProgram | null;
  private sourceCache: any;
  private data: ComparisonLayerData;
  private mapWidth = 0;
  private mapHeight = 0;
  private observer: ResizeObserver | null = null;
  // Bound handlers kept so onRemove detaches the same references.
  private boundMove: (() => void) | null = null;
  private boundOnData: ((e: any) => void) | null = null;
  // Callbacks
  private onAddCallback: onAddCallback;
  private renderCallback: onRenderCallback;
  private preRenderCallback?: () => any;

  /**
   * Creates a new ComparisonLayer instance.
   *
   * @param id - Unique identifier for this layer
   * @param sourceId - Identifier for the raster source to overlay
   * @param tileJson - Mapbox RasterSource specification for the overlay
   *   tiles, or `null` to render an existing source owned by the host app
   * @param data - Initial offset configuration (offsetX and offsetY, 0-1 range)
   * @param onAddCallback - Custom initialization callback (defaults to setupLayer)
   * @param renderCallback - Custom render callback (defaults to render)
   * @param preRenderCallback - Optional callback fired before each render
   */
  constructor(
    id: string,
    sourceId: string,
    tileJson: mapboxgl.RasterSource | null,
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

    if (this.tileJson) {
      // Owned-source mode: create the source and keep its cache updated.
      this.boundMove = this.move.bind(this);
      map.on("move", this.boundMove);

      map.addSource(this.sourceId, this.tileJson);
      this.tileSource = this.map.getSource(this.sourceId);
      this.boundOnData = this.onData.bind(this);
      //@ts-ignore
      this.tileSource.on("data", this.boundOnData);
      this.sourceCache = this.resolveSourceCache();

      // !IMPORTANT! hack to make mapbox mark the sourceCache as 'used' so it will initialise tiles.
      //@ts-ignore
      this.map.style._layers[this.id].source = this.sourceId;
    } else {
      // External-source mode: the host app owns the source (and keeps it
      // used via a regular raster layer), we only render from its cache.
      // The source may not exist yet — render() re-resolves lazily.
      this.sourceCache = this.resolveSourceCache();
    }

    if (this.onAddCallback) {
      this.program = this.onAddCallback(map, gl, this.data);
    }

    // Track container size for custom render callbacks.
    const rect = map.getContainer().getBoundingClientRect();
    this.mapWidth = rect.width;
    this.mapHeight = rect.height;

    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.onResize(map));
      this.observer.observe(map.getContainer());
    }
  }

  move() {
    this.updateTiles();
  }

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
    this.sourceCache?.update(this.map?.painter?.transform);
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
    if (!this.preRenderCallback) return;
    const tiles = this.visibleTiles();
    if (!tiles) return;
    //@ts-ignore
    this.preRenderCallback(gl, matrix, tiles);
  }

  render(gl: WebGLRenderingContext, matrix: number[]) {
    if (!this.renderCallback || !this.program) return;
    const tiles = this.visibleTiles();
    if (!tiles) return;
    this.renderCallback(
      gl,
      matrix,
      tiles,
      this.program,
      this.data,
      this.mapWidth,
      this.mapHeight
    );
  }

  /**
   * Cleans up resources when the layer is removed from the map.
   * Removes event listeners, disconnects the ResizeObserver, and cleans up WebGL resources.
   * In external-source mode the source is left untouched — the host app owns it.
   */
  onRemove() {
    if (this.map) {
      if (this.boundMove) {
        this.map.off("move", this.boundMove);
        this.boundMove = null;
      }

      if (this.tileSource && this.boundOnData) {
        //@ts-ignore
        this.tileSource.off("data", this.boundOnData);
        this.boundOnData = null;
      }

      if (this.tileJson && this.map.getSource(this.sourceId)) {
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

  /**
   * Resolves the mapbox source cache for `sourceId`.
   * Uses `getOwnSourceCache` where available, with a fallback to the private
   * `_sourceCaches` map. Both are mapbox internals — re-verify on upgrades.
   */
  private resolveSourceCache(): any {
    //@ts-ignore
    const style: any = this.map?.style;
    if (!style) return null;
    return (
      style.getOwnSourceCache?.(this.sourceId) ??
      style._sourceCaches?.[`other:${this.sourceId}`] ??
      null
    );
  }

  /**
   * Returns the visible tiles to draw, or null when rendering should be
   * skipped (no cache yet, fully hidden, or true-globe projection where
   * `tileID.projMatrix` is not a mercator matrix).
   */
  private visibleTiles(): any[] | null {
    if (this.data.offsetX <= 0 || this.data.offsetY >= 1) return null;

    // In globe projection the mercator tile matrices would misproject the
    // quads. Above the globe-to-mercator transition zoom, mapbox reports the
    // transform's projection as mercator again, so this only skips true globe.
    //@ts-ignore
    const projectionName = this.map?.transform?.projection?.name;
    if (projectionName === "globe") return null;

    if (!this.sourceCache) this.sourceCache = this.resolveSourceCache();
    if (!this.sourceCache) return null;

    return this.sourceCache
      .getVisibleCoordinates()
      .map((tileid: any) => this.sourceCache.getTile(tileid));
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
  program.uClipX = gl.getUniformLocation(program, "uClipX");
  program.uClipY = gl.getUniformLocation(program, "uClipY");
  program.uOpacity = gl.getUniformLocation(program, "uOpacity");

  const vertexArray = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);

  program.vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, program.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertexArray, gl.STATIC_DRAW);

  // Initialize data
  gl.useProgram(program);
  gl.uniform1f(program.uClipX, data.offsetX * gl.drawingBufferWidth);
  gl.uniform1f(program.uClipY, data.offsetY * gl.drawingBufferHeight);
  gl.uniform1f(program.uOpacity, data.opacity ?? 1);

  return program;
}

/**
 * Renders visible tiles using the WebGL program.
 * Binds textures and draws triangles for each tile within the offset bounds.
 *
 * Clip bounds are computed in device pixels (`gl.drawingBufferWidth/Height`)
 * so the comparison edge matches `gl_FragCoord` exactly on any DPR. Blending
 * uses premultiplied-alpha factors, matching how mapbox uploads raster tile
 * textures, so transparent tile padding composites correctly.
 *
 * @param gl - WebGL rendering context
 * @param _ - Transformation matrix (unused)
 * @param tiles - Array of visible tiles to render
 * @param program - Compiled WebGL program with cached locations
 * @param data - Current offset data controlling visibility bounds
 * @param _width - Map container width in CSS pixels (unused)
 * @param _height - Map container height in CSS pixels (unused)
 */
export function render(
  gl: WebGLRenderingContext,
  _: number[],
  tiles: any[],
  program: ComparisonLayerProgram,
  data: ComparisonLayerData,
  _width: number,
  _height: number
) {
  gl.useProgram(program);
  gl.uniform1f(program.uClipX, data.offsetX * gl.drawingBufferWidth);
  gl.uniform1f(program.uClipY, data.offsetY * gl.drawingBufferHeight);
  gl.uniform1f(program.uOpacity, data.opacity ?? 1);

  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(
    gl.ONE,
    gl.ONE_MINUS_SRC_ALPHA,
    gl.ONE,
    gl.ONE_MINUS_SRC_ALPHA
  );

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
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  });
}
