import type {Ref} from 'vue'

type Paginated = { links?: { next?: string | null; previous?: string | null } } | null | undefined

export function usePageLinks(data: Ref<Paginated>) {
    const route = useRoute()

    const page = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

    const href = (p: number) => {
        const q = new URLSearchParams()
        for (const [k, v] of Object.entries(route.query)) {
            if (k === 'page' || v == null) continue
            q.set(k, v.toString())
        }
        if (p > 1) q.set('page', String(p))
        const qs = q.toString()
        return qs ? `${route.path}?${qs}` : route.path
    }

    return {
        page,
        prevTo: computed(() => data.value?.links?.previous ? href(page.value - 1) : null),
        nextTo: computed(() => data.value?.links?.next ? href(page.value + 1) : null),
    }
}
