import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Include lucide-react instead of excluding it to fix Firefox module loading
    include: ['lucide-react'],
    force: true, // Force pre-bundling to avoid dynamic import issues
  },
  server: {
    // Firefox-specific headers to prevent caching issues
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
    fs: {
      // Allow serving files from one level up
      allow: ['..']
    }
  },
  build: {
    // Generate source maps for better debugging
    sourcemap: true,
    // Ensure proper chunking for Firefox
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  // Resolve configuration to help with module resolution
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
});
