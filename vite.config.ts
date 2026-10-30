import { defineConfig } from "vite";

export default defineConfig({
  base: (globalThis as any).process?.env?.GITHUB_ACTIONS ? "/Voax/" : "/",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/react/") ||
              id.includes("/node_modules/react-dom/") ||
              id.includes("/node_modules/scheduler/")) {
            return "react-vendor";
          }
          if (id.includes("/node_modules/@supabase/")) {
            return "supabase-vendor";
          }
        }
      }
    }
  }
});
