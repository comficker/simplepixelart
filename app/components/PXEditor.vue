<script setup lang="ts">
import {onMounted, ref, toRaw} from "vue";
import {buildIsoPath, compositeFrame, drawThumbnail, editorDataToJSON, editorDataToSVG, layers2MapNumbers} from "~/helper/canvas";
import {hexToRgb} from "~/helper/color";
import {generateUUID, sharedPage2EditorData} from "~/helper/utils";
import {saveWorkspaceFull} from "~/helper/workspaceSnapshot";
import {toast} from "vue-sonner";

const canvas = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
const miniMap = ref<HTMLCanvasElement | null>(null);
let miniMapCtx: CanvasRenderingContext2D | null = null;

const store = useEditor()
const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()

const activeTilesetId = computed<string | null>(() => store.editorData?.meta?.tileset?.id || null)

const googleAuthUrl = computed(() => {
  const apiBase = (config.public.api as string) || ''
  if (typeof window === 'undefined') return `${apiBase}/auth/google`
  const next = `${window.location.origin}/auth/callback`
  return `${apiBase}/auth/google?state=${encodeURIComponent(next)}`
})

const showPublishModal = ref(false)
const publishStep = ref<'edit' | 'done'>('edit')

const showPngModal = ref(false)
const PNG_SCALES = [1, 2, 4, 8, 16, 32]
const pngScale = ref(8)

const showDeleteConfirm = ref(false)
const deleting = ref(false)
const tileStripRef = ref<{
  removeItem: (id: string | number) => void
  refresh: () => void
  siblingId: (exclude?: string | number) => string | null
} | null>(null)

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

const isCurrentArtSaved = computed(() =>
    auth.isLogged && typeof editorData.value.id === 'number' && !!editorData.value.id_string,
)

async function loadTileRef(idStr: string, tsId?: string) {
  if (!idStr) return
  const live = editorData.value
  if (live && (String(live.id) === idStr || live.id_string === idStr)) {
    focusActiveBoard()
    return
  }
  const board = store.boards.find(b => b.id === idStr || b.data?.id_string === idStr)
  if (board) {
    store.setActiveBoard(board.id)
    focusActiveBoard()
    return
  }
  canvasReady.value = false
  try {
    let data: any = null
    let ws: Record<string, any> = {}
    try { ws = JSON.parse(localStorage.getItem('workspaces') || '{}') } catch { /* ignore */ }
    if (ws[idStr]) {
      data = JSON.parse(JSON.stringify(ws[idStr]))
    } else {
      const res = await useNativeFetch<any>(`/coloring/shared-pages/${idStr}/`)
      const mine = auth.logged?.id === res?.user?.id
      data = sharedPage2EditorData(res, mine
          ? {id: res.id, id_string: res.id_string, template: null}
          : {id: generateUUID(), id_string: '', template: res.id})
    }
    if (tsId) data.meta = {...(data.meta || {}), tileset: {id: tsId}}
    store.addBoardWithData(data)
    focusActiveBoard()
  } catch {
    toast.error('Could not open that tile')
  } finally {
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => { canvasReady.value = true })
    } else {
      canvasReady.value = true
    }
  }
}

function purgeLocalArt(id: string | number) {
  const key = id.toString()
  try {
    const ws = JSON.parse(localStorage.getItem('workspaces') || '{}')
    if (ws[key] !== undefined) { delete ws[key]; localStorage.setItem('workspaces', JSON.stringify(ws)) }
    const hs = JSON.parse(localStorage.getItem('histories') || '{}')
    if (hs[key] !== undefined) { delete hs[key]; localStorage.setItem('histories', JSON.stringify(hs)) }
  } catch { /* ignore */ }
  if (localStorage.getItem('workspace_current') === key) localStorage.setItem('workspace_current', '')
}

async function destroyCurrent() {
  if (deleting.value) return
  deleting.value = true
  const id = editorData.value.id
  const idString = editorData.value.id_string
  const isCloud = auth.isLogged && typeof id === 'number' && !!idString

  const nextIdStr = isCloud ? (tileStripRef.value?.siblingId(idString) || null) : null

  try {
    if (isCloud) {
      await useNativeFetch(`/coloring/shared-pages/${id}/`, {method: 'DELETE'})
    }
  } catch {
    toast.error('Delete failed')
    deleting.value = false
    return
  }

  purgeLocalArt(id)
  tileStripRef.value?.removeItem(id)
  if (idString) tileStripRef.value?.removeItem(idString)
  showDeleteConfirm.value = false

  if (nextIdStr) {
    canvasReady.value = false
    await store.load(nextIdStr)
    setupCanvas()
    newSize.value = {width: editorData.value.width, height: editorData.value.height}
    scheduleDraw()
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => { canvasReady.value = true })
    else canvasReady.value = true
    toast.success('Deleted — opened next tile in the tileset')
  } else {
    store.resetEditorData()
    localStorage.setItem('workspace_current', '')
    if (route.query.id) router.replace({query: {}}).catch(() => {})
    setupCanvas()
    newSize.value = {width: editorData.value.width, height: editorData.value.height}
    scheduleDraw()
    toast.success('Deleted')
  }
  deleting.value = false
}

const PUBLISH_STATUSES = [
  {value: 'public', label: 'Public — listed in the gallery', action: 'Publish'},
  {value: 'draft', label: 'Private draft — only you can see it', action: 'Save draft'},
] as const
const publishStatus = ref<'public' | 'draft'>('draft')
const publishAction = computed(() =>
    PUBLISH_STATUSES.find(s => s.value === publishStatus.value)?.action || 'Save')

function openPublish() {
  if (!auth.isLogged) {
    showLoginPrompt.value = true
    return
  }
  publishStatus.value = editorData.value.is_public ? 'public' : 'draft'
  publishStep.value = 'edit'
  showPublishModal.value = true
  loadEconomyForPublish()
}

const aiMeta = ref<{ enabled: boolean; cost: number; balance: number } | null>(null)
const aiBusy = ref(false)

async function loadEconomyForPublish() {
  try {
    const res = await useNativeFetch<any>('/coloring/economy/')
    aiMeta.value = {
      enabled: !!res.ai_enabled,
      cost: res.actions?.gen_meta ?? 1,
      balance: res.balance ?? 0,
    }
  } catch { aiMeta.value = null }
}

async function genMetaWithAI() {
  if (aiBusy.value || !aiMeta.value?.enabled) return
  aiBusy.value = true
  try {
    const tmp = document.createElement('canvas')
    tmp.width = editorData.value.width
    tmp.height = editorData.value.height
    drawThumbnail(tmp, editorData.value, 1)
    const res = await useNativeFetch<{ title: string; description: string; tags: string[]; slug?: string; balance: number }>(
        '/coloring/economy/gen-meta/', {
          method: 'POST',
          body: {
            image: tmp.toDataURL('image/png'),
            width: editorData.value.width,
            height: editorData.value.height,
            colors: editorData.value.colors,
            tags: editorData.value.tags || [],
            name: editorData.value.name || '',
          },
        })
    editorData.value.name = res.title
    editorData.value.desc = res.description
    if (res.tags?.length) editorData.value.tags = res.tags
    if (res.slug && !editorData.value.is_public) editorData.value.id_string = res.slug
    if (aiMeta.value) aiMeta.value.balance = res.balance
    toast.success(`Filled by AI · −${aiMeta.value?.cost ?? 1} credit`)
  } catch (e: any) {
    const s = e?.status ?? e?.response?.status
    if (s === 402) toast.error('Not enough credits — earn some in Missions')
    else toast.error('AI could not read this one — your credit was refunded')
  } finally {
    aiBusy.value = false
  }
}

async function saveArt() {
  editorData.value.is_public = publishStatus.value === 'public'
  store.saveState(false)
  await store.saveNow()
  if (editorData.value.id_string) {
    publishStep.value = 'done'
  } else {
    showPublishModal.value = false
    toast.success('Saved')
  }
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
const cam = ref({x: 0, y: 0});
const stageW = ref(384);
const stageH = ref(384);
let dpr = 1;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 64;
const BOARD_ACTIVE = '#4f46e5';
const DOT_W = 18, DOT_H = 16;

const coarsePointer = ref(false);

const boardMenu = ref<{ id: string; x: number; y: number } | null>(null);

const DESK_BG = { dark: '#1b1b1f', light: '#eceef1' };
const deskBg = ref(DESK_BG.dark);
const deskGrid = ref(true);
const deskGridStyle = ref<'solid' | 'dashed' | 'dots'>('solid');
const deskGridShape = ref<'square' | 'iso'>('square');
const deskGridColor = ref('');
const deskGridCell = ref({ width: 1, height: 1 });
const isCustomDeskBg = computed(() => {
  const c = deskBg.value.toLowerCase();
  return c !== DESK_BG.dark && c !== DESK_BG.light;
});
function setDeskCell(axis: 'width' | 'height', v: string) {
  const n = Math.max(1, Math.min(64, Math.round(Number(v) || 1)));
  deskGridCell.value = { ...deskGridCell.value, [axis]: n };
}

function deskIsLight(): boolean {
  const h = deskBg.value.replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 140;
}
const checkerSize = ref(1);
const checkerA = ref('');
const checkerB = ref('');
const guideColor = ref('');

function setCheckerSize(v: string | number) {
  checkerSize.value = Math.max(1, Math.min(64, Math.round(Number(v) || 1)));
}

const draggingGuide = ref<{ axis: 'v' | 'h'; index: number } | null>(null);
const hoverGuide = ref<{ axis: 'v' | 'h'; index: number } | null>(null);
const GUIDE_HIT_PX = 5;

function boardGuides(): { v: number[]; h: number[] } {
  const meta: any = editorData.value.meta || (editorData.value.meta = {} as any);
  if (!meta.guides) meta.guides = {v: [], h: []};
  if (!Array.isArray(meta.guides.v)) meta.guides.v = [];
  if (!Array.isArray(meta.guides.h)) meta.guides.h = [];
  return meta.guides;
}

function addGuide(axis: 'v' | 'h') {
  const g = boardGuides();
  const max = axis === 'v' ? editorData.value.width : editorData.value.height;
  g[axis].push(Math.round(max / 2));
  store.saveState();
  scheduleDraw();
}

function addGuidePreset(kind: 'center' | 'thirds') {
  const g = boardGuides();
  const w = editorData.value.width, h = editorData.value.height;
  const want = kind === 'center'
      ? {v: [w / 2], h: [h / 2]}
      : {v: [w / 3, (2 * w) / 3], h: [h / 3, (2 * h) / 3]};
  let added = 0;
  for (const axis of ['v', 'h'] as const) {
    for (const p of want[axis]) {
      const pos = Math.round(p);
      if (!g[axis].includes(pos)) { g[axis].push(pos); added++; }
    }
  }
  if (!added) return;
  store.saveState();
  scheduleDraw();
}

function clearGuides() {
  const g = boardGuides();
  if (!g.v.length && !g.h.length) return;
  g.v = [];
  g.h = [];
  store.saveState();
  scheduleDraw();
}

const guideCount = computed(() => {
  const g: any = editorData.value.meta?.guides;
  return (g?.v?.length || 0) + (g?.h?.length || 0);
});

function artPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
  const rect = canvas.value!.getBoundingClientRect();
  const {x: cx, y: cy} = getClientPos(e);
  const {x: ox, y: oy} = artOffset.value;
  return {x: (cx - rect.left - ox) / zoom.value, y: (cy - rect.top - oy) / zoom.value};
}

function guideAt(e: MouseEvent | TouchEvent): { axis: 'v' | 'h'; index: number } | null {
  if (store.currentTool !== 'select') return null;
  const g: any = editorData.value.meta?.guides;
  if (!g || (!g.v?.length && !g.h?.length)) return null;
  const p = artPos(e);
  const z = zoom.value;
  const w = editorData.value.width, h = editorData.value.height;
  const m = (GUIDE_HIT_PX + 3) / z;
  if (p.x < -m || p.x > w + m || p.y < -m || p.y > h + m) return null;
  const tol = GUIDE_HIT_PX / z;
  for (let i = 0; i < (g.v || []).length; i++) {
    if (Math.abs(g.v[i] - p.x) <= tol) return {axis: 'v', index: i};
  }
  for (let i = 0; i < (g.h || []).length; i++) {
    if (Math.abs(g.h[i] - p.y) <= tol) return {axis: 'h', index: i};
  }
  return null;
}

function doGuideDrag(e: MouseEvent) {
  const d = draggingGuide.value;
  if (!d) return;
  const g = boardGuides();
  const p = artPos(e);
  g[d.axis][d.index] = Math.round(d.axis === 'v' ? p.x : p.y);
  scheduleDraw();
}

function endGuideDrag() {
  const d = draggingGuide.value;
  if (!d) return;
  const g = boardGuides();
  const max = d.axis === 'v' ? editorData.value.width : editorData.value.height;
  const pos = g[d.axis][d.index]!;
  if (pos < 0 || pos > max) g[d.axis].splice(d.index, 1);
  draggingGuide.value = null;
  window.removeEventListener('mousemove', doGuideDrag);
  store.saveState();
  scheduleDraw();
}

function deskGridColorEff(): string {
  if (deskGridColor.value) return deskGridColor.value;
  return deskIsLight() ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.13)';
}
const referenceImage = ref<HTMLImageElement | null>(null);
const referenceVisible = ref(true);
const referenceOpacity = 0.5;
const showBoardChrome = ref(true);
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
const linkResize = ref(false);
const isPinching = ref(false);
const moveStart = ref({x: 0, y: 0});
const needSave = ref(false);
const canvasReady = ref(false);
const hoverPos = ref<{ x: number; y: number } | null>(null);
const hoverInSelection = computed(() =>
    store.currentTool === 'select' &&
    store.selectionState.bounds.active &&
    !!hoverPos.value &&
    store.checkKeyInSelection(`${hoverPos.value.x}_${hoverPos.value.y}`)
);
const bgImage = ref<HTMLImageElement | null>(null);
let bgImageUrlCache = '';

const settingsView = ref<'main' | 'resize' | 'bg' | 'canvas' | 'board'>('main');
const bgTab = ref<'none' | 'transparent' | 'solid' | 'art'>('none');
const bgSolidColor = ref('#FFFFFF');
const myArts = ref<Array<{id: string; name: string; thumb: string}>>([]);
const loadingMyArts = ref(false);
const myArtsLoaded = ref(false);
const failedBgThumb = reactive<Record<string, boolean>>({});

function openBgPicker() {
  const cfg = store.bgConfig;
  bgTab.value = cfg.type;
  bgSolidColor.value = cfg.color || '#FFFFFF';
  if (auth.isLogged && !myArtsLoaded.value) loadMyArts();
  settingsView.value = 'bg';
}

function openResize() {
  newSize.value = {
    width: editorData.value.width,
    height: editorData.value.height,
  };
  linkResize.value = editorData.value.width === editorData.value.height;
  settingsView.value = 'resize';
}

function clampDim(v: unknown): number {
  const n = Math.round(Number(v) || 0);
  return Math.min(128, Math.max(1, n));
}

function onResizeWidth(v: unknown) {
  const w = clampDim(v);
  newSize.value.width = w;
  if (linkResize.value) newSize.value.height = w;
}

function onResizeHeight(v: unknown) {
  const h = clampDim(v);
  newSize.value.height = h;
  if (linkResize.value) newSize.value.width = h;
}

function setResizePreset(s: number) {
  newSize.value = {width: s, height: s};
}

function applyResize() {
  const width = clampDim(newSize.value.width);
  const height = clampDim(newSize.value.height);
  if (width !== editorData.value.width || height !== editorData.value.height) {
    store.resize({width, height});
  }
  settingsView.value = 'main';
}

const resizeShrinks = computed(() =>
    clampDim(newSize.value.width) < editorData.value.width ||
    clampDim(newSize.value.height) < editorData.value.height,
);

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
            is_tile: false,          // background picker shows artworks, not tiles
          },
        }
    );
    myArts.value = res.results.map(r => ({
      id: r.id_string,
      name: r.name || r.id_string,
      thumb: `${config.public.api}/coloring/files/art-original/${r.id_string}.png`,
    }));
    myArtsLoaded.value = true;
  } catch {
    // Fetch failed — leave myArtsLoaded false so reopening the picker retries;
    // without this catch the fire-and-forget call is an unhandled rejection.
  } finally {
    loadingMyArts.value = false;
  }
}

const showArtPicker = ref(false);
const loadingArtInsert = ref(false);
const pickerArts = ref<Array<{id: string; name: string; thumb: string; status?: string; updated?: string}>>([]);
const pickerLoading = ref(false);

