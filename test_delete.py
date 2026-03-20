import requests
import sqlite3

conn = sqlite3.connect('database.db')
conn.row_factory = sqlite3.Row
article = conn.execute("SELECT id FROM articles WHERE deleted = 0 LIMIT 1").fetchone()
if not article:
    print("No articles found")
    exit()
article_id = article['id']
print(f"Testing delete on article_id: {article_id}")

res = requests.post("http://127.0.0.1:5001/delete", json={"id": article_id})
print("API Response:", res.json())

post_article = conn.execute(f"SELECT deleted FROM articles WHERE id = {article_id}").fetchone()
print(f"Deleted status in DB: {post_article['deleted']}")
conn.close()
