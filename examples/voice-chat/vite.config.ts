import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = `http://127.0.0.1:${process.env.API_PORT ?? 5181}`;

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [react()],
  server: {
    proxy: {
      "/voice": { target: api, ws: true },
      "/api": api,
    },
  },
});
