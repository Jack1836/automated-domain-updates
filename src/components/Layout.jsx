import React from 'react';
import './Layout.css';

const Layout = ({ children, onLogout }) => {
    return (
        <div className="layout-container">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <h2>SmartContent</h2>
                </div>
                <nav className="sidebar-nav">
                    <ul>
                        <li className="active">Dashboard</li>
                        <li>Sources</li>
                        <li>Collections</li>
                        <li>Settings</li>
                    </ul>
                </nav>
            </aside>
            <main className="main-content">
                <header className="top-nav">
                    <div className="search-bar">
                        <input type="text" placeholder="Search aggregator..." />
                    </div>
                    <div className="user-profile">
                        <span className="avatar">JD</span>
                        <button className="logout-btn" onClick={onLogout}>Logout</button>
                    </div>
                </header>
                <div className="content-area">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
