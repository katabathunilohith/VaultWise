import crypto from "node:crypto";
import sharp from "sharp";
import exifr from "exifr";

export const EDITING_SOFTWARE = /photoshop|gimp|canva|pixelmator|snapseed|picsart|lightroom|affinity|paint\.net|fotor|photopea|illustrator/i;

/** Above this size ELA is skipped (memory grows ~22 bytes per pixel); other tamper checks still run. */
export const ELA_MAX_PIXELS = 25_000_000;

/** Cheap decodability check: decodes a tiny thumbnail. Returns dimensions, or null if the image can't be read. */
export async function probeImage(buf: Buffer): Promise<{ width: number; height: number; format: string } | null> {
  try {
    const meta = await sharp(buf).metadata();
    await sharp(buf).resize(16, 16, { fit: "inside" }).raw().toBuffer();
    return { width: meta.width ?? 0, height: meta.height ?? 0, format: meta.format ?? "unknown" };
  } catch {
    return null;
  }
}

export function sha256(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * 256-bit difference hash (16x16 gradient signs). Robust to resizing and
 * recompression. Documents from the same template hash close together, so
 * the pipeline pairs it with a content fingerprint before calling it reuse.
 */
export async function dHash(buf: Buffer): Promise<string> {
  const { data } = await sharp(buf).rotate().grayscale().resize(17, 16, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) bits += data[y * 17 + x] > data[y * 17 + x + 1] ? "1" : "0";
  }
  return BigInt("0b" + bits)
    .toString(16)
    .padStart(64, "0");
}

