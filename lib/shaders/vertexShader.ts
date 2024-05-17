export default `
    attribute vec2 aPos;
    uniform mat4 uMatrix;
    uniform float uOffsetX;
    uniform float uOffsetY;
    varying vec2 vTexCoord;

    varying float vOffsetX;
    varying float vOffsetY;

    float Extent = 8192.0;

    void main() {
        vec4 a = uMatrix * vec4(aPos * Extent, 0, 1);
        gl_Position = vec4(a.rgba);
        vTexCoord = aPos;
        vOffsetX = uOffsetX;
        vOffsetY = uOffsetY;
    }
`;
