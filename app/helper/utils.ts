import type {EditorData, SharedPage} from "~/types";

export const debounce = <T extends Function>(fn: T, ms: number = 300): T => {
    let timeoutId: ReturnType<typeof setTimeout>;

    return function (this: any, ...args: any[]) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), ms);
    } as unknown as T; // Cast the result back to the original function type
};

export function cloneDeep<T>(value: T): T {
    const visited = new WeakMap();

    function _clone(val: any): any {
        if (val === null || typeof val !== 'object') return val;

        if (visited.has(val)) return visited.get(val);

        if (val instanceof Date) return new Date(val.getTime());

        if (val instanceof RegExp) return new RegExp(val.source, val.flags);

        if (Array.isArray(val)) {
            const arr: any[] = [];
            visited.set(val, arr);
            for (let i = 0; i < val.length; i++) {
                arr[i] = _clone(val[i]);
            }
            return arr;
        }

        if (val instanceof Map) {
            const map = new Map();
            visited.set(val, map);
            for (const [key, v] of val.entries()) {
                map.set(_clone(key), _clone(v));
            }
            return map;
        }

        if (val instanceof Set) {
            const set = new Set();
            visited.set(val, set);
            for (const v of val.values()) {
                set.add(_clone(v));
            }
            return set;
        }

        if (val instanceof ArrayBuffer) {
            return val.slice(0);
        }
        if (ArrayBuffer.isView(val)) {
            return new (val.constructor as any)(val);
        }

        const obj: Record<string, any> = {};
        visited.set(val, obj);
        for (const key in val) {
            if (Object.prototype.hasOwnProperty.call(val, key)) {
                obj[key] = _clone(val[key]);
            }
        }
        return obj;
    }

    return _clone(value);
}

export function generateUUID() {
    return crypto.randomUUID().toString();
}

export function sharedPage2EditorData(res: SharedPage, c?: {
    id: string | number;
    id_string: string;
    template: number | null;
}): EditorData {
    const is_public = res.status === 'public';
    return {
        id: res.id,
        id_string: res.id_string,
        name: res.name,
        desc: res.desc,
        version: 1,
        tags: res.taxonomies.map(x => x.name),
        width: res.width || 16,
        height: res.height || 16,
        colors: res.colors || ["#000000"],
        layers: res.layers?.length ? res.layers : [{
            name: 'Layer 1',
            pixels: {},
            x: 0,
            y: 0
        }],
        updated: res.updated,
        status: res.status,
        meta: res.meta ?? {},
        ...c,
        is_public
    }
}

export function key2Point(key: string) {
    const arr = key.split('_').map(Number);
    const x = arr[0] ?? 0
    const y = arr[1] ?? 0
    return {x, y}
}

export const isNumeric = (str: string | number) => {
    if (typeof str === 'number') return true;
    if (str === "") return false;
    return Number.isFinite(Number(str));
}

export function getStorageItem(key: string) {
    try {
        const data = localStorage.getItem(key)
        if (data) return JSON.parse(data);
    } catch (error) {
        console.warn(`Failed to parse localStorage item "${key}":`, error)
    }
    return {}
}