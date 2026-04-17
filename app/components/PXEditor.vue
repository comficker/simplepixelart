<script setup lang="ts">
import {nextTick, onMounted, ref} from "vue";
import {drawThumbnail, editorDataToJSON, editorDataToSVG, layers2MapNumbers} from "~/helper/canvas";
import {toast} from "vue-sonner";

const canvas = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
const miniMap = ref<HTMLCanvasElement | null>(null);
let miniMapCtx: CanvasRenderingContext2D | null = null;

const store = useEditor()
const route = useRoute()
const config = useRuntimeConfig()

const showPublishModal = ref(false)
const publishStep = ref<'edit' | 'done'>('edit')

const shareMeta = computed(() => ({
  url: `${config.public.siteUrl || 'https://simplepixelart.com'}/art/${editorData.value.id_string}`,
  title: `${editorData.value.name || 'Untitled'} - Pixel Art`,
  desc: editorData.value.desc || 'Check out this pixel art!',
  imgSrc: `${config.public.api}/coloring/files/art-social/${editorData.value.id_string}.png`
}))

const socialUrls = computed(() => {
  const url = encodeURIComponent(shareMeta.value.url)
  const title = encodeURIComponent(shareMeta.value.title)
  const img = encodeURIComponent(shareMeta.value.imgSrc || '')
  return {
    twitter: `https://twitter.com/intent/tweet?url=${url}&text=${title}`,
    reddit: `https://www.reddit.com/submit?url=${url}&title=${title}`,
    pinterest: `https://www.pinterest.com/pin/create/button/?url=${url}&media=${img}&description=${title}`,
  }
})

const auth = useAuthStore()
const showLoginPrompt = ref(false)

function openPublish() {
  if (!auth.isLogged) {
    showLoginPrompt.value = true
    return
  }
  publishStep.value = 'edit'
  showPublishModal.value = true
}

async function saveAndPublish() {
  editorData.value.is_public = true
  store.saveState(false)
  await store.saveNow()
  publishStep.value = 'done'
}

function copyLink() {
  const url = `${config.public.siteUrl || 'https://simplepixelart.com'}/art/${editorData.value.id_string}`
  navigator.clipboard.writeText(url)
  toast.success('Link copied!')
}

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

// Art offset within canvas (centers art)
const artOffset = computed(() => {
  const cw = canvas.value?.width || EDITOR_SIZE.value
  const ch = canvas.value?.height || EDITOR_SIZE.value
  return {
    x: Math.max(0, (cw - editorData.value.width * zoom.value) / 2),
    y: Math.max(0, (ch - editorData.value.height * zoom.value) / 2),
  }
})

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
    x: Math.floor((clientX - rect.left - artOffset.value.x) / zoom.value),
    y: Math.floor((clientY - rect.top - artOffset.value.y) / zoom.value),
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
  canvas.value!.width = Math.max(EDITOR_SIZE.value, editorData.value.width * zoom.value);
  canvas.value!.height = Math.max(EDITOR_SIZE.value, editorData.value.height * zoom.value);
}

// ================================================== //
function setZoom(newZoom: number) {
  const container = canvas.value!.parentElement;
  if (container && zoom.value !== newZoom) {
    // Calculate center in pixel coords BEFORE zoom change
    const oldZoom = zoom.value;
    const centerPixelX = (container.scrollLeft + container.clientWidth / 2) / oldZoom;
    const centerPixelY = (container.scrollTop + container.clientHeight / 2) / oldZoom;
    zoom.value = newZoom;
    updateCanvasSize();
    // Scroll so same pixel stays at center, then center if canvas fits
    container.scrollLeft = Math.max(0, centerPixelX * newZoom - container.clientWidth / 2);
    container.scrollTop = Math.max(0, centerPixelY * newZoom - container.clientHeight / 2);
    centerView();
  } else {
    zoom.value = newZoom;
    updateCanvasSize();
    centerView();
  }
  drawEditor();
}

function zoomIn() {
  // Max zoom in = art fills container
  const maxZoom = Math.floor(EDITOR_SIZE.value / editorData.value.width)
  setZoom(Math.min(zoom.value * 2, maxZoom));
}

function zoomOut() {
  setZoom(Math.max(Math.floor(zoom.value / 2), 2));
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
    const newZoom = Math.max(2, Math.min(128, Math.floor(initialZoom.value * ratio)));
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
  // Fill canvas bg
  const rootStyle = typeof window !== 'undefined'
      ? getComputedStyle(document.documentElement)
      : null;
  const bgColor = rootStyle?.getPropertyValue('--surface').trim() || '#1c4a1c';
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);
}

