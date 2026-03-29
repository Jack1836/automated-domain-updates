import sqlite3
import requests
from bs4 import BeautifulSoup
from flask import Flask, render_template, request, jsonify, g
from flask_cors import CORS
import os
import re
import urllib.parse
from textblob import TextBlob
import urllib3
from datetime import datetime
import email.utils
import time
import random
import concurrent.futures
from signal_score import calculate_signal_score
from newspaper import Article
from googlenewsdecoder import new_decoderv1
from io import BytesIO
from flask import send_file

from openai import OpenAI
from google import genai
from google.genai import types
from dotenv import load_dotenv

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

load_dotenv()

app = Flask(__name__)
app.secret_key = 'hackathon-super-secret-key' # Required for session storage
CORS(app)
DATABASE = 'database.db'

# Register the new Auth Microservice Blueprint
from services.auth_service import auth_bp, login_required
app.register_blueprint(auth_bp)

@app.after_request
def add_header(response):
    """
    Prevent the browser from caching authenticated pages. 
    This fixes the issue where clicking 'Back' after logout still shows the dashboard.
    """
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Pre-compiled NLP structures for performance
STOP_WORDS = {'the', 'a', 'an', 'in', 'on', 'at', 'is', 'are', 'was', 'were',
              'to', 'of', 'and', 'or', 'for', 'with', 'that', 'this', 'it', 'by',
              'as', 'from', 'has', 'have', 'will', 'been', 'not', 'but', 'its', 'their', 'they',
              'more', 'about', 'how', 'who', 'what', 'where', 'when', 'why'}
WORD_PATTERN_4 = re.compile(r'\b[a-zA-Z]{4,}\b')
WORD_PATTERN_5 = re.compile(r'\b[a-zA-Z]{5,}\b')

# Configure Gemini API if available
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    pass # client is instantiated on demand
else:
    print("WARNING: GEMINI_API_KEY not found in environment. Semantic similarity will fail.")

# Configure OpenAI API
# Removed global instantiation so we can check on-the-fly inside the route
if not os.environ.get("OPENAI_API_KEY"):
    print("WARNING: OPENAI_API_KEY not found in environment. TTS audio generation will fall back to browser native.")

@app.errorhandler(Exception)
def handle_exception(e):
    # Pass through HTTP errors
    if hasattr(e, 'code'):
        return jsonify({"status": "error", "message": str(e)}), e.code
    # Handle non-HTTP exceptions only
    print(f"Unhandled Exception: {e}")
    return jsonify({"status": "error", "message": "An unexpected internal server error occurred."}), 500

def get_db_connection():
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE, timeout=20)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_connection(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def get_simple_sentiment(text):
    if not text: return "Neutral"
    blob = TextBlob(text)
    polarity = blob.sentiment.polarity
    if polarity > 0.1: return "Positive"
    if polarity < -0.1: return "Negative"
    return "Neutral"

def init_db():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            link TEXT UNIQUE,
            source TEXT,
            domain TEXT,
            published_date TEXT,
            saved INTEGER DEFAULT 0,
            sentiment TEXT,
            keywords TEXT,
            deleted INTEGER DEFAULT 0,
            image_url TEXT
        )
    ''')
    # Add indexes for faster querying
    conn.execute('CREATE INDEX IF NOT EXISTS idx_articles_domain ON articles(domain)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_articles_published_date ON articles(published_date)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_articles_saved ON articles(saved)')
    
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS article_views (
            user_id INTEGER,
            article_id INTEGER,
            view_count INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, article_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (article_id) REFERENCES articles(id)
        )
    ''')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_views_article_user ON article_views(article_id, user_id)')
    
    conn.execute('''
        CREATE TABLE IF NOT EXISTS interested_domains (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )
    ''')
    # Pre-populate a default user if none exists
    conn.execute('INSERT OR IGNORE INTO users (id, username) VALUES (1, "Default User")')
    conn.commit()
    # Don't close conn here since it's managed by g.db tear down, or it'll break init. 
    # But since init_db might run outside request context, let's keep it safe.
    
    # Run migrations for existing articles
    migrate()

def get_keywords(text):
    if not text: return ""
    raw_words = WORD_PATTERN_4.findall(text)
    words = [w.lower() for w in raw_words if w.lower() not in STOP_WORDS]
    freq = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1
    keywords = sorted(freq, key=lambda k: freq[k], reverse=True)[:5]
    return ", ".join(keywords)

def get_article_image(url):
    """
    Scrapes the target URL to find a representative image (og:image, twitter:image, or main img).
    """
    if not url or not url.startswith('http'):
        return None
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        response = requests.get(url, headers=headers, timeout=5, verify=False)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Priority 1: Open Graph Image
        og_img = soup.find('meta', property='og:image') or soup.find('meta', name='og:image')
        if og_img and og_img.get('content'):
            return og_img['content']
            
        # Priority 2: Twitter Image
        tw_img = soup.find('meta', name='twitter:image')
        if tw_img and tw_img.get('content'):
            return tw_img['content']
            
        # Priority 3: Large standard image
        imgs = soup.find_all('img')
        for img in imgs:
            src = img.get('src')
            if src and src.startswith('http'):
                # Basic heuristic: ignore small icons/trackers
                if 'logo' not in src.lower() and 'icon' not in src.lower():
                    return src
    except Exception:
        pass
    return None

def migrate():
    conn = get_db_connection()
    cursor = conn.execute('PRAGMA table_info(articles)')
    columns = [row['name'] for row in cursor.fetchall()]
    
    if 'sentiment' not in columns:
        conn.execute('ALTER TABLE articles ADD COLUMN sentiment TEXT')
    if 'keywords' not in columns:
        conn.execute('ALTER TABLE articles ADD COLUMN keywords TEXT')
    if 'deleted' not in columns:
        conn.execute('ALTER TABLE articles ADD COLUMN deleted INTEGER DEFAULT 0')
    if 'image_url' not in columns:
        conn.execute('ALTER TABLE articles ADD COLUMN image_url TEXT')
    
    # Backfill articles with missing sentiment or keywords
    articles = conn.execute('SELECT id, title, description, link, image_url FROM articles WHERE sentiment IS NULL OR keywords IS NULL OR image_url IS NULL LIMIT 200').fetchall()
    
    def backfill_single(article):
        combined_text = article['title'] + " " + (article['description'] or "")
        sentiment = get_simple_sentiment(combined_text)
        keywords = get_keywords(combined_text)
        image_url = article['image_url']
        
        # Try to collect image from site if missing
        if not image_url:
            image_url = get_article_image(article['link'])
            
        return (sentiment, keywords, image_url, article['id'])

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        updates = list(executor.map(backfill_single, articles))
        for up in updates:
            conn.execute('UPDATE articles SET sentiment = ?, keywords = ?, image_url = ? WHERE id = ?', up)
    
    conn.commit()