async function fetchPickerArts() {
  if (!auth.logged?.username) return;
  pickerLoading.value = true;
  try {
    const res = await useNativeFetch<{results: Array<{id_string: string; name: string; status?: string; updated?: string}>}>(
        '/coloring/shared-pages/',
        {params: {user: auth.logged.username, page_size: 100, ordering: '-updated', is_tile: false}}
    );
    pickerArts.value = (res.results || []).map(r => ({
      id: r.id_string,
      name: r.name || r.id_string,
      status: r.status,
      updated: r.updated,
      thumb: `${config.public.api}/coloring/files/art-original/${r.id_string}.png`,
    }));
  } catch {
    pickerArts.value = [];
  } finally {
    pickerLoading.value = false;
  }
}

function openArtPicker() {
  showArtPicker.value = true;
  if (auth.isLogged) fetchPickerArts();
  else buildLocalBoards();
}

async function loadArtIntoBoard(art: {id: string; name: string}) {
  if (loadingArtInsert.value) return;
  loadingArtInsert.value = true;
  try {
    const res = await useNativeFetch<any>(`/coloring/shared-pages/${art.id}/`);
    const mine = auth.logged?.id === res?.user?.id;
    const data = sharedPage2EditorData(res, mine
        ? {id: res.id, id_string: res.id_string, template: null}
        : {id: generateUUID(), id_string: '', template: res.id});
    store.addBoardWithData(data);
    fitAllBoards();
    showArtPicker.value = false;
    toast.success(`Added “${data.name || 'art'}” to the canvas`);
  } catch (e) {
    toast.error('Could not load that art');
  } finally {
    loadingArtInsert.value = false;
  }
}

const TILESET_BOARDS_MAX = 60;

function stampTileset(ed: any, tsId: string, tid: number | string | null) {
  ed.meta = {...(ed.meta || {}), tileset: {id: tsId, ...(tid != null ? {tid} : {})}};
  return ed;
}

async function collectTilesetEds(tsId: string): Promise<any[]> {
  if (tsId.startsWith('local:')) {
    const ts = useLocalTilesets().get(tsId);
    return (ts?.tiles || []).slice(0, TILESET_BOARDS_MAX)
        .map(t => stampTileset(JSON.parse(JSON.stringify(t.ed)), tsId, t.tid));
  }
  try {
    const t = await useNativeFetch<any>(`/coloring/tilesets/${tsId}/`);
    const slugs = ([...new Set(Object.values(t?.meta?.registry || {}))] as string[]).slice(0, TILESET_BOARDS_MAX);
    const settled = await Promise.all(slugs.map(async (slug) => {
      try {
        const res = await useNativeFetch<any>(`/coloring/shared-pages/${slug}/`);
        const mine = auth.logged?.id === res?.user?.id;
        const ed = sharedPage2EditorData(res, mine
            ? {id: res.id, id_string: res.id_string, template: null}
            : {id: generateUUID(), id_string: '', template: res.id});
        return stampTileset(ed, tsId, res.id);
      } catch {
        return null;
      }
    }));
    return settled.filter(Boolean);
  } catch {
    return [];
  }
}

async function loadTilesetBoards(tsId: string) {
  const eds = await collectTilesetEds(tsId);
  if (!eds.length) { await store.load(undefined); return; }
  const cols = Math.ceil(Math.sqrt(eds.length));
  const cellW = Math.max(...eds.map(e => e.width || 16));
  const cellH = Math.max(...eds.map(e => e.height || 16));
  const padX = Math.max(2, Math.round(cellW * 0.25));
  const padY = Math.max(2, Math.round(cellH * 0.25));
  const boards = eds.map((data, i) => ({
    x: (i % cols) * (cellW + padX),
    y: Math.floor(i / cols) * (cellH + padY),
    data,
  }));
  try {
    const ws = JSON.parse(localStorage.getItem('workspaces') || '{}');
    ws[String(eds[0].id)] = eds[0];
    localStorage.setItem('workspaces', JSON.stringify(ws));
    localStorage.setItem('workspace_current', String(eds[0].id));
  } catch { /* ignore quota */ }
  await saveWorkspaceFull({boards, activeIndex: 0});
  await store.load(undefined);
}

const localBoards = ref<Array<{id: string; name: string; status?: string; updated?: string; previewImgs: string[]}>>([]);

function boardThumb(ed: any): string {
  try {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, ed.width || 16);
    cv.height = Math.max(1, ed.height || 16);
    drawThumbnail(cv, ed, 1);
    return cv.toDataURL('image/png');
  } catch { return ''; }
}

function buildLocalBoards() {
  let ws: Record<string, any> = {};
  try { ws = JSON.parse(localStorage.getItem('workspaces') || '{}'); } catch { ws = {}; }
  localBoards.value = Object.values(ws)
      .filter((ed: any) => ed && Array.isArray(ed.layers))
      .sort((a: any, b: any) => String(b.updated || '').localeCompare(String(a.updated || '')))
      .map((ed: any) => {
        const t = boardThumb(ed);
        return {
          id: String(ed.id), name: ed.name || 'Untitled',
          status: ed.is_public ? 'public' : 'draft', updated: ed.updated,
          previewImgs: t ? [t] : [],
        };
      });
}

const browseBoards = computed(() =>
    auth.isLogged
        ? pickerArts.value.map(a => ({id: a.id, name: a.name, status: a.status, updated: a.updated, previewImgs: [a.thumb]}))
        : localBoards.value,
);

function onPickBoard(id: string) {
  if (auth.isLogged) {
    const a = pickerArts.value.find(x => x.id === id);
    if (a) loadArtIntoBoard(a);
    return;
  }
  let ws: Record<string, any> = {};
  try { ws = JSON.parse(localStorage.getItem('workspaces') || '{}'); } catch { /* ignore */ }
  const ed = ws[id];
  if (!ed) { toast.error('Could not open that board'); return; }
  store.addBoardWithData(JSON.parse(JSON.stringify(ed)));
  fitAllBoards();
  showArtPicker.value = false;
  toast.success(`Added “${ed.name || 'board'}” to the canvas`);
}

function onNewBlankBoard() {
  onAddBoard(16);
  showArtPicker.value = false;
}

function applyBgNone() {
  store.setBg({type: 'none', color: '', artId: '', artUrl: ''});
  bgTab.value = 'none';
}

function applyBgTransparent() {
  store.setBg({type: 'transparent', color: '', artId: '', artUrl: ''});
  bgTab.value = 'transparent';
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
const showPalettePicker = ref(false)
const showStripImport = ref(false)

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

watch(
    () => [store.bgConfig.type, store.bgConfig.artUrl] as const,
    ([type, url]) => {
      if (typeof window === 'undefined') return;
      if (type !== 'art' || !url) {
        bgImage.value = null;
        bgImageUrlCache = '';
        scheduleDraw();
        scheduleMiniMap();
        return;
      }
      if (url === bgImageUrlCache && bgImage.value) {
        scheduleDraw();
        scheduleMiniMap();
        return;
      }
      bgImageUrlCache = url;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (bgImageUrlCache === url) {
          bgImage.value = img;
          scheduleDraw();
          scheduleMiniMap();
        }
      };
      img.src = url;
    },
    {immediate: true}
);

watch(() => [store.bgConfig.type, store.bgConfig.color], () => {
  if (typeof window === 'undefined') return;
  scheduleDraw();
  scheduleMiniMap();
});

let artCanvas: HTMLCanvasElement | null = null;
let artCtx: CanvasRenderingContext2D | null = null;
let artImg: ImageData | null = null;
let artTurn = -1;
let artW = -1;
let artH = -1;

function topColorIndexAt(ed: any, cx: number, cy: number): number {
  const layers = ed.layers;
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    const v = L.pixels[`${cx - L.x}_${cy - L.y}`];
    if (v !== undefined && v !== -1) return v;
  }
  return -1;
}

function ensureArtBuffer(): HTMLCanvasElement | null {
  const ed = toRaw(editorData.value);
  const w = ed.width;
  const h = ed.height;
  let sizeChanged = false;
  if (!artCanvas) {
    artCanvas = document.createElement('canvas');
    artCtx = artCanvas.getContext('2d');
  }
  if (!artCtx) return null;
  if (artW !== w || artH !== h || !artImg) {
    artCanvas.width = w;
    artCanvas.height = h;
    artW = w;
    artH = h;
    artImg = artCtx.createImageData(w, h);
    sizeChanged = true;
  }
  if (artTurn === store.drawTurn && !sizeChanged) return artCanvas;

  const {full, keys} = store.consumeRenderDirty();
  const data = artImg.data;
  const rgb = ed.colors.map(c => hexToRgb(c));

  if (full || sizeChanged) {
    data.fill(0);
    const map = layers2MapNumbers(ed);
    for (const k in map) {
      const c = rgb[map[k]!];
      if (!c) continue;
      const sep = k.indexOf('_');
      const x = +k.slice(0, sep);
      const y = +k.slice(sep + 1);
      const off = (y * w + x) * 4;
      data[off] = c[0];
      data[off + 1] = c[1];
      data[off + 2] = c[2];
      data[off + 3] = 255;
    }
  } else {
    for (const k of keys) {
      const sep = k.indexOf('_');
      const x = +k.slice(0, sep);
      const y = +k.slice(sep + 1);
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      const ci = topColorIndexAt(ed, x, y);
      const c = ci >= 0 ? rgb[ci] : null;
      const off = (y * w + x) * 4;
      if (c) {
        data[off] = c[0];
        data[off + 1] = c[1];
        data[off + 2] = c[2];
        data[off + 3] = 255;
      } else {
        data[off] = 0;
        data[off + 1] = 0;
        data[off + 2] = 0;
        data[off + 3] = 0;
      }
    }
  }
  artCtx.putImageData(artImg, 0, 0);
  artTurn = store.drawTurn;
  return artCanvas;
}

function getArtCanvas(): HTMLCanvasElement | null {
  return ensureArtBuffer();
}

let bgCanvas: HTMLCanvasElement | null = null;
let bgCtx: CanvasRenderingContext2D | null = null;
let bgCacheKey = '';
let sharedBgCanvas: HTMLCanvasElement | null = null;

let isoPathCache: Path2D | null = null;
let isoCacheKey = '';

const ISO_MIN_CELL_PX = 6;

function getIsoPath(): Path2D | null {
  const iso = editorData.value.meta?.iso;
  if (!iso || iso.mode !== 'iso') return null;
  if (iso.cell.width * zoom.value < ISO_MIN_CELL_PX) return null;
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

const activeBoard = computed(() => store.boards.find(b => b.id === store.activeBoardId) || null)

const artOffset = computed(() => {
  const b = activeBoard.value
  const bx = b ? b.x : 0
  const by = b ? b.y : 0
  return {x: cam.value.x + bx * zoom.value, y: cam.value.y + by * zoom.value}
})

function boardScreen(bx: number, by: number) {
  return {x: Math.round(cam.value.x + bx * zoom.value), y: Math.round(cam.value.y + by * zoom.value)}
}

function boardDotRect(b: any): { x: number; y: number; w: number; h: number } | null {
  const bw = b.data.width * zoom.value;
  if (bw < 44) return null;
  const {x: sx, y: sy} = boardScreen(b.x, b.y);
  return {x: sx + bw - DOT_W, y: sy - DOT_H - 2, w: DOT_W, h: DOT_H};
}

function boardDotHitRect(b: any): { x: number; y: number; w: number; h: number } | null {
  const r = boardDotRect(b);
  if (!r || !coarsePointer.value) return r;
  const padX = 16, padY = 20;
  return {x: r.x - padX, y: r.y - padY, w: r.w + padX, h: r.h + padY};
}

function boardDotAt(e: MouseEvent | TouchEvent): any {
  if (!showBoardChrome.value) return null;
  const {x: clientX, y: clientY} = getClientPos(e);
  const rect = canvas.value!.getBoundingClientRect();
  const px = clientX - rect.left, py = clientY - rect.top;
  for (let i = store.boards.length - 1; i >= 0; i--) {
    const b = store.boards[i]!;
    const r = boardDotHitRect(b);
    if (r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return b;
  }
  return null;
}

function openBoardMenu(id: string, clientX: number, clientY: number) {
  const x = typeof window !== 'undefined' ? Math.min(clientX, window.innerWidth - 190) : clientX;
  const y = typeof window !== 'undefined' ? Math.min(clientY, window.innerHeight - 90) : clientY;
  boardMenu.value = {id, x, y};
}

function closeBoardMenu() { boardMenu.value = null; }

function onContextMenu(e: MouseEvent) {
  const b = boardAt(e) || boardChromeAt(e);
  if (!b) return;
  e.preventDefault();
  openBoardMenu(b.id, e.clientX, e.clientY);
}

function hideBoard(id: string) {
  closeBoardMenu();
  if (store.boards.length <= 1) {
    toast.info("Can't hide the only board");
    return;
  }
  const b = store.boards.find(x => x.id === id);
  store.removeBoard(id);
  toast.success(`Hid “${b?.data?.name || 'board'}” — reopen it from File → Load art`);
}

const isResizingBoard = ref(false);
const resizeMode = ref<'' | 'e' | 's' | 'se'>('');
const HANDLE_HIT = 11;

function activeBoardRect(): { sx: number; sy: number; bw: number; bh: number } | null {
  const b = activeBoard.value;
  if (!b) return null;
  const z = zoom.value;
  const {x: sx, y: sy} = boardScreen(b.x, b.y);
  return {sx, sy, bw: b.data.width * z, bh: b.data.height * z};
}

function handleAt(e: MouseEvent | TouchEvent): '' | 'e' | 's' | 'se' {
  const r = activeBoardRect();
  if (!r || r.bw < 36 || r.bh < 36) return '';
  const {x: clientX, y: clientY} = getClientPos(e);
  const rect = canvas.value!.getBoundingClientRect();
  const px = clientX - rect.left, py = clientY - rect.top;
  const near = (hx: number, hy: number) => Math.abs(px - hx) <= HANDLE_HIT && Math.abs(py - hy) <= HANDLE_HIT;
  if (near(r.sx + r.bw, r.sy + r.bh)) return 'se';
  if (near(r.sx + r.bw, r.sy + r.bh / 2)) return 'e';
  if (near(r.sx + r.bw / 2, r.sy + r.bh)) return 's';
  return '';
}

function doResizeBoard(e: MouseEvent | TouchEvent) {
  const b = activeBoard.value;
  if (!b) return;
  const {x: clientX, y: clientY} = getClientPos(e);
  const rect = canvas.value!.getBoundingClientRect();
  const worldX = (clientX - rect.left - cam.value.x) / zoom.value;
  const worldY = (clientY - rect.top - cam.value.y) / zoom.value;
  let w = editorData.value.width;
  let h = editorData.value.height;
  if (resizeMode.value === 'e' || resizeMode.value === 'se') w = Math.round(worldX - b.x);
  if (resizeMode.value === 's' || resizeMode.value === 'se') h = Math.round(worldY - b.y);
  w = Math.max(1, Math.min(256, w));
  h = Math.max(1, Math.min(256, h));
  if (w !== editorData.value.width || h !== editorData.value.height) {
    editorData.value.width = w;
    editorData.value.height = h;
    scheduleDraw();
    scheduleMiniMap();
  }
}

let resizeStartSize = {w: 0, h: 0};

function endResizeFromWindow() {
  window.removeEventListener('mousemove', doResizeBoard);
  stopResizeBoard();
}

function stopResizeBoard() {
  const active = isResizingBoard.value;
  isResizingBoard.value = false;
  resizeMode.value = '';
  window.removeEventListener('mousemove', doResizeBoard);
  if (active && (editorData.value.width !== resizeStartSize.w || editorData.value.height !== resizeStartSize.h)) {
    store.resize({width: editorData.value.width, height: editorData.value.height});
  }
}

function boardAt(e: MouseEvent | TouchEvent): any {
  const {x: clientX, y: clientY} = getClientPos(e);
  const rect = canvas.value!.getBoundingClientRect();
  const wx = (clientX - rect.left - cam.value.x) / zoom.value;
  const wy = (clientY - rect.top - cam.value.y) / zoom.value;
  for (let i = store.boards.length - 1; i >= 0; i--) {
    const b = store.boards[i]!;
    if (wx >= b.x && wx < b.x + b.data.width && wy >= b.y && wy < b.y + b.data.height) return b;
  }
  return null;
}

function boardChromeAt(e: MouseEvent | TouchEvent): any {
  const {x: clientX, y: clientY} = getClientPos(e);
  const rect = canvas.value!.getBoundingClientRect();
  const px = clientX - rect.left, py = clientY - rect.top;
  for (let i = store.boards.length - 1; i >= 0; i--) {
    const b = store.boards[i]!;
    const {x: sx, y: sy} = boardScreen(b.x, b.y);
    const bw = b.data.width * zoom.value, bh = b.data.height * zoom.value;
    if (px >= sx - 6 && px <= sx + bw + 6 && py >= sy - 20 && py <= sy + bh + 6) return b;
  }
  return null;
}

const isMovingBoard = ref(false);
const moveBoardId = ref('');
const boardMoveStart = ref({mx: 0, my: 0, bx: 0, by: 0});
let boardDidMove = false;

const isMarquee = ref(false);
const marqueeStart = ref({x: 0, y: 0});
const marqueeCur = ref({x: 0, y: 0});
const MARQUEE_MIN = 3;

function worldPos(e: MouseEvent | TouchEvent): { x: number, y: number } {
  const {x: clientX, y: clientY} = getClientPos(e);
  const rect = canvas.value!.getBoundingClientRect();
  return {
    x: (clientX - rect.left - cam.value.x) / zoom.value,
    y: (clientY - rect.top - cam.value.y) / zoom.value,
  };
}

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

function toggleSelect() {
  if (store.currentTool === 'select' && store.selectionState.bounds.active) {
    store.selectionState.bounds.active = false;
    scheduleDraw();
  } else {
    store.setTool('select')
  }
}

function centerView() {
  const b = activeBoard.value;
  const bx = b ? b.x : 0;
  const by = b ? b.y : 0;
  const w = editorData.value.width;
  const h = editorData.value.height;
  const pad = 40;
  const zx = (stageW.value - pad) / w;
  const zy = (stageH.value - pad) / h;
  let z = Math.min(zx, zy);
  z = z >= 1 ? Math.floor(z) : z;
  z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  if (!isFinite(z) || z <= 0) z = 1;
  zoom.value = z;
  cam.value = {
    x: Math.round((stageW.value - w * z) / 2 - bx * z),
    y: Math.round((stageH.value - h * z) / 2 - by * z),
  };
}

function focusActiveBoard() {
  const b = activeBoard.value;
  if (!b) return;
  const w = b.data.width;
  const h = b.data.height;
  const z = zoom.value;
  cam.value = {
    x: Math.round((stageW.value - w * z) / 2 - b.x * z),
    y: Math.round((stageH.value - h * z) / 2 - b.y * z),
  };
  scheduleDraw();
  scheduleMiniMap();
}

function fitAllBoards() {
  const bs = store.boards;
  if (bs.length <= 1) { centerView(); scheduleDraw(); scheduleMiniMap(); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of bs) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.data.width);
    maxY = Math.max(maxY, b.y + b.data.height);
  }
  const wWorld = maxX - minX;
  const hWorld = maxY - minY;
  const pad = 64;
  let z = Math.min((stageW.value - pad) / wWorld, (stageH.value - pad) / hWorld);
  z = z >= 1 ? Math.floor(z) : z;
  z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  if (!isFinite(z) || z <= 0) z = 1;
  zoom.value = z;
  const cxWorld = (minX + maxX) / 2, cyWorld = (minY + maxY) / 2;
  cam.value = {
    x: Math.round(stageW.value / 2 - cxWorld * z),
    y: Math.round(stageH.value / 2 - cyWorld * z),
  };
  scheduleDraw();
  scheduleMiniMap();
}

