FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

ENV NATS_URL=nats://localhost:4222
ENV E2E_MODE=false

CMD ["node", "dist/index.js"]
