#!/bin/bash

# 1. Start the Python ML Service in the background
# We allow it to bind to localhost:8000 so NestJS can find it
echo "🧠 Starting Python ML Core..."
cd /app/python_service
uvicorn src.main:app --host 0.0.0.0 --port 8000 &

# 2. Wait a moment for Python to initialize
sleep 5

# 3. Start the NestJS API in the foreground
# This will listen on port 7860 (Hugging Face's default)
echo "🚀 Starting NestJS API..."
cd /app/api
node dist/main.js