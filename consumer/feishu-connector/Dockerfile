FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Prune devDependencies to reduce image size
RUN npm prune --production

# Default environment variables
ENV NATS_URL=nats://nats:4222
ENV TRIGGER_PREFIX=#

# Create non-root user and set permissions
RUN mkdir -p /app/dist && chown -R node:node /app
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)"

# Default command
CMD ["node", "dist/index.js"]
