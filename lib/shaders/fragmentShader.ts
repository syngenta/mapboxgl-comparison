export default `
    precision mediump float;
    varying vec2 vTexCoord;
    varying float vOffset;
    uniform sampler2D uTexture;
    uniform float uDevicePixelRatio;

    void main() {
        vec2 canvasCoord = gl_FragCoord.xy;
        vec4 color = texture2D(uTexture, vTexCoord);

        canvasCoord.x = canvasCoord.x / uDevicePixelRatio;

        if (canvasCoord.x > vOffset) {
            discard;
        }

        gl_FragColor = vec4(color.rgb, color.a);
    }
`;
