import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://tamarindmonkey.github.io',
  base: '/lan',
  integrations: [
    starlight({
      title: 'LAN/Services',
    }),
  ],
});
