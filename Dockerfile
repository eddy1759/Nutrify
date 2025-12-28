# Dockerfile (Main Space)

# 1. Use Node 22
FROM node:22-slim

# 2. Install OpenSSL & Tesseract
RUN apt-get update -y && apt-get install -y openssl tesseract-ocr && rm -rf /var/lib/apt/lists/*

# 3. Set Workdir
WORKDIR /app

# 4. Copy Package Files
COPY services/api/package*.json ./
COPY services/api/prisma ./prisma/

# 5. Install Dependencies
RUN pnpm install

# 6. Copy Source Code
COPY services/api/ .

# 7. Generate Prisma Client & Build NestJS
RUN npx prisma generate
RUN pnpm run build

# 8. Force IPv4 (Network Fix)
ENV NODE_OPTIONS="--dns-result-order=ipv4first"
ENV PORT=7860

# 9. Expose Port
EXPOSE 7860

# Run directly
CMD ["node", "dist/src/main.js"]