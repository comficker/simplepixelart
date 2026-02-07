<script setup lang="ts">
import {onMounted, ref} from "vue";
import {cloneDeep} from "@/helper/utils";
import DropdownMenu from "~/components/ui/DropdownMenu.vue";
import CurrentWork from "~/components/CurrentWork.vue";
import Palette from "~/components/Editor/Palette.vue";
import Square from "~/components/Square.vue";
import {drawThumbnail, editorDataToJSON, editorDataToSVG, layers2MapNumbers} from "~/helper/canvas";

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

const canvas = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
const miniMap = ref<HTMLCanvasElement | null>(null);
let miniMapCtx: CanvasRenderingContext2D | null = null;

const store = useEditor()
const route = useRoute()

const EDITOR_SIZE = ref(384)
const MINIMAP_SIZE = ref(80)
const newSize = ref({width: 16, height: 16})
const zoom = ref(29);
const showGrid = ref(true);
const spacePressed = ref(false);
const panStart = ref({x: 0, y: 0});
const initialDistance = ref(0);
const initialZoom = ref(0);
const isMoving = ref(false);
const isDrawing = ref(false);
const isStarted = ref(false);
const isPanning = ref(false);
const isResizing = ref(false);
const isPinching = ref(false);
const moveStart = ref({x: 0, y: 0});
const needSave = ref(false);

const editorData = computed(() => store.editorData)

// ================================================== //
function getClientPos(event: MouseEvent | TouchEvent): { x: number, y: number } {
  const clientX = 'touches' in event ? event!.touches[0]!.clientX : event.clientX;
  const clientY = 'touches' in event ? event!.touches[0]!.clientY : event.clientY;
  return {x: clientX, y: clientY};
}

function getPixelPos(event: MouseEvent | TouchEvent): { x: number, y: number } {
  const {x: clientX, y: clientY} = getClientPos(event);
  const rect = canvas.value!.getBoundingClientRect();
  return {
    x: Math.floor((clientX - rect.left) / zoom.value),
    y: Math.floor((clientY - rect.top) / zoom.value),
  };
}

// ================================================== //
function toggleSelect() {
  if (store.currentTool === 'select' && store.selectionState.bounds.active) {
    store.selectionState.bounds.active = false;
    drawEditor();
  } else {
    store.setTool('select')
  }
}

function centerView() {
  const container = canvas.value!.parentElement;
  if (container) {
    container.scrollLeft = Math.max(0, (canvas.value!.width - EDITOR_SIZE.value) / 2);
    container.scrollTop = Math.max(0, (canvas.value!.height - EDITOR_SIZE.value) / 2);
  }
}

function updateCanvasSize() {
  canvas.value!.width = editorData.value.width * zoom.value;
  canvas.value!.height = editorData.value.height * zoom.value;
}

// ================================================== //
function setZoom(newZoom: number) {
  const container = canvas.value!.parentElement;
  if (container && zoom.value !== newZoom) {
    zoom.value = newZoom;
    const centerX = (container.scrollLeft + EDITOR_SIZE.value / 2) / zoom.value;
    const centerY = (container.scrollTop + EDITOR_SIZE.value / 2) / zoom.value;
    container.scrollLeft = Math.max(0, centerX * zoom.value - EDITOR_SIZE.value / 2);
    container.scrollTop = Math.max(0, centerY * zoom.value - EDITOR_SIZE.value / 2);
  } else {
    zoom.value = newZoom;
  }
  updateCanvasSize();
  centerView();
  drawEditor();
}

function zoomIn() {
  const min = Math.floor(EDITOR_SIZE.value / editorData.value.width)
  setZoom(Math.min(zoom.value * 2, Math.floor(min * editorData.value.width / 2)));
}

function zoomOut() {
  const min = Math.floor(EDITOR_SIZE.value / editorData.value.width)
  setZoom(Math.max(zoom.value / 2, min));
}

