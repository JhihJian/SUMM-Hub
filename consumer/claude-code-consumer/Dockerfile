FROM node:20-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install NATS CLI (supports multi-arch)
RUN ARCH=$(uname -m) && \
    case "$ARCH" in \
        x86_64) NATS_ARCH="amd64" ;; \
        aarch64) NATS_ARCH="arm64" ;; \
        *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
    esac && \
    curl -fsSL "https://github.com/nats-io/natscli/releases/download/v0.3.1/nats-0.3.1-linux-${NATS_ARCH}.zip" \
    -o /tmp/nats.zip && \
    unzip /tmp/nats.zip -d /usr/local/bin "nats-0.3.1-linux-${NATS_ARCH}/nats" && \
    mv "/usr/local/bin/nats-0.3.1-linux-${NATS_ARCH}/nats" /usr/local/bin/nats && \
    rm -rf "/usr/local/bin/nats-0.3.1-linux-${NATS_ARCH}" /tmp/nats.zip && \
    chmod +x /usr/local/bin/nats

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create Claude config directory for node user and skip initialization
RUN mkdir -p /home/node/.claude && \
    echo '{"hasCompletedOnboarding": true, "theme": "dark"}' > /home/node/.claude/settings.json && \
    chown -R node:node /home/node/.claude

# Copy package files
COPY package*.json ./

# Install dependencies (包括 devDependencies 用于构建)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# 清理 devDependencies 减小镜像体积
RUN npm prune --production

# Default environment variables
ENV NATS_URL=nats://localhost:4222
ENV CONSUMER_ID=0
ENV CONSUMER_TOTAL=1
ENV ENTITY_TYPE=ai
ENV WORKSPACE_DIR=/workspace
ENV SESSION_TTL_MS=3600000
ENV QUEUE_GROUP=claude-consumers
ENV CLI_MODE=false
ENV TASK=

# Create workspace directory and set permissions
RUN mkdir -p /workspace && chown -R node:node /app /workspace

# Switch to non-root user (node 用户在 node:20-slim 中已存在，UID 1000)
USER node

# Default command
CMD ["npm", "start"]
