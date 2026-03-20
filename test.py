import sqlite3
conn = sqlite3.connect('database.db')
cursor = conn.cursor()
cursor.execute("UPDATE articles SET deleted = 1 WHERE id = 257125")
conn.commit()
print("updated")
conn.close()
