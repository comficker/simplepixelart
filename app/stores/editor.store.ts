import {defineStore} from 'pinia'
import type {EditorData, Layer, SharedPage} from "~/types";
import {useNativeFetch} from "~/composables/useCustomFetch";
import {cloneDeep, debounce, generateUUID, getStorageItem, key2Point, sharedPage2EditorData} from "~/helper/utils";
import {DEFAULT_EDITOR_DATA} from "~/helper/constants";
import {ref} from "vue";
import {dataUrlToSamplesGrid, layers2MapNumbers} from "~/helper/canvas";
import {isSameColor, rgbToHex} from "~/helper/color";
import {toast} from "vue-sonner";

export const useEditor = defineStore('editor', () => {
    const auth = useAuthStore()

    const editorData = ref<EditorData>({
        ...cloneDeep(DEFAULT_EDITOR_DATA),
        id: generateUUID(),
        updated: new Date().toISOString()
    });
    const virtualLayer = ref<Layer>({
        name: 'Virtual',
        pixels: {},
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

    const history = ref<EditorData[]>([]);
    const historyIndex = ref(-1);

    const currentTool = ref("brush");
    const mirrorHorizontal = ref(false);
    const mirrorVertical = ref(false);

    const currentColorIndex = ref(0);
    const currentLayerIndex = ref(0);
    const drawTurn = ref(0)

    const selectionState = ref({
        selecting: false,
        start: {x: 0, y: 0},
        current: {x: 0, y: 0},
        bounds: {minX: 0, minY: 0, maxX: 0, maxY: 0, active: false}
    });

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
                editorData.value.layers[currentLayerIndex.value]!.pixels = {}
            }
        }
        return output;
    }

    function resetEditorData() {
        editorData.value = {
            ...cloneDeep(DEFAULT_EDITOR_DATA),
            id: generateUUID(),
            updated: new Date().toISOString()
        }
        ensureIsoMeta();
        history.value = []
        historyIndex.value = -1
        saveState(false)
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

    const loadFromFile = (pxColor: number[][][], ignoreColor: number[] | null) => {
        if (!pxColor?.length) return;
        
        const maps_results: { [key: string]: number } = {};
        const colors: string[] = [];
        let maxWidth = 0;

        for (let y = 0; y < pxColor.length; y++) {
            const row = pxColor[y];
            if (!row?.length) continue;
            
            maxWidth = Math.max(maxWidth, row.length);
            
            for (let x = 0; x < row.length; x++) {
                const [r, g, b] = row[x] || [0, 0, 0];
                const hex = rgbToHex(r!, g!, b!);
                
                if (shouldIgnoreColor(hex, ignoreColor)) continue;

                maps_results[`${x}_${y}`] = findOrCreateColor(hex, colors);
            }
        }

        resetEditorData();
        editorData.value.width = maxWidth;
        editorData.value.height = pxColor.length;
        editorData.value.layers[0]!.pixels = maps_results;
        editorData.value.colors = colors.map(x => x.toUpperCase());
        drawTurn.value++;
    }

    async function importImage() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,image/*';

        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const fileName = file.name.toLowerCase();

            if (fileName.endsWith('.json')) {
                // Handle JSON file
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const content = e.target?.result as string;
                        const jsonData = JSON.parse(content);

                        // Validate EditorData type
                        if (validateEditorData(jsonData)) {
                            editorData.value = {
                                ...cloneDeep(DEFAULT_EDITOR_DATA),
                                ...jsonData,
                                id: generateUUID(),
                                updated: new Date().toISOString()
                            };
                            ensureIsoMeta();
                            saveState();
                        } else {
                            console.error('Invalid EditorData format');
                        }
                    } catch (error) {
                        console.error('Error parsing JSON file:', error);
                    }
                };
                reader.readAsText(file);
            } else {
                // Handle image file
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const dataUrl = e.target?.result as string;
                        const {rgbSamplesGrid, colorThatRepresentsTransparent} = await dataUrlToSamplesGrid(dataUrl);
                        if (rgbSamplesGrid)
                            loadFromFile(rgbSamplesGrid, colorThatRepresentsTransparent)
                    } catch (error) {
                        console.error('Error processing image:', error);
                    }
                };
                reader.readAsDataURL(file);
            }
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
            } catch (e) {
                return {
                    ...cloneDeep(DEFAULT_EDITOR_DATA),
                    id: generateUUID(),
                    updated: new Date().toISOString()
                }
            }
        }

        try {
            histories.value = getStorageItem('histories')
            localWS.value = getStorageItem('workspaces')
            if (!id) id = localStorage.getItem("workspace_current") || '';
            if (id) {
                const temp = localWS.value[id]
                if (temp) {
                    editorData.value = cloneDeep(temp)
                } else {
                    editorData.value = await loadCloudPage(id)
                }
            }
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
            const layerNames = editorData.value.layers.map(x => x.name)
            const virIndex = layerNames.indexOf("Virtual")
            if (virIndex >= 0) {
                currentLayerIndex.value = virIndex - 1
                virtualLayer.value = cloneDeep(editorData.value.layers[virIndex]!)
                mergeVirtualLayer()
            }
        } catch (error) {
            resetEditorData()
        }
    }

    async function saveNow() {
        async function save2Cloud() {
            const payload = {
                name: editorData.value.name || 'Untitled',
                desc: editorData.value.desc || '',
                tags: editorData.value.tags || [],
                width: editorData.value.width,
                height: editorData.value.height,
                colors: editorData.value.colors,
                layers: editorData.value.layers,
                template: editorData.value.template,
                id_string: editorData.value.id_string,
                map_numbers: layers2MapNumbers(editorData.value),
                is_public: editorData.value.is_public,
                meta: editorData.value.meta ?? {},
            }
            if (editorData.value.id_string) {
                const result = await useNativeFetch<SharedPage>(`/coloring/shared-pages/${editorData.value.id}/`, {
                    method: 'PUT',
                    body: payload
                })
                editorData.value.updated = result.updated
                editorData.value.id_string = result.id_string
            } else {
                const result = await useNativeFetch<SharedPage>(`/coloring/shared-pages/`, {
                    method: 'POST',
                    body: payload
                })
                editorData.value.id = result.id
                editorData.value.id_string = result.id_string
                history.value.forEach(item => {
                    item.id = result.id
                })
                editorData.value.updated = result.updated
            }
        }

        function save2Local() {
            // Local-only work is always private; public status only comes from API
            editorData.value.is_public = false
            const snapshot = cloneDeep(editorData.value)
            snapshot.is_public = false
            localWS.value[editorData.value.id.toString()] = snapshot
            localStorage.setItem('workspaces', JSON.stringify(localWS.value))
        }

        if (auth.isLogged) {
            try {
                await save2Cloud();
            } catch (e) {
                console.error('Failed to save to cloud, falling back to local:', e);
                save2Local();
                toast.error('Cloud save failed — saved locally')
            }
        } else {
            save2Local();
        }
        histories.value = {
            [editorData.value.id.toString()]: {
                data: cloneDeep(history.value),
                index: historyIndex.value,
                updated: editorData.value.updated
            }
        }
        localStorage.setItem('workspace_current', editorData.value.id.toString())
        localStorage.setItem('histories', JSON.stringify(histories.value))
    }

    const save = debounce(saveNow, 1000)

    function setPixelByIndex(x: number, y: number, paletteIndex: number): void {
        if (paletteIndex === -1) {
            delete editorData.value.layers[currentLayerIndex.value]!.pixels[`${x}_${y}`]
        } else {
            editorData.value.layers[currentLayerIndex.value]!.pixels[`${x}_${y}`] = paletteIndex;
        }
        drawTurn.value++;
    }

    function saveState(isSync: boolean = true): void {
        editorData.value.version = historyIndex.value
        history.value = history.value.slice(0, historyIndex.value + 1);
        history.value.push(cloneDeep<EditorData>(editorData.value));
        historyIndex.value++;
        if (history.value.length > 50) {
            history.value.shift();
            historyIndex.value--;
        }
        drawTurn.value++
        if (isSync) save();
    }

    function undo() {
        if (historyIndex.value > 0) {
            historyIndex.value--;
            const data = history.value[historyIndex.value]
            if (data) {
                editorData.value = cloneDeep<EditorData>(data);
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
                drawTurn.value++
                save()
            }
        }
    }

    function addLayer() {
        const name = `Layer ${editorData.value.layers.length + 1}`;
        editorData.value.layers.push({
            name,
            pixels: {},
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
    }

    // Grid mode is part of history — undo/redo includes mode changes, consistent with setGridCell.
    function cycleGridMode() {
        ensureIsoMeta();
        const order: Array<'square' | 'iso' | 'off'> = ['square', 'iso', 'off'];
        const current = editorData.value.meta!.iso!.mode;
        const next = order[(order.indexOf(current) + 1) % order.length]!;
        editorData.value.meta!.iso!.mode = next;
        saveState();
    }

    function setGridCell(width: number | string, height: number | string) {
        ensureIsoMeta();
        const w = Math.min(32, Math.max(1, Math.floor(Number(width) || 1)));
        const h = Math.min(32, Math.max(1, Math.floor(Number(height) || 1)));
        editorData.value.meta!.iso!.cell = { width: w, height: h };
        saveState();
    }

    function paint({x, y}: { x: number; y: number }) {
        if (selectionState.value.bounds.active && !checkKeyInSelection(`${x}_${y}`)) return;
        const color = currentTool.value === 'eraser' ? -1 : currentColorIndex.value;
        setPixelByIndex(x, y, color);

        const inSelection = (mx: number, my: number) =>
            !selectionState.value.bounds.active || checkKeyInSelection(`${mx}_${my}`);

        if (mirrorHorizontal.value) {
            const mx = editorData.value.width - 1 - x;
            if (inSelection(mx, y)) setPixelByIndex(mx, y, color);
        }

        if (mirrorVertical.value) {
            const my = editorData.value.height - 1 - y;
            if (inSelection(x, my)) setPixelByIndex(x, my, color);
        }

        if (mirrorHorizontal.value && mirrorVertical.value) {
            const mx = editorData.value.width - 1 - x;
            const my = editorData.value.height - 1 - y;
            if (inSelection(mx, my)) setPixelByIndex(mx, my, color);
        }
    }

    function clearVirtualLayer() {
        virtualLayer.value.pixels = {};
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
     * Generates a pixel-perfect iso line into virtualLayer.
     * The line follows one of four axes — NE, SE, SW, NW — at slope ±cellH/cellW.
     * For each cellW horizontal step the line advances cellH vertically (stair-step).
     *
     * Algorithm:
     *  - Determine direction signs (sx, sy) from the (start → end) vector.
     *  - k = max(floor(|dx|/cellW), floor(|dy|/cellH)) — number of stair cells.
     *  - For each cell c ∈ [0, k]: paint a horizontal tread of cellW pixels.
     *  - For c ∈ [1, k]: paint a vertical riser of (cellH - 1) pixels that
     *    connects the previous tread's end column to the current tread's start row.
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

        const cellsByX = Math.floor(Math.abs(dx) / cellW);
        const cellsByY = Math.floor(Math.abs(dy) / cellH);
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
    }

    function removeColor(index: number) {
        if (editorData.value.colors.length <= 1) return
        editorData.value.layers.forEach(layer => {
            const next: { [key: string]: number } = {}
            Object.keys(layer.pixels).forEach(key => {
                const v = layer.pixels[key]!
                if (v === index) return
                next[key] = v > index ? v - 1 : v
            })
            layer.pixels = next
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
        editorData.value.layers.forEach(layer => {
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
        editorData.value.layers.forEach(layer => {
            const next: { [key: string]: number } = {}
            Object.keys(layer.pixels).forEach(key => {
                const mapped = remap[layer.pixels[key]!]
                if (mapped !== undefined && mapped >= 0) next[key] = mapped
            })
            layer.pixels = next
        })
        if (currentColorIndex.value >= newColors.length) {
            currentColorIndex.value = newColors.length - 1
        }
        saveState()
    }

    function deletePixelsByColor(targetColorIndex: number) {
        const pixels = editorData.value.layers[currentLayerIndex.value]!.pixels;
        let hasChange = false;
        Object.keys(pixels).forEach((key) => {
            if (selectionState.value.bounds.active && !checkKeyInSelection(key)) return;
            if (pixels[key] === targetColorIndex) {
                delete pixels[key];
                hasChange = true;
            }
        });
        if (hasChange) saveState();
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

    function flipSelectionHorizontal(): void {
        const temp: { [key: string]: number } = {};
        const pixels = editorData.value.layers[currentLayerIndex.value]!.pixels
        Object.keys(pixels).forEach(key => {
            if (checkKeyInSelection(key)) {
                const {x, y} = key2Point(key)
                temp[`${validBounds.value.x + validBounds.value.width - (x - validBounds.value.x)}_${y}`] = pixels[key] ?? 0
            } else {
                temp[key] = pixels[key] ?? 0
            }
        })
        editorData.value.layers[currentLayerIndex.value]!.pixels = temp
        saveState();
    }

    function flipSelectionVertical(): void {
        const temp: { [key: string]: number } = {};
        const pixels = editorData.value.layers[currentLayerIndex.value]!.pixels
        Object.keys(pixels).forEach(key => {
            if (checkKeyInSelection(key)) {
                const {x, y} = key2Point(key)
                temp[`${x}_${validBounds.value.y + validBounds.value.height - (y - validBounds.value.y)}`] = pixels[key] ?? 0
            } else {
                temp[key] = pixels[key] ?? 0
            }
        })
        editorData.value.layers[currentLayerIndex.value]!.pixels = temp
        saveState();
    }

    function immigrateVirtualLayer() {
        virtualLayer.value.pixels = getContentInBound(true);
        editorData.value.layers.splice(currentLayerIndex.value + 1, 0, virtualLayer.value);
        clearCurrentLayer()
    }

    function mergeVirtualLayer() {
        Object.keys(virtualLayer.value.pixels).forEach((key) => {
            const {x, y} = key2Point(key)
            const newKey = `${x + virtualLayer.value.x}_${y + virtualLayer.value.y}`;
            editorData.value.layers[currentLayerIndex.value]!.pixels[newKey] = virtualLayer.value.pixels[key] ?? -1;
        })
        editorData.value.layers.splice(currentLayerIndex.value + 1, 1);
        virtualLayer.value.pixels = {}
        virtualLayer.value.x = 0
        virtualLayer.value.y = 0
        drawTurn.value++;
    }

    function move(dx: number, dy: number): void {
        virtualLayer.value.x += dx
        virtualLayer.value.y += dy
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
                console.error(`Failed to sync workspace ${key}:`, e)
            }
        }
        // Clear local storage after sync
        localStorage.setItem('workspaces', '{}')
        localStorage.setItem('histories', '{}')
        localStorage.setItem('workspace_current', '')
        localWS.value = {}
        histories.value = {}
        if (synced > 0) {
            toast.success(`Synced ${synced} artwork${synced > 1 ? 's' : ''} to cloud`)
        }
    }

    return {
        editorData,
        currentTool,
        currentColorIndex,
        currentLayerIndex,
        mirrorHorizontal,
        mirrorVertical,
        localWS,
        selectionState,
        validBounds,
        drawTurn,
        history,
        load,
        flipSelectionHorizontal,
        flipSelectionVertical,
        undo,
        redo,
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
        deletePixelsByColor,
        removeColor,
        cleanupUnusedColors,
        save,
        saveNow,
        syncLocalToCloud,
        importImage,
        cycleGridMode,
        setGridCell,
        paintIsoLine,
        clearVirtualLayer,
    }
})
