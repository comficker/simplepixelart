// The last breadcrumb's label, set by a detail page to its own title (the
// artwork, collection or tileset name) instead of a word made from the slug.
// Cleared on every route change, so a page that sets nothing reads the slug.
export function useCrumbTitle(title?: MaybeRefOrGetter<string | null | undefined>) {
  const state = useState<string>('crumb-title', () => '')
  if (title !== undefined) {
    const route = useRoute()
    watch([() => toValue(title), () => route.path], ([v]) => { state.value = v || '' }, {immediate: true})
    onBeforeUnmount(() => { state.value = '' })
  }
  return state
}
