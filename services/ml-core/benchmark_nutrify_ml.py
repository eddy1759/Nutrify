import requests
import time
import statistics

URL = "https://eddy1759-nutrify-ml-core.hf.space/predict"

PAYLOAD = {
    "ingredients": "wheat flour, sugar, palm oil, salt, emulsifier E471"
}

HEADERS = {
    "Content-Type": "application/json"
}

NUM_REQUESTS = 100
latencies = []

print("Starting Nutrify ML inference benchmark...")

for i in range(NUM_REQUESTS):
    start = time.perf_counter()
    response = requests.post(URL, json=PAYLOAD, headers=HEADERS)
    end = time.perf_counter()

    latency_ms = (end - start) * 1000
    latencies.append(latency_ms)
    
    if response.status_code != 200:
        print(f"[ERROR] Request {i+1}: {response.status_code} - {response.text}")
    else:
        print(f"Request {i+1} succeeded in {latency_ms:.2f} milliseconds")
        
        
# --- STATS ---
p50 = statistics.median(latencies)
p95 = statistics.quantiles(latencies, n=100)[94]
total_time_seconds = sum(latencies) / 1000
throughput = NUM_REQUESTS / total_time_seconds

print("\n--- Inference Results ---")
print(f"Total Requests: {NUM_REQUESTS}")
print(f"Total Time: {total_time_seconds:.2f} seconds")
print(f"Throughput: {throughput:.2f} requests/second")
print(f"P50 Latency: {p50:.2f} ms")
print(f"P95 Latency: {p95:.2f} ms")
print("Inference type: CPU (ONNX Runtime)")
print("Batch size: 1")