// ================================================== //
function startDraw(e: any) {
  const {x, y} = getPixelPos(e);
  let resetSelection = false
  if (store.selectionState.bounds.active && store.currentTool == 'select') {
    store.selectionState.bounds.active = false;
    resetSelection = true
  }
  switch (store.currentTool) {
    case "select":
      if (!resetSelection) {
        store.selectionState.selecting = true;
        store.selectionState.start = {x, y};
        store.selectionState.current = {x, y};
      }
      break;
    case "move":
      const isInSelection = store.selectionState.bounds.active && store.checkKeyInSelection(`${x}_${y}`)
      if (isInSelection || (!store.selectionState.bounds.active)) {
        isMoving.value = true;
        store.immigrateVirtualLayer()
        const {x, y} = getClientPos(e);
        moveStart.value = {x, y};
      }
      break;
    case "bucket":
      const rootColorIndex = editorData.value.layers[store.currentLayerIndex]!.pixels[`${x}_${y}`] ?? -1;
      store.bucketFill(x, y, rootColorIndex);
      break;
    default:
      isDrawing.value = true;
      if (!isPanning.value && store.currentTool !== 'bucket') store.paint(getPixelPos(e));
      break;
  }
  if (store.currentTool !== 'select') {
    needSave.value = true;
  }
  drawEditor();
  isStarted.value = true;
}

function draw(e: any) {
  if (!isStarted.value) return;
  if ('touches' in e) e.preventDefault();
  if (store.selectionState.selecting) {
    const {x, y} = getPixelPos(e);
    if (x >= 0 && x < editorData.value.width && y >= 0 && y < editorData.value.height) {
      store.selectionState.current = {x, y};
    }
  } else if (isMoving.value) {
    const {x: clientX, y: clientY} = getClientPos(e);
    const dx = Math.round((clientX - moveStart.value.x) / zoom.value);
    const dy = Math.round((clientY - moveStart.value.y) / zoom.value);
    if (dx !== 0 || dy !== 0) {
      if (store.selectionState.bounds.active) {
        store.move(dx, dy);
        store.selectionState.bounds.minX += dx;
        store.selectionState.bounds.minY += dy;
        store.selectionState.bounds.maxX += dx;
        store.selectionState.bounds.maxY += dy;
      } else {
        store.move(dx, dy);
      }
      moveStart.value = {x: clientX, y: clientY};
    }
  } else if (isDrawing.value) {
    if (!isPanning.value && store.currentTool !== 'bucket') store.paint(getPixelPos(e));
  }
  drawEditor();
}

function stopDraw() {
  if (store.selectionState.selecting) {
    store.selectionState.selecting = false;
    const minX = Math.min(store.selectionState.start.x, store.selectionState.current.x);
    const maxX = Math.max(store.selectionState.start.x, store.selectionState.current.x);
    const minY = Math.min(store.selectionState.start.y, store.selectionState.current.y);
    const maxY = Math.max(store.selectionState.start.y, store.selectionState.current.y);
    store.selectionState.bounds = {
      active: true,
      minX, minY, maxX, maxY
    };
  } else if (isMoving.value) {
    isMoving.value = false;
    store.mergeVirtualLayer()
  } else {
    isDrawing.value = false;
  }
  if (needSave.value) store.saveState();
  needSave.value = false;
  drawEditor();
  isStarted.value = false;
}

// ================================================== //
function startPan(e: any) {
  if (spacePressed.value) {
    isPanning.value = true;
    panStart.value = getClientPos(e);
    e.preventDefault();
  }
}

function pan(e: any) {
  if ('touches' in e) e.preventDefault();
  if (isPanning.value && canvas.value?.parentElement) {
    const container = canvas.value.parentElement;
    const {x: clientX, y: clientY} = getClientPos(e);
    const dx = clientX - panStart.value.x;
    const dy = clientY - panStart.value.y;
    container.scrollLeft -= dx;
    container.scrollTop -= dy;
    panStart.value = {x: clientX, y: clientY};
    drawMiniMap();
  }
}

function stopPan() {
  isPanning.value = false;
}

// ================================================== //

function startPinch(e: TouchEvent) {
  if (e.touches.length === 2) {
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    initialDistance.value = Math.sqrt((t1!.clientX - t2!.clientX) ** 2 + (t1!.clientY - t2!.clientY) ** 2);
    initialZoom.value = zoom.value;
    isPinching.value = true;
    e.preventDefault();
  }
}

