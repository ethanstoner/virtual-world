import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        editor: resolve(import.meta.dirname, "index.html"),
        sim: resolve(import.meta.dirname, "sim.html"),
      },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
