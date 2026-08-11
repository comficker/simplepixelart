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

export function findRectangles(editorData: EditorData, layerPixels: { [key: string]: number }): Rectangle[] {
    const rectangles: Rectangle[] = [];
    const visited: { [key: string]: boolean } = {}

    for (let y = 0; y < editorData.height; y++) {
        for (let x = 0; x < editorData.width; x++) {
            if (typeof layerPixels[`${x}_${y}`] == 'undefined' || visited[`${x}_${y}`] || layerPixels[`${x}_${y}`] === -1) continue;

            const colorIndex = layerPixels[`${x}_${y}`];
            const color = editorData.colors[colorIndex!] || '#000';

            // Find the largest rectangle starting from this position
            let width = 1;
            let height = 1;

            // Extend width
            for (let w = x + 1; w < editorData.width; w++) {
                if (layerPixels[`${w}_${y}`] !== colorIndex || visited[`${w}_${y}`]) break;
                width++;
            }

            // Extend height, but check if the entire width matches
            heightLoop: for (let h = y + 1; h < editorData.height; h++) {
                for (let w = 0; w < width; w++) {
                    const nx = x + w;
                    const ny = h;
                    if (ny >= editorData.height || layerPixels[`${nx}_${ny}`] !== colorIndex || visited[`${nx}_${ny}`]) {
                        break heightLoop;
                    }
                }
                height++;
            }

            // Mark all pixels in this rectangle as visited
            for (let dy = 0; dy < height; dy++) {
                for (let dx = 0; dx < width; dx++) {
                    visited[`${x + dx}_${y + dy}`] = true;
                }
            }

            rectangles.push({
                x: x,
                y: y,
                width: width,
                height: height,
                color: color
            });
        }
    }

    return rectangles;
}

export function editorDataToSVG(editorData: EditorData) {
    const w = editorData.width;
    const h = editorData.height;
    const results = layers2MapNumbers(editorData);
    let svgContent = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;
    const rectangles = findRectangles(editorData, results);
    if (rectangles.length > 0) {
        svgContent += `<g>`;
        rectangles.forEach(rect => {
            const color = rect.color;
            svgContent += `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${color}"/>`;
        });
        svgContent += '</g>';
    }
    svgContent += '</svg>';

    const blob = new Blob([svgContent], {type: 'image/svg+xml'});
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

