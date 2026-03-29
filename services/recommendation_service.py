import os
import re
from textblob import TextBlob
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from google import genai

# Shared Global variables for the ML extraction
stop_words = set([...])  # Abbreviated for template
word_pattern = re.compile(r'\b[a-zA-Z]{4,}\b')

def get_extractive_summary(text, min_sentences=3, max_sentences=5):
    """
    Offline fallback using SciKit-Learn TF-IDF Cosine Similarity Matrix
    to determine the most semantically central sentences.
    """
    blob = TextBlob(text)
    sentences = [str(sentence).strip() for sentence in blob.sentences if len(str(sentence).split()) > 5]
    
    if len(sentences) <= max_sentences:
        return text

    # Machine Learning Matrix construction
    vectorizer = TfidfVectorizer(stop_words='english')
    try:
        tfidf_matrix = vectorizer.fit_transform(sentences)
        # Calculate semantic overlap 
        similarity_matrix = cosine_similarity(tfidf_matrix)

        # Calculate centrality score (Sum of all structural similarities)
        scores = similarity_matrix.sum(axis=1)

        # Rank and rebuild chronologically
        ranked_indices = scores.argsort()[-max_sentences:][::-1]
        ranked_indices.sort()
        
        summary_sentences = [sentences[i] for i in ranked_indices]
        return " ".join(summary_sentences)
    except Exception as e:
        print(f"ML Fallback failed: {e}")
        return " ".join(sentences[:max_sentences])

def analyze_sentiment(text):
    """Basic NLP polarity grading."""
    try:
        analysis = TextBlob(text)
        polarity = analysis.sentiment.polarity
        if polarity > 0.1:
            return 'Positive'
        elif polarity < -0.1:
            return 'Negative'
        else:
            return 'Neutral'
    except Exception as e:
        print(f"Sentiment Analysis failed: {e}")
        return 'Neutral'

def get_gemini_summary(text):
    """Online generative summary using Google API."""
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return get_extractive_summary(text)
        
    try:
        client = genai.Client(api_key=key)
        prompt = f"Summarize this article content concisely in a single professional paragraph suitable for a news brief:\n\n{text}"
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt
        )
        if response.text:
           return response.text
        return get_extractive_summary(text)
    except Exception as e:
        print(f"Gemini API Failed: {e}")
        return get_extractive_summary(text)
