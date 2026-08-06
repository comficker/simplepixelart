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

// Which tileset the ACTIVE board belongs to. Read from the art's own data
// (meta.tileset), stamped when it's opened from a tileset — so the strip follows
// board switches and no longer depends on the (soon-rewritten) ?tileset= URL.
const activeTilesetId = computed<string | null>(() => store.editorData?.meta?.tileset?.id || null)

const googleAuthUrl = computed(() => {
  const apiBase = (config.public.api as string) || ''
  if (typeof window === 'undefined') return `${apiBase}/auth/google`
  const next = `${window.location.origin}/auth/callback`
  return `${apiBase}/auth/google?state=${encodeURIComponent(next)}`
})

const showPublishModal = ref(false)
const publishStep = ref<'edit' | 'done'>('edit')

// PNG export scale picker
const showPngModal = ref(false)
const PNG_SCALES = [1, 2, 4, 8, 16, 32]
const pngScale = ref(8)

// Delete-this-art flow
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

// The current art is addable to a tileset only once it's a saved cloud art.
const isCurrentArtSaved = computed(() =>
    auth.isLogged && typeof editorData.value.id === 'number' && !!editorData.value.id_string,
)

// Open a tileset-strip tile. If it's already on the canvas as a board, just
// focus that board (activate + pan into view) — no reload, no duplicate.
// Otherwise bring the tile onto the canvas as a NEW board. `tsId` (the tileset
// the tile was opened from) keeps the new board bound to that tileset.
async function loadTileRef(idStr: string, tsId?: string) {
  if (!idStr) return
  // Live active board matches → re-center it.
  const live = editorData.value
  if (live && (String(live.id) === idStr || live.id_string === idStr)) {
    focusActiveBoard()
    return
  }
  // Another open board holds this art → make it active and pan it into view.
  const board = store.boards.find(b => b.id === idStr || b.data?.id_string === idStr)
  if (board) {
    store.setActiveBoard(board.id)
    focusActiveBoard()
    return
  }
  // Not on the canvas yet → add it as a new board. (store.load would rebuild the
  // whole workspace from the saved snapshot and DISCARD the clicked tile — that
  // was the "wrong board loads" bug.)
  canvasReady.value = false
  try {
    let data: any = null
    let ws: Record<string, any> = {}
    try { ws = JSON.parse(localStorage.getItem('workspaces') || '{}') } catch { /* ignore */ }
    if (ws[idStr]) {
      data = JSON.parse(JSON.stringify(ws[idStr]))        // guest tile (already staged)
    } else {
      const res = await useNativeFetch<any>(`/coloring/shared-pages/${idStr}/`)
      const mine = auth.logged?.id === res?.user?.id
      data = sharedPage2EditorData(res, mine
          ? {id: res.id, id_string: res.id_string, template: null}
          : {id: generateUUID(), id_string: '', template: res.id})
    }
    // Keep it bound to the tileset it was opened from (widget stays put).
    if (tsId) data.meta = {...(data.meta || {}), tileset: {id: tsId}}
    store.addBoardWithData(data)
    focusActiveBoard()
  } catch {
    toast.error('Could not open that tile')
  } finally {
    // Reveal once the next frame has painted the loaded art.
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => { canvasReady.value = true })
    } else {
      canvasReady.value = true
    }
  }
}

// Wipe local traces of an art so a deleted one can't be re-POSTed on reload.
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

