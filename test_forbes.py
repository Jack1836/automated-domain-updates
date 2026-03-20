import requests
from bs4 import BeautifulSoup
from newspaper import Article

url = 'https://www.forbes.com/sites/gilpress/2026/02/27/the-state-of-the-17-trillion-ai-bubble-the-end-of-thinking/'
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://www.google.com/'
}

try:
    s = requests.Session()
    resp = s.get(url, headers=headers, timeout=15)
    print(f"Status Code: {resp.status_code}")
    
    article_obj = Article(url)
    article_obj.set_html(resp.content)
    article_obj.parse()
    text = article_obj.text
    print(f"Newspaper3k text length from requests HTML: {len(text)}")
    print(text[:200])

except Exception as e:
    print(f"Error: {e}")
