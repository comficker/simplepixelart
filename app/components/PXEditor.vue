<script setup lang="ts">
import {onMounted, ref} from "vue";
import {buildIsoPath, drawThumbnail, editorDataToJSON, editorDataToSVG, layers2MapNumbers} from "~/helper/canvas";
import {toast} from "vue-sonner";

const canvas = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
const miniMap = ref<HTMLCanvasElement | null>(null);
let miniMapCtx: CanvasRenderingContext2D | null = null;

const store = useEditor()
const route = useRoute()
const config = useRuntimeConfig()

const googleAuthUrl = computed(() => {
  const apiBase = (config.public.api as string) || ''
  if (typeof window === 'undefined') return `${apiBase}/auth/google`
  const next = `${window.location.origin}/auth/callback`
  return `${apiBase}/auth/google?state=${encodeURIComponent(next)}`
})

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

interface PickerCollection {
  id: number
  id_string: string
  title: string
  status: string
}

const editorCollections = ref<PickerCollection[]>([])
const initialCollectionIds = ref<Set<number>>(new Set())
const collectionsLoaded = ref(false)

async function loadCurrentCollections() {
  collectionsLoaded.value = false
  editorCollections.value = []
  initialCollectionIds.value = new Set()
  if (!auth.isLogged) return
  if (!editorData.value.id_string || typeof editorData.value.id !== 'number') return
  try {
    const res = await useNativeFetch<{results: any[]}>(
        '/coloring/collections/',
        {params: {mine: 1, items: editorData.value.id, page_size: 200}},
    )
    editorCollections.value = res.results.map((c: any) => ({
      id: c.id,
      id_string: c.id_string,
      title: c.title,
      status: c.status || 'public',
    }))
    initialCollectionIds.value = new Set(editorCollections.value.map(c => c.id))
  } catch {
    // silent — picker still shows empty
  } finally {
    collectionsLoaded.value = true
  }
}

async function syncCollections() {
  if (typeof editorData.value.id !== 'number') return
  const pageId = editorData.value.id_string
  if (!pageId) return
  const current = new Set(editorCollections.value.map(c => c.id))
  const toAdd = editorCollections.value.filter(c => !initialCollectionIds.value.has(c.id))
  const toRemove = [...initialCollectionIds.value].filter(id => !current.has(id))
  const ops: Promise<unknown>[] = []
  for (const c of toAdd) {
    ops.push(useNativeFetch(`/coloring/collections/${c.id}/add-item/`, {
      method: 'POST',
      body: {page_id_string: pageId},
    }).catch(() => null))
  }
  for (const id of toRemove) {
    ops.push(useNativeFetch(`/coloring/collections/${id}/remove-item/`, {
      method: 'POST',
      body: {page_id_string: pageId},
    }).catch(() => null))
  }
  if (ops.length) await Promise.all(ops)
  initialCollectionIds.value = new Set(editorCollections.value.map(c => c.id))
}

function openPublish() {
  if (!auth.isLogged) {
    showLoginPrompt.value = true
    return
  }
  publishStep.value = 'edit'
  showPublishModal.value = true
  if (!collectionsLoaded.value) loadCurrentCollections()
}

