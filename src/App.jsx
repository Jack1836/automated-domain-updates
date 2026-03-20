import React, { useState, useEffect } from 'react';
import ArticleCard from './components/ArticleCard';
import './styles/GlobalStyles.css';

const API_BASE = `http://${window.location.hostname}:5001`;

function App() {
  const [articles, setArticles] = useState([]);
  const [query, setQuery] = useState('');
  const [urlToScrape, setUrlToScrape] = useState('');
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState('home'); // 'home', 'saved', 'recommend'

  const fetchArticles = async (endpoint = '/search') => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}${endpoint}`);
      const data = await res.json();
      setArticles(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setArticles(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleScrape = async () => {
    if (!urlToScrape) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToScrape })
      });
      const data = await res.json();
      if (res.ok) {
        alert("Article processed!");
        fetchArticles();
        setUrlToScrape('');
      } else {
        alert(data.message || data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (id) => {
    try {
      await fetch(`${API_BASE}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: id })
      });
      alert("Article saved and preferences updated!");
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  const switchView = (v) => {
    setView(v);
    setMenuOpen(false);
    if (v === 'home') fetchArticles('/search');
    if (v === 'saved') fetchArticles('/saved');
    if (v === 'recommend') fetchArticles('/recommend');
  };

  return (
    <div className="container">
      <header className="header">
        <div className="logo" onClick={() => switchView('home')} style={{ cursor: 'pointer' }}>
          <span>🧠</span> SmartAggregator
        </div>
        <div className="hamburger" onClick={() => setMenuOpen(!menuOpen)}>
          ☰
        </div>
      </header>

      <div className={`menu-overlay ${menuOpen ? 'active' : ''}`}>
        <div className="menu-item" onClick={() => switchView('home')}>🏠 Home</div>
        <div className="menu-item" onClick={() => switchView('recommend')}>🤖 AI Recommendations</div>
        <div className="menu-item" onClick={() => switchView('saved')}>📚 Saved Articles</div>
        <div className="menu-item" onClick={() => setMenuOpen(false)}>❌ Close</div>
      </div>

      <div className="search-section">
        <div className="input-group">
          <form onSubmit={handleSearch} style={{ display: 'flex', flex: 1 }}>
            <input
              type="text"
              placeholder="Search by keyword or semantic meaning..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="btn">Search</button>
          </form>
        </div>

        <div className="input-group">
          <input
            type="text"
            placeholder="Paste URL to analyze and summarize..."
            value={urlToScrape}
            onChange={(e) => setUrlToScrape(e.target.value)}
          />
          <button className="btn btn-secondary" onClick={handleScrape}>Analyze URL</button>
        </div>
      </div>

      <h2 style={{ marginBottom: '2rem', fontSize: '2rem', fontWeight: '700' }}>
        {view === 'home' && 'Latest Industry Insights'}
        {view === 'saved' && 'Your Knowledge Base'}
        {view === 'recommend' && 'Tailored For You'}
      </h2>

      {loading ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p style={{ fontWeight: '600', color: 'var(--primary)' }}>Our AI is processing the latest content...</p>
        </div>
      ) : (
        <div className="article-grid">
          {articles.map(article => (
            <ArticleCard
              key={article.id}
              article={article}
              onSave={handleSave}
            />
          ))}
          {articles.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', background: 'var(--card-bg)', borderRadius: '24px' }}>
              <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>No insights found. Try a different search or paste a URL above.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
