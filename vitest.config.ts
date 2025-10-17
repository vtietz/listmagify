import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    css: false,
    reporters: "default"
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname)
    }
  }
});