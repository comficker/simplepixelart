import {cloneDeep, generateUUID} from "~/helper/utils";
import type {EditorData} from "~/types";

export const DEFAULT_COLORS = [
    "#000000", "#ffffff", "#ff0000", "#00ff00",
    "#ffff00", "#ff00ff", "#00ffff", "#ffa500"
].map(x => x.toUpperCase());

export const DEFAULT_LAYERS = [{
    name: 'Layer 1',
    pixels: {},
    x: 0,
    y: 0
}]

export const DEFAULT_EDITOR_DATA: EditorData = {
    id: 0,
    id_string: '',
    name: "",
    desc: "",
    tags: [],
    version: 1,
    width: 16,
    height: 16,
    colors: cloneDeep(DEFAULT_COLORS),
    layers: cloneDeep(DEFAULT_LAYERS),
    template: null,
    updated: new Date().toISOString(),
    is_public: false,
    meta: {
        iso: {
            mode: 'square',
            cell: { width: 2, height: 1 },
        },
    },
}