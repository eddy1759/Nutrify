#!/bin/bash

# 1. Start Python (Internal)
echo "🧠 Starting Python ML Core (Internal)..."
cd /app/python_service
# Using nohup to ensure it stays alive detached
nohup uvicorn src.main:app --host 127.0.0.1 --port 8000 > /app/python.log 2>&1 &

# 2. Wait for Python
sleep 3

# 3. Setup NestJS
cd /app/api
echo "🛠️ Applying Database Migrations..."
npx prisma migrate deploy || echo "⚠️ Migration skipped"

# 4. Start NestJS (Public)
echo "🚀 Starting NestJS API..."
export PORT=7860

# ⚠️ CRITICAL FIX: Use 'exec' here
# This makes Node the main process (PID 1) so HF can see the open port
exec node dist/src/main.js