export function hamming(a: string, b: string) {
  let x = BigInt("0x" + a) ^ BigInt("0x" + b);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

export interface ExifSummary {
  present: boolean;
  make?: string;
  model?: string;
  software?: string;
  dateTimeOriginal?: string;
  modifyDate?: string;
  gps?: boolean;
}

export async function readExif(buf: Buffer): Promise<ExifSummary> {
  try {
    const e = await exifr.parse(buf, { tiff: true, exif: true, gps: true });
    if (!e) return { present: false };
    const iso = (d: unknown) => (d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : undefined);
    return {
      present: true,
      make: e.Make,
      model: e.Model,
      software: e.Software,
      dateTimeOriginal: iso(e.DateTimeOriginal ?? e.CreateDate),
      modifyDate: iso(e.ModifyDate),
      gps: e.latitude != null,
    };
  } catch {
    return { present: false };
  }
}

/** Auto-orient, trim borders, normalise contrast, light median denoise; returns a JPEG for the vision model. */
export async function preprocess(buf: Buffer) {
  const meta = await sharp(buf).metadata();
  let pipeline = sharp(buf).rotate();
  try {
    pipeline = pipeline.trim({ threshold: 12 });
  } catch {
    // trim unsupported for this image; continue
  }
  const out = await pipeline
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .normalise()
    .median(1)
    .jpeg({ quality: 88 })
    .toBuffer({ resolveWithObject: true });
  return {
    buffer: out.data,
    original: { width: meta.width ?? 0, height: meta.height ?? 0, format: meta.format ?? "unknown", hasAlpha: !!meta.hasAlpha },
    processed: { width: out.info.width, height: out.info.height },
  };
}

export interface ElaResult {
  score: number; // 0 = consistent, 1 = strongly inconsistent
  meanError: number;
  suspiciousBlocks: number;
  largestCluster: number;
  texturedBlocks: number;
  heatmap: Buffer; // PNG
}

const ELA_QUALITY = 75;
const BLOCK = 8; // aligned to the JPEG 8x8 DCT grid

/**
 * Error Level Analysis. Re-saves the image at a known JPEG quality and measures
 * how much each 8x8 block changes. Content pasted in from another source has a
 * different compression history, so its error is out of line with its own edge
 * energy. Error is normalised by local gradient (so ordinary text edges don't
 * look suspicious), robust outliers are flagged, and only spatially clustered
 * outliers count: genuine edits are contiguous, noise is scattered.
 * Runs at native resolution — resampling would erase the JPEG grid signal.
 */
export async function errorLevelAnalysis(buf: Buffer): Promise<ElaResult | null> {
  const meta = await sharp(buf).metadata();
  if ((meta.width ?? 0) * (meta.height ?? 0) > ELA_MAX_PIXELS) return null;
  const base = sharp(buf).rotate().removeAlpha();
  const { data: orig, info } = await base.clone().raw().toBuffer({ resolveWithObject: true });
  const recompressed = await sharp(orig, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .jpeg({ quality: ELA_QUALITY })
    .toBuffer();
  const { data: re } = await sharp(recompressed).raw().toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;
  const C = info.channels;
  const ela = new Float32Array(W * H);
  const gray = new Float32Array(W * H);
  let sum = 0;
  // Luminance only: chroma subsampling makes saturated colour edges (logos,
  // letterhead bars) recompress noisily, which would look like edits.
  for (let i = 0, p = 0; i < W * H; i++, p += C) {
    const yo = 0.299 * orig[p] + 0.587 * orig[p + 1] + 0.114 * orig[p + 2];
    const yr = 0.299 * re[p] + 0.587 * re[p + 1] + 0.114 * re[p + 2];
    const m = Math.abs(yo - yr);
    ela[i] = m;
    sum += m;
    gray[i] = yo;
  }

  const GW = Math.floor((W - 1) / BLOCK);
  const GH = Math.floor((H - 1) / BLOCK);
  const ratio = new Float32Array(GW * GH).fill(NaN);
  const errMean = new Float32Array(GW * GH).fill(NaN);
  const ratios: number[] = [];
  const errs: number[] = [];
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      let e = 0;
      let g = 0;
      for (let y = gy * BLOCK; y < gy * BLOCK + BLOCK; y++) {
        for (let x = gx * BLOCK; x < gx * BLOCK + BLOCK; x++) {
          const i = y * W + x;
          e += ela[i];
          g += Math.abs(gray[i + 1] - gray[i]) + Math.abs(gray[i + W] - gray[i]);
        }
      }
      const gMean = g / (BLOCK * BLOCK);
      if (gMean > 6) {
        const em = e / (BLOCK * BLOCK);
        ratio[gy * GW + gx] = em / gMean;
        errMean[gy * GW + gx] = em;
        ratios.push(em / gMean);
        errs.push(em);
      }
    }
  }

  const robust = (v: number[]) => {
    const sorted = [...v].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const devs = v.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
    return { median, scale: 1.4826 * (devs[Math.floor(devs.length / 2)] || 1e-6) };
  };

  let suspicious = 0;
  let largestCluster = 0;
  if (ratios.length >= 16) {
    // A block is anomalous if its error is out of line with its own edge
    // energy, or simply far above the page's typical error level.
    const rStat = robust(ratios);
    const eStat = robust(errs);
    const flagged = new Uint8Array(GW * GH);
    for (let k = 0; k < ratio.length; k++) {
      if (Number.isNaN(ratio[k])) continue;
      if ((ratio[k] - rStat.median) / rStat.scale > 3 || (errMean[k] - eStat.median) / eStat.scale > 4) {
        flagged[k] = 1;
        suspicious++;
      }
    }
    // Largest cluster of flagged blocks, bridging gaps of up to two blocks
    // (text has blank space between glyphs).
    const seen = new Uint8Array(GW * GH);
    for (let k = 0; k < flagged.length; k++) {
      if (!flagged[k] || seen[k]) continue;
      let size = 0;
      const stack = [k];
      seen[k] = 1;
      while (stack.length) {
        const cur = stack.pop()!;
        size++;
        const cx = cur % GW;
        const cy = (cur - cx) / GW;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
            const n = ny * GW + nx;
            if (flagged[n] && !seen[n]) {
              seen[n] = 1;
              stack.push(n);
            }
          }
        }
      }
      largestCluster = Math.max(largestCluster, size);
    }
  }
  // Calibrated on clean scans/photos (largest cluster ≤ 8) vs. pasted edits (≥ 25).
  const score = Math.max(0, Math.min(1, (largestCluster - 10) / 20));

  // Heatmap: amplified error, tinted, for the human reviewer.
  const sortedE = Float32Array.from(ela).sort();
  const p995 = sortedE[Math.floor(sortedE.length * 0.995)] || 1;
  const gain = 255 / Math.max(4, p995);
  const heat = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const v = Math.min(255, ela[i] * gain);
    heat[i * 3] = Math.min(255, 20 + v);
    heat[i * 3 + 1] = Math.min(255, 20 + v * 0.6);
    heat[i * 3 + 2] = Math.min(255, 45 + v * 0.15);
  }
  const heatmap = await sharp(heat, { raw: { width: W, height: H, channels: 3 } })
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  return { score, meanError: sum / (W * H), suspiciousBlocks: suspicious, largestCluster, texturedBlocks: ratios.length, heatmap };
}