async function saveAndPublish() {
  editorData.value.is_public = true
  store.saveState(false)
  await store.saveNow()
  await syncCollections()
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
const referenceImage = ref<HTMLImageElement | null>(null);
const referenceVisible = ref(true);
const referenceOpacity = 0.5;
const spacePressed = ref(false);
const panStart = ref({x: 0, y: 0});
const initialDistance = ref(0);
const initialZoom = ref(0);
const isMoving = ref(false);
const isDrawing = ref(false);
const isIsoLining = ref(false);
const isoLineStart = ref<{ x: number; y: number } | null>(null);
const isStarted = ref(false);
const isPanning = ref(false);
const isResizing = ref(false);
const isPinching = ref(false);
const moveStart = ref({x: 0, y: 0});
const needSave = ref(false);
const hoverPos = ref<{ x: number; y: number } | null>(null);
const bgImage = ref<HTMLImageElement | null>(null);
let bgImageUrlCache = '';

// ===== Background picker (modal) =====
const showBgPicker = ref(false);
const bgTab = ref<'none' | 'solid' | 'art'>('none');
const bgSolidColor = ref('#FFFFFF');
const myArts = ref<Array<{id: string; name: string; thumb: string}>>([]);
const loadingMyArts = ref(false);
const myArtsLoaded = ref(false);

const bgLabel = computed(() => {
  const cfg = store.bgConfig;
  if (cfg.type === 'solid') return cfg.color?.toUpperCase() || 'Solid';
  if (cfg.type === 'art') return 'My art';
  return 'Default';
});

function openBgPicker() {
  const cfg = store.bgConfig;
  bgTab.value = cfg.type;
  bgSolidColor.value = cfg.color || '#FFFFFF';
  showBgPicker.value = true;
  if (auth.isLogged && !myArtsLoaded.value) loadMyArts();
}

async function loadMyArts() {
  if (!auth.logged?.username) return;
  loadingMyArts.value = true;
  try {
    const res = await useNativeFetch<{results: Array<{id_string: string; name: string}>}>(
        '/coloring/shared-pages/',
        {
          params: {
            user: auth.logged.username,
            page_size: 24,
            ordering: '-updated',
          },
        }
    );
    myArts.value = res.results.map(r => ({
      id: r.id_string,
      name: r.name || r.id_string,
      thumb: `${config.public.api}/coloring/files/art-original/${r.id_string}.png`,
    }));
    myArtsLoaded.value = true;
  } finally {
    loadingMyArts.value = false;
  }
}

function applyBgNone() {
  store.setBg({type: 'none', color: '', artId: '', artUrl: ''});
  bgTab.value = 'none';
}

function applyBgSolid() {
  store.setBg({type: 'solid', color: bgSolidColor.value.toUpperCase()});
  bgTab.value = 'solid';
}

function applyBgArt(art: {id: string; thumb: string}) {
  store.setBg({type: 'art', artId: art.id, artUrl: art.thumb});
  bgTab.value = 'art';
}

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

const paletteRef = ref<{ addColor: () => void; toggleModify: () => void; removeColor: () => void } | null>(null)
const paletteModify = ref(false)

let drawRafId: number | null = null;
function scheduleDraw() {
  if (drawRafId !== null) return;
  if (typeof requestAnimationFrame === 'undefined') return;
  drawRafId = requestAnimationFrame(() => {
    drawRafId = null;
    drawEditor();
  });
}

let miniMapRafId: number | null = null;
function scheduleMiniMap() {
  if (miniMapRafId !== null) return;
  if (typeof requestAnimationFrame === 'undefined') return;
  miniMapRafId = requestAnimationFrame(() => {
    miniMapRafId = null;
    drawMiniMap();
  });
}

function cancelScheduledDraw() {
  if (drawRafId !== null) {
    cancelAnimationFrame(drawRafId);
    drawRafId = null;
  }
}

// Background image loader — client-only (Image / rAF unavailable in SSR)
watch(
    () => [store.bgConfig.type, store.bgConfig.artUrl] as const,
    ([type, url]) => {
      if (typeof window === 'undefined') return;
      if (type !== 'art' || !url) {
        bgImage.value = null;
        bgImageUrlCache = '';
        scheduleDraw();
        return;
      }
      if (url === bgImageUrlCache && bgImage.value) {
        scheduleDraw();
        return;
      }
      bgImageUrlCache = url;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (bgImageUrlCache === url) {
          bgImage.value = img;
          scheduleDraw();
        }
      };
      img.src = url;
    },
    {immediate: true}
);

watch(() => [store.bgConfig.type, store.bgConfig.color], () => {
  if (typeof window === 'undefined') return;
  scheduleDraw();
});

let pixelMapCache: Record<string, number> | null = null;
let pixelMapCacheTurn = -1;

function getPixelMap(): Record<string, number> {
  if (pixelMapCacheTurn === store.drawTurn && pixelMapCache) {
    return pixelMapCache;
  }
  pixelMapCache = layers2MapNumbers(editorData.value);
  pixelMapCacheTurn = store.drawTurn;
  return pixelMapCache;
}

let isoPathCache: Path2D | null = null;
let isoCacheKey = '';

function getIsoPath(): Path2D | null {
  const iso = editorData.value.meta?.iso;
  if (!iso || iso.mode !== 'iso') return null;
  const w = editorData.value.width;
  const h = editorData.value.height;
  const key = `${iso.cell.width}_${iso.cell.height}_${zoom.value}_${w}_${h}`;
  if (isoCacheKey === key && isoPathCache) return isoPathCache;
  const path = new Path2D();
  buildIsoPath(path, zoom.value, w, h, iso.cell.width, iso.cell.height);
  isoPathCache = path;
  isoCacheKey = key;
  return path;
}