def enrich_with_signal_score(article_dict, query=""):
    pub_date_str = article_dict.get('published_date', '')
    days_since_posted = 1
    if pub_date_str:
        try:
            parsed_tuple = email.utils.parsedate_tz(pub_date_str)
            if parsed_tuple:
                dt = datetime.fromtimestamp(email.utils.mktime_tz(parsed_tuple))
                days_since_posted = (datetime.now() - dt).days
        except Exception:
            pass
            
    days_since_posted = max(0, days_since_posted)

    domain = (article_dict.get('domain') or '').lower()
    source = (article_dict.get('source') or '').lower()
    credibility_score = 0.7
    if 'news' in domain or 'news' in source:
        credibility_score = 0.9
    elif 'tech' in domain:
        credibility_score = 0.85
        
    days_remaining = 10
    
    relevance_sim = 0.6
    title = (article_dict.get('title') or '').lower()
    if query and query.lower() in title:
        relevance_sim = 0.9
    
    article_id = article_dict.get('id', 0)
    random.seed(article_id) 
    skill_match_pct = random.randint(60, 100)
    
    score = calculate_signal_score(
        relevance_sim=relevance_sim,
        skill_match_pct=skill_match_pct,
        days_since_posted=days_since_posted,
        days_remaining=days_remaining,
        credibility_score=credibility_score
    )
    
    article_dict['signal_score'] = score
    return article_dict

@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/login')
def login():
    return render_template('login.html')



@app.route('/scrape', methods=['GET'])
def scrape():
    target_domain = request.args.get('domain', 'All')
    
    all_sources = [
        {'url': 'https://news.ycombinator.com/', 'domain': 'Technology', 'type': 'hn'},
        {'url': 'https://dev.to/', 'domain': 'Technology', 'type': 'devto'},
        {'url': 'https://www.bbc.com/news', 'domain': 'News', 'type': 'bbc'},
        {'url': 'https://news.google.com/news/rss', 'domain': 'News', 'type': 'gn'}
    ]
    
    sources = all_sources
    if target_domain != 'All':
        sources = [s for s in all_sources if s['domain'].lower() == target_domain.lower()]
    
    conn = get_db_connection()
    count = 0
    
    def process_source(source):
        results = []
        try:
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
            response = requests.get(source['url'], headers=headers, timeout=10, verify=False)
            
            if source['type'] == 'gn':
                soup = BeautifulSoup(response.text, 'xml')
                items = soup.find_all('item')
                for item in items[:20]:
                    title = item.title.text if item.title else ""
                    link = item.link.text if item.link else ""
                    desc = item.description.text if item.description else ""
                    pub_date = item.find('pubDate').text if item.find('pubDate') else ""
                    
                    if desc:
                        desc = BeautifulSoup(desc, 'html.parser').get_text()
                    
                    if title and link:
                        combined_text = title + " " + (desc or "")
                        sentiment = get_simple_sentiment(combined_text)
                        keywords = get_keywords(combined_text)
                        # Try to get an image URL
                        image_url = None
                        try:
                            # GN RSS items sometimes have images in the description as <img src="...">
                            desc_soup = BeautifulSoup(item.description.text, 'html.parser')
                            img = desc_soup.find('img')
                            if img: image_url = img.get('src')
                        except:
                            pass
                        
                        results.append((title, desc or title, link, 'Google News', source['domain'], pub_date, sentiment, keywords, image_url))

            else:
                soup = BeautifulSoup(response.text, 'html.parser')
                
                if source['type'] == 'hn':
                    items = soup.select('.athing')
                    for item in items[:15]:
                        title_elem = item.select_one('.titleline > a')
                        if title_elem:
                            title = title_elem.get_text()
                            link = title_elem['href']
                            if not link.startswith('http'): link = 'https://news.ycombinator.com/' + link
                            
                            published_date = ""
                            subtext_tr = item.find_next_sibling('tr')
                            if subtext_tr:
                                age_elem = subtext_tr.select_one('.age')
                                if age_elem:
                                    published_date = age_elem.get_text()
                                    
                            sentiment = get_simple_sentiment(title)
                            keywords = get_keywords(title)
                            image_url = get_article_image(link)
                            results.append((title, link, link, 'Hacker News', source['domain'], published_date, sentiment, keywords, image_url))
                
                elif source['type'] == 'devto':
                    items = soup.select('.crayons-story')
                    for item in items[:15]:
                        title_elem = item.select_one('.crayons-story__title a')
                        if title_elem:
                            title = title_elem.get_text().strip()
                            link = title_elem['href']
                            if not link.startswith('http'): link = 'https://dev.to' + link
                            desc_elem = item.select_one('.crayons-story__snippet')
                            description = desc_elem.get_text().strip() if desc_elem else ""
                            
                            time_elem = item.select_one('time')
                            published_date = time_elem.get_text().strip() if time_elem else ""
                            
                            combined_text = title + " " + description
                            sentiment = get_simple_sentiment(combined_text)
                            keywords = get_keywords(combined_text)
                            image_url = get_article_image(link)
                            results.append((title, description, link, 'Dev.to', source['domain'], published_date, sentiment, keywords, image_url))

                elif source['type'] == 'bbc':
                    items = soup.select('[data-testid="anchor-inner-wrapper"]') or soup.select('a[href*="/news/"]')
                    for item in items[:20]:
                        title_elem = item.select_one('h2') or item.select_one('h3') or item
                        link_elem = item if item.name == 'a' else item.find_parent('a') or item.select_one('a')
                        
                        if title_elem and link_elem and link_elem.has_attr('href'):
                            title = title_elem.get_text().strip()
                            link = link_elem['href']
                            if not link.startswith('http'):
                                link = 'https://www.bbc.com' + link
                            
                            time_elem = item.select_one('span[data-testid*="lastupdated"]') or item.select_one('time')
                            published_date = time_elem.get_text().strip() if time_elem else ""
                            
                            if len(title) > 10 and '/news/' in link:
                                sentiment = get_simple_sentiment(title)
                                keywords = get_keywords(title)
                                image_url = get_article_image(link)
                                results.append((title, link, link, 'BBC News', source['domain'], published_date, sentiment, keywords, image_url))

        except Exception as e:
            print(f"Error scraping {source['url']}: {e}")
            
        return results

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_to_source = {executor.submit(process_source, source): source for source in sources}
        for future in concurrent.futures.as_completed(future_to_source):
            results = future.result()
            for r in results:
                try:
                    conn.execute('INSERT OR IGNORE INTO articles (title, description, link, source, domain, published_date, sentiment, keywords, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', r)
                    count += 1
                except sqlite3.ProgrammingError:
                    pass # Handled slightly differently for differing col layouts if any, but they match 8 cols here.
    conn.commit()
    return jsonify({"status": "success", "message": f"Scraping completed for {target_domain}. Found {count} potential updates."})

