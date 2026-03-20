import requests
from bs4 import BeautifulSoup
import re

print("Starting fetch...")
actual_url = "https://example.com"
headers = {
    'User-Agent': 'Mozilla/5.0'
}
response = requests.get(actual_url, headers=headers, timeout=15)
response.raise_for_status()
print("Parsing...")
soup = BeautifulSoup(response.content, 'html.parser')

print("Decomposing...")
for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'iframe', 'ads', 'noscript']):
    tag.decompose()

print("Finding main...")
main_content = soup.find('article') or soup.find('main') or soup.find('div', class_=re.compile(r'article|content|post|story', re.I))
search_root = main_content if main_content else soup

good_elements = []
for tag in search_root.find_all(['p', 'div', 'span', 'section']):
    txt = tag.get_text(strip=True)
    if len(txt) > 50:
        if len(txt.split()) > 8:
            good_elements.append(txt)

text = ' '.join(good_elements)
if len(text) < 400:
    text = soup.get_text(separator=' ', strip=True)

print("Text length:", len(text))
print("Done!")
