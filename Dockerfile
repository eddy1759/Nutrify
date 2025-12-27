# ==========================================
# STAGE 1: Build NestJS API
# ==========================================
FROM node:22-slim AS nest-builder

WORKDIR /app

# Install system dependencies for building (OpenSSL for Prisma)
RUN apt-get update -y && apt-get install -y openssl

# Install PNPM
RUN npm install -g pnpm

# Copy API definition
COPY services/api/package*.json ./
COPY services/api/pnpm-lock.yaml ./
COPY services/api/prisma ./prisma/

# Install Deps & Generate Prisma
RUN pnpm install
RUN npx prisma generate

# Copy Source Code
COPY services/api/tessdata ./tessdata
COPY services/api .

# Build the NestJS App
RUN pnpm run build

# ==========================================
# STAGE 2: Final Production Image
# ==========================================
# We start with Python 3.11 since installing Node on Python is easier
FROM python:3.11-slim

# Install System Dependencies
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    openssl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm

# ----------------------------------------
# 3. Setup Python ML Service
# ----------------------------------------
WORKDIR /app/python_service

# Copy Requirements
COPY services/ml-core/requirements.txt .

# Install Python Deps
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy Python Source
COPY services/ml-core .

# ----------------------------------------
# 4. Setup NestJS API
# ----------------------------------------
WORKDIR /app/api

# Copy Built Assets from Builder Stage
COPY --from=nest-builder /app/dist ./dist
COPY --from=nest-builder /app/node_modules ./node_modules
COPY --from=nest-builder /app/package*.json ./
COPY --from=nest-builder /app/prisma ./prisma
COPY --from=nest-builder /app/tessdata ./tessdata

# ----------------------------------------
# 5. Configuration & Start
# ----------------------------------------
# Set Environment Variables
ENV NODE_ENV=production
ENV PORT=7860
ENV NODE_OPTIONS=--dns-result-order=ipv4first
# Internal Communication URL
ENV ML_SERVICE_URL=http://127.0.0.1:8000

# Copy the start script to root
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Start both services
CMD ["/app/start.sh"]