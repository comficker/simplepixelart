// @ts-nocheck
import type {EditorData, Layer} from "~/types";
import {hexToRgb} from "~/helper/color";

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
            let runDx = cx - sx, runDy = cy - sy;
            let run = 1;
            d += `M${sx} ${sy}`;
            while (cx !== sx || cy !== sy) {
                const outs = edges.get(`${cx}_${cy}`)!;
                let next: [number, number];
                if (outs.length === 1) {
                    next = outs.pop()!;
                } else {
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
            d += 'z';
        }
    }
    return d;
}

const escapeXml = (s: string) =>
    s.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));

export function editorDataToSVGMarkup(editorData: EditorData): string {
    const w = editorData.width;
    const h = editorData.height;
    const colors = editorData.colors;
    let body = '';
    if (editorData.layers.length > 1) {
        const usedIds = new Set<string>();
        editorData.layers.forEach((layer, li) => {
            const byColor = new Map<number, Set<string>>();
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

    const s = cellH / cellW;
    const step = cellH * zoom;
    const halfH = cellH * zoom / 2;
    const y0 = (x: number, c: number) => s * x + c;
    const y1 = (x: number, c: number) => -s * x + c;

    {
        const cMin = -s * artPxW - halfH;
        const cMax = artPxH + halfH;
        const first = Math.ceil((cMin + halfH) / step) * step - halfH;
        for (let c = first; c <= cMax; c += step) {
            path.moveTo(0.5, Math.round(y0(0, c)) + 0.5);
            path.lineTo(Math.round(artPxW) + 0.5, Math.round(y0(artPxW, c)) + 0.5);
        }
    }
    {
        const cMax = artPxH + s * artPxW + halfH;
        const first = Math.ceil((0 - halfH) / step) * step + halfH;
        for (let c = first; c <= cMax; c += step) {
            path.moveTo(0.5, Math.round(y1(0, c)) + 0.5);
            path.lineTo(Math.round(artPxW) + 0.5, Math.round(y1(artPxW, c)) + 0.5);
        }
    }
}
