// Health check endpoint for SignaAI frontend
// Used by Cloud Run health checks and monitoring systems

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Basic health check - verify the application can respond
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'signaai-frontend',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'production',
      uptime: process.uptime(),
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external,
        rss: process.memoryUsage().rss
      },
      // Check if critical environment variables are set
      config: {
        apiUrl: !!process.env.NEXT_PUBLIC_API_URL,
        ocrServiceUrl: !!process.env.NEXT_PUBLIC_OCR_SERVICE_URL,
      }
    };

    // Verify backend connectivity (optional - comment out if causing issues)
    let backendStatus = 'unknown';
    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL;
      if (backendUrl) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch(`${backendUrl}/api/v1/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        backendStatus = response.ok ? 'connected' : 'error';
      }
    } catch (error) {
      backendStatus = 'disconnected';
    }

    const responseData = {
      ...healthStatus,
      dependencies: {
        backend: backendStatus
      }
    };

    return NextResponse.json(responseData, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Check': 'pass'
      }
    });

  } catch (error) {
    // Return error response for failed health checks
    const errorResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'signaai-frontend',
      error: error instanceof Error ? error.message : 'Unknown error',
      uptime: process.uptime()
    };

    return NextResponse.json(errorResponse, {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Check': 'fail'
      }
    });
  }
}

// Support HEAD requests for simple health checks
export async function HEAD(request: NextRequest) {
  try {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'X-Health-Check': 'pass'
      }
    });
  } catch (error) {
    return new NextResponse(null, {
      status: 503,
      headers: {
        'X-Health-Check': 'fail'
      }
    });
  }
}