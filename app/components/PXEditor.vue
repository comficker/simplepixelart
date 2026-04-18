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
const referenceImage = ref<HTMLImageElement | null>(null);
const referenceVisible = ref(true);
const referenceOpacity = 0.5;
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

const SIZE_PRESETS = [8, 16, 24, 32, 48, 64];
const COLOR_PRESETS: Record<number, string[]> = {
  2: ['#000000', '#FFFFFF'],
  4: ['#000000', '#FFFFFF', '#FF004D', '#00E436'],
  8: ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'],
  16: ['#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8', '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'],
  32: ['#000000', '#222034', '#45283C', '#663931', '#8F563B', '#DF7126', '#D9A066', '#EEC39A', '#FBF236', '#99E550', '#6ABE30', '#37946E', '#4B692F', '#524B24', '#323C39', '#3F3F74', '#306082', '#5B6EE1', '#639BFF', '#5FCDE4', '#CBDBFC', '#FFFFFF', '#9BADB7', '#847E87', '#696A6A', '#595652', '#76428A', '#AC3232', '#D95763', '#D77BBA', '#8F974A', '#8A6F30']
};
const COLOR_COUNTS = Object.keys(COLOR_PRESETS).map(Number);

const showOnboarding = ref(false);
const onbSize = ref(16);
const onbColorCount = ref(8);
const onbRefImage = ref<HTMLImageElement | null>(null);

function pickOnbReference() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => { onbRefImage.value = img; };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function finishOnboarding() {
  editorData.value.width = onbSize.value;
  editorData.value.height = onbSize.value;
  editorData.value.colors = [...COLOR_PRESETS[onbColorCount.value]!];
  if (onbRefImage.value) {
    referenceImage.value = onbRefImage.value;
    referenceVisible.value = true;
  }
  localStorage.setItem('editor_onboarded', '1');
  showOnboarding.value = false;
  store.saveState();
  setupCanvas();
}

function skipOnboarding() {
  localStorage.setItem('editor_onboarded', '1');
  showOnboarding.value = false;
}

function openOnboarding() {
  onbSize.value = editorData.value.width;
  const currentCount = editorData.value.colors?.length || 8;
  const closest = COLOR_COUNTS.reduce((a, b) =>
      Math.abs(b - currentCount) < Math.abs(a - currentCount) ? b : a
  );
  onbColorCount.value = closest;
  onbRefImage.value = referenceImage.value;
  showOnboarding.value = true;
}

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
  setZoom(Math.min(zoom.value * 2, 128));
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
// Fixed editor colors — independent of theme
const EDITOR_BG = '#1a1a1a';
const EDITOR_CELL_A = '#ffffff';
const EDITOR_CELL_B = '#cccccc';
const EDITOR_ART_BG_SOLID = '#ffffff';

function drawBackground(): void {
  if (!ctx || !canvas.value) return;
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  // Outer canvas area (padding around art)
  ctx.fillStyle = EDITOR_BG;
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);

  const ox = artOffset.value.x;
  const oy = artOffset.value.y;
  const z = zoom.value;
  const w = editorData.value.width;
  const h = editorData.value.height;

  if (showGrid.value) {
    // Checkerboard — toggle grid = toggle checkerboard
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? EDITOR_CELL_A : EDITOR_CELL_B;
        ctx.fillRect(ox + x * z, oy + y * z, z, z);
      }
    }
  } else {
    ctx.fillStyle = EDITOR_ART_BG_SOLID;
    ctx.fillRect(ox, oy, w * z, h * z);
  }
}

