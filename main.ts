// The world news of Wednesday 25 November 2026, drawn as one newspaper front page.
// Node 22, standard library only: a tiny raster canvas, a 5x7 bitmap font stored as
// 5-bit row values, and a hand-rolled PNG writer (zlib deflate + CRC32). No network,
// no clock, no randomness: every run writes the same bytes.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = 1024;
const H = 1024;
const buf = new Uint8Array(W * H * 3);

type RGB = [number, number, number];
const PAPER: RGB = [243, 240, 231];
const CARD: RGB = [255, 255, 255];
const INK: RGB = [22, 26, 34];
const RED: RGB = [178, 34, 34];
const BLUE: RGB = [28, 74, 138];
const GOLD: RGB = [176, 124, 22];
const TEAL: RGB = [14, 110, 110];
const GREEN: RGB = [20, 120, 60];
const PURPLE: RGB = [120, 40, 120];
const GREY: RGB = [110, 108, 100];

// ---- raster helpers ----
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  for (let j = y0; j < y1; j++) {
    let o = (j * W + x0) * 3;
    for (let i = x0; i < x1; i++, o += 3) { buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; }
  }
}
function pixel(x: number, y: number, c: RGB): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const o = (y * W + x) * 3; buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2];
}
function seg(x0: number, y0: number, x1: number, y1: number, c: RGB, w = 2): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / steps);
    const y = Math.round(y0 + (y1 - y0) * i / steps);
    for (let k = 0; k < w; k++) pixel(x + k, y, c);
  }
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let j = -r; j <= r; j++)
    for (let i = -r; i <= r; i++)
      if (i * i + j * j <= r * r) pixel(cx + i, cy + j, c);
}

// ---- 5x7 bitmap font: each glyph is seven 5-bit rows, bit 4 (16) is the left pixel ----
const GLYPH: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [15, 16, 16, 16, 16, 16, 15], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [15, 16, 16, 23, 17, 17, 14], H: [17, 17, 17, 31, 17, 17, 17],
  I: [31, 4, 4, 4, 4, 4, 31], J: [7, 1, 1, 1, 1, 17, 14],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17], X: [17, 10, 4, 4, 4, 10, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 19, 21, 25, 17, 17, 14], '1': [4, 12, 4, 4, 4, 4, 31],
  '2': [14, 17, 1, 6, 8, 16, 31], '3': [30, 1, 1, 14, 1, 1, 30],
  '4': [2, 6, 10, 17, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [14, 16, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 4, 4, 4],
  '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 1, 14],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 0, 4],
  ',': [0, 0, 0, 0, 0, 4, 8], "'": [4, 4, 8, 0, 0, 0, 0],
  '-': [0, 0, 0, 31, 0, 0, 0], ':': [0, 4, 0, 0, 0, 4, 0],
  '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4],
  '/': [1, 1, 2, 4, 8, 16, 16], '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8], '%': [25, 26, 1, 2, 4, 8, 19],
  '&': [12, 18, 20, 8, 21, 18, 13], '+': [0, 4, 4, 31, 4, 4, 0],
  ';': [0, 4, 0, 0, 0, 4, 8], '$': [4, 15, 20, 14, 5, 30, 4],
  '=': [0, 0, 31, 0, 31, 0, 0],
};
const BLANK = [0, 0, 0, 0, 0, 0, 0];
function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = GLYPH[ch] ?? BLANK;
    for (let r = 0; r < 7; r++)
      for (let b = 0; b < 5; b++)
        if (g[r] & (16 >> b)) rect(cx + b * scale, y + r * scale, scale, scale, c);
    cx += 6 * scale;
  }
}
function textW(s: string, scale: number): number { return s.length * 6 * scale - scale; }
function centerText(s: string, y: number, scale: number, c: RGB): void {
  drawText(s, Math.round((W - textW(s, scale)) / 2), y, scale, c);
}
function wrapText(s: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const word of s.split(' ')) {
    const last = out[out.length - 1];
    if (last === undefined) { out.push(word); continue; }
    if (last.length + 1 + word.length <= maxChars) out[out.length - 1] = last + ' ' + word;
    else out.push(word);
  }
  return out;
}

