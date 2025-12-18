from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from src.model import FoodClassifier
import os

app = FastAPI(title="Food Label ML Service")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "../models/food_bert_onnx")

# Initialize classifier
classifier = FoodClassifier(model_dir=MODEL_DIR)

class IngredientsRequest(BaseModel):
    ingredients: str = Field(..., max_length=5000)

class PredictionResponse(BaseModel):
    nova_group: int
    confidence: float
    nutri_score: str = "Unknown"
    allergens: list[str]
    processing_reasons: list[str] = []


@app.get("/")
def root():
    return {"status": "running", "service": "ML CORE running"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/predict", response_model=PredictionResponse)
def predict(payload: IngredientsRequest):
    """
    Input: {"ingredients": "wheat flour, sugar, palm oil"}
    Output: {
        "nova_group": 4, 
        "confidence": 0.98, 
        "nutri_score": "D",
        "allergens": ["Gluten"]
    }
    """
    try:
        if not payload.ingredients:
            raise HTTPException(status_code=400, detail="Ingredients cannot be empty")
        
        # AI Prediction
        nova, conf = classifier.predict_nova(payload.ingredients)
        
        # Heuristic Detection for Allergens & Nutri-Score
        allergens = classifier.detect_allergens(payload.ingredients)
        
        return {
            "nova_group": nova,
            "confidence": conf,
            "allergens": allergens,
            "nutri_score": "Unknown",
            "processing_reasons": ["Automated BERT Classification"] 
        }

    except Exception as e:
        print(f"Prediction Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))