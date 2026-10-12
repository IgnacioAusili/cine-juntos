import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages publica el proyecto bajo una ruta que puede incluir el repo.
  base: "./",
  // Los recursos que Vite procesa viven en public/ por compatibilidad con
  // scripts/dev-server.js. El build los agrupa desde index.html y el paso
  // posterior conserva la carpeta para referencias dinámicas del runtime.
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
    assetsInlineLimit: 0,
  },
});
