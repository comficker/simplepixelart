export default defineI18nConfig(() => ({
  legacy: false,
  // A key with no translation yet renders as the key itself: /ja was showing 95
  // raw strings like "c_FooterBar.contact". Falling back to English means a
  // surface can be translated at a time without the rest looking broken.
  fallbackLocale: 'en',
  // The fallback is expected while translation is in progress, so do not fill
  // the console with a warning for every one of them.
  missingWarn: false,
  fallbackWarn: false,
}))
