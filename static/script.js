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
    const trackedArticles = new Set(); // Session debounce
    const currentUserId = 1; // Mocked user id


    const notifBtn = document.getElementById('sidebar-notifications-btn');
    const notifBadge = document.getElementById('notif-badge');
    const savedCountBadge = document.getElementById('saved-count-badge');
    const aiToggle = document.getElementById('ai-summary-toggle');

    // Settings API Modal Elements
    const sidebarSettingsBtn = document.getElementById('sidebar-settings-btn');
    const settingsModalOverlay = document.getElementById('settings-modal-overlay');
    const closeSettingsModalBtn = document.getElementById('close-settings-modal');
    const settingsOpenaiKey = document.getElementById('settings-openai-key');
    const settingsGeminiKey = document.getElementById('settings-gemini-key');
    const settingsSaveBtn = document.getElementById('settings-save-btn');
    const settingsMessage = document.getElementById('settings-message');

    aiToggle.addEventListener('change', () => {
        aiSummaryMode = aiToggle.checked;
        const cards = document.querySelectorAll('.article-card');
        cards.forEach(card => {
            const descElem = card.querySelector('.article-desc');
            if (aiSummaryMode) {
                descElem.innerHTML = `<div class="no-summary"><i class="fas fa-info-circle"></i> Deep summaries are fetched on-demand. Click "Quick View" to analyze this article.</div>`;
                descElem.classList.remove('nlp-summary');
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
                const newsData = await newsRes.json();
                const newsArticles = newsData.articles || newsData;

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
                const techData = await techRes.json();
                const techArticles = techData.articles || techData;

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

    // Settings Modal Handlers
    sidebarSettingsBtn.addEventListener('click', () => {
        settingsModalOverlay.style.display = 'flex';
        settingsMessage.style.display = 'none';
        if (window.innerWidth <= 768) sidebar.classList.remove('open');
    });

    closeSettingsModalBtn.addEventListener('click', () => {
        settingsModalOverlay.style.display = 'none';
    });

    settingsModalOverlay.addEventListener('click', (e) => {
        if (e.target === settingsModalOverlay) settingsModalOverlay.style.display = 'none';
    });

    settingsSaveBtn.addEventListener('click', async () => {
        const openai_key = settingsOpenaiKey.value.trim();
        const gemini_key = settingsGeminiKey.value.trim();

        if (!openai_key && !gemini_key) {
            settingsMessage.textContent = 'Please enter at least one API key to save.';
            settingsMessage.style.display = 'block';
            settingsMessage.style.backgroundColor = '#fee2e2';
            settingsMessage.style.color = '#dc2626';
            return;
        }

        settingsSaveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        settingsSaveBtn.disabled = true;

        try {
            const resp = await fetch('/save-api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ openai_key, gemini_key })
            });
            const data = await resp.json();

            if (data.status === 'success') {
                settingsMessage.textContent = 'API Keys saved successfully! You can now use AI features.';
                settingsMessage.style.display = 'block';
                settingsMessage.style.backgroundColor = '#dcfce7';
                settingsMessage.style.color = '#16a34a';
                settingsOpenaiKey.value = '';
                settingsGeminiKey.value = '';

                setTimeout(() => {
                    settingsModalOverlay.style.display = 'none';
                }, 2000);
            } else {
                throw new Error(data.message || 'Failed to save keys');
            }
        } catch (error) {
            settingsMessage.textContent = error.message;
            settingsMessage.style.display = 'block';
            settingsMessage.style.backgroundColor = '#fee2e2';
            settingsMessage.style.color = '#dc2626';
        } finally {
            settingsSaveBtn.innerHTML = '<i class="fas fa-save"></i> Save Configuration';
            settingsSaveBtn.disabled = false;
        }
    });

    // Fetch Articles
    const fetchArticles = async (domain = currentDomain) => {
        articlesGrid.innerHTML = '<div class="loader">Fetching latest insights...</div>';
        try {
            const query = searchInput.value;
            const url = domain === 'All' ? `/search?q=${encodeURIComponent(query)}&domain=All&user_id=${currentUserId}` : `/search?q=${encodeURIComponent(query)}&domain=${domain}&user_id=${currentUserId}`;
            const response = await fetch(url);
            const data = await response.json();

            // Expected data: { total_count: int, articles: [...] } or array if legacy endpoint
            if (data.total_count !== undefined && data.articles) {
                renderArticles(data.articles, false, data.total_count);
            } else {
                renderArticles(data, false);
            }
        } catch (error) {
            console.error('Error fetching articles:', error);
            articlesGrid.innerHTML = '<div class="error-msg">Failed to load articles. Please check your connection.</div>';
        }
    };

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
    const modalTitle = document.getElementById('modal-title');
    const modalDesc = document.getElementById('modal-desc');
    const modalSource = document.getElementById('modal-source');
    const modalDomain = document.getElementById('modal-domain');
    const modalSentimentBadge = document.getElementById('modal-sentiment-badge');
    const modalFindSimilarBtn = document.getElementById('modal-find-similar-btn');
    const modalSimilarSection = document.getElementById('modal-similar-section');
    const modalSimilarContent = document.getElementById('modal-similar-content');

    // NEW: TTS Script UI Elements
    const modalTtsBtn = document.getElementById('modal-tts-btn');
    const modalTtsSection = document.getElementById('modal-tts-section');
    const modalTtsContent = document.getElementById('modal-tts-content');
    const modalTtsCopyBtn = document.getElementById('modal-tts-copy-btn');
    const modalTtsPlayBtn = document.getElementById('modal-tts-play-btn');
    const modalTtsAudio = document.getElementById('modal-tts-audio');

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
        modalSimilarSection.style.display = 'none';
        modalSimilarContent.innerHTML = '';

        modalTtsSection.style.display = 'none';
        modalTtsContent.innerHTML = '';
        modalTtsPlayBtn.style.display = 'none';
        modalTtsAudio.style.display = 'none';
        modalTtsAudio.src = '';

        modalOverlay.classList.add('open');

        modalDeepSumBtn.onclick = async (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
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

        modalFindSimilarBtn.onclick = async (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            modalSimilarSection.style.display = 'block';
            modalSimilarContent.innerHTML = '<div style="text-align:center; padding: 1rem; color: var(--primary-orange); font-weight: 600;"><i class="fas fa-brain fa-pulse"></i> Gemini AI is analyzing semantic similarities... This may take up to 15 seconds.</div>';
            modalFindSimilarBtn.disabled = true;
            modalFindSimilarBtn.style.opacity = '0.6';

            try {
                const resp = await fetch(`/similar-articles?id=${article.id}`);
                const data = await resp.json();

                if (data.status === 'success' && data.similar_articles.length > 0) {
                    let htmlList = '<ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.8rem;">';
                    data.similar_articles.forEach(sim => {
                        const scoreColor = sim.similarity_score >= 80 ? '#22c55e' : (sim.similarity_score >= 70 ? '#eab308' : '#6b7280');
                        htmlList += `
                            <li style="border: 1px solid var(--border-color); border-radius: 6px; padding: 0.8rem; background: var(--bg-hover);">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.3rem;">
                                    <a href="${sim.link}" target="_blank" style="font-weight: 600; color: var(--primary-blue); text-decoration: none; font-size: 0.95rem; line-height: 1.3;">${sim.title}</a>
                                    <span style="background: ${scoreColor}; color: white; padding: 2px 6px; border-radius: 12px; font-size: 0.75rem; font-weight: bold; white-space: nowrap; margin-left: 0.5rem;">${sim.similarity_score}% Match</span>
                                </div>
                                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.4rem;">
                                    <i class="fas fa-globe"></i> ${sim.domain || 'Unknown'} | <i class="fas fa-newspaper"></i> ${sim.source || 'News'}
                                </div>
                                <div style="font-size: 0.85rem; color: var(--text-main); border-left: 3px solid var(--primary-orange); padding-left: 0.5rem;">
                                    <strong>AI Reasoning:</strong> ${sim.reason}
                                </div>
                            </li>
                        `;
                    });
                    htmlList += '</ul>';
                    modalSimilarContent.innerHTML = htmlList;
                } else if (data.status === 'success') {
                    modalSimilarContent.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; text-align: center;">No semantically similar articles found in the database.</p>`;
                } else {
                    modalSimilarContent.innerHTML = `<p style="color: #ef4444; font-size: 0.85rem;"><strong>Error:</strong> ${data.message || 'Failed to analyze records.'}</p>`;
                }
            } catch (e) {
                modalSimilarContent.innerHTML = `<p style="color: #ef4444; font-size: 0.85rem;">Error connecting to Gemini Engine. Please confirm API Key.</p>`;
            } finally {
                modalFindSimilarBtn.disabled = false;
                modalFindSimilarBtn.style.opacity = '1';
                modalOverlay.querySelector('.article-modal').scrollTop = modalOverlay.querySelector('.article-modal').scrollHeight;
            }
        };

        // NEW: TTS Script Event Handler
        modalTtsBtn.onclick = async (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            modalTtsSection.style.display = 'block';
            modalTtsContent.innerHTML = '<div style="text-align:center; padding: 1rem; color: #8b5cf6; font-weight: 600;"><i class="fas fa-film fa-bounce"></i> Splitting summary into video scenes... Please wait.</div>';
            modalTtsBtn.disabled = true;
            modalTtsBtn.style.opacity = '0.6';

            // Pluck the best available summary text to base the video on
            let summaryText = "";
            if (modalDeepSumSection.style.display === 'block' && modalDeepSumContent.innerText && !modalDeepSumContent.innerText.includes('Hang tight')) {
                summaryText = modalDeepSumContent.innerText.split('— Detailed Analysis')[0].trim();
            } else if (article.summaryPoints) {
                try {
                    summaryText = JSON.parse(article.summaryPoints).join(" ");
                } catch (err) { }
            } else if (article.summary) {
                summaryText = article.summary;
            } else {
                summaryText = article.description || "";
            }

            try {
                const resp = await fetch('/tts-script', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: article.id, summary: summaryText })
                });
                const data = await resp.json();

                if (data.status === 'success') {
                    let parsedScript = null;
                    try {
                        parsedScript = typeof data.script === 'string' ? JSON.parse(data.script) : data.script;
                    } catch (err) {
                        console.error("Failed to parse script video JSON", err);
                        modalTtsContent.innerHTML = `<p style="color: #ef4444; font-size: 0.85rem;"><strong>Error:</strong> Backend returned invalid JSON script formatting.</p>`;
                        return;
                    }

                    if (parsedScript && parsedScript.voice_text) {
                        // Display the generated script summary
                        modalTtsContent.innerHTML = `
                            <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                                <h5 style="color: #8b5cf6; margin-top: 0; margin-bottom: 0.5rem; font-size: 0.9rem;"><i class="fas fa-file-audio"></i> AI Voice Script</h5>
                                <p style="margin: 0; font-size: 0.95rem; color: #1f2937; font-weight: 500; line-height: 1.6;">${parsedScript.voice_text}</p>
                            </div>
                        `;

                        // Save the raw text for TTS playback 
                        modalTtsContent.dataset.rawNarration = parsedScript.voice_text;

                        modalTtsPlayBtn.style.display = 'block';
                        modalTtsPlayBtn.disabled = false;
                        modalTtsPlayBtn.dataset.hasOpenai = data.has_openai;

                    } else if (parsedScript && Array.isArray(parsedScript)) {
                        // Fallback just in case Gemini hallucinates the old array format
                        let fullText = "";
                        parsedScript.forEach(s => fullText += s.voice_text + ". ");
                        modalTtsContent.dataset.rawNarration = fullText;
                        modalTtsContent.innerText = fullText;

                        modalTtsPlayBtn.style.display = 'block';
                        modalTtsPlayBtn.disabled = false;
                        modalTtsPlayBtn.dataset.hasOpenai = data.has_openai;
                    } else {
                        // Fallback if the AI returns raw text instead of JSON
                        modalTtsContent.dataset.rawNarration = data.script;
                        modalTtsContent.innerText = data.script;

                        modalTtsPlayBtn.style.display = 'block';
                        modalTtsPlayBtn.disabled = false;
                        modalTtsPlayBtn.dataset.hasOpenai = data.has_openai;
                    }
                } else {
                    modalTtsContent.innerHTML = `<p style="color: #ef4444; font-size: 0.85rem;"><strong>Error:</strong> ${data.message || 'Failed to generate script.'}</p>`;
                }
            } catch (e) {
                modalTtsContent.innerHTML = `<p style="color: #ef4444; font-size: 0.85rem;">Connection error. Please try again later.</p>`;
            } finally {
                modalTtsBtn.disabled = false;
                modalTtsBtn.style.opacity = '1';
                modalOverlay.querySelector('.article-modal').scrollTop = modalOverlay.querySelector('.article-modal').scrollHeight;
            }
        };

        modalTtsPlayBtn.onclick = async () => {
            const text = modalTtsContent.dataset.rawNarration || modalTtsContent.innerText;
            if (!text || text.includes('Generating')) return;

            // Check if we have an active OpenAI audio stream loaded
            if (modalTtsAudio.src && modalTtsAudio.src.startsWith('blob:')) {
                if (!modalTtsAudio.paused) {
                    modalTtsAudio.pause();
                    modalTtsPlayBtn.innerHTML = '<i class="fas fa-play"></i> Resume Voice';
                    return;
                } else if (modalTtsAudio.paused && modalTtsAudio.currentTime > 0 && !modalTtsAudio.ended) {
                    modalTtsAudio.play();
                    modalTtsPlayBtn.innerHTML = '<i class="fas fa-pause"></i> Pause Voice';
                    return;
                }
            }

            // Check if browser native TTS is actively speaking
            if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
                if (window.speechSynthesis.paused) {
                    window.speechSynthesis.resume();
                    modalTtsPlayBtn.innerHTML = '<i class="fas fa-pause"></i> Pause (Local Voice)';
                } else {
                    window.speechSynthesis.pause();
                    modalTtsPlayBtn.innerHTML = '<i class="fas fa-play"></i> Resume (Local Voice)';
                }
                return;
            }

            const originalHtml = modalTtsPlayBtn.innerHTML;
            const hasOpenai = modalTtsPlayBtn.dataset.hasOpenai === 'true';

            // Function to handle browser native TTS 
            const playBrowserFallback = () => {
                if ('speechSynthesis' in window) {
                    modalTtsPlayBtn.innerHTML = '<i class="fas fa-pause"></i> Pause (Local Voice)';
                    const utterance = new SpeechSynthesisUtterance(text);

                    const voices = window.speechSynthesis.getVoices();
                    const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Google') || v.name.includes('Samantha')));
                    if (preferredVoice) utterance.voice = preferredVoice;

                    utterance.rate = 1.0;
                    utterance.pitch = 1.1;

                    utterance.onend = () => {
                        modalTtsPlayBtn.innerHTML = '<i class="fas fa-play"></i> Replay Voice';
                        modalTtsPlayBtn.disabled = false;
                    };

                    utterance.onerror = (e) => {
                        console.error('Browser TTS failed', e);
                        alert('Audio generation failed entirely. Please check your system TTS settings.');
                        modalTtsPlayBtn.innerHTML = originalHtml;
                        modalTtsPlayBtn.disabled = false;
                    };

                    window.speechSynthesis.cancel();
                    window.speechSynthesis.speak(utterance);
                } else {
                    alert('Audio generation failed: OpenAI API key missing and Browser Fallback unavailable');
                    modalTtsPlayBtn.innerHTML = originalHtml;
                    modalTtsPlayBtn.disabled = false;
                }
            };

            // If no OpenAI key is configured on server, trigger fallback immediately to preserve user gesture
            if (!hasOpenai) {
                console.warn('Backend indicates missing OpenAI API Key. Bypassing fetch and triggering Browser TTS immediately.');
                playBrowserFallback();
                return;
            }

            modalTtsPlayBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Synthesizing Voice...';
            modalTtsPlayBtn.disabled = true;

            // CRITICAL: Unlock the audio element synchronously during the click event 
            // so iOS/Safari does not block playback after the async network fetch
            modalTtsAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
            modalTtsAudio.play().then(() => modalTtsAudio.pause()).catch(() => { });

            try {
                const response = await fetch('/generate-audio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text })
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || 'Failed to generate audio');
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                modalTtsAudio.src = url;
                modalTtsAudio.style.display = 'block';
                modalTtsAudio.play();
                modalTtsPlayBtn.innerHTML = '<i class="fas fa-pause"></i> Pause Voice';
                modalTtsPlayBtn.disabled = false;

                modalTtsAudio.onended = () => {
                    modalTtsPlayBtn.innerHTML = '<i class="fas fa-play"></i> Replay Voice';
                    // Clear source so it re-generates or replays cleanly
                    modalTtsAudio.src = '';
                };

            } catch (error) {
                console.warn('OpenAI Audio generation failed unexpectedly, falling back to browser TTS:', error.message);
                playBrowserFallback();
            }
        };

        modalTtsCopyBtn.onclick = () => {
            const textToCopy = modalTtsContent.dataset.rawNarration || modalTtsContent.innerText;
            if (textToCopy && !textToCopy.includes('Generating optimized narration script')) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    const originalText = modalTtsCopyBtn.innerHTML;
                    modalTtsCopyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    setTimeout(() => {
                        modalTtsCopyBtn.innerHTML = originalText;
                    }, 2000);
                });
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

    function renderArticles(articles, isSavedPage = false, totalCount = null) {
        articlesGrid.innerHTML = '';

        let countDisplay = articles.length;
        let suffix = "";
        if (totalCount !== null && totalCount > articles.length) {
            countDisplay = totalCount;
            suffix = ` (Showing top ${articles.length})`;
        }

        resultsCount.innerText = isSavedPage ? `Saved Articles (${articles.length})` : `${countDisplay} articles found${suffix}`;

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
                    // Check if it's a generic "Mar 2" string that loses year context
                    if (article.published_date.length <= 6 && !article.published_date.includes('20')) {
                        displayDate = article.published_date; // Keep it as raw "Mar 2"
                    } else {
                        displayDate = parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                    }
                } else {
                    displayDate = article.published_date; // fallback to whatever the scraper found
                }
            }

            const sentiment = article.sentiment || 'Neutral';
            const moodClass = `mood-${sentiment.toLowerCase()}`;
            const totalViews = article.total_views || 0;
            const userViews = article.user_views || 0;
            const signalScore = article.signal_score || 0;

            let signalColor = '#ef4444'; // Red for low
            if (signalScore >= 80) signalColor = '#10b981'; // Green for high
            else if (signalScore >= 50) signalColor = '#f59e0b'; // Yellow/Orange for medium

            const card = document.createElement('div');
            card.className = 'article-card';
            card.innerHTML = `
                <div class="article-body">
                    <div class="article-intelligence" style="display: flex; gap: 0.8rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.8rem;">
                        <div class="sentiment-mood ${moodClass}" title="AI Mood: ${sentiment}">
                            <div class="sentiment-dot"></div>
                            <span>${sentiment}</span>
                        </div>
                        <div class="signal-score" title="Dynamic Signal Score (0-100)" style="background: rgba(var(--text-color-rgb), 0.05); padding: 0.3rem 0.6rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 0.4rem; border: 1px solid rgba(var(--text-color-rgb), 0.1);">
                            <i class="fas fa-bolt" style="color: ${signalColor};"></i> <span style="color: ${signalColor};">${signalScore}</span>
                        </div>
                        <div class="view-stats" title="Total Views Across All Users">
                            <i class="far fa-eye"></i> ${totalViews}
                        </div>
                        ${userViews > 0 ? `<div class="user-stats" title="Your Personal Views"><i class="fas fa-user-check"></i> ${userViews}</div>` : ''}
                    </div>
                    <div class="article-source">
                         <span><i class="far fa-newspaper" style="margin-right: 0.4rem;"></i>${article.source}</span>
                         <span><i class="fas fa-hashtag" style="margin-right: 0.4rem;"></i>${article.domain}</span>
                         <span style="margin-left: auto; color: #9ca3af; display: flex; align-items: center; gap: 0.3rem;"><i class="far fa-clock"></i>${displayDate}</span>
                    </div>
                    <h2 class="article-title">${article.title}</h2>
                    <p class="article-desc">${article.description || ''}</p>
                    <div class="article-actions">
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
                        <a href="${article.link}" target="_blank" class="primary-btn read-more-link" data-id="${article.id}" style="padding: 0.5rem 1rem; font-size: 0.9rem;">Read More</a>
                    </div>
                </div>
            `;
            articlesGrid.appendChild(card);

            card.querySelector('.quick-view-btn').addEventListener('click', () => {
                openArticleModal(article);
                trackArticleUsage(article.id); // Track Quick View usage
            });

            card.querySelector('.read-more-link').addEventListener('click', () => {
                trackArticleUsage(article.id);
            });

            // Extract native analysis data provided by the backend JSON directly
            card.dataset.sentiment = sentiment;
            card.dataset.originalDesc = article.description || '';
            card.dataset.originalTitle = article.title || '';

            // Format keywords from comma-separated string back to array if needed
            let keywordsList = [];
            if (article.keywords) {
                keywordsList = article.keywords.split(',').map(k => k.trim());
                card.dataset.keywords = JSON.stringify(keywordsList);

                const descElem = card.querySelector('.article-desc');
                const tagsDiv = document.createElement('div');
                tagsDiv.className = 'keyword-tags';
                tagsDiv.innerHTML = keywordsList.map(k => `<span class="keyword-tag">${k}</span>`).join('');
                descElem.after(tagsDiv);
            } else {
                card.dataset.keywords = "[]";
            }

            if (aiSummaryMode) {
                const descElem = card.querySelector('.article-desc');
                descElem.innerHTML = `<div class="no-summary"><i class="fas fa-info-circle"></i> Click "Quick View" to generate an AI summary.</div>`;
                descElem.classList.remove('nlp-summary');
            }

            if (activeSentimentFilter !== 'all' && sentiment !== activeSentimentFilter) {
                card.style.display = 'none';
            }

            if (sentimentCounts[sentiment] !== undefined) {
                sentimentCounts[sentiment]++;
                updateSentimentButtons();
            }

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
                    updateSavedCount();
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
                            updateSavedCount(); // Call updateSavedCount after deletion
                        }, 300);
                    }
                } catch (error) {
                    console.error('Error deleting article:', error);
                }
            });
        });
    }

    const trackArticleUsage = async (articleId) => {
        // Debounce: verify if tracked in this 10s window or session
        if (trackedArticles.has(articleId)) return;

        trackedArticles.add(articleId);
        // Expiration for debounce to allow re-count after 30 seconds
        setTimeout(() => trackedArticles.delete(articleId), 30000);

        try {
            const res = await fetch('/track-usage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ article_id: articleId, user_id: currentUserId })
            });
            const data = await res.json();

            // Optionally update UI in real-time if we want immediate feedback
            if (data.status === 'success') {
                const card = document.querySelector(`.article-card .read-more-link[data-id="${articleId}"]`)?.closest('.article-card');
                if (card) {
                    const totalStats = card.querySelector('.view-stats');
                    if (totalStats) totalStats.innerHTML = `<i class="far fa-eye"></i> ${data.total_views}`;

                    let userStats = card.querySelector('.user-stats');
                    if (!userStats) {
                        userStats = document.createElement('div');
                        userStats.className = 'user-stats';
                        userStats.title = "Your Personal Views";
                        card.querySelector('.article-intelligence').appendChild(userStats);
                    }
                    userStats.innerHTML = `<i class="fas fa-user-check"></i> ${data.user_views}`;
                }
            }
        } catch (error) {
            console.error('Error tracking usage:', error);
        }
    };

    const updateSavedCount = async () => {
        try {
            const res = await fetch('/saved-count');
            const data = await res.json();
            if (savedCountBadge) {
                savedCountBadge.textContent = data.count;
                savedCountBadge.style.display = data.count > 0 ? 'inline-block' : 'none';
            }
        } catch (error) {
            console.error('Error updating saved count:', error);
        }
    };

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
        updateSavedCount();

        const response = await fetch(`/search?q=&domain=All&user_id=${currentUserId}`);
        const data = await response.json();
        const mainArticles = data.articles || data;

        const newsRes = await fetch('/search?q=&domain=News');
        const newsData = await newsRes.json();
        const newsArticlesList = newsData.articles || newsData;
        if (newsArticlesList.length > 0) lastKnownNewsId = newsArticlesList[0].id;

        const techRes = await fetch('/search?q=&domain=Technology');
        const techData = await techRes.json();
        const techArticlesList = techData.articles || techData;
        if (techArticlesList.length > 0) lastKnownTechId = techArticlesList[0].id;

        if (mainArticles.length === 0) {
            articlesGrid.innerHTML = '<div class="loader">Scraping articles for you...</div>';
            await fetch('/scrape');
            fetchArticles();
        } else {
            if (data.total_count !== undefined) {
                renderArticles(mainArticles, false, data.total_count);
            } else {
                renderArticles(mainArticles);
            }
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
