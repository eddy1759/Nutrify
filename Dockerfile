FROM node:22-slim

# System deps
RUN apt-get update -y && \
    apt-get install -y openssl tesseract-ocr && \
    rm -rf /var/lib/apt/lists/*

# Setup pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files first for caching
COPY services/api/package*.json ./
COPY services/api/pnpm-lock.yaml ./
RUN pnpm install

# Copy prisma before generate
COPY services/api/prisma ./prisma/
RUN npx prisma generate

# Copy rest of the app
COPY services/api/ ./

# Build
RUN pnpm run build

ENV PORT=3333
EXPOSE 3333

CMD ["node", "dist/src/main.js"]
