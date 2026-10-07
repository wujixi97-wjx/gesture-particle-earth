precision highp float;
varying vec3 vNormal;
varying vec3 vView;
uniform float uTime;
uniform float uFlash;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 4.2);
  float pulse = 0.88 + 0.08 * sin(uTime * 0.9);
  vec3 color = vec3(0.055, 0.10, 0.115) + uFlash * vec3(0.08, 0.12, 0.12);
  gl_FragColor = vec4(color, rim * (0.065 * pulse + 0.10 * uFlash));
}
