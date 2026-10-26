// Pixel globe renderer: a low-res sphere sampled from lat/lon textures, scaled up crisply.

const RES = 112; // pixels across the globe buffer (including halo margin)
const R = 48; // planet radius in buffer pixels
const TW = 256, TH = 128; // texture size (lon x lat)

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

const DESERT = ['#24182f', '#3a2640', '#553650', '#734c60', '#936774', '#b38483', '#cfa594', '#e6c4aa'];
const SEA = ['#0f1a3a', '#152a55', '#1d3f73', '#2b5b94', '#3f7fb3'];
const GREEN = ['#12301f', '#1c4a2a', '#2c6b37', '#46914a', '#78b85c'];
const ICE = ['#5a6488', '#9aa3c2', '#c7cfe6', '#eef1fb'];
const NIGHT = ['#0d0819', '#150f26', '#1b1330'];

function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
const P = (arr) => arr.map(hex);
const pDesert = P(DESERT), pSea = P(SEA), pGreen = P(GREEN), pIce = P(ICE), pNight = P(NIGHT);
const DUST = hex('#e8c7a8'), DUST2 = hex('#c9a088'), CLOUD = hex('#e8e0ff'), CLOUD2 = hex('#b8acd8');
const LIGHT = hex('#ffd27a');

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

export class Globe {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.buf = document.createElement('canvas');
    this.buf.width = RES;
    this.buf.height = RES;
    this.bctx = this.buf.getContext('2d');
    this.img = this.bctx.createImageData(RES, RES);
    this.rot = 0;
    this.rim = hex('#4bb8c4');
    this.halo = [201, 168, 220];
    this.cloudRot = 0;
    this.height = fbm(TW, TH, 3, [32, 16, 8], [0.55, 0.3, 0.15]);
    this.clouds = fbm(TW, TH, 41, [24, 10, 5], [0.5, 0.35, 0.15]);
    this.applyCraters();
    this.buildSeaLevels();
    // precompute sphere geometry
    const n = RES * RES;
    this.geo = { inside: new Uint8Array(n), lonOff: new Float32Array(n), lat: new Float32Array(n), shade: new Float32Array(n), d: new Float32Array(n), nx: new Float32Array(n), ny: new Float32Array(n) };
    const c = RES / 2;
    for (let y = 0; y < RES; y++) {
      for (let x = 0; x < RES; x++) {
        const i = y * RES + x;
        const nx = (x + 0.5 - c) / R, ny = (y + 0.5 - c) / R;
        const d2 = nx * nx + ny * ny;
        this.geo.d[i] = Math.sqrt(d2);
        this.geo.nx[i] = nx;
        this.geo.ny[i] = ny;
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

  // Project lat/lon to unit screen coords (0..1) and visibility.
  project(lat, lon) {
    const rel = lon - this.rot;
    const x = Math.cos(lat) * Math.sin(rel);
    const y = -Math.sin(lat);
    const z = Math.cos(lat) * Math.cos(rel);
    const s = R / RES;
    return { x: 0.5 + x * s, y: 0.5 + y * s, z };
  }

  render(vis, t) {
    const data = this.img.data;
    const g = this.geo;
    const HALO = this.halo, RIM = this.rim;
    const iceLat = 1.02 + (1 - vis.ice) * 0.5; // caps shrink as ice melts
    // Water fills the basins from the deepest point up: dry at 0, about 55% ocean at full, leaving land for Life.
    const seaLevel = this.seaLevelFor(vis.sea * 0.55);
    const cloudCut = 1 - vis.clouds * 0.55;
    const dustC = { lon: 0.6, lat: 0.12 };
    for (let y = 0; y < RES; y++) {
      for (let x = 0; x < RES; x++) {
        const i = y * RES + x;
        const o = i * 4;
        const dith = BAYER[(y & 3) * 4 + (x & 3)];
        if (!g.inside[i]) {
          const d = g.d[i];
          const a = d < 1.05 ? 0.16 + vis.clouds * 0.2 : d < 1.1 ? 0.06 + vis.clouds * 0.1 : 0;
          data[o] = HALO[0]; data[o + 1] = HALO[1]; data[o + 2] = HALO[2];
          data[o + 3] = a > 0 && dith > -0.3 ? Math.round(a * 255) : 0;
          continue;
        }
        const lat = g.lat[i];
        const lon = g.lonOff[i] + this.rot;
        const shade = g.shade[i];
        const h = this.sample(this.height, lon, lat) - 0.5;
        let col;
        const lit = shade + dith * 0.18;
        if (lit < 0.04) {
          col = pNight[lit < -0.25 ? 0 : lit < -0.08 ? 1 : 2];
          // city lights on the night side in later eras
          if (vis.lights > 0 && h > seaLevel + 0.02 && this.sample(this.clouds, lon * 3, lat * 3) > 1 - vis.lights * 0.35) col = LIGHT;
        } else if (Math.abs(lat) > iceLat + h * 0.25 + (vis.cooling ? -0.15 : 0)) {
          col = pIce[Math.max(0, Math.min(3, Math.floor(lit * 4.4)))];
        } else if (h < seaLevel) {
          const depth = (seaLevel - h) * 4;
          col = pSea[Math.max(0, Math.min(4, Math.floor(lit * 5 - depth * 1.2 + 0.5)))];
        } else if (vis.green > 0 && h < seaLevel + vis.green * 0.32 && Math.abs(lat) < 1.1 && !(vis.wither && dith > 0)) {
          col = pGreen[Math.max(0, Math.min(4, Math.floor(lit * 5 + h * 2)))];
        } else {
          const v = lit * 0.85 + 0.12 + h * 0.5;
          col = pDesert[Math.max(0, Math.min(7, Math.floor(v * 8)))];
        }
        // dust storm swirl
        if (vis.dust && lit > 0.04) {
          let dl = lon - dustC.lon; dl = ((dl + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
          const dla = lat - dustC.lat;
          const sd = Math.sqrt(dl * dl * Math.cos(lat) ** 2 + dla * dla);
          if (sd < 0.55) {
            const band = Math.sin(Math.atan2(dla, dl) * 2 + sd * 22 - t * 0.0006);
            if (band > 0.1 + sd) col = sd < 0.25 ? DUST : DUST2;
          }
        }
        // clouds
        if (vis.clouds > 0.05 && lit > 0.04) {
          const cv = this.sample(this.clouds, lon + this.cloudRot, lat);
          if (cv > cloudCut + 0.08) col = lit > 0.45 ? CLOUD : CLOUD2;
          else if (cv > cloudCut && dith > 0.1) col = CLOUD2;
        }
        // cyan rim backlight
        if (g.d[i] > 0.93 && g.nx[i] > 0.3 && Math.abs(g.ny[i]) < 0.6) col = RIM;
        data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
      }
    }
    this.bctx.putImageData(this.img, 0, 0);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
  }
}

export const GLOBE_RES = RES;
