export const MAX_BANDS = 8;

export const VERTEX_SHADER = `attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

export const FRAGMENT_SHADER = `precision highp float;
#define MAX_BANDS 8
#define TAU 6.2831853
#define HALF_PI 1.5707963
#define CLIP_FADE 24.0

uniform vec2 u_px;
uniform vec2 u_size;
uniform vec2 u_center;
uniform vec2 u_half;
uniform float u_radius;
uniform float u_pradius;
uniform float u_inner;
uniform float u_time;
uniform float u_count;
uniform vec4 u_band[MAX_BANDS];
uniform vec4 u_band2[MAX_BANDS];
uniform vec3 u_colors[MAX_BANDS];
uniform float u_mix;
uniform float u_height;
uniform float u_line;
uniform float u_gap;
uniform float u_glow;
uniform float u_gain;
uniform vec3 u_emph;
uniform float u_vis;
uniform float u_orbit;
uniform float u_lightMode;
uniform float u_layout;
uniform float u_specCenter;
uniform float u_span;
uniform float u_dir;
uniform float u_pxSize;
uniform float u_aura;
uniform vec4 u_clip;
uniform float u_additive;

vec2 bump(float x, float centre, float sigma, float level, float ripples, float phase) {
  float z = (x - centre) / sigma;
  float g = exp(-z * z);
  float rp = TAU * ripples * x + phase;
  float rip = 1.0 + 0.16 * sin(rp);
  float amp = u_height * level;
  return vec2(amp * g * rip, amp * g * ((-2.0 * z / sigma) * rip + 0.16 * TAU * ripples * cos(rp)));
}

vec2 flow(float cycles, float t, float phase, float i) {
  float pa = TAU * cycles * t + phase;
  float c2 = floor(cycles * 0.5) + 1.0;
  float pb = TAU * c2 * t - phase * 0.61 + i * 2.3;
  float a = 0.5 + 0.5 * sin(pa);
  float b = 0.62 + 0.38 * sin(pb);
  return vec2(a * b, 0.5 * TAU * cycles * cos(pa) * b + a * 0.38 * TAU * c2 * cos(pb));
}

