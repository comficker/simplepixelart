// One feedback card for the whole site (mounted in app.vue), opened from the
// header, the command palette, once after the first export in the editor, or
// once when someone leaves the editor having drawn but not exported.
export type FeedbackTrigger = 'export' | 'leave' | 'header' | 'command'

export function useFeedback() {
  const open = useState('feedback_open', () => false)
  const trigger = useState<FeedbackTrigger>('feedback_trigger', () => 'menu')
  function openFeedback(from: FeedbackTrigger) {
    trigger.value = from
    open.value = true
  }
  return {open, trigger, openFeedback}
}
