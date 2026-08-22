import {hexToRgb} from "~/helper/color";
import {compositeFrame, layers2MapNumbers} from "~/helper/canvas";
import type {AnimationFrame, AnimationTag, Layer} from "~/types";

export function exportScale(width: number, height: number): number {
    return Math.max(1, Math.min(16, Math.round(320 / Math.max(width, height)) || 1));
}

function indexedFrame(frame: AnimationFrame, width: number, height: number, shared: Layer[] = [], maxCi = 254): Uint8Array {
    const arr = new Uint8Array(width * height);
    const map = layers2MapNumbers({width, height, layers: [...shared, ...frame.layers]} as any);
    for (const k in map) {
        const sep = k.indexOf('_');
        const x = +k.slice(0, sep);
        const y = +k.slice(sep + 1);
        arr[y * width + x] = Math.min(map[k] as number, maxCi) + 1;
    }
    return arr;
}

function upscaleIndexed(small: Uint8Array, w: number, h: number, s: number): { data: Uint8Array; W: number; H: number } {
    if (s <= 1) return {data: small, W: w, H: h};
    const W = w * s;
    const H = h * s;
    const big = new Uint8Array(W * H);
    for (let Y = 0; Y < H; Y++) {
        const sy = (Y / s) | 0;
        for (let X = 0; X < W; X++) big[Y * W + X] = small[sy * w + ((X / s) | 0)]!;
    }
    return {data: big, W, H};
}

export async function framesToGif(
    frames: AnimationFrame[],
    width: number,
    height: number,
    colors: string[],
    opts: { fps: number; loop: boolean; bgColor?: string; scale?: number; shared?: Layer[] },
): Promise<Uint8Array> {
    const {GIFEncoder} = await import('gifenc');
    const scale = opts.scale ?? exportScale(width, height);
    const bg = hexToRgb(opts.bgColor || '#FFFFFF');
    const shared = opts.shared || [];
    const palette = [bg, ...colors.slice(0, 255).map(c => hexToRgb(c))];
    const maxCi = palette.length - 2;
    const enc = GIFEncoder();
    frames.forEach((f, i) => {
        const {data, W, H} = upscaleIndexed(indexedFrame(f, width, height, shared, maxCi), width, height, scale);
        const delay = f.duration ?? Math.round(1000 / opts.fps);
        enc.writeFrame(data, W, H, i === 0 ? {palette, delay, repeat: opts.loop ? 0 : -1} : {delay});
    });
    enc.finish();
    return enc.bytes();
}

export function framesToAsepriteJSON(
    frames: AnimationFrame[],
    width: number,
    height: number,
    opts: {name: string; image: string; fps: number; scale?: number; tags?: AnimationTag[]},
): string {
    const s = opts.scale ?? 1;
    const w = width * s;
    const h = height * s;
    return JSON.stringify({
        frames: frames.map((f, i) => ({
            filename: `${opts.name} ${i}`,
            frame: {x: i * w, y: 0, w, h},
            rotated: false,
            trimmed: false,
            spriteSourceSize: {x: 0, y: 0, w, h},
            sourceSize: {w, h},
            duration: f.duration ?? Math.round(1000 / opts.fps),
        })),
        meta: {
            app: 'https://simplepixelart.com',
            version: '1.0',
            image: opts.image,
            format: 'RGBA8888',
            size: {w: w * frames.length, h},
            scale: String(s),
            frameTags: (opts.tags ?? []).map(t => ({
                name: t.name,
                from: t.from,
                to: t.to,
                direction: t.direction,
            })),
            layers: [],
            slices: [],
        },
    }, null, 2);
}

export function framesToSpritesheet(
    frames: AnimationFrame[],
    width: number,
    height: number,
    colors: string[],
    scale?: number,
    shared: Layer[] = [],
): HTMLCanvasElement {
    const s = scale ?? exportScale(width, height);
    const sheet = document.createElement('canvas');
    sheet.width = width * s * frames.length;
    sheet.height = height * s;
    const ctx = sheet.getContext('2d');
    const tmp = document.createElement('canvas');
    if (ctx) {
        ctx.imageSmoothingEnabled = false;
        frames.forEach((f, i) => {
            compositeFrame(tmp, [...shared, ...f.layers], width, height, colors);
            ctx.drawImage(tmp, 0, 0, width, height, i * width * s, 0, width * s, height * s);
        });
    }
    return sheet;
}
