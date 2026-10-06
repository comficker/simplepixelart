/**
 * A styled stand-in for `window.confirm()`: `await confirm({...})` resolves
 * true on confirm, false on cancel/close. One `<UiConfirmHost/>` in app.vue
 * renders it with the shared modal chrome.
 *
 * Same `useState` split as the login modal: the options are plain data, the
 * resolver is only ever set on the client.
 */
export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  danger?: boolean
}

export default function useConfirm() {
  const options = useState<ConfirmOptions | null>('confirm-opts', () => null)
  const resolver = useState<((ok: boolean) => void) | null>('confirm-cb', () => null)

  function settle(ok: boolean) {
    const cb = resolver.value
    resolver.value = null
    options.value = null
    if (cb) cb(ok)
  }

  function confirm(opts: ConfirmOptions) {
    // A second ask while one is open cancels the first rather than stacking.
    if (resolver.value) settle(false)
    options.value = opts
    return new Promise<boolean>(resolve => { resolver.value = resolve })
  }

  return {options, confirm, settle}
}
