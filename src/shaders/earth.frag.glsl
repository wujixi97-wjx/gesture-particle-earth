precision highp float;
varying float vKind;
varying float vCoast;
varying float vGlow;
varying float vFacing;
varying float vSeed;
varying vec3 vViewNormal;
uniform float uFlash;
uniform float uLandAlpha;
uniform float uOceanAlpha;
uniform float uLandBrightness;
uniform float uOceanBrightness;
uniform float uCoastBrightness;
uniform float uSideLight;
uniform float uBackLight;
uniform vec3 uSunDirection;
uniform float uTwilight;
uniform float uNightLight;
uniform float uDayLight;

void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.08, 0.46, r);
  float pin = 1.0 - smoothstep(0.00, 0.20, r);
  float halo = 1.0 - smoothstep(0.18, 1.0, r);

  // Most land particles sit in a restrained middle range. A stable seed creates
  // sparse highlights and shadows without frame-to-frame sparkle.
  float landDetail = mix(0.84, 1.04, smoothstep(0.08, 0.92, vSeed));
  float oceanDetail = mix(0.68, 0.92, smoothstep(0.12, 0.88, vSeed));
  float coastBoost = 1.0 + (uCoastBrightness - 1.0) * vCoast;
  vec3 land = mix(vec3(0.055, 0.12, 0.14), vec3(0.46, 0.72, 0.75), core);
  land *= landDetail * coastBoost * uLandBrightness;
  vec3 ocean = mix(vec3(0.018, 0.024, 0.028), vec3(0.13, 0.18, 0.20), core) * oceanDetail * uOceanBrightness;

  float backToSide = smoothstep(-0.55, 0.0, vFacing);
  float sideToFront = smoothstep(0.0, 0.82, max(vFacing, 0.0));
  float faceLight = mix(uBackLight, uSideLight, backToSide);
  faceLight = mix(faceLight, 0.98, sideToFront);
  float restrainedRim = (1.0 - smoothstep(0.0, 0.38, abs(vFacing))) * 0.035;
  faceLight += restrainedRim;

  // A fixed, off-axis key light gives the point cloud readable spherical volume.
  float daylight = smoothstep(-uTwilight, uTwilight, dot(normalize(vViewNormal), uSunDirection));
  float volumeLight = mix(uNightLight, uDayLight, daylight);

  vec3 color = mix(ocean, land, vKind) * faceLight * volumeLight;
  color += mix(vec3(0.012, 0.018, 0.020), vec3(0.08, 0.13, 0.14), vKind) * pin * volumeLight;
  color += vec3(0.06, 0.18, 0.24) * uFlash;
  float surfaceAlpha = mix(uOceanAlpha, uLandAlpha, vKind) * mix(1.0, coastBoost, vKind);
  float alpha = (core * 0.90 + pin * 0.08 + halo * 0.035) * vGlow * surfaceAlpha * faceLight;
  if (alpha < 0.012) discard;
  gl_FragColor = vec4(color, alpha);
}
