import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages sert un site de projet sous https://<user>.github.io/<repo>/ :
  // le build doit donc connaître ce sous-chemin pour générer les bons liens
  // vers les assets (JS/CSS). Si le repo GitHub ne s'appelle pas "PharmaOS",
  // remplacez la valeur ci-dessous par "/<nom-exact-du-repo>/".
  base: '/PharmaOS/',
  server: {
    port: 5174,
  },
  build: {
    outDir: 'dist',
  },
});
