import React from 'react';
import './ContentCard.css';

const ContentCard = ({ title, source, summary, type, date, image }) => {
    return (
        <div className="content-card">
            {image && <div className="card-image" style={{ backgroundImage: `url(${image})` }}></div>}
            <div className="card-body">
                <div className="card-header">
                    <span className={`type-tag ${type.toLowerCase()}`}>{type}</span>
                    <span className="card-date">{date}</span>
                </div>
                <h3>{title}</h3>
                <p className="source">via {source}</p>
                <p className="summary">{summary}</p>
                <div className="card-footer">
                    <button className="read-more">Read More</button>
                    <button className="save-btn">🔖</button>
                </div>
            </div>
        </div>
    );
};

export default ContentCard;
