precision highp float;
attribute vec3 aSpawn;
attribute vec3 aVelocity;
attribute float aKind;
attribute float aCoast;
attribute float aSize;
attribute float aSeed;
uniform float uTime;
uniform float uIntro;
uniform float uDisperse;
uniform float uSwirl;
uniform float uPointScale;
uniform vec3 uField;
uniform float uFieldStrength;
uniform float uFieldRadius;
varying float vKind;
varying float vCoast;
varying float vGlow;
varying float vFacing;
varying float vSeed;
varying vec3 vViewNormal;

void main() {
  vec3 base = position;
  float arrival = smoothstep(0.0, 1.0, clamp(uIntro * 1.28 - aSeed * 0.28, 0.0, 1.0));
  vec3 p = mix(aSpawn, base, arrival);
  float burst = 1.0 - pow(1.0 - uDisperse, 3.0);
  p += aVelocity * burst * arrival;
  float s = uSwirl * (0.5 + aSeed) * (1.0 - uDisperse);
  float c = cos(s), sn = sin(s);
  p.xz = mat2(c, -sn, sn, c) * p.xz;
  p += normalize(base) * sin(uTime * 1.9 + aSeed * 20.0) * 0.006 * arrival;

  float distanceToField = distance(p, uField);
  float influence = 1.0 - smoothstep(0.0, uFieldRadius, distanceToField);
  influence *= uFieldStrength * arrival * (1.0 - 0.55 * uDisperse);
  p += (uField - p) * influence * 0.35;
  p += vec3(sin(uTime * 3.0 + aSeed * 31.0), cos(uTime * 2.2 + aSeed * 22.0), 0.0) * influence * 0.045;

  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  vViewNormal = normalize(mat3(modelViewMatrix) * normalize(base));
  float facing = dot(vViewNormal, normalize(-view.xyz));
  float nearSide = smoothstep(-0.15, 0.82, facing);
  float sizeVariation = mix(0.82, 1.16, fract(aSeed * 17.37));
  gl_PointSize = clamp(uPointScale * mix(0.76, 1.10, nearSide) * sizeVariation * aSize * (7.5 / max(1.0, -view.z)), 0.8, 8.0);
  vKind = aKind;
  vCoast = aCoast;
  vFacing = facing;
  vSeed = aSeed;
  // Keep surface texture stable. Motion should come from the globe, not flicker.
  vGlow = arrival;
}