function onAddBoard(size: number) {
  store.addBoard(size, size);
  fitAllBoards();
}

const showImportModal = ref(false);
const importPicked = ref<File[]>([]);
const importProcess = ref<'filter' | 'original'>('filter');
const importDest = ref<'boards' | 'frames' | 'replace'>('boards');
const importBusy = ref(false);

function onImportFiles() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,image/*';
  input.multiple = true;
  input.onchange = (e) => {
    const files = Array.from((e.target as HTMLInputElement).files || []);
    if (!files.length) return;
    importPicked.value = files;
    importProcess.value = 'filter';
    importDest.value = files.length === 1 ? 'replace' : 'boards';
    showImportModal.value = true;
  };
  input.click();
}

async function confirmImport() {
  if (importBusy.value) return;
  importBusy.value = true;
  try {
    const dest = importDest.value;
    const res = await store.importFiles(importPicked.value, {process: importProcess.value, dest});
    showImportModal.value = false;
    importPicked.value = [];
    if (res.added) {
      if (dest === 'boards' && store.boards.length > 1) fitAllBoards();
      toast.success(
          dest === 'frames'
              ? `Imported ${res.added} frame${res.added > 1 ? 's' : ''}`
              : `Imported ${res.added} file${res.added > 1 ? 's' : ''}`
          + (res.skipped ? ` · ${res.skipped} skipped` : ''),
      );
    } else {
      toast.error(res.skipped ? `Nothing imported — ${res.skipped} file${res.skipped > 1 ? 's' : ''} skipped` : 'Nothing could be imported');
    }
  } finally {
    importBusy.value = false;
  }
}

function updateCanvasSize() {
  const el = canvas.value;
  if (!el) return;
  const box = el.parentElement;
  const w = box?.clientWidth || EDITOR_SIZE.value;
  const h = box?.clientHeight || w;
  dpr = Math.max(1, Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
  stageW.value = w;
  stageH.value = h;
  el.width = Math.round(w * dpr);
  el.height = Math.round(h * dpr);
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function setZoomAnchored(newZoom: number, ax: number, ay: number) {
  const nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  const f = nz / zoom.value;
  cam.value = {
    x: ax - (ax - cam.value.x) * f,
    y: ay - (ay - cam.value.y) * f,
  };
  zoom.value = nz;
  scheduleMiniMap();
  scheduleDraw();
}

function zoomBy(factor: number) {
  let nz = zoom.value * factor;
  nz = nz >= 1 ? Math.max(1, Math.round(nz)) : nz;
  setZoomAnchored(nz, stageW.value / 2, stageH.value / 2);
}

function zoomIn() { zoomBy(1.5); }
function zoomOut() { zoomBy(1 / 1.5); }
function zoomTo100() { setZoomAnchored(1, stageW.value / 2, stageH.value / 2); }

const isMacUA = ref(false);
const modK = computed(() => isMacUA.value ? '⌘' : 'Ctrl+');
const shiftK = computed(() => isMacUA.value ? '⇧' : 'Shift+');

const FS_KEY = 'editor_fullscreen';
const editorRoot = ref<HTMLElement | null>(null);
const fsMode = ref<'off' | 'os' | 'window'>('off');
if (typeof window !== 'undefined') {
  try { const v = localStorage.getItem(FS_KEY); if (v && v !== 'off') fsMode.value = 'window'; } catch { /* ignore */ }
}
const isFullscreen = computed(() => fsMode.value !== 'off');

const editorBoot = useEditorBoot();
const fsBootAt = typeof performance !== 'undefined' ? performance.now() : 0;
const FS_BOOT_MIN_MS = 400;

watch(isFullscreen, (v) => {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('editor-fullscreen', v);
}, {immediate: true});

function enterOsFullscreen() {
  const el = editorRoot.value;
  if (el?.requestFullscreen) {
    el.requestFullscreen().catch(() => { fsMode.value = 'window'; });
  }
  fsMode.value = 'os';
}

function enterWindowFullscreen() {
  fsMode.value = 'window';
}

function exitFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen();
  } else {
    fsMode.value = 'off';
  }
}

function onFsChange() {
  if (!document.fullscreenElement && fsMode.value === 'os') fsMode.value = 'off';
}

const hasPreviousScreen = ref(false);
function goBack() {
  if (hasPreviousScreen.value) router.back();
  else router.push('/');
}

watch(fsMode, (m) => {
  try { localStorage.setItem(FS_KEY, m); } catch { /* quota */ }
});

function onDblClick(e: any) {
  const hit = boardAt(e);
  if (!hit) return;
  if (hit.id !== store.activeBoardId) store.setActiveBoard(hit.id);
  store.activateLayer(0);
}

function startDraw(e: any) {
  if (spacePressed.value) return;
  if ('button' in e && e.button !== 0) return;
  const dotBoard = boardDotAt(e);
  if (dotBoard) {
    const {x, y} = getClientPos(e);
    openBoardMenu(dotBoard.id, x, y);
    if ('preventDefault' in e) e.preventDefault();
    return;
  }
  const hmode = handleAt(e);
  if (hmode) {
    isResizingBoard.value = true;
    resizeMode.value = hmode;
    resizeStartSize = {w: editorData.value.width, h: editorData.value.height};
    window.addEventListener('mousemove', doResizeBoard);
    window.addEventListener('mouseup', endResizeFromWindow, {once: true});
    if ('preventDefault' in e) e.preventDefault();
    return;
  }
  const ghit = guideAt(e);
  if (ghit) {
    draggingGuide.value = ghit;
    window.addEventListener('mousemove', doGuideDrag);
    window.addEventListener('mouseup', endGuideDrag, {once: true});
    if ('preventDefault' in e) e.preventDefault();
    return;
  }
  const hit = boardAt(e);
  if (!hit) {
    const chrome = boardChromeAt(e);
    if (chrome) {
      isMovingBoard.value = true;
      moveBoardId.value = chrome.id;
      const w = worldPos(e);
      boardMoveStart.value = {mx: w.x, my: w.y, bx: chrome.x, by: chrome.y};
      boardDidMove = false;
      isStarted.value = true;
      if ('preventDefault' in e) e.preventDefault();
      return;
    }
    isMarquee.value = true;
    marqueeStart.value = worldPos(e);
    marqueeCur.value = {...marqueeStart.value};
    isStarted.value = true;
    if ('preventDefault' in e) e.preventDefault();
    return;
  }
  if (hit.id !== store.activeBoardId) {
    store.setActiveBoard(hit.id);
    return;
  }
  const {x, y} = getPixelPos(e);
  if (store.currentTool === 'picker') {
    const ci = store.colorIndexAt(x, y);
    if (ci >= 0) {
      store.currentColorIndex = ci;
      store.pickedColorIndex = ci;
    }
    return;
  }
  let resetSelection = false
  if (store.selectionState.bounds.active && store.currentTool == 'select') {
    if (store.checkKeyInSelection(`${x}_${y}`)) {
      isMoving.value = true;
      store.immigrateVirtualLayer();
      const cp = getClientPos(e);
      moveStart.value = {x: cp.x, y: cp.y};
      scheduleDraw();
      isStarted.value = true;
      return;
    }
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
    case "move": {
      if (store.activeScope === 'board') {
        const b = store.boards.find(bb => bb.id === store.activeBoardId);
        isMovingBoard.value = true;
        moveBoardId.value = store.activeBoardId;
        const w = worldPos(e);
        boardMoveStart.value = {mx: w.x, my: w.y, bx: b?.x ?? 0, by: b?.y ?? 0};
        boardDidMove = false;
        isStarted.value = true;
        break;
      }
      if (store.activeScope === 'selection' && !store.checkKeyInSelection(`${x}_${y}`)) break;
      isMoving.value = true;
      store.immigrateVirtualLayer();
      const cp = getClientPos(e);
      moveStart.value = {x: cp.x, y: cp.y};
      break;
    }
    case "bucket":
      const rootColorIndex = editorData.value.layers[store.currentLayerIndex]!.pixels[`${x}_${y}`] ?? -1;
      store.bucketFill(x, y, rootColorIndex);
      break;
    case "iso-line":
      isIsoLining.value = true;
      isoLineStart.value = getPixelPos(e);
      store.beginVirtualOverlay();
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
      if (!isPanning.value) store.paint(getPixelPos(e));
      break;
  }
  if (store.currentTool !== 'select') {
    needSave.value = true;
  }
  scheduleDraw();
  isStarted.value = true;
}

function draw(e: any) {
  if (isResizingBoard.value) {
    if ('touches' in e) e.preventDefault();
    doResizeBoard(e);
    return;
  }
  if (isMarquee.value) {
    if ('touches' in e) e.preventDefault();
    marqueeCur.value = worldPos(e);
    scheduleDraw();
    return;
  }
  if (isMovingBoard.value) {
    if ('touches' in e) e.preventDefault();
    const w = worldPos(e);
    const dx = Math.round(w.x - boardMoveStart.value.mx);
    const dy = Math.round(w.y - boardMoveStart.value.my);
    if (dx !== 0 || dy !== 0) boardDidMove = true;
    store.moveBoard(moveBoardId.value, boardMoveStart.value.bx + dx, boardMoveStart.value.by + dy);
    scheduleDraw();
    return;
  }
  if (!isStarted.value && !draggingGuide.value) {
    const gh = guideAt(e);
    const prev = hoverGuide.value;
    if ((gh?.axis !== prev?.axis) || (gh?.index !== prev?.index)) hoverGuide.value = gh;
  }
  const pos = getPixelPos(e);
  const inBounds = pos.x >= 0 && pos.x < editorData.value.width && pos.y >= 0 && pos.y < editorData.value.height
  if (inBounds) {
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
    const {x, y} = pos;
    if (x >= 0 && x < editorData.value.width && y >= 0 && y < editorData.value.height) {
      store.selectionState.current = {x, y};
    }
  } else if (isMoving.value) {
    const {x: clientX, y: clientY} = getClientPos(e);
    const dx = Math.round((clientX - moveStart.value.x) / zoom.value);
    const dy = Math.round((clientY - moveStart.value.y) / zoom.value);
    if (dx !== 0 || dy !== 0) {
      needSave.value = true;
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
    const cell = editorData.value.meta?.iso?.cell ?? { width: 2, height: 1 };
    store.paintIsoLine(
        isoLineStart.value,
        pos,
        cell.width,
        cell.height,
        store.currentColorIndex,
    );
  } else if (isDrawing.value) {
    if (!isPanning.value && store.currentTool !== 'bucket') store.paint(pos);
  }
  scheduleDraw();
}

function stopDraw() {
  if (isResizingBoard.value) {
    stopResizeBoard();
    isStarted.value = false;
    return;
  }
  if (isMarquee.value) {
    isMarquee.value = false;
    isStarted.value = false;
    const x0 = Math.min(marqueeStart.value.x, marqueeCur.value.x);
    const y0 = Math.min(marqueeStart.value.y, marqueeCur.value.y);
    const w = Math.abs(marqueeCur.value.x - marqueeStart.value.x);
    const h = Math.abs(marqueeCur.value.y - marqueeStart.value.y);
    if (w >= MARQUEE_MIN && h >= MARQUEE_MIN) {
      store.addBoard(Math.round(w), Math.round(h), {x: Math.round(x0), y: Math.round(y0)});
    } else {
      store.layerActive = false;
      if (store.selectionState.bounds.active) {
        store.selectionState.bounds.active = false;
        store.selectionState.selecting = false;
      }
    }
    cancelScheduledDraw();
    drawEditor();
    drawMiniMap();
    return;
  }
  if (isMovingBoard.value) {
    isMovingBoard.value = false;
    isStarted.value = false;
    needSave.value = false;
    const id = moveBoardId.value;
    moveBoardId.value = '';
    if (boardDidMove) {
      store.saveWorkspaceLayout();
    } else if (id !== store.activeBoardId) {
      store.setActiveBoard(id);
    } else {
      store.layerActive = false;
    }
    cancelScheduledDraw();
    drawEditor();
    drawMiniMap();
    return;
  }
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
  drawMiniMap();
  isStarted.value = false;
}

function leaveCanvas() {
  if (isResizingBoard.value) {
    if (hoverPos.value) { hoverPos.value = null; scheduleDraw(); }
    return;
  }
  stopDraw();
  if (hoverPos.value) {
    hoverPos.value = null;
    scheduleDraw();
  }
}

function startPan(e: any) {
  if (spacePressed.value) {
    isPanning.value = true;
    panStart.value = getClientPos(e);
    e.preventDefault();
  }
}

function pan(e: any) {
  if ('touches' in e) e.preventDefault();
  if (isPanning.value) {
    const {x: clientX, y: clientY} = getClientPos(e);
    const dx = clientX - panStart.value.x;
    const dy = clientY - panStart.value.y;
    cam.value = {x: cam.value.x + dx, y: cam.value.y + dy};
    panStart.value = {x: clientX, y: clientY};
    scheduleMiniMap();
    scheduleDraw();
  }
}

function stopPan() {
  isPanning.value = false;
}

function onWheel(e: WheelEvent) {
  if (!canvas.value) return;
  e.preventDefault();
  const rect = canvas.value.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) {
    const ax = e.clientX - rect.left;
    const ay = e.clientY - rect.top;
    setZoomAnchored(zoom.value * Math.exp(-e.deltaY * 0.0015), ax, ay);
  } else {
    cam.value = {x: cam.value.x - e.deltaX, y: cam.value.y - e.deltaY};
    scheduleMiniMap();
    scheduleDraw();
  }
}

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
    const t1 = e.touches[0]!;
    const t2 = e.touches[1]!;
    const newDistance = Math.sqrt((t1.clientX - t2.clientX) ** 2 + (t1.clientY - t2.clientY) ** 2);
    if (initialDistance.value < 1) return;
    const ratio = newDistance / initialDistance.value;
    const rect = canvas.value!.getBoundingClientRect();
    const ax = (t1.clientX + t2.clientX) / 2 - rect.left;
    const ay = (t1.clientY + t2.clientY) / 2 - rect.top;
    setZoomAnchored(initialZoom.value * ratio, ax, ay);
    e.preventDefault();
  }
}

function stopPinch() {
  isPinching.value = false;
}

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

const TOOL_KEYS: Record<string, string> = {
  b: 'brush', l: 'iso-line', g: 'bucket', v: 'move', m: 'select',
};

