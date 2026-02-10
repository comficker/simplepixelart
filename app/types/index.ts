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

export interface PostMetaSchema {

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
    name: string
    id_string: string
    desc: any
    meta: any
    colors: any[]
    map_numbers: { [key: string]: number }
    layers: Layer[]
    steps: Step[]
    status: string
    user: User | null
    template?: number | null
    taxonomies: Tax[]

    tags: string[]
    results?: { [key: string]: number }

    is_vote?: boolean

    collections: Collection[]
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

export interface User {
    id: number
    first_name: string
    last_name: string
    username: string,
    meta: {
        coloring: {
            current?: string,
            editor?: string
        }
    }
}

export interface SaveForm {
    is_template: boolean
    tags: string[]
    name: string
    desc: string
    status: string
    new_id_string: string
}

export interface IBreadcrumb {
    name: string
    icon?: string | null
    to: string
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
    updated: string;
    is_public: boolean;
}