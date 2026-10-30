// Pixel globe renderer: a low-res sphere sampled from lat/lon textures, scaled up crisply.
// The buffer is wider than the globe's frame on screen (VIEW of RES pixels), leaving room around
// the planet for its ring, moon and satellites.

const VIEW = 112; // buffer pixels that map onto the globe's frame on screen
const RES = 160; // buffer pixels across, including the space around the frame
const R = 48; // planet radius in buffer pixels
// (a Globe can also be made smaller, for the month planets in the sky view: new Globe(canvas, { res, r }))
const TW = 256, TH = 128; // texture size (lon x lat)

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

const DESERT = ['#24182f', '#3a2640', '#553650', '#734c60', '#936774', '#b38483', '#cfa594', '#e6c4aa'];
const SEA = ['#0f1a3a', '#152a55', '#1d3f73', '#2b5b94', '#3f7fb3'];
const GREEN = ['#12301f', '#1c4a2a', '#2c6b37', '#46914a', '#78b85c'];
const GRASS = ['#2c4220', '#45602a', '#647f36', '#88a045', '#adc060']; // grasslands, from Biomes Spread
const FOREST = ['#0a1f13', '#10301c', '#174226', '#205633', '#2d6e3f']; // from Forests Rise
const ICE = ['#5a6488', '#9aa3c2', '#c7cfe6', '#eef1fb'];
const NIGHT = ['#0d0819', '#150f26', '#1b1330'];
const RING = ['#6f6478', '#a3947f', '#cbbca0', '#e9dec6'];
const MOON = ['#2a2438', '#4c4560', '#7a7290', '#aaa2bf', '#d8d2e6'];

function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
const P = (arr) => arr.map(hex);
const pDesert = P(DESERT), pSea = P(SEA), pGreen = P(GREEN), pGrass = P(GRASS), pForest = P(FOREST);
const pIce = P(ICE), pNight = P(NIGHT), pRing = P(RING), pMoon = P(MOON);
const DUST = hex('#e8c7a8'), DUST2 = hex('#c9a088'), CLOUD = hex('#e8e0ff'), CLOUD2 = hex('#b8acd8');
const LIGHT = hex('#ffd27a'), LIGHT2 = hex('#ffefc0');
const ROT = hex('#5b3a2e'), ROT2 = hex('#7a4a33'); // withered land during a plague
const RIVER = hex('#3f7fb3'), RIVER2 = hex('#2b5b94');
const CITY = hex('#8d879c'), CITY2 = hex('#b4aec2'); // cities seen by day
const HERD = hex('#efe2c0'), HERD2 = hex('#b9a47e'); // light specks on the green, like grazing herds
const SHIP = hex('#f2f6ff'), PLANE = hex('#ffffff'), BLINK = hex('#ff5a5a');
const SAT = hex('#c9d2e6'), PANEL = hex('#5a7fd0');
const FLAME = [hex('#ffffff'), hex('#fff1b0'), hex('#ffc060'), hex('#ff8040'), hex('#b04a3a')];
const BLIGHT = hex('#ff3d6e');

