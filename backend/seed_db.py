from database import get_session, Article, init_db
import json
import datetime

def seed():
    init_db()
    session = get_session()
    
    # Check if articles already exist
    if session.query(Article).count() > 0:
        print("Database already has data. Skipping seed.")
        session.close()
        return

    articles = [
        {
            "url": "https://example.com/ai-trends-2024",
            "title": "Top AI Trends to Watch in 2024",
            "content": "Artificial Intelligence is evolving rapidly. From generative AI to autonomous agents, 2024 promises to be a breakthrough year for ML researchers and engineers alike.",
            "summary": "AI is set for a breakthrough year in 2024, with generative models and autonomous agents leading the charge in ML evolution.",
            "category": "AI & ML",
            "source": "example.com",
            "embedding": [0.1] * 384 # Dummy embedding
        },
        {
            "url": "https://example.com/future-of-work",
            "title": "The Impact of Automation on Tech Jobs",
            "content": "Automation is reshaping the labor market. While some roles are disappearing, new opportunities in prompt engineering and AI ethics are emerging every day.",
            "summary": "Automation is transforming tech jobs, creating new roles in fields like prompt engineering while modifying traditional labor market structures.",
            "category": "Jobs",
            "source": "example.com",
            "embedding": [0.2] * 384 # Dummy embedding
        },
        {
            "url": "https://example.com/startup-funding",
            "title": "Venture Capital Trends for Tech Startups",
            "content": "Startups are facing a new reality in funding. Investors are now prioritizing profitability and sustainable growth over rapid expansion at any cost.",
            "summary": "Venture capital is shifting toward profitability and sustainable growth, marking a new era for tech startup investment strategies.",
            "category": "Startups",
            "source": "example.com",
            "embedding": [0.3] * 384 # Dummy embedding
        }
    ]

    for art in articles:
        new_art = Article(
            url=art["url"],
            title=art["title"],
            content=art["content"],
            summary=art["summary"],
            category=art["category"],
            source=art["source"],
            embedding=json.dumps(art["embedding"]),
            published_date=datetime.datetime.utcnow()
        )
        session.add(new_art)
    
    session.commit()
    print("Database seeded with 3 sample articles.")
    session.close()

if __name__ == "__main__":
    seed()