function pinch(e: TouchEvent) {
  if (isPinching.value && e.touches.length === 2) {
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const newDistance = Math.sqrt((t1!.clientX - t2!.clientX) ** 2 + (t1!.clientY - t2!.clientY) ** 2);
    const ratio = newDistance / initialDistance.value;
    const newZoom = Math.max(10, Math.min(128, Math.floor(initialZoom.value * ratio)));
    setZoom(newZoom);
    e.preventDefault();
  }
}

function stopPinch() {
  isPinching.value = false;
}

// ================================================== //

function handleTouchStart(e: TouchEvent) {
  if (e.touches.length === 2) {
    startPinch(e);
  } else {
    startDraw(e);
  }
}

function handleTouchMove(e: TouchEvent) {
  if ('touches' in e) e.preventDefault();
  if (isPinching.value) {
    pinch(e);
  } else {
    draw(e);
  }
}

function handleTouchEnd(e: TouchEvent) {
  if (isPinching.value && e.touches.length < 2) {
    stopPinch();
  } else {
    stopDraw();
  }
}

function handleKeyUp(e: any) {
  if (e.code === 'Space') {
    spacePressed.value = false;
  }
}

function handleKeyDown(e: any) {
  const activeElement = document.activeElement;
  const isInputActive = activeElement?.tagName === 'INPUT' ||
      activeElement?.tagName === 'TEXTAREA' ||
      activeElement?.hasAttribute('contenteditable');

  if (isInputActive) return;

  if (e.ctrlKey || e.metaKey) {
    if (e.key === '=') {
      zoomIn();
    } else if (e.key === '-') {
      zoomOut();
    } else if (e.key === 'z') {
      if (e.shiftKey) {
        store.redo();
      } else {
        store.undo();
      }
    }
  } else if (e.key === 'Backspace') {
    store.clearCurrentLayer();
  }
  e.preventDefault();
}

function setupKeyListeners() {
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('keydown', handleKeyDown);
}

function clearListeners() {
  window.removeEventListener('keyup', handleKeyUp);
  window.removeEventListener('keydown', handleKeyDown);
}

// ================================================== //
function drawBackground(): void {
  if (!ctx || !canvas.value) return;
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  if (showGrid.value) {
    for (let y = 0; y < editorData.value.height; y++) {
      for (let x = 0; x < editorData.value.width; x++) {
        // @ts-ignore
        ctx.fillStyle = (x + y) % 2 === 0 ? "#ffffff" : "#ddd";
        ctx.fillRect(
            x * zoom.value,
            y * zoom.value,
            zoom.value,
            zoom.value
        );
      }
    }
  }
}

function drawPixels(): void {
  drawThumbnail(canvas.value!, editorData.value, zoom.value)
}

function drawSelection(): void {
  if (!ctx) return;
  if (store.selectionState.selecting) {
    const minX = Math.min(store.selectionState.start.x, store.selectionState.current.x);
    const maxX = Math.max(store.selectionState.start.x, store.selectionState.current.x);
    const minY = Math.min(store.selectionState.start.y, store.selectionState.current.y);
    const maxY = Math.max(store.selectionState.start.y, store.selectionState.current.y);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.strokeRect(
        minX * zoom.value,
        minY * zoom.value,
        (maxX - minX + 1) * zoom.value,
        (maxY - minY + 1) * zoom.value
    );
  } else if (store.selectionState.bounds.active) {
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.strokeRect(
        store.selectionState.bounds.minX * zoom.value,
        store.selectionState.bounds.minY * zoom.value,
        (store.selectionState.bounds.maxX - store.selectionState.bounds.minX + 1) * zoom.value,
        (store.selectionState.bounds.maxY - store.selectionState.bounds.minY + 1) * zoom.value
    );
  }
}

function drawEditor() {
  drawBackground();
  drawPixels();
  drawSelection();
  drawMiniMap();
}