function hash(x, y, s) {
  let h = x * 374761393 + y * 668265263 + s * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(w, h, cell, seed) {
  const out = new Float32Array(w * h);
  const cw = Math.ceil(w / cell), ch = Math.ceil(h / cell) + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / cell, gy = y / cell;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = gx - x0, fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = hash(x0 % cw, y0, seed), b = hash((x0 + 1) % cw, y0, seed);
      const c = hash(x0 % cw, Math.min(y0 + 1, ch), seed), d = hash((x0 + 1) % cw, Math.min(y0 + 1, ch), seed);
      out[y * w + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

function fbm(w, h, seed, cells, weights) {
  const out = new Float32Array(w * h);
  let tw = 0;
  cells.forEach((c, i) => {
    const n = valueNoise(w, h, c, seed + i * 17);
    for (let k = 0; k < out.length; k++) out[k] += n[k] * weights[i];
    tw += weights[i];
  });
  for (let k = 0; k < out.length; k++) out[k] /= tw;
  return out;
}

const CRATERS = [
  { lon: 5.2, lat: -0.15, r: 0.42 }, // great basin, becomes the first sea
  { lon: 1.1, lat: 0.2, r: 0.2 },
  { lon: 3.0, lat: -0.55, r: 0.16 },
  { lon: 2.2, lat: 0.6, r: 0.12 },
  { lon: 4.0, lat: 0.35, r: 0.1 },
  { lon: 0.3, lat: -0.35, r: 0.13 },
];

// Fixed starting points for moving things (herds, ships, planes), so they're the same every visit.
const seeds = (n, s) => Array.from({ length: n }, (_, i) => ({ a: hash(i, 1, s), b: hash(i, 2, s), c: hash(i, 3, s) }));
const HERDS = seeds(14, 11), SHIPS = seeds(16, 23), PLANES = seeds(12, 37), SATS = seeds(5, 51);
const LAUNCH = { lat: -0.05, lon: 1.9 }; // the launch site (Reach for the Stars)
const ELEVATOR_LON = 3.6; // where the Space Elevator rises from the equator
const STATION = hex('#e6ebf5'), CABLE = hex('#b9c2d8');

// The planet's terrain is the same for every Globe, so it's built once and shared.
let TEX = null;

// blend col toward c by m (0..1)
const mix = (col, c, m) => [col[0] + (c[0] - col[0]) * m, col[1] + (c[1] - col[1]) * m, col[2] + (c[2] - col[2]) * m];
const wrapAngle = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

export class Globe {
  constructor(canvas, { res = RES, r = R } = {}) {
    this.res = res; this.r = r;
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.buf = document.createElement('canvas');
    this.buf.width = res;
    this.buf.height = res;
    this.bctx = this.buf.getContext('2d');
    this.img = this.bctx.createImageData(res, res);
    this.rot = 0;
    this.rim = hex('#4bb8c4');
    this.halo = [201, 168, 220];
    this.cloudRot = 0;
    if (TEX) Object.assign(this, TEX);
    else {
      this.height = fbm(TW, TH, 3, [32, 16, 8], [0.55, 0.3, 0.15]);
      this.clouds = fbm(TW, TH, 41, [24, 10, 5], [0.5, 0.35, 0.15]);
      this.riverTex = fbm(TW, TH, 77, [22, 9], [0.7, 0.3]);
      this.forestTex = fbm(TW, TH, 91, [12, 5], [0.7, 0.3]);
      this.applyCraters();
      this.buildSeaLevels();
      TEX = { height: this.height, clouds: this.clouds, riverTex: this.riverTex, forestTex: this.forestTex, seaLevels: this.seaLevels };
    }
    const RES = res, R = r;
    // precompute sphere geometry
    const n = RES * RES;
    this.geo = { inside: new Uint8Array(n), lonOff: new Float32Array(n), lat: new Float32Array(n), shade: new Float32Array(n), d: new Float32Array(n), nx: new Float32Array(n), ny: new Float32Array(n), ring: new Float32Array(n) };
    const c = RES / 2;
    const ca = Math.cos(-0.32), sa = Math.sin(-0.32);
    for (let y = 0; y < RES; y++) {
      for (let x = 0; x < RES; x++) {
        const i = y * RES + x;
        const nx = (x + 0.5 - c) / R, ny = (y + 0.5 - c) / R;
        const d2 = nx * nx + ny * ny;
        this.geo.d[i] = Math.sqrt(d2);
        this.geo.nx[i] = nx;
        this.geo.ny[i] = ny;
        // the ring: a tilted ellipse around the planet; its sign says front (+) or back (−)
        const u = nx * ca + ny * sa, v = (-nx * sa + ny * ca) / 0.26;
        const rr = Math.sqrt(u * u + v * v);
        this.geo.ring[i] = rr >= 1.3 && rr <= 1.62 && !(rr > 1.45 && rr < 1.49) ? (v >= 0 ? rr : -rr) : 0;
        if (d2 <= 1) {
          const z = Math.sqrt(1 - d2);
          this.geo.inside[i] = 1;
          this.geo.lat[i] = Math.asin(-ny);
          this.geo.lonOff[i] = Math.atan2(nx, z);
          this.geo.shade[i] = -0.55 * nx - 0.45 * ny + 0.72 * z;
        }
      }
    }
  }

  // Edge glow and backlight come from the UI theme; the planet keeps its own colors.
  setTheme(rim, halo) {
    if (/^#[0-9a-f]{6}$/i.test(rim)) this.rim = hex(rim);
    if (/^#[0-9a-f]{6}$/i.test(halo)) this.halo = hex(halo);
  }

  // seaLevels[i] is the height that puts i% of the planet's surface under water.
  // Water then sets how much of the surface is ocean, so the sea grows evenly instead of flooding at once.
  buildSeaLevels() {
    const pts = [];
    let total = 0;
    for (let y = 0; y < TH; y++) {
      const w = Math.cos((0.5 - (y + 0.5) / TH) * Math.PI); // texels near the poles cover less area
      for (let x = 0; x < TW; x++) pts.push([this.height[y * TW + x] - 0.5, w]);
      total += w * TW;
    }
    pts.sort((a, b) => a[0] - b[0]);
    this.seaLevels = new Float32Array(101);
    this.seaLevels[0] = pts[0][0] - 0.01; // dry: just below the lowest ground
    let acc = 0, k = 1;
    for (const [h, w] of pts) {
      acc += w;
      while (k <= 100 && acc / total >= k / 100) this.seaLevels[k++] = h;
    }
    while (k <= 100) this.seaLevels[k++] = pts[pts.length - 1][0];
  }

  seaLevelFor(coverage) {
    const x = Math.max(0, Math.min(1, coverage)) * 100, i = Math.floor(x), f = x - i;
    return i >= 100 ? this.seaLevels[100] : this.seaLevels[i] + (this.seaLevels[i + 1] - this.seaLevels[i]) * f;
  }

  applyCraters() {
    for (let y = 0; y < TH; y++) {
      const lat = (0.5 - (y + 0.5) / TH) * Math.PI;
      for (let x = 0; x < TW; x++) {
        const lon = (x + 0.5) / TW * Math.PI * 2;
        let h = this.height[y * TW + x];
        for (const cr of CRATERS) {
          let dl = Math.abs(lon - cr.lon);
          if (dl > Math.PI) dl = Math.PI * 2 - dl;
          // great-circle-ish distance
          const dd = Math.acos(Math.min(1, Math.sin(lat) * Math.sin(cr.lat) + Math.cos(lat) * Math.cos(cr.lat) * Math.cos(dl))) / cr.r;
          if (dd < 1) h -= (1 - dd * dd) * 0.35;
          else if (dd < 1.25) h += (1.25 - dd) * 0.35;
        }
        this.height[y * TW + x] = h;
      }
    }
  }

  sample(tex, lon, lat) {
    let u = (lon / (Math.PI * 2)) % 1;
    if (u < 0) u += 1;
    const v = Math.max(0, Math.min(0.9999, 0.5 - lat / Math.PI));
    return tex[Math.floor(v * TH) * TW + Math.floor(u * TW)];
  }

  // Project lat/lon to the globe frame's coords (0..1 across the frame) and visibility (z > 0 faces you).
  project(lat, lon) {
    const R = this.r;
    const rel = lon - this.rot;
    const x = Math.cos(lat) * Math.sin(rel);
    const y = -Math.sin(lat);
    const z = Math.cos(lat) * Math.cos(rel);
    const s = R / VIEW;
    return { x: 0.5 + x * s, y: 0.5 + y * s, z };
  }

  // A point on the surface in buffer pixels, with whether it faces you and how lit it is.
  surfacePx(lat, lon) {
    const RES = this.res, R = this.r;
    const rel = lon - this.rot;
    const z = Math.cos(lat) * Math.cos(rel);
    const x = Math.round(RES / 2 - 0.5 + Math.cos(lat) * Math.sin(rel) * R);
    const y = Math.round(RES / 2 - 0.5 - Math.sin(lat) * R);
    const i = y * RES + x;
    return { x, y, z, i, lit: z > 0 && this.geo.inside[i] ? this.geo.shade[i] : -1 };
  }

  put(x, y, col, a = 255) {
    const RES = this.res;
    if (x < 0 || y < 0 || x >= RES || y >= RES) return;
    const o = (y * RES + x) * 4, d = this.img.data;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = a;
  }

  render(vis, t) {
    const RES = this.res;
    const data = this.img.data;
    const g = this.geo;
    const HALO = this.halo, RIM = this.rim;
    // a cataclysm playing out (vis.cata = { type, s }, s rising 0→1 and back): ice sweeps toward the equator,
    // dust covers everything, the sea surges over the land, or green withers to brown
    const cata = vis.cata || { type: '', s: 0 };
    const cs = (type) => (cata.type === type ? cata.s : 0);
    const iceLat = 1.02 + (1 - vis.ice) * 0.5 - cs('ice') * 1.6; // caps shrink as ice melts
    // Water fills the basins from the deepest point up: dry at 0, about 55% ocean at full, leaving land for Life.
    const seaLevel = this.seaLevelFor(Math.min(0.97, vis.sea * 0.55 + cs('flood') * 0.6));
    const plague = cs('plague'), dustAll = cs('dust');
    const cloudCut = 1 - vis.clouds * 0.4; // at most about a fifth of the sky is cloud, so the surface stays readable
    const greenTop = vis.green * (vis.biomes ? 0.42 : 0.32); // how far up from the shore green reaches
    const lightCut = 0.8 - (vis.lights || 0) * 0.18;
    const blights = vis.blightAt || [];
    const glitchRow = Math.floor(t / 90);
    // storm systems (Weather Cycles): two cyclones drifting in opposite directions
    const storms = vis.weather ? [{ lon: 3.4 + t * 0.00002, lat: 0.55, spin: 1 }, { lon: 0.8 - t * 0.000015, lat: -0.6, spin: -1 }] : [];
    const dustC = { lon: 0.6, lat: 0.12 };
    for (let y = 0; y < RES; y++) {
      for (let x = 0; x < RES; x++) {
        const i = y * RES + x;
        const o = i * 4;
        const dith = BAYER[(y & 3) * 4 + (x & 3)];
        const rg = vis.goalRing ? g.ring[i] : 0;
        if (!g.inside[i]) {
          if (rg) { // the ring, front and back, where the planet doesn't hide it
            const rr = Math.abs(rg);
            const k = rr > 1.55 ? (dith > -0.2 ? 1 : -1) : rr > 1.49 ? 2 : rr > 1.38 ? 3 : 1;
            if (k >= 0) {
              const col = pRing[rg < 0 ? Math.max(0, k - 1) : k];
              data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 235;
              continue;
            }
          }
          const d = g.d[i];
          const a = d < 1.05 ? 0.16 + vis.clouds * 0.2 : d < 1.1 ? 0.06 + vis.clouds * 0.1 : 0;
          data[o] = HALO[0]; data[o + 1] = HALO[1]; data[o + 2] = HALO[2];
          data[o + 3] = a > 0 && dith > -0.3 ? Math.round(a * 255) : 0;
          continue;
        }
        let lat = g.lat[i];
        let lon = g.lonOff[i] + this.rot;
        // a blight warps its region: the ground ripples, and scan lines flicker through it
        let warp = 0;
        for (const b of blights) {
          const dl = wrapAngle(lon - b.lon), dla = lat - b.lat;
          const sd = Math.sqrt(dl * dl * Math.cos(lat) ** 2 + dla * dla);
          if (sd < 0.7) warp = Math.max(warp, 1 - sd / 0.7);
        }
        if (warp > 0) {
          lon += Math.sin(y * 0.9 + t * 0.006) * 0.07 * warp;
          lat += Math.sin(x * 0.7 + t * 0.004) * 0.03 * warp;
        }
        const shade = g.shade[i];
        const h = this.sample(this.height, lon, lat) - 0.5;
        let col;
        const lit = shade + dith * 0.18;
        const land = h >= seaLevel;
        const cityHere = vis.lights > 0 && !plague && land && h > seaLevel + 0.02 && this.sample(this.clouds, lon * 3, lat * 3) > lightCut;
        if (lit < 0.04) {
          col = pNight[lit < -0.25 ? 0 : lit < -0.08 ? 1 : 2];
          // settlements and cities light up the night side
          if (cityHere) col = this.sample(this.clouds, lon * 6, lat * 6) > 0.62 ? LIGHT2 : LIGHT;
        } else if (Math.abs(lat) > iceLat + h * 0.25 + (vis.cooling ? -0.15 : 0)) {
          col = pIce[Math.max(0, Math.min(3, Math.floor(lit * 4.4)))];
        } else if (!land) {
          const depth = (seaLevel - h) * 4;
          col = pSea[Math.max(0, Math.min(4, Math.floor(lit * 5 - depth * 1.2 + 0.5)))];
        } else if (vis.rivers > 0 && h < seaLevel + 0.4 && Math.abs(this.sample(this.riverTex, lon, lat) - 0.5) < 0.014 + vis.rivers * 0.012) {
          col = lit > 0.45 ? RIVER : RIVER2; // rivers wind down to the sea
        } else if (cityHere && lit < 0.16) {
          col = LIGHT; // lights come on at dusk
        } else if (vis.cities && cityHere && dith > -0.25) {
          col = lit > 0.5 ? CITY2 : CITY; // cities by day
        } else if (vis.green > 0 && h < seaLevel + greenTop && Math.abs(lat) < 1.1 && !(vis.wither && dith > 0)) {
          const shadeIx = Math.max(0, Math.min(4, Math.floor(lit * 5 + h * 2)));
          if (plague > dith + 0.5) col = lit > 0.4 ? ROT2 : ROT;
          else if (vis.forest > 0 && this.sample(this.forestTex, lon, lat) > 0.66 - vis.forest * 0.2) col = pForest[shadeIx];
          else if (vis.biomes && h > seaLevel + greenTop * 0.55) col = pGrass[shadeIx];
          else col = pGreen[shadeIx];
        } else if (plague > 0.3 && h < seaLevel + 0.12 && dith > 0.5 - plague) {
          col = lit > 0.4 ? ROT2 : ROT; // the shores rot too, so a plague shows even before First Green
        } else {
          const v = lit * 0.85 + 0.12 + h * 0.5;
          col = pDesert[Math.max(0, Math.min(7, Math.floor(v * 8)))];
        }
        // dust storm swirl
        if (vis.dust && lit > 0.04) {
          const dl = wrapAngle(lon - dustC.lon);
          const dla = lat - dustC.lat;
          const sd = Math.sqrt(dl * dl * Math.cos(lat) ** 2 + dla * dla);
          if (sd < 0.55) {
            const band = Math.sin(Math.atan2(dla, dl) * 2 + sd * 22 - t * 0.0006);
            if (band > 0.1 + sd) col = sd < 0.25 ? DUST : DUST2;
          }
        }
        // a dust age: storms over the whole planet, rolling with the clouds
        if (dustAll > 0 && lit > 0.04) {
          const dv = this.sample(this.clouds, lon * 1.5 - t * 0.0004, lat * 1.5);
          if (dv > 1 - dustAll * 0.85) col = dv > 1 - dustAll * 0.6 ? DUST : DUST2;
        }
        // clouds
        if (vis.clouds > 0.05 && lit > 0.04) {
          const cv = this.sample(this.clouds, lon + this.cloudRot, lat);
          // translucent: the surface shows through, thicker toward the middle of each cloud
          if (cv > cloudCut + 0.08) col = mix(col, lit > 0.45 ? CLOUD : CLOUD2, cv > cloudCut + 0.16 ? 0.5 : 0.38);
          else if (cv > cloudCut && dith > 0.1) col = mix(col, CLOUD2, 0.25);
        }
        // storm systems: spiral arms turning around an eye
        for (const s of storms) {
          if (lit < 0.04) break;
          const dl = wrapAngle(lon - s.lon), dla = lat - s.lat;
          const sd = Math.sqrt(dl * dl * Math.cos(lat) ** 2 + dla * dla);
          if (sd < 0.38 && sd > 0.035) {
            const arm = Math.sin(s.spin * Math.atan2(dla, dl) * 2 + sd * 20 - t * 0.0012);
            if (arm > 0.2 + sd * 1.6) col = mix(col, lit > 0.4 ? CLOUD : CLOUD2, 0.7);
          }
        }
        // rim backlight: a thin, soft glow on the right edge (theme-colored), fading toward its ends
        if (g.d[i] > 0.945 && g.nx[i] > 0.35) {
          const f = 1 - Math.abs(g.ny[i]) / 0.6;
          if (f > 0) {
            const m = Math.min(1, f * 1.4) * (dith > -0.15 ? 0.6 : 0.32);
            col = [col[0] + (RIM[0] - col[0]) * m, col[1] + (RIM[1] - col[1]) * m, col[2] + (RIM[2] - col[2]) * m];
          }
        }
        // the front of the ring passes in front of the planet
        if (rg > 0) {
          const rr = rg;
          const k = rr > 1.55 ? (dith > -0.2 ? 1 : -1) : rr > 1.49 ? 2 : rr > 1.38 ? 3 : 1;
          if (k >= 0) col = pRing[k];
        }
        // blight scan lines: every few rows flicker toward red
        if (warp > 0.25 && (y + glitchRow) % 7 === 0 && dith > -0.3) {
          const m = 0.5 * warp;
          col = [col[0] + (BLIGHT[0] - col[0]) * m, col[1] + (BLIGHT[1] - col[1]) * m, col[2] + (BLIGHT[2] - col[2]) * m];
        }
        data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
      }
    }
    this.drawLife(vis, t, seaLevel, greenTop);
    this.drawTraffic(vis, t, seaLevel);
    this.drawSpace(vis, t);
    this.bctx.putImageData(this.img, 0, 0);
    const ctx = this.ctx;
    if (!ctx) return; // a month planet is drawn from this.buf by the sky view
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
  }

  // herds wandering the green plains (First Creatures)
  drawLife(vis, t, seaLevel, greenTop) {
    for (let n = 0; n < (vis.creatures || 0); n++) {
      const s = HERDS[n];
      const lat = (s.a - 0.5) * 1.5 + 0.12 * Math.sin(t * 0.00004 + n * 1.7);
      const lon = s.b * Math.PI * 2 + 0.25 * Math.sin(t * 0.00005 + n);
      const h = this.sample(this.height, lon, lat) - 0.5;
      if (h < seaLevel || h > seaLevel + greenTop) continue;
      const p = this.surfacePx(lat, lon);
      if (p.lit < 0.1) continue;
      this.put(p.x, p.y, HERD);
      this.put(p.x + 1, p.y, HERD2);
      if (n % 2) this.put(p.x, p.y + 1, HERD2);
    }
  }

  // ships on the seas and planes in the air; how many grows with Pop
  drawTraffic(vis, t, seaLevel) {
    const blink = Math.floor(t / 500) % 2 === 0;
    for (let n = 0; n < (vis.ships || 0); n++) {
      const s = SHIPS[n];
      const lat = (s.a - 0.5) * 1.4;
      const lon = s.b * Math.PI * 2 + t * 0.000012 * (s.c > 0.5 ? 1 : -1);
      if (this.sample(this.height, lon, lat) - 0.5 >= seaLevel) continue; // in port
      const p = this.surfacePx(lat, lon);
      if (p.z < 0.15) continue;
      if (p.lit < 0.04) { this.put(p.x, p.y, LIGHT); continue; }
      this.put(p.x, p.y, SHIP);
      this.put(p.x + (s.c > 0.5 ? -1 : 1), p.y, SHIP, 120); // wake
    }
    for (let n = 0; n < (vis.planes || 0); n++) {
      const s = PLANES[n];
      const dir = s.c > 0.5 ? 1 : -1;
      const at = (tt) => {
        const lon = s.b * Math.PI * 2 + tt * 0.00005 * dir;
        return this.surfacePx((s.a - 0.5) * 1.2 + 0.3 * Math.sin(lon * 1.3 + n), lon);
      };
      const p = at(t);
      if (p.z < 0.2) continue;
      if (p.lit < 0.04) { if (blink) this.put(p.x, p.y, n % 2 ? BLINK : PLANE); continue; }
      const q = at(t - 700), r = at(t - 1400);
      this.put(r.x, r.y, PLANE, 70); // contrail
      this.put(q.x, q.y, PLANE, 140);
      this.put(p.x, p.y, PLANE);
    }
  }

  // A shaded moon at (mx, my), radius mr; mz < 0 puts it behind the planet.
  drawMoon(mx, my, mz, mr, seed) {
    const RES = this.res, R = this.r, c = RES / 2 - 0.5;
    const ir = Math.ceil(mr);
    for (let y = -ir; y <= ir; y++) {
      for (let x = -ir; x <= ir; x++) {
        const d2 = (x * x + y * y) / (mr * mr);
        if (d2 > 1) continue;
        const px = Math.round(mx + x), py = Math.round(my + y);
        if (mz < 0 && (px - c) ** 2 + (py - c) ** 2 <= R * R) continue;
        const nz = Math.sqrt(1 - d2), nx = x / mr, ny = y / mr;
        let v = -0.55 * nx - 0.45 * ny + 0.72 * nz + BAYER[(py & 3) * 4 + (px & 3)] * 0.2;
        if (mr > 3 && hash(x + 9, y + 9, seed) > 0.82) v -= 0.25; // craters
        this.put(px, py, pMoon[Math.max(0, Math.min(4, Math.floor((v + 0.25) * 4)))]);
      }
    }
  }

  // goal moons, the orbital station, the space elevator, satellites and rocket launches
  drawSpace(vis, t) {
    const RES = this.res, R = this.r;
    const c = RES / 2 - 0.5;
    const behind = (x, y, z) => z < 0 && (x - c) ** 2 + (y - c) ** 2 <= R * R;
    // a moon for each goal met this month (two at most; all three adds the ring)
    const moons = [{ orbit: 1.5, tilt: 0.3, speed: 0.00011, size: 0.105, phase: 0 }, { orbit: 1.27, tilt: -0.22, speed: 0.00017, size: 0.075, phase: 2.4 }];
    for (let n = 0; n < Math.min(2, vis.goalMoons || 0); n++) {
      const m = moons[n], th = t * m.speed + m.phase;
      this.drawMoon(c + Math.cos(th) * R * m.orbit, c - R * 0.12 + Math.sin(th) * R * m.orbit * m.tilt, Math.sin(th), Math.max(1.2, R * m.size), 5 + n);
    }
    // the Space Elevator: a cable from the equator up to a counterweight, turning with the planet
    if (vis.elevator) {
      const rel = ELEVATOR_LON - this.rot;
      const bx = Math.sin(rel), bz = Math.cos(rel);
      const steps = Math.ceil(R * 0.8);
      for (let k = 0; k <= steps; k++) {
        const f = 1 + 0.75 * k / steps;
        const x = Math.round(c + bx * f * R), y = Math.round(c - 0.5), z = bz;
        if (behind(x, y, z)) continue;
        if (k === steps) { this.put(x, y - 1, STATION); this.put(x, y, STATION); this.put(x + 1, y, CABLE); this.put(x - 1, y, CABLE); }
        else this.put(x, y, CABLE, z < 0 ? 150 : 255);
      }
    }
    // the Orbital Station: a small crewed station on a slow, tilted orbit
    if (vis.station) {
      const th = t * 0.00008 + 1;
      const x = Math.round(c + Math.cos(th) * R * 1.32), y = Math.round(c + Math.sin(th) * R * 1.32 * -0.35), z = Math.sin(th) * -1;
      if (!behind(x, y, z)) {
        this.put(x, y, STATION); this.put(x + 1, y, STATION); this.put(x, y + 1, STATION); this.put(x + 1, y + 1, CABLE);
        for (const dx of [-3, -2, 3, 4]) this.put(x + dx, y, PANEL);
        if (Math.floor(t / 700) % 2 === 0) this.put(x, y - 1, BLINK);
      }
    }
    const blink = Math.floor(t / 600) % 2 === 0;
    for (let n = 0; n < (vis.satellites || 0); n++) {
      const s = SATS[n];
      const ph = t * (0.0003 + s.a * 0.00025) + s.b * 6.28;
      const inc = (s.c - 0.5) * 1.6, ro = R * (1.12 + s.a * 0.14);
      const x = Math.round(c + Math.cos(ph) * ro), y = Math.round(c + Math.sin(ph) * Math.sin(inc) * ro);
      const z = Math.sin(ph) * Math.cos(inc);
      if (behind(x, y, z)) continue;
      this.put(x - 1, y, PANEL); this.put(x, y, SAT); this.put(x + 1, y, PANEL);
      if (blink && n % 2 === 0) this.put(x, y - 1, BLINK);
    }
    if (vis.launches) {
      const p = ((t / 1000) % 16) / 2.6; // a launch every 16 seconds, climbing for 2.6
      if (p < 1) {
        const site = this.surfacePx(LAUNCH.lat, LAUNCH.lon);
        if (site.z > 0.25) {
          let dx = site.x - c, dy = site.y - c - R * 0.12;
          const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
          const dist = p * p * R * 0.7;
          for (let k = 0; k < 9; k++) {
            const back = Math.max(0, dist - k * 1.4);
            this.put(Math.round(site.x + dx * back), Math.round(site.y + dy * back), FLAME[Math.min(4, k >> 1)], 255 - k * 20);
          }
        }
      }
    }
  }
}

export const GLOBE_RES = RES;
export const GLOBE_VIEW = VIEW;