// Delete the current art. If the tileset strip is showing sibling tiles, open
// one of them; otherwise clear the canvas to a fresh blank art.
async function destroyCurrent() {
  if (deleting.value) return
  deleting.value = true
  const id = editorData.value.id
  const idString = editorData.value.id_string
  const isCloud = auth.isLogged && typeof id === 'number' && !!idString

  // Prefer opening a sibling tile from the tileset shown in the strip.
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
  // Drop the deleted art from the collection strip's cached thumbnails.
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

function openPublish() {
  if (!auth.isLogged) {
    showLoginPrompt.value = true
    return
  }
  publishStep.value = 'edit'
  showPublishModal.value = true
}

async function saveArt() {
  // Honor the Public switch: ON → publish to the gallery, OFF → unlisted (saved
  // to your account, reachable only via its link — not listed anywhere).
  store.saveState(false)
  await store.saveNow()
  // Either way it's now on the cloud with a slug, so offer the share step — the
  // link works for unlisted art too, it just isn't listed in the gallery.
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
// ── Infinite-canvas camera (Phase 1) ──────────────────────────────────────
// The stage is a FIXED viewport; content is positioned by a camera instead of
// resizing the canvas to the art + scrolling. `cam` = screen-space (CSS px)
// where the board's (0,0) pixel lands; `zoom` is now fractional (px per art
// pixel). Draw math stays `screen = cam + artCoord * zoom`; `artOffset` is kept
// as an alias to `cam` so every existing draw fn keeps working unchanged.
const cam = ref({x: 0, y: 0});
const stageW = ref(384);   // stage CSS width  (set by fitCanvasToStage)
const stageH = ref(384);   // stage CSS height
let dpr = 1;
const ZOOM_MIN = 0.1;      // overview: whole board(s) small
const ZOOM_MAX = 64;       // deep pixel editing
const BOARD_ACTIVE = '#4f46e5';   // active-board ring + label accent
const DOT_W = 18, DOT_H = 16;     // kebab menu dot on each board's label row

// Touch/pen pointers can't hit the tiny kebab dot — grow its tap target then.
// Detected in onMounted (SSR-safe default = false).
const coarsePointer = ref(false);

// Per-board options popover (kebab dot / right-click). Screen coords (viewport).
const boardMenu = ref<{ id: string; x: number; y: number } | null>(null);

// Desk (infinite-canvas) appearance — workspace-level, persisted separately,
// configured via the Canvas modal (Settings → Canvas).
const DESK_BG = { dark: '#1b1b1f', light: '#eceef1' };
const deskBg = ref(DESK_BG.dark);                               // any hex color
const deskGrid = ref(true);
const deskGridStyle = ref<'solid' | 'dashed' | 'dots'>('solid');
const deskGridShape = ref<'square' | 'iso'>('square');         // world grid lattice
const deskGridColor = ref('');                                 // '' = auto (contrast with bg)
const deskGridCell = ref({ width: 1, height: 1 });             // cell size in art-px
const isCustomDeskBg = computed(() => {
  const c = deskBg.value.toLowerCase();
  return c !== DESK_BG.dark && c !== DESK_BG.light;
});
function setDeskCell(axis: 'width' | 'height', v: string) {
  const n = Math.max(1, Math.min(64, Math.round(Number(v) || 1)));
  deskGridCell.value = { ...deskGridCell.value, [axis]: n };
}

// Grid line/dot color that stays visible against the chosen background.
function deskIsLight(): boolean {
  const h = deskBg.value.replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 140;
}
// Grid line colour: the user's pick, else an auto contrast tint over the desk bg.
function deskGridColorEff(): string {
  if (deskGridColor.value) return deskGridColor.value;
  return deskIsLight() ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.13)';
}
const referenceImage = ref<HTMLImageElement | null>(null);
const referenceVisible = ref(true);
const referenceOpacity = 0.5;
// View preference: the title + kebab options drawn above each board. Persisted;
// loaded in onMounted (SSR-safe default = shown).
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
// False until the first canvas render completes (after async load). Drives the
// loading overlay so users never see an empty canvas while content loads.
const canvasReady = ref(false);
const hoverPos = ref<{ x: number; y: number } | null>(null);
const bgImage = ref<HTMLImageElement | null>(null);
let bgImageUrlCache = '';

// ===== Background picker (modal) =====
// Settings dropdown is a drill-down panel (no modals): 'main' list → a deeper
// view per option, with a Back button. Reset to 'main' each time it opens.
const settingsView = ref<'main' | 'resize' | 'bg' | 'canvas'>('main');
const bgTab = ref<'none' | 'transparent' | 'solid' | 'art'>('none');
const bgSolidColor = ref('#FFFFFF');
const myArts = ref<Array<{id: string; name: string; thumb: string}>>([]);
const loadingMyArts = ref(false);
const myArtsLoaded = ref(false);
// Background-picker thumbs 404 for art with no rendered image — show a clean tile.
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

// ===== Load an existing art onto the canvas as a new board =====
// Own state (separate from the bg picker's myArts). The LoadBrowser modal does
// search/order client-side, so we just fetch the 100 most-recent arts.
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
    // Own art → keep its id + slug so edits on the board save back to it.
    // Someone else's → bring an independent copy (fresh id, template link).
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

// ===== ?tileset=<id> — open every tile of a tileset as its own board =====
const TILESET_BOARDS_MAX = 60;  // cap so a huge tileset can't hang the editor

// Stamp the tileset membership onto an art so the editor (and the tileset
// strip) knows which tileset/tile it is, independent of the URL. It rides in
// `meta` → persists to the cloud art / local tile / workspace snapshot.
function stampTileset(ed: any, tsId: string, tid: number | string | null) {
  ed.meta = {...(ed.meta || {}), tileset: {id: tsId, ...(tid != null ? {tid} : {})}};
  return ed;
}

async function collectTilesetEds(tsId: string): Promise<any[]> {
  // Guest local-library tileset → the tiles carry their own pixel data.
  if (tsId.startsWith('local:')) {
    const ts = useLocalTilesets().get(tsId);
    return (ts?.tiles || []).slice(0, TILESET_BOARDS_MAX)
        .map(t => stampTileset(JSON.parse(JSON.stringify(t.ed)), tsId, t.tid));
  }
  // Cloud tileset → registry (id → slug); fetch the arts in parallel (capped).
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
        // Registry key is the page's numeric id (add-tile stores it as such).
        return stampTileset(ed, tsId, res.id);
      } catch {
        return null;   // skip a missing tile
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
  // Lay the arts out on a grid, then rebuild the multi-board workspace.
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
  await saveWorkspaceFull({boards, activeIndex: 0});   // IndexedDB — no quota ceiling
  await store.load(undefined);
}

// Guests have no cloud account — their boards live in localStorage.workspaces.
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

// Signed in → cloud arts; guest → local boards. Both feed the shared browser.
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

// Background image loader — client-only (Image / rAF unavailable in SSR)
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

// Offscreen art buffer at 1px-per-art-pixel, blitted (scaled, crisp) to the
// main canvas and minimap. The buffer PERSISTS across frames: a full rebuild
// (layers2MapNumbers over the whole canvas) costs ~10ms at 128² and must never
// run per frame. Instead, brush/eraser strokes patch only the pixels they
// touched — the store reports them via consumeRenderDirty() — so a drawing
// frame costs O(brush size), not O(canvas). A full rebuild happens only on
// structural changes (resize, undo/redo, color edits, layer ops, move/iso).
let artCanvas: HTMLCanvasElement | null = null;
let artCtx: CanvasRenderingContext2D | null = null;
let artImg: ImageData | null = null;
let artTurn = -1;
let artW = -1;
let artH = -1;

// Top-most painted color index at a canvas coordinate (respecting layer order
// + offsets). Used to recompute a single pixel after an edit/erase without
// re-merging the whole canvas. O(layers) — typically 1–3.
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
  // Already current for this draw-turn — nothing new to apply.
  if (artTurn === store.drawTurn && !sizeChanged) return artCanvas;

  const {full, keys} = store.consumeRenderDirty();
  const data = artImg.data;
  const rgb = ed.colors.map(c => hexToRgb(c));

  if (full || sizeChanged) {
    // Full rebuild — only on structural changes, never mid-stroke.
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
    // Incremental — patch only the pixels this stroke touched.
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

// Offscreen cache for the static background (base fill + checker / solid / art).
// Re-rendered only when canvas size, zoom, art size, grid mode or bg config
// change — not on every frame. Each draw then blits it with one drawImage.
let bgCanvas: HTMLCanvasElement | null = null;
let bgCtx: CanvasRenderingContext2D | null = null;
let bgCacheKey = '';
let sharedBgCanvas: HTMLCanvasElement | null = null;  // scratch for shared-layer composite

let isoPathCache: Path2D | null = null;
let isoCacheKey = '';

// Below this on-screen diamond width the lattice is illegible noise — and the
// per-diamond path (O(cols×rows) segments per board) gets catastrophically
// expensive when zoomed out over many boards (a FIT could stroke 250k+
// diamonds and freeze for seconds). Cull it instead.
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

const gridIconClass = computed(() => {
  const mode = editorData.value.meta?.iso?.mode ?? 'square';
  if (mode === 'iso') return 'icon icon-grid iso-rotated';
  if (mode === 'off') return 'icon icon-grid grid-off';
  return 'icon icon-grid';
});

// The active board (the one the tools edit).
const activeBoard = computed(() => store.boards.find(b => b.id === store.activeBoardId) || null)

// Where the ACTIVE board's origin lands on screen (CSS px) = camera + the
// board's world position × zoom. Kept named `artOffset` so every active-board
// draw fn (`screen = artOffset + coord*zoom`) and getPixelPos work unchanged.
const artOffset = computed(() => {
  const b = activeBoard.value
  const bx = b ? b.x : 0
  const by = b ? b.y : 0
  return {x: cam.value.x + bx * zoom.value, y: cam.value.y + by * zoom.value}
})

// Screen top-left (CSS px) of any board at world position (bx,by).
function boardScreen(bx: number, by: number) {
  return {x: Math.round(cam.value.x + bx * zoom.value), y: Math.round(cam.value.y + by * zoom.value)}
}

// Stage-local rect of a board's kebab-menu dot (top-right of the label row),
// or null when the board is too narrow to place it without hitting the name.
function boardDotRect(b: any): { x: number; y: number; w: number; h: number } | null {
  const bw = b.data.width * zoom.value;
  if (bw < 44) return null;
  const {x: sx, y: sy} = boardScreen(b.x, b.y);
  return {x: sx + bw - DOT_W, y: sy - DOT_H - 2, w: DOT_W, h: DOT_H};
}

// Tap target for the kebab dot. Same as the drawn dot for a mouse; on touch it
// grows up + left into the empty label gutter (never over the board's pixels)
// so a finger can reliably open the board menu.
function boardDotHitRect(b: any): { x: number; y: number; w: number; h: number } | null {
  const r = boardDotRect(b);
  if (!r || !coarsePointer.value) return r;
  const padX = 16, padY = 20;
  return {x: r.x - padX, y: r.y - padY, w: r.w + padX, h: r.h + padY};
}

// Board whose menu-dot is under the pointer (null = none). Topmost first.
function boardDotAt(e: MouseEvent | TouchEvent): any {
  if (!showBoardChrome.value) return null;   // dot is hidden → right-click still opens the menu
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
  // Keep the ~180px popover on-screen near the right/bottom edges.
  const x = typeof window !== 'undefined' ? Math.min(clientX, window.innerWidth - 190) : clientX;
  const y = typeof window !== 'undefined' ? Math.min(clientY, window.innerHeight - 90) : clientY;
  boardMenu.value = {id, x, y};
}

function closeBoardMenu() { boardMenu.value = null; }

// Right-click a board (its pixels or chrome) → open its options panel.
function onContextMenu(e: MouseEvent) {
  const b = boardAt(e) || boardChromeAt(e);
  if (!b) return;   // empty desk → leave the native menu alone
  e.preventDefault();
  openBoardMenu(b.id, e.clientX, e.clientY);
}

// Hide (remove) a board from the workspace. The art itself is untouched on the
// server — reopen it any time via File → Load art.
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

// ── Drag-resize of the active board (bottom-right anchored, matching the
// store's top-left-anchored resize) ────────────────────────────────────────
const isResizingBoard = ref(false);
const resizeMode = ref<'' | 'e' | 's' | 'se'>('');
const HANDLE_HIT = 11;   // grab tolerance (screen px)

function activeBoardRect(): { sx: number; sy: number; bw: number; bh: number } | null {
  const b = activeBoard.value;
  if (!b) return null;
  const z = zoom.value;
  const {x: sx, y: sy} = boardScreen(b.x, b.y);
  return {sx, sy, bw: b.data.width * z, bh: b.data.height * z};
}

// Which resize handle (if any) is under the pointer.
function handleAt(e: MouseEvent | TouchEvent): '' | 'e' | 's' | 'se' {
  const r = activeBoardRect();
  if (!r || r.bw < 36 || r.bh < 36) return '';   // too small to grab
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
    // live mutation (no history) — the size watcher is suppressed while resizing;
    // ensureArtBuffer/bg cache rebuild on the size change. History recorded on drop.
    editorData.value.width = w;
    editorData.value.height = h;
    scheduleDraw();
    scheduleMiniMap();
  }
}

function stopResizeBoard() {
  const active = isResizingBoard.value;
  isResizingBoard.value = false;
  resizeMode.value = '';
  if (active) store.resize({width: editorData.value.width, height: editorData.value.height});
}

// Topmost board under a pointer event (world hit-test), or null (empty desk).
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

// Board whose CHROME (the name label above it + a small frame margin) is under
// the pointer — used so clicking a board's name/edge also activates it.
function boardChromeAt(e: MouseEvent | TouchEvent): any {
  const {x: clientX, y: clientY} = getClientPos(e);
  const rect = canvas.value!.getBoundingClientRect();
  const px = clientX - rect.left, py = clientY - rect.top;
  for (let i = store.boards.length - 1; i >= 0; i--) {
    const b = store.boards[i]!;
    const {x: sx, y: sy} = boardScreen(b.x, b.y);
    const bw = b.data.width * zoom.value, bh = b.data.height * zoom.value;
    // board rect grown up by ~20px (label strip) and 6px on the other sides
    if (px >= sx - 6 && px <= sx + bw + 6 && py >= sy - 20 && py <= sy + bh + 6) return b;
  }
  return null;
}

// ── Move a board: drag its label bar (chrome) to reposition on the canvas ──
const isMovingBoard = ref(false);
const moveBoardId = ref('');
const boardMoveStart = ref({mx: 0, my: 0, bx: 0, by: 0});   // pointer world + board world at grab
let boardDidMove = false;                                    // distinguishes a drag (move) from a click (activate)

// ── Marquee-create: drag out a rectangle on empty desk to make a new board ──
const isMarquee = ref(false);
const marqueeStart = ref({x: 0, y: 0});   // world coords (art px, float)
const marqueeCur = ref({x: 0, y: 0});
const MARQUEE_MIN = 3;                     // min art-px per side to count as a create gesture

// Pointer → world position (art px, unrounded), independent of the active board.
function worldPos(e: MouseEvent | TouchEvent): { x: number, y: number } {
  const {x: clientX, y: clientY} = getClientPos(e);
  const rect = canvas.value!.getBoundingClientRect();
  return {
    x: (clientX - rect.left - cam.value.x) / zoom.value,
    y: (clientY - rect.top - cam.value.y) / zoom.value,
  };
}

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

// Center + fit the active board in the stage (load / "fit" action).
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

// Pan (keep zoom) so the active board is centered — used after adding a board.
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

// Fit ALL boards in the stage (workspace overview).
function fitAllBoards() {
  const bs = store.boards;
  if (!bs.length) { centerView(); return; }
  if (bs.length === 1) { centerView(); return; }
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

// Add a blank board of the given size, then show the whole workspace so the
// new board AND the existing ones are visible together.
function onAddBoard(size: number) {
  store.addBoard(size, size);
  fitAllBoards();
}

// Size the canvas backing store to its CSS box × DPR, drawing in CSS px.
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

// ================================================== //
// Zoom toward a fixed stage point (ax,ay in CSS px) — keeps that point put.
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

// Geometric steps so zooming out from a high pixel-zoom (e.g. 29×) reaches an
// overview in a few clicks; snap to whole numbers ≥1 to keep pixels crisp.
function zoomBy(factor: number) {
  let nz = zoom.value * factor;
  nz = nz >= 1 ? Math.max(1, Math.round(nz)) : nz;
  setZoomAnchored(nz, stageW.value / 2, stageH.value / 2);
}

function zoomIn() { zoomBy(1.5); }
function zoomOut() { zoomBy(1 / 1.5); }
// 100% = 1 art pixel : 1 CSS pixel, anchored at the stage centre.
function zoomTo100() { setZoomAnchored(1, stageW.value / 2, stageH.value / 2); }

// OS-aware modifier label for tooltips (detected after mount — SSR renders the
// Ctrl variant; tooltips only show on interaction, so no visible mismatch).
const isMacUA = ref(false);
const modK = computed(() => isMacUA.value ? '⌘' : 'Ctrl+');
const shiftK = computed(() => isMacUA.value ? '⇧' : 'Shift+');

// ── Fullscreen ─────────────────────────────────────────────────────────────
// Two modes: 'os' = the browser Fullscreen API (immersive, hides browser
// chrome); 'window' = a CSS-maximize overlay that fills the browser viewport
// but keeps tabs/URL bar. The layout is driven by a class on <html>
// (editor-fullscreen) rather than a class on the reactive .editor node, so it
// can be applied BEFORE first paint (setup + a pre-paint head script) — no
// flash when arriving at the editor, and no hydration mismatch on .editor.
const FS_KEY = 'editor_fullscreen';
const editorRoot = ref<HTMLElement | null>(null);
const fsMode = ref<'off' | 'os' | 'window'>('off');
// Restore a saved session synchronously (client) so the very first render is
// already fullscreen. OS FS needs a user gesture, so restore as in-window.
if (typeof window !== 'undefined') {
  try { const v = localStorage.getItem(FS_KEY); if (v && v !== 'off') fsMode.value = 'window'; } catch { /* ignore */ }
}
const isFullscreen = computed(() => fsMode.value !== 'off');

// The fullscreen boot veil lives globally (useEditorBoot): the router guard in
// app.vue raises it over the screen you're leaving the instant you navigate
// into the editor with fullscreen on, so the layout re-flow is hidden from the
// click — not flashed as a loader on the editor. Here we only clear it once the
// canvas has painted, keeping it up a small minimum so a fast load can't flash.
const editorBoot = useEditorBoot();
const fsBootAt = typeof performance !== 'undefined' ? performance.now() : 0;
const FS_BOOT_MIN_MS = 400;

// Reflect fullscreen onto <html> so layout CSS + scroll-lock apply from the
// first paint (immediate). Guarded for SSR.
watch(isFullscreen, (v) => {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('editor-fullscreen', v);
}, {immediate: true});

function enterOsFullscreen() {
  const el = editorRoot.value;
  if (el?.requestFullscreen) {
    el.requestFullscreen().catch(() => { fsMode.value = 'window'; });  // blocked → in-window
  }
  fsMode.value = 'os';   // optimistic; onFsChange keeps native state in sync
}

function enterWindowFullscreen() {
  fsMode.value = 'window';
}

function exitFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen();   // → onFsChange sets 'off'
  } else {
    fsMode.value = 'off';
  }
}

