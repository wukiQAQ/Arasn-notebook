import { defineConfig } from 'vite';
export default defineConfig({ resolve: { dedupe: ['react', 'react-dom'] }, build: { outDir: 'dist', emptyOutDir: true, rolldownOptions: { input: { original: 'index.html', round: 'round.html', studio: 'studio.html' } } } });
