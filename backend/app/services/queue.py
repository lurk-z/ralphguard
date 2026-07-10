"""Redis Streams producer — enqueue jobs for the scientific worker."""
import json

import redis

from app.core.config import settings

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _client


def enqueue_assessment(job_id: str) -> str:
    """Push a job_id onto the assessment stream. Returns the Redis message ID."""
    r = get_redis()
    return r.xadd(
        settings.QUEUE_STREAM_NAME,
        {"job_id": job_id, "type": "assessment"},
    )
