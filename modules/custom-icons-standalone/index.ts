import { defineNuxtModule } from '@nuxt/kit';
import iconStylesOptimized from './vite-plugin';

export default defineNuxtModule({
  meta: {
    name: 'custom-icons-standalone-module',
    configKey: 'customIcons',
  },

  setup(_, nuxt) {
    nuxt.hook('vite:extendConfig', (config) => {
      // @ts-ignore
      config.plugins.push(iconStylesOptimized({
        whiteList: []
      }));
    });
    nuxt.options.css.push('./app/assets/css/icons.css');
  },
});
