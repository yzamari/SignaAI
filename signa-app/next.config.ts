import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone mode for production Docker builds
  output: 'standalone',
  
  // Skip type checking and linting during build
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Environment-specific configurations
  ...(process.env.NODE_ENV === 'development' && {
    turbopack: {
      root: '/Users/yahavzamari/SignaAI/signa-app',
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  }),

  // Production optimizations
  ...(process.env.NODE_ENV === 'production' && {
    // Optimize images
    images: {
      unoptimized: false,
      deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
      imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    },
    
    // Enable compression
    compress: true,
    
    // Security headers for production
    async headers() {
      return [
        {
          source: '/(.*)',
          headers: [
            {
              key: 'X-Frame-Options',
              value: 'DENY'
            },
            {
              key: 'X-Content-Type-Options',
              value: 'nosniff'
            },
            {
              key: 'X-XSS-Protection',
              value: '1; mode=block'
            }
          ]
        }
      ];
    },
  }),
  
  // Environment variables that should be available on the client side
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://signaai-backend-691837885081.us-central1.run.app/api/v1',
    NEXT_PUBLIC_OCR_SERVICE_URL: process.env.NEXT_PUBLIC_OCR_SERVICE_URL || 'https://signaai-backend-691837885081.us-central1.run.app/api/v1/ocr',
    NEXT_PUBLIC_GEMINI_API_KEY: 'AIzaSyDTLNgJM-p8ueWXzrlcJLlnzPwDc_siIco',
  },
};

export default nextConfig;