// Mirror native fullscreen exits (Escape / F11 / browser UI) — only affects OS mode.
function onFsChange() {
  if (!document.fullscreenElement && fsMode.value === 'os') fsMode.value = 'off';
}

// The site header (with its nav) is hidden in fullscreen, so offer a way out:
// back to the previous screen, or Home when the editor was opened directly.
const hasPreviousScreen = ref(false);
function goBack() {
  if (hasPreviousScreen.value) router.back();
  else router.push('/');
}

// Persist the fullscreen preference (restored synchronously above / by a
// pre-paint head script). Saved as the current mode.
watch(fsMode, (m) => {
  try { localStorage.setItem(FS_KEY, m); } catch { /* quota */ }
});

// Double-click a board → select it and engage its first layer (quick way out
// of board scope into editing, without hunting for the Layers panel).
function onDblClick(e: any) {
  const hit = boardAt(e);
  if (!hit) return;
  if (hit.id !== store.activeBoardId) store.setActiveBoard(hit.id);
  store.activateLayer(0);
}

// ================================================== //
function startDraw(e: any) {
  // Space-drag pans the camera instead of drawing (see startPan).
  if (spacePressed.value) return;
  // Right/middle mouse never draws — right-click is handled by onContextMenu.
  if ('button' in e && e.button !== 0) return;
  // Kebab dot on a board's label row → open its options panel (not a draw).
  const dotBoard = boardDotAt(e);
  if (dotBoard) {
    const {x, y} = getClientPos(e);
    openBoardMenu(dotBoard.id, x, y);
    if ('preventDefault' in e) e.preventDefault();
    return;
  }
  // Grab a resize handle on the active board?
  const hmode = handleAt(e);
  if (hmode) {
    isResizingBoard.value = true;
    resizeMode.value = hmode;
    if ('preventDefault' in e) e.preventDefault();
    return;
  }
  // Multi-board: a press on another board (or its name/frame) just activates
  // it. A drag on truly empty desk marquees out a new board. Only presses on
  // the active board draw.
  const hit = boardAt(e);
  if (!hit) {
    const chrome = boardChromeAt(e);
    if (chrome) {
      // Grab the label bar: a drag moves the board, a plain click activates it.
      isMovingBoard.value = true;
      moveBoardId.value = chrome.id;
      const w = worldPos(e);
      boardMoveStart.value = {mx: w.x, my: w.y, bx: chrome.x, by: chrome.y};
      boardDidMove = false;
      isStarted.value = true;
      if ('preventDefault' in e) e.preventDefault();
      return;
    }
    // Empty desk → start a marquee; a real drag creates a board on release.
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
  // Eyedropper: a click/touch on a pixel selects its colour (no draw, no hover).
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
      // Fallback board > layer > selection, driven by the active scope:
      // no layer active (and no selection) → reposition the whole board;
      // a layer active → move that layer; a selection active → move it.
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
      if (store.activeScope === 'selection' && !store.checkKeyInSelection(`${x}_${y}`)) break; // press outside selection → ignore
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
      if (!isPanning.value) store.paint(getPixelPos(e));   // bucket has its own case above
      break;
  }
  if (store.currentTool !== 'select') {
    needSave.value = true;
  }
  scheduleDraw();
  isStarted.value = true;
}