@app.route('/search', methods=['GET'])
def search():
    query = request.args.get('q', '')
    domain = request.args.get('domain', 'All')
    
    conn = get_db_connection()
    
    where_clauses = ['a.deleted = 0']
    where_params = []
    
    if query:
        where_clauses.append('(title LIKE ? OR description LIKE ?)')
        where_params.extend([f'%{query}%', f'%{query}%'])
    if domain and domain != 'All':
        where_clauses.append('domain = ?')
        where_params.append(domain)
        
    where_sql = ' AND '.join(where_clauses)
    
    count_sql = f'SELECT COUNT(*) FROM articles a WHERE {where_sql}'
    total_count = conn.execute(count_sql, where_params).fetchone()[0]

    sql = f'''
        SELECT a.id, a.title, a.description, a.link, a.source, a.domain, a.published_date, a.saved, a.sentiment, a.keywords, a.image_url,
               COALESCE(SUM(v.view_count), 0) as total_views,
               COALESCE(MAX(CASE WHEN v.user_id = ? THEN v.view_count ELSE 0 END), 0) as user_views
        FROM articles a
        LEFT JOIN article_views v ON a.id = v.article_id
        WHERE {where_sql}
        GROUP BY a.id ORDER BY a.id DESC LIMIT 50
    '''
    params = [request.args.get('user_id', 1)] + where_params
    articles = conn.execute(sql, params).fetchall()
    
    results = []
    for article in articles:
        a_dict = dict(article)
        a_dict['total_views'] = a_dict['total_views'] or 0
        a_dict['user_views'] = a_dict['user_views'] or 0
        a_dict = enrich_with_signal_score(a_dict, query)
        results.append(a_dict)
    
    return jsonify({
        "total_count": total_count,
        "articles": results
    })

@app.route('/suggestions', methods=['GET'])
def suggestions():
    query = request.args.get('q', '')
    if not query:
        return jsonify([])
    
    conn = get_db_connection()
    # Find unique titles that match the query
    sql = 'SELECT DISTINCT title FROM articles WHERE title LIKE ? LIMIT 8'
    params = [f'%{query}%']
    
    rows = conn.execute(sql, params).fetchall()
    
    return jsonify([row['title'] for row in rows])

@app.route('/get-domains', methods=['GET'])
def get_domains():
    conn = get_db_connection()
    rows = conn.execute('SELECT name FROM interested_domains ORDER BY name ASC').fetchall()
    return jsonify([row['name'] for row in rows])

@app.route('/add-domain', methods=['POST'])
def add_domain():
    data = request.json
    domain_name = data.get('domain')
    if not domain_name:
        return jsonify({'status': 'error', 'message': 'Domain name is required'}), 400
        
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO interested_domains (name) VALUES (?)', (domain_name,))
        conn.commit()
        return jsonify({'status': 'success', 'message': f'Domain {domain_name} added'})
    except sqlite3.IntegrityError:
        return jsonify({'status': 'info', 'message': f'Domain {domain_name} already exists'})

@app.route('/remove-domain', methods=['POST'])
def remove_domain():
    data = request.json
    domain_name = data.get('domain')
    if not domain_name:
        return jsonify({'status': 'error', 'message': 'Domain name is required'}), 400
        
    conn = get_db_connection()
    conn.execute('DELETE FROM interested_domains WHERE name = ?', (domain_name,))
    conn.commit()
    return jsonify({'status': 'success', 'message': f'Domain {domain_name} removed'})

@app.route('/available-domains', methods=['GET'])
def available_domains():
    query = request.args.get('q', '').lower()
    # A robust default set of domain categories for the application
    predefined_domains = [
        'AI', 'Blockchain', 'Cybersecurity', 'Data Science', 
        'Technology', 'News', 'Web Development', 'Mobile Dev',
        'Cloud Computing', 'Machine Learning', 'DevOps',
        'Design', 'Business', 'Finance', 'Startup'
    ]
    
    if query:
        filtered = [d for d in predefined_domains if query in d.lower()]
    else:
        filtered = predefined_domains
        
    # We want to exclude currently selected domains from suggestions if desired, 
    # but the frontend can handle that logic, or we can just send everything.
    # To keep it simple, we'll send the matching predefined domains, limited to 6.
    return jsonify(filtered[:6])

