import os
import re
import onnxruntime as ort
import numpy as np
from transformers import DistilBertTokenizerFast

class FoodClassifier:
    def __init__(self, model_dir="../models/food_bert_onnx"):
        self.model_dir = model_dir
        self.session = None
        self.tokenizer = None
        self.load_model()
        
        self.ALLERGEN_KEYWORDS = {
            "Gluten": ["wheat", "barley", "rye", "malt", "flour", "semolina", "spelt"],
            "Dairy": ["milk", "cream", "cheese", "whey", "casein", "lactose", "butter", "yogurt"],
            "Soy": ["soy", "tofu", "edamame", "lecithin", "miso", "tempeh"],
            "Nuts": ["almond", "walnut", "cashew", "pecan", "hazelnut", "pistachio", "macadamia"],
            "Peanuts": ["peanut", "groundnut"],
            "Eggs": ["egg", "albumin", "mayonnaise"],
            "Fish": ["fish", "tuna", "salmon", "cod", "anchovy"],
            "Shellfish": ["shrimp", "crab", "lobster", "prawn", "clam", "mussel", "oyster"]
        }
        
    def load_model(self):
        """Loads the ONNX model and Tokenizer"""
        print(f"Loading ONNX model from {self.model_dir}...")
        
        try:
            self.tokenizer = DistilBertTokenizerFast.from_pretrained(self.model_dir)
            
            onnx_path = os.path.join(self.model_dir, "model_quantized.onnx")
            if not os.path.exists(onnx_path):
                onnx_path = os.path.join(self.model_dir, "model.onnx")
                
            self.session = ort.InferenceSession(onnx_path)
            print("Model loaded successfully.")
        except Exception as e:
            print(f"Error loading model: {e}")
            self.session = None
            raise e
        
    def preprocess(self, text: str) -> str:
        """Simple text preprocessing"""
        if not text: return ""
        text = str(text).lower()
        text = re.sub(r'\d+(\.\d+)?\s?%', '', text)
        text = re.sub(r'\([^)]*\)', '', text)
        text = re.sub(r'[^a-z0-9, ]', '', text)
        return text.strip()
    
    def detect_allergens(self, text: str):
        """Detects allergens in the ingredient text."""
        detected = set()
        text_lower = text.lower()
        
        for allergen, keywords in self.ALLERGEN_KEYWORDS.items():
            # Check if any keyword matches
            if any(k in text_lower for k in keywords):
                detected.add(allergen)
                
        return list(detected)
    
    def predict_nova(self, ingredients: str):
        """Runs the ONNX model to predict NOVA group."""
        if not self.session: raise Exception("Model not loaded")
        
        clean_text = self.preprocess(ingredients)
        
        # Tokenize
        inputs = self.tokenizer(
            clean_text, 
            return_tensors="np", 
            padding="max_length", 
            truncation=True, 
            max_length=128
        ) # type: ignore
        
        # Prepare ONNX Inputs
        # (ONNX Runtime expects numpy arrays, not Tensors)
        ort_inputs = {
            "input_ids": inputs["input_ids"].astype(np.int64),
            "attention_mask": inputs["attention_mask"].astype(np.int64)
        }
        
        # Run Inference
        logits = self.session.run(None, ort_inputs)[0]
        
        # Post-process (Softmax to get confidence)
        exp_logits = np.exp(logits) # type: ignore
        probs = exp_logits / np.sum(exp_logits, axis=1, keepdims=True)
        
        confidence = np.max(probs)
        predicted_class = np.argmax(probs) + 1 # Convert 0-3 index back to 1-4 NOVA
        
        return int(predicted_class), float(confidence)