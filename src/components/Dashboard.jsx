import React from 'react';
import ContentCard from './ContentCard';
import './Dashboard.css';

const Dashboard = () => {
    const mockData = [
        {
            id: 1,
            title: "The Future of AI Architecture",
            source: "TechCrunch",
            summary: "Exploring how agentic workflows are changing the way we build software and interact with LLMs.",
            type: "Article",
            date: "2 hours ago",
            image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=600"
        },
        {
            id: 2,
            title: "Scaling React Apps in 2025",
            source: "Dev.to",
            summary: "A comprehensive guide to performance optimization and state management in large-scale React applications.",
            type: "Video",
            date: "5 hours ago",
            image: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&q=80&w=600"
        },
        {
            id: 3,
            title: "New developments in quantum computing",
            source: "Twitter",
            summary: "Breaking: IBM announces new 1000+ qubit processor with unprecedented error correction capabilities.",
            type: "Tweet",
            date: "1 day ago"
        },
        {
            id: 4,
            title: "Mastering CSS Grid and Flexbox",
            source: "Frontend Masters",
            summary: "Advanced layout techniques for modern web development, focusing on responsive design and accessibility.",
            type: "Article",
            date: "2 days ago",
            image: "https://images.unsplash.com/photo-1507721999472-8ed4421c4af2?auto=format&fit=crop&q=80&w=600"
        }
    ];

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <h1>Aggregated Feed</h1>
                <p>Latest updates from your connected sources</p>
            </div>
            <div className="content-grid">
                {mockData.map(item => (
                    <ContentCard key={item.id} {...item} />
                ))}
            </div>
        </div>
    );
};

export default Dashboard;