const gridIconClass = computed(() => {
  const mode = editorData.value.meta?.iso?.mode ?? 'square';
  if (mode === 'iso') return 'icon icon-grid iso-rotated';
  if (mode === 'off') return 'icon icon-grid grid-off';
  return 'icon icon-grid';
});

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
    scheduleDraw();
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
  const container = canvas.value?.parentElement;
  if (!container || zoom.value === newZoom) {
    zoom.value = newZoom;
    updateCanvasSize();
    centerView();
    scheduleMiniMap();
    scheduleDraw();
    return;
  }

  // Convert current viewport-center → art-pixel coordinates BEFORE zoom change,
  // then re-scroll so the same art pixel stays under viewport center.
  const oldZoom = zoom.value;
  const centerPixelX = (container.scrollLeft + container.clientWidth / 2) / oldZoom;
  const centerPixelY = (container.scrollTop + container.clientHeight / 2) / oldZoom;

  zoom.value = newZoom;
  updateCanvasSize();

  container.scrollLeft = Math.max(0, centerPixelX * newZoom - container.clientWidth / 2);
  container.scrollTop = Math.max(0, centerPixelY * newZoom - container.clientHeight / 2);

  scheduleMiniMap();
  scheduleDraw();
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
    case "iso-line":
      isIsoLining.value = true;
      isoLineStart.value = getPixelPos(e);
      store.immigrateVirtualLayer();
      store.clearVirtualLayer();
      {
        const cell = editorData.value.meta?.iso?.cell ?? { width: 2, height: 1 };
        store.paintIsoLine(
            isoLineStart.value,
            isoLineStart.value,
            cell.width,
            cell.height,
            store.currentColorIndex,
        );
      }
      break;
    default:
      isDrawing.value = true;
      if (!isPanning.value && store.currentTool !== 'bucket') store.paint(getPixelPos(e));
      break;
  }
  if (store.currentTool !== 'select') {
    needSave.value = true;
  }
  scheduleDraw();
  isStarted.value = true;
}

function draw(e: any) {
  // Track hover position for brush-preview overlay
  const pos = getPixelPos(e);
  if (pos.x >= 0 && pos.x < editorData.value.width && pos.y >= 0 && pos.y < editorData.value.height) {
    if (!hoverPos.value || hoverPos.value.x !== pos.x || hoverPos.value.y !== pos.y) {
      hoverPos.value = pos;
      scheduleDraw();
    }
  } else if (hoverPos.value) {
    hoverPos.value = null;
    scheduleDraw();
  }

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
  } else if (isIsoLining.value && isoLineStart.value) {
    const end = getPixelPos(e);
    const cell = editorData.value.meta?.iso?.cell ?? { width: 2, height: 1 };
    store.paintIsoLine(
        isoLineStart.value,
        end,
        cell.width,
        cell.height,
        store.currentColorIndex,
    );
  } else if (isDrawing.value) {
    if (!isPanning.value && store.currentTool !== 'bucket') store.paint(getPixelPos(e));
  }
  scheduleDraw();
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
  } else if (isIsoLining.value) {
    isIsoLining.value = false;
    isoLineStart.value = null;
    store.mergeVirtualLayer();
  } else {
    isDrawing.value = false;
  }
  if (needSave.value) store.saveState();
  needSave.value = false;
  cancelScheduledDraw();
  drawEditor();
  isStarted.value = false;
}

function leaveCanvas() {
  stopDraw();
  if (hoverPos.value) {
    hoverPos.value = null;
    scheduleDraw();
  }
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
    scheduleMiniMap();
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

  const ox = Math.round(artOffset.value.x);
  const oy = Math.round(artOffset.value.y);
  const z = zoom.value;
  const w = editorData.value.width;
  const h = editorData.value.height;

  const mode = editorData.value.meta?.iso?.mode ?? 'square';
  const bg = store.bgConfig;

  // Layer 1 — full-canvas base color. For solid bg, use the user color so no
  // dark layer can leak through subpixel gaps later.
  const baseColor = bg.type === 'solid' ? bg.color : EDITOR_BG;
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);

  // Layer 2 — art-area content (image bg / checker / fallback solid)
  if (bg.type === 'art' && bgImage.value) {
    ctx.drawImage(bgImage.value, ox, oy, w * z, h * z);
  } else if (bg.type === 'none' && mode === 'square') {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? EDITOR_CELL_A : EDITOR_CELL_B;
        ctx.fillRect(ox + x * z, oy + y * z, z, z);
      }
    }
  } else if (bg.type === 'none' && mode !== 'square') {
    ctx.fillStyle = EDITOR_ART_BG_SOLID;
    ctx.fillRect(ox, oy, w * z, h * z);
  }
  // bg.type === 'solid': base layer already covers everything — nothing else to draw
}

function drawGrid(): void {
  // Grid is rendered via checkerboard in drawBackground, no line overlay
}

