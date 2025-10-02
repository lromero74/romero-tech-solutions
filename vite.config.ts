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
    host: '0.0.0.0', // Allow access from network devices (mobile testing)
    // Firefox-specific headers to prevent caching issues
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
    fs: {
      // Allow serving files from one level up
      allow: ['..']
    },
    // Proxy disabled - frontend uses VITE_API_BASE_URL for direct backend calls
    // This prevents CSRF token validation issues with IP address changes
    // proxy: {
    //   '/api': {
    //     target: 'http://localhost:3001',
    //     changeOrigin: true,
    //     secure: false
    //   }
    // }
  },
  build: {
    // Generate source maps for better debugging
    sourcemap: true,
    // Optimize bundle size with strategic code splitting
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk for external libraries
          vendor: ['react', 'react-dom'],
          // UI components chunk
          ui: ['lucide-react'],
          // AWS services chunk (if using AWS SDK)
          aws: ['@aws-sdk/client-cognito-identity-provider'],
          // Admin components chunk
          admin: [
            './src/pages/AdminDashboard.tsx',
            './src/components/admin',
          ],
        },
        // Optimize chunk file names
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId
            ? chunkInfo.facadeModuleId.split('/').pop()?.replace('.tsx', '').replace('.ts', '')
            : 'chunk';
          return `js/${facadeModuleId}-[hash].js`;
        },
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const extType = assetInfo.name?.split('.').pop();
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType || '')) {
            return 'images/[name]-[hash].[ext]';
          }
          if (/css/i.test(extType || '')) {
            return 'css/[name]-[hash].[ext]';
          }
          return 'assets/[name]-[hash].[ext]';
        },
      },
    },
    // Chunk size warning threshold
    chunkSizeWarningLimit: 1000,
  },
  // Resolve configuration to help with module resolution
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
});