function drawGrid(): void {
  if (!ctx || !canvas.value || !showGrid.value || zoom.value < 4) return;
  const rootStyle = typeof window !== 'undefined'
      ? getComputedStyle(document.documentElement)
      : null;
  const lineColor = rootStyle?.getPropertyValue('--border').trim() || '#306230';
  const cw = canvas.value.width;
  const ch = canvas.value.height;
  const ox = artOffset.value.x;
  const oy = artOffset.value.y;

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();

  // Vertical lines — extend across entire canvas from art grid alignment
  const startX = ox % zoom.value;
  for (let px = startX; px < cw; px += zoom.value) {
    ctx.moveTo(Math.floor(px) + 0.5, 0);
    ctx.lineTo(Math.floor(px) + 0.5, ch);
  }
  // Horizontal lines
  const startY = oy % zoom.value;
  for (let py = startY; py < ch; py += zoom.value) {
    ctx.moveTo(0, Math.floor(py) + 0.5);
    ctx.lineTo(cw, Math.floor(py) + 0.5);
  }
  ctx.stroke();

  // Art boundary — stronger border
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, editorData.value.width * zoom.value, editorData.value.height * zoom.value);

  ctx.globalAlpha = 1;
}

function drawPixels(): void {
  if (!ctx) return;
  const ox = artOffset.value.x;
  const oy = artOffset.value.y;
  const results = layers2MapNumbers(editorData.value);
  for (const [key, pixelIndex] of Object.entries(results)) {
    const [x = 0, y = 0] = key.split('_').map(Number);
    ctx.fillStyle = editorData.value.colors[pixelIndex] ?? '#000000';
    ctx.fillRect(ox + x * zoom.value, oy + y * zoom.value, zoom.value, zoom.value);
  }
}

function drawSelection(): void {
  if (!ctx) return;
  const ox = artOffset.value.x;
  const oy = artOffset.value.y;
  if (store.selectionState.selecting) {
    const minX = Math.min(store.selectionState.start.x, store.selectionState.current.x);
    const maxX = Math.max(store.selectionState.start.x, store.selectionState.current.x);
    const minY = Math.min(store.selectionState.start.y, store.selectionState.current.y);
    const maxY = Math.max(store.selectionState.start.y, store.selectionState.current.y);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.strokeRect(
        ox + minX * zoom.value,
        oy + minY * zoom.value,
        (maxX - minX + 1) * zoom.value,
        (maxY - minY + 1) * zoom.value
    );
  } else if (store.selectionState.bounds.active) {
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.strokeRect(
        ox + store.selectionState.bounds.minX * zoom.value,
        oy + store.selectionState.bounds.minY * zoom.value,
        (store.selectionState.bounds.maxX - store.selectionState.bounds.minX + 1) * zoom.value,
        (store.selectionState.bounds.maxY - store.selectionState.bounds.minY + 1) * zoom.value
    );
  }
}

