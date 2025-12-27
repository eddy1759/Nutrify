#!/bin/bash

# --- 1. Start Python (Background) ---
echo "🧠 Starting Python ML Core..."
cd /app/python_service
# We add --reload only for debugging, usually remove in pure prod
uvicorn src.main:app --host 0.0.0.0 --port 8000 & 

# Wait for Python to wake up
sleep 5

# --- 2. Setup NestJS API ---
cd /app/api

echo "🛠️ Applying Database Migrations..."
# We try to migrate. If it fails, we print the environment (safely) to debug.
npx prisma migrate deploy || echo "⚠️ Migration Failed! Is DATABASE_URL set?"

# --- 3. Debug & Launch NestJS ---
echo "🔍 DEBUG: Listing dist folder contents..."
ls -R dist

echo "🚀 Starting NestJS API..."
# Try the standard path first, then fallback to src nested path
if [ -f "dist/main.js" ]; then
  node dist/main.js
elif [ -f "dist/src/main.js" ]; then
  echo "✅ Found main.js in dist/src/"
  node dist/src/main.js
else
  echo "❌ CRITICAL: Could not find main.js in dist/ or dist/src/"
  exit 1
fi