import {cloneDeep} from "~/helper/utils";
import type {EditorData} from "~/types";

export const PALETTE_THEMES = [
    'Vintage', 'Retro', 'Summer', 'Fall', 'Winter', 'Spring', 'Happy', 'Nature',
    'Earth', 'Night', 'Space', 'Sunset', 'Sky', 'Sea', 'Kids', 'Skin', 'Food',
    'Cream', 'Coffee', 'Wedding', 'Christmas', 'Halloween',
] as const

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
// What others may do with a piece, chosen by its artist when publishing and
// kept in meta.license. No value means all rights reserved.
export const LICENSES = [
  {value: '', key: 'allRightsReserved', url: ''},
  {value: 'cc-by-4.0', key: 'ccBy', url: 'https://creativecommons.org/licenses/by/4.0/'},
  {value: 'cc0', key: 'cc0', url: 'https://creativecommons.org/publicdomain/zero/1.0/'},
] as const

export function licenseOf(value: string | undefined | null) {
  return LICENSES.find(l => l.value === (value || '')) || LICENSES[0]
}
