import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5555',
        changeOrigin: true,
        secure: false,
      },
      '/generated': {
        target: 'http://localhost:5555',
        changeOrigin: true,
        secure: false,
      }
    },
    // Disable polling to prevent excessive refreshes
    watch: {
      usePolling: false
    },
    // Fix HMR configuration
    hmr: {
      overlay: true
    }
  }
}); 