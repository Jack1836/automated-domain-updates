import sqlite3
import datetime
from flask import g

DATABASE = 'database.db'

def get_db():
    db = getattr(g, 'db', None)
    if db is None:
        db = g.db = sqlite3.connect(DATABASE, timeout=20)
        # Enable WAL mode for better concurrency
        db.execute('PRAGMA journal_mode=WAL')
    return db

def init_db(app):
    with app.app_context():
        db = get_db()
        # Initialize articles table
        db.execute('''
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            link TEXT UNIQUE,
            source TEXT,
            domain TEXT,
            published_date TEXT,
            saved BOOLEAN DEFAULT 0,
            sentiment TEXT DEFAULT 'Neutral',
            keywords TEXT,
            summary TEXT,
            deleted BOOLEAN DEFAULT 0,
            total_views INTEGER DEFAULT 0
        )
        ''')
        # Initialize users table (for RBAC and Auth)
        db.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            google_id TEXT UNIQUE,
            role TEXT DEFAULT 'user',
            created_at TEXT
        )
        ''')
        # Initialize user views (for User personal stats and Saved lists)
        db.execute('''
        CREATE TABLE IF NOT EXISTS user_article_interactions (
            user_id INTEGER,
            article_id INTEGER,
            saved BOOLEAN DEFAULT 0,
            views INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, article_id)
        )
        ''')
        
        db.commit()

def fetch_active_articles(limit=50):
    db = get_db()
    cursor = db.execute('''
        SELECT a.id, a.title, a.description, a.link, a.source, a.domain, a.published_date, a.saved, a.sentiment, a.keywords, a.total_views
        FROM articles a
        WHERE a.deleted = 0
        ORDER BY a.id DESC LIMIT ?
    ''', (limit,))
    
    articles = []
    for row in cursor.fetchall():
        articles.append({
            'id': row[0],
            'title': row[1],
            'description': row[2],
            'link': row[3],
            'source': row[4],
            'domain': row[5],
            'published_date': row[6],
            'saved': bool(row[7]),
            'sentiment': row[8],
            'keywords': row[9],
            'total_views': row[10]
        })
    return articles
    
def soft_delete_article(article_id):
    db = get_db()
    db.execute('UPDATE articles SET deleted = 1 WHERE id = ?', (article_id,))
    db.commit()
    return True
