import useStatefulCookie from '~/composables/useStatefulCookie'

export interface AgentGrid {
    colors: string[]
    pixels: Record<string, number>
    w: number
    h: number
}

export interface AgentTurn {
    role: 'user' | 'agent'
    text: string
    // Set on an agent turn that proposed something the user has not answered
    // yet: a redraw waiting for a yes.
    redrawPrompt?: string
    // A proposal that has come back: the picture the model drew, the grid it
    // reconstructs to for this board — what the board will actually receive —
    // and the same art at the size the model drew it, for a board of its own.
    image?: string
    grid?: AgentGrid
    origGrid?: AgentGrid
    done?: string
    // An ops turn that changed something: on touch it offers an Undo button,
    // since a keyboard shortcut is no use there.
    undoable?: boolean
}

const STORE_KEY = 'agent_sessions'
const MAX_TURNS = 40
const MAX_BOARDS = 12

type Sessions = Record<string, AgentTurn[]>

/** Proposals are dropped on the way to storage: a data URL is megabytes, and a
 *  suggestion nobody answered is not worth carrying across a reload. */
function persistable(turns: AgentTurn[]): AgentTurn[] {
    return turns.slice(-MAX_TURNS).map(({role, text, done}) => ({role, text, done}))
}

function read(): Sessions {
    if (!import.meta.client) return {}
    try {
        const raw = localStorage.getItem(STORE_KEY)
        const parsed = raw ? JSON.parse(raw) : {}
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch { return {} }
}

function write(sessions: Sessions) {
    if (!import.meta.client) return
    try {
        // Keep the most recent boards only, so a long-lived workspace does not
        // grow the key without bound.
        const entries = Object.entries(sessions).filter(([, t]) => t.length)
        const trimmed = Object.fromEntries(entries.slice(-MAX_BOARDS))
        localStorage.setItem(STORE_KEY, JSON.stringify(trimmed))
    } catch { /* private mode, or the quota — the conversation is not worth an error */ }
}

/**
 * The agent lives in the editor's right-hand rail, behind a tab.
 *
 * One conversation per board: a board is one piece of art, and asking "make the
 * helmet red" about a different sprite than the one on screen would be
 * nonsense. Sessions survive a reload, so F5 does not lose what was discussed.
 */
export const useAgentPanel = () => {
    const store = useEditor()
    // Whether the tab is open is worth keeping: someone mid-conversation who
    // reloads expects to still be in it. A cookie rather than localStorage so
    // the server renders the same thing the client does — read from storage
    // after hydration and the panel would pop in, or mismatch.
    const openCookie = useStatefulCookie('agent_open')
    const open = computed<boolean>({
        // Nuxt parses cookie values, so '1' comes back as the number 1 —
        // compare on the string form or the read never matches the write.
        get: () => String(openCookie.value ?? '') === '1',
        set: (value) => { openCookie.value = value ? '1' : '0' },
    })
    const busy = useState('agent-busy', () => false)
    const sessions = useState<Sessions>('agent-sessions', () => ({}))
    const loaded = useState('agent-sessions-loaded', () => false)

    if (import.meta.client && !loaded.value) {
        sessions.value = read()
        loaded.value = true
    }

    const boardKey = computed(() => String(store.activeBoardId || store.editorData?.id || 'board'))

    const turns = computed<AgentTurn[]>({
        get: () => sessions.value[boardKey.value] ?? [],
        set: (value) => {
            sessions.value = {...sessions.value, [boardKey.value]: value}
            write({...sessions.value, [boardKey.value]: persistable(value)})
        },
    })

    // A board changes id the first time it is saved to the cloud, which would
    // otherwise strand the conversation under the old key — the chat appeared
    // to vanish the moment a change was applied. Carry it across instead.
    if (import.meta.client) {
        watch(boardKey, (next, prev) => {
            if (!prev || !next || next === prev) return
            // Only when the old id is gone: that is the same board being
            // renumbered. If it still exists the user simply switched boards,
            // and each board keeps its own conversation.
            const renumbered = !store.boards?.some(b => String(b.id) === prev)
            if (!renumbered) return
            const carried = sessions.value[prev]
            if (!carried?.length || sessions.value[next]?.length) return
            const {[prev]: _dropped, ...rest} = sessions.value
            sessions.value = {...rest, [next]: carried}
            write({...rest, [next]: persistable(carried)})
        })
    }

    return {
        open,
        turns,
        busy,
        boardKey,
        toggle: () => { open.value = !open.value },
        close: () => { open.value = false },
        reset: () => { turns.value = [] },
    }
}
