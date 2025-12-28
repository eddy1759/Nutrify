# Dockerfile.ml

# 1. Use Python 3.11 Image
FROM python:3.11-slim

# 2. Set Work Directory
WORKDIR /app

# 3. Install System Dependencies (GLib is often needed for CV libraries)
RUN apt-get update && apt-get install -y libgl1-mesa-glx libglib2.0-0 && rm -rf /var/lib/apt/lists/*

# 4. Copy Requirements first (Caching layer)
COPY services/ml-core/requirements.txt .

# 5. Install Python Deps (CPU only to keep image small)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

# 6. Copy the Application Code
COPY services/ml-core/ .

# 7. Expose the port HF expects
EXPOSE 7860

# 8. Run Uvicorn on Port 7860
# Note: We point to src.main:app because we copied contents to /app root
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "7860"]