function drawPixels(): void {
  if (!ctx) return;
  const ox = Math.round(artOffset.value.x);
  const oy = Math.round(artOffset.value.y);
  const z = zoom.value;
  const results = getPixelMap();
  for (const [key, pixelIndex] of Object.entries(results)) {
    const [x = 0, y = 0] = key.split('_').map(Number);
    ctx.fillStyle = editorData.value.colors[pixelIndex] ?? '#000000';
    ctx.fillRect(ox + x * z, oy + y * z, z, z);
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

function drawIsoOverlay(): void {
  if (!ctx) return;
  const path = getIsoPath();
  if (!path) return;
  const w = editorData.value.width;
  const h = editorData.value.height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(artOffset.value.x, artOffset.value.y, w * zoom.value, h * zoom.value);
  ctx.clip();
  ctx.translate(artOffset.value.x, artOffset.value.y);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 1;
  ctx.stroke(path);
  ctx.restore();
}

function drawBrushPreview(): void {
  if (!ctx || !hoverPos.value) return;
  const tool = store.currentTool;
  if (tool !== 'brush' && tool !== 'eraser') return;
  if (isPanning.value) return;

  const size = store.brushSize;
  const offset = Math.floor((size - 1) / 2);
  const z = zoom.value;
  const ox = artOffset.value.x;
  const oy = artOffset.value.y;

  // Clip preview to canvas bounds
  const startX = Math.max(0, hoverPos.value.x - offset);
  const startY = Math.max(0, hoverPos.value.y - offset);
  const endX = Math.min(editorData.value.width, hoverPos.value.x - offset + size);
  const endY = Math.min(editorData.value.height, hoverPos.value.y - offset + size);
  if (endX <= startX || endY <= startY) return;

  const px = ox + startX * z;
  const py = oy + startY * z;
  const w = (endX - startX) * z;
  const h = (endY - startY) * z;

  const isEraser = tool === 'eraser';
  const currentColor = editorData.value.colors[store.currentColorIndex];

  ctx.save();
  // Soft fill that hints what's about to land (color for brush, red for eraser)
  if (isEraser) {
    ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
  } else if (currentColor) {
    ctx.fillStyle = currentColor;
    ctx.globalAlpha = 0.45;
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  }
  ctx.fillRect(px, py, w, h);
  ctx.globalAlpha = 1;

  // Outline — dashed for eraser to read as "removing"
  ctx.strokeStyle = isEraser ? 'rgba(239, 68, 68, 0.95)' : 'rgba(0, 0, 0, 0.7)';
  ctx.lineWidth = 1.5;
  if (isEraser) ctx.setLineDash([4, 3]);
  ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  ctx.restore();
}

function drawEditor() {
  drawBackground();
  drawReference();
  drawPixels();
  drawIsoOverlay();
  drawGrid();
  drawBrushPreview();
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

  // Clear, then apply art background (mirrors main canvas)
  miniMapCtx.clearRect(0, 0, mmW, mmH);
  const bg = store.bgConfig;
  if (bg.type === 'solid') {
    miniMapCtx.fillStyle = bg.color;
    miniMapCtx.fillRect(0, 0, mmW, mmH);
  } else if (bg.type === 'art' && bgImage.value) {
    miniMapCtx.drawImage(bgImage.value, 0, 0, mmW, mmH);
  }

  // Draw pixels with edge-aligned coords: adjacent cells share the exact
  // boundary pixel, so no gaps or color bleed regardless of fractional cellW.
  const results = getPixelMap();
  for (const [key, pixelIndex] of Object.entries(results)) {
    const [x = 0, y = 0] = key.split('_').map(Number);
    const sx = Math.round(x * cellW);
    const sy = Math.round(y * cellH);
    const ex = Math.round((x + 1) * cellW);
    const ey = Math.round((y + 1) * cellH);
    miniMapCtx.fillStyle = editorData.value.colors[pixelIndex] ?? '#000000';
    miniMapCtx.fillRect(sx, sy, ex - sx, ey - sy);
  }

  // Viewport indicator — map container's visible region to minimap (art) coords
  const visiblePixelX = (container.scrollLeft - artOffset.value.x) / zoom.value;
  const visiblePixelY = (container.scrollTop - artOffset.value.y) / zoom.value;
  const visiblePixelW = container.clientWidth / zoom.value;
  const visiblePixelH = container.clientHeight / zoom.value;

  // Skip rect when the whole art is visible (zoomed out enough to fit)
  const showsEverything = visiblePixelW >= artW && visiblePixelH >= artH;
  if (showsEverything) return;

  const vx = Math.max(0, visiblePixelX) * cellW;
  const vy = Math.max(0, visiblePixelY) * cellH;
  const vw = Math.min(artW - Math.max(0, visiblePixelX), visiblePixelW) * cellW;
  const vh = Math.min(artH - Math.max(0, visiblePixelY), visiblePixelH) * cellH;

  if (vw > 0 && vh > 0) {
    miniMapCtx.strokeStyle = 'red';
    miniMapCtx.lineWidth = 1.5;
    miniMapCtx.strokeRect(vx + 0.5, vy + 0.5, vw - 1, vh - 1);
  }
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
        scheduleDraw();
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function toggleReference() {
  referenceVisible.value = !referenceVisible.value;
  scheduleDraw();
}

function clearReference() {
  referenceImage.value = null;
  scheduleDraw();
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
watch(
    () => editorData.value.id,
    () => {
      collectionsLoaded.value = false
      editorCollections.value = []
      initialCollectionIds.value = new Set()
    },
)

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

  if (auth.isLogged && editorData.value.id_string && typeof editorData.value.id === 'number') {
    loadCurrentCollections()
  }
})

onUnmounted(() => {
  if (drawRafId !== null) cancelAnimationFrame(drawRafId);
  if (miniMapRafId !== null) cancelAnimationFrame(miniMapRafId);
  store.resetEditorData()
  clearListeners()
})

watch(() => store.drawTurn, () => {
  scheduleDraw()
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
      <div class="toolbar-start">
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
        <ui-dropdown-menu>
          <ui-tooltip text="Settings">
            <button class="toolbar-btn"><span class="icon icon-cog"/></button>
          </ui-tooltip>
          <template #menu>
            <div class="file-menu">
              <button class="file-menu-item" @click="isResizing = true">
                <span class="icon icon-ruler"/>
                <span class="file-menu-label">
                  <span>Resize canvas</span>
                  <span class="file-menu-hint">{{ editorData.width }}×{{ editorData.height }}</span>
                </span>
              </button>
              <button class="file-menu-item" @click="openBgPicker">
                <span class="icon icon-image"/>
                <span class="file-menu-label">
                  <span>Background</span>
                  <span class="file-menu-hint">{{ bgLabel }}</span>
                </span>
              </button>
              <button class="file-menu-item" @click="store.cycleGridMode(); scheduleDraw()">
                <span :class="gridIconClass"/>
                <span class="file-menu-label">
                  <span>Grid mode</span>
                  <span class="file-menu-hint">{{ editorData.meta?.iso?.mode ?? 'square' }}</span>
                </span>
              </button>
              <div class="file-menu-sep"/>
              <button class="file-menu-item" @click="importReferenceImage">
                <span class="icon icon-upload"/>
                <span>{{ referenceImage ? 'Replace reference image' : 'Add reference image' }}</span>
              </button>
              <button v-if="referenceImage" class="file-menu-item" @click="toggleReference">
                <span class="icon" :class="referenceVisible ? 'icon-eye-cross' : 'icon-eye'"/>
                <span>{{ referenceVisible ? 'Hide reference' : 'Show reference' }}</span>
              </button>
              <button v-if="referenceImage" class="file-menu-item" @click="clearReference">
                <span class="icon icon-trash"/>
                <span>Remove reference</span>
              </button>
              <div class="file-menu-sep"/>
              <button class="file-menu-item" @click="store.clearCurrentLayer">
                <span class="icon icon-broom"/>
                <span>Clear current layer</span>
              </button>
              <button class="file-menu-item" @click="store.cleanupUnusedColors()">
                <span class="icon icon-auto-fix"/>
                <span>Cleanup unused colors</span>
              </button>
            </div>
          </template>
        </ui-dropdown-menu>
      </div>
      <div class="toolbar-main no-scrollbar">
      <div class="toolbar-group">
        <ui-tooltip text="Get started">
          <button class="toolbar-btn" @click="openOnboarding"><span class="icon icon-rocket"/></button>
        </ui-tooltip>
      </div>
      <div class="toolbar-sep"/>
      <div class="toolbar-group">
        <ui-tooltip text="Undo (Ctrl+Z)">
          <button class="toolbar-btn" @click="store.undo()"><span class="icon icon-undo"/></button>
        </ui-tooltip>
        <ui-tooltip text="Redo (Ctrl+Shift+Z)">
          <button class="toolbar-btn" @click="store.redo()"><span class="icon icon-redo"/></button>
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
      </div>
      <!-- Inline iso cell editor when iso grid is active -->
      <template v-if="(editorData.meta?.iso?.mode ?? 'square') === 'iso'">
        <div class="toolbar-sep"/>
        <div class="toolbar-group items-center">
          <input
              class="resize-input"
              type="number"
              min="1"
              max="32"
              :value="(editorData.meta?.iso?.cell ?? { width: 2, height: 1 }).width"
              @change="store.setGridCell(($event.target as HTMLInputElement).value, (editorData.meta?.iso?.cell ?? { width: 2, height: 1 }).height); scheduleDraw()"
          >
          <span class="text-xs">×</span>
          <input
              class="resize-input"
              type="number"
              min="1"
              max="32"
              :value="(editorData.meta?.iso?.cell ?? { width: 2, height: 1 }).height"
              @change="store.setGridCell((editorData.meta?.iso?.cell ?? { width: 2, height: 1 }).width, ($event.target as HTMLInputElement).value); scheduleDraw()"
          >
        </div>
      </template>
      <!-- Inline resize editor when triggered from Settings -->
      <template v-if="isResizing">
        <div class="toolbar-sep"/>
        <div class="toolbar-group items-center">
          <input class="resize-input" v-model="newSize.width" type="number" min="1" max="128">
          <span class="text-xs">×</span>
          <input class="resize-input" v-model="newSize.height" type="number" min="1" max="128">
          <button class="toolbar-btn active" @click="store.resize(newSize);isResizing = false;">
            <span class="icon icon-check"/>
          </button>
          <button class="toolbar-btn toolbar-btn-text" @click="isResizing = false">
            Cancel
          </button>
        </div>
      </template>
      <span class="toolbar-info">{{ editorData.width }}×{{ editorData.height }}</span>
      </div>
      <div class="toolbar-end">
        <button class="publish-toolbar-btn" @click="openPublish">
          <span class="icon icon-social"/>
          <span>Share</span>
        </button>
      </div>
    </div>

    <div class="editor-body">
      <!-- Tool rail (left on desktop, horizontal strip on mobile) -->
      <Widget class="tool-rail">
        <div class="tools tools-rail no-scrollbar">
          <Square @click="store.setTool('brush')" :class="{ active: store.currentTool === 'brush' }">
            <span class="icon icon-square"/>
          </Square>
          <Square @click="store.setTool('iso-line')" :class="{ active: store.currentTool === 'iso-line' }">
            <span class="icon icon-rhombus"/>
          </Square>
          <Square @click="store.setTool('bucket')" :class="{ active: store.currentTool === 'bucket' }">
            <span class="icon icon-bucket"/>
          </Square>
          <Square @click="store.setTool('eraser')" :class="{ active: store.currentTool === 'eraser' }">
            <span class="icon icon-eraser"/>
          </Square>

          <div
              v-if="store.currentTool === 'brush' || store.currentTool === 'eraser'"
              class="brush-sizes"
              role="group"
              aria-label="Brush size"
          >
            <button
                v-for="n in [1, 2, 3, 4, 5]"
                :key="n"
                type="button"
                class="brush-size"
                :class="{ active: store.brushSize === n }"
                :title="`Brush size ${n}`"
                :aria-label="`Brush size ${n}`"
                :aria-pressed="store.brushSize === n"
                @click="store.setBrushSize(n)"
            >
              <span
                  class="brush-size-dot"
                  :style="{ width: `${Math.min(14, 2 + n * 2)}px`, height: `${Math.min(14, 2 + n * 2)}px` }"
              />
            </button>
          </div>

          <div class="tools-sep"/>

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

      <!-- Canvas + palette column -->
      <div class="canvas-col">
        <Widget>
          <Square>
            <div
                class="canvas-container no-scrollbar m-auto"
                @scroll="scheduleMiniMap"
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
                  @mouseleave="leaveCanvas"
                  @touchstart="handleTouchStart"
                  @touchmove="handleTouchMove"
                  @touchend="handleTouchEnd"
              />
            </div>
          </Square>
        </Widget>

        <Widget title="Palette">
          <template #ctl>
            <div class="widget-ctl-group">
              <button class="widget-ctl-btn" @click="paletteRef?.addColor()" title="Add color">
                <span class="icon icon-plus"/>
                <span>Add</span>
              </button>
              <button
                  class="widget-ctl-btn"
                  :class="{active: paletteModify}"
                  @click="paletteRef?.toggleModify()"
                  title="Toggle edit mode"
              >
                <span class="icon icon-adjust"/>
                <span>Edit</span>
              </button>
            </div>
          </template>
          <editor-palette ref="paletteRef" v-model:modify="paletteModify"/>
        </Widget>
      </div>

      <!-- Right sidebar (Preview + Layers only) -->
      <div class="editor-sidebar">
        <Widget title="Preview" class="preview-widget">
          <template #ctl>
            <a v-if="editorData.id_string" target="_blank" :href="`/art/${editorData.id_string}`">
              <span class="icon icon-link"/>
            </a>
          </template>
          <Square class="inside">
            <canvas ref="miniMap" class="mini-map"/>
          </Square>
        </Widget>

        <Widget title="Layers" class="layers">
          <template #ctl>
            <button class="layer-add" @click="store.addLayer" title="Add new layer" aria-label="Add new layer">
              <span class="icon icon-plus"/>
            </button>
          </template>
          <ul>
            <li
                v-for="(_, index) in editorData.layers"
                :key="index"
                :class="{ active: index === store.currentLayerIndex }"
                @click="store.currentLayerIndex = index"
            >
              <span class="layer-num" aria-hidden="true">{{ editorData.layers.length - index }}</span>
              <EditableText
                  v-model="editorData.layers[index]!.name"
                  placeholder="Untitled layer"
                  class="layer-name"
                  @changed="store.saveState()"
              />
              <button
                  v-if="editorData.layers.length > 1"
                  @click.stop="store.deleteLayer(index)"
                  class="layer-del"
                  title="Delete layer"
                  aria-label="Delete layer"
              >
                <span class="icon icon-trash"/>
              </button>
            </li>
          </ul>
        </Widget>
      </div>
    </div>

    <!-- Reference strip from user's collections -->
    <EditorCollectionStrip
        v-if="editorCollections.length"
        :collections="editorCollections"
        :exclude-id="editorData.id_string"
    />

    <!-- Publish modal -->
    <Teleport to="body">
      <div v-if="showPublishModal" class="share-overlay" @click.self="showPublishModal = false">
        <div class="share-modal">
          <!-- Step 1: Edit info -->
          <template v-if="publishStep === 'edit'">
            <h3 class="publish-heading">Publish your pixel art</h3>
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
              <div>
                <label class="publish-label">Collections</label>
                <EditorCollectionPicker v-model="editorCollections"/>
              </div>
              <div class="h-center gap-2">
                <ui-switch v-model="editorData.is_public"/>
                <span class="text-xs">Public</span>
              </div>
            </div>
            <div class="publish-actions">
              <button class="btn primary block" @click="saveAndPublish">
                Save & Publish
              </button>
              <button class="btn block" @click="showPublishModal = false">
                Cancel
              </button>
            </div>
          </template>

          <!-- Step 2: Share result -->
          <template v-if="publishStep === 'done'">
            <div class="publish-done-header">
              <h3 class="text-sm font-bold">Published!</h3>
              <p class="text-xs mt-1">Your pixel art is live. Share it!</p>
            </div>
            <div class="share-stack">
              <div class="publish-link" @click="copyLink">
                <span class="publish-link-text">{{ shareMeta.url }}</span>
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
                  class="btn primary wide"
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
            <button class="btn primary block" @click="finishOnboarding">Start drawing</button>
            <button class="share-dismiss" @click="skipOnboarding">Skip</button>
          </div>
        </div>
      </div>

    <!-- Background picker -->
    <Teleport to="body">
      <div v-if="showBgPicker" class="share-overlay" @click.self="showBgPicker = false">
        <div class="share-modal bg-picker-modal">
          <h3 class="publish-heading">Canvas background</h3>
          <p class="publish-sub">Choose what shows under your pixels. Saves with the art.</p>

          <div class="bg-tabs">
            <button class="bg-tab" :class="{active: bgTab === 'none'}" @click="bgTab = 'none'">
              <span class="bg-tab-preview bg-tab-preview-checker" aria-hidden="true"/>
              <span>Default</span>
            </button>
            <button class="bg-tab" :class="{active: bgTab === 'solid'}" @click="bgTab = 'solid'">
              <span class="bg-tab-preview" :style="{background: bgSolidColor}" aria-hidden="true"/>
              <span>Solid</span>
            </button>
            <button
                class="bg-tab"
                :class="{active: bgTab === 'art'}"
                :disabled="!auth.isLogged"
                :title="auth.isLogged ? 'Use one of your arts' : 'Login required'"
                @click="bgTab = 'art'; auth.isLogged && !myArtsLoaded && loadMyArts()"
            >
              <span class="bg-tab-preview bg-tab-preview-art" aria-hidden="true"/>
              <span>My art</span>
            </button>
          </div>

          <div class="bg-tab-body">
            <div v-if="bgTab === 'none'" class="bg-pane-none">
              <p>Transparent checkerboard — what you see at editor start. No solid layer behind the pixels.</p>
              <button class="btn primary wide" @click="applyBgNone(); showBgPicker = false">
                Use default
              </button>
            </div>

            <div v-else-if="bgTab === 'solid'" class="bg-pane-solid">
              <label class="bg-color-row">
                <input type="color" v-model="bgSolidColor" class="bg-color-input">
                <span class="bg-color-hex">{{ bgSolidColor.toUpperCase() }}</span>
              </label>
              <div class="bg-color-presets">
                <button
                    v-for="c in ['#FFFFFF','#000000','#F5F5F5','#FFE4B5','#B0E0E6','#1A1033','#0F380F','#2A0D4D']"
                    :key="c"
                    class="bg-color-preset"
                    :style="{background: c}"
                    :title="c"
                    @click="bgSolidColor = c"
                />
              </div>
              <button class="btn primary wide" @click="applyBgSolid(); showBgPicker = false">
                Apply color
              </button>
            </div>

            <div v-else-if="bgTab === 'art'" class="bg-pane-art">
              <div v-if="!auth.isLogged" class="bg-empty">
                <p>Login to pick from your published arts.</p>
              </div>
              <div v-else-if="loadingMyArts" class="bg-art-grid">
                <div v-for="i in 6" :key="i" class="skeleton skeleton-square bg-art-thumb"/>
              </div>
              <div v-else-if="!myArts.length" class="bg-empty">
                <p>You haven't published any art yet.</p>
                <p class="text-xs text-muted">Publish first, then come back here.</p>
              </div>
              <div v-else class="bg-art-grid">
                <button
                    v-for="art in myArts"
                    :key="art.id"
                    class="bg-art-thumb"
                    :class="{active: store.bgConfig.artId === art.id}"
                    :title="art.name"
                    @click="applyBgArt(art); showBgPicker = false"
                >
                  <img :src="art.thumb" :alt="art.name" loading="lazy">
                </button>
              </div>
            </div>
          </div>

          <button class="share-dismiss" @click="showBgPicker = false">Close</button>
        </div>
      </div>
    </Teleport>

    <!-- Login prompt -->
    <Teleport to="body">
      <div v-if="showLoginPrompt" class="share-overlay" @click.self="showLoginPrompt = false">
        <div class="share-modal">
          <h3 class="login-heading">Login to share</h3>
          <p class="login-msg">Sign in to publish and share your pixel art. Your local work will be synced to the cloud.</p>
          <div class="share-stack">
            <a :href="googleAuthUrl" class="btn primary wide">
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

<style scoped>
.publish-heading {
  font-size: var(--text-sm);
  line-height: var(--text-sm-lh);
  font-weight: 700;
  margin-bottom: 0.75rem;
}

.login-heading {
  font-size: var(--text-sm);
  line-height: var(--text-sm-lh);
  font-weight: 700;
  margin-bottom: 0.5rem;
}

/* ===== Background picker modal ===== */
.bg-picker-modal {
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem !important;
}

.bg-picker-modal .publish-heading {
  margin-bottom: 0;
}

.publish-sub {
  font-size: 12px;
  color: var(--muted);
  margin-top: -0.5rem;
  margin-bottom: 0;
  line-height: 1.5;
}

.bg-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 4px;
  background: var(--surface-2);
  border-radius: var(--radius);
}

.bg-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 8px;
  background: transparent;
  border: 0;
  border-radius: calc(var(--radius) - 2px);
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.bg-tab:hover:not(:disabled) {
  color: var(--foreground);
}

.bg-tab.active {
  background: var(--surface);
  color: var(--foreground);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.bg-tab:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bg-tab-preview {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.bg-tab-preview-checker {
  background:
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 6px 6px;
  background-position: 0 0, 0 3px, 3px -3px, -3px 0;
  background-color: #fff;
}

.bg-tab-preview-art {
  background: linear-gradient(135deg, var(--primary), color-mix(in oklab, var(--primary) 50%, var(--foreground)));
}

.bg-tab-body {
  min-height: 200px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.bg-pane-none,
.bg-pane-solid,
.bg-pane-art {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.bg-pane-none p,
.bg-empty p {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.55;
  margin: 0;
}

.bg-empty {
  text-align: center;
  padding: 2rem 1rem;
}

/* Solid color tab */
.bg-color-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem;
  background: var(--surface-2);
  border-radius: var(--radius);
  cursor: pointer;
}

.bg-color-input {
  width: 44px;
  height: 44px;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
  overflow: hidden;
}

.bg-color-hex {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
  letter-spacing: 0.02em;
}

.bg-color-presets {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
}

.bg-color-preset {
  aspect-ratio: 1;
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  transition: transform 140ms ease, border-color 140ms ease;
}

.bg-color-preset:hover {
  transform: scale(1.08);
  border-color: var(--primary);
}

/* Art picker tab */
.bg-art-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
  padding: 2px;
}

.bg-art-thumb {
  aspect-ratio: 1;
  background: var(--surface-2);
  border: 2px solid transparent;
  border-radius: var(--radius);
  padding: 0;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 140ms ease, transform 140ms ease;
}

.bg-art-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  display: block;
}

.bg-art-thumb:hover {
  border-color: color-mix(in oklab, var(--primary) 55%, var(--border));
  transform: translateY(-1px);
}

.bg-art-thumb.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 35%, transparent);
}

.btn.wide {
  width: 100%;
  justify-content: center;
}

.login-msg {
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  margin-bottom: 1rem;
}
</style>