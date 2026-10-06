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
  // README and FAQ copy carries inline markup on purpose and is rendered
  // through v-html; the compiler side is already told so in nuxt.config.
  warnHtmlMessage: false,
  // Russian messages carry three forms ("one | few | many"); vue-i18n's
  // default rule reads three forms as "zero | one | many", which printed
  // "1 работы" for a single item.
  pluralRules: {
    ru(choice: number, choicesLength: number) {
      if (choicesLength < 3) return choice === 1 ? 0 : 1
      const n = Math.abs(choice) % 100
      const n1 = n % 10
      if (n > 10 && n < 20) return 2
      if (n1 === 1) return 0
      if (n1 >= 2 && n1 <= 4) return 1
      return 2
    },
  },
}))
