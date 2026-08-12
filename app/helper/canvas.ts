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