function draw(e: any) {
  // Resizing the active board takes over the drag.
  if (isResizingBoard.value) {
    if ('touches' in e) e.preventDefault();
    doResizeBoard(e);
    return;
  }
  // Marquee-creating a board takes over the drag.
  if (isMarquee.value) {
    if ('touches' in e) e.preventDefault();
    marqueeCur.value = worldPos(e);
    scheduleDraw();
    return;
  }
  // Moving a board by its label bar takes over the drag.
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
  // Track hover position for brush-preview overlay
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
  // Reuse `pos` from above — avoids extra getBoundingClientRect (forced layout) per move.
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
    // A tiny drag (or plain click) is not a create gesture — just clear it.
    if (w >= MARQUEE_MIN && h >= MARQUEE_MIN) {
      store.addBoard(Math.round(w), Math.round(h), {x: Math.round(x0), y: Math.round(y0)});
    }
    cancelScheduledDraw();
    drawEditor();
    drawMiniMap();
    return;
  }
  if (isMovingBoard.value) {
    isMovingBoard.value = false;
    isStarted.value = false;
    needSave.value = false;                  // board move is layout, not art — no history entry
    const id = moveBoardId.value;
    moveBoardId.value = '';
    if (boardDidMove) {
      store.saveWorkspaceLayout();           // persist the new position
    } else if (id !== store.activeBoardId) {
      store.setActiveBoard(id);              // no drag → select the board (board scope)
    } else {
      store.layerActive = false;             // re-click own label → drop to board scope
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

// Wheel: plain scroll pans the camera; ctrl/cmd + wheel zooms toward the cursor.
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
    const t1 = e.touches[0]!;
    const t2 = e.touches[1]!;
    const newDistance = Math.sqrt((t1.clientX - t2.clientX) ** 2 + (t1.clientY - t2.clientY) ** 2);
    if (initialDistance.value < 1) return;   // degenerate pinch (both touches at one point) — no ratio
    const ratio = newDistance / initialDistance.value;
    // Anchor the zoom to the pinch midpoint (stage-local CSS px).
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

// Single-key tool shortcuts (see handleKeyDown). 'm' routes via toggleSelect.
const TOOL_KEYS: Record<string, string> = {
  b: 'brush', l: 'iso-line', g: 'bucket', e: 'eraser', v: 'move', m: 'select',
};

function handleKeyDown(e: any) {
  const activeElement = document.activeElement;
  const isInputActive = activeElement?.tagName === 'INPUT' ||
      activeElement?.tagName === 'TEXTAREA' ||
      activeElement?.hasAttribute('contenteditable');

  if (isInputActive) return;

  // Escape leaves in-window fullscreen (OS fullscreen handles its own Escape).
  if (e.key === 'Escape' && fsMode.value === 'window') {
    fsMode.value = 'off';
    e.preventDefault();
    return;
  }

  // Hold Space to pan the camera by dragging (grab cursor via .panning).
  if (e.code === 'Space') {
    spacePressed.value = true;
    e.preventDefault();
    return;
  }

  const mod = e.ctrlKey || e.metaKey;
  const key = (e.key || '').toLowerCase();   // Shift makes e.key uppercase — normalize

  if (mod && key === 'z') {
    // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo.
    e.shiftKey ? store.redo() : store.undo();
    e.preventDefault();
  } else if (mod && key === 'y') {
    // Ctrl+Y — Windows-style redo.
    store.redo();
    e.preventDefault();
  } else if (mod && (key === '=' || key === '+')) {
    zoomIn();
    e.preventDefault();
  } else if (mod && key === '-') {
    zoomOut();
    e.preventDefault();
  } else if (!mod && !e.altKey && TOOL_KEYS[key] && !e.repeat) {
    // Single-key tool switching (industry-standard letters; tooltips teach them).
    if (key === 'm') toggleSelect();
    else store.setTool(TOOL_KEYS[key]!);
    e.preventDefault();
  } else if (!mod && !e.altKey && key >= '1' && key <= '5'
      && (store.currentTool === 'brush' || store.currentTool === 'eraser')) {
    store.setBrushSize(Number(key));
    e.preventDefault();
  } else if (!mod && (e.key === 'Backspace' || e.key === 'Delete')) {
    // Act on the active scope. Board scope (no layer active) → remove the board
    // from the editor; selection/layer scope → clear (clearCurrentLayer already
    // limits itself to the selection when one is active, else the whole layer).
    if (store.activeScope === 'board' && store.boards.length > 1) {
      hideBoard(store.activeBoardId);
    } else {
      store.clearCurrentLayer();
    }
    e.preventDefault();
  }
  // Anything else (Cmd+R, Cmd+F, Cmd+S, …) is left to the browser.
}

// Backgrounding a tab (app switch, lock, tab close) freezes pending timers and,
// on mobile, usually skips beforeunload — so the debounced artwork save and the
// camera timer would be lost. Persist both synchronously when the page hides.
function flushOnHide() {
  if (camSaveTimer) { clearTimeout(camSaveTimer); camSaveTimer = null; }
  try { localStorage.setItem('workspace_camera', JSON.stringify({x: cam.value.x, y: cam.value.y, z: zoom.value})); } catch { /* quota */ }
  store.flush();
}

function onVisibilityChange() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flushOnHide();
}

// Losing window focus eats the Space keyup — reset the pan modifier so the
// editor doesn't come back stuck in grab/pan mode.
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

// ================================================== //
// Fixed editor colors — independent of theme
const EDITOR_BG = '#1a1a1a';
const EDITOR_CELL_A = '#ffffff';
const EDITOR_CELL_B = '#cccccc';
const EDITOR_ART_BG_SOLID = '#ffffff';

// Renders the static background into an offscreen canvas and caches it. The
// expensive checkerboard loop (O(width*height) fillRects) only runs when an
// input actually changes, instead of on every rAF frame.
// Board background rendered at ART resolution (1px per art pixel), cached on
// art config only — NOT on cam/zoom, so panning/zooming never rebuilds it.
// It is blitted (scaled by zoom) onto the stage at the camera offset.
function renderBackgroundCache(): HTMLCanvasElement | null {
  const w = editorData.value.width;
  const h = editorData.value.height;
  const mode = editorData.value.meta?.iso?.mode ?? 'square';
  const bg = store.bgConfig;
  const bgUrl = bg.type === 'art' && bgImage.value ? bgImageUrlCache : '';
  // Shared background layers are baked into the cached bg — UNLESS we're editing
  // the shared stack itself (then it's the live art buffer, drawn plain).
  const showShared = store.sharedLayers.length > 0 && !store.editingShared;

  const key = `${w}_${h}|${mode}|${bg.type}|${bg.color}|${bgUrl}|sh${showShared ? store.sharedRev : 'x'}`;
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

  // Art-area content (solid / image / transparency checker / iso fallback)
  if (bg.type === 'solid') {
    c.fillStyle = bg.color;
    c.fillRect(0, 0, w, h);
  } else if (bg.type === 'art' && bgImage.value) {
    c.drawImage(bgImage.value, 0, 0, w, h);
  } else if (bg.type === 'transparent') {
    // no fill, no checker — the desk shows through, so only the art reads
  } else if (mode === 'square') {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        c.fillStyle = (x + y) % 2 === 0 ? EDITOR_CELL_A : EDITOR_CELL_B;
        c.fillRect(x, y, 1, 1);
      }
    }
  } else {
    c.fillStyle = EDITOR_ART_BG_SOLID;
    c.fillRect(0, 0, w, h);
  }

  // Shared static-background layers, composited beneath every frame.
  if (showShared) {
    if (!sharedBgCanvas) sharedBgCanvas = document.createElement('canvas');
    compositeFrame(sharedBgCanvas, toRaw(store.sharedLayers), w, h, toRaw(editorData.value.colors));
    c.imageSmoothingEnabled = false;
    c.drawImage(sharedBgCanvas, 0, 0, w, h, 0, 0, w, h);
  }

  bgCacheKey = key;
  return bgCanvas;
}

