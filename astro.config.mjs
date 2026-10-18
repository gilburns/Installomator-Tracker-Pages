import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://installomatortracker.org',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
