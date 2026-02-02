# OpenClaw Honeypot Dockerfile
# For security research purposes only

FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY web ./web

# Generate Prisma client and build TypeScript
RUN npx prisma generate
RUN npm run build

# Production image
FROM node:22-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy Prisma schema and generated client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web ./web

# Create data directories
RUN mkdir -p /app/data /app/logs

# Environment
ENV NODE_ENV=production
ENV PORT=18789
ENV BIND_ADDRESS=0.0.0.0
ENV DATABASE_URL="file:/app/data/honeypot.db"
ENV LOG_PATH=/app/logs

# Expose port
EXPOSE 18789

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:18789/health || exit 1

# Initialize database and start
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
