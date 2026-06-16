"""
Scientific Worker
==================
Consumes jobs from Redis Streams, runs the QSAR pipeline,
writes results back to PostgreSQL.

This is a STUB - to be implemented in Week 2 of the plan.
"""
import os
import time

import redis


def main():
    redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
    stream = os.environ.get("QUEUE_STREAM_NAME", "ralphguard:jobs")

    r = redis.Redis.from_url(redis_url, decode_responses=True)
    print(f"🔬 Scientific Worker started")
    print(f"   Redis : {redis_url}")
    print(f"   Stream: {stream}")
    print(f"   (Stub mode - real pipeline coming in Week 2)")

    last_id = "0"
    while True:
        try:
            # Block for new messages
            resp = r.xread({stream: last_id}, block=5000, count=10)
            if not resp:
                continue
            for _stream_name, messages in resp:
                for msg_id, fields in messages:
                    print(f"📦 Job received: {msg_id} fields={fields}")
                    # TODO: run real pipeline
                    last_id = msg_id
        except KeyboardInterrupt:
            print("👋 Worker stopping...")
            break
        except Exception as e:
            print(f"⚠️  Worker error: {e}")
            time.sleep(2)


if __name__ == "__main__":
    main()
