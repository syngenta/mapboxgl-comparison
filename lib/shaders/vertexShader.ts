export default `
    attribute vec2 aPos;
    uniform mat4 uMatrix;
    varying vec2 vTexCoord;

    float Extent = 8192.0;

    void main() {
        gl_Position = uMatrix * vec4(aPos * Extent, 0, 1);
        vTexCoord = aPos;
    }
`;