// Desk — the infinite canvas the boards float on (color + optional world grid).
function drawDesk(): void {
  if (!ctx) return;
  const sw = stageW.value, sh = stageH.value;
  ctx.clearRect(0, 0, sw, sh);
  ctx.fillStyle = deskBg.value || EDITOR_BG;
  ctx.fillRect(0, 0, sw, sh);
  if (!deskGrid.value) return;
  const color = deskGridColorEff();
  if (deskGridShape.value === 'iso') { drawDeskGridIso(sw, sh, color); return; }
  // Rectangular world grid at the chosen cell size, each axis coarsened (×2)
  // independently so it never becomes a solid fill when zoomed out.
  let cw = Math.max(1, deskGridCell.value.width), ch = Math.max(1, deskGridCell.value.height);
  let sx = cw * zoom.value, sy = ch * zoom.value;
  while (sx > 0 && sx < 6) { cw *= 2; sx = cw * zoom.value; }
  while (sy > 0 && sy < 6) { ch *= 2; sy = ch * zoom.value; }
  if (!isFinite(sx) || !isFinite(sy) || sx < 4 || sy < 4) return;
  // Anchor to the WORLD origin (camera), not the active board's origin. The grid
  // is locked to the desk's pixel coordinates, so it lines up with every board's
  // pixels AND stays put when you drag a single board around (only that board
  // moves). Panning moves grid + boards together, so they never drift apart.
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

// Isometric (dimetric) world lattice — two diagonal line families, anchored to
// the world origin like the square grid so it stays locked to the desk. Diamond
// spans the chosen cell size (width×height art-px); a 2×1 cell gives classic 2:1.
function drawDeskGridIso(sw: number, sh: number, color: string): void {
  if (!ctx) return;
  let cw = Math.max(1, deskGridCell.value.width), ch = Math.max(1, deskGridCell.value.height);
  let W = cw * zoom.value, H = ch * zoom.value;   // diamond width/height on screen
  while (W > 0 && (W < 8 || H < 6)) { cw *= 2; ch *= 2; W = cw * zoom.value; H = ch * zoom.value; }
  if (!isFinite(W) || !isFinite(H) || W < 6 || H < 4) return;
  const m = H / W;                         // edge slope
  const cx = cam.value.x, cy = cam.value.y;
  if (deskGridStyle.value === 'dots') {
    ctx.fillStyle = color;
    const hx = W / 2, hy = H / 2;
    const p0 = Math.floor(-cx / hx) - 1, p1 = Math.ceil((sw - cx) / hx) + 1;
    const q0 = Math.floor(-cy / hy) - 1, q1 = Math.ceil((sh - cy) / hy) + 1;
    for (let p = p0; p <= p1; p++) {
      for (let q = q0; q <= q1; q++) {
        if (((p + q) & 1) !== 0) continue;   // only diamond vertices
        ctx.fillRect(Math.round(cx + p * hx) - 0.5, Math.round(cy + q * hy) - 0.5, 1.5, 1.5);
      }
    }
    return;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(deskGridStyle.value === 'dashed' ? [3, 4] : []);
  ctx.beginPath();
  const b0 = cy - m * cx;                                   // family ↘ (slope +m)
  for (let b = b0 + Math.ceil((-m * sw - b0) / H) * H; b <= sh; b += H) {
    ctx.moveTo(0, Math.round(b) + 0.5);
    ctx.lineTo(sw, Math.round(m * sw + b) + 0.5);
  }
  const c0 = cy + m * cx;                                   // family ↗ (slope -m)
  for (let c = c0 + Math.ceil((-c0) / H) * H; c <= sh + m * sw; c += H) {
    ctx.moveTo(0, Math.round(c) + 0.5);
    ctx.lineTo(sw, Math.round(-m * sw + c) + 0.5);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

// Shadowed white sheet so a board reads as paper on the desk.
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

// The ACTIVE board's sheet + background (its live pixels come from drawPixels).
function drawBackground(): void {
  if (!ctx) return;
  const w = editorData.value.width;
  const h = editorData.value.height;
  const z = zoom.value;
  const ox = Math.round(artOffset.value.x);
  const oy = Math.round(artOffset.value.y);
  // Transparent bg: no paper sheet either, so only the art shows on the desk.
  if (store.bgConfig.type !== 'transparent') drawSheet(ox, oy, w * z, h * z);
  const bg = renderBackgroundCache();
  if (bg) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0, w, h, ox, oy, w * z, h * z);
  }
}

// Per-board composite (bg + pixels) at ART resolution, cached until the board
// set changes (boardsRev). Only NON-active boards use it — the active board is
// drawn live. Cheap: rebuilt lazily, one drawImage to blit.
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
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        cx.fillStyle = (x + y) % 2 === 0 ? EDITOR_CELL_A : EDITOR_CELL_B;
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
    // Iso overlay per board — grid mode is a workspace setting, so every board
    // (not just the active one) shows the iso lattice when the mode is iso.
    drawBoardIsoOverlay(b.data, sx, sy);
  }
}

