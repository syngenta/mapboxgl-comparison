export default `
    precision mediump float;
    varying vec2 vTexCoord;
    uniform sampler2D uTexture;
    // Clip bounds in device pixels (same space as gl_FragCoord), so the
    // comparison edge is exact on any devicePixelRatio.
    uniform float uClipX;
    uniform float uClipY;
    uniform float uOpacity;

    void main() {
        if (gl_FragCoord.x > uClipX || gl_FragCoord.y < uClipY) {
            discard;
        }

        vec4 color = texture2D(uTexture, vTexCoord);

        // Fully transparent texels (e.g. the padding around bounded raster
        // tiles) must not write color or depth.
        if (color.a == 0.0) {
            discard;
        }

        // Mapbox raster tile textures are premultiplied, so opacity scales
        // all four channels.
        gl_FragColor = color * uOpacity;
    }
`;
