# Multi-stage build for production optimization
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including dev dependencies for building
RUN npm ci --only=production=false

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Production stage
FROM node:18-alpine AS production

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S notificationservice -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=notificationservice:nodejs /app/dist ./dist
COPY --from=builder --chown=notificationservice:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=notificationservice:nodejs /app/package*.json ./

# Create necessary directories
RUN mkdir -p /app/logs && chown notificationservice:nodejs /app/logs

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Switch to non-root user
USER notificationservice

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "http.get('http://localhost:3000/health', (res) => { \
    if (res.statusCode !== 200) process.exit(1); \
    res.on('data', () => {}); \
    res.on('end', () => process.exit(0)); \
  }).on('error', () => process.exit(1));"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]

# Labels for better maintainability
LABEL maintainer="SignaAI Team <team@signaai.com>"
LABEL version="1.0.0"
LABEL description="SignaAI Notification Service"
LABEL org.opencontainers.image.source="https://github.com/signaai/notification-service"
LABEL org.opencontainers.image.documentation="https://github.com/signaai/notification-service/blob/main/README.md"
LABEL org.opencontainers.image.licenses="MIT"