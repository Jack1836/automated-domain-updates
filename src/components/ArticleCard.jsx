import React, { useState } from 'react';

const API_BASE = `http://${window.location.hostname}:5001`;

const ArticleCard = ({ article, onSave }) => {
    const [deepSummary, setDeepSummary] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleDeepSummary = async () => {
        if (deepSummary) {
            setDeepSummary(null);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/deep_summary?url=${encodeURIComponent(article.link || article.url)}`);
            const data = await res.json();
            if (data.status === 'success') {
                setDeepSummary(data.summary);
            } else {
                alert(data.summary || data.error || "Could not extract content.");
            }
        } catch (err) {
            console.error(err);
            alert("Error fetching deep summary.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="article-card">
            <div className="article-content">
                <span className="article-category">{article.category}</span>
                <h3 className="article-title">{article.title}</h3>
                <p className="article-summary">{article.summary}</p>

                {deepSummary && (
                    <div className="deep-summary-box">
                        <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>✨</span> AI Deep Analysis (150-200 words)
                        </h4>
                        <p style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--text-main)' }}>{deepSummary}</p>
                    </div>
                )}

                <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                    <a href={article.url || article.link} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.6rem 1.2rem', textDecoration: 'none' }}>Original</a>
                    <button className="btn" style={{ fontSize: '0.85rem', padding: '0.6rem 1.2rem', background: 'var(--card-bg)', color: 'var(--text-main)', border: '1px solid var(--glass-border)' }} onClick={() => onSave(article.id)}>Save Library</button>
                    <button
                        className="btn"
                        style={{
                            fontSize: '0.85rem',
                            padding: '0.6rem 1.2rem',
                            background: 'linear-gradient(135deg, #6e8efb, #a777e3)',
                            marginLeft: 'auto'
                        }}
                        onClick={handleDeepSummary}
                        disabled={loading}
                    >
                        {loading ? 'Analyzing...' : (deepSummary ? 'Show Less' : 'Summarize Detailed')}
                    </button>
                </div>
            </div>
            <div className="article-footer">
                <span>🌐 {article.source}</span>
                {article.score && (
                    <span style={{ color: 'var(--primary)', fontWeight: '700' }}>
                        {Math.round(article.score * 100)}% Match
                    </span>
                )}
            </div>
        </div>
    );
};

export default ArticleCard;
