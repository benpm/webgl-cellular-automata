/** Fragment shader that simply displays a texture */

precision mediump float;

varying vec2 vTextureCoord;     // Texture coordinates 0.0 to 1.0
uniform sampler2D uSampler;     // Texture to display

int bsample(vec2 pos) {
    ivec4 val = ivec4(floor(texture2D(uSampler, pos) * 255.0 + 0.5));
    return val.a * 16777216 + val.b * 65536 + val.g * 256 + val.r;
}

float t(float i) {
    return -pow((2.0 * i - 1.0), 2.0) + 1.0;
}

// Returns binomial coefficient (n choose k) from precompute texture
int binomial(int n, int k) {
    ivec4 val = ivec4(floor(texture2D(uSampler, vec2(
        (float(n) + 0.5) / 32.0,
        (float(k) + 0.5) / 32.0
    )) * 255.0 + 0.5));
    return val.a * 16777216 + val.b * 65536 + val.g * 256 + val.r;
}

void main(void) {
    ivec2 p = ivec2(floor(vTextureCoord * 32.0));
    float b = float(binomial(p.x, p.y));
    vec3 color = vec3(
        t(b / 10.0), 
        t(log(b) / 10.0), 
        t(log(b) / 25.0));
    gl_FragColor = vec4(color, 1.0);
}