from functools import wraps
from flask import session, redirect, url_for, request, abort, Blueprint
import redis
import json
import os
import datetime

auth_bp = Blueprint('auth', __name__)
redis_client = redis.StrictRedis(host='localhost', port=6379, db=0, decode_responses=True, socket_connect_timeout=0.5, socket_timeout=0.5)

def get_current_user():
    """Retrieve the current user from our session or Redis."""
    user_id = session.get("user_id")
    if not user_id:
        return None
        
    try:
        cached_user = redis_client.get(f"session:{user_id}")
        if cached_user:
            return json.loads(cached_user)
    except redis.exceptions.ConnectionError:
        print("Warning: Redis not reachable, falling back to Flask Session")
        
    # Build fallback user cache if not found in Redis
    user_data = {"id": user_id, "role": session.get("user_role", "user"), "email": session.get("user_email")}
    
    try:
        redis_client.setex(f"session:{user_id}", 3600, json.dumps(user_data))
    except redis.exceptions.ConnectionError:
        pass
        
    return user_data

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("user_id"):
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user or user.get("role") != "admin":
            abort(403) # Forbidden
        return f(*args, **kwargs)
    return decorated_function

@auth_bp.route('/mock-google-login')
def mock_google_login():
    """Simulates a successful Google OAuth callback."""
    session.clear()
    session['user_id'] = 1
    session['user_role'] = 'admin'
    session['user_email'] = 'admin@demo.com'
    
    # Pre-warm Redis
    user_data = {"id": 1, "role": "admin", "email": "admin@demo.com"}
    try:
        redis_client.setex("session:1", 3600, json.dumps(user_data))
    except redis.exceptions.ConnectionError:
        pass
    
    # Store in DB (lazy import to prevent circular dependency)
    from services.content_service import get_db
    try:
        db = get_db()
        db.execute('''
            INSERT OR IGNORE INTO users (id, email, google_id, role, created_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (1, 'admin@demo.com', 'mock-google-12345', 'admin', datetime.datetime.now().isoformat()))
        db.commit()
    except Exception as e:
        print("Mock Auth DB Insert Error:", e)
        
    return redirect(url_for('index'))

@auth_bp.route('/logout')
def logout():
    user_id = session.get("user_id")
    if user_id:
        try:
            redis_client.delete(f"session:{user_id}")
        except redis.exceptions.ConnectionError:
            pass
    session.clear()
    return redirect(url_for('login'))