function drawGrid(): void {
  // Grid is rendered via checkerboard in drawBackground, no line overlay
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

function drawReference(): void {
  if (!ctx || !referenceImage.value || !referenceVisible.value) return;
  const ox = artOffset.value.x;
  const oy = artOffset.value.y;
  const z = zoom.value;
  const w = editorData.value.width;
  const h = editorData.value.height;
  ctx.globalAlpha = referenceOpacity;
  ctx.drawImage(referenceImage.value, ox, oy, w * z, h * z);
  ctx.globalAlpha = 1;
}

function drawEditor() {
  drawBackground();
  drawReference();
  drawPixels();
  drawGrid();
  drawSelection();
  drawMiniMap();
}

function drawMiniMap() {
  const container = canvas.value?.parentElement;
  if (!miniMap.value || !canvas.value || !miniMapCtx || !container) return;

  const mmW = miniMap.value.width;
  const mmH = miniMap.value.height;
  const artW = editorData.value.width;
  const artH = editorData.value.height;
  const cellW = mmW / artW;
  const cellH = mmH / artH;

  // Clear + bg (fixed, not theme)
  miniMapCtx.clearRect(0, 0, mmW, mmH);
  miniMapCtx.fillStyle = EDITOR_CELL_A;
  miniMapCtx.fillRect(0, 0, mmW, mmH);

  // Draw pixels (no grid)
  const results = layers2MapNumbers(editorData.value);
  for (const [key, pixelIndex] of Object.entries(results)) {
    const [x = 0, y = 0] = key.split('_').map(Number);
    miniMapCtx.fillStyle = editorData.value.colors[pixelIndex] ?? '#000000';
    miniMapCtx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
  }

  // Viewport indicator
  const scaleX = mmW / canvas.value.width;
  const scaleY = mmH / canvas.value.height;
  const ox = artOffset.value.x * scaleX;
  const oy = artOffset.value.y * scaleY;
  const viewX = container.scrollLeft * scaleX;
  const viewY = container.scrollTop * scaleY;
  const viewW = Math.min(EDITOR_SIZE.value, canvas.value.width) * scaleX;
  const viewH = Math.min(EDITOR_SIZE.value, canvas.value.height) * scaleY;
  miniMapCtx.strokeStyle = 'red';
  miniMapCtx.lineWidth = 1;
  miniMapCtx.strokeRect(viewX - ox, viewY - oy, viewW, viewH);
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
  const parentW = miniMap.value!.parentElement!.clientWidth;
  const parentH = miniMap.value!.parentElement!.clientHeight || parentW;
  const artRatio = editorData.value.width / editorData.value.height;
  if (artRatio >= 1) {
    // Wider or square — fit width
    miniMap.value!.width = parentW;
    miniMap.value!.height = parentW / artRatio;
  } else {
    // Taller — fit height
    miniMap.value!.height = parentH;
    miniMap.value!.width = parentH * artRatio;
  }
  MINIMAP_SIZE.value = miniMap.value!.width;
  centerView();
  drawEditor();
}

// ================================================== //
function importReferenceImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        referenceImage.value = img;
        referenceVisible.value = true;
        drawEditor();
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function toggleReference() {
  referenceVisible.value = !referenceVisible.value;
  drawEditor();
}

function clearReference() {
  referenceImage.value = null;
  drawEditor();
}

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
    default: {
      // Render art-only canvas (no grid/bg/offset) for export
      const tmp = document.createElement('canvas')
      const scale = 10
      tmp.width = editorData.value.width * scale
      tmp.height = editorData.value.height * scale
      drawThumbnail(tmp, editorData.value, scale)
      url = tmp.toDataURL()
      break
    }

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
  if (route.query.new === 'true') {
    // Load current workspace, save it, then reset for a fresh artwork
    await store.load(undefined)
    const hasContent = editorData.value.layers?.some(l => Object.keys(l.pixels || {}).length > 0)
    if (hasContent) {
      try {
        await store.saveNow()
      } catch (e) {
        console.warn('Failed to save current work before reset:', e)
      }
    }
    store.resetEditorData()
    localStorage.setItem('workspace_current', '')
  } else {
    await store.load(route.query.id?.toString())
  }
  setupCanvas()
  setupKeyListeners()
  newSize.value = {
    width: editorData.value.width,
    height: editorData.value.height
  }

  const onboarded = localStorage.getItem('editor_onboarded');
  const hasContent = editorData.value.layers?.some(l => Object.keys(l.pixels || {}).length > 0);
  if (!onboarded && !route.query.id && !hasContent) {
    showOnboarding.value = true;
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
    <!-- Top toolbar -->
    <div class="editor-toolbar">
      <div class="toolbar-group">
        <ui-tooltip text="Get started">
          <button class="toolbar-btn" @click="openOnboarding"><span class="icon icon-rocket"/></button>
        </ui-tooltip>
      </div>
      <div class="toolbar-sep"/>
      <div class="toolbar-group">
        <ui-dropdown-menu>
          <ui-tooltip text="File">
            <button class="toolbar-btn"><span class="icon icon-file"/></button>
          </ui-tooltip>
          <template #menu>
            <div class="file-menu">
              <button class="file-menu-item" @click="store.resetEditorData">
                <span class="icon icon-plus"/><span>New canvas</span>
              </button>
              <button class="file-menu-item" @click="store.importImage()">
                <span class="icon icon-upload"/><span>Import file</span>
              </button>
              <div class="file-menu-sep"/>
              <button class="file-menu-item" @click="exportFile('png')">
                <span class="icon icon-download"/><span>Download PNG</span>
              </button>
              <button class="file-menu-item" @click="exportFile('svg')">
                <span class="icon icon-download"/><span>Export SVG</span>
              </button>
              <button class="file-menu-item" @click="exportFile('json')">
                <span class="icon icon-download"/><span>Export JSON</span>
              </button>
            </div>
          </template>
        </ui-dropdown-menu>
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
        <ui-tooltip :text="showGrid ? 'Hide grid' : 'Show grid'">
          <button class="toolbar-btn" :class="{ active: showGrid }" @click="showGrid = !showGrid; drawEditor()">
            <span class="icon icon-grid"/>
          </button>
        </ui-tooltip>
      </div>
      <div class="toolbar-sep"/>
      <div class="toolbar-group">
        <ui-tooltip :text="referenceImage ? 'Replace ref' : 'Add ref'">
          <button class="toolbar-btn" :class="{ active: !!referenceImage }" @click="importReferenceImage">
            <span class="icon icon-image"/>
          </button>
        </ui-tooltip>
        <template v-if="referenceImage">
          <ui-tooltip :text="referenceVisible ? 'Hide reference' : 'Show reference'">
            <button class="toolbar-btn" :class="{ active: referenceVisible }" @click="toggleReference">
              <span class="icon icon-eye"/>
            </button>
          </ui-tooltip>
          <ui-tooltip text="Remove reference">
            <button class="toolbar-btn" @click="clearReference">
              <span class="icon icon-trash"/>
            </button>
          </ui-tooltip>
        </template>
      </div>
      <template v-if="!isResizing">
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

        <Widget title="Palette">
          <editor-palette/>
        </Widget>
      </div>

      <!-- Right sidebar -->
      <div class="editor-sidebar">
        <div class="adv-top-row">
          <Widget title="Control">
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

        <Widget title="Layers" class="layers">
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
              <div>
                <label class="publish-label">Slug</label>
                <input
                    type="text"
                    v-model="editorData.id_string"
                    placeholder="custom-url-slug"
                    class="publish-input"
                />
              </div>
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

    <!-- Onboarding bottom sheet -->
    <div v-if="showOnboarding" class="onb-overlay" @click.self="skipOnboarding">
        <div class="onb-sheet">
          <h3 class="onb-title">Start drawing</h3>
          <p class="onb-sub">Pick a few options to begin</p>

          <div class="onb-field">
            <label class="onb-label">Canvas size</label>
            <div class="onb-chips">
              <button
                  v-for="s in SIZE_PRESETS"
                  :key="s"
                  class="onb-chip"
                  :class="{ active: onbSize === s }"
                  @click="onbSize = s"
              >{{ s }}×{{ s }}</button>
            </div>
          </div>

          <div class="onb-field">
            <label class="onb-label">Number of colors</label>
            <div class="onb-chips">
              <button
                  v-for="c in COLOR_COUNTS"
                  :key="c"
                  class="onb-chip"
                  :class="{ active: onbColorCount === c }"
                  @click="onbColorCount = c"
              >{{ c }}</button>
            </div>
            <div class="onb-swatches">
              <span
                  v-for="(color, i) in COLOR_PRESETS[onbColorCount]"
                  :key="i"
                  class="onb-swatch"
                  :style="{ background: color }"
              />
            </div>
          </div>

          <div class="onb-field">
            <label class="onb-label">Reference image (optional)</label>
            <div class="onb-ref-row">
              <button class="onb-ref-btn" @click="pickOnbReference">
                <span class="icon icon-image"/>
                <span>{{ onbRefImage ? 'Replace' : 'Add image' }}</span>
              </button>
              <span v-if="onbRefImage" class="onb-ref-status">
                <span class="icon icon-check"/> Loaded
              </span>
              <button v-if="onbRefImage" class="onb-ref-clear" @click="onbRefImage = null">
                <span class="icon icon-trash"/>
              </button>
            </div>
          </div>

          <div class="onb-actions">
            <button class="btn primary flex-1 justify-center" @click="finishOnboarding">Start drawing</button>
            <button class="share-dismiss" @click="skipOnboarding">Skip</button>
          </div>
        </div>
      </div>

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