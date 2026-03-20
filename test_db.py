import sqlite3
try:
    conn = sqlite3.connect('database.db', timeout=2)
    rows = conn.execute('SELECT count(*) FROM articles').fetchone()
    print("Success:", rows[0])
    conn.close()
except Exception as e:
    print("Error:", e)
