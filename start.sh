#!/bin/bash

# 1. Start Python (Background) - 🔒 PRIVATE MODE
# Change --host to 127.0.0.1 so it is NOT accessible from outside
echo "🧠 Starting Python ML Core (Internal Only)..."
cd /app/python_service
uvicorn src.main:app --host 127.0.0.1 --port 8000 & 

# 2. Wait for Python to wake up
sleep 5

# 3. Setup NestJS API
cd /app/api

echo "🛠️ Applying Database Migrations..."
npx prisma migrate deploy || echo "⚠️ Migration skipped"

# 4. Start NestJS (Foreground) - 🌍 PUBLIC MODE
echo "🚀 Starting NestJS API on port 7860..."

# Force the PORT variable just to be safe
export PORT=7860

# Use the path that your logs confirmed exists: dist/src/main.js
node dist/src/main.js