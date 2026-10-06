export interface Links {
    next: string
    previous: string
}

export interface Sizes {
    thumb_24: string
    thumb_256: string
}

export interface TagMetaSchema {

}

export interface TagSchema {
    id: number
    updated: string
    created: string
    db_status: number
    name: string
    id_string: string
    title: string
    desc: string
    meta: TagMetaSchema
    type: string
    path: string
}

export interface Step {
    type: string,
    value: any,
    t?: string,
    v?: any,
    k?: string,
    c?: number,
}

export interface Tax {
    "id": number
    "id_string": string
    "name": string
    "title": string
    "desc": string
}

export interface SharedPage {
    next: string
    id: number
    width: number
    height: number
    updated: string
    created?: string
    db_status: number
    is_template: boolean
    is_tile?: boolean
    name: string
    id_string: string
    desc: any
    meta: any
    /** List rows only: annotated flags, so the grid can skip meta entirely. */
    is_anim?: boolean
    is_ai?: boolean
    has_image?: boolean
    /** Detail only: whether /art/<slug> should be indexed. The backend owns the
     *  rule so sitemap-page.xml and the page agree. */
    indexable?: boolean
    colors: any[]
    map_numbers: { [key: string]: number }
    layers: Layer[]
    steps: Step[]
    status: string
    user: User | null
    template?: number | null
    palette?: number | null
    taxonomies: Tax[]

    tags: string[]
    results?: { [key: string]: number }

    is_vote?: boolean

    collections: Collection[]
    // The piece this one was remixed from, while that piece is public.
    template_info?: { id_string: string; name: string; username: string | null } | null;
    likes?: number;
    is_liked?: boolean;
    // Public pieces made from this one.
    remixes?: number;
}

export interface ResponseSharedPage {
    instance: any
    properties: any[]
    meta: { desc: string, title: string }
    links: Links
    count: number
    page_size: number
    num_pages: number
    results: SharedPage[]
}

export interface Palette {
    id: number
    id_string: string
    name: string
    desc?: string
    colors: string[]
    color_count: number
    like_count: number
    usage_count: number
    download_count?: number
    score?: number
    source: string
    status: string
    user?: User | null
    taxonomies?: Tax[]
    created?: string
    updated: string
}

export interface ResponsePalette {
    instance: any
    properties: any[]
    meta: { desc: string, title: string }
    links: Links
    count: number
    page_size: number
    num_pages: number
    results: Palette[]
}

export interface User {
    id: number
    first_name: string
    last_name: string
    username: string,
    is_staff?: boolean
    meta: {
        coloring: {
            current?: string,
            editor?: string
        }
    }
}

export interface Options {
    color: number,
    pointer: string,
    zoom: number,
    isMoving: boolean,
    isPainting: boolean,
    paletteFunc: string,
    boardFunc: string,
}

export interface APIResponse<T> {
    instance: any
    properties: any[]
    links: Links
    count: number
    page_size: number
    num_pages: number
    results: T[]
}

export interface Collection {
    id?: number,
    title: string,
    name: string,
    id_string: string,
    desc: string,
    items: number[],
    featured: any[][]
}

export interface Layer {
    name: string;
    pixels: {
        [key: string]: number;
    };
    x: number;
    y: number
    // Marks the editor's floating-selection layer. It is spliced into
    // editorData.layers while a selection is moved, so the UI needs to tell it
    // apart — by a flag that survives cloneDeep, not by its name, which a user
    // can type themselves.
    _virtual?: boolean
}

export interface EditorBg {
    type: 'none' | 'solid' | 'art';
    color?: string;
    artId?: string;
    artUrl?: string;
}

export interface AnimationFrame {
    id: string;
    layers: Layer[];
    duration?: number;
}

export interface AnimationTag {
    id: string;
    name: string;
    from: number;
    to: number;
    direction: 'forward' | 'reverse' | 'pingpong';
    color: string;
}

export interface EditorAnimation {
    fps: number;
    loop: boolean;
    frames: AnimationFrame[];
    shared?: Layer[];
    tags?: AnimationTag[];
}

export interface EditorMeta {
    iso?: {
        mode: 'square' | 'iso' | 'off';
        cell: { width: number; height: number };
    };
    bg?: EditorBg;
    animation?: EditorAnimation;
    // Set by the server the first time the piece goes public.
    published_at?: string;
    // What others may do with the piece: '' / absent = all rights reserved.
    license?: string;
    // Drawn by an image model (generator, editor agent). Shown as an "AI"
    // label; the server never lets an edit take it off.
    ai?: boolean;
}

export interface EditorData {
    id: number | string;
    id_string: string;
    name: string;
    desc: string;
    version: number;
    tags: string[];
    width: number;
    height: number;
    colors: string[];
    layers: Layer[];
    template?: number | null;
    palette?: number | null;
    updated: string;
    is_public: boolean;
    // What the server actually stored. A publish can land as `pending` when
    // the rights filter holds it, and the editor should say so rather than
    // report the status it asked for.
    status?: string;
    status?: string;
    meta?: EditorMeta;
}