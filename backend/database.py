from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'aggregator.db')
engine = create_engine(f'sqlite:///{DB_PATH}')
Base = declarative_base()

class Article(Base):
    __tablename__ = 'articles'
    
    id = Column(Integer, primary_key=True)
    url = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    summary = Column(Text)
    category = Column(String)
    source = Column(String)
    published_date = Column(DateTime, default=datetime.datetime.utcnow)
    embedding = Column(Text)  # JSON string of the embedding vector
    
class UserPreference(Base):
    __tablename__ = 'user_preferences'
    
    id = Column(Integer, primary_key=True)
    topic = Column(String, nullable=False)
    weight = Column(Float, default=1.0)

class SavedArticle(Base):
    __tablename__ = 'saved_articles'
    
    id = Column(Integer, primary_key=True)
    article_id = Column(Integer, nullable=False)
    saved_at = Column(DateTime, default=datetime.datetime.utcnow)

def init_db():
    Base.metadata.create_all(engine)

Session = sessionmaker(bind=engine)

def get_session():
    return Session()

if __name__ == "__main__":
    init_db()
    print(f"Database initialized at {DB_PATH}")
