from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import numpy as np
from database import get_session, Article, UserPreference, SavedArticle, init_db
from scraper import scrape_article
from nlp_engine import get_nlp_engine
from sqlalchemy import desc

app = Flask(__name__)
CORS(app)

# Initialize database on startup
init_db()

@app.route('/scrape', methods=['POST'])
def scrape():
    data = request.json
    url = data.get('url')
    if not url:
        return jsonify({"error": "URL is required"}), 400
    
    session = get_session()
    existing = session.query(Article).filter_by(url=url).first()
    if existing:
        return jsonify({"message": "Article already exists", "article_id": existing.id}), 200

    scraped_data = scrape_article(url)
    if not scraped_data:
        return jsonify({"error": "Failed to scrape URL"}), 500
    
    nlp = get_nlp_engine()
    
    # NLP Processing
    category = nlp.classify(scraped_data['content'])
    summary = nlp.summarize(scraped_data['content'])
    embedding = nlp.get_embedding(scraped_data['content'])
    
    # Check for duplicates using embedding similarity
    all_articles = session.query(Article).all()
    if all_articles:
        existing_embeddings = [json.loads(a.embedding) for a in all_articles]
        if nlp.check_duplicate(embedding, existing_embeddings):
            return jsonify({"message": "Similar article already exists"}), 409

    new_article = Article(
        url=url,
        title=scraped_data['title'],
        content=scraped_data['content'],
        summary=summary,
        category=category,
        source=scraped_data['source'],
        embedding=json.dumps(embedding)
    )
    
    session.add(new_article)
    session.commit()
    article_id = new_article.id
    session.close()
    
    return jsonify({
        "message": "Scraped and processed successfully",
        "article_id": article_id,
        "category": category,
        "summary": summary
    }), 201

@app.route('/search', methods=['GET'])
def search():
    query = request.args.get('q', '')
    session = get_session()
    
    if not query:
        articles = session.query(Article).order_by(desc(Article.published_date)).limit(20).all()
        results = []
        for a in articles:
            results.append({
                "id": a.id, "title": a.title, "summary": a.summary, 
                "category": a.category, "source": a.source, "url": a.url
            })
        session.close()
        return jsonify(results)

    # Semantic Search
    nlp = get_nlp_engine()
    query_embedding = nlp.get_embedding(query)
    
    all_articles = session.query(Article).all()
    if not all_articles:
        return jsonify([])
        
    article_embeddings = [json.loads(a.embedding) for a in all_articles]
    
    from sklearn.metrics.pairwise import cosine_similarity
    similarities = cosine_similarity([query_embedding], article_embeddings)[0]
    
    # Combine with titles/metadata
    results = []
    for i, article in enumerate(all_articles):
        results.append({
            "id": article.id,
            "title": article.title,
            "summary": article.summary,
            "category": article.category,
            "source": article.source,
            "url": article.url,
            "score": float(similarities[i])
        })
    
    # Sort by similarity score
    results = sorted(results, key=lambda x: x['score'], reverse=True)
    session.close()
    return jsonify(results[:10])

@app.route('/recommend', methods=['GET'])
def recommend():
    session = get_session()
    prefs = session.query(UserPreference).all()
    if not prefs:
        # Fallback to general search if no preferences
        return search()
        
    nlp = get_nlp_engine()
    pref_embeddings = [nlp.get_embedding(p.topic) for p in prefs]
    
    articles = session.query(Article).all()
    if not articles:
        return jsonify([])
        
    article_embeddings = [json.loads(a.embedding) for a in articles]
    scores = nlp.recommend(pref_embeddings, article_embeddings)
    
    results = []
    for i, article in enumerate(articles):
        results.append({
            "id": article.id,
            "title": article.title,
            "summary": article.summary,
            "category": article.category,
            "source": article.source,
            "url": article.url,
            "score": float(scores[i])
        })
        
    results = sorted(results, key=lambda x: x['score'], reverse=True)
    session.close()
    return jsonify(results[:10])

@app.route('/save', methods=['POST'])
def save_article():
    data = request.json
    article_id = data.get('article_id')
    if not article_id:
        return jsonify({"error": "Article ID required"}), 400
        
    session = get_session()
    saved = SavedArticle(article_id=article_id)
    session.add(saved)
    
    # Also update user preferences based on the content of the saved article
    article = session.query(Article).get(article_id)
    if article:
        pref = UserPreference(topic=article.title) # Simple preference tracking
        session.add(pref)
        
    session.commit()
    session.close()
    return jsonify({"message": "Article saved"}), 200

@app.route('/saved', methods=['GET'])
def get_saved():
    session = get_session()
    saved_refs = session.query(SavedArticle).all()
    article_ids = [s.article_id for s in saved_refs]
    
    articles = session.query(Article).filter(Article.id.in_(article_ids)).all()
    results = []
    for a in articles:
        results.append({
            "id": a.id, "title": a.title, "summary": a.summary, 
            "category": a.category, "source": a.source, "url": a.url
        })
    session.close()
    return jsonify(results)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