function handleKeyDown(e: any) {
  const activeElement = document.activeElement;
  const isInputActive = activeElement?.tagName === 'INPUT' ||
      activeElement?.tagName === 'TEXTAREA' ||
      activeElement?.hasAttribute('contenteditable');

  if (isInputActive) return;

  if (e.key === 'Escape' && fsMode.value === 'window') {
    fsMode.value = 'off';
    e.preventDefault();
    return;
  }

  if (e.code === 'Space') {
    spacePressed.value = true;
    e.preventDefault();
    return;
  }

  const mod = e.ctrlKey || e.metaKey;
  const key = (e.key || '').toLowerCase();

  if (isStarted.value && (mod || TOOL_KEYS[key] || key === 'e' || key === ',' || key === '.' || e.key === 'Backspace' || e.key === 'Delete')) {
    e.preventDefault();
    return;
  }

  if (mod && key === 'z') {
    e.shiftKey ? doRedo() : doUndo();
    e.preventDefault();
  } else if (mod && key === 'y') {
    doRedo();
    e.preventDefault();
  } else if (mod && key === 'c' && !e.shiftKey && !e.altKey) {
    onCopy();
    e.preventDefault();
  } else if (mod && key === 'v' && !e.shiftKey && !e.altKey) {
    onPaste();
    e.preventDefault();
  } else if (mod && (key === '=' || key === '+')) {
    zoomIn();
    e.preventDefault();
  } else if (mod && key === '-') {
    zoomOut();
    e.preventDefault();
  } else if (!mod && !e.altKey && TOOL_KEYS[key] && !e.repeat) {
    if (key === 'm') toggleSelect();
    else store.setTool(TOOL_KEYS[key]!);
    e.preventDefault();
  } else if (!mod && !e.altKey && key === 'e' && !e.repeat) {
    store.currentColorIndex = -1;
    e.preventDefault();
  } else if (!mod && !e.altKey && key >= '1' && key <= '5'
      && (store.currentTool === 'brush' || store.currentTool === 'eraser')) {
    store.setBrushSize(Number(key));
    e.preventDefault();
  } else if (!mod && !e.altKey && (key === ',' || key === '.') && store.isAnimated) {
    store.isPlaying = false;
    store.setActiveFrame(Math.max(0, store.currentFrameIndex) + (key === ',' ? -1 : 1));
    e.preventDefault();
  } else if (!mod && (e.key === 'Backspace' || e.key === 'Delete')) {
    if (store.activeScope === 'board' && store.boards.length > 1) {
      hideBoard(store.activeBoardId);
    } else {
      store.clearCurrentLayer();
    }
    e.preventDefault();
  }
  // Anything else (Cmd+R, Cmd+F, Cmd+S, …) is left to the browser.
}

function flushOnHide() {
  if (camSaveTimer) { clearTimeout(camSaveTimer); camSaveTimer = null; }
  try { localStorage.setItem('workspace_camera', JSON.stringify({x: cam.value.x, y: cam.value.y, z: zoom.value})); } catch { /* quota */ }
  store.flush();
}

function onVisibilityChange() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flushOnHide();
}

function onWindowBlur() {
  spacePressed.value = false;
}

function setupKeyListeners() {
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('blur', onWindowBlur);
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', flushOnHide);
}

function clearListeners() {
  window.removeEventListener('keyup', handleKeyUp);
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('blur', onWindowBlur);
  document.removeEventListener('fullscreenchange', onFsChange);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('pagehide', flushOnHide);
}

const EDITOR_BG = '#1a1a1a';
const EDITOR_CELL_A = '#ffffff';
const EDITOR_CELL_B = '#cccccc';
const EDITOR_ART_BG_SOLID = '#ffffff';

function renderBackgroundCache(): HTMLCanvasElement | null {
  const w = editorData.value.width;
  const h = editorData.value.height;
  const mode = editorData.value.meta?.iso?.mode ?? 'square';
  const bg = store.bgConfig;
  const bgUrl = bg.type === 'art' && bgImage.value ? bgImageUrlCache : '';
  const showShared = store.sharedLayers.length > 0 && !store.editingShared;

  const key = `${w}_${h}|${mode}|${bg.type}|${bg.color}|${bgUrl}|ck${checkerSize.value}_${checkerA.value}_${checkerB.value}|sh${showShared ? store.sharedRev : 'x'}`;
  if (key === bgCacheKey && bgCanvas) return bgCanvas;

  if (!bgCanvas) {
    bgCanvas = document.createElement('canvas');
    bgCtx = bgCanvas.getContext('2d');
  }
  if (!bgCtx) return null;
  if (bgCanvas.width !== w || bgCanvas.height !== h) {
    bgCanvas.width = w;
    bgCanvas.height = h;
  }
  const c = bgCtx;
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, w, h);

  if (bg.type === 'solid') {
    c.fillStyle = bg.color;
    c.fillRect(0, 0, w, h);
  } else if (bg.type === 'art' && bgImage.value) {
    c.drawImage(bgImage.value, 0, 0, w, h);
  } else if (bg.type === 'transparent') {
    // no fill, no checker — the desk shows through, so only the art reads
  } else if (mode === 'square') {
    const cs = Math.max(1, checkerSize.value);
    const ca = checkerA.value || EDITOR_CELL_A;
    const cb = checkerB.value || EDITOR_CELL_B;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        c.fillStyle = (Math.floor(x / cs) + Math.floor(y / cs)) % 2 === 0 ? ca : cb;
        c.fillRect(x, y, 1, 1);
      }
    }
  } else {
    c.fillStyle = EDITOR_ART_BG_SOLID;
    c.fillRect(0, 0, w, h);
  }

  if (showShared) {
    if (!sharedBgCanvas) sharedBgCanvas = document.createElement('canvas');
    compositeFrame(sharedBgCanvas, toRaw(store.sharedLayers), w, h, toRaw(editorData.value.colors));
    c.imageSmoothingEnabled = false;
    c.drawImage(sharedBgCanvas, 0, 0, w, h, 0, 0, w, h);
  }

  bgCacheKey = key;
  return bgCanvas;
}

