// @ts-nocheck
import type {EditorData, Layer} from "~/types";
import {hexToRgb} from "~/helper/color";

/**
 * Composite a frame's layers into a 1px-per-pixel canvas (transparent where
 * empty). Reused by onion skin, playback, and the public animated preview.
 * Pass a reusable canvas to avoid per-call allocation. Client-only (ImageData).
 */
export function compositeFrame(
    canvas: HTMLCanvasElement,
    layers: Layer[],
    width: number,
    height: number,
    colors: string[],
): HTMLCanvasElement {
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const img = ctx.createImageData(width, height);
    const data = img.data;
    const rgb = colors.map(c => hexToRgb(c));
    const map = layers2MapNumbers({width, height, layers} as any);
    for (const k in map) {
        const c = rgb[map[k]];
        if (!c) continue;
        const sep = k.indexOf('_');
        const x = +k.slice(0, sep);
        const y = +k.slice(sep + 1);
        const off = (y * width + x) * 4;
        data[off] = c[0];
        data[off + 1] = c[1];
        data[off + 2] = c[2];
        data[off + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}


// Type definitions
type RGB = [number, number, number];


export function layers2MapNumbers(editorData: EditorData): { [key: string]: number } {
    const {width, height, layers} = editorData;
    const mapNumbers: { [key: string]: number } = {};
    for (const layer of [...layers].reverse()) {
        for (const [key, colorIndex] of Object.entries(layer.pixels)) {
            if (colorIndex === undefined || colorIndex === -1) continue;

            const [x, y] = key.split('_').map(Number);
            const finalX = x + layer.x;
            const finalY = y + layer.y;
            const finalKey = `${finalX}_${finalY}`;

            if (
                finalX >= 0 && finalX < width &&
                finalY >= 0 && finalY < height &&
                !(finalKey in mapNumbers)
            ) {
                mapNumbers[finalKey] = colorIndex;
            }
        }
    }
    return mapNumbers;
}

export function drawThumbnail(canvas: HTMLCanvasElement, editorData: EditorData, zoom: number = 1): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const results = layers2MapNumbers(editorData);

    for (const [key, pixelIndex] of Object.entries(results)) {
        const [x = 0, y = 0] = key.split('_').map(Number);
        ctx.fillStyle = editorData.colors[pixelIndex] ?? '#000000';
        ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
    }
}

// ── SVG export ─────────────────────────────────────────────────────────────
// Trace a set of filled cells ("x_y" keys) into closed rectilinear outlines
// and return an SVG path `d`. Every cell side facing an empty neighbor
// becomes a directed unit edge (interior kept on a consistent side); chaining
// the edges yields the region outlines, with hole loops falling out naturally
// (rendered via fill-rule="evenodd"). At a pinched corner — two cells of the
// set touching only diagonally — the sharpest right turn is taken so each
// loop hugs its own region. Collinear steps merge into single h/v commands.
function traceCellLoops(cells: Set<string>): string {
    const edges = new Map<string, [number, number][]>();
    const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
        const k = `${x1}_${y1}`;
        const list = edges.get(k);
        if (list) list.push([x2, y2]);
        else edges.set(k, [[x2, y2]]);
    };
    for (const key of cells) {
        const sep = key.indexOf('_');
        const x = +key.slice(0, sep);
        const y = +key.slice(sep + 1);
        if (!cells.has(`${x}_${y - 1}`)) addEdge(x, y, x + 1, y);
        if (!cells.has(`${x + 1}_${y}`)) addEdge(x + 1, y, x + 1, y + 1);
        if (!cells.has(`${x}_${y + 1}`)) addEdge(x + 1, y + 1, x, y + 1);
        if (!cells.has(`${x - 1}_${y}`)) addEdge(x, y + 1, x, y);
    }
    let d = '';
    for (const [startKey, starts] of edges) {
        while (starts.length) {
            const sep = startKey.indexOf('_');
            const sx = +startKey.slice(0, sep);
            const sy = +startKey.slice(sep + 1);
            let [cx, cy] = starts.pop()!;
            let runDx = cx - sx, runDy = cy - sy;   // direction of the pending run
            let run = 1;                            // pending run length (unit steps)
            d += `M${sx} ${sy}`;
            while (cx !== sx || cy !== sy) {
                const outs = edges.get(`${cx}_${cy}`)!;
                let next: [number, number];
                if (outs.length === 1) {
                    next = outs.pop()!;
                } else {
                    // Pinched corner: prefer the right turn relative to travel.
                    const rx = cx - runDy, ry = cy + runDx;
                    const i = outs.findIndex(([ex, ey]) => ex === rx && ey === ry);
                    next = i >= 0 ? outs.splice(i, 1)[0]! : outs.pop()!;
                }
                const dx = next[0] - cx, dy = next[1] - cy;
                if (dx === runDx && dy === runDy) {
                    run++;
                } else {
                    d += runDx ? `h${runDx * run}` : `v${runDy * run}`;
                    runDx = dx;
                    runDy = dy;
                    run = 1;
                }
                cx = next[0];
                cy = next[1];
            }
            d += 'z';   // z draws the final straight run back to the M point
        }
    }
    return d;
}