void main() {
  vec2 px = vec2(gl_FragCoord.x / u_px.x, 1.0 - gl_FragCoord.y / u_px.y) * u_size;
  vec2 p = px - u_center;
  p.y = -p.y;
  vec2 a = abs(p);

  vec2 q = a - u_half + u_radius;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_radius;
  float d = mix(sd, -sd, u_inner);
  float reach = u_gap + u_line + u_height * 1.3 + u_glow * 4.0 + 2.0;
  if (d < -1.5 || d > reach) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float r = u_pradius;
  vec2 c = max(u_half - r, 0.0);
  vec2 k = a - c;
  float quarter = c.x + HALF_PI * r + c.y;
  float sq;
  float ny;
  if (k.x > 0.0 && k.y > 0.0) {
    float th = atan(k.y, k.x);
    sq = c.x + r * (HALF_PI - th);
    ny = sin(th);
  } else if (k.y >= k.x) {
    sq = min(a.x, c.x);
    ny = 1.0;
  } else {
    sq = c.x + HALF_PI * r + c.y - min(a.y, c.y);
    ny = 0.0;
  }
  float s;
  if (p.y >= 0.0) {
    s = p.x >= 0.0 ? sq : 4.0 * quarter - sq;
  } else {
    s = p.x >= 0.0 ? 2.0 * quarter - sq : 2.0 * quarter + sq;
    ny = -ny;
  }
  float perim = 4.0 * quarter;
  float t = s / perim;

  float up = smoothstep(0.0, 1.0, max(ny, 0.0));
  float down = smoothstep(0.0, 1.0, max(-ny, 0.0));
  float emph = u_emph.y + (u_emph.x - u_emph.y) * up + (u_emph.z - u_emph.y) * down;

  float rel = fract(t - u_specCenter + 0.5) - 0.5;
  float u = rel / u_span;
  float x = u_layout < 0.5 ? abs(u) : 0.5 + 0.5 * u * u_dir;
  float dxds = (u_layout < 0.5 ? sign(u) : 0.5 * u_dir) / (u_span * perim);
  float spread = 1.0 - smoothstep(0.96, 1.06, abs(u));
  float spacing = 0.92 / u_count;
  float sigma = spacing * 0.72;

  float head = fract(u_time * 0.14);
  float cw = max(36.0, perim * 0.028);
  float halfLine = u_line * 0.5;
  vec3 sum = vec3(0.0);
  vec3 tint = vec3(0.0);
  float tintWeight = 0.0;
  float clear = 1.0;
  for (int i = 0; i < MAX_BANDS; i++) {
    if (float(i) >= u_count) break;
    float fi = float(i);
    vec4 band = u_band[i];
    float h;
    float slope;
    if (u_layout < 1.5) {
      float centre = (fi + 0.5) * spacing;
      float ripples = 1.0 + fi * 0.7;
      vec2 b = bump(x, centre, sigma, band.x, ripples, band.y);
      if (u_layout < 0.5) {
        vec4 other = u_band2[i];
        float jitter = spacing * 0.22 * sin(fi * 2.61 + 1.3);
        vec2 left = bump(x, centre + jitter, sigma * 0.86, other.x, ripples * 1.27, other.y);
        b = mix(left, b, smoothstep(-0.14, 0.14, u));
      }
      h = b.x * spread;
      slope = b.y * spread * dxds;
    } else {
      vec2 w = flow(band.z, t, band.y, fi);
      if (u_mix < 1.0) w = mix(flow(band.w, t, band.y, fi), w, u_mix);
      float amp = u_height * band.x * emph;
      h = amp * w.x;
      slope = amp * w.y / perim;
    }

    if (u_orbit > 0.001) {
      float lag = fi * cw * 0.45 / perim;
      float d1 = abs(fract(t - head + lag + 0.5) - 0.5) * perim;
      float d2 = abs(fract(t - head + lag) - 0.5) * perim;
      float comet = exp(-d1 * d1 / (cw * cw)) + exp(-d2 * d2 / (cw * cw));
      h += u_height * 0.4 * u_orbit * comet;
    }

    float lineAt = u_gap + halfLine + h;
    float dist = abs(d - lineAt) / sqrt(1.0 + slope * slope);
    float core = clamp((halfLine - dist) / u_pxSize + 0.5, 0.0, 1.0);
    float neon = 0.1 * exp(-max(dist - halfLine, 0.0) / 2.5);

    float lift = clamp(h / 5.0, 0.0, 1.0);
    float under = clamp((d - u_gap) / (h + halfLine + 0.001), 0.0, 1.0);
    float fill = d < lineAt ? pow(under, 1.5) * lift * 0.5 : 0.0;
    float spill = max(d - lineAt, 0.0) / u_glow;
    float halo = exp(-spill * (1.0 + 0.35 * spill));
    float bloom = (1.0 - u_lightMode) * 0.1 * halo + 0.28 * lift * exp(-spill);
    float aura = (fill + bloom) * u_aura;

    float amount = core + neon + aura;
    sum += u_colors[i] * amount;
    tint += u_colors[i] * amount * amount;
    tintWeight += amount * amount;
    clear *= 1.0 - clamp(core + neon * 0.3 + aura * mix(0.6, 1.1, u_lightMode), 0.0, 1.0);
  }

  float fade = exp(-max(d - u_gap, 0.0) / (u_height * 1.8 + u_glow * 3.0 + 16.0));
  float edge = 1.0 - smoothstep(reach * 0.5, reach, d);
  vec2 clipped = smoothstep(u_clip.xy, u_clip.xy + CLIP_FADE, px) * (1.0 - smoothstep(u_clip.zw - CLIP_FADE, u_clip.zw, px));
  float m = u_vis * fade * edge * clipped.x * clipped.y * smoothstep(-1.0, 0.0, d) * (0.3 + 0.7 * emph);
  if (u_lightMode < 0.5) {
    vec3 col = pow(min(sum * u_gain * m, vec3(1.0)), vec3(0.4545));
    gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)) * (1.0 - u_additive));
  } else {
    vec3 col = pow(tint / max(tintWeight, 1e-8), vec3(0.4545));
    float alpha = clamp((1.0 - clear) * u_gain, 0.0, 1.0) * m;
    gl_FragColor = vec4(col * alpha, alpha);
  }
}`;

// A separable Gaussian over premultiplied colour; a sigma of zero copies.
export const BLUR_FRAGMENT_SHADER = `precision mediump float;
#define MAX_TAPS 12

uniform sampler2D u_tex;
uniform vec2 u_out;
uniform vec2 u_step;
uniform float u_sigma;

void main() {
  vec2 uv = gl_FragCoord.xy / u_out;
  if (u_sigma < 0.01) {
    gl_FragColor = texture2D(u_tex, uv);
    return;
  }
  float reach = ceil(u_sigma * 3.0);
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -MAX_TAPS; i <= MAX_TAPS; i++) {
    float x = float(i);
    if (abs(x) > reach) continue;
    float w = exp(-0.5 * x * x / (u_sigma * u_sigma));
    sum += texture2D(u_tex, uv + u_step * x) * w;
    total += w;
  }
  gl_FragColor = sum / total;
}`;