function drawMiniMap() {
  const container = canvas.value?.parentElement;
  if (!miniMap.value || !canvas.value || !miniMapCtx || !container) return;
  const scaleX = miniMap.value.width / canvas.value.width;
  const scaleY = miniMap.value.height / canvas.value.height;
  miniMapCtx.clearRect(0, 0, miniMap.value.width, miniMap.value.height);
  miniMapCtx.drawImage(canvas.value, 0, 0, miniMap.value.width, miniMap.value.height);
  const viewX = container.scrollLeft * scaleX;
  const viewY = container.scrollTop * scaleY;
  const viewW = Math.min(EDITOR_SIZE.value, canvas.value.width) * scaleX;
  const viewH = Math.min(EDITOR_SIZE.value, canvas.value.height) * scaleY;
  miniMapCtx.strokeStyle = 'red';
  miniMapCtx.lineWidth = 1;
  miniMapCtx.strokeRect(viewX, viewY, viewW, viewH);
}

function initCanvas() {
  ctx = canvas.value!.getContext("2d");
  ctx!.imageSmoothingEnabled = false;
  miniMapCtx = miniMap.value!.getContext('2d');
  miniMapCtx!.imageSmoothingEnabled = false;
}

function setupCanvas() {
  const wrapperWidth = canvas.value!.parentElement!.parentElement!.offsetWidth;
  zoom.value = Math.floor(wrapperWidth / editorData.value.width);
  EDITOR_SIZE.value = zoom.value * editorData.value.width;
  updateCanvasSize();
  MINIMAP_SIZE.value = miniMap.value!.parentElement!.clientWidth;
  miniMap.value!.width = MINIMAP_SIZE.value;
  miniMap.value!.height = MINIMAP_SIZE.value * editorData.value.height / editorData.value.width;
  centerView();
  drawEditor();
}

// ================================================== //
function exportFile(type: string) {
  const a = document.createElement('a');
  let url = ''
  switch (type) {
    case 'svg':
      url = editorDataToSVG(editorData.value)
      break
    case 'json':
      url = editorDataToJSON(editorData.value)
      break
    default:
      url = canvas.value!.toDataURL()
      break

  }
  a.href = url;
  a.download = `SimplePixelArt.${type}`;
  a.click();
  URL.revokeObjectURL(url);
}

// ================================================== //
onMounted(async () => {
  initCanvas()
  await store.load(route.query.id?.toString())
  setupCanvas()
  setupKeyListeners()
  newSize.value = {
    width: editorData.value.width,
    height: editorData.value.height
  }
})

onUnmounted(() => {
  store.resetEditorData()
  clearListeners()
})

watch(() => store.drawTurn, () => {
  drawEditor()
})

watch(() => editorData.value.width + editorData.value.height, () => {
  setupCanvas()
  newSize.value = {
    width: editorData.value.width,
    height: editorData.value.height
  }
})
</script>