function drawEditor() {
  drawBackground();
  drawPixels();
  drawGrid();
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
  zoom.value = Math.max(2, Math.floor(wrapperWidth / editorData.value.width));
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
  let url: string;
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
  toast.success(`Exported as ${type.toUpperCase()}`)
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

watch(() => store.editorMode, () => {
  nextTick(() => {
    miniMapCtx = miniMap.value!.getContext('2d')
    miniMapCtx!.imageSmoothingEnabled = false
    setupCanvas()
  })
})
</script>

<template>
  <div class="editor" :style="{'--editor-width': EDITOR_SIZE + 'px','--editor-minimap-size': MINIMAP_SIZE + 'px'}">
    <!-- Top toolbar -->
    <div class="editor-toolbar">
      <div class="toolbar-group">
        <ui-tooltip text="New canvas">
          <button class="toolbar-btn" @click="store.resetEditorData"><span class="icon icon-plus"/></button>
        </ui-tooltip>
        <template v-if="store.editorMode === 'advanced'">
          <ui-tooltip text="Import file">
            <button class="toolbar-btn" @click="store.importImage()"><span class="icon icon-upload"/></button>
          </ui-tooltip>
          <ui-dropdown-menu>
            <ui-tooltip text="Export">
              <div class="toolbar-btn"><span class="icon icon-download"/></div>
            </ui-tooltip>
            <template #menu>
              <div class="flex flex-col divide-y">
                <div class="btn" @click="exportFile('png')">PNG</div>
                <div class="btn" @click="exportFile('svg')">SVG</div>
                <div class="btn" @click="exportFile('json')">JSON</div>
              </div>
            </template>
          </ui-dropdown-menu>
        </template>
      </div>
      <div class="toolbar-sep"/>
      <div class="toolbar-group">
        <ui-tooltip text="Undo (Ctrl+Z)">
          <button class="toolbar-btn" @click="store.undo()"><span class="icon icon-undo"/></button>
        </ui-tooltip>
        <ui-tooltip text="Redo (Ctrl+Shift+Z)">
          <button class="toolbar-btn" @click="store.redo()"><span class="icon icon-redo"/></button>
        </ui-tooltip>
        <ui-tooltip text="Clear layer">
          <button class="toolbar-btn" @click="store.clearCurrentLayer"><span class="icon icon-broom"/></button>
        </ui-tooltip>
      </div>
      <div class="toolbar-sep"/>
      <div class="toolbar-group">
        <ui-tooltip text="Zoom in (Ctrl+=)">
          <button class="toolbar-btn" @click="zoomIn"><span class="icon icon-zoom-in"/></button>
        </ui-tooltip>
        <ui-tooltip text="Zoom out (Ctrl+-)">
          <button class="toolbar-btn" @click="zoomOut"><span class="icon icon-zoom-out"/></button>
        </ui-tooltip>
        <template v-if="store.editorMode === 'advanced'">
          <ui-tooltip :text="showGrid ? 'Hide grid' : 'Show grid'">
            <button class="toolbar-btn" :class="{ active: showGrid }" @click="showGrid = !showGrid; drawEditor()">
              <span class="icon icon-grid"/>
            </button>
          </ui-tooltip>
        </template>
      </div>
      <template v-if="store.editorMode === 'advanced' && !isResizing">
        <div class="toolbar-sep"/>
        <ui-tooltip text="Resize canvas">
          <button class="toolbar-btn" @click="isResizing = true"><span class="icon icon-resize"/></button>
        </ui-tooltip>
      </template>
      <template v-if="isResizing">
        <div class="toolbar-sep"/>
        <div class="toolbar-group items-center">
          <input class="resize-input" v-model="newSize.width" type="number" min="1" max="128">
          <span class="text-xs">×</span>
          <input class="resize-input" v-model="newSize.height" type="number" min="1" max="128">
          <button class="toolbar-btn active" @click="store.resize(newSize);isResizing = false;">
            <span class="icon icon-check"/>
          </button>
        </div>
      </template>
      <div class="flex-1"/>
      <span class="toolbar-info">{{ editorData.width }}×{{ editorData.height }}</span>
      <div class="toolbar-sep"/>
      <button class="publish-toolbar-btn" @click="openPublish">
        <span class="icon icon-social"/>
        <span>Share</span>
      </button>
    </div>

    <div class="flex flex-col md:flex-row gap-3">
      <!-- Left: canvas + palette -->
      <div class="flex-1 space-y-2">
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

        <!-- Simple mode: inline tool strip below canvas -->
        <div v-if="store.editorMode === 'simple'" class="tool-strip">
          <ui-tooltip text="Brush">
            <button class="tool-strip-btn" :class="{ active: store.currentTool === 'brush' }" @click="store.setTool('brush')">
              <span class="icon icon-brush"/>
            </button>
          </ui-tooltip>
          <ui-tooltip text="Fill">
            <button class="tool-strip-btn" :class="{ active: store.currentTool === 'bucket' }" @click="store.setTool('bucket')">
              <span class="icon icon-bucket"/>
            </button>
          </ui-tooltip>
          <ui-tooltip text="Eraser">
            <button class="tool-strip-btn" :class="{ active: store.currentTool === 'eraser' }" @click="store.setTool('eraser')">
              <span class="icon icon-eraser"/>
            </button>
          </ui-tooltip>
        </div>

        <Widget title="Palette">
          <editor-palette/>
        </Widget>
      </div>

      <!-- Right sidebar -->
      <div class="editor-sidebar">
        <!-- Advanced mode: Control + Preview side by side on desktop -->
        <div :class="store.editorMode === 'advanced' ? 'adv-top-row' : ''">
          <Widget v-if="store.editorMode === 'advanced'" title="Control">
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
          </Widget>
          <!-- Preview: always rendered, single ref -->
          <Widget title="Preview">
            <template #ctl>
              <a v-if="editorData.id_string" target="_blank" :href="`/art/${editorData.id_string}`">
                <span class="icon icon-link"/>
              </a>
            </template>
            <Square class="inside">
              <canvas ref="miniMap" class="mini-map"/>
            </Square>
          </Widget>
        </div>

        <!-- Advanced-only: Layers -->
        <Widget v-if="store.editorMode === 'advanced'" title="Layers" class="layers">
          <template #ctl>
            <button @click="store.addLayer">+</button>
          </template>
          <ul>
            <li
                v-for="(_, index) in editorData.layers"
                :key="index"
                :class="{ active: index === store.currentLayerIndex }"
                @click="store.currentLayerIndex = index"
            >
              <EditableText v-model="editorData.layers[index]!.name" placeholder="Name" @changed="store.saveState()"/>
              <button v-if="editorData.layers.length > 1" @click.stop="store.deleteLayer(index)" class="layer-del">
                <span class="icon icon-trash"/>
              </button>
            </li>
          </ul>
        </Widget>

        <!-- Mode toggle -->
        <button
            class="mode-toggle"
            @click="store.editorMode = store.editorMode === 'simple' ? 'advanced' : 'simple'"
        >
          <span class="icon" :class="store.editorMode === 'simple' ? 'icon-resize' : 'icon-brush'"/>
          <span>{{ store.editorMode === 'simple' ? 'Advanced' : 'Simple' }}</span>
        </button>
      </div>
    </div>

    <!-- Publish modal -->
    <Teleport to="body">
      <div v-if="showPublishModal" class="share-overlay" @click.self="showPublishModal = false">
        <div class="share-modal">
          <!-- Step 1: Edit info -->
          <template v-if="publishStep === 'edit'">
            <h3 class="text-sm font-bold mb-3">Publish your pixel art</h3>
            <div class="publish-form">
              <div>
                <label class="publish-label">Title</label>
                <input
                    type="text"
                    v-model="editorData.name"
                    placeholder="Give it a name..."
                    class="publish-input"
                />
              </div>
              <div>
                <label class="publish-label">Description</label>
                <input
                    type="text"
                    v-model="editorData.desc"
                    placeholder="Describe your art..."
                    class="publish-input"
                />
              </div>
              <div>
                <label class="publish-label">Tags</label>
                <TagInput v-model="editorData.tags" placeholder="Add tags..."/>
              </div>
              <template v-if="store.editorMode === 'advanced'">
                <div>
                  <label class="publish-label">Slug</label>
                  <input
                      type="text"
                      v-model="editorData.id_string"
                      placeholder="custom-url-slug"
                      class="publish-input"
                  />
                </div>
              </template>
              <div class="h-center gap-2">
                <ui-switch v-model="editorData.is_public"/>
                <span class="text-xs">Public</span>
              </div>
            </div>
            <div class="flex gap-2 mt-4">
              <button class="btn primary flex-1 justify-center" @click="saveAndPublish">
                Save & Publish
              </button>
              <button class="btn flex-1 justify-center" @click="showPublishModal = false">
                Cancel
              </button>
            </div>
          </template>

          <!-- Step 2: Share result -->
          <template v-if="publishStep === 'done'">
            <div class="text-center mb-4">
              <h3 class="text-sm font-bold">Published!</h3>
              <p class="text-xs mt-1">Your pixel art is live. Share it!</p>
            </div>
            <div class="flex flex-col gap-2">
              <div class="publish-link" @click="copyLink">
                <span class="text-xs truncate flex-1">{{ shareMeta.url }}</span>
                <span class="icon icon-link flex-shrink-0"/>
              </div>
              <div class="social-grid">
                <a :href="socialUrls.twitter" target="_blank" rel="noopener noreferrer" class="social-btn">
                  <span class="icon icon-x"/>
                  <span>Twitter</span>
                </a>
                <a :href="socialUrls.reddit" target="_blank" rel="noopener noreferrer" class="social-btn">
                  <span class="icon icon-reddit"/>
                  <span>Reddit</span>
                </a>
                <a :href="socialUrls.pinterest" target="_blank" rel="noopener noreferrer" class="social-btn">
                  <span class="icon icon-pinterest"/>
                  <span>Pinterest</span>
                </a>
                <button class="social-btn" @click="exportFile('png')">
                  <span class="icon icon-download"/>
                  <span>Download</span>
                </button>
              </div>
              <nuxt-link
                  :to="`/art/${editorData.id_string}`"
                  class="btn primary w-full justify-center"
              >
                View Page
              </nuxt-link>
              <button class="share-dismiss" @click="showPublishModal = false">
                Continue Editing
              </button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- Login prompt -->
    <Teleport to="body">
      <div v-if="showLoginPrompt" class="share-overlay" @click.self="showLoginPrompt = false">
        <div class="share-modal">
          <h3 class="text-sm font-bold mb-2">Login to share</h3>
          <p class="text-xs mb-4">Sign in to publish and share your pixel art. Your local work will be synced to the cloud.</p>
          <div class="flex flex-col gap-2">
            <a :href="`${config.public.api}/auth/google`" class="btn primary w-full justify-center">
              <span class="icon icon-social"/>
              <span>Login with Google</span>
            </a>
            <button class="share-dismiss" @click="showLoginPrompt = false">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>