// ---- small icons, each drawn inside a 64x64 box at (x, y) ----
function iconTanker(x: number, y: number): void {
  disc(x + 32, y + 12, 5, RED);
  seg(x + 32, y + 2, x + 32, y + 7, RED, 2); seg(x + 22, y + 12, x + 27, y + 12, RED, 2);
  seg(x + 37, y + 12, x + 42, y + 12, RED, 2); seg(x + 25, y + 5, x + 28, y + 8, RED, 2);
  seg(x + 39, y + 5, x + 36, y + 8, RED, 2);
  rect(x + 42, y + 26, 12, 10, INK); rect(x + 14, y + 28, 8, 8, RED);
  rect(x + 6, y + 36, 52, 12, INK);
  seg(x + 58, y + 36, x + 64, y + 42, INK, 3); seg(x + 58, y + 48, x + 64, y + 42, INK, 3);
  seg(x + 2, y + 56, x + 20, y + 56, BLUE, 2); seg(x + 24, y + 60, x + 44, y + 60, BLUE, 2);
  seg(x + 46, y + 56, x + 62, y + 56, BLUE, 2);
}
function iconCourt(x: number, y: number): void {
  seg(x + 6, y + 20, x + 32, y + 6, INK, 3); seg(x + 32, y + 6, x + 58, y + 20, INK, 3);
  rect(x + 6, y + 20, 52, 4, INK);
  rect(x + 12, y + 24, 5, 22, INK); rect(x + 29, y + 24, 5, 22, INK); rect(x + 46, y + 24, 5, 22, INK);
  rect(x + 6, y + 46, 52, 5, INK); rect(x + 2, y + 51, 60, 4, INK);
}
function iconChart(x: number, y: number): void {
  seg(x + 8, y + 8, x + 8, y + 54, INK, 2); seg(x + 8, y + 54, x + 58, y + 54, INK, 2);
  seg(x + 12, y + 16, x + 26, y + 26, RED, 3); seg(x + 26, y + 26, x + 38, y + 22, RED, 3);
  seg(x + 38, y + 22, x + 52, y + 44, RED, 3);
  seg(x + 52, y + 44, x + 46, y + 42, RED, 3); seg(x + 52, y + 44, x + 50, y + 38, RED, 3);
  disc(x + 12, y + 16, 2, RED); disc(x + 26, y + 26, 2, RED); disc(x + 38, y + 22, 2, RED);
}
function iconShip(x: number, y: number): void {
  rect(x + 24, y + 8, 16, 5, INK); seg(x + 20, y + 6, x + 44, y + 6, INK, 2);
  seg(x + 20, y + 10, x + 44, y + 10, INK, 2);
  seg(x + 32, y + 11, x + 32, y + 17, INK, 2); disc(x + 32, y + 19, 3, RED);
  rect(x + 8, y + 38, 48, 10, BLUE);
  seg(x + 32, y + 38, x + 32, y + 24, INK, 2); seg(x + 32, y + 24, x + 44, y + 28, RED, 2);
  seg(x + 4, y + 56, x + 60, y + 56, BLUE, 2);
}
function iconRocket(x: number, y: number): void {
  rect(x + 26, y + 12, 12, 30, INK);
  seg(x + 26, y + 12, x + 32, y + 2, INK, 3); seg(x + 32, y + 2, x + 38, y + 12, INK, 3);
  disc(x + 32, y + 22, 3, PAPER);
  seg(x + 26, y + 34, x + 18, y + 46, RED, 3); seg(x + 38, y + 34, x + 46, y + 46, RED, 3);
  seg(x + 32, y + 42, x + 28, y + 54, GOLD, 3); seg(x + 32, y + 42, x + 36, y + 54, GOLD, 3);
  disc(x + 10, y + 12, 2, GOLD); disc(x + 54, y + 20, 2, GOLD); disc(x + 12, y + 44, 2, GOLD);
}
function iconIsland(x: number, y: number): void {
  disc(x + 50, y + 12, 7, GOLD);
  seg(x + 32, y + 42, x + 32, y + 22, TEAL, 3);
  seg(x + 32, y + 22, x + 20, y + 16, TEAL, 2); seg(x + 32, y + 22, x + 44, y + 16, TEAL, 2);
  seg(x + 32, y + 22, x + 32, y + 12, TEAL, 2);
  rect(x + 16, y + 42, 32, 8, GOLD);
  seg(x + 4, y + 52, x + 60, y + 52, BLUE, 2); seg(x + 10, y + 58, x + 54, y + 58, BLUE, 2);
}
// A bigger tanker for the hero panel, drawn inside a 170x140 box at (x, y).
function heroTanker(x: number, y: number): void {
  disc(x + 85, y + 22, 9, RED);
  seg(x + 85, y + 8, x + 85, y + 13, RED, 3); seg(x + 71, y + 22, x + 76, y + 22, RED, 3);
  seg(x + 94, y + 22, x + 99, y + 22, RED, 3); seg(x + 75, y + 12, x + 79, y + 16, RED, 3);
  seg(x + 95, y + 12, x + 91, y + 16, RED, 3);
  disc(x + 24, y + 40, 4, GREY); disc(x + 34, y + 32, 4, GREY);
  rect(x + 30, y + 54, 18, 16, RED);
  rect(x + 105, y + 48, 28, 22, INK);
  rect(x + 110, y + 54, 6, 6, PAPER); rect(x + 121, y + 54, 6, 6, PAPER);
  seg(x + 118, y + 48, x + 118, y + 34, INK, 2); seg(x + 118, y + 34, x + 132, y + 38, RED, 2);
  rect(x + 10, y + 70, 130, 26, INK);
  seg(x + 140, y + 70, x + 156, y + 83, INK, 4); seg(x + 140, y + 96, x + 156, y + 83, INK, 4);
  seg(x + 6, y + 112, x + 50, y + 112, BLUE, 3); seg(x + 58, y + 120, x + 104, y + 120, BLUE, 3);
  seg(x + 112, y + 112, x + 158, y + 112, BLUE, 3);
}

