import base64
import re
import sys

def decode_google_news_url(url):
    if 'rss/articles/' not in url:
        return url
    try:
        # Extract the base64 part
        base64_str = url.split('rss/articles/')[1].split('?')[0]
        # Add padding
        base64_str += '=' * (-len(base64_str) % 4)
        decoded = base64.urlsafe_b64decode(base64_str)
        
        # Look for the URL inside the decoded bytes
        # The URL is usually preceded by some bytes and followed by some bytes
        # Strategy: Search for http
        match = re.search(b'https?://[^\x00-\x1f\x7f-\xff]*', decoded)
        if match:
            return match.group().decode()
    except Exception as e:
        print(f"Error decoding: {e}", file=sys.stderr)
    return url

if __name__ == "__main__":
    print(decode_google_news_url(sys.argv[1]))
