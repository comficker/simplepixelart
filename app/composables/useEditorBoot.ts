export function useEditorBoot() {
  return useState<boolean>('editor-boot', () => false)
}