@app.route('/extract-domain-data', methods=['GET'])
def extract_domain_data():
    conn = get_db_connection()
    domains = conn.execute('SELECT name FROM interested_domains').fetchall()
    
    if not domains:
        return jsonify({"status": "success", "message": "No interested domains to extract for."})
    
    count = 0
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
    
    def process_domain(domain_name):
        results = []
        try:
            query_url = f"https://news.google.com/rss/search?q={urllib.parse.quote(domain_name)}"
            response = requests.get(query_url, headers=headers, timeout=10, verify=False)
            soup = BeautifulSoup(response.text, 'xml')
            items = soup.find_all('item')
            
            for item in items[:15]: # Limit to 15 per domain to avoid DB bloat
                title = item.title.text if item.title else ""
                link = item.link.text if item.link else ""
                desc = item.description.text if item.description else ""
                pub_date = item.find('pubDate').text if item.find('pubDate') else ""
                
                if desc:
                    desc = BeautifulSoup(desc, 'html.parser').get_text()
                    
                # Very simple relevance check
                if domain_name.lower() in title.lower() or domain_name.lower() in desc.lower():
                    if title and link:
                        combined_text = title + " " + (desc or "")
                        sentiment = get_simple_sentiment(combined_text)
                        keywords = get_keywords(combined_text)
                        results.append((title, desc or title, link, 'Google News', domain_name, pub_date, sentiment, keywords))
        except Exception as e:
            print(f"Error extracting data for {domain_name}: {e}")
        return results

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_to_domain = {executor.submit(process_domain, row['name']): row for row in domains}
        for future in concurrent.futures.as_completed(future_to_domain):
            domain_results = future.result()
            for r in domain_results:
                try:
                    conn.execute('INSERT OR IGNORE INTO articles (title, description, link, source, domain, published_date, sentiment, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', r)
                    if conn.total_changes > 0:
                        count += 1
                except sqlite3.Error as e:
                    print(f"DB Error inserting article: {e}")
            
    conn.commit()
    
    return jsonify({"status": "success", "message": f"Successfully extracted {count} new articles for interested domains."})

@app.route('/get-articles', methods=['GET'])
def get_articles():
    conn = get_db_connection()
    
    # Fetch user's selected domains
    domains = conn.execute('SELECT name FROM interested_domains').fetchall()
    domain_names = [d['name'] for d in domains]
    
    if not domain_names:
        return jsonify([])
        
    # Create the placeholder string dynamically (?, ?, ?)
    placeholders = ', '.join(['?'] * len(domain_names))
    
    count_sql = f'SELECT COUNT(*) FROM articles WHERE domain IN ({placeholders}) AND deleted = 0'
    total_count = conn.execute(count_sql, domain_names).fetchone()[0]
    
    sql = f'''
        SELECT a.id, a.title, a.description, a.link, a.source, a.domain, a.published_date, a.saved, a.sentiment, a.keywords,
               COALESCE(SUM(v.view_count), 0) as total_views,
               COALESCE(MAX(CASE WHEN v.user_id = ? THEN v.view_count ELSE 0 END), 0) as user_views
        FROM articles a
        LEFT JOIN article_views v ON a.id = v.article_id
        WHERE a.domain IN ({placeholders}) AND a.deleted = 0
        GROUP BY a.id
        ORDER BY a.id DESC LIMIT 50
    '''
    
    query_params = [request.args.get('user_id', 1)] + domain_names
    articles = conn.execute(sql, query_params).fetchall()
    
    results = []
    for article in articles:
        a_dict = dict(article)
        a_dict['total_views'] = a_dict['total_views'] or 0
        a_dict['user_views'] = a_dict['user_views'] or 0
        # sentiment is already in the row
        a_dict = enrich_with_signal_score(a_dict)
        results.append(a_dict)
    
    return jsonify({
        "total_count": total_count,
        "articles": results
    })

@app.route('/save', methods=['POST'])
def save_article():
    article_id = request.json.get('id')
    conn = get_db_connection()
    conn.execute('UPDATE articles SET saved = 1 WHERE id = ?', (article_id,))
    conn.commit()
    return jsonify({"status": "success"})

@app.route('/unsave', methods=['POST'])
def unsave_article():
    article_id = request.json.get('id')
    conn = get_db_connection()
    conn.execute('UPDATE articles SET saved = 0 WHERE id = ?', (article_id,))
    conn.commit()
    return jsonify({"status": "success"})

