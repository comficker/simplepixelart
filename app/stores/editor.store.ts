import {defineStore} from 'pinia'
import type {AnimationTag, EditorData, Layer, SharedPage} from "~/types";
import {useNativeFetch} from "~/composables/useCustomFetch";
import {cloneDeep, debounce, generateUUID, getStorageItem, key2Point, sharedPage2EditorData} from "~/helper/utils";
import {DEFAULT_EDITOR_DATA} from "~/helper/constants";
import {markRaw, ref, shallowRef, toRaw} from "vue";
import {layers2MapNumbers} from "~/helper/canvas";
import {isSameColor, rgbToHex} from "~/helper/color";
import {importFileGrid, importOriginalGrid, shouldIgnoreColor} from "~/helper/pixel";
import {loadWorkspaceFull, saveWorkspaceFull, clearWorkspaceFull} from "~/helper/workspaceSnapshot";
import {toast} from "vue-sonner";

export const useEditor = defineStore('editor', () => {
    const auth = useAuthStore()
    const localTs = useLocalTilesets()

    function markRawPixels(ed: EditorData): EditorData {
        ed.layers?.forEach(l => { l.pixels = markRaw(l.pixels || {}) })
        ed.meta?.animation?.frames?.forEach(f => {
            f.layers?.forEach(l => { l.pixels = markRaw(l.pixels || {}) })
        })
        ed.meta?.animation?.shared?.forEach(l => { l.pixels = markRaw(l.pixels || {}) })
        return ed
    }

    const editorData = ref<EditorData>(markRawPixels({
        ...cloneDeep(DEFAULT_EDITOR_DATA),
        id: generateUUID(),
        updated: new Date().toISOString()
    }));
    const virtualLayer = ref<Layer>({
        name: 'Virtual',
        pixels: markRaw({}),
        x: 0,
        y: 0
    });

    const localWS = shallowRef<{ [key: string]: EditorData }>({})

    const histories = shallowRef<{
        [key: string]: {
            data: EditorData[],
            index: number,
            updated: string | number
        }
    }>({})

    const MAX_HISTORY = 50;
    const history = shallowRef<EditorData[]>([]);
    const historyIndex = ref(-1);

    type Board = {
        id: string
        x: number
        y: number
        data: EditorData
        history: EditorData[]
        historyIndex: number
        currentLayerIndex: number
        currentFrameIndex: number
    }
    const boards = ref<Board[]>([])
    const activeBoardId = ref('')
    const boardsRev = ref(0)

    function stashActiveBoard() {
        const cur = boards.value.find(b => b.id === activeBoardId.value)
        if (!cur) return
        cur.data = editorData.value
        cur.history = history.value
        cur.historyIndex = historyIndex.value
        cur.currentLayerIndex = currentLayerIndex.value
        cur.currentFrameIndex = currentFrameIndex.value
    }

    function loadBoardLive(b: Board) {
        activeBoardId.value = b.id
        editorData.value = b.data
        history.value = b.history
        historyIndex.value = b.historyIndex
        currentLayerIndex.value = b.currentLayerIndex
        currentFrameIndex.value = b.currentFrameIndex
        markRawPixels(editorData.value)
        linkActiveFrame()
        selectionState.value.bounds.active = false
        selectionState.value.selecting = false
        layerActive.value = false
        sharedRev.value++
        markFullRedraw()
        drawTurn.value++
        boardsRev.value++
    }

    function initBoardsFromCurrent() {
        boards.value = [{
            id: editorData.value.id.toString(),
            x: 0, y: 0,       // corrected by applyWorkspaceLayoutOverlay() after load
            data: editorData.value,
            history: history.value,
            historyIndex: historyIndex.value,
            currentLayerIndex: currentLayerIndex.value,
            currentFrameIndex: currentFrameIndex.value,
        }]
        activeBoardId.value = boards.value[0]!.id
        boardsRev.value++
    }

    function setActiveBoard(id: string) {
        if (id === activeBoardId.value) return
        const next = boards.value.find(b => b.id === id)
        if (!next) return
        stashActiveBoard()
        loadBoardLive(next)
        saveWorkspaceLayout()
    }

    function nextBoardX(): number {
        const gap = 8
        let x = 0
        for (const b of boards.value) x = Math.max(x, b.x + b.data.width + gap)
        return x
    }

    function pushBoard(data: EditorData, pos?: { x: number, y: number }): string {
        stashActiveBoard()
        const x = pos ? Math.round(pos.x) : nextBoardX()
        const y = pos ? Math.round(pos.y) : 0
        const board: Board = {
            id: data.id.toString(), x, y, data,
            history: [], historyIndex: -1, currentLayerIndex: 0, currentFrameIndex: 0,
        }
        boards.value.push(board)
        loadBoardLive(board)
        saveState(false)
        board.history = history.value
        board.historyIndex = historyIndex.value
        saveWorkspaceLayout()
        return board.id
    }

    function addBoard(width = 16, height = 16, pos?: { x: number, y: number }): string {
        const w = Math.max(1, Math.min(256, Math.round(width) || 16))
        const h = Math.max(1, Math.min(256, Math.round(height) || 16))
        const data = markRawPixels({
            ...cloneDeep(DEFAULT_EDITOR_DATA),
            id: generateUUID(),
            width: w, height: h,
            updated: new Date().toISOString(),
        })
        return pushBoard(data, pos)
    }

    function addBoardWithData(data: EditorData, pos?: { x: number, y: number }): string {
        const existing = boards.value.find(b => b.id === data.id.toString())
        if (existing) { setActiveBoard(existing.id); return existing.id }
        return pushBoard(markRawPixels(data), pos)
    }

    function moveBoard(id: string, x: number, y: number) {
        const b = boards.value.find(b => b.id === id)
        if (!b) return
        b.x = Math.round(x)
        b.y = Math.round(y)
    }

    function removeBoard(id: string) {
        if (boards.value.length <= 1) return
        const idx = boards.value.findIndex(b => b.id === id)
        if (idx < 0) return
        const wasActive = activeBoardId.value === id
        boards.value.splice(idx, 1)
        if (wasActive) loadBoardLive(boards.value[Math.max(0, idx - 1)]!)
        else boardsRev.value++
        saveWorkspaceLayout()
    }

    function boardLayoutEntry(b: Board) {
        const data = b.id === activeBoardId.value ? editorData.value : b.data
        return { id: String(b.id), x: b.x, y: b.y, bg: data?.meta?.bg ?? null, iso: data?.meta?.iso ?? null }
    }

    function saveWorkspaceLayout() {
        try {
            localStorage.setItem('workspace_layout', JSON.stringify({
                boards: boards.value.map(boardLayoutEntry),
                activeIndex: Math.max(0, boards.value.findIndex(b => b.id === activeBoardId.value)),
            }))
        } catch { /* ignore */ }

        if (boards.value.length <= 1) {
            void clearWorkspaceFull()
            return
        }
        const payload = {
            boards: boards.value.map(b => {
                const data = b.id === activeBoardId.value ? editorData.value : b.data
                return {x: b.x, y: b.y, data: cloneDeep(toRaw(data))}
            }),
            activeIndex: Math.max(0, boards.value.findIndex(b => b.id === activeBoardId.value)),
        }
        void saveWorkspaceFull(payload)
    }

    async function restoreWorkspaceLayout(preferId?: string) {
        const payload = await loadWorkspaceFull()
        if (!payload || !Array.isArray(payload.boards) || payload.boards.length <= 1) return
        const fresh = preferId ? boards.value.find(b => b.id === preferId) : undefined
        const rebuilt: Board[] = payload.boards
            .filter((e: any) => e && e.data)
            .map((e: any) => {
                const data = markRawPixels(e.data as EditorData)
                return {
                    id: (data.id ?? generateUUID()).toString(),
                    x: e.x || 0, y: e.y || 0, data,
                    history: [], historyIndex: -1, currentLayerIndex: 0, currentFrameIndex: 0,
                }
            })
        if (rebuilt.length <= 1) return
        let ai = Math.min(rebuilt.length - 1, Math.max(0, payload.activeIndex || 0))
        if (fresh) {
            const idx = rebuilt.findIndex(b => b.id === fresh.id)
            if (idx >= 0) {
                rebuilt[idx] = {...fresh, x: rebuilt[idx]!.x, y: rebuilt[idx]!.y}
                ai = idx
            } else {
                const gap = 8
                let x = 0
                for (const b of rebuilt) x = Math.max(x, b.x + b.data.width + gap)
                rebuilt.push({...fresh, x, y: 0})
                ai = rebuilt.length - 1
            }
        }
        boards.value = rebuilt
        loadBoardLive(rebuilt[ai]!)
        history.value = []; historyIndex.value = -1; saveState(false)
        rebuilt[ai]!.history = history.value
        rebuilt[ai]!.historyIndex = historyIndex.value
        if (fresh) saveWorkspaceLayout()
    }

    function applyWorkspaceLayoutOverlay() {
        let layout: any
        try { layout = JSON.parse(localStorage.getItem('workspace_layout') || 'null') } catch { return }
        if (!layout || !Array.isArray(layout.boards)) return
        const byId = new Map<string, any>(layout.boards.map((e: any) => [String(e.id), e]))
        let touched = false
        for (const b of boards.value) {
            const e = byId.get(String(b.id))
            if (!e) continue
            b.x = Math.round(e.x) || 0
            b.y = Math.round(e.y) || 0
            const data = b.id === activeBoardId.value ? editorData.value : b.data
            if (data) {
                if (!data.meta) data.meta = {}
                if (e.bg) data.meta.bg = { ...e.bg }
                if (e.iso) data.meta.iso = { ...e.iso }
            }
            touched = true
        }
        if (touched) boardsRev.value++
    }

    const currentTool = ref("brush");
    const brushSize = ref(1);
    const mirrorHorizontal = ref(false);
    const mirrorVertical = ref(false);

    function setBrushSize(size: number) {
        brushSize.value = Math.min(8, Math.max(1, Math.floor(size) || 1));
    }

    const bgConfig = computed(() => {
        const bg = editorData.value?.meta?.bg;
        return {
            type: bg?.type ?? 'none',
            color: bg?.color ?? '#FFFFFF',
            artId: bg?.artId ?? '',
            artUrl: bg?.artUrl ?? '',
        };
    });

    function setBg(partial: Partial<{ type: 'none' | 'transparent' | 'solid' | 'art'; color: string; artId: string; artUrl: string }>) {
        if (!editorData.value) return;
        if (!editorData.value.meta) editorData.value.meta = {};
        const next = { ...bgConfig.value, ...partial };
        editorData.value.meta.bg = next;
        for (const b of boards.value) {
            if (b.id === activeBoardId.value) continue;
            const meta = b.data.meta || (b.data.meta = {});
            meta.bg = { ...next };
        }
        boardsRev.value++;
        saveState();
        saveWorkspaceLayout();
    }

    function setArtTileset(id: string | null, tid?: number | string | null) {
        if (!editorData.value) return;
        const meta = {...(editorData.value.meta || {})};
        if (id) meta.tileset = {id, ...(tid != null ? {tid} : {})};
        else delete meta.tileset;
        editorData.value.meta = meta;
        save();
    }

    const currentColorIndex = ref(0);
    const pickedColorIndex = ref<number | null>(null);
    const currentLayerIndex = ref(0);
    const drawTurn = ref(0)

    const MAX_FRAMES = 64
    const currentFrameIndex = ref(0)
    const onionSkin = ref(false)
    const isPlaying = ref(false)
    const sharedRev = ref(0)
    const frames = computed(() => editorData.value.meta?.animation?.frames ?? [])
    const frameCount = computed(() => frames.value.length)
    const isAnimated = computed(() => frameCount.value > 1)
    const fps = computed(() => editorData.value.meta?.animation?.fps ?? 10)
    const loopAnimation = computed(() => editorData.value.meta?.animation?.loop ?? true)
    const sharedLayers = computed(() => editorData.value.meta?.animation?.shared ?? [])
    const editingShared = computed(() => currentFrameIndex.value === -1)

    const tags = computed(() => editorData.value.meta?.animation?.tags ?? [])
    const activeTagId = ref<string | null>(null)
    const activeTag = computed(() => tags.value.find(t => t.id === activeTagId.value) ?? null)

    const TAG_COLORS = ['#E4572E', '#17BEBB', '#2E86AB', '#A846A0', '#76B041', '#FFC914']

    function addTag(from?: number, to?: number) {
        ensureAnimation()
        const anim = editorData.value.meta!.animation!
        if (!anim.tags) anim.tags = []
        const last = anim.frames.length - 1
        const f = Math.max(0, Math.min(last, from ?? Math.max(0, currentFrameIndex.value)))
        const t = Math.max(f, Math.min(last, to ?? f))
        const tag: AnimationTag = {
            id: generateUUID(),
            name: `Tag ${anim.tags.length + 1}`,
            from: f,
            to: t,
            direction: 'forward',
            color: TAG_COLORS[anim.tags.length % TAG_COLORS.length]!,
        }
        anim.tags.push(tag)
        activeTagId.value = tag.id
        saveState()
        return tag
    }

    function updateTag(id: string, patch: Partial<AnimationTag>) {
        const anim = editorData.value.meta?.animation
        const tag = anim?.tags?.find(t => t.id === id)
        if (!anim || !tag) return
        Object.assign(tag, patch)
        const last = anim.frames.length - 1
        tag.from = Math.max(0, Math.min(last, Math.round(tag.from) || 0))
        tag.to = Math.max(tag.from, Math.min(last, Math.round(tag.to) || 0))
        if (!tag.name.trim()) tag.name = 'Tag'
        saveState()
    }

    function deleteTag(id: string) {
        const anim = editorData.value.meta?.animation
        if (!anim?.tags) return
        const i = anim.tags.findIndex(t => t.id === id)
        if (i < 0) return
        anim.tags.splice(i, 1)
        if (activeTagId.value === id) activeTagId.value = null
        saveState()
    }

    function shiftTagsOnInsert(k: number) {
        const anim = editorData.value.meta?.animation
        anim?.tags?.forEach(t => {
            if (t.from >= k) { t.from++; t.to++ }
            else if (t.to >= k - 1) t.to++
        })
    }

    function shiftTagsOnDelete(i: number) {
        const anim = editorData.value.meta?.animation
        if (!anim?.tags) return
        anim.tags.forEach(t => {
            if (t.from > i) { t.from--; t.to-- }
            else if (t.to >= i) t.to--
        })
        anim.tags = anim.tags.filter(t => t.to >= t.from && t.from >= 0)
        if (activeTagId.value && !anim.tags.some(t => t.id === activeTagId.value)) activeTagId.value = null
    }

    function ensureSharedStack() {
        const anim = editorData.value.meta?.animation
        if (!anim) return
        if (!anim.shared) anim.shared = []
        if (!anim.shared.length) anim.shared.push({name: 'Background', pixels: markRaw({}), x: 0, y: 0})
    }

    function forEachLayer(fn: (layer: Layer) => void) {
        const anim = editorData.value.meta?.animation
        if (anim?.frames?.length) {
            anim.frames.forEach(f => f.layers?.forEach(fn))
            anim.shared?.forEach(fn)
        } else {
            editorData.value.layers.forEach(fn)
        }
    }

    function linkActiveFrame() {
        const anim = editorData.value.meta?.animation
        if (!anim?.frames?.length) return
        if (currentFrameIndex.value === -1) {
            ensureSharedStack()
            editorData.value.layers = anim.shared!
        } else {
            if (currentFrameIndex.value >= anim.frames.length) currentFrameIndex.value = anim.frames.length - 1
            if (currentFrameIndex.value < 0) currentFrameIndex.value = 0
            editorData.value.layers = anim.frames[currentFrameIndex.value]!.layers
        }
        if (currentLayerIndex.value >= editorData.value.layers.length) {
            currentLayerIndex.value = Math.max(0, editorData.value.layers.length - 1)
        }
    }

    function ensureAnimation() {
        if (!editorData.value.meta) editorData.value.meta = {}
        if (!editorData.value.meta.animation) {
            editorData.value.meta.animation = {
                fps: 10,
                loop: true,
                frames: [{id: generateUUID(), layers: editorData.value.layers, duration: 100}],
                shared: [],
            }
            currentFrameIndex.value = 0
        }
    }

    function setActiveFrame(i: number) {
        const anim = editorData.value.meta?.animation
        if (!anim?.frames?.length) return
        const wasShared = currentFrameIndex.value === -1
        if (i === -1) {
            ensureSharedStack()
            currentFrameIndex.value = -1
        } else {
            currentFrameIndex.value = Math.max(0, Math.min(anim.frames.length - 1, i))
        }
        if (wasShared && currentFrameIndex.value !== -1) sharedRev.value++
        linkActiveFrame()
        markFullRedraw()
        drawTurn.value++
    }

    function editShared() {
        ensureAnimation()
        setActiveFrame(-1)
    }

    function newBlankLayers(): Layer[] {
        return [{name: 'Layer 1', pixels: markRaw({}), x: 0, y: 0}]
    }

    function cloneLayers(layers: Layer[]): Layer[] {
        return cloneDeep(toRaw(layers)).map(l => {
            l.pixels = markRaw(l.pixels || {})
            return l
        })
    }

    function addFrame(duplicate = true) {
        ensureAnimation()
        const anim = editorData.value.meta!.animation!
        if (anim.frames.length >= MAX_FRAMES) {
            toast.error(`Max ${MAX_FRAMES} frames`)
            return
        }
        const at = currentFrameIndex.value
        const src = anim.frames[at]!
        const layers = duplicate ? cloneLayers(src.layers) : newBlankLayers()
        anim.frames.splice(at + 1, 0, {id: generateUUID(), layers, duration: src.duration ?? Math.round(1000 / fps.value)})
        shiftTagsOnInsert(at + 1)
        setActiveFrame(at + 1)
        saveState()
    }

    function duplicateFrame(i: number) {
        ensureAnimation()
        const anim = editorData.value.meta!.animation!
        if (anim.frames.length >= MAX_FRAMES) {
            toast.error(`Max ${MAX_FRAMES} frames`)
            return
        }
        const src = anim.frames[i]
        if (!src) return
        anim.frames.splice(i + 1, 0, {id: generateUUID(), layers: cloneLayers(src.layers), duration: src.duration})
        shiftTagsOnInsert(i + 1)
        setActiveFrame(i + 1)
        saveState()
    }

    function deleteFrame(i: number) {
        const anim = editorData.value.meta?.animation
        if (!anim?.frames || anim.frames.length <= 1) return
        anim.frames.splice(i, 1)
        shiftTagsOnDelete(i)
        if (anim.frames.length === 1) {
            const survivor = anim.frames[0]!
            const shared = anim.shared || []
            editorData.value.layers = shared.length ? [...shared, ...survivor.layers] : survivor.layers
            currentFrameIndex.value = 0
            delete editorData.value.meta!.animation
            markFullRedraw()
            drawTurn.value++
        } else {
            let next = currentFrameIndex.value
            if (i < next) next--
            next = Math.min(next, anim.frames.length - 1)
            setActiveFrame(next)
        }
        saveState()
    }

    function moveFrame(from: number, to: number) {
        const anim = editorData.value.meta?.animation
        if (!anim?.frames) return
        if (to < 0 || to >= anim.frames.length || from === to) return
        const [f] = anim.frames.splice(from, 1)
        anim.frames.splice(to, 0, f!)
        currentFrameIndex.value = to
        linkActiveFrame()
        markFullRedraw()
        drawTurn.value++
        saveState()
    }

    function setFrameDuration(i: number, ms: number) {
        const anim = editorData.value.meta?.animation
        const f = anim?.frames?.[i]
        if (!f) return
        const v = Math.max(10, Math.min(10000, Math.round(ms) || 100))
        if (allFrames.value) {
            anim!.frames.forEach(fr => { fr.duration = v })
        } else {
            f.duration = v
        }
        saveState()
    }

    function setFps(n: number) {
        ensureAnimation()
        editorData.value.meta!.animation!.fps = Math.max(1, Math.min(60, Math.round(n) || 10))
        saveState()
    }

    function toggleLoop() {
        ensureAnimation()
        const anim = editorData.value.meta!.animation!
        anim.loop = !anim.loop
        saveState()
    }

    let dirtyPixels = new Set<string>()
    let needFullRedraw = true
    function markDirtyPixel(cx: number, cy: number) { dirtyPixels.add(`${cx}_${cy}`) }
    function markFullRedraw() { needFullRedraw = true }
    function consumeRenderDirty(): { full: boolean; keys: Set<string> } {
        const keys = dirtyPixels
        const full = needFullRedraw
        dirtyPixels = new Set()
        needFullRedraw = false
        return { full, keys }
    }

    const selectionState = ref({
        selecting: false,
        start: {x: 0, y: 0},
        current: {x: 0, y: 0},
        bounds: {minX: 0, minY: 0, maxX: 0, maxY: 0, active: false}
    });

    const layerActive = ref(true)
    const activeScope = computed<'selection' | 'layer' | 'board'>(() => {
        if (selectionState.value.bounds.active) return 'selection'
        if (layerActive.value) return 'layer'
        return 'board'
    })
    function activateLayer(index?: number) {
        if (typeof index === 'number') currentLayerIndex.value = index
        layerActive.value = true
    }

    function ensureIsoMeta() {
        if (!editorData.value.meta) {
            editorData.value.meta = { iso: { mode: 'square', cell: { width: 2, height: 1 } } };
        }
        if (!editorData.value.meta.iso) {
            editorData.value.meta.iso = { mode: 'square', cell: { width: 2, height: 1 } };
        }
    }

    const validBounds = computed(() => {
        let width = editorData.value.width;
        let height = editorData.value.height;
        let x = 0;
        let y = 0;
        if (selectionState.value.bounds.active) {
            width = selectionState.value.bounds.maxX - selectionState.value.bounds.minX;
            height = selectionState.value.bounds.maxY - selectionState.value.bounds.minY;
            x = selectionState.value.bounds.minX;
            y = selectionState.value.bounds.minY;
        }
        return {
            width,
            height,
            x, y
        }
    })

    function checkKeyInSelection(key: string) {
        const {x, y} = key2Point(key)
        const startX = validBounds.value.x
        const startY = validBounds.value.y
        const endX = validBounds.value.x + validBounds.value.width
        const endY = validBounds.value.y + validBounds.value.height
        return x >= startX && x <= endX && y >= startY && y <= endY
    }

    function getContentInBound(isClear: boolean = false) {
        let output: { [key: string]: number } = {};
        if (selectionState.value.bounds.active) {
            Object.keys(editorData.value.layers[currentLayerIndex.value]!.pixels).forEach((key) => {
                if (checkKeyInSelection(key)) {
                    output[key] = editorData.value.layers[currentLayerIndex.value]!.pixels[key] ?? -1;
                    if (isClear) {
                        delete editorData.value.layers[currentLayerIndex.value]!.pixels[key]
                    }
                }
            })
        } else {
            output = cloneDeep(editorData.value.layers[currentLayerIndex.value]!.pixels);
            if (isClear) {
                editorData.value.layers[currentLayerIndex.value]!.pixels = markRaw({})
            }
        }
        return output;
    }

    function resetEditorData() {
        editorData.value = markRawPixels({
            ...cloneDeep(DEFAULT_EDITOR_DATA),
            id: generateUUID(),
            updated: new Date().toISOString()
        })
        ensureIsoMeta();
        history.value = []
        historyIndex.value = -1
        saveState(false)
        initBoardsFromCurrent()
    }

    function validateEditorData(data: any): data is EditorData {
        return (
            typeof data === 'object' &&
            data !== null &&
            typeof data.id === 'string' &&
            typeof data.width === 'number' &&
            typeof data.height === 'number' &&
            Array.isArray(data.colors) &&
            Array.isArray(data.layers) &&
            data.layers.every((layer: any) =>
                typeof layer === 'object' &&
                typeof layer.name === 'string' &&
                typeof layer.x === 'number' &&
                typeof layer.y === 'number' &&
                typeof layer.pixels === 'object' &&
                layer.pixels !== null
            )
        );
    }

    function findOrCreateColor(hex: string, colors: string[]): number {
        const cleanHex = hex.replace("#", "");
        
        for (let i = 0; i < colors.length; i++) {
            if (isSameColor(colors[i]!.replace("#", ""), cleanHex)) {
                return i;
            }
        }
        
        colors.push(hex);
        return colors.length - 1;
    }

    function gridToEditorData(
        pxColor: (number[] | null)[][],
        ignoreColor: number[] | null,
        name = '',
        transparentHandled = false,
    ): EditorData | null {
        if (!pxColor?.length) return null;
        const maps_results: { [key: string]: number } = {};
        const colors: string[] = [];
        let maxWidth = 0;
        for (let y = 0; y < pxColor.length; y++) {
            const row = pxColor[y];
            if (!row) continue;
            maxWidth = Math.max(maxWidth, row.length);
            for (let x = 0; x < row.length; x++) {
                const cell = row[x];
                if (!cell) continue;
                const hex = rgbToHex(cell[0]!, cell[1]!, cell[2]!);
                if (!transparentHandled && shouldIgnoreColor(hex, ignoreColor)) continue;
                maps_results[`${x}_${y}`] = findOrCreateColor(hex, colors);
            }
        }
        if (!maxWidth) return null;
        const data = markRawPixels({
            ...cloneDeep(DEFAULT_EDITOR_DATA),
            id: generateUUID(),
            name,
            width: maxWidth,
            height: pxColor.length,
            updated: new Date().toISOString(),
        });
        data.layers[0]!.pixels = markRaw(maps_results);
        data.colors = colors.map(x => x.toUpperCase());
        return data;
    }

    function loadAnimationFrames(frameGrids: (number[] | null)[][][]) {
        if (!frameGrids.length) return

        const first = frameGrids[0]!
        const fh = first.length
        let fw = 0
        for (const row of first) fw = Math.max(fw, row?.length || 0)
        if (!fw || !fh) return

        const colors: string[] = []
        const frames = frameGrids.slice(0, MAX_FRAMES).map(grid => {
            const pixels: { [key: string]: number } = {}
            for (let y = 0; y < grid.length; y++) {
                const row = grid[y]
                if (!row) continue
                for (let x = 0; x < row.length; x++) {
                    const rgb = row[x]
                    if (!rgb) continue
                    pixels[`${x}_${y}`] = findOrCreateColor(rgbToHex(rgb[0]!, rgb[1]!, rgb[2]!), colors)
                }
            }
            return {
                id: generateUUID(),
                layers: [{name: 'Layer 1', pixels: markRaw(pixels), x: 0, y: 0}],
                duration: 100,
            }
        })

        const converted = markRawPixels({
            ...cloneDeep(DEFAULT_EDITOR_DATA),
            id: generateUUID(),
            updated: new Date().toISOString(),
            width: fw,
            height: fh,
        })
        converted.colors = colors.map(c => c.toUpperCase())
        if (frames.length > 1) {
            if (!converted.meta) converted.meta = {}
            converted.meta.animation = {fps: 10, loop: true, frames, shared: []}
        } else {
            converted.layers = frames[0]!.layers
        }
        replaceCanvasWith(converted)
    }

    type ImportProcess = 'filter' | 'original'
    type ImportDest = 'boards' | 'frames' | 'replace'

    function readFileAsDataUrl(file: File): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    async function fileToGrid(file: File, process: ImportProcess): Promise<(number[] | null)[][] | null> {
        const dataUrl = await readFileAsDataUrl(file);
        return process === 'original' ? importOriginalGrid(dataUrl) : importFileGrid(dataUrl);
    }

    async function fileToEditorData(file: File, process: ImportProcess): Promise<EditorData | null> {
        const baseName = file.name.replace(/\.[^.]+$/, '')
        if (file.name.toLowerCase().endsWith('.json')) {
            try {
                const jsonData = JSON.parse(await file.text());
                if (!validateEditorData(jsonData)) return null;
                return markRawPixels({
                    ...cloneDeep(DEFAULT_EDITOR_DATA),
                    ...jsonData,
                    id: generateUUID(),
                    updated: new Date().toISOString(),
                });
            } catch {
                return null;
            }
        }
        try {
            const grid = await fileToGrid(file, process);
            if (!grid) return null;
            return gridToEditorData(grid, null, baseName, true);
        } catch {
            return null;
        }
    }

    async function importFiles(
        files: File[],
        opts: { process: ImportProcess; dest: ImportDest },
    ): Promise<{ added: number; skipped: number }> {
        let added = 0;
        let skipped = 0;

        if (opts.dest === 'frames') {
            const frameGrids: (number[] | null)[][][] = [];
            for (const file of files) {
                if (file.name.toLowerCase().endsWith('.json')) { skipped++; continue; }
                try {
                    const grid = await fileToGrid(file, opts.process);
                    if (grid) frameGrids.push(grid);
                    else skipped++;
                } catch { skipped++; }
            }
            if (frameGrids.length) {
                loadAnimationFrames(frameGrids);
                added = frameGrids.length;
            }
            return {added, skipped};
        }

        if (opts.dest === 'replace') {
            const data = files[0] ? await fileToEditorData(files[0], opts.process) : null;
            if (!data) return {added: 0, skipped: files.length};
            replaceCanvasWith(data);
            return {added: 1, skipped: files.length - 1};
        }

        for (const file of files) {
            const data = await fileToEditorData(file, opts.process);
            if (!data) { skipped++; continue; }
            addBoardWithData(data);
            added++;
        }
        return {added, skipped};
    }

    function replaceCanvasWith(converted: EditorData) {
        const idx = boards.value.findIndex(b => b.id === activeBoardId.value);
        editorData.value = converted;
        ensureIsoMeta();
        history.value = [];
        historyIndex.value = -1;
        currentLayerIndex.value = 0;
        currentFrameIndex.value = 0;
        if (editorData.value.meta?.animation) linkActiveFrame();
        if (idx >= 0) {
            const b = boards.value[idx]!;
            b.id = converted.id.toString();
            b.data = converted;
            b.history = [];
            b.historyIndex = -1;
            b.currentLayerIndex = 0;
            b.currentFrameIndex = 0;
            activeBoardId.value = b.id;
            boardsRev.value++;
        } else {
            initBoardsFromCurrent();
        }
        markFullRedraw()
        drawTurn.value++;
        saveState();
        saveWorkspaceLayout();
    }

    const insertFromGrid = (cells: (number[] | null)[][]) => {
        if (!cells?.length) return;

        const gh = cells.length;
        let gw = 0;
        for (const row of cells) gw = Math.max(gw, row?.length || 0);
        if (!gw) return;

        const cw = editorData.value.width;
        const ch = editorData.value.height;

        const den = (gw <= cw && gh <= ch)
            ? 1
            : Math.max(1, Math.ceil(Math.max(gw / cw, gh / ch)));
        const targetW = Math.max(1, Math.floor(gw / den));
        const targetH = Math.max(1, Math.floor(gh / den));
        const offsetX = Math.floor((cw - targetW) / 2);
        const offsetY = Math.floor((ch - targetH) / 2);

        const layer = editorData.value.layers[currentLayerIndex.value]!;
        const colors = editorData.value.colors;

        for (let ty = 0; ty < targetH; ty++) {
            const sy = Math.min(gh - 1, ty * den);
            const srcRow = cells[sy];
            if (!srcRow?.length) continue;
            for (let tx = 0; tx < targetW; tx++) {
                const sx = Math.min(srcRow.length - 1, tx * den);
                const cell = srcRow[sx];
                if (!cell) continue;

                const cx = offsetX + tx;
                const cy = offsetY + ty;
                if (cx < 0 || cy < 0 || cx >= cw || cy >= ch) continue;

                layer.pixels[`${cx - layer.x}_${cy - layer.y}`] =
                    findOrCreateColor(rgbToHex(cell[0]!, cell[1]!, cell[2]!), colors);
            }
        }

        editorData.value.colors = colors.map(x => x.toUpperCase());
        saveState();
    }

    async function insertImage() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const dataUrl = ev.target?.result as string;
                    const grid = await importFileGrid(dataUrl);
                    if (grid) insertFromGrid(grid);
                } catch (error) {
                    console.error('Error inserting image:', error);
                }
            };
            reader.readAsDataURL(file);
        };

        input.click();
    }

    async function load(id: string | undefined) {
        async function loadCloudPage(id: number | string) {
            try {
                const res = await useNativeFetch<SharedPage>(`/coloring/shared-pages/${id}/`)
                let template: number | null = null
                let tempId: string | number = res.id
                let idString = res.id_string
                if (auth.logged?.id !== res?.user?.id) {
                    template = res.id
                    tempId = generateUUID()
                    idString = ''
                }
                return sharedPage2EditorData(res, {
                    id: tempId, id_string: idString, template
                })
            } catch (e: any) {
                const code = e?.statusCode ?? e?.response?.status
                if (code === 404 && typeof window !== 'undefined') {
                    toast.info('That artwork was deleted — opening a new canvas')
                }
                return {
                    ...cloneDeep(DEFAULT_EDITOR_DATA),
                    id: generateUUID(),
                    updated: new Date().toISOString()
                }
            }
        }

        const explicitId = !!id
        try {
            histories.value = getStorageItem('histories')
            localWS.value = getStorageItem('workspaces')
            if (!id) id = localStorage.getItem("workspace_current") || '';
            if (id) {
                const temp = localWS.value[id]
                if (temp) {
                    editorData.value = cloneDeep(temp)
                } else {
                    const localTile = localTs.findTileEd(id)
                    editorData.value = localTile ? localTile : await loadCloudPage(id)
                }
            }
            markRawPixels(editorData.value)
            currentFrameIndex.value = 0
            linkActiveFrame()
            ensureIsoMeta();
            const currentId = editorData.value.id.toString()
            const temp = histories.value[currentId]
            if (temp && temp.updated === editorData.value.updated) {
                history.value = temp.data
                historyIndex.value = temp.index
            } else {
                history.value = []
                historyIndex.value = -1
                saveState()
            }
            foldStrayVirtual()
            initBoardsFromCurrent()
            await restoreWorkspaceLayout(explicitId ? editorData.value.id.toString() : undefined)
            applyWorkspaceLayoutOverlay()
        } catch (error) {
            resetEditorData()
        }
    }

    async function performSave() {
        async function save2Cloud() {
            const ed = toRaw(editorData.value)
            const anim = ed.meta?.animation
            const primaryLayers = anim?.frames?.length ? anim.frames[0]!.layers : ed.layers
            const payload = {
                name: ed.name || 'Untitled',
                desc: ed.desc || '',
                tags: ed.tags || [],
                width: ed.width,
                height: ed.height,
                colors: ed.colors,
                layers: primaryLayers,
                template: ed.template,
                palette: ed.palette ?? null,
                id_string: ed.id_string,
                map_numbers: layers2MapNumbers({...ed, layers: primaryLayers}),
                is_public: ed.is_public,
                meta: ed.meta ?? {},
            }
            async function createCloud() {
                const oldLocalKey = editorData.value.id.toString()
                const result = await useNativeFetch<SharedPage>(`/coloring/shared-pages/`, {
                    method: 'POST',
                    body: {...payload, id_string: ''}
                })
                editorData.value.id = result.id
                editorData.value.id_string = result.id_string
                history.value.forEach(item => {
                    item.id = result.id
                })
                editorData.value.updated = result.updated
                const promoted = boards.value.find(b => b.id === oldLocalKey)
                if (promoted) {
                    promoted.id = result.id.toString()
                    if (activeBoardId.value === oldLocalKey) activeBoardId.value = promoted.id
                    boardsRev.value++
                    saveWorkspaceLayout()
                }
                if (localWS.value[oldLocalKey]) {
                    delete localWS.value[oldLocalKey]
                    try {
                        localStorage.setItem('workspaces', JSON.stringify(localWS.value))
                    } catch (e) {
                        console.warn('Failed to prune promoted local workspace:', e)
                    }
                }
            }

            const existsOnServer = typeof editorData.value.id === 'number' && !!editorData.value.id_string
            if (!existsOnServer) {
                const frames = anim?.frames?.length ? anim.frames : [{layers: ed.layers}]
                const hasPixels = frames.some(f =>
                    (f?.layers || []).some(l => Object.keys(l?.pixels || {}).length > 0))
                if (!hasPixels && !ed.name) return
                await createCloud()
                return
            }
            try {
                const result = await useNativeFetch<SharedPage>(`/coloring/shared-pages/${editorData.value.id}/`, {
                    method: 'PUT',
                    body: payload
                })
                editorData.value.updated = result.updated
                editorData.value.id_string = result.id_string
            } catch (e: any) {
                const code = e?.statusCode ?? e?.response?.status
                if (code !== 404) throw e
                await createCloud()
                toast.info('The original was deleted — saved as a new artwork')
            }
        }

        function save2Local(forcePrivate = true) {
            if (forcePrivate) editorData.value.is_public = false
            const snapshot = cloneDeep(toRaw(editorData.value))
            if (forcePrivate) snapshot.is_public = false
            localWS.value[editorData.value.id.toString()] = snapshot
            try {
                localStorage.setItem('workspaces', JSON.stringify(localWS.value))
            } catch (e) {
                console.warn('workspaces save hit storage limit, dropping histories:', e)
                try {
                    localStorage.removeItem('histories')
                    localStorage.setItem('workspaces', JSON.stringify(localWS.value))
                } catch (e2) {
                    console.warn('workspaces save still failing, skipping:', e2)
                }
            }
        }

        if (auth.isLogged) {
            try {
                await save2Cloud();
            } catch (e) {
                console.error('Failed to save to cloud, keeping local copy:', e);
                toast.error('Cloud save failed — saved locally')
            }
            save2Local(false)
        } else {
            save2Local()
        }
        try { localTs.syncEditedArt(toRaw(editorData.value)) } catch (e) { /* non-fatal */ }
        const wsId = editorData.value.id.toString()
        localStorage.setItem('workspace_current', wsId)
        saveWorkspaceLayout()
        persistHistories(wsId)
    }

    const HISTORY_BUDGET = 3 * 1024 * 1024
    let histIdleId: number | null = null
    function persistHistories(wsId: string) {
        const run = () => {
            histIdleId = null
            try {
                const one = JSON.stringify(history.value[historyIndex.value] ?? null)
                if (one.length > HISTORY_BUDGET) {
                    localStorage.removeItem('histories')
                    return
                }
                const tailN = Math.max(1, Math.min(15, Math.floor(HISTORY_BUDGET / Math.max(1, one.length))))
                const tail = history.value.slice(-tailN)
                const offset = history.value.length - tail.length
                histories.value = {
                    [wsId]: {
                        data: tail,
                        index: Math.max(0, Math.min(historyIndex.value - offset, tail.length - 1)),
                        updated: editorData.value.updated
                    }
                }
                localStorage.setItem('histories', JSON.stringify(histories.value))
            } catch (e) {
                console.warn('Failed to persist history, skipping:', e)
                try { localStorage.removeItem('histories') } catch { /* ignore */ }
            }
        }
        if (typeof requestIdleCallback !== 'undefined') {
            if (histIdleId !== null) cancelIdleCallback(histIdleId)
            histIdleId = requestIdleCallback(run, {timeout: 3000})
        } else {
            run()
        }
    }

    let saveInFlight: Promise<void> | null = null
    let resaveQueued = false

    async function saveNow(): Promise<void> {
        if (saveInFlight) {
            resaveQueued = true
            return saveInFlight
        }
        saveInFlight = performSave().finally(() => { saveInFlight = null })
        await saveInFlight
        if (resaveQueued) {
            resaveQueued = false
            return saveNow()
        }
    }

    let savePending = false
    const debouncedSave = debounce(() => { savePending = false; void saveNow() }, 1000)
    function save() { savePending = true; debouncedSave() }

    function flush(): void {
        if (!savePending) return
        savePending = false
        void saveNow()
    }

    function setPixelByIndex(x: number, y: number, paletteIndex: number): void {
        layerActive.value = true
        const layer = editorData.value.layers[currentLayerIndex.value]!
        if (paletteIndex === -1) {
            delete layer.pixels[`${x}_${y}`]
        } else {
            layer.pixels[`${x}_${y}`] = paletteIndex;
        }
        markDirtyPixel(x + layer.x, y + layer.y)

        if (allFrames.value && currentFrameIndex.value >= 0) {
            const anim = editorData.value.meta?.animation
            if (anim?.frames?.length) {
                for (let i = 0; i < anim.frames.length; i++) {
                    if (i === currentFrameIndex.value) continue
                    const l = anim.frames[i]!.layers?.[currentLayerIndex.value] ?? anim.frames[i]!.layers?.[0]
                    if (!l || l === layer) continue
                    if (paletteIndex === -1) {
                        delete l.pixels[`${x}_${y}`]
                    } else {
                        l.pixels[`${x}_${y}`] = paletteIndex
                    }
                }
            }
        }
    }

    function saveState(isSync: boolean = true): void {
        editorData.value.version = historyIndex.value
        const snapshot = markRawPixels(cloneDeep<EditorData>(toRaw(editorData.value)))
        const next = history.value.slice(0, historyIndex.value + 1);
        next.push(snapshot);
        historyIndex.value++;
        if (next.length > MAX_HISTORY) {
            next.shift();
            historyIndex.value--;
        }
        history.value = next;
        markFullRedraw()
        drawTurn.value++
        if (isSync) save();
    }

    const canUndo = computed(() => historyIndex.value > 0)
    const canRedo = computed(() => historyIndex.value < history.value.length - 1)

    function foldStrayVirtual() {
        const vi = editorData.value.layers.findIndex(l => l.name === 'Virtual')
        if (vi < 0) return
        currentLayerIndex.value = Math.max(0, vi - 1)
        virtualLayer.value = editorData.value.layers[vi]!
        virtualLayer.value.pixels = markRaw(virtualLayer.value.pixels || {})
        mergeVirtualLayer()
    }

    function rebindActiveBoard() {
        const b = boards.value.find(x => x.id === activeBoardId.value)
        if (b && b.data !== editorData.value) {
            b.data = editorData.value
            boardsRev.value++
        }
    }

    function undo() {
        if (historyIndex.value > 0) {
            historyIndex.value--;
            const data = history.value[historyIndex.value]
            if (data) {
                editorData.value = cloneDeep<EditorData>(data);
                markRawPixels(editorData.value)
                foldStrayVirtual()
                linkActiveFrame()
                rebindActiveBoard()
                sharedRev.value++
                markFullRedraw()
                drawTurn.value++
                save()
            }
        }
    }

    function redo() {
        if (historyIndex.value < history.value.length - 1) {
            historyIndex.value++;
            const data = history.value[historyIndex.value]
            if (data) {
                editorData.value = cloneDeep<EditorData>(data);
                markRawPixels(editorData.value)
                foldStrayVirtual()
                linkActiveFrame()
                rebindActiveBoard()
                sharedRev.value++
                markFullRedraw()
                drawTurn.value++
                save()
            }
        }
    }

    function addLayer() {
        const name = `Layer ${editorData.value.layers.length + 1}`;
        editorData.value.layers.push({
            name,
            pixels: markRaw({}),
            x: 0,
            y: 0
        });
        saveState();
    }

    function deleteLayer(index: number) {
        if (editorData.value.layers.length > 1) {
            editorData.value.layers.splice(index, 1);
            if (currentLayerIndex.value >= editorData.value.layers.length) {
                currentLayerIndex.value = editorData.value.layers.length - 1;
            }
            saveState();
        }
    }

    function setTool(tool: string) {
        currentTool.value = tool
        if (tool !== 'picker') pickedColorIndex.value = null
    }

    function colorIndexAt(x: number, y: number): number {
        const layers = editorData.value.layers
        for (let i = layers.length - 1; i >= 0; i--) {
            const l = layers[i]!
            const ci = l.pixels[`${x - l.x}_${y - l.y}`]
            if (ci !== undefined && ci !== -1) return ci
        }
        return -1
    }

    function applyIsoToAllBoards() {
        const src = editorData.value.meta!.iso!;
        for (const b of boards.value) {
            if (b.id === activeBoardId.value) continue;
            const meta = b.data.meta || (b.data.meta = {});
            meta.iso = { mode: src.mode, cell: { width: src.cell.width, height: src.cell.height } };
        }
        boardsRev.value++;
        saveWorkspaceLayout();
    }

    function cycleGridMode() {
        ensureIsoMeta();
        const order: Array<'square' | 'iso' | 'off'> = ['square', 'iso', 'off'];
        const current = editorData.value.meta!.iso!.mode;
        const next = order[(order.indexOf(current) + 1) % order.length]!;
        editorData.value.meta!.iso!.mode = next;
        saveState();
        applyIsoToAllBoards();
    }

    function setGridMode(mode: 'square' | 'iso' | 'off') {
        ensureIsoMeta();
        if (editorData.value.meta!.iso!.mode === mode) return;
        editorData.value.meta!.iso!.mode = mode;
        saveState();
        applyIsoToAllBoards();
    }

    function setGridCell(width: number | string, height: number | string) {
        ensureIsoMeta();
        const w = Math.min(32, Math.max(1, Math.floor(Number(width) || 1)));
        const h = Math.min(32, Math.max(1, Math.floor(Number(height) || 1)));
        editorData.value.meta!.iso!.cell = { width: w, height: h };
        saveState();
        applyIsoToAllBoards();
    }

    function paint({x, y}: { x: number; y: number }) {
        const color = currentTool.value === 'eraser' ? -1 : currentColorIndex.value;
        const size = brushSize.value;
        const offset = Math.floor((size - 1) / 2);

        const inBounds = (px: number, py: number) =>
            px >= 0 && px < editorData.value.width &&
            py >= 0 && py < editorData.value.height;

        const inSelection = (px: number, py: number) =>
            !selectionState.value.bounds.active || checkKeyInSelection(`${px}_${py}`);

        const paintAt = (px: number, py: number) => {
            if (!inBounds(px, py) || !inSelection(px, py)) return;
            setPixelByIndex(px, py, color);
        };

        for (let dx = -offset; dx < size - offset; dx++) {
            for (let dy = -offset; dy < size - offset; dy++) {
                const px = x + dx;
                const py = y + dy;
                paintAt(px, py);
                if (mirrorHorizontal.value) {
                    paintAt(editorData.value.width - 1 - px, py);
                }
                if (mirrorVertical.value) {
                    paintAt(px, editorData.value.height - 1 - py);
                }
                if (mirrorHorizontal.value && mirrorVertical.value) {
                    paintAt(editorData.value.width - 1 - px, editorData.value.height - 1 - py);
                }
            }
        }
        drawTurn.value++;
    }

    function clearVirtualLayer() {
        virtualLayer.value.pixels = markRaw({});
        virtualLayer.value.x = 0;
        virtualLayer.value.y = 0;
    }

    function writeVirtualPixel(x: number, y: number, colorIndex: number) {
        if (x < 0 || x >= editorData.value.width || y < 0 || y >= editorData.value.height) return;
        if (selectionState.value.bounds.active && !checkKeyInSelection(`${x}_${y}`)) return;
        if (colorIndex === -1) {
            delete virtualLayer.value.pixels[`${x}_${y}`];
        } else {
            virtualLayer.value.pixels[`${x}_${y}`] = colorIndex;
        }
        if (mirrorHorizontal.value) {
            const mx = editorData.value.width - 1 - x;
            if (mx >= 0 && mx < editorData.value.width &&
                !(selectionState.value.bounds.active && !checkKeyInSelection(`${mx}_${y}`))) {
                if (colorIndex === -1) {
                    delete virtualLayer.value.pixels[`${mx}_${y}`];
                } else {
                    virtualLayer.value.pixels[`${mx}_${y}`] = colorIndex;
                }
            }
        }
        if (mirrorVertical.value) {
            const my = editorData.value.height - 1 - y;
            if (my >= 0 && my < editorData.value.height &&
                !(selectionState.value.bounds.active && !checkKeyInSelection(`${x}_${my}`))) {
                if (colorIndex === -1) {
                    delete virtualLayer.value.pixels[`${x}_${my}`];
                } else {
                    virtualLayer.value.pixels[`${x}_${my}`] = colorIndex;
                }
            }
        }
        if (mirrorHorizontal.value && mirrorVertical.value) {
            const mx = editorData.value.width - 1 - x;
            const my = editorData.value.height - 1 - y;
            if (mx >= 0 && mx < editorData.value.width &&
                my >= 0 && my < editorData.value.height &&
                !(selectionState.value.bounds.active && !checkKeyInSelection(`${mx}_${my}`))) {
                if (colorIndex === -1) {
                    delete virtualLayer.value.pixels[`${mx}_${my}`];
                } else {
                    virtualLayer.value.pixels[`${mx}_${my}`] = colorIndex;
                }
            }
        }
    }

    function paintIsoLine(
        start: { x: number; y: number },
        end: { x: number; y: number },
        _cellW: number,
        _cellH: number,
        colorIndex: number,
    ) {
        clearVirtualLayer();
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const sx = dx >= 0 ? 1 : -1;
        const sy = dy >= 0 ? 1 : -1;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);

        const steep = ady > adx;
        const aU = steep ? ady : adx;
        const aV = steep ? adx : ady;
        const put = steep
            ? (u: number, v: number) => writeVirtualPixel(start.x + sx * v, start.y + sy * u, colorIndex)
            : (u: number, v: number) => writeVirtualPixel(start.x + sx * u, start.y + sy * v, colorIndex);

        if (aU === aV) {
            for (let i = 0; i <= aU; i++) put(i, i);
        } else {
            const runs = aV + 1;
            const total = (aU + 1) + (runs - 1);
            const base = Math.floor(total / runs);
            const extra = total % runs;
            let u = 0;
            for (let i = 0; i < runs; i++) {
                const len = base + (i >= runs - extra ? 1 : 0);
                for (let j = 0; j < len; j++) put(u + j, i);
                u += len - 1;
            }
        }
        markFullRedraw()
        drawTurn.value++;
    }

    function bucketFill(x: number, y: number, rootColorIndex: number): void {
        const target = currentColorIndex.value;
        if (target === rootColorIndex) return;
        const W = editorData.value.width;
        const H = editorData.value.height;
        const pixels = editorData.value.layers[currentLayerIndex.value]!.pixels;
        const stack: Array<[number, number]> = [[x, y]];
        while (stack.length) {
            const [cx, cy] = stack.pop()!;
            if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
            if (!checkKeyInSelection(`${cx}_${cy}`)) continue;
            const cur = pixels[`${cx}_${cy}`] ?? -1;
            if (cur !== rootColorIndex) continue;
            setPixelByIndex(cx, cy, target);
            stack.push([cx + 1, cy]);
            stack.push([cx - 1, cy]);
            stack.push([cx, cy + 1]);
            stack.push([cx, cy - 1]);
        }
        drawTurn.value++;
    }

    function removeColor(index: number) {
        if (editorData.value.colors.length <= 1) return
        forEachLayer(layer => {
            const next: { [key: string]: number } = {}
            Object.keys(layer.pixels).forEach(key => {
                const v = layer.pixels[key]!
                if (v === index) return
                next[key] = v > index ? v - 1 : v
            })
            layer.pixels = markRaw(next)
        })
        editorData.value.colors.splice(index, 1)
        if (currentColorIndex.value >= editorData.value.colors.length) {
            currentColorIndex.value = editorData.value.colors.length - 1
        } else if (currentColorIndex.value > index) {
            currentColorIndex.value--
        }
        saveState()
    }

    function cleanupUnusedColors() {
        const used = new Set<number>()
        forEachLayer(layer => {
            Object.values(layer.pixels).forEach(v => used.add(v))
        })
        if (used.size === editorData.value.colors.length) return
        const remap: number[] = []
        const newColors: string[] = []
        editorData.value.colors.forEach((c, i) => {
            if (used.has(i)) {
                remap[i] = newColors.length
                newColors.push(c)
            } else {
                remap[i] = -1
            }
        })
        if (newColors.length === 0 && editorData.value.colors.length > 0) {
            newColors.push(editorData.value.colors[0]!)
            remap[0] = 0
        }
        editorData.value.colors = newColors
        forEachLayer(layer => {
            const next: { [key: string]: number } = {}
            Object.keys(layer.pixels).forEach(key => {
                const mapped = remap[layer.pixels[key]!]
                if (mapped !== undefined && mapped >= 0) next[key] = mapped
            })
            layer.pixels = markRaw(next)
        })
        if (currentColorIndex.value >= newColors.length) {
            currentColorIndex.value = newColors.length - 1
        }
        saveState()
    }

    function trimHiddenPixels(): number {
        const w = editorData.value.width, h = editorData.value.height
        let removed = 0
        forEachLayer(layer => {
            const lx = layer.x || 0, ly = layer.y || 0
            const keys = Object.keys(layer.pixels)
            const next: { [key: string]: number } = {}
            for (const key of keys) {
                const {x: kx, y: ky} = key2Point(key)
                const x = kx + lx, y = ky + ly
                if (x < 0 || y < 0 || x >= w || y >= h) { removed++; continue }
                next[key] = layer.pixels[key]!
            }
            if (Object.keys(next).length !== keys.length) layer.pixels = markRaw(next)
        })
        if (removed) {
            markFullRedraw()
            drawTurn.value++
            saveState()
        }
        return removed
    }

    function mergeSelectedBlock(): { w: number; h: number } | null {
        const b = selectionState.value.bounds
        if (!b.active) return null
        const bw = Math.max(1, b.maxX - b.minX + 1)
        const bh = Math.max(1, b.maxY - b.minY + 1)
        if (bw <= 1 && bh <= 1) return null
        const w = editorData.value.width, h = editorData.value.height
        const phaseX = ((b.minX % bw) + bw) % bw
        const phaseY = ((b.minY % bh) + bh) % bh
        const leadX = phaseX > 0 ? 1 : 0
        const leadY = phaseY > 0 ? 1 : 0
        const outW = leadX + Math.max(1, Math.ceil((w - phaseX) / bw))
        const outH = leadY + Math.max(1, Math.ceil((h - phaseY) / bh))

        const cellSlots = (X: number, Y: number): number => {
            const x0 = leadX && X === 0 ? 0 : phaseX + (X - leadX) * bw
            const x1 = Math.min(w, leadX && X === 0 ? phaseX : phaseX + (X - leadX + 1) * bw)
            const y0 = leadY && Y === 0 ? 0 : phaseY + (Y - leadY) * bh
            const y1 = Math.min(h, leadY && Y === 0 ? phaseY : phaseY + (Y - leadY + 1) * bh)
            return Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
        }

        forEachLayer(layer => {
            const lx = layer.x || 0, ly = layer.y || 0
            const votes = new Map<string, Map<number, number>>()
            for (const key of Object.keys(layer.pixels)) {
                const {x: kx, y: ky} = key2Point(key)
                const ax = kx + lx, ay = ky + ly
                if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue
                const X = Math.floor((ax - phaseX) / bw) + leadX
                const Y = Math.floor((ay - phaseY) / bh) + leadY
                const cell = `${X}_${Y}`
                let m = votes.get(cell)
                if (!m) { m = new Map(); votes.set(cell, m) }
                const v = layer.pixels[key]!
                m.set(v, (m.get(v) || 0) + 1)
            }
            const next: { [key: string]: number } = {}
            votes.forEach((m, cell) => {
                let best = -1, bestN = 0, painted = 0
                m.forEach((n, v) => { painted += n; if (n > bestN) { bestN = n; best = v } })
                if (best < 0) return
                const {x: X, y: Y} = key2Point(cell)
                if (painted * 2 < cellSlots(X, Y)) return
                next[cell] = best
            })
            layer.pixels = markRaw(next)
            layer.x = 0
            layer.y = 0
        })
        editorData.value.width = outW
        editorData.value.height = outH
        selectionState.value.bounds.active = false
        selectionState.value.selecting = false
        markFullRedraw()
        drawTurn.value++
        boardsRev.value++
        saveState()
        return {w: outW, h: outH}
    }

    function mergeLayers(indices: number[]): boolean {
        const list = [...new Set(indices)]
            .filter(i => i >= 0 && i < editorData.value.layers.length)
            .sort((a, b) => a - b)
        if (list.length < 2) return false
        const merged: { [key: string]: number } = {}
        for (const i of list) {   // ascending — the top layer overwrites
            const layer = editorData.value.layers[i]!
            const lx = layer.x || 0, ly = layer.y || 0
            for (const key of Object.keys(layer.pixels)) {
                const {x, y} = key2Point(key)
                merged[`${x + lx}_${y + ly}`] = layer.pixels[key]!
            }
        }
        const target = editorData.value.layers[list[0]!]!
        target.pixels = markRaw(merged)
        target.x = 0
        target.y = 0
        for (let j = list.length - 1; j >= 1; j--) {
            editorData.value.layers.splice(list[j]!, 1)
        }
        currentLayerIndex.value = list[0]!
        layerActive.value = true
        markFullRedraw()
        drawTurn.value++
        saveState()
        return true
    }

    const clipboard = shallowRef<null | {
        kind: 'selection' | 'layer' | 'board'
        width: number
        height: number
        pixels: { [key: string]: string }
    }>(null)

    function copyActiveScope(): 'selection' | 'layer' | 'board' | null {
        const scope = activeScope.value
        const colors = editorData.value.colors
        const out: { [key: string]: string } = {}
        if (scope === 'selection' || scope === 'layer') {
            const layer = editorData.value.layers[currentLayerIndex.value]!
            const lx = layer.x || 0, ly = layer.y || 0
            for (const key of Object.keys(layer.pixels)) {
                const {x, y} = key2Point(key)
                const ax = x + lx, ay = y + ly
                if (scope === 'selection' && !checkKeyInSelection(`${ax}_${ay}`)) continue
                const hex = colors[layer.pixels[key]!]
                if (hex) out[`${ax}_${ay}`] = hex
            }
        } else {
            for (let i = editorData.value.layers.length - 1; i >= 0; i--) {
                const layer = editorData.value.layers[i]!
                const lx = layer.x || 0, ly = layer.y || 0
                for (const key of Object.keys(layer.pixels)) {
                    const {x, y} = key2Point(key)
                    const ak = `${x + lx}_${y + ly}`
                    if (ak in out) continue
                    const hex = colors[layer.pixels[key]!]
                    if (hex) out[ak] = hex
                }
            }
        }
        if (!Object.keys(out).length) return null
        clipboard.value = {
            kind: scope,
            width: editorData.value.width,
            height: editorData.value.height,
            pixels: out,
        }
        return scope
    }

    function pasteClipboard(): 'layer' | 'board' | null {
        const clip = clipboard.value
        if (!clip) return null
        if (clip.kind === 'board') {
            const data = markRawPixels({
                ...cloneDeep(DEFAULT_EDITOR_DATA),
                id: generateUUID(),
                name: `${editorData.value.name || 'Board'} copy`,
                width: clip.width,
                height: clip.height,
                colors: [] as string[],
                layers: [{name: 'Layer 1', pixels: {}, x: 0, y: 0}],
                updated: new Date().toISOString(),
            } as EditorData)
            for (const key of Object.keys(clip.pixels)) {
                data.layers[0]!.pixels[key] = findOrCreateColor(clip.pixels[key]!, data.colors)
            }
            addBoardWithData(data)
            return 'board'
        }
        const colors = editorData.value.colors
        const pixels: { [key: string]: number } = {}
        for (const key of Object.keys(clip.pixels)) {
            pixels[key] = findOrCreateColor(clip.pixels[key]!, colors)
        }
        editorData.value.layers.push({name: 'Pasted', pixels: markRaw(pixels), x: 0, y: 0})
        currentLayerIndex.value = editorData.value.layers.length - 1
        layerActive.value = true
        editorData.value.colors = colors.map(c => c.toUpperCase())
        markFullRedraw()
        drawTurn.value++
        saveState()
        return 'layer'
    }

    function applyPalette(colors: string[], mode: 'replace' | 'append' = 'replace', paletteId: number | null = null) {
        const incoming = (colors || []).filter(Boolean).map(c => c.toUpperCase())
        if (!incoming.length) return
        if (mode === 'append') {
            incoming.forEach(hex => findOrCreateColor(hex, editorData.value.colors))
        } else {
            const cur = editorData.value.colors
            const n = Math.max(cur.length, incoming.length)
            const next: string[] = []
            for (let i = 0; i < n; i++) next.push(incoming[i] ?? cur[i]!)
            editorData.value.colors = next
            if (currentColorIndex.value >= next.length) currentColorIndex.value = next.length - 1
        }
        editorData.value.palette = paletteId
        markFullRedraw()
        drawTurn.value++
        saveState()
    }

    function clearCurrentLayer() {
        getContentInBound(true)
        saveState();
    }

    function toggleMirror(direction: 'vertical' | 'horizontal') {
        if (direction === 'vertical') {
            mirrorVertical.value = !mirrorVertical.value;
        } else if (direction === 'horizontal') {
            mirrorHorizontal.value = !mirrorHorizontal.value;
        }
    }

    function flipSpan(size: number): number {
        return selectionState.value.bounds.active ? size : size - 1
    }

    function flipSelectionHorizontal(): void {
        const temp: { [key: string]: number } = {};
        const pixels = editorData.value.layers[currentLayerIndex.value]!.pixels
        const vb = validBounds.value
        const span = flipSpan(vb.width)
        Object.keys(pixels).forEach(key => {
            if (checkKeyInSelection(key)) {
                const {x, y} = key2Point(key)
                temp[`${vb.x + span - (x - vb.x)}_${y}`] = pixels[key] ?? 0
            } else {
                temp[key] = pixels[key] ?? 0
            }
        })
        editorData.value.layers[currentLayerIndex.value]!.pixels = markRaw(temp)
        saveState();
    }

    function flipSelectionVertical(): void {
        const temp: { [key: string]: number } = {};
        const pixels = editorData.value.layers[currentLayerIndex.value]!.pixels
        const vb = validBounds.value
        const span = flipSpan(vb.height)
        Object.keys(pixels).forEach(key => {
            if (checkKeyInSelection(key)) {
                const {x, y} = key2Point(key)
                temp[`${x}_${vb.y + span - (y - vb.y)}`] = pixels[key] ?? 0
            } else {
                temp[key] = pixels[key] ?? 0
            }
        })
        editorData.value.layers[currentLayerIndex.value]!.pixels = markRaw(temp)
        saveState();
    }

    function immigrateVirtualLayer() {
        virtualLayer.value.pixels = markRaw(getContentInBound(true));
        editorData.value.layers.splice(currentLayerIndex.value + 1, 0, virtualLayer.value);
        markFullRedraw()
        drawTurn.value++;
    }

    function beginVirtualOverlay() {
        clearVirtualLayer()
        editorData.value.layers.splice(currentLayerIndex.value + 1, 0, virtualLayer.value)
        markFullRedraw()
        drawTurn.value++
    }

    const allFrames = ref(false)

    function translateLayer(layer: Layer, dx: number, dy: number) {
        const moved: { [key: string]: number } = {}
        Object.keys(layer.pixels).forEach(key => {
            const {x, y} = key2Point(key)
            moved[`${x + dx}_${y + dy}`] = layer.pixels[key]!
        })
        layer.pixels = markRaw(moved)
    }

    function mergeVirtualLayer() {
        const vi = editorData.value.layers.indexOf(virtualLayer.value)
        if (vi <= 0) {
            virtualLayer.value.pixels = markRaw({})
            virtualLayer.value.x = 0
            virtualLayer.value.y = 0
            markFullRedraw()
            drawTurn.value++;
            return
        }

        const host = editorData.value.layers[vi - 1]!
        const dx = virtualLayer.value.x
        const dy = virtualLayer.value.y
        Object.keys(virtualLayer.value.pixels).forEach((key) => {
            const {x, y} = key2Point(key)
            const newKey = `${x + dx}_${y + dy}`;
            host.pixels[newKey] = virtualLayer.value.pixels[key] ?? -1;
        })
        editorData.value.layers.splice(vi, 1);

        if (allFrames.value && (dx || dy) && !selectionState.value.bounds.active) {
            const anim = editorData.value.meta?.animation
            if (anim?.frames?.length) {
                const all: Layer[] = [...(anim.shared ?? [])]
                anim.frames.forEach(f => all.push(...(f.layers ?? [])))
                all.forEach(l => {
                    if (l !== host) translateLayer(l, dx, dy)
                })
            }
        }

        virtualLayer.value.pixels = markRaw({})
        virtualLayer.value.x = 0
        virtualLayer.value.y = 0
        markFullRedraw()
        drawTurn.value++;
    }

    function move(dx: number, dy: number): void {
        virtualLayer.value.x += dx
        virtualLayer.value.y += dy
        markFullRedraw()
        drawTurn.value++;
    }

    function resize({width, height}: { width: number; height: number }): void {
        editorData.value.width = width
        editorData.value.height = height
        const b = selectionState.value.bounds
        if (b.active) {
            if (b.minX > width - 1 || b.minY > height - 1) {
                b.active = false
                selectionState.value.selecting = false
            } else {
                b.maxX = Math.min(b.maxX, width - 1)
                b.maxY = Math.min(b.maxY, height - 1)
            }
        }
        saveState();
    }

    async function syncLocalToCloud() {
        if (!auth.isLogged) return
        const workspaces: { [key: string]: EditorData } = getStorageItem('workspaces')
        const keys = Object.keys(workspaces)
        if (keys.length === 0) return

        let synced = 0
        const failed: string[] = []
        for (const key of keys) {
            const item = workspaces[key]
            if (!item || !validateEditorData(item)) continue
            try {
                const payload = {
                    name: item.name || 'Untitled',
                    desc: item.desc || '',
                    tags: item.tags || [],
                    width: item.width,
                    height: item.height,
                    colors: item.colors,
                    layers: item.layers,
                    template: item.template,
                    id_string: '',
                    map_numbers: layers2MapNumbers(item),
                    is_public: item.is_public,
                    meta: item.meta ?? {},
                }
                await useNativeFetch<SharedPage>(`/coloring/shared-pages/`, {
                    method: 'POST',
                    body: payload
                })
                synced++
            } catch (e) {
                failed.push(key)
                console.error(`Failed to sync workspace ${key}:`, e)
            }
        }
        if (failed.length === 0) {
            localStorage.setItem('workspaces', '{}')
            localStorage.setItem('histories', '{}')
            localStorage.setItem('workspace_current', '')
            try { localStorage.removeItem('workspace_layout') } catch { /* ignore */ }
            void clearWorkspaceFull()
            localWS.value = {}
            histories.value = {}
        } else {
            const keep: { [key: string]: EditorData } = {}
            for (const key of failed) keep[key] = workspaces[key]!
            try { localStorage.setItem('workspaces', JSON.stringify(keep)) } catch { /* quota */ }
            localWS.value = keep
            toast.error(`${failed.length} artwork${failed.length > 1 ? 's' : ''} failed to sync — kept locally`)
        }
        if (synced > 0) {
            toast.success(`Synced ${synced} artwork${synced > 1 ? 's' : ''} to cloud`)
        }
    }

    return {
        editorData,
        boards,
        activeBoardId,
        boardsRev,
        setActiveBoard,
        addBoard,
        addBoardWithData,
        moveBoard,
        removeBoard,
        saveWorkspaceLayout,
        currentTool,
        brushSize,
        setBrushSize,
        bgConfig,
        setBg,
        setArtTileset,
        currentColorIndex,
        pickedColorIndex,
        colorIndexAt,
        currentLayerIndex,
        layerActive,
        activeScope,
        activateLayer,
        mirrorHorizontal,
        mirrorVertical,
        localWS,
        selectionState,
        validBounds,
        drawTurn,
        consumeRenderDirty,
        history,
        load,
        flipSelectionHorizontal,
        flipSelectionVertical,
        undo,
        redo,
        canUndo,
        canRedo,
        addLayer,
        deleteLayer,
        immigrateVirtualLayer,
        beginVirtualOverlay,
        mergeVirtualLayer,
        move,
        resetEditorData,
        setTool,
        paint,
        resize,
        clearCurrentLayer,
        toggleMirror,
        saveState,
        checkKeyInSelection,
        bucketFill,
        removeColor,
        cleanupUnusedColors,
        trimHiddenPixels,
        mergeSelectedBlock,
        clipboard,
        copyActiveScope,
        pasteClipboard,
        mergeLayers,
        applyPalette,
        save,
        saveNow,
        flush,
        syncLocalToCloud,
        importFiles,
        insertImage,
        loadAnimationFrames,
        allFrames,
        cycleGridMode,
        setGridMode,
        setGridCell,
        paintIsoLine,
        clearVirtualLayer,
        currentFrameIndex,
        onionSkin,
        isPlaying,
        sharedRev,
        frames,
        frameCount,
        isAnimated,
        fps,
        loopAnimation,
        sharedLayers,
        editingShared,
        editShared,
        ensureAnimation,
        addFrame,
        duplicateFrame,
        deleteFrame,
        moveFrame,
        setActiveFrame,
        setFrameDuration,
        setFps,
        toggleLoop,
        tags,
        activeTagId,
        activeTag,
        addTag,
        updateTag,
        deleteTag,
    }
})
