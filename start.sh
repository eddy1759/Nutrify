#!/bin/bash

# 1. Start Python (Internal Only - Loopback Interface)
# We bind to 127.0.0.1 so HF doesn't get confused and try to route public traffic here
echo "🧠 Starting Python ML Core (Internal)..."
cd /app/python_service
# --log-level warning keeps logs clean so HF doesn't think this is the main app
uvicorn src.main:app --host 127.0.0.1 --port 8000 --log-level warning & 

# 2. Wait for Python to stabilize
sleep 3

# 3. Setup NestJS
cd /app/api
echo "🛠️ Applying Database Migrations..."
npx prisma migrate deploy

# 4. Start NestJS (Public Interface)
echo "🚀 Starting NestJS API..."
# Explicitly export the port for NestJS to pick up
export PORT=7860
node dist/src/main.js