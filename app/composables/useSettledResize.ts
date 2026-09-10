import type {Ref} from 'vue'
import {debounce} from '~/helper/utils'

export function useSettledResize(target: Ref<HTMLElement | null | undefined>, apply: () => void, delay = 150) {
    let obs: ResizeObserver | null = null
    let primed = false
    const applySettled = debounce(apply, delay)

    onMounted(() => {
        if (typeof ResizeObserver === 'undefined') return
        obs = new ResizeObserver(() => {
            if (primed) applySettled()
            else {
                primed = true
                apply()
            }
        })
        watch(target, (el, _old, onCleanup) => {
            if (!el) return
            obs?.observe(el)
            onCleanup(() => obs?.unobserve(el))
        }, {immediate: true})
    })

    onBeforeUnmount(() => {
        obs?.disconnect()
        obs = null
    })
}
