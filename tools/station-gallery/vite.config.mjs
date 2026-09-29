import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const project = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: { alias: { "@": project } },
  server: { host: "0.0.0.0", port: 4178, strictPort: true, fs: { allow: [project] } },
  build: { outDir: "../../artifacts/station-gallery-build", emptyOutDir: true },
});
