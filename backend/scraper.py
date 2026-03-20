import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse

def scrape_article(url):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Remove script and style elements
        for script in soup(["script", "style"]):
            script.decompose()
            
        title = soup.title.string if soup.title else "No Title"
        
        # Simple heuristic to get the main content
        # Often articles are inside <article> or <main> or <div> with certain classes
        article_body = soup.find('article')
        if not article_body:
            article_body = soup.find('main')
        if not article_body:
            # Fallback: get all paragraph text
            paragraphs = soup.find_all('p')
            content = '\n'.join([p.get_text() for p in paragraphs])
        else:
            content = article_body.get_text(separator='\n')
            
        source = urlparse(url).netloc
        
        return {
            'url': url,
            'title': title.strip(),
            'content': content.strip(),
            'source': source
        }
    except Exception as e:
        print(f"Error scraping {url}: {e}")
        return None

if __name__ == "__main__":
    test_url = "https://www.theverge.com/2024/2/23/24080928/google-gemini-ai-image-generation-pause-explanation"
    data = scrape_article(test_url)
    if data:
        print(f"Title: {data['title']}")
        print(f"Content Length: {len(data['content'])}")
