import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = new URL(".", import.meta.url).pathname;

export default defineConfig({
  root,
  base: "./",
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: { index: `${root}index.html`, mobile: `${root}mobile.html` },
    },
  },
});
