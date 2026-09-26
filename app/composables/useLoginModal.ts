/**
 * The sign-in modal, opened from anywhere.
 *
 * Every "sign in" control used to be an `<a href>` straight to Google, which
 * left the username/password form reachable only from the editor's Publish
 * button. They all call `show()` now, so one modal serves the lot.
 *
 * State lives in `useState`, not a module-level ref: a module ref is shared by
 * every SSR request in the same process, so one visitor opening the modal
 * would render it open for whoever was served next.
 */
export default function useLoginModal() {
  const open = useState('login-modal', () => false)
  // What to run once the player is signed in -- the editor resumes the publish
  // it interrupted. Not part of `useState`: a function cannot be serialised
  // into the payload, and it is only ever set on the client.
  const onDone = useState<(() => void) | null>('login-modal-cb', () => null)
  // Which form the modal opens on. A "Register" control wants the second one
  // without the visitor having to find the switch at the bottom.
  const mode = useState<'login' | 'register'>('login-modal-mode', () => 'login')

  return {
    open,
    mode,
    show(after?: () => void, as: 'login' | 'register' = 'login') {
      onDone.value = after || null
      mode.value = as
      open.value = true
    },
    hide() {
      open.value = false
      onDone.value = null
    },
    done() {
      const cb = onDone.value
      onDone.value = null
      if (cb) cb()
    },
  }
}
