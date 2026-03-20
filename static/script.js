document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menu-toggle');
    const closeSidebar = document.getElementById('close-sidebar');
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-input');
    const refreshBtn = document.getElementById('refresh-btn');
    const articlesGrid = document.getElementById('articles-grid');
    const domainSearchInput = document.getElementById('domain-search-input');
    const domainList = document.getElementById('domain-list');
    const resultsCount = document.getElementById('results-count');
    const sidebarSavedBtn = document.getElementById('sidebar-saved-btn');

    let currentDomain = 'All';
    let lastKnownNewsId = null;
    let lastKnownTechId = null;
    let newUpdates = [];
    let activeSentimentFilter = 'all';
    let aiSummaryMode = false;

    const notifBtn = document.getElementById('sidebar-notifications-btn');
    const notifBadge = document.getElementById('notif-badge');
    const aiToggle = document.getElementById('ai-summary-toggle');

    aiToggle.addEventListener('change', () => {
        aiSummaryMode = aiToggle.checked;
        const cards = document.querySelectorAll('.article-card');
        cards.forEach(card => {
            const descElem = card.querySelector('.article-desc');
            if (aiSummaryMode) {
                const points = JSON.parse(card.dataset.summaryPoints || '[]');
                const keywords = card.dataset.keywords ? JSON.parse(card.dataset.keywords) : [];
                if (points.length > 0) {
                    descElem.innerHTML = `<ul class="summary-list">${points.map(p => `<li>${highlightKeywords(p, keywords)}</li>`).join('')}</ul>`;
                    descElem.classList.add('nlp-summary');
                } else if (card.dataset.summary) {
                    descElem.textContent = card.dataset.summary;
                    descElem.classList.add('nlp-summary');
                } else {
                    descElem.innerHTML = `<div class="no-summary"><i class="fas fa-info-circle"></i> No detailed summary available yet. Click "Quick View" for analysis.</div>`;
                    descElem.classList.remove('nlp-summary');
                }
            } else if (!aiSummaryMode) {
                descElem.textContent = card.dataset.originalDesc || '';
                descElem.classList.remove('nlp-summary');
            }
        });
    });

    // Helper to set active sidebar item
    const setActiveTab = (element) => {
        document.querySelectorAll('.domain-item').forEach(item => item.classList.remove('active'));
        if (notifBtn) notifBtn.classList.remove('active');
        if (sidebarSavedBtn) sidebarSavedBtn.classList.remove('active');

        if (element) {
            element.classList.add('active');
        }
    };

    // Notification Permission Request
    const requestNotificationPermission = () => {
        if ('Notification' in window) {
            Notification.requestPermission();
        }
    };

    // Update Notification Badge
    const updateBadge = () => {
        if (notifBadge) {
            if (newUpdates.length > 0) {
                notifBadge.innerText = newUpdates.length;
                notifBadge.classList.add('active');
            } else {
                notifBadge.classList.remove('active');
            }
        }
    };

    // Background Polling for Updates
    const startBackgroundPolling = () => {
        setInterval(async () => {
            try {
                // Poll News
                await fetch('/scrape?domain=News');
                const newsRes = await fetch('/search?q=&domain=News');
                const newsArticles = await newsRes.json();

                if (newsArticles.length > 0) {
                    const latest = newsArticles[0];
                    if (lastKnownNewsId && latest.id > lastKnownNewsId) {
                        const fresh = newsArticles.filter(a => a.id > lastKnownNewsId);
                        newUpdates = [...fresh, ...newUpdates];
                        triggerPushNotification(fresh.length, 'News');
                    }
                    lastKnownNewsId = latest.id;
                }

                // Poll Technology
                await fetch('/scrape?domain=Technology');
                const techRes = await fetch('/search?q=&domain=Technology');
                const techArticles = await techRes.json();

                if (techArticles.length > 0) {
                    const latest = techArticles[0];
                    if (lastKnownTechId && latest.id > lastKnownTechId) {
                        const fresh = techArticles.filter(a => a.id > lastKnownTechId);
                        newUpdates = [...fresh, ...newUpdates];
                        triggerPushNotification(fresh.length, 'Technology');
                    }
                    lastKnownTechId = latest.id;
                }

                updateBadge();
            } catch (error) {
                console.error('Background polling error:', error);
            }
        }, 120000); // Poll every 2 minutes instead of 10 seconds to prevent server saturation
    };

    const triggerPushNotification = (count, domain) => {
        if (Notification.permission === 'granted') {
            new Notification('New Shared Content!', {
                body: `Found ${count} new update(s) in ${domain}. Click to view in notifications.`,
                icon: 'https://cdn-icons-png.flaticon.com/512/1042/1042680.png'
            });
        }
    };

    // Sidebar Toggle
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    closeSidebar.addEventListener('click', () => {
        sidebar.classList.remove('open');
    });

    document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });

    // Refresh Logic
    refreshBtn.addEventListener('click', async () => {
        const originalContent = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';
        refreshBtn.disabled = true;

        try {
            const url = `/scrape?domain=${encodeURIComponent(currentDomain)}`;
            await fetch(url);
            await fetchArticles();
        } catch (error) {
            console.error('Error refreshing:', error);
        } finally {
            refreshBtn.innerHTML = originalContent;
            refreshBtn.disabled = false;
        }
    });

    // Domain Management
    const loadDomains = async () => {
        try {
            const resp = await fetch('/get-domains');
            const domains = await resp.json();

            domainList.innerHTML = '<li class="domain-item" data-domain="All">All</li>';

            domains.forEach(d => {
                const li = document.createElement('li');
                li.className = 'domain-item';
                li.setAttribute('data-domain', d);
                li.innerHTML = `
                    <span>${d}</span>
                    <button class="remove-domain-btn" title="Remove Domain"><i class="fas fa-times"></i></button>
                `;
                domainList.appendChild(li);
            });

            // Re-attach listeners
            const currentItems = document.querySelectorAll('.domain-item');
            currentItems.forEach(item => {
                // Set active if it matches current domain
                if (item.getAttribute('data-domain') === currentDomain) {
                    item.classList.add('active');
                }

                item.addEventListener('click', (e) => {
                    if (e.target.closest('.remove-domain-btn')) return;
                    setActiveTab(item);
                    currentDomain = item.getAttribute('data-domain');
                    fetchArticles();
                    if (window.innerWidth <= 768) sidebar.classList.remove('open');
                });

                const removeBtn = item.querySelector('.remove-domain-btn');
                if (removeBtn) {
                    removeBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        await removeDomain(item.getAttribute('data-domain'));
                    });
                }
            });
        } catch (e) {
            console.error('Error loading domains:', e);
        }
    };

    const removeDomain = async (domainName) => {
        try {
            await fetch('/remove-domain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: domainName })
            });
            if (currentDomain === domainName) {
                currentDomain = 'All';
                fetchArticles();
            }
            loadDomains();
        } catch (e) {
            console.error('Error removing domain:', e);
        }
    };

    // Load initial domains
    loadDomains();

    // Search
    searchBtn.addEventListener('click', () => {
        fetchArticles();
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            fetchArticles();
            const searchSuggestions = document.getElementById('search-suggestions');
            if (searchSuggestions) searchSuggestions.style.display = 'none';
        }
    });

    // Sentiment Filter Buttons
    const sentimentFilterBtns = document.querySelectorAll('.sentiment-filter');
    sentimentFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sentimentFilterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeSentimentFilter = btn.dataset.sentiment;
            document.querySelectorAll('.article-card').forEach(card => {
                const cardSentiment = card.dataset.sentiment || 'Neutral';
                if (activeSentimentFilter === 'all' || cardSentiment === activeSentimentFilter) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });

    // =====================
    // SEARCH SUGGESTIONS
    // =====================
    const searchSuggestions = document.getElementById('search-suggestions');
    const domainSuggestions = document.getElementById('domain-suggestions');

    const fetchSuggestions = async (query, dropdown) => {
        if (!query || query.length < 2) {
            dropdown.style.display = 'none';
            return;
        }

        try {
            const resp = await fetch(`/suggestions?q=${encodeURIComponent(query)}`);
            const suggestions = await resp.json();

            if (suggestions.length > 0) {
                renderSuggestions(suggestions, dropdown, query);
            } else {
                dropdown.style.display = 'none';
                dropdown.parentElement.classList.remove('has-suggestions');
            }
        } catch (e) {
            console.error('Suggestion error:', e);
            dropdown.style.display = 'none';
            dropdown.parentElement.classList.remove('has-suggestions');
        }
    };

    const renderSuggestions = (suggestions, dropdown, query) => {
        dropdown.innerHTML = suggestions.map(s => {
            const regex = new RegExp(`(${query})`, 'gi');
            const highlighted = s.replace(regex, '<strong>$1</strong>');
            return `<div class="suggestion-item" data-value="${s}">${highlighted}</div>`;
        }).join('');

        dropdown.style.display = 'block';
        dropdown.parentElement.classList.add('has-suggestions');

        dropdown.querySelectorAll('.suggestion-item').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                const parent = dropdown.parentElement;
                const input = parent.querySelector('input');
                input.value = item.getAttribute('data-value');
                dropdown.style.display = 'none';
                parent.classList.remove('has-suggestions');

                if (input.id === 'search-input') {
                    fetchArticles();
                } else {
                    const event = new Event('input', { bubbles: true });
                    input.dispatchEvent(event);
                }
            };
        });
    };

    searchInput.addEventListener('input', (e) => {
        fetchSuggestions(e.target.value, searchSuggestions);
    });

    domainSearchInput.addEventListener('input', async (e) => {
        const query = e.target.value;
        if (!query || query.length < 1) {
            domainSuggestions.style.display = 'none';
            domainSuggestions.parentElement.classList.remove('has-suggestions');
            return;
        }

        try {
            const resp = await fetch(`/available-domains?q=${encodeURIComponent(query)}`);
            const suggestions = await resp.json();

            if (suggestions.length > 0) {
                domainSuggestions.innerHTML = suggestions.map(s => {
                    const regex = new RegExp(`(${query})`, 'gi');
                    const highlighted = s.replace(regex, '<strong>$1</strong>');
                    return `<div class="suggestion-item" data-value="${s}">${highlighted}</div>`;
                }).join('');

                domainSuggestions.style.display = 'block';
                domainSuggestions.parentElement.classList.add('has-suggestions');

                domainSuggestions.querySelectorAll('.suggestion-item').forEach(item => {
                    item.onclick = async (e) => {
                        e.stopPropagation();
                        const domainName = item.getAttribute('data-value');
                        domainSuggestions.style.display = 'none';
                        domainSuggestions.parentElement.classList.remove('has-suggestions');
                        domainSearchInput.value = ''; // clear input

                        try {
                            await fetch('/add-domain', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ domain: domainName })
                            });

                            articlesGrid.innerHTML = `<div class="loader">Extracting latest articles for ${domainName}... This may take a moment.</div>`;

                            await fetch('/extract-domain-data');
                            loadDomains();

                            // If we are on the 'All' tab, or viewing the new domain, refresh the articles
                            if (currentDomain === 'All' || currentDomain === domainName) {
                                currentDomain = domainName; // optionally auto-switch
                                fetchArticles();
                            }

                        } catch (error) {
                            console.error('Error adding domain:', error);
                            articlesGrid.innerHTML = '<div class="loader">Error tracking domain.</div>';
                        }
                    };
                });
            } else {
                domainSuggestions.style.display = 'none';
                domainSuggestions.parentElement.classList.remove('has-suggestions');
            }
        } catch (error) {
            console.error('Error fetching available domains:', error);
            domainSuggestions.style.display = 'none';
            domainSuggestions.parentElement.classList.remove('has-suggestions');
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-bar') && !e.target.closest('.domain-search')) {
            if (searchSuggestions) {
                searchSuggestions.style.display = 'none';
                searchSuggestions.parentElement.classList.remove('has-suggestions');
            }
            if (domainSuggestions) {
                domainSuggestions.style.display = 'none';
                domainSuggestions.parentElement.classList.remove('has-suggestions');
            }
        }
    });

    const handleKeyNav = (e, dropdown) => {
        if (!dropdown || dropdown.style.display === 'none') return;
        const items = dropdown.querySelectorAll('.suggestion-item');
        const active = dropdown.querySelector('.suggestion-item.active');
        let index = active ? Array.from(items).indexOf(active) : -1;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            index = (index + 1) % items.length;
            items.forEach(i => i.classList.remove('active'));
            items[index].classList.add('active');
            items[index].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            index = (index - 1 + items.length) % items.length;
            items.forEach(i => i.classList.remove('active'));
            items[index].classList.add('active');
            items[index].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' && active) {
            e.preventDefault();
            active.click();
        }
    };

    searchInput.addEventListener('keydown', (e) => handleKeyNav(e, searchSuggestions));
    domainSearchInput.addEventListener('keydown', (e) => handleKeyNav(e, domainSuggestions));

    // View Notifications
    notifBtn.addEventListener('click', () => {
        setActiveTab(notifBtn);
        renderArticles(newUpdates);
        resultsCount.innerText = `New Updates (${newUpdates.length})`;
        newUpdates = [];
        updateBadge();
        if (window.innerWidth <= 768) sidebar.classList.remove('open');
    });

    // View Saved
    const showSaved = (btnElement) => {
        setActiveTab(btnElement || sidebarSavedBtn);
        fetchSavedArticles();
        if (window.innerWidth <= 768) sidebar.classList.remove('open');
    };

    sidebarSavedBtn.addEventListener('click', () => showSaved(sidebarSavedBtn));

    // Fetch Articles
    async function fetchArticles() {
        articlesGrid.innerHTML = '<div class="loader">Fetching articles...</div>';
        const query = searchInput.value;
        let url = `/search?q=${encodeURIComponent(query)}&domain=${encodeURIComponent(currentDomain)}`;

        // Use the domain-filtered endpoint if no manual search is active and 'All' is selected
        if (!query && currentDomain === 'All') {
            url = '/get-articles';
        }

        try {
            const response = await fetch(url);
            const data = await response.json();
            renderArticles(data);
        } catch (error) {
            articlesGrid.innerHTML = '<div class="loader">Error loading articles.</div>';
        }
    }

    async function fetchSavedArticles() {
        articlesGrid.innerHTML = '<div class="loader">Loading saved articles...</div>';
        try {
            const response = await fetch('/saved');
            const data = await response.json();
            renderArticles(data, true);
        } catch (error) {
            articlesGrid.innerHTML = '<div class="loader">Error loading saved articles.</div>';
        }
    }

    // =====================
    // QUICK VIEW MODAL
    // =====================
    const modalOverlay = document.getElementById('article-modal-overlay');
    const closeModalBtn = document.getElementById('close-modal');
    const modalDeepSumBtn = document.getElementById('modal-deep-sum-btn');
    const modalDeepSumSection = document.getElementById('modal-deep-summary-section');
    const modalDeepSumContent = document.getElementById('modal-deep-summary-content');

    closeModalBtn.addEventListener('click', () => modalOverlay.classList.remove('open'));
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) modalOverlay.classList.remove('open');
    });

    async function openArticleModal(article) {
        document.getElementById('modal-source').textContent = article.source;
        document.getElementById('modal-domain').textContent = article.domain;
        document.getElementById('modal-title').textContent = article.title;
        document.getElementById('modal-desc').textContent = article.description || '';
        document.getElementById('modal-read-link').href = article.link;
        document.getElementById('modal-sentiment-badge').className = '';
        document.getElementById('modal-sentiment-badge').textContent = 'Analyzing...';
        document.getElementById('modal-keywords').innerHTML = '';
        document.getElementById('modal-nlp-sentiment').textContent = '—';
        document.getElementById('modal-nlp-polarity').textContent = '—';
        document.getElementById('modal-nlp-keywords').textContent = '—';
        document.getElementById('modal-polarity-marker').style.left = '50%';
        document.getElementById('modal-polarity-fill').style.width = '50%';
        document.getElementById('modal-polarity-fill').style.background = '#aaa';

        modalDeepSumSection.style.display = 'none';
        modalDeepSumContent.innerHTML = '';

        modalOverlay.classList.add('open');

        modalDeepSumBtn.onclick = async () => {
            modalDeepSumSection.style.display = 'block';
            modalDeepSumContent.innerHTML = '<div style="text-align:center; padding: 1rem; color: var(--primary-blue); font-weight: 600;"><i class="fas fa-spinner fa-spin"></i> Digging deep into article content... Hang tight!</div>';
            modalDeepSumBtn.disabled = true;
            modalDeepSumBtn.style.opacity = '0.6';

            try {
                const resp = await fetch(`/deep_summary?url=${encodeURIComponent(article.link)}`);
                const data = await resp.json();

                if (data.status === 'success') {
                    modalDeepSumContent.innerHTML = `<p>${data.summary}</p><div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.8rem; text-align: right; border-top: 1px solid var(--border-color); padding-top: 0.5rem;">— Detailed Analysis: ${data.word_count} words</div>`;
                } else {
                    modalDeepSumContent.innerHTML = `<p style="color: #ef4444; font-size: 0.85rem;"><strong>Extraction Note:</strong> ${data.summary || data.error || 'The website content could not be retrieved.'}</p>`;
                }
            } catch (e) {
                modalDeepSumContent.innerHTML = `<p style="color: #ef4444; font-size: 0.85rem;">Error connecting to analysis engine. Please try again.</p>`;
            } finally {
                modalDeepSumBtn.disabled = false;
                modalDeepSumBtn.style.opacity = '1';
                modalOverlay.querySelector('.article-modal').scrollTop = modalOverlay.querySelector('.article-modal').scrollHeight;
            }
        };

        try {
            const text = encodeURIComponent(`${article.title} ${article.description || ''}`);
            const resp = await fetch(`/analyze?text=${text}`);
            const nlp = await resp.json();

            const sentBadge = document.getElementById('modal-sentiment-badge');
            sentBadge.textContent = nlp.sentiment;
            sentBadge.className = `sentiment-badge sentiment-${nlp.sentiment.toLowerCase()}`;

            document.getElementById('modal-nlp-sentiment').textContent = nlp.sentiment;
            document.getElementById('modal-nlp-polarity').textContent = `${nlp.polarity > 0 ? '+' : ''}${nlp.polarity}`;
            document.getElementById('modal-nlp-keywords').textContent = nlp.keywords.join(', ') || '—';

            if (nlp.summary_points && nlp.summary_points.length > 0) {
                const descEl = document.getElementById('modal-desc');
                descEl.innerHTML = `<ul class="summary-list">${nlp.summary_points.map(p => `<li>${highlightKeywords(p, nlp.keywords)}</li>`).join('')}</ul>`;
                descEl.classList.add('nlp-summary');
            }

            if (nlp.keywords.length > 0) {
                document.getElementById('modal-keywords').innerHTML = nlp.keywords.map(k => `<span class="keyword-tag">${k}</span>`).join('');
            }

            const pct = ((nlp.polarity + 1) / 2) * 100;
            const fill = document.getElementById('modal-polarity-fill');
            const marker = document.getElementById('modal-polarity-marker');
            fill.style.width = `${pct}%`;
            fill.style.background = nlp.polarity > 0.1 ? '#22c55e' : nlp.polarity < -0.1 ? '#ef4444' : '#888';
            marker.style.left = `${pct}%`;
        } catch (e) {
            document.getElementById('modal-sentiment-badge').textContent = 'N/A';
        }
    }

    function renderArticles(articles, isSavedPage = false) {
        articlesGrid.innerHTML = '';
        resultsCount.innerText = isSavedPage ? `Saved Articles (${articles.length})` : `${articles.length} articles found`;

        if (articles.length === 0) {
            articlesGrid.innerHTML = '<div class="loader">No articles found. Try another search or scrape fresh content!</div>';
            return;
        }

        const sentimentCounts = { Positive: 0, Neutral: 0, Negative: 0 };
        const updateSentimentButtons = () => {
            document.querySelector('.sentiment-filter[data-sentiment="Positive"]').innerHTML = `🟢 Positive (${sentimentCounts.Positive})`;
            document.querySelector('.sentiment-filter[data-sentiment="Neutral"]').innerHTML = `⚪ Neutral (${sentimentCounts.Neutral})`;
            document.querySelector('.sentiment-filter[data-sentiment="Negative"]').innerHTML = `🔴 Negative (${sentimentCounts.Negative})`;
        };
        updateSentimentButtons();

        articles.forEach(article => {
            let displayDate = article.published_date || 'Unknown Time';
            if (article.published_date) {
                const parsed = new Date(article.published_date);
                if (parsed.toString() !== 'Invalid Date') {
                    displayDate = parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                }
            }

            const sentiment = article.sentiment || 'Neutral';
            const moodClass = `mood-${sentiment.toLowerCase()}`;

            const card = document.createElement('div');
            card.className = 'article-card';
            card.innerHTML = `
                <div class="article-body">
                    <div class="article-source" style="display: flex; gap: 0.8rem; align-items: center; flex-wrap: wrap;">
                        <div class="sentiment-mood ${moodClass}" title="AI Mood: ${sentiment}">
                            <div class="sentiment-dot"></div>
                            <span>${sentiment}</span>
                        </div>
                        <span style="font-size: 0.85rem; color: var(--text-muted);"><i class="far fa-newspaper" style="margin-right: 0.4rem;"></i>${article.source}</span>
                        <span style="font-size: 0.85rem; color: var(--text-muted);"><i class="fas fa-hashtag" style="margin-right: 0.4rem;"></i>${article.domain}</span>
                        <span style="margin-left: auto; color: #9ca3af; font-size: 0.8rem; display: flex; align-items: center; gap: 0.3rem;"><i class="far fa-clock"></i>${displayDate}</span>
                    </div>
                    <h2 class="article-title">${article.title}</h2>
                    <p class="article-desc">${article.description || ''}</p>
                    <div class="article-actions">
                        <a href="${article.link}" target="_blank" class="primary-btn" style="padding: 0.5rem 1rem; font-size: 0.9rem;">Read More</a>
                        <div class="action-btns">
                            <button class="quick-view-btn" data-id="${article.id}" title="Quick View">
                                <i class="fas fa-expand-alt"></i>
                            </button>
                            <button class="save-btn ${article.saved ? 'saved' : ''}" data-id="${article.id}" title="Save Article">
                                <i class="${article.saved ? 'fas' : 'far'} fa-bookmark"></i>
                            </button>
                            <button class="delete-btn" data-id="${article.id}" title="Delete Article">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            articlesGrid.appendChild(card);

            // Fetch full analysis for descriptions and highlights (async)
            const textToAnalyze = encodeURIComponent(`${article.title} ${article.description || ''}`);
            fetch(`/analyze?text=${textToAnalyze}`)
                .then(r => r.json())
                .then(nlp => {
                    card.dataset.sentiment = nlp.sentiment;
                    card.dataset.summaryPoints = JSON.stringify(nlp.summary_points || []);
                    card.dataset.summary = nlp.summary || '';
                    card.dataset.originalDesc = article.description || '';
                    card.dataset.originalTitle = article.title || '';
                    card.dataset.keywords = JSON.stringify(nlp.keywords || []);

                    if (aiSummaryMode) {
                        const descElem = card.querySelector('.article-desc');
                        if (nlp.summary_points && nlp.summary_points.length > 0) {
                            descElem.innerHTML = `<ul class="summary-list">${nlp.summary_points.map(p => `<li>${highlightKeywords(p, nlp.keywords)}</li>`).join('')}</ul>`;
                            descElem.classList.add('nlp-summary');
                        }
                    }

                    if (nlp.keywords && nlp.keywords.length > 0) {
                        const descElem = card.querySelector('.article-desc');
                        const tagsDiv = document.createElement('div');
                        tagsDiv.className = 'keyword-tags';
                        tagsDiv.innerHTML = nlp.keywords.map(k => `<span class="keyword-tag">${k}</span>`).join('');
                        descElem.after(tagsDiv);
                    }

                    if (activeSentimentFilter !== 'all' && nlp.sentiment !== activeSentimentFilter) {
                        card.style.display = 'none';
                    }

                    if (sentimentCounts[nlp.sentiment] !== undefined) {
                        sentimentCounts[nlp.sentiment]++;
                        updateSentimentButtons();
                    }
                })
                .catch(() => { });

            card.querySelector('.quick-view-btn').addEventListener('click', () => openArticleModal(article));

            const saveBtn = card.querySelector('.save-btn');
            saveBtn.addEventListener('click', async () => {
                const isSaved = saveBtn.classList.contains('saved');
                const endpoint = isSaved ? '/unsave' : '/save';
                try {
                    await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: article.id })
                    });
                    if (isSavedPage && isSaved) {
                        card.remove();
                    } else {
                        saveBtn.classList.toggle('saved');
                        const icon = saveBtn.querySelector('i');
                        icon.classList.toggle('fas');
                        icon.classList.toggle('far');
                    }
                } catch (error) {
                    console.error('Error saving article:', error);
                }
            });

            const deleteBtn = card.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', async () => {
                const articleId = parseInt(deleteBtn.dataset.id);
                if (!articleId) return;
                if (!confirm('Are you sure you want to delete this article?')) return;
                try {
                    const response = await fetch('/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: articleId })
                    });
                    const result = await response.json();
                    if (response.ok && result.status === 'success') {
                        card.style.opacity = '0';
                        card.style.transform = 'scale(0.9)';
                        setTimeout(() => {
                            card.remove();
                            const countText = resultsCount.innerText;
                            const match = countText.match(/\d+/);
                            if (match) {
                                const newCount = parseInt(match[0]) - 1;
                                resultsCount.innerText = countText.replace(/\d+/, newCount);
                            }
                        }, 300);
                    }
                } catch (error) {
                    console.error('Error deleting article:', error);
                }
            });
        });
    }

    const fetchTrendingTags = async () => {
        const trendingCloud = document.getElementById('trending-topics-cloud');
        try {
            const res = await fetch('/trending-tags');
            const tags = await res.json();

            if (tags.length === 0) {
                trendingCloud.innerHTML = '<div class="loader-small">No trends yet.</div>';
                return;
            }

            trendingCloud.innerHTML = tags.map(t => `
                <div class="trending-tag" data-tag="${t.tag}">
                    #${t.tag} <span class="count">${t.count}</span>
                </div>
            `).join('');

            document.querySelectorAll('.trending-tag').forEach(tag => {
                tag.addEventListener('click', () => {
                    const searchTerm = tag.dataset.tag;
                    searchInput.value = searchTerm;
                    searchBtn.click();
                });
            });
        } catch (error) {
            trendingCloud.innerHTML = '<div class="loader-small">Failed to load trends.</div>';
        }
    };

    const startPlaceholderAnimation = () => {
        const phrases = [
            "Search articles by keyword...",
            "Analyze Bitcoin trends...",
            "Discover AI breakthroughs...",
            "Explore latest tech news...",
            "Find deep summaries..."
        ];

        let phraseIdx = 0;
        let charIdx = 0;
        let isDeleting = false;
        let typeSpeed = 100;

        const type = () => {
            const currentPhrase = phrases[phraseIdx];

            if (isDeleting) {
                searchInput.placeholder = currentPhrase.substring(0, charIdx - 1);
                charIdx--;
                typeSpeed = 50;
            } else {
                searchInput.placeholder = currentPhrase.substring(0, charIdx + 1);
                charIdx++;
                typeSpeed = 100;
            }

            if (!isDeleting && charIdx === currentPhrase.length) {
                isDeleting = true;
                typeSpeed = 2000; // Pause at end
            } else if (isDeleting && charIdx === 0) {
                isDeleting = false;
                phraseIdx = (phraseIdx + 1) % phrases.length;
                typeSpeed = 500;
            }

            setTimeout(type, typeSpeed);
        };

        type();
    };

    async function initialLoad() {
        requestNotificationPermission();
        fetchTrendingTags();
        startPlaceholderAnimation();

        const response = await fetch(`/search?q=&domain=All`);
        const data = await response.json();

        const newsRes = await fetch('/search?q=&domain=News');
        const newsData = await newsRes.json();
        if (newsData.length > 0) lastKnownNewsId = newsData[0].id;

        const techRes = await fetch('/search?q=&domain=Technology');
        const techData = await techRes.json();
        if (techData.length > 0) lastKnownTechId = techData[0].id;

        if (data.length === 0) {
            articlesGrid.innerHTML = '<div class="loader">Scraping articles for you...</div>';
            await fetch('/scrape');
            fetchArticles();
        } else {
            renderArticles(data);
        }
        startBackgroundPolling();
    }

    function highlightKeywords(text, keywords) {
        if (!keywords || keywords.length === 0) return text;
        let highlighted = text;
        keywords.forEach(kw => {
            const regex = new RegExp(`\\b${kw}\\b`, 'gi');
            highlighted = highlighted.replace(regex, match => `<strong>${match}</strong>`);
        });
        return highlighted;
    }

    initialLoad();
});
