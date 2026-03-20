import math

def calculate_signal_score(
    relevance_sim: float, 
    skill_match_pct: float, 
    days_since_posted: int, 
    days_remaining: int, 
    credibility_score: float
) -> float:
    """
    Calculates a comprehensive 'Signal Score' (0-100) based on multiple factors.
    
    Args:
        relevance_sim (float): Cosine similarity score between user profile and job/post (0.0 to 1.0).
        skill_match_pct (float): Percentage of mutually matched skills (0.0 to 100.0).
        days_since_posted (int): How many days ago the item was posted.
        days_remaining (int): How many days until the deadline.
        credibility_score (float): Reliability/credibility metric of the source (0.0 to 1.0).
        
    Returns:
        float: Final Signal Score from 0 to 100.
    """
    
    # --- 1. Relevance & Skill Match (Primary Weights: ~50% combined) ---
    # Relevance is heavily weighted since a cosine sim of 1.0 means an exact semantic match.
    # We normalize skill_match_pct to [0, 1].
    base_relevance = (relevance_sim * 0.6) + ((skill_match_pct / 100.0) * 0.4)
    
    # --- 2. Freshness Decay (Weight: ~20%) ---
    # Exponential decay function so newer posts score much higher, plateauing slowly for older posts.
    rate_of_decay = 0.1  # Tuning param: higher = faster decay
    freshness_factor = math.exp(-rate_of_decay * max(0, days_since_posted))
    
    # --- 3. Urgency / Deadline (Weight: ~15%) ---
    # Inverse decaying function: if deadline is soon (e.g., < 3 days), score goes up to prompt action.
    # If deadline has passed (< 0), urgency drops to zero.
    urgency_factor = 0.0
    if days_remaining >= 0:
        # A simple curve: highly urgent if days_remaining is small (closer to 1.0 multiplier). 
        # Less urgent if plenty of time.
        urgency_factor = 1.0 / (1.0 + math.log1p(days_remaining))
    
    # --- 4. Source Credibility (Weight: ~15%) ---
    # Acts as a multiplier or a direct additive. We'll use additive to guarantee good sources boost the score.
    credibility_val = max(0.0, min(1.0, credibility_score))
    
    # --- Weighted Assembly ---
    # Max possible score logic:
    # Relevance: 50 pts
    # Freshness: 20 pts
    # Urgency: 15 pts
    # Credibility: 15 pts
    
    final_score = (
        (base_relevance * 50) + 
        (freshness_factor * 20) + 
        (urgency_factor * 15) + 
        (credibility_val * 15)
    )
    
    # Ensure bounds [0, 100]
    return round(max(0.0, min(100.0, final_score)), 2)


if __name__ == "__main__":
    # --- Example Test Case ---
    test_case = {
        "relevance_sim": 0.85,          # High semantic match
        "skill_match_pct": 90.0,        # 90% skills match
        "days_since_posted": 2,         # Posted 2 days ago (very fresh)
        "days_remaining": 5,            # 5 days until deadline
        "credibility_score": 0.9        # Highly credible source
    }
    
    score = calculate_signal_score(**test_case)
    print("--- Test Case Input ---")
    for k, v in test_case.items():
        print(f"{k}: {v}")
    print(f"\n=> Computed Signal Score: {score}/100")
    
    # Suggestions for Improvement:
    print("\n--- Suggestions for Improvement ---")
    print("1. Dynamic Weighting: Use Machine Learning (e.g., Logistic Regression or XGBoost) to learn the optimal weights from historical user click/apply data instead of using static weights.")
    print("2. Penalty for Expired: Currently urgency is 0 if days_remaining < 0, but you might want to immediately disqualify (Signal Score = 0) if the deadline has passed.")
    print("3. Time Decay Tuning: The exponential rate of decay (`rate_of_decay`) should be adjusted based on the specific industry (e.g., news decays in hours, job postings decay in weeks).")
    print("4. Source Credibility Curve: Credibility could be used as a non-linear multiplier rather than an additive constant, heavily penalizing very low credibility sources.")
