import { defineConfig } from 'vite';

// SerpAPI does not allow direct browser (CORS) requests, so both upstream APIs are
// reached through this local proxy. API keys are entered in the UI and travel with
// each request; they are never written to disk by the server.
const proxy = {
  '/api/openai': {
    target: 'https://api.openai.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/openai/, ''),
  },
  '/api/serpapi': {
    target: 'https://serpapi.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/serpapi/, ''),
  },
};

export default defineConfig({
  server: { proxy },
  preview: { proxy },
});
