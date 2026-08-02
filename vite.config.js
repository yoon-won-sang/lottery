import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 동행복권 API 프록시 (CORS 우회)
      "/api/dhlottery": {
        target: "https://www.dhlottery.co.kr",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/dhlottery/, ""),
      },
    },
  },
});
