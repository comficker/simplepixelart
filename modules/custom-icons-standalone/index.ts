import { defineNuxtModule } from '@nuxt/kit';
import iconStylesOptimized from './vite-plugin';

export default defineNuxtModule({
  meta: {
    name: 'custom-icons-standalone-module',
    configKey: 'customIcons',
  },

  setup(_, nuxt) {
    // Client build only: it writes one CSS file, and the server build running
    // it too doubled every rescan on save.
    nuxt.hook('vite:extendConfig', (config, {isClient}) => {
      if (!isClient) return
      // @ts-ignore
      config.plugins.push(iconStylesOptimized({
        whiteList: []
      }));
    });
    nuxt.options.css.push('./app/assets/css/icons.css');
  },
});