@app.route('/save-scheme', methods=['POST'])
def save_scheme():
    data = request.json
    title = data.get('title')
    sector = data.get('sector')
    state = data.get('state')
    desc = data.get('desc')
    link = data.get('link')
    
    conn = get_db_connection()
    existing = conn.execute('SELECT id FROM articles WHERE link = ?', (link,)).fetchone()
    
    if existing:
        conn.execute('UPDATE articles SET saved = 1, deleted = 0 WHERE id = ?', (existing['id'],))
        article_id = existing['id']
    else:
        from datetime import datetime
        published_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor = conn.execute('''
            INSERT INTO articles (title, description, link, source, domain, published_date, saved, sentiment, keywords)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (title, desc, link, 'Open Government Data', 'Government Schemes', published_date, 1, 'Neutral', sector))
        article_id = cursor.lastrowid
        
    conn.commit()
    return jsonify({"status": "success", "id": article_id})

@app.route('/saved', methods=['GET'])
def get_saved():
    domain_filter = request.args.get('domain', 'All')
    conn = get_db_connection()
    
    if domain_filter == 'Government Schemes':
        articles = conn.execute("SELECT * FROM articles WHERE saved = 1 AND deleted = 0 AND domain = 'Government Schemes' ORDER BY id DESC").fetchall()
    elif domain_filter == 'All':
        articles = conn.execute("SELECT * FROM articles WHERE saved = 1 AND deleted = 0 AND domain != 'Government Schemes' ORDER BY id DESC").fetchall()
    else:
        articles = conn.execute("SELECT * FROM articles WHERE saved = 1 AND deleted = 0 AND domain = ? ORDER BY id DESC", (domain_filter,)).fetchall()
        
    return jsonify([dict(article) for article in articles])

@app.route('/saved-count', methods=['GET'])
def get_saved_count():
    domain_filter = request.args.get('domain', 'All')
    conn = get_db_connection()
    
    if domain_filter == 'Government Schemes':
        count = conn.execute("SELECT COUNT(*) FROM articles WHERE saved = 1 AND deleted = 0 AND domain = 'Government Schemes'").fetchone()[0]
    elif domain_filter == 'All':
        count = conn.execute("SELECT COUNT(*) FROM articles WHERE saved = 1 AND deleted = 0 AND domain != 'Government Schemes'").fetchone()[0]
    else:
        count = conn.execute("SELECT COUNT(*) FROM articles WHERE saved = 1 AND deleted = 0 AND domain = ?", (domain_filter,)).fetchone()[0]
        
    return jsonify({"count": count})

@app.route('/delete', methods=['POST'])
def delete_article():
    try:
        data = request.json
        if not data or 'id' not in data:
            return jsonify({"status": "error", "message": "Missing article ID"}), 400
            
        article_id = data.get('id')
        conn = get_db_connection()
        conn.execute('BEGIN TRANSACTION')
        try:
            conn.execute('DELETE FROM article_views WHERE article_id = ?', (article_id,))
            conn.execute('UPDATE articles SET deleted = 1 WHERE id = ?', (article_id,))
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
            
        return jsonify({"status": "success"})
    except Exception as e:
        print(f"Error deleting article: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/analyze', methods=['GET'])
def analyze_article():
    text = request.args.get('text', '')
    if not text:
        return jsonify({"sentiment": "Neutral", "keywords": [], "summary_points": []})
    
    def get_similarity(s1, s2):
        w1 = set(s1.lower().split())
        w2 = set(s2.lower().split())
        if not w1 or not w2: return 0
        return len(w1 & w2) / len(w1 | w2)
    blob = TextBlob(text)
    polarity = blob.sentiment.polarity
    
    if polarity > 0.1:
        sentiment = "Positive"
    elif polarity < -0.1:
        sentiment = "Negative"
    else:
        sentiment = "Neutral"
    
    # Extract keywords using simple string operations
    raw_words = WORD_PATTERN_4.findall(text)
    words = [w.lower() for w in raw_words if w.lower() not in STOP_WORDS]
    freq = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1
    keywords = sorted(freq, key=lambda k: freq[k], reverse=True)[:5]

    # Extractive summarization: score sentences by keyword frequency
    # Be more flexible with sentence splitting (including those without punctuation if they are the only thing)
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    if len(sentences) == 1 and len(sentences[0]) > 0:
        # If it didn't split but it's a long sentence, keep it
        sentences = [sentences[0]]
    
    sentences = [s.strip() for s in sentences if len(s.strip()) > 20] # Lower threshold for news snippets

    summary_points = []
    if len(sentences) == 1:
        summary_points = [sentences[0]]
    elif len(sentences) > 1:
        # Score each sentence by how many top keywords it contains
        def score_sentence(s):
            s_lower = s.lower()
            return sum(1 for k in keywords if k in s_lower)
        
        # Sort and take top points, but maintain diversity
        scored = sorted(sentences, key=score_sentence, reverse=True)
        
        unique_points = []
        for s in sentences:
            if s in scored[:3]: # Allow up to 3 points for better structure
                if not any(get_similarity(s, p) > 0.4 for p in unique_points):
                    unique_points.append(s)
            if len(unique_points) == 3:
                break
        summary_points = unique_points

    return jsonify({
        "sentiment": sentiment, 
        "polarity": round(polarity, 2), 
        "keywords": keywords, 
        "summary_points": summary_points,
        "summary": ' '.join(summary_points) # Backward compatibility
    })

@app.route('/trending-tags', methods=['GET'])
def trending_tags():
    conn = get_db_connection()
    # Get last 100 articles for fresh trends
    articles = conn.execute('SELECT title, description FROM articles ORDER BY id DESC LIMIT 100').fetchall()
    freq = {}
    for article in articles:
        text = (article['title'] + " " + (article['description'] or "")).lower()
        words = WORD_PATTERN_5.findall(text)
        for w in set(words): # Use set to count per article
            if w not in STOP_WORDS:
                freq[w] = freq.get(w, 0) + 1
                
    top_tags = sorted(freq.items(), key=lambda x: x[1], reverse=True)[:10]
    return jsonify([{"tag": t[0], "count": t[1]} for t in top_tags])

@app.route('/tags', methods=['GET'])
def get_tags():
    try:
        conn = get_db_connection()
        articles = conn.execute("SELECT keywords FROM articles").fetchall()
        tag_counts = {}
        for row in articles:
            if row['keywords']:
                tags = [k.strip() for k in row['keywords'].split(',')]
                for t in tags:
                    tag_counts[t] = tag_counts.get(t, 0) + 1
        sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        return jsonify([{"text": t[0], "count": t[1]} for t in sorted_tags])
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/similar-articles', methods=['GET'])
def get_similar_articles():
    article_id = request.args.get('id', type=int)
    if not article_id:
        return jsonify({"error": "Article ID required"}), 400

    try:
        conn = get_db_connection()
        
        # Fetch the selected article
        target_row = conn.execute(
            "SELECT id, title, description, domain FROM articles WHERE id = ?", (article_id,)
        ).fetchone()
        
        if not target_row:
            return jsonify({"error": "Article not found"}), 404
            
        target_article = dict(target_row)
        
        # Fetch candidate articles (excluding the selected one and deleted ones)
        candidates = conn.execute(
            "SELECT id, title, description, domain, source, link FROM articles WHERE id != ? AND deleted = 0 ORDER BY id DESC LIMIT 100", (article_id,)
        ).fetchall()
        
        if not candidates:
            return jsonify({"status": "success", "similar_articles": []})

        # Gemini AI Branch
        if GEMINI_API_KEY:
            try:
                target_text = f"Title: {target_article['title']}\nDescription: {target_article['description'] or ''}\nDomain: {target_article['domain']}"
                candidates_list = []
                for c in candidates:
                    candidates_list.append({
                        "id": c['id'],
                        "title": c['title'],
                        "content": (c['description'] or '')[:300],
                        "domain": c['domain']
                    })
                
                prompt = f"""
Analyze logic for similarity between the NEW ARTICLE and list of PREVIOUS ARTICLES:
1. Score similarity 0-100 based on Topic, Intent, and Domain.
2. Filter out matches below 65%.
3. Return top 5 matches as a JSON array only.

NEW ARTICLE:
{target_text}

PREVIOUS ARTICLES:
{json.dumps(candidates_list, indent=2)}
"""
                client = genai.Client(api_key=GEMINI_API_KEY)
                response = client.models.generate_content(
                    model='gemini-1.5-flash',
                    contents=prompt,
                    config=types.GenerateContentConfig(response_mime_type="application/json")
                )
                
                similarity_results = json.loads(response.text)
                
                # Fetch full data for these results
                final_results = []
                for res in similarity_results:
                    # res might be id, or a more detailed object
                    rid = res if isinstance(res, int) else res.get('id')
                    original = next((c for c in candidates if c['id'] == rid), None)
                    if original:
                        final_results.append({
                            "id": original['id'],
                            "title": original['title'],
                            "similarity_score": res.get('similarity_score', 80) if isinstance(res, dict) else 80,
                            "reason": res.get('reason', 'High semantic overlap.') if isinstance(res, dict) else 'High semantic overlap.',
                            "link": original['link'],
                            "domain": original['domain'],
                            "source": original['source']
                        })
                return jsonify({"status": "success", "similar_articles": final_results})
            except Exception as e:
                print(f"Gemini Similarity Analysis Failed: {e}", flush=True)

        # Robust Native Fallback Branch (Dependency-Free)
        def get_keywords(text):
            if not text: return set()
            words = re.findall(r'\b\w{4,}\b', text.lower())
            return set(w for w in words if w not in STOP_WORDS)

        target_words = get_keywords(f"{target_article['title']} {target_article['description']}")
        
        matches = []
        for c in candidates:
            cand_words = get_keywords(f"{c['title']} {c['description']}")
            intersection = target_words.intersection(cand_words)
            union = target_words.union(cand_words)
            
            # Simple Jaccard Similarity Score
            score = (len(intersection) / len(union) * 100) if union else 0
            
            # Bonus weight if domain matches
            if c['domain'] == target_article['domain']:
                score += 15
            
            if score >= 15: # Threshold for keyword overlap
                matches.append({
                    "id": c['id'],
                    "title": c['title'],
                    "link": c['link'],
                    "domain": c['domain'],
                    "source": c['source'],
                    "similarity_score": min(int(score), 99),
                    "reason": f"Shared keywords: {', '.join(list(intersection)[:3])}" if intersection else "Matching subject domain."
                })
        
        matches = sorted(matches, key=lambda x: x['similarity_score'], reverse=True)[:5]
        return jsonify({"status": "success", "similar_articles": matches})

    except Exception as e:
        print(f"Error finding similar articles: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/tts-script', methods=['GET', 'POST'])
def generate_tts_script():
    if request.method == 'POST':
        data = request.json or {}
        article_id = data.get('id')
        summary_text = data.get('summary')
    else:
        article_id = request.args.get('id', type=int)
        summary_text = None

    if not article_id:
        return jsonify({"error": "Article ID applies"}), 400

    try:
        conn = get_db_connection()
        target_article = conn.execute(
            "SELECT title, description, domain FROM articles WHERE id = ?", (article_id,)
        ).fetchone()
        
        if not target_article:
            return jsonify({"error": "Article not found"}), 404

        target_text = f"Title: {target_article['title']}\nDescription: {target_article['description'] or 'N/A'}\nDomain: {target_article['domain']}"
        if summary_text and len(summary_text.strip()) > 10:
            target_text += f"\n\nProvided Summary to Convert:\n{summary_text}"

        if GEMINI_API_KEY:
            prompt_template = f"""
Convert the provided summary text directly into a continuous, engaging voice narration script.

Instructions:
- Read the exact provided summary text clearly as a single block of text.
- Do not invent new words or add conversational filler; just seamlessly flow the provided summary.

Output exactly this JSON format:
{{
  "voice_text": "The continuous narration script goes here..."
}}

ARTICLE TO ANALYZE:
\"\"\"
{target_text}
\"\"\"
"""
            client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
            response = client.models.generate_content(
                model='gemini-1.5-flash',
                contents=prompt_template,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                )
            )
            script_content = response.text.strip()
        else:
            # Fallback if Gemini is not available
            import json
            print("Gemini API missing. Using offline TTS script fallback.")
            fallback_scene = {
                "voice_text": f"Here is the summarized data for {target_article['title']}: " + (summary_text if summary_text else "No summary available.")
            }
            script_content = json.dumps(fallback_scene)

        has_openai = bool(os.environ.get("OPENAI_API_KEY"))

        return jsonify({
            "status": "success", 
            "script": script_content,
            "has_openai": has_openai
        })

    except Exception as e:
        print(f"Error generating TTS script: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/generate-audio', methods=['POST'])
def generate_audio():
    data = request.json
    text = data.get('text')
    
    if not text:
        return jsonify({"error": "No text provided"}), 400
        
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return jsonify({"error": "OpenAI API Key missing"}), 500
        
    try:
        openai_client = OpenAI(api_key=api_key)
        response = openai_client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input=text
        )
        
        buffer = BytesIO(response.content)
        buffer.seek(0)
        return send_file(buffer, mimetype="audio/mpeg")
    except Exception as e:
        print(f"Error generating audio: {e}")
        return jsonify({"error": str(e)}), 500

import base64

@app.route('/generate-scene-assets', methods=['POST'])
def generate_scene_assets():
    data = request.json or {}
    voice_text = data.get('narration') or data.get('voice_text')
    visual_description = data.get('visual_description')
    
    if not voice_text or not visual_description:
        return jsonify({"error": "Missing voice_text or visual_description"}), 400
        
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return jsonify({"error": "OpenAI API Key missing"}), 500
        
    try:
        openai_client = OpenAI(api_key=api_key)
        
        # 1. Generate Image (DALL-E 3)
        image_response = openai_client.images.generate(
            model="dall-e-3",
            prompt=f"A high-quality educational illustration or photo suitable for a video presentation: {visual_description}. No text in the image. Professional, cinematic lighting.",
            size="1024x1024",
            quality="standard",
            n=1,
            response_format="b64_json"
        )
        image_b64 = image_response.data[0].b64_json
        
        # 2. Generate Audio (TTS)
        response_audio = openai_client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input=voice_text[:4000]
        )
        audio_b64 = base64.b64encode(response_audio.content).decode('utf-8')
        
        return jsonify({
            "status": "success",
            "image_b64": image_b64,
            "audio_b64": audio_b64
        })
        
    except Exception as e:
        print(f"Error generating scene assets: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/save-api-keys', methods=['POST'])
def save_api_keys():
    data = request.json
    openai_key = data.get('openai_key')
    gemini_key = data.get('gemini_key')
    
    env_vars = {}
    if os.path.exists('.env'):
        with open('.env', 'r') as f:
            for line in f:
                if '=' in line:
                    key, val = line.strip().split('=', 1)
                    env_vars[key] = val
                    
    if openai_key:
        env_vars['OPENAI_API_KEY'] = openai_key
        os.environ['OPENAI_API_KEY'] = openai_key
        
    if gemini_key:
        env_vars['GEMINI_API_KEY'] = gemini_key
        os.environ['GEMINI_API_KEY'] = gemini_key
        
    with open('.env', 'w') as f:
        for k, v in env_vars.items():
            f.write(f"{k}={v}\n")
            
    return jsonify({"status": "success", "message": "API Keys saved successfully."})

@app.route('/track-usage', methods=['POST'])
def track_usage():
    data = request.json
    article_id = data.get('article_id')
    user_id = data.get('user_id', 1)
    
    if not article_id:
        return jsonify({"error": "article_id required"}), 400
        
    conn = get_db_connection()
    try:
        # UPSERT logic using INSERT OR IGNORE then UPDATE
        # Or more cleanly with INSERT ... ON CONFLICT (if SQLite version supports it, else use manual check)
        conn.execute('''
            INSERT OR IGNORE INTO article_views (user_id, article_id, view_count)
            VALUES (?, ?, 0)
        ''', (user_id, article_id))
        
        conn.execute('''
            UPDATE article_views SET view_count = view_count + 1
            WHERE user_id = ? AND article_id = ?
        ''', (user_id, article_id))
        
        conn.commit()
        
        # Get updated stats
        total = conn.execute('SELECT SUM(view_count) FROM article_views WHERE article_id = ?', (article_id,)).fetchone()[0]
        user_total = conn.execute('SELECT view_count FROM article_views WHERE article_id = ? AND user_id = ?', (article_id, user_id)).fetchone()[0]
        
        return jsonify({
            "status": "success",
            "total_views": total,
            "user_views": user_total
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/deep_summary', methods=['GET'])
def deep_summary():
    url = request.args.get('url', '')
    title_fallback = request.args.get('title', '')
    desc_fallback = request.args.get('desc', '')
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Referer': 'https://www.google.com/'
        }
        actual_url = url
        if 'news.google.com' in url:
            try:
                decoded = new_decoderv1(url)
                if decoded.get('status') and decoded.get('decoded_url'):
                    actual_url = decoded['decoded_url']
            except:
                pass

        # 1. Guaranteed Content Extraction using Newspaper3k with Fallback
        text = ""
        article_obj = None
        try:
            article_obj = Article(actual_url)
            article_obj.download(timeout=10)
            article_obj.parse()
            text = article_obj.text
            import nltk
            try:
                nltk.data.find('tokenizers/punkt')
            except LookupError:
                nltk.download('punkt', quiet=True)
            article_obj.nlp()
        except:
            try:
                session = requests.Session()
                resp = session.get(actual_url, headers=headers, timeout=10)
                article_obj = Article(actual_url)
                article_obj.set_html(resp.content)
                article_obj.parse()
                text = article_obj.text
                import nltk
                try:
                    nltk.data.find('tokenizers/punkt')
                except LookupError:
                    nltk.download('punkt', quiet=True)
                article_obj.nlp()
            except:
                pass

        # If extraction failed, rely on highly accurate metadata passed from the UI!
        if len(text) < 200:
             if title_fallback or desc_fallback:
                 text = f"{title_fallback}. {desc_fallback}".strip()
             else:
                 return jsonify({
                     "summary_points": [],
                     "summary": "Could not extract enough readable content to summarize. The website might be blocking automated access.",
                     "status": "warning"
                 })

        # 2. LLM Abstractive Summarization Upgrade (Highly Factual)
        if GEMINI_API_KEY:
            try:
                client = genai.Client(api_key=GEMINI_API_KEY)
                prompt = f"""
You are an expert technical AI summarizer. Please analyze the following text strictly and accurately.

1. Provide a cohesive 2-3 sentence paragraph summarizing the core narrative. Be completely factual. Do not hallucinate details.
2. Provide 3-5 succinct bullet points highlighting the most important facts.
Output ONLY valid JSON:
{{
  "summary": "Summary here.",
  "summary_points": ["Point 1", "Point 2"]
}}
                
TEXT TO SUMMARIZE:
{text[:15000]}
"""
                response = client.models.generate_content(
                    model='gemini-1.5-flash',
                    contents=prompt
                )
                result_text = response.text.strip()
                if result_text.startswith("```json"):
                    result_text = result_text[7:-3].strip()
                elif result_text.startswith("```"):
                    result_text = result_text[3:-3].strip()
                
                import json
                llm_data = json.loads(result_text)
                summary_text = llm_data.get("summary", "")
                
                return jsonify({
                    "summary_points": llm_data.get("summary_points", []),
                    "summary": summary_text,
                    "word_count": len(summary_text.split()),
                    "status": "success",
                    "mode": "ai"
                })
            except Exception as e:
                print(f"DEBUG Summary: Gemini LLM analysis failed. Warning: {e}", flush=True)

        # 3. Robust Native NLP Summarization Fallback (No Scikit-Learn dependencies to prevent 500 crashes)
        fallback_summary = article_obj.summary if article_obj and article_obj.summary else ""
        if fallback_summary and len(fallback_summary) > 50:
             return jsonify({
                 "summary_points": fallback_summary.split('\n'),
                 "summary": fallback_summary.replace('\n', ' '),
                 "word_count": len(fallback_summary.split()),
                 "status": "success",
                 "mode": "extractive-nlp"
             })
             
        # 4. Ultimate Manual Extractive Fallback
        text = re.sub(r'\s+', ' ', text)
        sentences = re.split(r'(?<=[.!?])\s+', text.strip())
        valid_sentences = [s for s in sentences if 15 < len(s) < 800 and not any(bp in s.lower() for bp in ['terms of service', 'privacy policy'])]
        
        fallback_summary = " ".join(valid_sentences[:min(6, len(valid_sentences))])
        
        return jsonify({
            "summary_points": [],
            "summary": fallback_summary,
            "word_count": len(fallback_summary.split()),
            "status": "success",
            "mode": "extractive-manual"
        })

    except Exception as e:
        print(f"Deep Summary Error: {str(e)}")
        return jsonify({
            "summary_points": [],
            "summary": f"Extraction framework failed: {str(e)}. The website might be completely blocking automated access.",
            "status": "error"
        }), 500

@app.route('/api/v1/schemes', methods=['GET'])
def fetch_gov_schemes():
    # Large categorized list of real-world Indian government schemes
    all_schemes = [
        # HEALTH SCHEMES
        {
            "title": "Ayushman Bharat (PM-JAY)",
            "sector": "Health",
            "state": "Pan-India",
            "desc": "Universal health coverage for bottom 40% of India's population. ₹5 lakh per family per year for secondary and tertiary care.",
            "link": "https://pmjay.gov.in/",
            "image_url": "https://upload.wikimedia.org/wikipedia/en/thumb/5/51/Ayushman_Bharat_logo.svg/1200px-Ayushman_Bharat_logo.svg.png"
        },
        {
            "title": "Mission Indradhanush",
            "sector": "Health",
            "state": "Pan-India",
            "desc": "Universal immunization program aiming at full immunization coverage with 12 vaccines for children and pregnant women.",
            "link": "https://pib.gov.in/PressReleseDetail.aspx?PRID=1815152",
            "image_url": "https://nhm.gov.in/images/pdf/Indradhanush/banner_Indradhanush.jpg"
        },
        {
            "title": "Janani Suraksha Yojana (JSY)",
            "sector": "Health",
            "state": "Pan-India",
            "desc": "Safe motherhood intervention scheme to reduce maternal and neonatal mortality by promoting institutional delivery among poor pregnant women.",
            "link": "https://nhm.gov.in/index1.php?lang=1&level=3&sublinkid=841&lid=309",
            "image_url": "https://nhm.gov.in/images/pdf/JSY/jsy_logo.png"
        },
        
        # STUDENT & EDUCATION SCHEMES
        {
            "title": "PM Vidya Lakshmi Scheme",
            "sector": "Students & Education",
            "state": "Pan-India",
            "desc": "First of its kind portal for students seeking education loans. Provides a single window for students to access information and make multiple applications for educational loans.",
            "link": "https://www.vidyalakshmi.co.in/",
            "image_url": "https://www.vidyalakshmi.co.in/Students/images/logo.png"
        },
        {
            "title": "Samagra Shiksha Abhiyan",
            "sector": "Students & Education",
            "state": "Pan-India",
            "desc": "Integrated Scheme for School Education from Pre-school to Senior Secondary levels with the aim of ensuring inclusive and equitable quality education.",
            "link": "https://samagra.education.gov.in/",
            "image_url": "https://samagra.education.gov.in/images/logo.png"
        },
        {
            "title": "Pradhan Mantri Innovative Learning Programme (DHRUV)",
            "sector": "Students & Education",
            "state": "Pan-India",
            "desc": "A scheme targeted at talented students to enrich their knowledge and skills in centers of excellence.",
            "link": "https://pib.gov.in/PressReleseDetail.aspx?PRID=1587637",
            "image_url": "https://pib.gov.in/images/PIB_Logo.png"
        },
        
        # AGRICULTURE & FARMER SCHEMES
        {
            "title": "PM Kisan Samman Nidhi",
            "sector": "Agriculture & Farmers",
            "state": "Pan-India",
            "desc": "Direct income support of ₹6000/- per year to all farmer families across the country.",
            "link": "https://pmkisan.gov.in/",
            "image_url": "https://pmkisan.gov.in/Images/logo.png"
        },
        {
            "title": "PM Fasal Bima Yojana (PMFBY)",
            "sector": "Agriculture & Farmers",
            "state": "Pan-India",
            "desc": "Government-sponsored crop insurance scheme that integrates multiple stakeholders and provides low-cost premium insurance for farmers.",
            "link": "https://pmfby.gov.in/",
            "image_url": "https://pmfby.gov.in/assets/images/logo.png"
        },
        {
            "title": "Soil Health Card Scheme",
            "sector": "Agriculture & Farmers",
            "state": "Pan-India",
            "desc": "Assists State Governments to issue soil health cards to all farmers to help them understand soil health and use fertilizers accordingly.",
            "link": "https://soilhealth.dac.gov.in/",
            "image_url": "https://soilhealth.dac.gov.in/Content/images/logo.png"
        },

        # FINANCE & BUSINESS SCHEMES
        {
            "title": "Pradhan Mantri Mudra Yojana (PMMY)",
            "sector": "Finance & Business",
            "state": "Pan-India",
            "desc": "Loans up to ₹10 lakh to non-corporate, non-farm small/micro enterprises. Divided into Shishu, Kishor, and Tarun loans.",
            "link": "https://www.mudra.org.in/",
            "image_url": "https://www.mudra.org.in/Content/images/logo.png"
        },
        {
            "title": "Stand-Up India Scheme",
            "sector": "Finance & Business",
            "state": "Pan-India",
            "desc": "Bank loans between ₹10 lakh and ₹1 Crore to at least one SC/ST and at least one woman per branch for setting up a greenfield enterprise.",
            "link": "https://www.standupmitra.in/",
            "image_url": "https://www.standupmitra.in/assets/images/logo.png"
        },
        {
            "title": "PMEGP (Prime Minister's Employment Generation Programme)",
            "sector": "Finance & Business",
            "state": "Pan-India",
            "desc": "Credit-linked subsidy program aimed at generating self-employment opportunities through establishment of micro-enterprises in non-farm sector.",
            "link": "https://www.kviconline.gov.in/pmegpeportal/pmegphome/index.jsp",
            "image_url": "https://www.kviconline.gov.in/pmegpeportal/images/logo.png"
        },
        
        # DIGITAL & TECH SCHEMES
        {
            "title": "Digital India Bhashini",
            "sector": "Digital & Tech",
            "state": "Pan-India",
            "desc": "AI-led language translation platform to provide internet and digital services in Indian languages, including voice-based access.",
            "link": "https://bhashini.gov.in/",
            "image_url": "https://bhashini.gov.in/static/media/bhashini-logo.1d8d3e9c.png"
        },
        {
            "title": "PM-WANI (Wi-Fi Access Network Interface)",
            "sector": "Digital & Tech",
            "state": "Pan-India",
            "desc": "Aims to elevate wireless internet connectivity to boost the digital economy through Public Data Offices (PDOs).",
            "link": "https://dot.gov.in/pm-wani",
            "image_url": "https://dot.gov.in/sites/all/themes/dot/logo.png"
        }
    ]
    
    # Handle Sector Filtering for more specific requests
    requested_sector = request.args.get('sector')
    if requested_sector:
        schemes = [s for s in all_schemes if s['sector'].lower() == requested_sector.lower()]
    else:
        schemes = all_schemes

    return jsonify({"status": "success", "schemes": schemes})

if __name__ == '__main__':
    with app.app_context():
        init_db()
    app.run(host='0.0.0.0', debug=True, port=5003)
else:
    # Ensure DB is initialized when running with a WSGI server
    with app.app_context():
        init_db()
