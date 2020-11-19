/** Fragment shader that maps cellular automata states to nice colors */

precision mediump float;

varying vec2 vTextureCoord;     // Texture coordinates 0.0 to 1.0
uniform sampler2D uSampler;     // Input states texture
uniform sampler2D uColorMap;    // Colors to be used for states

void main(void) {
    float state = floor(texture2D(uSampler, vTextureCoord).r * 255.0 + 0.5);
    gl_FragColor = texture2D(uColorMap, vec2((state + 0.5) / 14.0, 0.5));
}