// Iso lattice for one board's rect, in screen space. No-op unless that board is
// in iso mode. Uses a fresh Path2D (the active board's getIsoPath cache is
// keyed to the live art, so we don't touch it here).
function drawBoardIsoOverlay(data: any, sx: number, sy: number): void {
  if (!ctx) return;
  const iso = data?.meta?.iso;
  if (!iso || iso.mode !== 'iso') return;
  const w = data.width, h = data.height;
  const cell = iso.cell ?? {width: 2, height: 1};
  // LOD + viewport cull (see ISO_MIN_CELL_PX): sub-pixel lattices are noise and
  // stroking them per board per frame is what made zoomed-out views crawl.
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

// Frames + name labels + the active-board ring, drawn on top of everything.
function drawBoardChrome(): void {
  if (!ctx) return;
  const z = zoom.value;
  for (const b of store.boards) {
    const w = b.data.width, h = b.data.height;
    const {x: sx, y: sy} = boardScreen(b.x, b.y);
    const bw = w * z, bh = h * z;
    const active = b.id === store.activeBoardId;
    // Transparent boards carry no paper sheet, so no frame border either — just
    // the art floating on the desk.
    if (b.data.meta?.bg?.type !== 'transparent') {
      ctx.strokeStyle = active ? BOARD_ACTIVE : 'rgba(0,0,0,0.35)';
      ctx.lineWidth = active ? 2 : 1;
      const inset = active ? 1 : 0.5;
      ctx.strokeRect(sx + inset, sy + inset, bw - inset * 2, bh - inset * 2);
    }
    if (showBoardChrome.value) {
      // Label above the board (name + size); readable at reasonable zoom.
      ctx.font = '600 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = active ? BOARD_ACTIVE : 'rgba(120,120,132,0.95)';
      ctx.textBaseline = 'bottom';
      const label = `${b.data.name || 'Untitled'}  ${w}×${h}`;
      ctx.fillText(label, sx, sy - 5);

      // Kebab options dot on the label row (top-right) — click/right-click to
      // open the board's panel. Same colour as the label.
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

    // Resize handles on the active board (bottom-right, right, bottom).
    if (active && bw >= 36 && bh >= 36) {
      const hs = 7;
      const dot = (hx: number, hy: number) => {
        ctx!.fillStyle = '#ffffff';
        ctx!.strokeStyle = BOARD_ACTIVE;
        ctx!.lineWidth = 1.5;
        ctx!.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        ctx!.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
      };
      dot(sx + bw, sy + bh);          // se corner
      dot(sx + bw, sy + bh / 2);      // right edge
      dot(sx + bw / 2, sy + bh);      // bottom edge
    }
  }
}

// Dashed preview of the board being marquee-dragged on empty desk, with a live
// pixel-size readout so the user knows what board they'll get.
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

// Onion skin — faded, color-tinted ghosts of the previous/next frames drawn
// under the current frame so you can animate against neighbours. Skipped while
// drawing (distracting) and during playback.
let onionPrevCanvas: HTMLCanvasElement | null = null;
let onionNextCanvas: HTMLCanvasElement | null = null;

function drawOnion(): void {
  if (!ctx) return;
  if (!store.onionSkin || !store.isAnimated || store.isPlaying || isDrawing.value) return;
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
    // Directional tint: keep the art readable but hint prev (red) / next (blue).
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
  drawDesk();              // infinite-canvas backdrop
  drawInactiveBoards();    // other boards (frozen composites)
  drawBackground();        // active board sheet + bg
  drawReference();
  drawOnion();
  drawPixels();            // active board live pixels
  drawIsoOverlay();
  drawBrushPreview();
  drawSelection();
  drawBoardChrome();       // frames, labels, active ring (on top)
  drawMarquee();           // new-board drag preview (topmost)
  // Minimap is decoupled — it only redraws on content/viewport change
  // (via scheduleMiniMap), not on every hover/brush-preview frame.
}

// ===== Pre-rendered playback =====
// Each frame is composited once into an offscreen canvas; the loop just blits
// the right buffer to the main canvas. Buttery-smooth even on large canvases
// (no per-frame re-composite). Driven by the shared store.isPlaying flag.
let playbackBuffers: HTMLCanvasElement[] = [];
let playbackTimer: ReturnType<typeof setTimeout> | null = null;
let playbackIndex = 0;

function buildPlaybackBuffers() {
  const ed = toRaw(editorData.value);
  const colors = toRaw(ed.colors);
  const list = store.frames.length ? store.frames : [{layers: ed.layers}];
  // Frame-only buffers — the shared background is already baked into the cached
  // bg and blitted behind these (see renderBackgroundCache).
  playbackBuffers = (list as any[]).map((f) => {
    const c = document.createElement('canvas');
    compositeFrame(c, toRaw(f.layers), ed.width, ed.height, colors);
    return c;
  });
}

function renderPlaybackFrame(i: number) {
  if (!ctx) return;
  drawDesk();
  drawInactiveBoards();
  drawBackground();
  drawReference();
  const buf = playbackBuffers[i];
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

function playbackTick() {
  const dur = store.frames[playbackIndex]?.duration ?? Math.round(1000 / store.fps);
  playbackTimer = setTimeout(() => {
    if (!store.isPlaying) return;
    let next = playbackIndex + 1;
    if (next >= store.frameCount) {
      if (!store.loopAnimation) { store.isPlaying = false; return; }
      next = 0;
    }
    playbackIndex = next;
    store.currentFrameIndex = next; // timeline highlight (plain ref — no recomposite)
    renderPlaybackFrame(next);
    playbackTick();
  }, dur);
}

function startPlayback() {
  if (!store.isAnimated) { store.isPlaying = false; return; }
  cancelScheduledDraw();
  buildPlaybackBuffers();
  playbackIndex = Math.max(0, Math.min(store.frameCount - 1, store.currentFrameIndex));
  renderPlaybackFrame(playbackIndex);
  playbackTick();
}

function stopPlayback() {
  if (playbackTimer) clearTimeout(playbackTimer);
  playbackTimer = null;
  playbackBuffers = [];
  // Re-bind editing layers to the frame we paused on, then draw normally.
  store.setActiveFrame(store.currentFrameIndex);
}

watch(() => store.isPlaying, (v) => {
  if (v) startPlayback();
  else stopPlayback();
});

function drawMiniMap() {
  if (!miniMap.value || !canvas.value || !miniMapCtx) return;

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

  // Blit the shared art buffer, scaled to the minimap. Nearest-neighbor keeps
  // the pixel-art look and costs one drawImage regardless of pixel count.
  const art = getArtCanvas();
  if (art) {
    miniMapCtx.imageSmoothingEnabled = false;
    miniMapCtx.drawImage(art, 0, 0, artW, artH, 0, 0, mmW, mmH);
  }

  // Viewport indicator — which art-pixels of the ACTIVE board the camera shows.
  // Measured from the board's own origin on screen (artOffset), so it stays
  // correct for boards that aren't at world (0,0).
  const visiblePixelX = (0 - artOffset.value.x) / zoom.value;
  const visiblePixelY = (0 - artOffset.value.y) / zoom.value;
  const visiblePixelW = stageW.value / zoom.value;
  const visiblePixelH = stageH.value / zoom.value;

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

// Size the minimap canvas to the active board's aspect ratio so the preview
// isn't stretched. Called on setup AND on board switch (different-shape boards).
function sizeMiniMap() {
  if (!miniMap.value) return;
  const parentW = miniMap.value.parentElement!.clientWidth;
  const parentH = miniMap.value.parentElement!.clientHeight || parentW;
  const artRatio = editorData.value.width / editorData.value.height;
  if (artRatio >= 1) {
    // Wider or square — fit width
    miniMap.value.width = parentW;
    miniMap.value.height = parentW / artRatio;
  } else {
    // Taller — fit height
    miniMap.value.height = parentH;
    miniMap.value.width = parentH * artRatio;
  }
  MINIMAP_SIZE.value = miniMap.value.width;
}

function setupCanvas() {
  updateCanvasSize();   // fit canvas backing store to the stage box
  centerView();         // fit + center the board in the stage
  sizeMiniMap();
  drawEditor();
  drawMiniMap();
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

function toggleBoardChrome() {
  showBoardChrome.value = !showBoardChrome.value;
  try { localStorage.setItem('editor_board_chrome', showBoardChrome.value ? '1' : '0'); } catch { /* quota */ }
  scheduleDraw();
}

function clearReference() {
  referenceImage.value = null;
  scheduleDraw();
}

function exportFile(type: string) {
  if (type === 'png') {
    // PNG opens a modal so the user can pick an export scale.
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
  // Render art-only canvas (no grid/bg/offset), upscaled by `scale`.
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
  // Use real frames when animated; fall back to the single current frame.
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

// ================================================== //
watch(
    () => editorData.value.id,
    () => {
      // Keep the URL pointed at the active cloud art. When a local-only art
      // (e.g. forwarded from Tileset Slicer) is first saved, its id changes
      // from a local UUID to a real id and it gains an id_string — replace the
      // route so F5 reloads the saved cloud art instead of the stale local copy
      // (which would otherwise create a duplicate on the next save).
      const idStr = editorData.value.id_string
      if (idStr && route.query.id !== idStr) {
        router.replace({query: {id: idStr}}).catch(() => {})
      }
    },
)

// Refit the canvas backing store whenever the stage box changes size.
let stageRO: ResizeObserver | null = null;
let stageInited = false;

onMounted(async () => {
  try { coarsePointer.value = window.matchMedia('(pointer: coarse)').matches; } catch { /* no matchMedia */ }
  try { showBoardChrome.value = localStorage.getItem('editor_board_chrome') !== '0'; } catch { /* ignore */ }
  // Restore desk appearance before the first paint.
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
    }
  } catch { /* ignore */ }
  initCanvas()
  if (route.query.tileset) {
    // Open every tile of a tileset as its own board (from the tileset editor).
    await loadTilesetBoards(String(route.query.tileset))
  } else if (route.query.new === 'true') {
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
  // Open-in-editor from a palette page (?palette=<id_string>): apply the chosen
  // palette to the freshly loaded art and link it, then drop the query param.
  if (route.query.palette) {
    try {
      const pal = await useNativeFetch<any>(`/coloring/palettes/${route.query.palette}/`)
      if (pal?.colors?.length) store.applyPalette(pal.colors, 'replace', pal.id)
    } catch (e) { /* palette gone — ignore */ }
    const q = {...route.query}; delete q.palette
    router.replace({query: q}).catch(() => {})
  }
  // Open-in-editor with an ad-hoc palette (?colors=RRGGBB,RRGGBB,…) from the
  // color tools (scheme / image extract) — apply without publishing first.
  if (route.query.colors) {
    const list = route.query.colors.toString().split(',')
        .map(c => '#' + c.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase())
        .filter(c => c.length === 7)
    if (list.length) store.applyPalette(list, 'replace')
    const q = {...route.query}; delete q.colors
    router.replace({query: q}).catch(() => {})
  }
  setupCanvas()
  // Keep the fixed-viewport canvas in sync with its stage box. The first
  // callback (fired on observe) is authoritative for the initial size, so we
  // re-center the board there; later resizes only refit (camera unchanged).
  if (typeof ResizeObserver !== 'undefined' && canvas.value?.parentElement) {
    stageRO = new ResizeObserver(() => {
      updateCanvasSize();
      if (!stageInited) { stageInited = true; centerView(); }
      scheduleDraw();
      scheduleMiniMap();
    });
    stageRO.observe(canvas.value.parentElement);
  }
  // Restore the saved camera (pan + zoom) so a refresh reopens the exact view —
  // for a single board too, not just multi-board. ?new=true starts fresh; with
  // no saved camera we fall back to the fitted centerView from setupCanvas.
  if (route.query.new !== 'true') {
    try {
      const sc = JSON.parse(localStorage.getItem('workspace_camera') || 'null');
      if (sc && isFinite(sc.z) && isFinite(sc.x) && isFinite(sc.y)) {
        cam.value = {x: sc.x, y: sc.y};
        zoom.value = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, sc.z));
        stageInited = true;   // don't let the ResizeObserver re-center over this
        scheduleDraw();
        scheduleMiniMap();
      }
    } catch { /* ignore */ }
  }
  setupKeyListeners()

  // Is there an in-app screen to go back to? (Vue Router records the previous
  // route on history.state.back; null on a direct load → offer Home instead.)
  hasPreviousScreen.value = !!(window.history.state && window.history.state.back);
  isMacUA.value = /Mac|iPhone|iPad/.test(navigator.platform);

  // Reveal the canvas only after its first frame is painted, so the loading
  // overlay fades out onto real content (no flash of empty canvas). A second
  // frame drops the fullscreen boot veil once the re-flowed layout has settled.
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => {
      canvasReady.value = true
      // Clear the fullscreen boot veil once the canvas has painted, but keep it
      // up a minimum ~0.4s so a fast load doesn't flash it. If the load already
      // took that long, it clears immediately (no artificial delay). No-op when
      // the veil was never raised (hard load / non-fullscreen nav).
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
  stageRO?.disconnect();
  stageRO = null;
  store.isPlaying = false
  store.resetEditorData()
  clearListeners()
  // Leaving the editor drops fullscreen layout from <html> (also handles the
  // back/home navigation while fullscreen).
  if (typeof document !== 'undefined') document.documentElement.classList.remove('editor-fullscreen')
})

watch(() => store.drawTurn, () => {
  if (store.isPlaying) return   // playback drives the canvas itself
  scheduleDraw()
  scheduleMiniMap()
})

// Board set changed (add / remove / switch) — redraw the whole workspace.
watch(() => store.boardsRev, () => {
  scheduleDraw()
  scheduleMiniMap()
})

// Desk appearance is a persisted workspace preference; redraw on change.
watch([deskBg, deskGrid, deskGridStyle, deskGridShape, deskGridColor, deskGridCell], () => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('workspace_desk', JSON.stringify({
        bg: deskBg.value, grid: deskGrid.value, style: deskGridStyle.value,
        shape: deskGridShape.value, color: deskGridColor.value, cell: deskGridCell.value,
      }));
    } catch { /* quota */ }
  }
  scheduleDraw();
});

// Persist the camera (pan + zoom) so the workspace reopens where you left it.
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

// Onion-skin toggle changes what's drawn under the current frame.
watch(() => store.onionSkin, () => scheduleDraw())

// Refit only when the ACTIVE board is genuinely resized — NOT when switching to
// a different-size board (that would jump the zoom on every board click; we keep
// the user's current camera instead).
let lastActiveBoardId = '';
watch(
    // Size key is "WxH" (not a sum — 16×32 → 32×16 must still fire).
    () => [store.activeBoardId, `${editorData.value.width}x${editorData.value.height}`] as const,
    ([id]) => {
      const switched = id !== lastActiveBoardId;
      lastActiveBoardId = id;
      newSize.value = {width: editorData.value.width, height: editorData.value.height};
      // Board switch keeps the camera; live drag-resize handles its own redraw —
      // neither should trigger a setupCanvas refit (that would jump the view).
      // But the minimap must re-fit the new board's aspect so it isn't stretched.
      if (switched || isResizingBoard.value) { if (switched) sizeMiniMap(); scheduleDraw(); scheduleMiniMap(); return; }
      setupCanvas();
    }
);

</script>

<template>
  <div ref="editorRoot" class="editor" :style="{'--editor-width': EDITOR_SIZE + 'px','--editor-minimap-size': MINIMAP_SIZE + 'px'}">
    <!-- Top toolbar -->
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
              <button class="file-menu-item" @click="store.importImage()">
                <span class="icon icon-upload"/><span>Import file</span>
              </button>
              <button class="file-menu-item" @click="store.insertImage()">
                <span class="icon icon-image"/><span>Insert image</span>
              </button>
              <button class="file-menu-item" @click="showStripImport = true">
                <span class="icon icon-select"/><span>Import sprite strip</span>
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
              </template>
            </div>
          </template>
        </ui-dropdown-menu>
        <ui-dropdown-menu label="Settings" class="settings-dd">
          <ui-tooltip text="Settings">
            <button class="toolbar-btn" aria-label="Settings" @click="settingsView = 'main'"><span class="icon icon-cog"/></button>
          </ui-tooltip>
          <template #menu>
            <!-- Main list -->
            <div v-if="settingsView === 'main'" class="file-menu" @click.stop>
              <button class="file-menu-item" @click="openResize">
                <span class="icon icon-ruler"/><span>Resize canvas</span><span class="icon icon-angle-right settings-chev"/>
              </button>
              <button class="file-menu-item" @click="openBgPicker">
                <span class="icon icon-image"/><span>Background</span><span class="icon icon-angle-right settings-chev"/>
              </button>
              <button class="file-menu-item" @click="store.cycleGridMode(); scheduleDraw()">
                <span :class="gridIconClass"/><span>Grid mode</span>
              </button>
              <button class="file-menu-item" @click="settingsView = 'canvas'">
                <span class="icon icon-grid"/><span>Canvas</span><span class="icon icon-angle-right settings-chev"/>
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
              <button class="file-menu-item" @click="store.clearCurrentLayer">
                <span class="icon icon-broom"/>
                <span>Clear current layer</span>
              </button>
              <button class="file-menu-item" @click="store.cleanupUnusedColors()">
                <span class="icon icon-auto-fix"/>
                <span>Cleanup unused colors</span>
              </button>
              <div class="file-menu-sep"/>
              <button class="file-menu-item file-menu-danger" @click="showDeleteConfirm = true">
                <span class="icon icon-trash"/>
                <span>Delete this art</span>
              </button>
            </div>

            <!-- Resize -->
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

            <!-- Background -->
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

            <!-- Canvas (desk) appearance -->
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
                  <label class="cv-label">Grid</label>
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
          </template>
        </ui-dropdown-menu>
      </div>
      <div class="toolbar-main no-scrollbar">
      <div class="toolbar-group">
        <ui-tooltip :text="`Undo (${modK}Z)`">
          <button class="toolbar-btn" aria-label="Undo" :disabled="!store.canUndo" @click="store.undo()"><span class="icon icon-undo"/></button>
        </ui-tooltip>
        <ui-tooltip :text="`Redo (${modK}${shiftK}Z)`">
          <button class="toolbar-btn" aria-label="Redo" :disabled="!store.canRedo" @click="store.redo()"><span class="icon icon-redo"/></button>
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
      <span class="toolbar-info">{{ editorData.width }}×{{ editorData.height }}</span>
      </div>
      <div class="toolbar-end">
        <ui-tooltip text="Save online & share — local work autosaves">
          <button class="publish-toolbar-btn tm-save" aria-label="Save online and share" @click="openPublish">
            <span class="icon icon-save"/>
          </button>
        </ui-tooltip>
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

    <div class="editor-body">
      <!-- Tool rail (left on desktop, horizontal strip on mobile) -->
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
          <ui-tooltip text="Eraser (E)">
            <Square aria-label="Eraser" @click="store.setTool('eraser')" :class="{ active: store.currentTool === 'eraser' }">
              <span class="icon icon-eraser"/>
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

          <!-- Animation: edits apply to all frames -->
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
                  :class="[store.currentTool, { panning: spacePressed }]"
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

        <!-- Collection + Layers split the canvas-driven leftover equally.
             The inner is absolute-filled so its (possibly tall) content never
             inflates the sidebar past the canvas column. -->
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
                <button class="layer-add" @click="store.addLayer" title="Add new layer" aria-label="Add new layer">
                  <span class="icon icon-plus"/>
                </button>
              </template>
          <ul>
            <li
                v-for="(_, index) in editorData.layers"
                :key="index"
                :class="{ active: index === store.currentLayerIndex && store.activeScope !== 'board' }"
                @click="store.activateLayer(index)"
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
      </div>
    </div>

    <!-- Animation timeline (frames) -->
    <EditorTimeline class="editor-timeline"/>

    <!-- Palette library / image-extract / save-current -->
    <EditorPalettePicker v-model:open="showPalettePicker"/>
    <EditorStripImport v-model:open="showStripImport"/>

    <!-- Publish modal -->
    <UiModal v-if="showPublishModal" @close="showPublishModal = false">
          <!-- Step 1: Edit info -->
          <template v-if="publishStep === 'edit'">
            <h3 class="publish-heading">Save your pixel art</h3>
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
                <span class="text-xs text-muted">{{ editorData.is_public ? '— listed in the gallery' : '— unlisted · only people with the link' }}</span>
              </div>
            </div>
            <div class="publish-actions">
              <button class="btn primary block" @click="saveArt">
                Save
              </button>
              <button class="btn block" @click="showPublishModal = false">
                Cancel
              </button>
            </div>
          </template>

          <!-- Step 2: Share result -->
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

    <!-- Onboarding / Get started -->
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

    <!-- PNG export scale -->
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

    <!-- Delete confirm -->
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

    <!-- Load art onto the canvas as a new board -->
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

    <!-- Per-board options popover (kebab dot / right-click) -->
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

    <!-- Login prompt -->
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
/* ===== Find-color (picker) tool ===== */
canvas.picker {
  cursor: crosshair;
}

.pick-readout {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-right: auto; /* keep the action buttons pinned right */
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

/* ===== Canvas loading overlay ===== */
.canvas-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Matches the editor canvas background so the reveal feels seamless */
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

/* Fade the overlay out once the first frame is painted */
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

/* ===== PNG export modal ===== */
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

/* Per-board options popover (kebab dot / right-click) */
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

/* Settings dropdown drill-down: main list has trailing chevrons; a sub-view is
   a Back header + the option's form, inline in the same panel (no modal). */
.settings-chev { margin-left: auto; font-size: 14px; opacity: 0.45; }

.settings-sub { width: 290px; max-width: 86vw; }

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

/* Transparent (no background): a diagonal "none" stroke on a plain swatch. */
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

/* Solid color tab */
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

/* Art picker tab */
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
/* Modal variant sizing — unscoped: these classes land on UiModal's
   inner div (rendered by the shared component, outside this scope). */
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
