"""
MongoDB: the document side of the hybrid database (IR §2.3.5; 6 Oct). PostgreSQL keeps the structured data (users,
modules, grades, jobs, skills); MongoDB keeps the chatbot conversations, which are documents of varying length and
shape (a list of messages that grows) and are only ever read whole, per user.

Collection `chat_sessions`, one document per conversation:
    {_id: "<uuid>", user_id: 7, mode: "skill_development", title: "I want to learn ISTQB…",
     context: {target_skill: "ISTQB", job_title: "Software QA Engineer"},
     created_at, updated_at, messages: [{role: "user" | "assistant", content, at}]}

Retention (14 Oct audit): a conversation not used for CHAT_KEEP_DAYS (18 months, the default Google uses for Gemini
chats; references.md "Chat retention") is deleted by MongoDB itself, through a TTL index on updated_at. The privacy
notice says so. Deleting the account deletes them all at once.

MongoDB being off must never break the chatbot: the reply still comes back, only the history is not saved
(history_ok() is False and the page says so).
Settings: MONGODB_URL (default mongodb://localhost:27017) and MONGODB_DB (default skillmap) in backend/.env.
"""
import threading

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import PyMongoError

from app.config import settings

_client = None
_lock = threading.Lock()
_indexes_done = False
CHAT_KEEP_DAYS = 548        # 18 months


def get_db():
    """The SkillMap database. The client connects lazily and is shared by all requests (it is thread-safe)."""
    global _client
    with _lock:
        if _client is None:
            # Short timeout: with MongoDB off, a request waits 2 s at most, not pymongo's default 30 s
            _client = MongoClient(settings.mongodb_url, serverSelectionTimeoutMS=2000, tz_aware=True)
    return _client[settings.mongodb_db]


def chat_sessions():
    """The chat_sessions collection, with its index made on first use (newest chats of one user first)."""
    global _indexes_done
    col = get_db()["chat_sessions"]
    if not _indexes_done:
        col.create_index([("user_id", ASCENDING), ("updated_at", DESCENDING)])
        # TTL: MongoDB deletes a chat CHAT_KEEP_DAYS after its last message (checked about once a minute)
        col.create_index("updated_at", name="chat_expiry", expireAfterSeconds=CHAT_KEEP_DAYS * 24 * 3600)
        _indexes_done = True
    return col


def history_ok() -> bool:
    """Is MongoDB reachable? Used at start-up (a warning, not a crash) and by the chat-history endpoints."""
    try:
        get_db().command("ping")
        return True
    except PyMongoError as e:
        print(f"[mongo] not reachable at {settings.mongodb_url}: {type(e).__name__}")
        return False
