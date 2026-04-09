FROM node:20-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install NATS CLI (optional, useful for debugging)
RUN curl -fsSL "https://github.com/nats-io/natscli/releases/download/v0.3.1/nats-0.3.1-linux-amd64.zip" \
    -o /tmp/nats.zip && \
    apt-get update && apt-get install -y --no-install-recommends unzip && \
    unzip /tmp/nats.zip -d /usr/local/bin nats-0.3.1-linux-amd64/nats && \
    mv /usr/local/bin/nats-0.3.1-linux-amd64/nats /usr/local/bin/nats && \
    rm -rf /usr/local/bin/nats-0.3.1-linux-amd64 /tmp/nats.zip && \
    chmod +x /usr/local/bin/nats && \
    apt-get purge -y unzip && apt-get autoremove -y

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
ENV NATS_URL=nats://localhost:4222
ENV SUBJECT=
ENV COMMAND=
ENV QUEUE_GROUP=

# Switch to non-root user (node user exists in node:20-slim, UID 1000)
USER node

# Default command
CMD ["npm", "start"]
