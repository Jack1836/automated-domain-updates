# Setup Instructions: Smart Content Aggregator

Follow these steps to get the "Smart Content Aggregator with NLP Personalization" running on your machine.

## Prerequisites
- Python 3.9+
- Node.js (v18+)
- `pip` and `npm`

## 1. Backend Setup
1. Open a terminal and navigate to the `backend` directory.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Initialize the database and seed sample data:
   ```bash
   python database.py
   python seed_db.py
   ```
4. Run the Flask server:
   ```bash
   python app.py
   ```
   *Note: On the first run, the NLP models will download (approx. 1GB). Please be patient.*

## 2. Frontend Setup
1. Open a new terminal and navigate to the root directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite dev server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to the URL provided (default is `http://localhost:5173`).

## 3. How to Use
1. **Scrape**: Paste a URL (e.g., from TechCrunch or The Verge) into the scrape bar and click "Scrape & Process".
2. **Search**: Use the search bar for keyword or semantic searches.
3. **Personalize**: Click "Save" on articles you like. Then, go to the hamburger menu and select "AI Recommendations" to see personalized content.
4. **Library**: View all your saved articles in the "Saved Articles" view.
