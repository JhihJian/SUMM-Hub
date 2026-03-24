# Development/Production image for backend
# Uses tsx to run TypeScript directly
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including tsx dev dependency)
RUN npm ci

# Copy source files
COPY . .

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Use tsx to run TypeScript directly
CMD ["npx", "tsx", "src/index.ts"]