function drawDesk(): void {
  if (!ctx) return;
  const sw = stageW.value, sh = stageH.value;
  ctx.clearRect(0, 0, sw, sh);
  ctx.fillStyle = deskBg.value || EDITOR_BG;
  ctx.fillRect(0, 0, sw, sh);
  if (!deskGrid.value) return;
  const color = deskGridColorEff();
  if (deskGridShape.value === 'iso') { drawDeskGridIso(sw, sh, color); return; }
  let cw = Math.max(1, deskGridCell.value.width), ch = Math.max(1, deskGridCell.value.height);
  let sx = cw * zoom.value, sy = ch * zoom.value;
  while (sx > 0 && sx < 6) { cw *= 2; sx = cw * zoom.value; }
  while (sy > 0 && sy < 6) { ch *= 2; sy = ch * zoom.value; }
  if (!isFinite(sx) || !isFinite(sy) || sx < 4 || sy < 4) return;
  const baseX = Math.round(cam.value.x);
  const baseY = Math.round(cam.value.y);
  const ox = ((baseX % sx) + sx) % sx;
  const oy = ((baseY % sy) + sy) % sy;
  if (deskGridStyle.value === 'dots') {
    ctx.fillStyle = color;
    for (let x = ox; x <= sw; x += sx) {
      for (let y = oy; y <= sh; y += sy) {
        ctx.fillRect(Math.round(x) - 0.5, Math.round(y) - 0.5, 1.5, 1.5);
      }
    }
    return;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(deskGridStyle.value === 'dashed' ? [3, 4] : []);
  ctx.beginPath();
  for (let x = ox; x <= sw; x += sx) {
    const px = Math.round(x) + 0.5;
    ctx.moveTo(px, 0); ctx.lineTo(px, sh);
  }
  for (let y = oy; y <= sh; y += sy) {
    const py = Math.round(y) + 0.5;
    ctx.moveTo(0, py); ctx.lineTo(sw, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawDeskGridIso(sw: number, sh: number, color: string): void {
  if (!ctx) return;
  let cw = Math.max(1, deskGridCell.value.width), ch = Math.max(1, deskGridCell.value.height);
  let W = cw * zoom.value, H = ch * zoom.value;
  while (W > 0 && (W < 8 || H < 6)) { cw *= 2; ch *= 2; W = cw * zoom.value; H = ch * zoom.value; }
  if (!isFinite(W) || !isFinite(H) || W < 6 || H < 4) return;
  const m = H / W;
  const cx = cam.value.x, cy = cam.value.y;
  if (deskGridStyle.value === 'dots') {
    ctx.fillStyle = color;
    const hx = W / 2, hy = H / 2;
    const p0 = Math.floor(-cx / hx) - 1, p1 = Math.ceil((sw - cx) / hx) + 1;
    const q0 = Math.floor(-cy / hy) - 1, q1 = Math.ceil((sh - cy) / hy) + 1;
    for (let p = p0; p <= p1; p++) {
      for (let q = q0; q <= q1; q++) {
        if (((p + q) & 1) !== 0) continue;
        ctx.fillRect(Math.round(cx + p * hx) - 0.5, Math.round(cy + q * hy) - 0.5, 1.5, 1.5);
      }
    }
    return;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(deskGridStyle.value === 'dashed' ? [3, 4] : []);
  ctx.beginPath();
  const b0 = cy - m * cx;
  for (let b = b0 + Math.ceil((-m * sw - b0) / H) * H; b <= sh; b += H) {
    ctx.moveTo(0, Math.round(b) + 0.5);
    ctx.lineTo(sw, Math.round(m * sw + b) + 0.5);
  }
  const c0 = cy + m * cx;
  for (let c = c0 + Math.ceil((-c0) / H) * H; c <= sh + m * sw; c += H) {
    ctx.moveTo(0, Math.round(c) + 0.5);
    ctx.lineTo(sw, Math.round(-m * sw + c) + 0.5);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawSheet(sx: number, sy: number, bw: number, bh: number): void {
  if (!ctx) return;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sx, sy, bw, bh);
  ctx.restore();
}

function drawBackground(): void {
  if (!ctx) return;
  const w = editorData.value.width;
  const h = editorData.value.height;
  const z = zoom.value;
  const ox = Math.round(artOffset.value.x);
  const oy = Math.round(artOffset.value.y);
  if (store.bgConfig.type !== 'transparent') drawSheet(ox, oy, w * z, h * z);
  const bg = renderBackgroundCache();
  if (bg) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0, w, h, ox, oy, w * z, h * z);
  }
}

const boardBuffers = new Map<string, HTMLCanvasElement>();
let boardBufRev = -1;
function boardComposite(b: any): HTMLCanvasElement | null {
  if (store.boardsRev !== boardBufRev) { boardBuffers.clear(); boardBufRev = store.boardsRev; }
  const existing = boardBuffers.get(b.id);
  if (existing) return existing;
  const data = toRaw(b.data);
  const w = data.width, h = data.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d');
  if (!cx) return null;
  cx.imageSmoothingEnabled = false;
  const bg = data.meta?.bg;
  const mode = data.meta?.iso?.mode ?? 'square';
  if (bg?.type === 'solid') {
    cx.fillStyle = bg.color; cx.fillRect(0, 0, w, h);
  } else if (bg?.type === 'transparent') {
    // no fill, no checker — art only
  } else if (mode === 'square') {
    const cs = Math.max(1, checkerSize.value);
    const ca = checkerA.value || EDITOR_CELL_A;
    const cb = checkerB.value || EDITOR_CELL_B;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        cx.fillStyle = (Math.floor(x / cs) + Math.floor(y / cs)) % 2 === 0 ? ca : cb;
        cx.fillRect(x, y, 1, 1);
      }
  } else {
    cx.fillStyle = EDITOR_ART_BG_SOLID; cx.fillRect(0, 0, w, h);
  }
  const scratch = document.createElement('canvas');
  compositeFrame(scratch, toRaw(data.layers), w, h, toRaw(data.colors));
  cx.drawImage(scratch, 0, 0);
  boardBuffers.set(b.id, c);
  return c;
}

function drawInactiveBoards(): void {
  if (!ctx) return;
  const z = zoom.value;
  for (const b of store.boards) {
    if (b.id === store.activeBoardId) continue;
    const w = b.data.width, h = b.data.height;
    const {x: sx, y: sy} = boardScreen(b.x, b.y);
    if (b.data.meta?.bg?.type !== 'transparent') drawSheet(sx, sy, w * z, h * z);
    const comp = boardComposite(b);
    if (comp) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(comp, 0, 0, w, h, sx, sy, w * z, h * z);
    }
    drawBoardIsoOverlay(b.data, sx, sy);
  }
}

function drawBoardIsoOverlay(data: any, sx: number, sy: number): void {
  if (!ctx) return;
  const iso = data?.meta?.iso;
  if (!iso || iso.mode !== 'iso') return;
  const w = data.width, h = data.height;
  const cell = iso.cell ?? {width: 2, height: 1};
  if (cell.width * zoom.value < ISO_MIN_CELL_PX) return;
  const bw = w * zoom.value, bh = h * zoom.value;
  if (sx + bw < 0 || sy + bh < 0 || sx > stageW.value || sy > stageH.value) return;
  const path = new Path2D();
  buildIsoPath(path, zoom.value, w, h, cell.width, cell.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, sy, w * zoom.value, h * zoom.value);
  ctx.clip();
  ctx.translate(sx, sy);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 1;
  ctx.stroke(path);
  ctx.restore();
}

function drawBoardChrome(): void {
  if (!ctx) return;
  const z = zoom.value;
  for (const b of store.boards) {
    const w = b.data.width, h = b.data.height;
    const {x: sx, y: sy} = boardScreen(b.x, b.y);
    const bw = w * z, bh = h * z;
    const active = b.id === store.activeBoardId;
    if (b.data.meta?.bg?.type !== 'transparent') {
      ctx.strokeStyle = active ? BOARD_ACTIVE : 'rgba(0,0,0,0.35)';
      ctx.lineWidth = active ? 2 : 1;
      const inset = active ? 1 : 0.5;
      ctx.strokeRect(sx + inset, sy + inset, bw - inset * 2, bh - inset * 2);
    }
    if (showBoardChrome.value) {
      ctx.font = '600 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = active ? BOARD_ACTIVE : 'rgba(120,120,132,0.95)';
      ctx.textBaseline = 'bottom';
      const label = `${b.data.name || 'Untitled'}  ${w}×${h}`;
      ctx.fillText(label, sx, sy - 5);

      const dr = boardDotRect(b);
      if (dr) {
        const cx = dr.x + dr.w / 2, cy = dr.y + dr.h / 2;
        ctx.fillStyle = active ? BOARD_ACTIVE : 'rgba(120,120,132,0.95)';
        for (const dx of [-4, 0, 4]) {
          ctx.beginPath();
          ctx.arc(cx + dx, cy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (active && bw >= 36 && bh >= 36) {
      const hs = 7;
      const dot = (hx: number, hy: number) => {
        ctx!.fillStyle = '#ffffff';
        ctx!.strokeStyle = BOARD_ACTIVE;
        ctx!.lineWidth = 1.5;
        ctx!.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        ctx!.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
      };
      dot(sx + bw, sy + bh);
      dot(sx + bw, sy + bh / 2);
      dot(sx + bw / 2, sy + bh);
    }
  }
}

function drawMarquee(): void {
  if (!ctx || !isMarquee.value) return;
  const z = zoom.value;
  const x0 = Math.min(marqueeStart.value.x, marqueeCur.value.x);
  const y0 = Math.min(marqueeStart.value.y, marqueeCur.value.y);
  const w = Math.abs(marqueeCur.value.x - marqueeStart.value.x);
  const h = Math.abs(marqueeCur.value.y - marqueeStart.value.y);
  const {x: sx, y: sy} = boardScreen(x0, y0);
  const sw = w * z, sh = h * z;
  ctx.save();
  ctx.fillStyle = 'rgba(79,70,229,0.10)';
  ctx.fillRect(sx, sy, sw, sh);
  ctx.strokeStyle = BOARD_ACTIVE;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(sx + 0.5, sy + 0.5, sw, sh);
  ctx.setLineDash([]);
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = BOARD_ACTIVE;
  ctx.fillText(`${Math.round(w)}×${Math.round(h)}`, sx, sy - 4);
  ctx.restore();
}

function drawPixels(): void {
  if (!ctx) return;
  const art = getArtCanvas();
  if (!art) return;
  const ox = Math.round(artOffset.value.x);
  const oy = Math.round(artOffset.value.y);
  const z = zoom.value;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art, 0, 0, artW, artH, ox, oy, artW * z, artH * z);
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
  const img = referenceImage.value;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.min((w * z) / iw, (h * z) / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.globalAlpha = referenceOpacity;
  ctx.drawImage(img, ox + (w * z - dw) / 2, oy + (h * z - dh) / 2, dw, dh);
  ctx.globalAlpha = 1;
}

function drawCustomGuides(): void {
  const g: any = editorData.value.meta?.guides;
  if (!ctx || !g || (!g.v?.length && !g.h?.length)) return;
  const z = zoom.value;
  const w = editorData.value.width, h = editorData.value.height;
  const {x: ox, y: oy} = artOffset.value;
  const bw = w * z, bh = h * z;
  if (ox + bw < 0 || oy + bh < 0 || ox > stageW.value || oy > stageH.value) return;
  const d = draggingGuide.value;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  const line = (axis: 'v' | 'h', pos: number, activeLine: boolean) => {
    ctx!.strokeStyle = activeLine ? '#F472B6' : (guideColor.value || '#38BDF8');
    ctx!.beginPath();
    if (axis === 'v') {
      const x = Math.round(ox + pos * z) + 0.5;
      ctx!.moveTo(x, oy);
      ctx!.lineTo(x, oy + bh);
    } else {
      const y = Math.round(oy + pos * z) + 0.5;
      ctx!.moveTo(ox, y);
      ctx!.lineTo(ox + bw, y);
    }
    ctx!.stroke();
  };
  (g.v || []).forEach((pos: number, i: number) => line('v', pos, d?.axis === 'v' && d.index === i));
  (g.h || []).forEach((pos: number, i: number) => line('h', pos, d?.axis === 'h' && d.index === i));
  if (d) {
    const pos = g[d.axis][d.index];
    const label = `${d.axis === 'v' ? 'x' : 'y'} = ${pos}`;
    const lx = d.axis === 'v' ? ox + pos * z + 6 : ox + 6;
    const ly = d.axis === 'h' ? oy + pos * z - 6 : oy + 14;
    ctx.font = '11px system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(lx - 3, ly - 11, tw + 6, 15);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, lx, ly);
  }
  ctx.restore();
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

  ctx.strokeStyle = isEraser ? 'rgba(239, 68, 68, 0.95)' : 'rgba(0, 0, 0, 0.7)';
  ctx.lineWidth = 1.5;
  if (isEraser) ctx.setLineDash([4, 3]);
  ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  ctx.restore();
}

let onionPrevCanvas: HTMLCanvasElement | null = null;
let onionNextCanvas: HTMLCanvasElement | null = null;

function drawOnion(): void {
  if (!ctx) return;
  if (!store.onionSkin || !store.isAnimated || (store.isPlaying && !playbackOnPreview) || isDrawing.value) return;
  const fr = store.frames;
  const cur = store.currentFrameIndex;
  const ox = Math.round(artOffset.value.x);
  const oy = Math.round(artOffset.value.y);
  const z = zoom.value;
  const w = editorData.value.width;
  const h = editorData.value.height;
  const colors = toRaw(editorData.value.colors);

  const ghost = (frame: any, scratch: HTMLCanvasElement, alpha: number, tint: string) => {
    if (!frame) return scratch;
    compositeFrame(scratch, toRaw(frame.layers), w, h, colors);
    const sctx = scratch.getContext('2d');
    if (sctx) {
      sctx.save();
      sctx.globalCompositeOperation = 'source-atop';
      sctx.fillStyle = tint;
      sctx.fillRect(0, 0, w, h);
      sctx.restore();
    }
    ctx!.save();
    ctx!.globalAlpha = alpha;
    ctx!.imageSmoothingEnabled = false;
    ctx!.drawImage(scratch, 0, 0, w, h, ox, oy, w * z, h * z);
    ctx!.restore();
    return scratch;
  };

  if (!onionPrevCanvas) onionPrevCanvas = document.createElement('canvas');
  if (!onionNextCanvas) onionNextCanvas = document.createElement('canvas');
  ghost(fr[cur - 1], onionPrevCanvas, 0.35, 'rgba(255, 70, 70, 0.45)');
  ghost(fr[cur + 1], onionNextCanvas, 0.28, 'rgba(70, 120, 255, 0.45)');
}

function drawEditor() {
  drawDesk();
  drawInactiveBoards();
  drawBackground();
  drawReference();
  drawOnion();
  drawPixels();
  drawIsoOverlay();
  drawCustomGuides();
  drawBrushPreview();
  drawSelection();
  drawBoardChrome();
  drawMarquee();
  // Minimap is decoupled — it only redraws on content/viewport change
  // (via scheduleMiniMap), not on every hover/brush-preview frame.
}

let playbackBuffers: HTMLCanvasElement[] = [];
let playbackTimer: ReturnType<typeof setTimeout> | null = null;
let playbackIndex = 0;
let playbackOnPreview = false;

function buildPlaybackBuffers() {
  const ed = toRaw(editorData.value);
  const colors = toRaw(ed.colors);
  const list = store.frames.length ? store.frames : [{layers: ed.layers}];
  const shared = playbackOnPreview ? toRaw(store.sharedLayers) : [];
  playbackBuffers = (list as any[]).map((f) => {
    const c = document.createElement('canvas');
    compositeFrame(c, [...shared, ...toRaw(f.layers)], ed.width, ed.height, colors);
    return c;
  });
}

let playbackRefreshTimer: ReturnType<typeof setTimeout> | null = null;
function refreshPlaybackBuffer() {
  if (playbackRefreshTimer) clearTimeout(playbackRefreshTimer);
  playbackRefreshTimer = setTimeout(() => {
    playbackRefreshTimer = null;
    const i = Math.max(0, store.currentFrameIndex);
    const f = store.frames[i];
    const buf = playbackBuffers[i];
    if (!f || !buf) return;
    compositeFrame(
        buf,
        [...toRaw(store.sharedLayers), ...toRaw(f.layers)],
        editorData.value.width,
        editorData.value.height,
        toRaw(editorData.value.colors),
    );
  }, 120);
}

function renderPlaybackFrame(i: number) {
  const buf = playbackBuffers[i];
  if (playbackOnPreview) {
    if (!miniMap.value || !miniMapCtx || !buf) return;
    const mmW = miniMap.value.width;
    const mmH = miniMap.value.height;
    miniMapCtx.clearRect(0, 0, mmW, mmH);
    const bg = store.bgConfig;
    if (bg.type === 'solid') {
      miniMapCtx.fillStyle = bg.color;
      miniMapCtx.fillRect(0, 0, mmW, mmH);
    } else if (bg.type === 'art' && bgImage.value) {
      miniMapCtx.drawImage(bgImage.value, 0, 0, mmW, mmH);
    }
    miniMapCtx.imageSmoothingEnabled = false;
    miniMapCtx.drawImage(buf, 0, 0, editorData.value.width, editorData.value.height, 0, 0, mmW, mmH);
    return;
  }
  if (!ctx) return;
  drawDesk();
  drawInactiveBoards();
  drawBackground();
  drawReference();
  if (buf) {
    const ox = Math.round(artOffset.value.x);
    const oy = Math.round(artOffset.value.y);
    const z = zoom.value;
    const w = editorData.value.width;
    const h = editorData.value.height;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, w, h, ox, oy, w * z, h * z);
  }
  drawIsoOverlay();
  drawBoardChrome();
}

let pingpongDir: 1 | -1 = 1;

function playbackRange(): { lo: number; hi: number; dir: 'forward' | 'reverse' | 'pingpong' } {
  const t = store.activeTag;
  if (t && t.from <= t.to && t.to < store.frameCount) return {lo: t.from, hi: t.to, dir: t.direction};
  return {lo: 0, hi: store.frameCount - 1, dir: 'forward'};
}

function playbackNext(cur: number): number | null {
  const {lo, hi, dir} = playbackRange();
  if (hi <= lo) return store.loopAnimation ? lo : null;
  if (dir === 'forward') return cur + 1 > hi ? (store.loopAnimation ? lo : null) : cur + 1;
  if (dir === 'reverse') return cur - 1 < lo ? (store.loopAnimation ? hi : null) : cur - 1;
  let next = cur + pingpongDir;
  if (next > hi) {
    pingpongDir = -1;
    next = cur - 1;
  } else if (next < lo) {
    if (!store.loopAnimation) return null;
    pingpongDir = 1;
    next = cur + 1;
  }
  return Math.max(lo, Math.min(hi, next));
}

function playbackTick() {
  const dur = store.frames[playbackIndex]?.duration ?? Math.round(1000 / store.fps);
  playbackTimer = setTimeout(() => {
    if (!store.isPlaying) return;
    const next = playbackNext(playbackIndex);
    if (next === null) { store.isPlaying = false; return; }
    playbackIndex = next;
    if (!playbackOnPreview) store.currentFrameIndex = next;
    renderPlaybackFrame(next);
    playbackTick();
  }, dur);
}

function startPlayback() {
  if (!store.isAnimated) { store.isPlaying = false; return; }
  playbackOnPreview = !!(miniMap.value && miniMap.value.clientHeight > 0);
  buildPlaybackBuffers();
  const {lo, hi, dir} = playbackRange();
  pingpongDir = 1;
  let start = store.currentFrameIndex;
  if (start < lo || start > hi) start = dir === 'reverse' ? hi : lo;
  playbackIndex = start;
  if (!playbackOnPreview) {
    cancelScheduledDraw();
    store.currentFrameIndex = start;
  }
  renderPlaybackFrame(playbackIndex);
  playbackTick();
}

function stopPlayback() {
  if (playbackTimer) clearTimeout(playbackTimer);
  playbackTimer = null;
  if (playbackRefreshTimer) { clearTimeout(playbackRefreshTimer); playbackRefreshTimer = null; }
  playbackBuffers = [];
  if (playbackOnPreview) {
    playbackOnPreview = false;
    drawMiniMap();
    return;
  }
  store.setActiveFrame(store.currentFrameIndex);
}

watch(() => store.isPlaying, (v) => {
  if (v) startPlayback();
  else stopPlayback();
});

function drawMiniMap() {
  if (!miniMap.value || !canvas.value || !miniMapCtx) return;
  if (store.isPlaying && playbackOnPreview) return;

  const mmW = miniMap.value.width;
  const mmH = miniMap.value.height;
  const artW = editorData.value.width;
  const artH = editorData.value.height;
  const cellW = mmW / artW;
  const cellH = mmH / artH;

  miniMapCtx.clearRect(0, 0, mmW, mmH);
  const bg = store.bgConfig;
  if (bg.type === 'solid') {
    miniMapCtx.fillStyle = bg.color;
    miniMapCtx.fillRect(0, 0, mmW, mmH);
  } else if (bg.type === 'art' && bgImage.value) {
    miniMapCtx.drawImage(bgImage.value, 0, 0, mmW, mmH);
  }

  const art = getArtCanvas();
  if (art) {
    miniMapCtx.imageSmoothingEnabled = false;
    miniMapCtx.drawImage(art, 0, 0, artW, artH, 0, 0, mmW, mmH);
  }

  const visiblePixelX = (0 - artOffset.value.x) / zoom.value;
  const visiblePixelY = (0 - artOffset.value.y) / zoom.value;
  const visiblePixelW = stageW.value / zoom.value;
  const visiblePixelH = stageH.value / zoom.value;

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

function sizeMiniMap() {
  if (!miniMap.value) return;
  const parentW = miniMap.value.parentElement!.clientWidth;
  const parentH = miniMap.value.parentElement!.clientHeight || parentW;
  const artRatio = editorData.value.width / editorData.value.height;
  if (artRatio >= 1) {
    miniMap.value.width = parentW;
    miniMap.value.height = parentW / artRatio;
  } else {
    miniMap.value.height = parentH;
    miniMap.value.width = parentH * artRatio;
  }
  MINIMAP_SIZE.value = miniMap.value.width;
}

function setupCanvas() {
  updateCanvasSize();
  centerView();
  sizeMiniMap();
  drawEditor();
  drawMiniMap();
}

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

function toggleBoardChrome() {
  showBoardChrome.value = !showBoardChrome.value;
  try { localStorage.setItem('editor_board_chrome', showBoardChrome.value ? '1' : '0'); } catch { /* quota */ }
  scheduleDraw();
}

function clearReference() {
  referenceImage.value = null;
  scheduleDraw();
}

function onMergeBlock() {
  const res = store.mergeSelectedBlock()
  if (!res) { toast.info('Select at least a 2-pixel-wide area to merge'); return }
  newSize.value = {width: res.w, height: res.h}
  centerView()
  scheduleDraw()
  toast.success(`Merged — canvas is now ${res.w}×${res.h}`)
}

const multiSelectLayers = ref(false)
const selectedLayers = ref<Set<number>>(new Set())

function onLayerClick(index: number, e: MouseEvent) {
  if (multiSelectLayers.value || e.shiftKey) {
    const next = new Set(selectedLayers.value)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    selectedLayers.value = next
    store.activateLayer(index)
    return
  }
  if (selectedLayers.value.size) selectedLayers.value = new Set()
  store.activateLayer(index)
}

function toggleLayerMultiSelect() {
  multiSelectLayers.value = !multiSelectLayers.value
  if (!multiSelectLayers.value) selectedLayers.value = new Set()
}

function onMergeLayers() {
  if (!store.mergeLayers([...selectedLayers.value])) return
  selectedLayers.value = new Set()
  multiSelectLayers.value = false
  scheduleDraw()
  toast.success('Merged layers into one')
}

watch([() => editorData.value.layers, () => editorData.value.layers.length, () => store.currentFrameIndex],
    () => { if (selectedLayers.value.size) selectedLayers.value = new Set() })

function onCopy() {
  const scope = store.copyActiveScope()
  if (scope) toast.success(`Copied ${scope}`)
  else toast.info('Nothing to copy here')
}

function onPaste() {
  const res = store.pasteClipboard()
  if (!res) { toast.info('Clipboard is empty — copy something first'); return }
  if (res === 'board') focusActiveBoard()
  scheduleDraw()
  toast.success(res === 'board' ? 'Pasted as a new board' : 'Pasted as a new layer')
}

function onTrimHidden() {
  const removed = store.trimHiddenPixels()
  if (removed) {
    scheduleDraw()
    toast.success(`Removed ${removed} hidden pixel${removed > 1 ? 's' : ''} outside the canvas`)
  } else {
    toast.info('Nothing to trim — all pixels are inside the canvas')
  }
}

function exportFile(type: string) {
  if (type === 'png') {
    openPngExport()
    return
  }
  const a = document.createElement('a');
  const url = type === 'svg' ? editorDataToSVG(editorData.value) : editorDataToJSON(editorData.value)
  a.href = url;
  a.download = `SimplePixelArt.${type}`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported as ${type.toUpperCase()}`)
}

function openPngExport() {
  showPngModal.value = true
}

function exportPng(scale: number) {
  const tmp = document.createElement('canvas')
  tmp.width = editorData.value.width * scale
  tmp.height = editorData.value.height * scale
  drawThumbnail(tmp, editorData.value, scale)
  const a = document.createElement('a')
  a.href = tmp.toDataURL()
  a.download = `${editorData.value.name || 'SimplePixelArt'}.png`
  a.click()
  showPngModal.value = false
  toast.success(`Exported PNG (${tmp.width}×${tmp.height})`)
}

function animationFrames() {
  const fr = store.frames.length
      ? store.frames
      : [{id: 'f0', layers: editorData.value.layers, duration: 100}];
  return toRaw(fr).map((f: any) => ({id: f.id, duration: f.duration, layers: toRaw(f.layers)}));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportGif() {
  try {
    const {framesToGif} = await import('~/helper/anim-export');
    const cfg = store.bgConfig;
    const bgColor = cfg.type === 'solid' ? cfg.color : '#FFFFFF';
    const bytes = await framesToGif(
        animationFrames(),
        editorData.value.width,
        editorData.value.height,
        toRaw(editorData.value.colors),
        {fps: store.fps, loop: store.loopAnimation, bgColor, shared: toRaw(store.sharedLayers)},
    );
    downloadBlob(new Blob([bytes], {type: 'image/gif'}), `${editorData.value.name || 'SimplePixelArt'}.gif`);
    toast.success('Exported GIF');
  } catch (e) {
    console.error(e);
    toast.error('GIF export failed');
  }
}

async function exportSpritesheet() {
  try {
    const {framesToSpritesheet} = await import('~/helper/anim-export');
    const sheet = framesToSpritesheet(
        animationFrames(),
        editorData.value.width,
        editorData.value.height,
        toRaw(editorData.value.colors),
        undefined,
        toRaw(store.sharedLayers),
    );
    sheet.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${editorData.value.name || 'SimplePixelArt'}-spritesheet.png`);
    });
    toast.success('Exported spritesheet');
  } catch (e) {
    console.error(e);
    toast.error('Spritesheet export failed');
  }
}

async function exportGame() {
  try {
    const {framesToSpritesheet, framesToAsepriteJSON} = await import('~/helper/anim-export');
    const name = editorData.value.name || 'SimplePixelArt';
    const frames = animationFrames();
    const sheet = framesToSpritesheet(
        frames,
        editorData.value.width,
        editorData.value.height,
        toRaw(editorData.value.colors),
        1,                                   // native pixels — engines scale themselves
        toRaw(store.sharedLayers),
    );
    const json = framesToAsepriteJSON(frames, editorData.value.width, editorData.value.height, {
      name,
      image: `${name}-sheet.png`,
      fps: store.fps,
      scale: 1,
      tags: toRaw(store.tags),
    });
    sheet.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${name}-sheet.png`);
      setTimeout(() => {
        downloadBlob(new Blob([json], {type: 'application/json'}), `${name}-sheet.json`);
      }, 300);
    });
    toast.success('Exported spritesheet + JSON for game engines');
  } catch (e) {
    console.error(e);
    toast.error('Game export failed');
  }
}

watch(
    () => editorData.value.id,
    () => {
      const idStr = editorData.value.id_string
      if (idStr && route.query.id !== idStr) {
        router.replace({query: {id: idStr}}).catch(() => {})
      }
    },
)

let stageRO: ResizeObserver | null = null;
let stageInited = false;

onMounted(async () => {
  try { coarsePointer.value = window.matchMedia('(pointer: coarse)').matches; } catch { /* no matchMedia */ }
  try { showBoardChrome.value = localStorage.getItem('editor_board_chrome') !== '0'; } catch { /* ignore */ }
  try {
    const d = JSON.parse(localStorage.getItem('workspace_desk') || 'null');
    if (d) {
      if (typeof d.bg === 'string' && /^#[0-9a-fA-F]{6}$/.test(d.bg)) deskBg.value = d.bg;
      if (typeof d.grid === 'boolean') deskGrid.value = d.grid;
      if (d.style === 'solid' || d.style === 'dashed' || d.style === 'dots') deskGridStyle.value = d.style;
      if (d.shape === 'square' || d.shape === 'iso') deskGridShape.value = d.shape;
      if (typeof d.color === 'string' && (d.color === '' || /^#[0-9a-fA-F]{6}$/.test(d.color))) deskGridColor.value = d.color;
      if (d.cell && Number.isFinite(d.cell.width) && Number.isFinite(d.cell.height)) {
        deskGridCell.value = {
          width: Math.max(1, Math.min(64, Math.round(d.cell.width))),
          height: Math.max(1, Math.min(64, Math.round(d.cell.height))),
        };
      }
      const hexOk = (v: any) => typeof v === 'string' && (v === '' || /^#[0-9a-fA-F]{6}$/.test(v));
      if (d.checker) {
        if (Number.isFinite(d.checker.size)) checkerSize.value = Math.max(1, Math.min(64, Math.round(d.checker.size)));
        if (hexOk(d.checker.a)) checkerA.value = d.checker.a;
        if (hexOk(d.checker.b)) checkerB.value = d.checker.b;
      }
      if (d.guides && hexOk(d.guides.color)) guideColor.value = d.guides.color;
    }
  } catch { /* ignore */ }
  initCanvas()
  if (route.query.tileset) {
    await loadTilesetBoards(String(route.query.tileset))
  } else if (route.query.new === 'true') {
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
  if (route.query.ai) {
    navigateTo(`/generate?prompt=${encodeURIComponent(String(route.query.ai).slice(0, 300))}`)
    return
  }
  if (route.query.palette) {
    try {
      const pal = await useNativeFetch<any>(`/coloring/palettes/${route.query.palette}/`)
      if (pal?.colors?.length) store.applyPalette(pal.colors, 'replace', pal.id)
    } catch (e) { /* palette gone — ignore */ }
    const q = {...route.query}; delete q.palette
    router.replace({query: q}).catch(() => {})
  }
  if (route.query.colors) {
    const list = route.query.colors.toString().split(',')
        .map(c => '#' + c.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase())
        .filter(c => c.length === 7)
    if (list.length) store.applyPalette(list, 'replace')
    const q = {...route.query}; delete q.colors
    router.replace({query: q}).catch(() => {})
  }
  setupCanvas()
  if (typeof ResizeObserver !== 'undefined' && canvas.value?.parentElement) {
    stageRO = new ResizeObserver(() => {
      updateCanvasSize();
      if (!stageInited) { stageInited = true; centerView(); }
      scheduleDraw();
      scheduleMiniMap();
    });
    stageRO.observe(canvas.value.parentElement);
  }
  if (route.query.new !== 'true' && !route.query.id) {
    try {
      const sc = JSON.parse(localStorage.getItem('workspace_camera') || 'null');
      if (sc && isFinite(sc.z) && isFinite(sc.x) && isFinite(sc.y)) {
        cam.value = {x: sc.x, y: sc.y};
        zoom.value = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, sc.z));
        stageInited = true;
        scheduleDraw();
        scheduleMiniMap();
      }
    } catch { /* ignore */ }
  }
  setupKeyListeners()

  hasPreviousScreen.value = !!(window.history.state && window.history.state.back);
  isMacUA.value = /Mac|iPhone|iPad/.test(navigator.platform);

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => {
      canvasReady.value = true
      if (!editorBoot.value) return
      const elapsed = (typeof performance !== 'undefined' ? performance.now() : 0) - fsBootAt
      const wait = Math.max(0, FS_BOOT_MIN_MS - elapsed)
      if (wait > 0) setTimeout(() => { editorBoot.value = false }, wait)
      else editorBoot.value = false
    })
  } else {
    canvasReady.value = true
    editorBoot.value = false
  }
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
  if (drawRafId !== null) cancelAnimationFrame(drawRafId);
  if (miniMapRafId !== null) cancelAnimationFrame(miniMapRafId);
  if (playbackTimer) clearTimeout(playbackTimer);
  if (camSaveTimer) clearTimeout(camSaveTimer);
  window.removeEventListener('mousemove', doResizeBoard);
  window.removeEventListener('mouseup', endResizeFromWindow);
  stageRO?.disconnect();
  stageRO = null;
  store.isPlaying = false
  store.resetEditorData()
  clearListeners()
  if (typeof document !== 'undefined') document.documentElement.classList.remove('editor-fullscreen')
})

watch(() => store.drawTurn, () => {
  if (store.isPlaying) {
    if (!playbackOnPreview) return
    refreshPlaybackBuffer()
  }
  scheduleDraw()
  scheduleMiniMap()
})

watch(() => store.boardsRev, () => {
  scheduleDraw()
  scheduleMiniMap()
})

watch([deskBg, deskGrid, deskGridStyle, deskGridShape, deskGridColor, deskGridCell,
  checkerSize, checkerA, checkerB, guideColor], () => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('workspace_desk', JSON.stringify({
        bg: deskBg.value, grid: deskGrid.value, style: deskGridStyle.value,
        shape: deskGridShape.value, color: deskGridColor.value, cell: deskGridCell.value,
        checker: {size: checkerSize.value, a: checkerA.value, b: checkerB.value},
        guides: {color: guideColor.value},
      }));
    } catch { /* quota */ }
  }
  boardBuffers.clear();
  scheduleDraw();
});

let camSaveTimer: ReturnType<typeof setTimeout> | null = null;
watch([cam, zoom], () => {
  if (typeof window === 'undefined') return;
  if (camSaveTimer) clearTimeout(camSaveTimer);
  camSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem('workspace_camera', JSON.stringify({x: cam.value.x, y: cam.value.y, z: zoom.value}));
    } catch { /* ignore quota */ }
  }, 400);
}, {deep: true});

watch(() => store.onionSkin, () => scheduleDraw())

let restoringHistory = false;

function doUndo() {
  restoringHistory = true;
  store.undo();
  nextTick(() => { restoringHistory = false; });
}

function doRedo() {
  restoringHistory = true;
  store.redo();
  nextTick(() => { restoringHistory = false; });
}

let lastActiveBoardId = '';
watch(
    () => [store.activeBoardId, `${editorData.value.width}x${editorData.value.height}`] as const,
    ([id]) => {
      const switched = id !== lastActiveBoardId;
      lastActiveBoardId = id;
      newSize.value = {width: editorData.value.width, height: editorData.value.height};
      if (switched || isResizingBoard.value || restoringHistory) { sizeMiniMap(); scheduleDraw(); scheduleMiniMap(); return; }
      setupCanvas();
    }
);

</script>

<template>
  <div ref="editorRoot" class="editor" :style="{'--editor-width': EDITOR_SIZE + 'px','--editor-minimap-size': MINIMAP_SIZE + 'px'}">

    <div class="editor-toolbar">
      <div class="toolbar-start">
        <ui-tooltip class="fs-only" :text="hasPreviousScreen ? 'Back' : 'Home'">
          <button class="toolbar-btn" :aria-label="hasPreviousScreen ? 'Back' : 'Home'" @click="goBack">
            <span class="icon" :class="hasPreviousScreen ? 'icon-angle-left' : 'icon-home'"/>
          </button>
        </ui-tooltip>
        <ui-dropdown-menu label="File">
          <ui-tooltip text="File">
            <button class="toolbar-btn" aria-label="File"><span class="icon icon-file"/></button>
          </ui-tooltip>
          <template #menu>
            <div class="file-menu">
              <button class="file-menu-item" @click="openOnboarding">
                <span class="icon icon-rocket"/><span>Get started</span>
              </button>
              <div class="file-menu-sep"/>
              <button class="file-menu-item" @click="store.resetEditorData">
                <span class="icon icon-plus"/><span>New canvas</span>
              </button>
              <div class="file-menu-sep"/>
              <button class="file-menu-item" @click="onAddBoard(16)">
                <span class="icon icon-square"/><span>New board</span>
              </button>
              <button class="file-menu-item" @click="openArtPicker">
                <span class="icon icon-workspace"/><span>Load board…</span>
              </button>
              <div class="file-menu-sep"/>
              <button class="file-menu-item" @click="onImportFiles">
                <span class="icon icon-upload"/><span>Import files…</span>
              </button>
              <button class="file-menu-item" @click="store.insertImage()">
                <span class="icon icon-image"/><span>Insert image</span>
              </button>
              <button class="file-menu-item" @click="showStripImport = true">
                <span class="icon icon-filmstrip"/><span>Import sprite strip</span>
              </button>
              <div class="file-menu-sep"/>
              <button class="file-menu-item" @click="exportFile('png')">
                <span class="icon icon-download"/><span>Download PNG</span>
              </button>
              <button class="file-menu-item" @click="exportFile('svg')">
                <span class="icon icon-download"/><span>Download SVG</span>
              </button>
              <button class="file-menu-item" @click="exportFile('json')">
                <span class="icon icon-download"/><span>Download JSON</span>
              </button>
              <template v-if="store.isAnimated">
                <div class="file-menu-sep"/>
                <button class="file-menu-item" @click="exportGif">
                  <span class="icon icon-download"/><span>Download GIF (animated)</span>
                </button>
                <button class="file-menu-item" @click="exportSpritesheet">
                  <span class="icon icon-download"/><span>Download spritesheet</span>
                </button>
                <button class="file-menu-item" @click="exportGame" title="1× spritesheet + Aseprite-format JSON (durations, tags) for Phaser / Unity / Godot">
                  <span class="icon icon-download"/><span>Export for game (sheet + JSON)</span>
                </button>
              </template>
            </div>
          </template>
        </ui-dropdown-menu>
        <ui-dropdown-menu label="Settings" class="settings-dd">
          <ui-tooltip text="Settings">
            <button class="toolbar-btn" aria-label="Settings" @click="settingsView = 'main'"><span class="icon icon-cog"/></button>
          </ui-tooltip>
          <template #menu>

            <div v-if="settingsView === 'main'" class="file-menu" @click.stop>
              <button class="file-menu-item" @click="openResize">
                <span class="icon icon-ruler"/><span>Resize canvas</span><span class="icon icon-angle-right settings-chev"/>
              </button>
              <button class="file-menu-item" @click="openBgPicker">
                <span class="icon icon-image"/><span>Background</span><span class="icon icon-angle-right settings-chev"/>
              </button>
              <button class="file-menu-item" @click="settingsView = 'canvas'">
                <span class="icon icon-grid"/><span>Canvas</span><span class="icon icon-angle-right settings-chev"/>
              </button>
              <button class="file-menu-item" @click="settingsView = 'board'">
                <span class="icon icon-square"/><span>Board</span><span class="icon icon-angle-right settings-chev"/>
              </button>
              <button class="file-menu-item" @click="toggleBoardChrome">
                <span class="icon" :class="showBoardChrome ? 'icon-eye-cross' : 'icon-eye'"/>
                <span>{{ showBoardChrome ? 'Hide board labels' : 'Show board labels' }}</span>
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
              <button class="file-menu-item" :title="`Copies the ${store.activeScope} (${modK}C)`" @click="onCopy">
                <span class="icon icon-content-copy"/>
                <span>Copy {{ store.activeScope }}</span>
              </button>
              <button v-if="store.clipboard" class="file-menu-item" :title="`Paste (${modK}V)`" @click="onPaste">
                <span class="icon icon-content-paste"/>
                <span>Paste {{ store.clipboard.kind === 'board' ? 'as new board' : 'as new layer' }}</span>
              </button>
              <div class="file-menu-sep"/>
              <button class="file-menu-item" @click="store.clearCurrentLayer">
                <span class="icon icon-broom"/>
                <span>Clear current layer</span>
              </button>
              <button class="file-menu-item" @click="store.cleanupUnusedColors()">
                <span class="icon icon-palette-swatch-outline"/>
                <span>Cleanup unused colors</span>
              </button>
              <button class="file-menu-item" title="Remove pixels stranded outside the canvas by a resize or move — they never render but still slow drawing and bloat saves" @click="onTrimHidden">
                <span class="icon icon-crop"/>
                <span>Trim hidden pixels</span>
              </button>
              <div class="file-menu-sep"/>
              <button class="file-menu-item file-menu-danger" @click="showDeleteConfirm = true">
                <span class="icon icon-trash"/>
                <span>Delete this art</span>
              </button>
            </div>

            <div v-else-if="settingsView === 'resize'" class="file-menu settings-sub" @click.stop>
              <button class="settings-back" @click="settingsView = 'main'"><span class="icon icon-angle-left"/><span>Resize canvas</span></button>
              <div class="settings-body">
                <div class="onb-field">
                  <label class="onb-label">Presets</label>
                  <div class="onb-chips">
                    <button v-for="s in SIZE_PRESETS" :key="s" class="onb-chip" :class="{ active: newSize.width === s && newSize.height === s }" @click="setResizePreset(s)">{{ s }}×{{ s }}</button>
                  </div>
                </div>
                <div class="onb-field">
                  <label class="onb-label">Custom size</label>
                  <div class="resize-fields">
                    <label class="resize-field">
                      <span class="resize-field-label">Width</span>
                      <input class="resize-input wide" type="number" min="1" max="128" :value="newSize.width" @input="onResizeWidth(($event.target as HTMLInputElement).value)" @keydown.enter="applyResize">
                    </label>
                    <button type="button" class="resize-link" :class="{ active: linkResize }" :aria-pressed="linkResize" :title="linkResize ? 'Aspect ratio locked' : 'Lock aspect ratio'" @click="linkResize = !linkResize"><span class="icon icon-link"/></button>
                    <label class="resize-field">
                      <span class="resize-field-label">Height</span>
                      <input class="resize-input wide" type="number" min="1" max="128" :value="newSize.height" @input="onResizeHeight(($event.target as HTMLInputElement).value)" @keydown.enter="applyResize">
                    </label>
                  </div>
                </div>
                <p v-if="resizeShrinks" class="resize-warn">Smaller than {{ editorData.width }}×{{ editorData.height }} — pixels outside the new bounds are cropped.</p>
                <button class="btn primary wide" @click="applyResize">Resize to {{ clampDim(newSize.width) }}×{{ clampDim(newSize.height) }}</button>
              </div>
            </div>

            <div v-else-if="settingsView === 'bg'" class="file-menu settings-sub" @click.stop>
              <button class="settings-back" @click="settingsView = 'main'"><span class="icon icon-angle-left"/><span>Background</span></button>
              <div class="settings-body">
                <div class="bg-tabs">
                  <button class="bg-tab" :class="{active: store.bgConfig.type === 'none'}" @click="applyBgNone(); settingsView = 'main'">
                    <span class="bg-tab-preview bg-tab-preview-checker" aria-hidden="true"/><span>Default</span>
                  </button>
                  <button class="bg-tab" :class="{active: store.bgConfig.type === 'transparent'}" @click="applyBgTransparent(); settingsView = 'main'">
                    <span class="bg-tab-preview bg-tab-preview-none" aria-hidden="true"/><span>Transparent</span>
                  </button>
                  <button class="bg-tab" :class="{active: bgTab === 'solid'}" @click="bgTab = 'solid'; applyBgSolid()">
                    <span class="bg-tab-preview" :style="{background: bgSolidColor}" aria-hidden="true"/><span>Solid</span>
                  </button>
                  <button class="bg-tab" :class="{active: bgTab === 'art'}" :disabled="!auth.isLogged" :title="auth.isLogged ? 'Use one of your arts' : 'Login required'" @click="bgTab = 'art'; auth.isLogged && !myArtsLoaded && loadMyArts()">
                    <span class="bg-tab-preview bg-tab-preview-art" aria-hidden="true"/><span>My art</span>
                  </button>
                </div>
                <div v-if="bgTab === 'solid'" class="bg-tab-body">
                  <label class="bg-color-row">
                    <input type="color" v-model="bgSolidColor" class="bg-color-input" @input="applyBgSolid()">
                    <span class="bg-color-hex">{{ bgSolidColor.toUpperCase() }}</span>
                  </label>
                  <div class="bg-color-presets">
                    <button v-for="c in ['#FFFFFF','#000000','#F5F5F5','#FFE4B5','#B0E0E6','#1A1033','#0F380F','#2A0D4D']" :key="c" class="bg-color-preset" :style="{background: c}" :title="c" @click="bgSolidColor = c; applyBgSolid()"/>
                  </div>
                </div>
                <div v-else-if="bgTab === 'art'" class="bg-tab-body">
                  <div v-if="loadingMyArts" class="bg-art-grid no-scrollbar">
                    <div v-for="i in 6" :key="i" class="skeleton skeleton-square bg-art-thumb"/>
                  </div>
                  <div v-else-if="!myArts.length" class="bg-empty"><p>You haven't published any art yet.</p></div>
                  <div v-else class="bg-art-grid no-scrollbar">
                    <button v-for="art in myArts" :key="art.id" class="bg-art-thumb" :class="{active: store.bgConfig.artId === art.id}" :title="art.name" @click="applyBgArt(art); settingsView = 'main'">
                      <img v-if="!failedBgThumb[art.id]" :src="art.thumb" :alt="art.name" loading="lazy" @error="failedBgThumb[art.id] = true">
                      <span v-else class="bg-art-thumb-empty"><span class="icon icon-image"/></span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="settingsView === 'canvas'" class="file-menu settings-sub" @click.stop>
              <button class="settings-back" @click="settingsView = 'main'"><span class="icon icon-angle-left"/><span>Canvas</span></button>
              <div class="settings-body">
                <div class="cv-field">
                  <label class="cv-label">Background</label>
                  <div class="cv-opts cols-3">
                    <button class="cv-opt" :class="{ active: deskBg.toLowerCase() === DESK_BG.dark }" @click="deskBg = DESK_BG.dark">
                      <span class="desk-sw" :style="{ background: DESK_BG.dark }"/><span>Dark</span>
                    </button>
                    <button class="cv-opt" :class="{ active: deskBg.toLowerCase() === DESK_BG.light }" @click="deskBg = DESK_BG.light">
                      <span class="desk-sw" :style="{ background: DESK_BG.light }"/><span>Light</span>
                    </button>
                    <label class="cv-opt cv-swatch" :class="{ active: isCustomDeskBg }">
                      <span class="desk-sw" :style="{ background: deskBg }"/><span>Custom</span>
                      <input type="color" class="cv-swatch-input" :value="deskBg" @input="deskBg = ($event.target as HTMLInputElement).value">
                    </label>
                  </div>
                </div>
                <div class="cv-field">
                  <label class="cv-label">Desk grid</label>
                  <div class="cv-opts cols-2">
                    <button class="cv-opt" :class="{ active: !deskGrid }" @click="deskGrid = false">Off</button>
                    <button class="cv-opt" :class="{ active: deskGrid }" @click="deskGrid = true">On</button>
                  </div>
                </div>
                <template v-if="deskGrid">
                  <div class="cv-field">
                    <label class="cv-label">Grid type</label>
                    <div class="cv-opts cols-2">
                      <button class="cv-opt" :class="{ active: deskGridShape === 'square' }" @click="deskGridShape = 'square'">Square</button>
                      <button class="cv-opt" :class="{ active: deskGridShape === 'iso' }" @click="deskGridShape = 'iso'">Isometric</button>
                    </div>
                  </div>
                  <div class="cv-field">
                    <label class="cv-label">Grid cell</label>
                    <div class="resize-fields">
                      <label class="resize-field">
                        <span class="resize-field-label">Width</span>
                        <input class="resize-input wide" type="number" min="1" max="64" :value="deskGridCell.width" @input="setDeskCell('width', ($event.target as HTMLInputElement).value)">
                      </label>
                      <label class="resize-field">
                        <span class="resize-field-label">Height</span>
                        <input class="resize-input wide" type="number" min="1" max="64" :value="deskGridCell.height" @input="setDeskCell('height', ($event.target as HTMLInputElement).value)">
                      </label>
                    </div>
                  </div>
                  <div class="cv-field">
                    <label class="cv-label">Line style</label>
                    <div class="cv-opts cols-3">
                      <button v-for="st in (['solid','dashed','dots'] as const)" :key="st" class="cv-opt cv-cap" :class="{ active: deskGridStyle === st }" @click="deskGridStyle = st">{{ st }}</button>
                    </div>
                  </div>
                  <div class="cv-field">
                    <label class="cv-label">Line color</label>
                    <div class="cv-opts cols-2">
                      <button class="cv-opt" :class="{ active: !deskGridColor }" @click="deskGridColor = ''">Auto</button>
                      <label class="cv-opt cv-swatch" :class="{ active: !!deskGridColor }">
                        <span class="desk-sw" :style="{ background: deskGridColor || '#888' }"/><span>Custom</span>
                        <input type="color" class="cv-swatch-input" :value="deskGridColor || '#888888'" @input="deskGridColor = ($event.target as HTMLInputElement).value">
                      </label>
                    </div>
                  </div>
                </template>

              </div>
            </div>

            <div v-else-if="settingsView === 'board'" class="file-menu settings-sub" @click.stop>
              <button class="settings-back" @click="settingsView = 'main'"><span class="icon icon-angle-left"/><span>Board</span></button>
              <div class="settings-body">

                <div class="cv-field">
                  <label class="cv-label">Grid mode</label>
                  <div class="cv-opts cols-3">
                    <button
                        v-for="m in (['square','iso','off'] as const)"
                        :key="m"
                        class="cv-opt cv-cap"
                        :class="{ active: (editorData.meta?.iso?.mode ?? 'square') === m }"
                        @click="store.setGridMode(m); scheduleDraw()"
                    >{{ m === 'iso' ? 'isometric' : m }}</button>
                  </div>
                </div>
                <div v-if="(editorData.meta?.iso?.mode ?? 'square') === 'iso'" class="cv-field">
                  <label class="cv-label">Iso cell size</label>
                  <div class="resize-fields">
                    <label class="resize-field">
                      <span class="resize-field-label">Width</span>
                      <input
                          class="resize-input wide" type="number" min="1" max="32"
                          :value="(editorData.meta?.iso?.cell ?? { width: 2, height: 1 }).width"
                          @change="store.setGridCell(($event.target as HTMLInputElement).value, (editorData.meta?.iso?.cell ?? { width: 2, height: 1 }).height); scheduleDraw()"
                      >
                    </label>
                    <label class="resize-field">
                      <span class="resize-field-label">Height</span>
                      <input
                          class="resize-input wide" type="number" min="1" max="32"
                          :value="(editorData.meta?.iso?.cell ?? { width: 2, height: 1 }).height"
                          @change="store.setGridCell((editorData.meta?.iso?.cell ?? { width: 2, height: 1 }).width, ($event.target as HTMLInputElement).value); scheduleDraw()"
                      >
                    </label>
                  </div>
                </div>

                <div class="cv-field">
                  <label class="cv-label">Board grid size</label>
                  <div class="cv-opts cols-4">
                    <button v-for="n in [1, 2, 4, 8]" :key="n" class="cv-opt" :class="{ active: checkerSize === n }" @click="setCheckerSize(n)">{{ n }}</button>
                  </div>
                  <div class="resize-fields">
                    <label class="resize-field">
                      <span class="resize-field-label">Custom (px)</span>
                      <input class="resize-input wide" type="number" min="1" max="64" :value="checkerSize" @input="setCheckerSize(($event.target as HTMLInputElement).value)">
                    </label>
                  </div>
                </div>
                <div class="cv-field">
                  <label class="cv-label">Board grid colors</label>
                  <div class="cv-opts cols-3">
                    <button class="cv-opt" :class="{ active: !checkerA && !checkerB }" @click="checkerA = ''; checkerB = ''">Default</button>
                    <label class="cv-opt cv-swatch">
                      <span class="desk-sw" :style="{ background: checkerA || '#ffffff' }"/><span>A</span>
                      <input type="color" class="cv-swatch-input" :value="checkerA || '#ffffff'" @input="checkerA = ($event.target as HTMLInputElement).value">
                    </label>
                    <label class="cv-opt cv-swatch">
                      <span class="desk-sw" :style="{ background: checkerB || '#cccccc' }"/><span>B</span>
                      <input type="color" class="cv-swatch-input" :value="checkerB || '#cccccc'" @input="checkerB = ($event.target as HTMLInputElement).value">
                    </label>
                  </div>
                </div>

                <div class="cv-field">
                  <label class="cv-label">Guides <template v-if="guideCount">({{ guideCount }})</template></label>
                  <div class="cv-opts cols-2">
                    <button class="cv-opt" title="Add a vertical guide line" @click="addGuide('v')">+ Vertical</button>
                    <button class="cv-opt" title="Add a horizontal guide line" @click="addGuide('h')">+ Horizontal</button>
                  </div>
                  <div class="cv-opts cols-3" style="margin-top: 4px">
                    <button class="cv-opt" title="Add centre cross guides" @click="addGuidePreset('center')">Center</button>
                    <button class="cv-opt" title="Add rule-of-thirds guides" @click="addGuidePreset('thirds')">Thirds</button>
                    <button class="cv-opt" :disabled="!guideCount" @click="clearGuides">Clear</button>
                  </div>
                  <p class="cv-hint">Drag a line with the Select tool — drop it outside the board to remove.</p>
                </div>
                <div class="cv-field">
                  <label class="cv-label">Guide color</label>
                  <div class="cv-opts cols-2">
                    <button class="cv-opt" :class="{ active: !guideColor }" @click="guideColor = ''">Auto</button>
                    <label class="cv-opt cv-swatch" :class="{ active: !!guideColor }">
                      <span class="desk-sw" :style="{ background: guideColor || '#38BDF8' }"/><span>Custom</span>
                      <input type="color" class="cv-swatch-input" :value="guideColor || '#38BDF8'" @input="guideColor = ($event.target as HTMLInputElement).value">
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </ui-dropdown-menu>

        <div class="toolbar-sep"/>
        <ui-tooltip text="Generate with AI">
          <nuxt-link to="/generate" class="toolbar-btn" aria-label="Generate with AI">
            <span class="icon icon-auto-fix"/>
          </nuxt-link>
        </ui-tooltip>
      </div>
      <div class="toolbar-main no-scrollbar">
      <div class="toolbar-group">
        <ui-tooltip :text="`Undo (${modK}Z)`">
          <button class="toolbar-btn" aria-label="Undo" :disabled="!store.canUndo" @click="doUndo()"><span class="icon icon-undo"/></button>
        </ui-tooltip>
        <ui-tooltip :text="`Redo (${modK}${shiftK}Z)`">
          <button class="toolbar-btn" aria-label="Redo" :disabled="!store.canRedo" @click="doRedo()"><span class="icon icon-redo"/></button>
        </ui-tooltip>
      </div>
      <div class="toolbar-sep"/>
      <div class="toolbar-group">
        <ui-tooltip :text="`Zoom in (${modK}=)`">
          <button class="toolbar-btn" aria-label="Zoom in" @click="zoomIn"><span class="icon icon-zoom-in"/></button>
        </ui-tooltip>
        <ui-tooltip :text="`Zoom out (${modK}-)`">
          <button class="toolbar-btn" aria-label="Zoom out" @click="zoomOut"><span class="icon icon-zoom-out"/></button>
        </ui-tooltip>
        <ui-tooltip text="Fit all boards in view">
          <button class="toolbar-btn" @click="fitAllBoards"><span class="fit-label">FIT</span></button>
        </ui-tooltip>
        <ui-tooltip text="Zoom level — click for 100%">
          <button class="toolbar-btn zoom-readout" aria-label="Reset zoom to 100%" @click="zoomTo100">{{ Math.round(zoom * 100) }}%</button>
        </ui-tooltip>
      </div>
      <span class="toolbar-info">{{ editorData.width }}×{{ editorData.height }}</span>

      <div class="toolbar-fs">
        <ui-dropdown-menu class="fs-hide" position="right" label="Fullscreen">
          <ui-tooltip text="Fullscreen">
            <button class="toolbar-btn" aria-label="Fullscreen"><span class="icon icon-fullscreen"/></button>
          </ui-tooltip>
          <template #menu>
            <div class="file-menu">
              <button class="file-menu-item" @click="enterOsFullscreen">
                <span class="icon icon-fullscreen"/><span>Fullscreen</span>
              </button>
              <button class="file-menu-item" @click="enterWindowFullscreen">
                <span class="icon icon-window-maximize"/><span>Fullscreen in window</span>
              </button>
            </div>
          </template>
        </ui-dropdown-menu>
        <ui-tooltip class="fs-only" text="Exit fullscreen (Esc)">
          <button class="toolbar-btn" aria-label="Exit fullscreen" @click="exitFullscreen"><span class="icon icon-fullscreen-exit"/></button>
        </ui-tooltip>
      </div>
      </div>
      <div class="toolbar-end">
        <ui-tooltip text="Publish & share — your work autosaves as you draw">
          <button class="publish-toolbar-btn tm-publish" aria-label="Publish and share" @click="openPublish">
            <span class="icon icon-earth"/>
            <span class="tm-publish-label">Publish</span>
          </button>
        </ui-tooltip>
      </div>
    </div>

    <div class="editor-body">

      <Widget class="tool-rail">
        <div class="tools tools-rail no-scrollbar">
          <ui-tooltip text="Brush (B)">
            <Square aria-label="Brush" @click="store.setTool('brush')" :class="{ active: store.currentTool === 'brush' }">
              <span class="icon icon-square"/>
            </Square>
          </ui-tooltip>
          <ui-tooltip text="Iso line (L)">
            <Square aria-label="Iso line" @click="store.setTool('iso-line')" :class="{ active: store.currentTool === 'iso-line' }">
              <span class="icon icon-rhombus"/>
            </Square>
          </ui-tooltip>
          <ui-tooltip text="Fill (G)">
            <Square aria-label="Fill" @click="store.setTool('bucket')" :class="{ active: store.currentTool === 'bucket' }">
              <span class="icon icon-bucket"/>
            </Square>
          </ui-tooltip>
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

          <ui-tooltip text="Move (V) — hold Space to pan the view">
            <Square aria-label="Move" @click="store.setTool('move')" :class="{ active: store.currentTool === 'move' }">
              <span class="icon icon-move"/>
            </Square>
          </ui-tooltip>
          <ui-tooltip text="Select (M)">
            <Square aria-label="Select" @click="toggleSelect()" :class="{ active: store.currentTool === 'select' }">
              <span class="icon icon-select"/>
            </Square>
          </ui-tooltip>
          <ui-tooltip text="Mirror drawing — horizontal (toggle)">
            <Square aria-label="Mirror drawing horizontally" @click="store.toggleMirror('horizontal')" :class="{ active: store.mirrorHorizontal }">
              <span class="icon icon-reflect-horizontal"/>
            </Square>
          </ui-tooltip>
          <ui-tooltip text="Mirror drawing — vertical (toggle)">
            <Square aria-label="Mirror drawing vertically" @click="store.toggleMirror('vertical')" :class="{ active: store.mirrorVertical }">
              <span class="icon icon-reflect-vertical"/>
            </Square>
          </ui-tooltip>

          <div class="tools-sep"/>

          <ui-tooltip text="Flip horizontally — layer, or selection if active">
            <Square aria-label="Flip horizontally" @click="store.flipSelectionHorizontal">
              <span class="icon icon-flip-h"/>
            </Square>
          </ui-tooltip>
          <ui-tooltip text="Flip vertically — layer, or selection if active">
            <Square aria-label="Flip vertically" @click="store.flipSelectionVertical">
              <span class="icon icon-flip-v"/>
            </Square>
          </ui-tooltip>
          <ui-tooltip v-if="store.selectionState.bounds.active" text="Merge pixels — the selection becomes 1 pixel and the whole canvas re-tiles in blocks of that size, aligned to it">
            <Square aria-label="Merge pixels by selection block" @click="onMergeBlock">
              <span class="icon icon-arrow-collapse-all"/>
            </Square>
          </ui-tooltip>
          <ui-tooltip v-if="selectedLayers.size >= 2" :text="`Merge ${selectedLayers.size} selected layers into one`">
            <Square aria-label="Merge selected layers" @click="onMergeLayers">
              <span class="icon icon-merge"/>
            </Square>
          </ui-tooltip>

          <template v-if="store.isAnimated">
            <div class="tools-sep"/>
            <Square
                :class="{ active: store.allFrames }"
                title="All-frames mode — paint, erase, fill and move affect every frame at once"
                @click="store.allFrames = !store.allFrames"
            >
              <span class="move-all-label">ALL</span>
            </Square>
          </template>
        </div>
      </Widget>

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
                  :class="[store.currentTool, { panning: spacePressed, 'sel-drag': hoverInSelection, 'guide-v': hoverGuide?.axis === 'v' || draggingGuide?.axis === 'v', 'guide-h': hoverGuide?.axis === 'h' || draggingGuide?.axis === 'h' }]"
                  @mousedown="startDraw"
                  @dblclick="onDblClick"
                  @mousemove="draw"
                  @mouseup="stopDraw"
                  @mouseleave="leaveCanvas"
                  @wheel.prevent="onWheel"
                  @contextmenu="onContextMenu"
                  @touchstart="handleTouchStart"
                  @touchmove="handleTouchMove"
                  @touchend="handleTouchEnd"
              />
            </div>
            <Transition name="canvas-fade">
              <div v-if="!canvasReady" class="canvas-loading" aria-hidden="true">
                <div class="px-loader">
                  <span
                      v-for="i in 9"
                      :key="i"
                      :style="{ animationDelay: ((Math.floor((i - 1) / 3) + (i - 1) % 3) * 0.11) + 's' }"
                  />
                </div>
              </div>
            </Transition>
          </Square>
        </Widget>

        <Widget title="Palette">
          <template #ctl>
            <div class="widget-ctl-group">
              <span v-if="store.currentTool === 'picker'" class="pick-readout">
                <template v-if="store.pickedColorIndex !== null">
                  <span class="pick-swatch" :style="{ background: editorData.colors[store.pickedColorIndex] }"/>
                  <span class="pick-text">#{{ store.pickedColorIndex }} · {{ editorData.colors[store.pickedColorIndex] }}</span>
                </template>
                <span v-else class="pick-text pick-hint">Tap a pixel…</span>
              </span>
              <button class="widget-ctl-btn" @click="showPalettePicker = true" title="Palette library — browse, apply, save, extract from image">
                <span class="icon icon-grid"/>
                <span>Library</span>
              </button>
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

        <div class="sidebar-stack">
          <div class="sidebar-stack-inner">
            <EditorTilesetStrip
                ref="tileStripRef"
                :active-id="editorData.id_string || String(editorData.id)"
                :active-saved="isCurrentArtSaved"
                :active-data="editorData"
                :active-tileset-id="activeTilesetId"
                @select="loadTileRef"
                @tileset-change="store.setArtTileset($event)"
            />

            <Widget title="Layers" class="layers">
              <template #ctl>
                <div class="layer-ctl">
                  <button
                      class="layer-add"
                      :class="{ active: multiSelectLayers }"
                      title="Select multiple layers — or hold Shift and click"
                      aria-label="Select multiple layers"
                      @click="toggleLayerMultiSelect"
                  >
                    <span class="icon icon-check"/>
                  </button>
                  <button class="layer-add" @click="store.addLayer" title="Add new layer" aria-label="Add new layer">
                    <span class="icon icon-plus"/>
                  </button>
                </div>
              </template>
          <ul>
            <li
                v-for="(_, index) in editorData.layers"
                :key="index"
                :class="{
                  active: index === store.currentLayerIndex && store.activeScope !== 'board',
                  selected: selectedLayers.has(index),
                }"
                @click="onLayerClick(index, $event)"
            >
              <span v-if="selectedLayers.has(index)" class="layer-num layer-check" aria-hidden="true"><span class="icon icon-check"/></span>
              <span v-else class="layer-num" aria-hidden="true">{{ editorData.layers.length - index }}</span>
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
      </div>
    </div>

    <EditorTimeline class="editor-timeline"/>

    <EditorPalettePicker v-model:open="showPalettePicker"/>
    <EditorStripImport v-model:open="showStripImport"/>

    <UiModal v-if="showPublishModal" @close="showPublishModal = false">

          <template v-if="publishStep === 'edit'">
            <h3 class="publish-heading">Publish your pixel art</h3>
            <div class="publish-form">
              <div>
                <label class="publish-label">Title</label>
                <input
                    type="text"
                    v-model="editorData.name"
                    placeholder="What does it show?"
                    maxlength="60"
                    class="publish-input"
                />
              </div>
              <div>
                <label class="publish-label">Description</label>
                <textarea
                    v-model="editorData.desc"
                    placeholder="A sentence or two about it..."
                    maxlength="300"
                    rows="2"
                    class="publish-input publish-textarea"
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

              <button
                  v-if="aiMeta?.enabled"
                  class="publish-ai-row"
                  :disabled="aiBusy"
                  title="AI writes the title, description, tags and a matching URL slug from the artwork"
                  @click="genMetaWithAI"
              >
                <span class="icon icon-auto-fix"/>
                <span>{{ aiBusy ? 'Reading your art…' : 'Let AI fill these for you' }}</span>
                <span class="publish-ai-cost"><span class="icon icon-coin"/>{{ aiMeta.cost }}</span>
              </button>
            </div>
            <div class="publish-status-row">
              <label class="publish-label" for="publish-status">Status</label>
              <select id="publish-status" v-model="publishStatus" class="publish-input">
                <option v-for="s in PUBLISH_STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </div>
            <div class="publish-actions">
              <button class="btn primary block" @click="saveArt">
                <span class="icon" :class="publishStatus === 'public' ? 'icon-earth' : 'icon-earth-off'"/>
                <span>{{ publishAction }}</span>
              </button>
            </div>
          </template>

          <template v-if="publishStep === 'done'">
            <div class="publish-done-header">
              <h3 class="text-sm font-bold">{{ editorData.is_public ? 'Published!' : 'Saved — unlisted' }}</h3>
              <p class="text-xs mt-1">{{ editorData.is_public ? 'Your pixel art is live. Share it!' : 'Only people with this link can see it — not listed in the gallery.' }}</p>
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
      </UiModal>

    <UiModal
        v-if="showOnboarding"
        class="onb-modal"
        title="New pixel art"
        sub="Set up your first board."
        @close="skipOnboarding"
    >
      <div class="onb-body">
        <div class="onb-field">
          <label class="onb-label">Board size</label>
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
          <label class="onb-label">Colors</label>
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

        <ul class="onb-tips">
          <li><span class="icon icon-square"/>Draw empty canvas to add a board</li>
          <li><span class="icon icon-dots"/>{{ coarsePointer ? 'Tap the ⋮ on a board for options' : 'Right-click a board for options' }}</li>
          <li><span class="icon icon-fullscreen"/>Fullscreen: top-right of the toolbar</li>
        </ul>

        <button class="btn primary block" @click="finishOnboarding">Start drawing</button>
      </div>
    </UiModal>

    <UiModal v-if="showPngModal" class="png-modal" @close="showPngModal = false">
          <h3 class="publish-heading">Download PNG</h3>
          <p class="publish-sub">Pick an export scale — bigger scale = sharper, larger file.</p>

          <div class="onb-field">
            <label class="onb-label">Scale</label>
            <div class="onb-chips">
              <button
                  v-for="s in PNG_SCALES"
                  :key="s"
                  class="onb-chip"
                  :class="{ active: pngScale === s }"
                  @click="pngScale = s"
              >{{ s }}×</button>
            </div>
          </div>

          <p class="png-dims">
            Output:
            <strong>{{ editorData.width * pngScale }}×{{ editorData.height * pngScale }}px</strong>
            <span class="png-dims-src">(from {{ editorData.width }}×{{ editorData.height }})</span>
          </p>

          <button class="btn primary wide" @click="exportPng(pngScale)">
            <span class="icon icon-download"/>
            <span>Download PNG</span>
          </button>
          <button class="share-dismiss" @click="showPngModal = false">Cancel</button>
      </UiModal>

    <UiModal v-if="showImportModal" class="png-modal" @close="showImportModal = false">
      <h3 class="publish-heading">Import {{ importPicked.length }} file{{ importPicked.length > 1 ? 's' : '' }}</h3>
      <p class="publish-sub">Choose how to read the pixels and where they go.</p>

      <div class="onb-field">
        <label class="onb-label">Pixels</label>
        <div class="onb-chips">
          <button class="onb-chip" :class="{ active: importProcess === 'filter' }" @click="importProcess = 'filter'">
            Pixel filter
          </button>
          <button class="onb-chip" :class="{ active: importProcess === 'original' }" @click="importProcess = 'original'">
            Original 1:1
          </button>
        </div>
        <p class="png-dims">
          {{ importProcess === 'filter'
            ? 'Resamples any image into pixel art (grid detection + palette).'
            : 'Keeps every pixel and color exactly as-is — images up to 256×256.' }}
        </p>
      </div>

      <div class="onb-field">
        <label class="onb-label">Add to</label>
        <div class="onb-chips">
          <button v-if="importPicked.length === 1" class="onb-chip" :class="{ active: importDest === 'replace' }" @click="importDest = 'replace'">
            Current canvas
          </button>
          <button class="onb-chip" :class="{ active: importDest === 'boards' }" @click="importDest = 'boards'">
            {{ importPicked.length > 1 ? 'Boards' : 'New board' }}
          </button>
          <button class="onb-chip" :class="{ active: importDest === 'frames' }" @click="importDest = 'frames'">
            Animation frames
          </button>
        </div>
        <p class="png-dims">
          {{ importDest === 'boards'
            ? (importPicked.length > 1 ? 'Each file becomes its own board on the desk.' : 'The file becomes a new board beside the others.')
            : importDest === 'frames'
              ? 'Files become the frames of one animation, in pick order (replaces the current canvas).'
              : 'Replaces the artwork on the current canvas.' }}
        </p>
      </div>

      <button class="btn primary wide" :disabled="importBusy" @click="confirmImport">
        <span class="icon icon-upload"/>
        <span>{{ importBusy ? 'Importing…' : 'Import' }}</span>
      </button>
      <button class="share-dismiss" @click="showImportModal = false">Cancel</button>
    </UiModal>

    <UiModal v-if="showDeleteConfirm" class="del-modal" @close="showDeleteConfirm = false">
          <h3 class="publish-heading">Delete this art?</h3>
          <p class="publish-sub">
            This artwork will be removed. If the tileset strip is showing sibling tiles the editor opens one; otherwise the canvas is cleared for a new one.
            This can't be undone.
          </p>
          <button class="btn block del-confirm-btn" :disabled="deleting" @click="destroyCurrent">
            <span class="icon icon-trash"/>
            <span>{{ deleting ? 'Deleting…' : 'Delete' }}</span>
          </button>
          <button class="share-dismiss" @click="showDeleteConfirm = false">Cancel</button>
      </UiModal>

    <EditorLoadBrowser
        v-if="showArtPicker"
        title="Load board"
        :items="browseBoards"
        :loading="auth.isLogged && pickerLoading"
        filterable
        new-label="Blank board"
        :empty-text="auth.isLogged ? 'No saved arts yet — publish one first.' : 'No local boards yet — draw something first.'"
        @select="onPickBoard"
        @create="onNewBlankBoard"
        @close="showArtPicker = false"
    />

    <Teleport to="body">
      <div
          v-if="boardMenu"
          class="board-menu-backdrop"
          @pointerdown="closeBoardMenu"
          @contextmenu.prevent="closeBoardMenu"
          @wheel="closeBoardMenu"
      >
        <div
            class="file-menu board-menu"
            :style="{ left: boardMenu.x + 'px', top: boardMenu.y + 'px' }"
            @pointerdown.stop
        >
          <button class="file-menu-item file-menu-danger" @click="hideBoard(boardMenu.id)">
            <span class="icon icon-eye-cross"/><span>Hide board</span>
          </button>
        </div>
      </div>
    </Teleport>

    <UiModal v-if="showLoginPrompt" @close="showLoginPrompt = false">
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
      </UiModal>
  </div>
</template>

<style scoped>

canvas.picker {
  cursor: crosshair;
}

canvas.select.sel-drag:not(.panning) {
  cursor: move;
}

.cv-hint {
  margin: 6px 2px 0;
  font-size: var(--text-2xs);
  line-height: var(--text-2xs-lh);
  color: var(--muted);
}

canvas.guide-v:not(.panning) { cursor: col-resize; }
canvas.guide-h:not(.panning) { cursor: row-resize; }

.pick-readout {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-right: auto; 
  padding: 0 0.25rem;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  color: var(--foreground);
  font-variant-numeric: tabular-nums;
}

.pick-swatch {
  flex: none;
  width: 1rem;
  height: 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.pick-hint {
  color: var(--muted);
}

.canvas-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  background: #1a1a1a;
  z-index: 3;
}

.px-loader {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
}

.px-loader span {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: var(--primary, #5b6ee1);
  opacity: 0.18;
  transform: scale(0.7);
  animation: px-pulse 1.15s ease-in-out infinite;
}

@keyframes px-pulse {
  0%, 70%, 100% {
    opacity: 0.18;
    transform: scale(0.7);
  }
  35% {
    opacity: 1;
    transform: scale(1);
  }
}

.canvas-fade-leave-active {
  transition: opacity 0.45s ease;
}

.canvas-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .px-loader span {
    animation-duration: 0s;
    opacity: 0.6;
    transform: none;
  }
}

.login-heading {
  font-size: var(--text-sm);
  line-height: var(--text-sm-lh);
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.png-modal .publish-heading {
  margin-bottom: 0;
}

.png-modal .publish-sub {
  margin-top: 0;
}

.png-dims {
  font-size: var(--text-sm);
  color: var(--muted);
}

.png-dims strong {
  color: var(--foreground);
  font-variant-numeric: tabular-nums;
}

.png-dims-src {
  margin-left: 0.25rem;
  font-size: var(--text-xs);
}

.del-modal .publish-heading {
  margin-bottom: 0;
}

.del-modal .publish-sub {
  margin-top: 0;
}

.del-confirm-btn {
  color: #fff;
  background: #ef4444;
  border-color: #ef4444;
}

@media (hover: hover) and (pointer: fine) {
  .del-confirm-btn:hover {
    background: #dc2626;
  }
}

.file-menu-danger {
  color: #ef4444;
}

.file-menu-danger .icon {
  color: #ef4444;
}

.board-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
}

.board-menu {
  position: fixed;
  min-width: 176px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-modal);
  overflow: hidden;
  animation: modalIn 140ms cubic-bezier(.22, .61, .36, 1);
}

.resize-fields {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
}

.resize-field {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-1);
}

.resize-field-label {
  font-size: var(--text-2xs);
  color: var(--muted);
}

.resize-input.wide {
  width: 100%;
  height: 2.5rem;
}

.resize-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  cursor: pointer;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: var(--radius-sm);
  transition: color var(--transition), border-color var(--transition), background var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .resize-link:hover {
    color: var(--foreground);
  }
}

.resize-link.active {
  color: var(--primary);
  border-color: var(--primary);
  background: color-mix(in oklab, var(--primary) 12%, var(--surface));
}

.resize-warn {
  display: flex;
  gap: var(--space-3);
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted);
  padding: 0.5rem 0.625rem;
  background: var(--surface-2);
  border-left: 2px solid #f59e0b;
  border-radius: var(--radius-sm);
}

.settings-chev { margin-left: auto; font-size: 14px; opacity: 0.45; }

.settings-sub {
  width: 290px;
  max-width: 86vw;

  max-height: min(70vh, 560px);
  overflow-y: auto;
}

.settings-back {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: none;
  border: 0;
  border-bottom: 1px solid var(--border);
  font-weight: 700;
  font-size: var(--text-sm);
  color: var(--foreground);
  cursor: pointer;
}
.settings-back .icon { font-size: 18px; }
.settings-back:hover { color: var(--primary); }

.settings-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
}

.bg-tabs {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-1);
  padding: var(--space-1);
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}

.bg-tab {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-2);
  padding: 6px 10px;
  background: transparent;
  border: 0;
  border-radius: calc(var(--radius-sm) - 2px);
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

.bg-tab-preview-none {
  background:
    linear-gradient(to top right, transparent calc(50% - 1px), var(--muted) calc(50% - 1px), var(--muted) calc(50% + 1px), transparent calc(50% + 1px)),
    var(--surface);
}

.bg-tab-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-3);
}

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

.bg-color-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0.625rem;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.bg-color-input {
  width: 44px;
  height: 44px;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius-sm);
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
  gap: var(--space-1);
}

.bg-color-preset {
  aspect-ratio: 1;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  padding: 0;
  transition: transform 140ms ease, border-color 140ms ease;
}

.bg-art-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
  max-height: 320px;
  overflow-y: auto;
  padding: 2px;
}

.bg-art-thumb {
  aspect-ratio: 1;
  background: var(--surface-2);
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
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

.bg-art-thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: var(--surface-2);
  color: var(--muted);
}

.bg-art-thumb-empty .icon {
  width: 18px;
  height: 18px;
}

.bg-art-thumb.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 35%, transparent);
}

.bg-art-thumb:not(:disabled):hover {
  border-color: var(--primary);
  transform: translateY(-1px);
}

.login-msg {
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  margin-bottom: 1rem;
}
</style>

<style>

.png-modal {
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.del-modal {
  max-width: 340px;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
</style>