const escapeXml = (s: string) =>
    s.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));

// Multi-layer art exports one <g> per layer (bottom→top, painter's order —
// pixels hidden under upper layers stay intact in their own group), one path
// per color inside. Single-layer art has no structure worth keeping, so each
// 4-connected same-color region becomes its own editable path instead.
export function editorDataToSVGMarkup(editorData: EditorData): string {
    const w = editorData.width;
    const h = editorData.height;
    const colors = editorData.colors;
    let body = '';
    if (editorData.layers.length > 1) {
        const usedIds = new Set<string>();
        editorData.layers.forEach((layer, li) => {
            const byColor = new Map<number, Set<string>>();
            // Legacy arts from the API can lack layer offsets — NaN coords
            // would silently clip every pixel out of the export.
            const lx = layer.x || 0;
            const ly = layer.y || 0;
            for (const [key, ci] of Object.entries(layer.pixels)) {
                if (ci === undefined || ci === -1 || !colors[ci]) continue;
                const sep = key.indexOf('_');
                const x = +key.slice(0, sep) + lx;
                const y = +key.slice(sep + 1) + ly;
                if (x < 0 || x >= w || y < 0 || y >= h) continue;
                let set = byColor.get(ci);
                if (!set) byColor.set(ci, set = new Set());
                set.add(`${x}_${y}`);
            }
            if (!byColor.size) return;
            const name = layer.name || `Layer ${li + 1}`;
            // Vector editors read <g id> as the layer name (spaces aren't valid
            // in XML ids — data-name carries the original, as Illustrator does).
            let id = name.replace(/[^A-Za-z0-9_-]+/g, '_') || `layer_${li + 1}`;
            while (usedIds.has(id)) id += '_';
            usedIds.add(id);
            body += `<g id="${id}" data-name="${escapeXml(name)}">`;
            for (const ci of [...byColor.keys()].sort((a, b) => a - b)) {
                body += `<path fill="${escapeXml(colors[ci]!)}" fill-rule="evenodd" d="${traceCellLoops(byColor.get(ci)!)}"/>`;
            }
            body += '</g>';
        });
    } else {
        const map = layers2MapNumbers(editorData);
        const seen = new Set<string>();
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const k = `${x}_${y}`;
                const ci = map[k];
                if (ci === undefined || seen.has(k) || !colors[ci]) continue;
                const cells = new Set<string>([k]);
                seen.add(k);
                const queue: [number, number][] = [[x, y]];
                while (queue.length) {
                    const [qx, qy] = queue.pop()!;
                    for (const [nx, ny] of [[qx + 1, qy], [qx - 1, qy], [qx, qy + 1], [qx, qy - 1]]) {
                        const nk = `${nx}_${ny}`;
                        if (nx < 0 || nx >= w || ny < 0 || ny >= h || seen.has(nk) || map[nk] !== ci) continue;
                        seen.add(nk);
                        cells.add(nk);
                        queue.push([nx, ny]);
                    }
                }
                body += `<path fill="${escapeXml(colors[ci]!)}" fill-rule="evenodd" d="${traceCellLoops(cells)}"/>`;
            }
        }
    }
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${body}</svg>`;
}

export function editorDataToSVG(editorData: EditorData) {
    const blob = new Blob([editorDataToSVGMarkup(editorData)], {type: 'image/svg+xml'});
    return URL.createObjectURL(blob);
}

export function editorDataToJSON(editorData: EditorData) {
    const blob = new Blob([JSON.stringify({
        colors: editorData.colors,
        map: layers2MapNumbers(editorData)
    }, null, 2)], {type: 'application/json'});
    return URL.createObjectURL(blob);
}

/**
 * Read an image 1:1 — every source pixel becomes one cell, no resampling, no
 * palette guessing. Transparent pixels (alpha < 128) come back as null.
 * Refuses images larger than maxSide per axis (that's converter territory).
 */
export async function dataUrlToOriginalGrid(dataUrl: string, maxSide = 256): Promise<{
    grid: (RGB | null)[][];
    tooLarge: boolean;
}> {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return {grid: [], tooLarge: false};
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = dataUrl;
        });
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) return {grid: [], tooLarge: false};
        if (w > maxSide || h > maxSide) return {grid: [], tooLarge: true};
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h).data;
        const grid: (RGB | null)[][] = [];
        for (let y = 0; y < h; y++) {
            const row: (RGB | null)[] = [];
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                row.push(data[i + 3]! < 128 ? null : [data[i]!, data[i + 1]!, data[i + 2]!]);
            }
            grid.push(row);
        }
        return {grid, tooLarge: false};
    } catch {
        return {grid: [], tooLarge: false};
    }
}

/**
 * Builds the iso diamond lattice into the given `Path2D`. Path coordinates
 * are in canvas pixels relative to (0, 0) — callers translate to artOffset
 * before stroking. Caller is responsible for any clipping.
 *
 * Guards: returns without writing if cellW<1, cellH<1, or art smaller than cell.
 */
export function buildIsoPath(
    path: Path2D,
    zoom: number,
    artW: number,
    artH: number,
    cellW: number,
    cellH: number,
): void {
    if (cellW < 1 || cellH < 1) return;
    if (artW < cellW || artH < cellH) return;

    const artPxW = artW * zoom;
    const artPxH = artH * zoom;

    // The diamond lattice IS two families of parallel lines (slope ±cellH/cellW),
    // so emit long lines instead of per-diamond quads — O(rows+cols) segments,
    // not O(rows×cols), and every shared edge drawn once. The caller clips to
    // the board rect, so lines just span the full width.
    const s = cellH / cellW;                 // |slope| of both families
    const step = cellH * zoom;               // vertical spacing between parallels
    const halfH = cellH * zoom / 2;          // lattice phase (diamond vertices)
    const y0 = (x: number, c: number) => s * x + c;   // family "+": y = s·x + c
    const y1 = (x: number, c: number) => -s * x + c;  // family "−": y = −s·x + c

    // Family +s: c = y − s·x over the art rect ⇒ c ∈ [−s·W, H], phased at −halfH.
    {
        const cMin = -s * artPxW - halfH;
        const cMax = artPxH + halfH;
        const first = Math.ceil((cMin + halfH) / step) * step - halfH;
        for (let c = first; c <= cMax; c += step) {
            path.moveTo(0.5, Math.round(y0(0, c)) + 0.5);
            path.lineTo(Math.round(artPxW) + 0.5, Math.round(y0(artPxW, c)) + 0.5);
        }
    }
    // Family −s: c = y + s·x ⇒ c ∈ [0, H + s·W], phased at +halfH.
    {
        const cMax = artPxH + s * artPxW + halfH;
        const first = Math.ceil((0 - halfH) / step) * step + halfH;
        for (let c = first; c <= cMax; c += step) {
            path.moveTo(0.5, Math.round(y1(0, c)) + 0.5);
            path.lineTo(Math.round(artPxW) + 0.5, Math.round(y1(artPxW, c)) + 0.5);
        }
    }
}


// ═══ Legacy sampled-import pipeline ═════════════════════════════════════════
// Restored for the editor's file-import ('filter') and Insert image flows —
// the gradient-erosion + line-score sampler handles those inputs better than
// the pixel-reconstruct port (which /convert and the tile slicer still use).
// Constants for better maintainability
const COLOR_DIFFERENCE_THRESHOLD = 0.05;
const TRANSPARENT_COLOR_ATTEMPTS = 30;
const GRADIENT_EROSION_ITERATIONS = 50;
const LINE_LENGTH = 11;
const MIN_LINE_SCORE = 6;
const CROP_PADDING = 1;
const MIN_STREAK_LENGTH = 4;
const SCORE_EROSION_THRESHOLD = 0.8;
const GRID_GAP_THRESHOLD = 2;
const CENTER_SAMPLE_RATIO = 0.5;
const QUARTER_SAMPLE_RATIO = 0.25;
const MIN_SAMPLES = 3;
const NORMALIZATION_FACTOR = 200;

type CropBounds = { x1: number; y1: number; x2: number; y2: number };
type SamplesGrid = RGB[][];

// Memory pool for color processing to reduce GC pressure
const colorProcessingPool = {
    histogram: new Map<string, number>(),
    clear() {
        this.histogram.clear();
    }
};
// Helper functions for optimized image processing
async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
        if (img.complete) resolve(img);
    });
}

function findUnusedColor(imageData: ImageData): RGB | null {
    const usedColors = new Set<string>();
    const {data} = imageData;

    // First pass: collect all used colors
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) { // Only non-transparent pixels
            const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
            usedColors.add(key);
        }
    }

    // Find unused color
    for (let attempts = 0; attempts < TRANSPARENT_COLOR_ATTEMPTS; attempts++) {
        const color: RGB = [
            Math.floor(Math.random() * 256),
            Math.floor(Math.random() * 256),
            Math.floor(Math.random() * 256)
        ];
        const key = color.join(',');
        if (!usedColors.has(key)) {
            return color;
        }
    }

    return null;
}

function handleTransparency(imageData: ImageData, ctx: CanvasRenderingContext2D): RGB | null {
    const unusedColor = findUnusedColor(imageData);

    if (unusedColor) {
        const {data} = imageData;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) {
                data[i] = unusedColor[0];
                data[i + 1] = unusedColor[1];
                data[i + 2] = unusedColor[2];
                data[i + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    return unusedColor;
}

function calculateLineScore(line: number[], centerIndex: number): number {
    let score = 1;

    // Check forward direction
    for (let i = centerIndex + 1; i < line.length; i++) {
        if (line[i] > 0) score++;
        else break;
    }

    // Check backward direction
    for (let i = centerIndex - 1; i >= 0; i--) {
        if (line[i] > 0) score++;
        else break;
    }

    return score;
}

function processCellColorsOptimized(ctx: CanvasRenderingContext2D, cells: Array<{
    x: number, y: number, width: number, height: number
}>): RGB[] {
    const results: RGB[] = [];
    const histogram = colorProcessingPool.histogram;

    for (const cell of cells) {
        try {
            // Early bounds checking
            if (cell.width <= 0 || cell.height <= 0) {
                results.push([255, 255, 255]);
                continue;
            }

            const imageData = ctx.getImageData(cell.x, cell.y, cell.width, cell.height);
            histogram.clear();

            // Optimized histogram building
            const {data} = imageData;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] > 0) {
                    const key = data[i] + ',' + data[i + 1] + ',' + data[i + 2];
                    histogram.set(key, (histogram.get(key) || 0) + 1);
                }
            }

            // Find most common color
            let maxCount = 0;
            let bestColor = '255,255,255';

            for (const [color, count] of histogram) {
                if (count > maxCount) {
                    maxCount = count;
                    bestColor = color;
                }
            }

            const rgb = bestColor.split(',').map(Number) as RGB;
            results.push(rgb);
        } catch (e) {
            results.push([255, 255, 255]);
        }
    }

    return results;
}

export async function dataUrlToSamplesGrid(dataUrl: string): Promise<{
    rgbSamplesGrid: SamplesGrid;
    colorThatRepresentsTransparent: RGB | null
}> {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        return {rgbSamplesGrid: [], colorThatRepresentsTransparent: null};
    }

    let colorThatRepresentsTransparent: RGB | null = null;

    try {
        // Optimized image loading
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = dataUrl;
            if (img.complete) resolve(img);
        });

        // Early return for invalid dimensions
        if (!img.width || !img.height || img.width < 1 || img.height < 1) {
            return {rgbSamplesGrid: [], colorThatRepresentsTransparent: null};
        }

        // Handle small images - optimized path
        if (img.width < 70 || img.height < 70) {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d", {willReadFrequently: true});
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                return test70(ctx);
            }
        }

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        // Optimized context options
        const ctx = canvas.getContext("2d", {
            willReadFrequently: true,
            desynchronized: true
        });

        if (!ctx) return {rgbSamplesGrid: [], colorThatRepresentsTransparent: null};

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        colorThatRepresentsTransparent = handleTransparency(imageData, ctx);

        // Avoid re-encoding if no changes made
        const processedDataUrl = colorThatRepresentsTransparent
            ? canvas.toDataURL('image/png')
            : dataUrl;

        const rgbSamplesGrid = await base64ImageUrlToRGBSamplesGrid(processedDataUrl);

        return {rgbSamplesGrid, colorThatRepresentsTransparent};
    } catch (error) {
        console.error('Error processing image in dataUrlToSamplesGrid:', error);
        return {rgbSamplesGrid: [], colorThatRepresentsTransparent: null};
    } finally {
        colorProcessingPool.clear();
    }
}

async function base64ImageUrlToRGBSamplesGrid(url: string): Promise<SamplesGrid> {
    const img = await loadImage(url);

    const canvasIn = imageToCanvas(img);
    const canvasOut = imageToCanvas(img);
    if (!canvasIn || !canvasOut) return [];

    const ctxIn = canvasIn.getContext("2d", {willReadFrequently: true});
    const ctxOut = canvasOut.getContext("2d", {willReadFrequently: true});
    if (!ctxIn || !ctxOut) return [];

    const imageDataIn = ctxIn.getImageData(0, 0, canvasIn.width, canvasIn.height);
    const imageDataOut = ctxOut.getImageData(0, 0, canvasOut.width, canvasOut.height);

    const {width: pixelWidth, height: pixelHeight} = canvasIn;
    const gradientData = computeImageDataGradient(imageDataIn, COLOR_DIFFERENCE_THRESHOLD);

    // Optimized gradient erosion
    const pixelsToProcess: Array<{ x: number, y: number }> = [];
    for (let y = 0; y < gradientData.length; y++) {
        if (!gradientData[y]) continue;
        for (let x = 0; x < gradientData[y].length; x++) {
            if (gradientData[y][x] > 0) {
                pixelsToProcess.push({x, y});
            }
        }
    }

    for (let iteration = 0; iteration < GRADIENT_EROSION_ITERATIONS; iteration++) {
        const erasures: Array<{ x: number, y: number }> = [];
        const centerIndex = Math.floor(LINE_LENGTH / 2);

        for (const {x, y} of pixelsToProcess) {
            if (gradientData[y][x] === 0) continue;

            const {v, h} = extractCardinalLinesAtPoint(gradientData, x, y, LINE_LENGTH);
            const vSum = calculateLineScore(v, centerIndex);
            const hSum = calculateLineScore(h, centerIndex);

            if (hSum < MIN_LINE_SCORE && vSum < MIN_LINE_SCORE) {
                erasures.push({x, y});
            }
        }

        if (erasures.length === 0) break;

        // Batch erasure
        for (const {x, y} of erasures) {
            gradientData[y][x] = 0;
        }
    }

    // Update output image data
    for (let py = 0; py < pixelHeight; py++) {
        if (!gradientData[py]) continue;
        for (let px = 0; px < pixelWidth; px++) {
            const gradient = gradientData[py][px] * 255;
            const pixelIndex = (px + py * pixelWidth) * 4;
            const value = gradient > 0 ? 127 : 0;

            imageDataOut.data[pixelIndex] = value;
            imageDataOut.data[pixelIndex + 1] = value;
            imageDataOut.data[pixelIndex + 2] = value;
        }
    }
    ctxOut.putImageData(imageDataOut, 0, 0);

    // Calculate crop bounds based on gradient image
    const crop: CropBounds = {
        x1: canvasIn.width / 2,
        y1: canvasIn.height / 2,
        x2: canvasIn.width / 2,
        y2: canvasIn.height / 2
    };

    for (let py = 0; py < pixelHeight; py++) {
        if (!gradientData[py]) continue;
        for (let px = 0; px < pixelWidth; px++) {
            if (gradientData[py][px] > 0) {
                crop.x1 = Math.min(crop.x1, px);
                crop.y1 = Math.min(crop.y1, py);
                crop.x2 = Math.max(crop.x2, px);
                crop.y2 = Math.max(crop.y2, py);
            }
        }
    }

    crop.x1 = Math.max(0, crop.x1 - CROP_PADDING);
    crop.y1 = Math.max(0, crop.y1 - CROP_PADDING);

    const croppedGradData = ctxOut.getImageData(crop.x1, crop.y1, crop.x2 - crop.x1, crop.y2 - crop.y1);
    canvasOut.width = crop.x2 - crop.x1;
    canvasOut.height = crop.y2 - crop.y1;
    ctxOut.putImageData(croppedGradData, 0, 0);

    const croppedGradientData: number[][] = [];
    for (let py = 0; py < pixelHeight; py++) {
        if (py > crop.y1 && py < crop.y2 && gradientData[py]) {
            croppedGradientData.push(gradientData[py].slice(crop.x1, crop.x2));
        }
    }

    // Calculate row and column scores
    const rowScores: number[] = [];
    for (let i = 0; i < croppedGradientData.length; i++) {
        const row = croppedGradientData[i];
        let streak = 0;
        let score = 0;
        for (const pixel of row) {
            streak = pixel > 0 ? streak + 1 : 0;
            score = streak > MIN_STREAK_LENGTH ? score + 1 : score;
        }
        rowScores[i] = score;
    }

    const columnScores: number[] = [];
    if (croppedGradientData.length === 0) return [];

    for (let c = 0; c < croppedGradientData[0].length; c++) {
        let streak = 0;
        let score = 0;
        for (let r = 0; r < croppedGradientData.length; r++) {
            const pixel = croppedGradientData[r][c];
            streak = pixel > 0 ? streak + 1 : 0;
            score = streak > MIN_STREAK_LENGTH ? score + 1 : score;
        }
        columnScores[c] = score;
    }

    // Erode scores to remove noise
    const rowScoreSum = rowScores.reduce((a, v) => a + v, 0);
    const columnScoreSum = columnScores.reduce((a, v) => a + v, 0);

    let remainingPortion = 1;
    while (remainingPortion > SCORE_EROSION_THRESHOLD) {
        for (let i = 0; i < rowScores.length; i++) {
            rowScores[i] = Math.max(0, rowScores[i] - 1);
        }
        remainingPortion = rowScores.reduce((a, v) => a + v, 0) / rowScoreSum;
    }

    remainingPortion = 1;
    while (remainingPortion > SCORE_EROSION_THRESHOLD) {
        for (let i = 0; i < columnScores.length; i++) {
            columnScores[i] = Math.max(0, columnScores[i] - 1);
        }
        remainingPortion = columnScores.reduce((a, v) => a + v, 0) / columnScoreSum;
    }

    // Pool contiguous score groups
    for (const scores of [rowScores, columnScores]) {
        let batchMax = 0;
        let batchMaxIndex: number | null = null;
        let batchSum = 0;
        for (let i = 0; i < scores.length; i++) {
            const s = scores[i];
            if (s === 0) {
                if (batchMaxIndex !== null) {
                    scores[batchMaxIndex] = batchSum;
                    batchMaxIndex = null;
                    batchSum = 0;
                    batchMax = 0;
                }
            } else {
                batchSum += s;
                if (s > batchMax) {
                    batchMaxIndex = i;
                    batchMax = s;
                }
                scores[i] = 0;
            }
        }
    }

    // Get gap histograms
    const rowGapHist: { [key: string]: number } = {};
    const columnGapHist: { [key: string]: number } = {};

    for (const {scores, hist} of [{scores: rowScores, hist: rowGapHist}, {scores: columnScores, hist: columnGapHist}]) {
        let indexOfLastNonZero: number | null = null;
        for (let i = 0; i < scores.length; i++) {
            if (scores[i] !== 0) {
                if (indexOfLastNonZero !== null) {
                    const gap = i - indexOfLastNonZero;
                    hist[gap] = (hist[gap] || 0) + 1;
                }
                indexOfLastNonZero = i;
            }
        }
    }

    let rowGap: number;
    let columnGap: number;

    if (Object.values(rowGapHist).reduce((a, v) => a + v, 0) < MIN_SAMPLES || Object.values(columnGapHist).reduce((a, v) => a + v, 0) < MIN_SAMPLES) {
        // Fallback to simple grid
        rowGap = 3;
        columnGap = 3;
        crop.x1 = 0;
        crop.y1 = 0;
        crop.x2 = canvasIn.width;
        crop.y2 = canvasIn.height;
        rowScores.length = 0;
        columnScores.length = 0;
        rowScores.push(...new Array(Math.round(canvasIn.height)).fill(0).map((_, i) => i % rowGap ? 0 : 1));
        columnScores.push(...new Array(Math.round(canvasIn.width)).fill(0).map((_, i) => i % columnGap ? 0 : 1));
    } else {
        rowGap = Number(Object.entries(rowGapHist).sort((a, b) => b[1] - a[1])[0][0]);
        columnGap = Number(Object.entries(columnGapHist).sort((a, b) => b[1] - a[1])[0][0]);
    }

    const gap = Math.abs(rowGap - columnGap) > GRID_GAP_THRESHOLD
        ? Math.min(rowGap, columnGap)
        : Math.round((rowGap + columnGap) / 2);

    // Fill in gaps and remove outliers
    for (const scores of [rowScores, columnScores]) {
        let indexOfLastNonZero = -1;
        let processedFirstNonZero = false;
        for (let i = 0; i < scores.length; i++) {
            if (scores[i] !== 0 || i === scores.length - 1) {
                const distance = i - indexOfLastNonZero;
                const multiple = distance / gap;
                const notchesToAdd = Math.round(multiple - 1);
                if (notchesToAdd > 0) {
                    const notchSpacing = Math.round(distance / (notchesToAdd + 1));
                    for (let j = 1; j <= notchesToAdd; j++) {
                        const index = i - (j * notchSpacing);
                        if (index >= 0) {
                            scores[index] = 0.5;
                        }
                    }
                }
                if (multiple < 0.5 && processedFirstNonZero) {
                    scores[i] = -1; // Delete line
                } else {
                    indexOfLastNonZero = i;
                }
                processedFirstNonZero = true;
            }
        }
    }

    // Get cropped image data for sampling
    const croppedOrigImageData = ctxIn.getImageData(crop.x1, crop.y1, crop.x2 - crop.x1, crop.y2 - crop.y1);
    canvasOut.width = crop.x2 - crop.x1;
    canvasOut.height = crop.y2 - crop.y1;
    ctxOut.putImageData(croppedOrigImageData, 0, 0);

    // Optimized sampling with batch processing
    const samplesGrid: SamplesGrid = [];
    const cellBounds: Array<{ x: number, y: number, width: number, height: number }> = [];
    const cellMap = new Map<string, number>();

    let lastNonZeroRowIndex = -1;
    let lastNonZeroColumnIndex = -1;
    let rowIndex = 0;

    // First pass: collect all cell bounds
    for (let r = 0; r < rowScores.length; r++) {
        if (rowScores[r] > 0 || r === rowScores.length - 1) {
            if (r - lastNonZeroRowIndex < CENTER_SAMPLE_RATIO * gap) {
                lastNonZeroRowIndex = r;
                continue;
            }

            let colIndex = 0;
            lastNonZeroColumnIndex = -1;

            for (let c = 0; c < columnScores.length; c++) {
                if (columnScores[c] > 0 || c === columnScores.length - 1) {
                    if (c - lastNonZeroColumnIndex < CENTER_SAMPLE_RATIO * gap) {
                        lastNonZeroColumnIndex = c;
                        continue;
                    }

                    const cellWidth = c - lastNonZeroColumnIndex;
                    const cellHeight = r - lastNonZeroRowIndex;
                    const centerX = c - (cellWidth / 2);
                    const centerY = r - (cellHeight / 2);

                    const sampleX = Math.round(centerX - (cellWidth * QUARTER_SAMPLE_RATIO));
                    const sampleY = Math.round(centerY - (cellHeight * QUARTER_SAMPLE_RATIO));
                    const sampleWidth = Math.round(cellWidth / 2);
                    const sampleHeight = Math.round(cellHeight / 2);

                    cellBounds.push({
                        x: sampleX,
                        y: sampleY,
                        width: sampleWidth,
                        height: sampleHeight
                    });

                    cellMap.set(`${rowIndex}_${colIndex}`, cellBounds.length - 1);
                    colIndex++;
                    lastNonZeroColumnIndex = c;
                }
            }

            rowIndex++;
            lastNonZeroRowIndex = r;
        }
    }

    // Second pass: batch process all cells
    const cellColors = processCellColorsOptimized(ctxOut, cellBounds);

    // Third pass: reconstruct grid
    for (let r = 0; r < rowIndex; r++) {
        samplesGrid[r] = [];
        for (let c = 0; ; c++) {
            const cellIndex = cellMap.get(`${r}_${c}`);
            if (cellIndex === undefined) break;
            samplesGrid[r][c] = cellColors[cellIndex];
        }
    }

    return samplesGrid;
}

function extractCardinalLinesAtPoint(grid: number[][], cx: number, cy: number, lineLength: number): {
    v: number[];
    h: number[]
} {
    if (lineLength % 2 === 0) {
        throw new Error("Line length must be odd");
    }

    const radius = Math.floor(lineLength / 2);
    const v: number[] = [];
    const h: number[] = [];

    // Horizontal line
    for (let x = cx - radius; x <= cx + radius; x++) {
        const value = (grid[cy] && grid[cy][x] !== undefined) ? grid[cy][x] : 0;
        h.push(value);
    }

    // Vertical line
    for (let y = cy - radius; y <= cy + radius; y++) {
        const value = (grid[y] && grid[y][cx] !== undefined) ? grid[y][cx] : 0;
        v.push(value);
    }

    return {v, h};
}

function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement | null {
    if (!img.width || !img.height) return null;

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext("2d", {willReadFrequently: true});
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, img.width, img.height);

    return canvas;
}

function computeImageDataGradient(imageData: ImageData, threshold: number): number[][] {
    const {width: pixelWidth, height: pixelHeight, data} = imageData;
    const gradientData: number[][] = Array(pixelHeight).fill(null).map(() => Array(pixelWidth).fill(0));

    // Initialize gradientData grid
    for (let py = 0; py < pixelHeight; py++) {
        gradientData[py] = Array(pixelWidth).fill(0);
    }

    for (let py = 1; py < pixelHeight; py++) {
        if (!gradientData[py]) continue;
        for (let px = 1; px < pixelWidth; px++) {
            const pixelIndex = (px + py * pixelWidth) * 4;

            // Bounds checking for neighboring pixels
            if (pixelIndex - 4 < 0 || pixelIndex - pixelWidth * 4 < 0) continue;

            // Horizontal gradient
            const rgb1: RGB = [data[pixelIndex], data[pixelIndex + 1], data[pixelIndex + 2]];
            const rgb2: RGB = [data[pixelIndex - 4], data[pixelIndex - 3], data[pixelIndex - 2]];
            const hDiff = deltaE(rgb1, rgb2);

            // Vertical gradient
            const rgb3: RGB = [data[pixelIndex - pixelWidth * 4], data[pixelIndex - pixelWidth * 4 + 1], data[pixelIndex - pixelWidth * 4 + 2]];
            const vDiff = deltaE(rgb1, rgb3);

            // Combined and normalized gradient
            const gradientValue = (vDiff + hDiff) / NORMALIZATION_FACTOR;
            gradientData[py][px] = gradientValue < threshold ? 0 : gradientValue;
        }
    }

    return gradientData;
}

function deltaE(rgbA: RGB, rgbB: RGB): number {
    const labA = rgb2lab(rgbA);
    const labB = rgb2lab(rgbB);

    if (!labA || !labB) return 0;

    const [lA, aA, bA] = labA;
    const [lB, aB, bB] = labB;

    const deltaL = lA - lB;
    const deltaA = aA - aB;
    const deltaB = bA - bB;

    const cA = Math.sqrt(aA * aA + bA * bA);
    const cB = Math.sqrt(aB * aB + bB * bB);
    const deltaC = cA - cB;

    const deltaH = Math.sqrt(Math.max(0, deltaA * deltaA + deltaB * deltaB - deltaC * deltaC));

    const sc = 1.0 + 0.045 * cA;
    const sh = 1.0 + 0.015 * cA;

    const deltaLKlsl = deltaL;
    const deltaCkcsc = deltaC / sc;
    const deltaHkhsh = deltaH / sh;

    const i = deltaLKlsl * deltaLKlsl + deltaCkcsc * deltaCkcsc + deltaHkhsh * deltaHkhsh;

    return Math.sqrt(Math.max(0, i));
}

function rgb2lab(rgb: RGB): [number, number, number] | null {
    const [rRaw, gRaw, bRaw] = rgb;

    if (rRaw === undefined || gRaw === undefined || bRaw === undefined) return null;

    let r = rRaw / 255;
    let g = gRaw / 255;
    let b = bRaw / 255;

    // Convert RGB to linear RGB
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

    // Convert linear RGB to XYZ
    let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    let y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
    let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;

    // Convert XYZ to Lab
    const xyzToLab = (val: number): number =>
        val > 0.008856 ? Math.pow(val, 1 / 3) : (7.787 * val) + 16 / 116;

    x = xyzToLab(x);
    y = xyzToLab(y);
    z = xyzToLab(z);

    return [(116 * y) - 16, 500 * (x - y), 200 * (y - z)];
}

async function test70(ctx: CanvasRenderingContext2D): Promise<{
    rgbSamplesGrid: SamplesGrid;
    colorThatRepresentsTransparent: null
}> {
    const {width, height} = ctx.canvas;
    const rgbSamplesGrid: SamplesGrid = [];

    for (let y = 0; y < height; y++) {
        const row: RGB[] = [];
        for (let x = 0; x < width; x++) {
            const pixelData = ctx.getImageData(x, y, 1, 1);
            const [r, g, b, a] = pixelData.data;

            if (r + g + b + a !== 0) {
                row.push([r, g, b]);
            } else {
                row.push([255, 255, 255]);
            }
        }
        rgbSamplesGrid.push(row);
    }

    return {rgbSamplesGrid, colorThatRepresentsTransparent: null};
}

