import {rgbToHex} from "~/helper/color";

// Client-side palette extraction from an arbitrary image — the "image → palette"
// tool. It mirrors the pixel-art importer's pipeline: first resample the image
// down to a small grid with the browser's high-quality (averaging) scaler, then
// median-cut that grid into representative colors.
//
// The downsample step is the important part: averaging each block collapses
// anti-aliasing fringes and gradient noise, so the palette reflects the image's
// *structural* colors rather than every stray pixel of a full-resolution photo.

type RGB = [number, number, number];

/**
 * Resample an image to a small grid using the browser's high-quality scaler
 * (the same "import image" step the converter/editor use). Never upscales.
 * Returns the opaque pixels as [r,g,b] tuples (transparent pixels skipped).
 */
function imageToGrid(img: HTMLImageElement, maxSide: number): RGB[] {
    const longest = Math.max(img.width, img.height) || 1;
    const side = Math.min(maxSide, longest); // never upscale a small image
    const ratio = (img.width / img.height) || 1;
    let w = side, h = side;
    if (ratio >= 1) h = Math.max(1, Math.round(side / ratio));
    else w = Math.max(1, Math.round(side * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    if (!ctx) return [];
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    const {data} = ctx.getImageData(0, 0, w, h);
    const out: RGB[] = [];
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! < 128) continue; // skip (near-)transparent pixels
        out.push([data[i]!, data[i + 1]!, data[i + 2]!]);
    }
    return out;
}

/**
 * Greedy median cut: recursively split the box holding the most pixels along
 * its longest channel at the median, then average each final box. Returns up to
 * `count` de-duped #RRGGBB colors.
 */
export function medianCut(pixels: RGB[], count: number): string[] {
    const target = Math.max(1, Math.min(64, count | 0));
    if (!pixels.length) return [];

    let boxes: RGB[][] = [pixels];
    while (boxes.length < target) {
        // Split the most-populated box (greedy — good quality for any count).
        let idx = -1, max = -1;
        for (let i = 0; i < boxes.length; i++) {
            if (boxes[i]!.length > max && boxes[i]!.length > 1) {
                max = boxes[i]!.length;
                idx = i;
            }
        }
        if (idx < 0) break;
        const box = boxes[idx]!;

        let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
        for (const p of box) {
            if (p[0] < rMin) rMin = p[0]; if (p[0] > rMax) rMax = p[0];
            if (p[1] < gMin) gMin = p[1]; if (p[1] > gMax) gMax = p[1];
            if (p[2] < bMin) bMin = p[2]; if (p[2] > bMax) bMax = p[2];
        }
        const rR = rMax - rMin, gR = gMax - gMin, bR = bMax - bMin;
        const ch = rR >= gR && rR >= bR ? 0 : (gR >= bR ? 1 : 2);

        box.sort((a, b) => a[ch] - b[ch]);
        const mid = box.length >> 1;
        boxes.splice(idx, 1, box.slice(0, mid), box.slice(mid));
    }

    const seen = new Set<string>();
    const out: string[] = [];
    for (const box of boxes) {
        let r = 0, g = 0, b = 0;
        for (const p of box) { r += p[0]; g += p[1]; b += p[2]; }
        const n = box.length || 1;
        const hex = rgbToHex(Math.round(r / n), Math.round(g / n), Math.round(b / n)).toUpperCase();
        if (seen.has(hex)) continue;
        seen.add(hex);
        out.push(hex);
    }
    return out;
}

/**
 * Extract up to `count` representative colors from an image File. Downsamples
 * the image (importer-style) before quantizing so the palette is clean. Browser-only.
 */
export function extractPaletteFromFile(file: File, count: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                resolve(medianCut(imageToGrid(img, 96), count));
            } catch (e) {
                reject(e);
            } finally {
                URL.revokeObjectURL(url);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('image load failed'));
        };
        img.src = url;
    });
}
