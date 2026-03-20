import os
import json
import numpy as np
from transformers import pipeline
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

class NLPEngine:
    def __init__(self):
        print("Loading NLP models...")
        # Zero-shot classification for categories
        self.classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")
        self.categories = ["Technology", "AI & ML", "Startups", "Jobs", "Science"]
        
        # Summarizer - using a smaller model for speed
        self.summarizer = pipeline("summarization", model="sshleifer/distilbart-cnn-12-6")
        
        # Sentence embeddings for semantic search and duplicate detection
        self.embedder = SentenceTransformer('all-MiniLM-L6-v2')
        print("Models loaded successfully.")

    def classify(self, text):
        # Truncate text for classifier if needed
        truncated_text = text[:1000]
        result = self.classifier(truncated_text, self.categories)
        return result['labels'][0]

    def summarize(self, text):
        if len(text) < 200:
            return text
        
        # Truncate for model constraints
        truncated_text = text[:2000]
        summary = self.summarizer(truncated_text, max_length=130, min_length=30, do_sample=False)
        return summary[0]['summary_text']

    def get_embedding(self, text):
        embedding = self.embedder.encode([text])[0]
        return embedding.tolist()

    def check_duplicate(self, new_embedding, existing_embeddings, threshold=0.9):
        if not existing_embeddings:
            return False
        
        similarities = cosine_similarity([new_embedding], existing_embeddings)
        return np.any(similarities > threshold)

    def recommend(self, user_prefs_embeddings, article_embeddings):
        if not user_prefs_embeddings or not article_embeddings:
            return []
            
        similarities = cosine_similarity(article_embeddings, user_prefs_embeddings)
        # Average similarity across all preferred topics
        mean_similarities = similarities.mean(axis=1)
        return mean_similarities.tolist()

# Lazy loading or singleton pattern
_engine = None
def get_nlp_engine():
    global _engine
    if _engine is None:
        _engine = NLPEngine()
    return _engine

if __name__ == "__main__":
    # Test script
    engine = get_nlp_engine()
    text = "OpenAI just released a new version of Sora, their text-to-video AI model. It can generate high-fidelity videos from just a few words."
    print(f"Category: {engine.classify(text)}")
    print(f"Summary: {engine.summarize(text)}")
    print(f"Embedding length: {len(engine.get_embedding(text))}")