// ---- the front page ----
rect(0, 0, W, H, PAPER);
centerText('THE WORLD IN ONE DAY', 30, 3, INK);
rect(64, 72, W - 128, 3, INK);
centerText('WEDNESDAY', 92, 7, INK);
centerText('25 NOVEMBER 2026', 148, 4, RED);

interface Story {
  tag: string;
  accent: RGB;
  headline: string;
  icon: (x: number, y: number) => void;
}

function frame(x: number, y: number, w: number, h: number, accent: RGB): void {
  rect(x, y, w, h, CARD);
  rect(x, y, w, 6, accent);
  rect(x, y, w, 2, INK); rect(x, y + h - 2, w, 2, INK);
  rect(x, y, 2, h, INK); rect(x + w - 2, y, 2, h, INK);
}

// Hero: the day's biggest story, full width.
frame(32, 192, 960, 208, RED);
heroTanker(56, 226);
drawText('MIDDLE EAST - TOP STORY', 252, 226, 3, RED);
wrapText('TWO TANKERS HIT MINES IN STRAIT OF HORMUZ; VESSELS CATCH FIRE', 29).slice(0, 3)
  .forEach((ln, k) => drawText(ln, 252, 272 + k * 38, 4, INK));

const stories: Story[] = [
  { tag: 'US - CHINA', accent: BLUE, headline: 'US JURY CONVICTS HUAWEI OF BANK FRAUD AND TRADE SECRET THEFT', icon: iconCourt },
  { tag: 'MARKETS', accent: GOLD, headline: 'AI SELLOFF: NIKKEI DOWN 2.8%; KOREAN SHARES SLIDE; SOFTBANK SINKS', icon: iconChart },
  { tag: 'UKRAINE WAR', accent: TEAL, headline: 'UKRAINIAN DRONES SINK RUSSIAN WARSHIP OFF LIBYA; TWO KILLED', icon: iconShip },
  { tag: 'SPACE', accent: PURPLE, headline: "CHINA LAUNCHES CREWED SHIP CARRYING PAKISTAN'S FIRST ASTRONAUT", icon: iconRocket },
  { tag: 'PACIFIC', accent: GREEN, headline: 'SOLOMON ISLANDS AND AUSTRALIA SIGN PACT BARRING FOREIGN BASES', icon: iconIsland },
];

// Two wide panels, then three narrow ones.
const wide: { x: number; y: number; w: number; h: number }[] = [
  { x: 32, y: 416, w: 472, h: 220 }, { x: 520, y: 416, w: 472, h: 220 },
];
const narrow: { x: number; y: number; w: number; h: number }[] = [
  { x: 32, y: 652, w: 304, h: 210 }, { x: 360, y: 652, w: 304, h: 210 }, { x: 688, y: 652, w: 304, h: 210 },
];
wide.forEach((p, i) => {
  const s = stories[i];
  frame(p.x, p.y, p.w, p.h, s.accent);
  s.icon(p.x + 16, p.y + 20);
  drawText(s.tag, p.x + 96, p.y + 30, 3, s.accent);
  wrapText(s.headline, 23).slice(0, 4)
    .forEach((ln, k) => drawText(ln, p.x + 20, p.y + 100 + k * 29, 3, INK));
});
narrow.forEach((p, i) => {
  const s = stories[2 + i];
  frame(p.x, p.y, p.w, p.h, s.accent);
  s.icon(p.x + 14, p.y + 18);
  drawText(s.tag, p.x + 92, p.y + 28, 2, s.accent);
  wrapText(s.headline, 21).slice(0, 4)
    .forEach((ln, k) => drawText(ln, p.x + 18, p.y + 96 + k * 22, 2, INK));
});

// Footer: more of the day, in one strip.
rect(32, 884, 960, 2, INK);
wrapText('ALSO: TRUMP PLANS TARIFFS ON 16 ECONOMIES - COLOMBIA FREES ALL HOSTAGES IN CARTAGENA SIEGE - SENEGAL REGAINS AFRICA CUP TITLE - HOUTHIS HIT RIYADH TOWER, 11 HURT - EUROZONE INFLATION 4.0%', 78)
  .forEach((ln, k) => drawText(ln, 32, 900 + k * 24, 2, GREY));

// ---- PNG encoding (zlib + CRC32, standard library only) ----
const CRC: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC.push(c >>> 0);
}
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
  return Buffer.concat([head, data, tail]);
}
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  Buffer.from(buf.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk('IHDR', ihdr),
  pngChunk('IDAT', deflateSync(raw, { level: 9 })),
  pngChunk('IEND', Buffer.alloc(0)),
]);

const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'entry.png'), png);
