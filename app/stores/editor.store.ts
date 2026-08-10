import {defineStore} from 'pinia'
import type {EditorData, Layer, SharedPage} from "~/types";
import {useNativeFetch} from "~/composables/useCustomFetch";
import {cloneDeep, debounce, generateUUID, getStorageItem, key2Point, sharedPage2EditorData} from "~/helper/utils";
import {DEFAULT_EDITOR_DATA} from "~/helper/constants";
import {markRaw, ref, shallowRef, toRaw} from "vue";
import {layers2MapNumbers} from "~/helper/canvas";
import {isSameColor, rgbToHex} from "~/helper/color";
import {loadWorkspaceFull, saveWorkspaceFull, clearWorkspaceFull} from "~/helper/workspaceSnapshot";
import {toast} from "vue-sonner";

export const useEditor = defineStore('editor', () => {
    const auth = useAuthStore()
    const localTs = useLocalTilesets()

    // The pixel dictionaries are the hot, high-cardinality data. We keep them
    // OUT of Vue's reactivity via markRaw so the drawing flow never pays for
    // proxying, deep-watch traversal, or devtools mutation logging (Pinia
    // deep-watches store state in dev). editorData itself stays reactive so the
    // UI (layer list, palette, size) updates normally; rendering is driven by
    // the `drawTurn` signal, not by pixel reactivity. Call this after any
    // editorData (re)assignment so restored/loaded pixels stay non-reactive.
    function markRawPixels(ed: EditorData): EditorData {
        ed.layers?.forEach(l => { l.pixels = markRaw(l.pixels || {}) })
        // Frames + shared background carry their own layer stacks — keep their
        // pixels non-reactive too.
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

    const localWS = ref<{ [key: string]: EditorData }>({})

    const histories = ref<{
        [key: string]: {
            data: EditorData[],
            index: number,
            updated: string | number
        }
    }>({})

    // History holds up to MAX_HISTORY full snapshots. Kept in a shallowRef so
    // Vue does NOT deeply proxy every pixel of every snapshot — on large
    // canvases (64×64+) deep-reactive history is what blows up memory and
    // crashes the tab on bulk edits. Nothing renders `history` reactively;
    // it's only read by undo/redo and persistence.
    const MAX_HISTORY = 50;
    const history = shallowRef<EditorData[]>([]);
    const historyIndex = ref(-1);

    // ── Multi-board workspace (Phase 2) ────────────────────────────────────
    // The infinite canvas holds N boards; each board IS an independent art. The
    // live editorData/history/currentLayerIndex/… always describe the ACTIVE
    // board. Switching stashes the live OBJECTS back into the active board (no
    // clone → no divergence) and loads the target's. Non-active boards are
    // frozen and rendered from their stored `data`.
    type Board = {
        id: string
        x: number           // world position (art px) of the board's top-left
        y: number
        data: EditorData
        history: EditorData[]
        historyIndex: number
        currentLayerIndex: number
        currentFrameIndex: number
    }
    const boards = ref<Board[]>([])
    const activeBoardId = ref('')
    const boardsRev = ref(0)   // bumps on add/remove/switch → renderer rebuilds non-active buffers

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
        layerActive.value = false          // selecting a board → board scope, no layer active
        sharedRev.value++
        markFullRedraw()
        drawTurn.value++
        boardsRev.value++
    }

    // Rebuild the board list around the freshly loaded/reset single art.
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

    // Where a new auto-placed board lands: right of the rightmost, small gap.
    function nextBoardX(): number {
        const gap = 8
        let x = 0
        for (const b of boards.value) x = Math.max(x, b.x + b.data.width + gap)
        return x
    }

    // Append `data` as a new board (at `pos` if given, else auto-placed), make
    // it active, and seed its undo history. Shared by addBoard/addBoardWithData.
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
        saveState(false)                    // seed the new board's history
        board.history = history.value
        board.historyIndex = historyIndex.value
        saveWorkspaceLayout()
        return board.id
    }

    // A blank board of the given size. `pos` (world art-px) places it exactly —
    // used by the marquee-create gesture; omitted → auto-placed by the menu.
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

    // Bring an existing art (already converted to EditorData) onto the canvas as
    // its own board. If a board already holds this art, just activate it (no dup)
    // so its edits don't fork.
    function addBoardWithData(data: EditorData, pos?: { x: number, y: number }): string {
        const existing = boards.value.find(b => b.id === data.id.toString())
        if (existing) { setActiveBoard(existing.id); return existing.id }
        return pushBoard(markRawPixels(data), pos)
    }

    // Reposition a board on the infinite canvas (world art-px). Position only —
    // content is unchanged, so we don't bump boardsRev (keeps the composite
    // cache warm); the caller redraws.
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

    // ── Workspace persistence (local) ──────────────────────────────────────
    // The whole multi-board workspace is snapshotted SELF-CONTAINED into one
    // key (`workspace_full`): each board's position + full data inline, plus
    // which board is active. This sidesteps the id remapping the cloud save
    // does to the active art — restore rebuilds directly from the snapshot and
    // never has to reconcile ids across stores. (Each art still saves to the
    // server independently via performSave for sharing/gallery.)
    // A board's persisted position + appearance, minus the heavy pixel data.
    function boardLayoutEntry(b: Board) {
        const data = b.id === activeBoardId.value ? editorData.value : b.data
        return { id: String(b.id), x: b.x, y: b.y, bg: data?.meta?.bg ?? null, iso: data?.meta?.iso ?? null }
    }

    function saveWorkspaceLayout() {
        // Lightweight layout (positions + per-board appearance) — written FIRST and
        // always, so it survives even when the heavy snapshot below hits the
        // localStorage quota. `applyWorkspaceLayoutOverlay` reapplies it on restore,
        // which is why a moved board / bg change persists across a reload even with
        // many big boards. A few hundred bytes per board — never near quota.
        try {
            localStorage.setItem('workspace_layout', JSON.stringify({
                boards: boards.value.map(boardLayoutEntry),
                activeIndex: Math.max(0, boards.value.findIndex(b => b.id === activeBoardId.value)),
            }))
        } catch { /* ignore */ }

        // The multi-board snapshot (full data inline) is a >1-board-only invariant
        // (the /work delete + slicer flows rely on it). It lives in IndexedDB now
        // (not localStorage) so many/large boards no longer hit the ~5 MB quota;
        // writes are fire-and-forget (the lightweight layout above is the source
        // of truth for positions/appearance regardless).
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
        // The board load() just resolved (the single entry initBoardsFromCurrent
        // built). When the URL explicitly asked for it (?id= from /work), the
        // snapshot must not bury it: it stays loaded, active, and fresh.
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
                // Same art already on the desk — keep its position, use the
                // fresh load's data (cloud/localStorage is what /work showed).
                rebuilt[idx] = {...fresh, x: rebuilt[idx]!.x, y: rebuilt[idx]!.y}
                ai = idx
            } else {
                // Not on the desk yet — place it right of the rightmost board.
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

    // Reapply the lightweight layout (positions + per-board bg/iso) over whatever
    // the boards were rebuilt as. This is the source of truth for those props: it
    // always persists, so it corrects a stale/failed `workspace_full` snapshot
    // (the reason a moved board or a bg change used to be lost with many boards).
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

    // Background config — persisted in editorData.meta.bg so it saves with the art
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
        // Background is a workspace-wide appearance — mirror it onto every board.
        for (const b of boards.value) {
            if (b.id === activeBoardId.value) continue;
            const meta = b.data.meta || (b.data.meta = {});
            meta.bg = { ...next };
        }
        boardsRev.value++;             // per-board composites re-render with the new bg
        saveState();
        saveWorkspaceLayout();
    }

    // Record (or clear) which tileset/tile this art belongs to. Lives in meta so
    // it persists with the art (cloud meta / local tile / workspace snapshot) —
    // the editor no longer depends on the ?tileset= URL to know the association.
    function setArtTileset(id: string | null, tid?: number | string | null) {
        if (!editorData.value) return;
        const meta = {...(editorData.value.meta || {})};
        if (id) meta.tileset = {id, ...(tid != null ? {tid} : {})};
        else delete meta.tileset;
        editorData.value.meta = meta;
        save();
    }

    const currentColorIndex = ref(0);
    // "Find color" tool: palette index of the pixel currently under the cursor
    // (null = nothing / empty pixel). Drives the palette highlight + readout.
    const pickedColorIndex = ref<number | null>(null);
    const currentLayerIndex = ref(0);
    const drawTurn = ref(0)

    // ===== Animation =====
    // Model: when animated, editorData.layers IS the SAME array reference as
    // meta.animation.frames[currentFrameIndex].layers, so every drawing tool
    // edits the active frame directly with zero syncing. Switching frames just
    // rebinds editorData.layers. cloneDeep (utils) preserves shared refs via its
    // `visited` map, so this link survives history snapshots and save/load.
    const MAX_FRAMES = 64
    const currentFrameIndex = ref(0)   // -1 = editing the shared background stack
    const onionSkin = ref(false)   // ephemeral view pref (not persisted)
    const isPlaying = ref(false)   // ephemeral playback state
    const sharedRev = ref(0)       // bumps when shared layers may have changed (bg cache key)
    const frames = computed(() => editorData.value.meta?.animation?.frames ?? [])
    const frameCount = computed(() => frames.value.length)
    const isAnimated = computed(() => frameCount.value > 1)
    const fps = computed(() => editorData.value.meta?.animation?.fps ?? 10)
    const loopAnimation = computed(() => editorData.value.meta?.animation?.loop ?? true)
    // Shared "static background" layers, composited beneath every frame.
    const sharedLayers = computed(() => editorData.value.meta?.animation?.shared ?? [])
    const editingShared = computed(() => currentFrameIndex.value === -1)

    function ensureSharedStack() {
        const anim = editorData.value.meta?.animation
        if (!anim) return
        if (!anim.shared) anim.shared = []
        if (!anim.shared.length) anim.shared.push({name: 'Background', pixels: markRaw({}), x: 0, y: 0})
    }

    // Iterate every layer across all frames + shared (or just current layers when
    // static). Used for canvas-wide ops like palette remap.
    function forEachLayer(fn: (layer: Layer) => void) {
        const anim = editorData.value.meta?.animation
        if (anim?.frames?.length) {
            anim.frames.forEach(f => f.layers?.forEach(fn))
            anim.shared?.forEach(fn)
        } else {
            editorData.value.layers.forEach(fn)
        }
    }

    // Bind editorData.layers to the active frame (or the shared stack at idx -1).
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
            // Promote the current static art to frame 0 — keep the SAME layers ref.
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
        // Leaving the shared editor → its content may have changed; let the bg cache rebuild.
        if (wasShared && currentFrameIndex.value !== -1) sharedRev.value++
        linkActiveFrame()
        markFullRedraw()
        drawTurn.value++
    }

    // Enter the shared-background editor (creates the stack lazily).
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
        setActiveFrame(i + 1)
        saveState()
    }

    function deleteFrame(i: number) {
        const anim = editorData.value.meta?.animation
        if (!anim?.frames || anim.frames.length <= 1) return
        anim.frames.splice(i, 1)
        if (anim.frames.length === 1) {
            // Collapse back to a static artwork. Bake any shared background
            // beneath the surviving frame so it isn't lost.
            const survivor = anim.frames[0]!
            const shared = anim.shared || []
            editorData.value.layers = shared.length ? [...shared, ...survivor.layers] : survivor.layers
            currentFrameIndex.value = 0
            delete editorData.value.meta!.animation
            markFullRedraw()
            drawTurn.value++
        } else {
            let next = currentFrameIndex.value
            if (i < next) next--                              // keep the SAME frame active after the shift
            next = Math.min(next, anim.frames.length - 1)     // deleted the last → clamp
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
        // All-frames mode: one duration for the whole animation.
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

    // Incremental render tracking. Reconverting the whole pixel map every frame
    // costs ~10ms at 128² — over the 60fps budget. Brush/eraser strokes only
    // touch a few pixels per frame, so we record the changed canvas coords and
    // let the renderer patch just those into its buffer. Structural changes
    // (resize, undo/redo, color edits, layer ops, move/iso) flag a full redraw.
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

    // ── Active scope (priority: selection > layer > board) ──────────────────
    // Keys/operations act on whatever is active. Selecting a board drops to
    // board scope (no layer active) — Delete then removes the board. Drawing or
    // picking a layer activates the layer; a selection outranks both.
    // Defaults true so a freshly opened single art edits its layer right away;
    // the act of selecting/creating a board (loadBoardLive) drops to board scope.
    const layerActive = ref(true)
    const activeScope = computed<'selection' | 'layer' | 'board'>(() => {
        if (selectionState.value.bounds.active) return 'selection'
        if (layerActive.value) return 'layer'
        return 'board'
    })
    // Pick a layer as the active target (Layers panel click / after drawing).
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

    function shouldIgnoreColor(hex: string, ignoreColor: number[] | null): boolean {
        if (ignoreColor) {
            const [r, g, b] = ignoreColor;
            const ignoreHex = rgbToHex(r!, g!, b!);
            return isSameColor(hex.replace("#", ""), ignoreHex.replace("#", ""));
        }
        return hex === '#ffffff' || isSameColor('ffffff', hex.replace("#", ""));
    }

    // Pure conversion: RGB grid → a fresh EditorData (no store mutation). Cells
    // may be null (already-resolved transparency: 1:1 import); when
    // `transparentHandled` is set the ignore-color/white heuristics are skipped
    // so genuinely white pixels survive. Shared by single- and multi-file import.
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

    // Replace the artwork with an animation built from sliced sprite-strip
    // frames (see helper/strip.ts). One shared palette across all frames —
    // the editor's colors array is artwork-global. null pixels = transparent.
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
        // In-place swap of the ACTIVE board — other boards survive (the old
        // resetEditorData() path collapsed the whole workspace).
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

    // One image file → a null-transparent RGB grid, via the chosen pipeline:
    // 'filter' resamples/quantizes like the converter; 'original' reads pixels
    // 1:1 (≤256/side — larger returns null and counts as skipped).
    async function fileToGrid(file: File, process: ImportProcess): Promise<(number[] | null)[][] | null> {
        const dataUrl = await readFileAsDataUrl(file);
        const canvasHelper = await import("~/helper/canvas");
        if (process === 'original') {
            const {grid, tooLarge} = await canvasHelper.dataUrlToOriginalGrid(dataUrl);
            return (tooLarge || !grid.length) ? null : grid;
        }
        const {rgbSamplesGrid, colorThatRepresentsTransparent} = await canvasHelper.dataUrlToSamplesGrid(dataUrl);
        if (!rgbSamplesGrid?.length) return null;
        // Normalize to null-transparency so every consumer downstream agrees.
        const ig = colorThatRepresentsTransparent;
        return rgbSamplesGrid.map(row => row.map(cell => {
            if (!cell) return null;
            const hex = rgbToHex(cell[0]!, cell[1]!, cell[2]!);
            return shouldIgnoreColor(hex, ig) ? null : cell;
        }));
    }

    // Parse one picked file into a fresh EditorData (JSON export or any image).
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

    // Import picked files with explicit intent (the editor collects the options
    // in a modal): each file → its own board, all files → frames of ONE new
    // animation on the active board, or (single file) replace the active canvas.
    async function importFiles(
        files: File[],
        opts: { process: ImportProcess; dest: ImportDest },
    ): Promise<{ added: number; skipped: number }> {
        let added = 0;
        let skipped = 0;

        if (opts.dest === 'frames') {
            const frameGrids: (number[] | null)[][][] = [];
            for (const file of files) {
                if (file.name.toLowerCase().endsWith('.json')) { skipped++; continue; }  // frames are image-only
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
            addBoardWithData(data);   // auto-placed right of the rightmost
            added++;
        }
        return {added, skipped};
    }

    // Single-file import keeps the historical semantics — the imported art
    // replaces the CURRENT canvas (as a new artwork, fresh id) — but only the
    // ACTIVE board: the rest of the multi-board workspace stays put (the old
    // resetEditorData() path collapsed every other board).
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
        saveState();          // seed history + persist AFTER the swap
        saveWorkspaceLayout();
    }

    // Stamp a sampled image grid onto the current frame's active layer, scaled to
    // fit (contain) the canvas and centered. Unlike loadFromFile this keeps the
    // existing canvas/size/palette and overlays the image — transparent/ignored
    // source pixels leave whatever is underneath untouched.
    const insertFromGrid = (pxColor: number[][][], ignoreColor: number[] | null) => {
        if (!pxColor?.length) return;

        const gh = pxColor.length;
        let gw = 0;
        for (const row of pxColor) gw = Math.max(gw, row?.length || 0);
        if (!gw) return;

        const cw = editorData.value.width;
        const ch = editorData.value.height;

        // Contain: largest scale that fits the whole image inside the canvas.
        const scale = Math.min(cw / gw, ch / gh);
        const targetW = Math.max(1, Math.round(gw * scale));
        const targetH = Math.max(1, Math.round(gh * scale));
        const offsetX = Math.floor((cw - targetW) / 2);
        const offsetY = Math.floor((ch - targetH) / 2);

        const layer = editorData.value.layers[currentLayerIndex.value]!;
        const colors = editorData.value.colors;

        for (let ty = 0; ty < targetH; ty++) {
            const sy = Math.min(gh - 1, Math.floor(ty * gh / targetH));
            const srcRow = pxColor[sy];
            if (!srcRow?.length) continue;
            for (let tx = 0; tx < targetW; tx++) {
                const sx = Math.min(srcRow.length - 1, Math.floor(tx * gw / targetW));
                const [r, g, b] = srcRow[sx] || [0, 0, 0];
                const hex = rgbToHex(r!, g!, b!);
                if (shouldIgnoreColor(hex, ignoreColor)) continue;

                const cx = offsetX + tx;
                const cy = offsetY + ty;
                if (cx < 0 || cy < 0 || cx >= cw || cy >= ch) continue;

                layer.pixels[`${cx - layer.x}_${cy - layer.y}`] = findOrCreateColor(hex, colors);
            }
        }

        editorData.value.colors = colors.map(x => x.toUpperCase());
        saveState();
    }

    // Like importImage, but inserts the picked image into the current frame
    // (overlay) instead of replacing the artwork. Images only — a .json is a
    // whole-document format, so it stays an "import".
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
                    const {dataUrlToSamplesGrid} = await import("~/helper/canvas");
                    const {rgbSamplesGrid, colorThatRepresentsTransparent} = await dataUrlToSamplesGrid(dataUrl);
                    if (rgbSamplesGrid?.length)
                        insertFromGrid(rgbSamplesGrid, colorThatRepresentsTransparent);
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
                // A deleted (404) art shouldn't dead-end — open a fresh canvas,
                // but tell the user it was removed rather than silently swapping
                // in a blank. Transient/other errors stay silent (not "deleted").
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

        // An explicit id (e.g. /editor?id= from /work) must end up as the
        // active, focused board; the workspace_current fallback below is just
        // "reopen where I was" and carries no such intent.
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
                    // A guest tile lives only in the local tileset library, not
                    // in `workspaces` — resolve it there before falling back to
                    // a cloud fetch (lets /work tile links open for guests).
                    const localTile = localTs.findTileEd(id)
                    editorData.value = localTile ? localTile : await loadCloudPage(id)
                }
            }
            markRawPixels(editorData.value)
            // Bind editorData.layers to the active frame (frame 0 on load). For
            // cloud loads the top-level `layers` is just the still; the editable
            // truth lives in meta.animation.frames.
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
            applyWorkspaceLayoutOverlay()   // positions + bg/iso win over a stale snapshot
        } catch (error) {
            resetEditorData()
        }
    }

    async function performSave() {
        async function save2Cloud() {
            // Read from the raw object — layers2MapNumbers and JSON serialization
            // over the reactive proxy are slow on large canvases.
            const ed = toRaw(editorData.value)
            // For animated art, the representative still (thumbnail / OG / gallery)
            // is frame 0. The full animation rides in meta.animation.
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
                // Persist the art↔palette link when the user picked one.
                palette: ed.palette ?? null,
                id_string: ed.id_string,
                map_numbers: layers2MapNumbers({...ed, layers: primaryLayers}),
                is_public: ed.is_public,
                meta: ed.meta ?? {},
            }
            // Create a brand-new cloud art (fresh canvas, Tileset Slicer hand-off,
            // or an imported file). Never send a carried-over slug on create — let
            // the backend mint a fresh, unique one.
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
                // Re-key the board that held this art under its local UUID —
                // board identity must follow the cloud id, or the workspace
                // snapshot and addBoardWithData's dedupe keep seeing the
                // retired UUID and every later open of this art spawns a
                // duplicate board (which then autosaves as a duplicate art).
                const promoted = boards.value.find(b => b.id === oldLocalKey)
                if (promoted) {
                    promoted.id = result.id.toString()
                    if (activeBoardId.value === oldLocalKey) activeBoardId.value = promoted.id
                    boardsRev.value++
                    saveWorkspaceLayout()
                }
                // Drop the stale local workspace so F5 doesn't reload it (which
                // would look like an unsaved local art and POST a duplicate).
                if (localWS.value[oldLocalKey]) {
                    delete localWS.value[oldLocalKey]
                    try {
                        localStorage.setItem('workspaces', JSON.stringify(localWS.value))
                    } catch (e) {
                        console.warn('Failed to prune promoted local workspace:', e)
                    }
                }
            }

            // A cloud record exists only when we hold its numeric pk *and* slug
            // (same invariant as destroyCurrent / the work page). A truthy
            // id_string paired with a local UUID id — e.g. after importing an
            // image over a previously-saved art — is NOT a server record:
            // PUTting to /shared-pages/{uuid}/ would 404. Treat it as new (POST).
            const existsOnServer = typeof editorData.value.id === 'number' && !!editorData.value.id_string
            if (!existsOnServer) {
                // A blank, unnamed, never-saved canvas isn't an artwork yet —
                // POSTing it would litter /work with empty "Untitled" arts
                // every time a fresh board or a reset autosaves. It still
                // persists locally below; the first pixel (or a name) creates
                // the cloud record. Existing arts can be erased to empty and
                // PUT fine — this guards creation only.
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
                // The record is gone (deleted from Your Work while still open
                // here, or a stale local copy). Don't silently resurrect it
                // under the old identity — keep the user's work by saving it as
                // a brand-new artwork, and say so.
                const code = e?.statusCode ?? e?.response?.status
                if (code !== 404) throw e
                await createCloud()
                toast.info('The original was deleted — saved as a new artwork')
            }
        }

        function save2Local(forcePrivate = true) {
            // Logged-out work is always private. When logged in this is just a
            // local mirror of the already-synced art, so keep its real status
            // (never flip a published piece private, which a later PUT would sync).
            if (forcePrivate) editorData.value.is_public = false
            const snapshot = cloneDeep(toRaw(editorData.value))
            if (forcePrivate) snapshot.is_public = false
            localWS.value[editorData.value.id.toString()] = snapshot
            try {
                localStorage.setItem('workspaces', JSON.stringify(localWS.value))
            } catch (e) {
                // Quota exceeded (large canvas). Free the space taken by undo
                // history and retry — the artwork matters more than persisted
                // undo on a storage-limited origin.
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
            // Always keep a local mirror of the synced art: instant, offline-safe
            // reloads. It carries the numeric id + id_string, so a restore is a
            // server record (next save PUTs, never a duplicate POST).
            save2Local(false)
        } else {
            save2Local()
        }
        // Mirror the edit into any guest local tileset that holds this art, so
        // the tileset editor / ?tileset= reload reflect it (no-op if it's not a
        // tile anywhere). Never let a tileset write-back failure block the save.
        try { localTs.syncEditedArt(toRaw(editorData.value)) } catch (e) { /* non-fatal */ }
        // history.value entries are already immutable plain snapshots — no need
        // to clone the whole 50-deep array again (that second copy is a major
        // memory spike that contributed to crashes on large canvases).
        // Persist only the tail: a reload rarely needs 50 undo steps, and
        // stringifying every snapshot on each debounced save is the single
        // biggest localStorage write in the app. In-memory undo stays full.
        const wsId = editorData.value.id.toString()
        const tail = history.value.slice(-15)
        const offset = history.value.length - tail.length
        histories.value = {
            [wsId]: {
                data: tail,
                index: Math.max(0, Math.min(historyIndex.value - offset, tail.length - 1)),
                updated: editorData.value.updated
            }
        }
        localStorage.setItem('workspace_current', wsId)
        saveWorkspaceLayout()
        try {
            localStorage.setItem('histories', JSON.stringify(histories.value))
        } catch (e) {
            // QuotaExceededError on large canvases — persist only the most
            // recent snapshots so undo partly survives reload without crashing.
            console.warn('Failed to persist full history, trimming:', e)
            try {
                const data = history.value.slice(-10)
                const trimmed = {
                    [wsId]: {data, index: data.length - 1, updated: editorData.value.updated}
                }
                localStorage.setItem('histories', JSON.stringify(trimmed))
            } catch (e2) {
                console.warn('Failed to persist trimmed history, skipping:', e2)
            }
        }
    }

    // Serialize saves: a create (POST) must finish — and set id_string — before
    // the next save runs, otherwise a save that overlaps an in-flight create
    // still sees an empty id_string and POSTs a *duplicate*. Calls that arrive
    // while a save is running collapse into a single trailing re-save that
    // captures the latest state (and, by then, the real id_string → PUT).
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

    // Track whether a debounced save is still waiting. Mobile browsers freeze
    // timers when the tab is backgrounded (and often skip beforeunload), so the
    // trailing debounce would never run — flush() forces it out on page-hide.
    let savePending = false
    const debouncedSave = debounce(() => { savePending = false; void saveNow() }, 1000)
    function save() { savePending = true; debouncedSave() }

    // Persist any pending edit immediately. Safe to call from a visibilitychange
    // /pagehide handler: the localStorage writes in performSave run synchronously
    // (logged-out work is fully saved before the tab can be discarded), and the
    // logged-in cloud PUT is at least fired before the page freezes.
    function flush(): void {
        if (!savePending) return
        savePending = false
        void saveNow()
    }

    // Writes a single pixel. pixels is markRaw (non-reactive), so this is a
    // plain object write — no proxy, no devtools, no deep-watch. It does NOT
    // bump drawTurn; the calling operation (paint/bucketFill) bumps it once at
    // the end, so a brush move emits one render signal instead of ~100.
    function setPixelByIndex(x: number, y: number, paletteIndex: number): void {
        layerActive.value = true   // drawing engages the layer as the active target
        const layer = editorData.value.layers[currentLayerIndex.value]!
        if (paletteIndex === -1) {
            delete layer.pixels[`${x}_${y}`]
        } else {
            layer.pixels[`${x}_${y}`] = paletteIndex;
        }
        // Record the affected canvas coordinate for incremental rendering.
        markDirtyPixel(x + layer.x, y + layer.y)

        // All-frames mode: replicate the write into every other frame's
        // matching layer (same index, else its first). Covers brush, eraser,
        // bucket and iso-line — they all funnel through here. Other frames
        // aren't rendered live, so no extra dirty-marking is needed.
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
        // Clone from the raw object — avoids walking reactive proxies (much
        // faster) and yields a plain, non-reactive snapshot.
        const snapshot = cloneDeep<EditorData>(toRaw(editorData.value))
        const next = history.value.slice(0, historyIndex.value + 1);
        next.push(snapshot);
        historyIndex.value++;
        if (next.length > MAX_HISTORY) {
            next.shift();
            historyIndex.value--;
        }
        history.value = next;
        // A committed change can touch anything (color edits, layer ops, …) —
        // reconcile the render buffer fully on the next frame.
        markFullRedraw()
        drawTurn.value++
        if (isSync) save();
    }

    // Reactive availability of undo/redo for the ACTIVE board (history +
    // historyIndex are swapped per board on switch, so these track it).
    const canUndo = computed(() => historyIndex.value > 0)
    const canRedo = computed(() => historyIndex.value < history.value.length - 1)

    // A stray "Virtual" layer (from a pre-fix polluted snapshot, or a crash
    // mid-drag) gets folded back into its host so it never surfaces in the
    // Layers panel. mergeVirtualLayer finds it by reference, so adopt the very
    // object from the array first.
    function foldStrayVirtual() {
        const vi = editorData.value.layers.findIndex(l => l.name === 'Virtual')
        if (vi < 0) return
        currentLayerIndex.value = Math.max(0, vi - 1)
        virtualLayer.value = editorData.value.layers[vi]!
        virtualLayer.value.pixels = markRaw(virtualLayer.value.pixels || {})
        mergeVirtualLayer()
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
        // Leaving the picker clears its highlight.
        if (tool !== 'picker') pickedColorIndex.value = null
    }

    // Topmost visible palette index at a canvas coordinate (used by the "find
    // color" tool). Walks layers top→bottom; returns -1 when the pixel is empty.
    function colorIndexAt(x: number, y: number): number {
        const layers = editorData.value.layers
        for (let i = layers.length - 1; i >= 0; i--) {
            const l = layers[i]!
            const ci = l.pixels[`${x - l.x}_${y - l.y}`]
            if (ci !== undefined && ci !== -1) return ci
        }
        return -1
    }

    // Grid mode/cell is a WORKSPACE setting, not a per-board one: every board on
    // the canvas shares the same iso mode + cell so a tileset reads consistently.
    // Push the active board's iso onto every other board, then invalidate their
    // cached composites (checker↔solid bg) and persist the workspace snapshot.
    function applyIsoToAllBoards() {
        const src = editorData.value.meta!.iso!;
        for (const b of boards.value) {
            if (b.id === activeBoardId.value) continue;
            const meta = b.data.meta || (b.data.meta = {});
            meta.iso = { mode: src.mode, cell: { width: src.cell.width, height: src.cell.height } };
        }
        boardsRev.value++;             // per-board composites re-render with the new mode
        saveWorkspaceLayout();
    }

    // Grid mode is part of history — undo/redo includes mode changes, consistent with setGridCell.
    function cycleGridMode() {
        ensureIsoMeta();
        const order: Array<'square' | 'iso' | 'off'> = ['square', 'iso', 'off'];
        const current = editorData.value.meta!.iso!.mode;
        const next = order[(order.indexOf(current) + 1) % order.length]!;
        editorData.value.meta!.iso!.mode = next;
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
        // One render signal per brush move (not per pixel).
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

    /**
     * Generates a pixel-perfect line into virtualLayer, with the angle SNAPPED
     * to whichever pixel-art axis the (start → end) cursor vector is closest to:
     *
     *   horizontal · iso diagonal (cellH:cellW, e.g. 2:1) · true diagonal (1:1)
     *   · steep iso diagonal (cellW:cellH swapped, e.g. 1:2) · vertical
     *
     * — each in all four quadrants. Boundaries sit at the angular midpoints
     * between neighbouring axes, so the chosen slope follows the cursor live:
     * drag at ~45° for a clean 1:1 diagonal, shallower for the iso stair,
     * near-flat/near-plumb for straight edges.
     *
     * Stair algorithm (slope = h per w):
     *  - k = max(floor(|dx|/w), floor(|dy|/h)) — number of stair cells.
     *  - For each cell c ∈ [0, k]: paint a horizontal tread of w pixels.
     *  - For c ∈ [1, k]: paint a vertical riser of (h - 1) pixels connecting
     *    the previous tread's end column to the current tread's start row.
     *  (w=h=1 degenerates to the true 1:1 diagonal.)
     *
     * Emits pixels via writeVirtualPixel which honors mirror flags, selection,
     * and canvas bounds.
     */
    function paintIsoLine(
        start: { x: number; y: number },
        end: { x: number; y: number },
        cellW: number,
        cellH: number,
        colorIndex: number,
    ) {
        clearVirtualLayer();
        if (cellW < 1) cellW = 1;
        if (cellH < 1) cellH = 1;

        const dx = end.x - start.x;
        const dy = end.y - start.y;

        const sx = dx >= 0 ? 1 : -1;
        const sy = dy >= 0 ? 1 : -1;

        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        const angle = Math.atan2(ady, Math.max(adx, 1e-9));

        // Candidate slopes as stair cells (w, h); Infinity = vertical. Sorted by
        // angle, deduped (a 1×1 iso cell collapses onto the true diagonal).
        const candidates: Array<{ w: number; h: number } | 'h' | 'v'> = ['h'];
        const flat = { w: cellW, h: cellH };
        const steep = { w: cellH, h: cellW };
        for (const c of [flat.h / flat.w <= 1 ? flat : steep, { w: 1, h: 1 }, steep.h / steep.w >= 1 ? steep : flat]) {
            const prev = candidates[candidates.length - 1];
            if (typeof prev === 'object' && prev.h * c.w === c.h * prev.w) continue;   // same slope
            candidates.push(c);
        }
        candidates.push('v');
        const angleOf = (c: typeof candidates[number]) =>
            c === 'h' ? 0 : c === 'v' ? Math.PI / 2 : Math.atan2(c.h, c.w);

        // Pick the candidate whose axis angle is nearest the cursor angle.
        let chosen = candidates[0]!;
        for (const c of candidates) {
            if (Math.abs(angleOf(c) - angle) < Math.abs(angleOf(chosen) - angle)) chosen = c;
        }

        if (chosen === 'h') {
            for (let i = 0; i <= adx; i++) writeVirtualPixel(start.x + sx * i, start.y, colorIndex);
            markFullRedraw()
            drawTurn.value++;
            return;
        }
        if (chosen === 'v') {
            for (let i = 0; i <= ady; i++) writeVirtualPixel(start.x, start.y + sy * i, colorIndex);
            markFullRedraw()
            drawTurn.value++;
            return;
        }

        cellW = chosen.w;
        cellH = chosen.h;
        const cellsByX = Math.floor(adx / cellW);
        const cellsByY = Math.floor(ady / cellH);
        const k = Math.max(cellsByX, cellsByY);

        // Always paint the first tread (cellW pixels) at the start row.
        for (let i = 0; i < cellW; i++) {
            writeVirtualPixel(start.x + sx * i, start.y, colorIndex);
        }

        for (let c = 1; c <= k; c++) {
            // Tread of cell c: cellW pixels at row start.y + c*sy*cellH,
            // beginning at column start.x + c*sx*cellW.
            const treadX0 = start.x + c * sx * cellW;
            const treadY = start.y + c * sy * cellH;
            for (let i = 0; i < cellW; i++) {
                writeVirtualPixel(treadX0 + sx * i, treadY, colorIndex);
            }
            // Riser: (cellH - 1) pixels filling between previous tread and current tread.
            // Sits at the previous tread's end column, stepping from one row past
            // the previous tread to one row before the current tread.
            const prevTreadEndX = start.x + (c - 1) * sx * cellW + sx * (cellW - 1);
            const riserStartY = start.y + (c - 1) * sy * cellH + sy;
            for (let r = 0; r < cellH - 1; r++) {
                writeVirtualPixel(prevTreadEndX, riserStartY + sy * r, colorIndex);
            }
        }
        // Iso-line previews live in the virtual layer with offsets — rebuild fully.
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
        // Palette is shared across all frames — remap every frame's layers.
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

    // Apply a library palette to the current artwork.
    //  - 'replace': recolor by index — palette slot i takes the new color, so
    //    existing pixels recolor in place. Any slots the new palette doesn't
    //    cover keep the old color, so no pixel can point past the array.
    //  - 'append': add the palette's colors (de-duped) after the current ones;
    //    pixels are left untouched.
    // `paletteId` records the chosen library palette so it persists as the
    // art↔palette link on save (null = ad-hoc colors, clears any link).
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

    // Mirror axis: selection bounds are inclusive (width = maxX - minX), but the
    // whole-canvas fallback uses the exclusive canvas size — subtract 1 there so
    // column/row 0 maps to the last one instead of one past it.
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

    // Start a move/iso-line drag: CUT the affected content into the virtual
    // layer and splice it in just above the current layer. Deliberately no
    // saveState here — a drag start isn't a commit, and snapshotting now would
    // bake the transient "Virtual" layer into history (undo then resurrects a
    // ghost layer). The single history entry lands at mergeVirtualLayer time.
    function immigrateVirtualLayer() {
        virtualLayer.value.pixels = markRaw(getContentInBound(true));
        editorData.value.layers.splice(currentLayerIndex.value + 1, 0, virtualLayer.value);
        markFullRedraw()
        drawTurn.value++;
    }

    // All-frames mode: when ON, edits apply to every frame at once —
    // paint/erase/bucket replicate each pixel write (see setPixelByIndex),
    // and committing a whole-layer move translates every layer of every frame
    // (+ shared) by the same offset (e.g. recenter after a canvas resize).
    // Selection moves stay per-frame regardless.
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
        // Locate the in-flight layer BY REFERENCE — never splice blind by
        // index. If it isn't in the current art (undo / board switch / import
        // replaced editorData mid-drag), the pre-drag pixels are already back
        // via that snapshot: dropping the in-flight copy is the only merge
        // that neither duplicates pixels nor eats an innocent layer.
        const vi = editorData.value.layers.indexOf(virtualLayer.value)
        if (vi <= 0) {
            virtualLayer.value.pixels = markRaw({})
            virtualLayer.value.x = 0
            virtualLayer.value.y = 0
            markFullRedraw()
            drawTurn.value++;
            return
        }

        const host = editorData.value.layers[vi - 1]!   // the layer it was cut from
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
        // Moving shifts the whole composited layer — rebuild fully.
        markFullRedraw()
        drawTurn.value++;
    }

    function resize({width, height}: { width: number; height: number }): void {
        editorData.value.width = width
        editorData.value.height = height
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
            // Everything migrated — clear local storage, including the multi-board
            // snapshot and its lightweight layout, or the editor would rebuild
            // stale boards keyed by the now-migrated (dead) local ids on next load.
            localStorage.setItem('workspaces', '{}')
            localStorage.setItem('histories', '{}')
            localStorage.setItem('workspace_current', '')
            try { localStorage.removeItem('workspace_layout') } catch { /* ignore */ }
            void clearWorkspaceFull()
            localWS.value = {}
            histories.value = {}
        } else {
            // Partial failure: keep ONLY the failed items locally (they'd be lost
            // otherwise) — the synced ones now live in the cloud.
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
        // Multi-board workspace
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
        setGridCell,
        paintIsoLine,
        clearVirtualLayer,
        // Animation
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
    }
})
