# Smart Content Aggregator: AI Pipeline Explanation

This application uses a multi-stage NLP pipeline to process scraped content and provide a personalized experience.

## AI Components

### 1. Automatic Category Classification
- **Model**: `facebook/bart-large-mnli` (Zero-Shot Classification).
- **Process**: Unlike traditional classifiers that need training on specific labels, this zero-shot model can categorize text into "Technology", "AI & ML", "Startups", "Jobs", or "Science" by comparing the text content to the label names themselves.
- **Why**: High accuracy and flexibility without needing a labeled dataset.

### 2. Text Summarization
- **Model**: `sshleifer/distilbart-cnn-12-6`.
- **Process**: We use an abstractive summarization approach. The model reads the full article text and generates a concise summary (max 130 words).
- **Why**: Provides quick insights into the article content without reading the whole page.

### 3. Semantic Search & Duplicate Detection
- **Model**: `all-MiniLM-L6-v2` (Sentence-Transformers).
- **Process**: 
    - **Embeddings**: Text is converted into 384-dimensional dense vectors (embeddings).
    - **Cosine Similarity**: We compare the embedding of a search query (or a new article) against existing article embeddings.
    - **Search**: Results are ranked by similarity score, allowing for "meaning-based" search.
    - **Duplicates**: If a new article has >0.9 similarity with an existing one, it is flagged as a duplicate.

### 4. Personalization Engine
- **Process**: 
    - Every time a user "Saves" an article, the title of that article is added to their preferences.
    - When fetching recommendations, the engine calculates the cosine similarity between all articles and the user's saved preference embeddings.
    - Articles that most closely match the "themes" of their saved articles are shown first.

## Performance Note
The models used are "distilled" or 
optimized versions where possible to balance speed and accuracy. The first run will download model weights (~1GB total) to the local cache.
