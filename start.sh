#!/bin/bash

# 1. Start Python (Background)
echo "🧠 Starting Python ML Core..."
cd /app/python_service
uvicorn src.main:app --host 0.0.0.0 --port 8000 &

# 2. Wait for Python
sleep 5

# 3. Setup NestJS API
cd /app/api

# 👇 ADD THIS BLOCK
# =========================================
echo "🛠️ Applying Database Migrations..."
# This pushes your schema changes to Neon DB
npx prisma migrate deploy
# =========================================

# 4. Start NestJS (Foreground)
echo "🚀 Starting NestJS API..."
node dist/main.js