<template>
  <div class="editor" :style="{'--editor-width': EDITOR_SIZE + 'px','--editor-minimap-size': MINIMAP_SIZE + 'px'}">
    <div class="flex flex-col md:flex-row gap-3">
      <div class="flex-1 space-y-2">
        <div class="flex justify-between items-center">
          <div class="flex gap-3">
            <button @click="store.resetEditorData">New</button>
            <button @click="store.importImage()">Import</button>
            <DropdownMenu>
              <div class="item">
                <span>Export</span>
              </div>
              <template #menu>
                <div class="flex flex-col divide-y">
                  <div class="btn" @click="exportFile('png')">Export PNG</div>
                  <div class="btn" @click="exportFile('svg')">Export SVG</div>
                  <div class="btn" @click="exportFile('json')">Export JSON</div>
                </div>
              </template>
            </DropdownMenu>
          </div>
          <div class="ctl">
            <template v-if="isResizing">
              <input class="h-5 w-16 text-xs" v-model="newSize.width" type="number">
              <input class="h-5 w-16 text-xs" v-model="newSize.height" type="number">
              <div class="size-5" @click="store.resize(newSize);isResizing = false;"><span class="icon icon-check"/>
              </div>
            </template>
            <template v-else>
              <div @click="store.undo()"><span class="icon icon-undo"/></div>
              <div @click="store.redo()"><span class="icon icon-redo"/></div>
              <div @click="store.clearCurrentLayer"><span class="icon icon-broom"/></div>
              <div @click="zoomIn"><span class="icon icon-zoom-in"/></div>
              <div @click="zoomOut"><span class="icon icon-zoom-out"/></div>
              <div @click="showGrid = !showGrid; drawEditor()"><span class="icon icon-grid"/></div>
              <div @click="isResizing = true"><span class="icon icon-resize"/></div>
            </template>
          </div>
        </div>
        <Widget>
          <Square>
            <div
                class="canvas-container no-scrollbar m-auto"
                @scroll="drawMiniMap"
                @mousedown="startPan"
                @touchstart="startPan"
                @mousemove="pan"
                @touchmove="pan"
                @mouseup="stopPan"
                @mouseleave="stopPan"
                @touchend="stopPan"
            >
              <canvas
                  ref="canvas"
                  :class="store.currentTool"
                  @mousedown="startDraw"
                  @mousemove="draw"
                  @mouseup="stopDraw"
                  @mouseleave="stopDraw"
                  @touchstart="handleTouchStart"
                  @touchmove="handleTouchMove"
                  @touchend="handleTouchEnd"
              />
            </div>
          </Square>
        </Widget>
        <Widget title="Palette">
          <Palette/>
        </Widget>
      </div>
      <div class="md:w-2/5 flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-2">
          <Widget title="Control">
            <Square>
              <div class="tools">
                <Square @click="store.setTool('brush')" :class="{ active: store.currentTool === 'brush' }">
                  <span class="icon icon-brush"/>
                </Square>
                <Square @click="store.setTool('bucket')" :class="{ active: store.currentTool === 'bucket' }">
                  <span class="icon icon-bucket"/>
                </Square>
                <Square @click="store.setTool('eraser')" :class="{ active: store.currentTool === 'eraser' }">
                  <span class="icon icon-eraser"/>
                </Square>
                <Square @click="store.setTool('move')" :class="{ active: store.currentTool === 'move' }">
                  <span class="icon icon-move"/>
                </Square>
                <Square @click="toggleSelect()" :class="{ active: store.currentTool === 'select' }">
                  <span class="icon icon-select"/>
                </Square>
                <Square @click="store.toggleMirror('horizontal')" :class="{ active: store.mirrorHorizontal }">
                  <span class="icon icon-reflect-horizontal"/>
                </Square>
                <Square @click="store.toggleMirror('vertical')" :class="{ active: store.mirrorVertical }">
                  <span class="icon icon-reflect-vertical"/>
                </Square>
                <Square @click="store.flipSelectionHorizontal">
                  <span class="icon icon-flip-h"/>
                </Square>
                <Square @click="store.flipSelectionVertical">
                  <span class="icon icon-flip-v"/>
                </Square>
              </div>
            </Square>
          </Widget>
          <Widget title="Preview">
            <Square class="inside">
              <canvas ref="miniMap" class="mini-map"/>
            </Square>
          </Widget>
        </div>
        <Widget title="Layers" class="layers">
          <template #ctl>
            <button @click="store.addLayer">Add</button>
          </template>
          <ul>
            <li
                v-for="(_, index) in editorData.layers"
                :key="index"
                :class="{ active: index === store.currentLayerIndex }"
                @click="store.currentLayerIndex = index"
            >
              <EditableText v-model="editorData.layers[index]!.name" placeholder="Name" @changed="store.saveState()"/>
              <button v-if="editorData.layers.length > 1" @click.stop="store.deleteLayer(index)">D</button>
            </li>
          </ul>
        </Widget>
        <Widget title="Info">
          <div class="font-bold">
            <EditableText v-model="editorData.name" placeholder="Name" @changed="store.saveState()"/>
          </div>
          <div class="text-xs">
            <EditableText v-model="editorData.desc" placeholder="Description" @changed="store.saveState()"/>
          </div>
          <div class="text-xs">
            <TagInput v-model="editorData.tags" placeholder="tags" @changed="store.saveState()"/>
          </div>
        </Widget>
      </div>
    </div>
  </div>
</template>