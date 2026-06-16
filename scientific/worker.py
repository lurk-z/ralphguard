"""
Scientific Worker
==================
Consumes assessment jobs from Redis Streams, runs the QSAR pipeline,
writes results back to PostgreSQL.

Stream layout
-------------
- Stream:        ralphguard:jobs
- Consumer group: ralphguard-workers (created on startup)
- Consumer name:  worker-<pid>
- Message fields: {job_id, type}  (type == "assessment")
"""
from __future__ import annotations

import datetime as dt
import json
import os
import socket
import time
import traceback

import redis
from sqlalchemy import create_engine, text

from pipeline import run_pipeline
from qsar.predictor import Predictor

# ---------- Config ----------
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://ralphguard:ralphguard_dev@postgres:5432/ralphguard"
)
STREAM = os.environ.get("QUEUE_STREAM_NAME", "ralphguard:jobs")
GROUP = "ralphguard-workers"
CONSUMER = f"worker-{socket.gethostname()}-{os.getpid()}"
MODELS_DIR = os.environ.get("MODELS_DIR", "/app/models")
BLOCK_MS = 5000


# ---------- DB helpers (raw SQL via SQLAlchemy core) ----------
def make_engine():
    return create_engine(DATABASE_URL, pool_pre_ping=True)


def fetch_assessment(engine, job_id: str):
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT id, region, formula FROM assessments WHERE id = :id"),
            {"id": job_id},
        ).first()
        if row is None:
            return None
        formula = row.formula if isinstance(row.formula, list) else json.loads(row.formula)
        return {"id": row.id, "region": row.region, "formula": formula}


def mark_running(engine, job_id: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE assessments SET status = 'running' WHERE id = :id"),
            {"id": job_id},
        )


def mark_completed(engine, job_id: str, result: dict) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE assessments "
                "SET status = 'completed', result = CAST(:result AS jsonb), completed_at = :now "
                "WHERE id = :id"
            ),
            {"id": job_id, "result": json.dumps(result), "now": dt.datetime.utcnow()},
        )


def mark_failed(engine, job_id: str, err: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE assessments "
                "SET status = 'failed', error = :err, completed_at = :now "
                "WHERE id = :id"
            ),
            {"id": job_id, "err": err[:1900], "now": dt.datetime.utcnow()},
        )


# ---------- Stream helpers ----------
def ensure_group(r: redis.Redis) -> None:
    try:
        r.xgroup_create(name=STREAM, groupname=GROUP, id="0", mkstream=True)
        print(f"✅ created consumer group {GROUP} on {STREAM}")
    except redis.ResponseError as e:
        if "BUSYGROUP" in str(e):
            print(f"ℹ️  consumer group {GROUP} already exists")
        else:
            raise


# ---------- Main loop ----------
def process_job(predictor: Predictor, engine, job_id: str) -> None:
    print(f"📦 processing {job_id}")
    record = fetch_assessment(engine, job_id)
    if record is None:
        print(f"⚠️  {job_id} not found in DB — skipping")
        return

    mark_running(engine, job_id)
    try:
        result = run_pipeline(predictor, record["formula"], record["region"])
        mark_completed(engine, job_id, result)
        print(f"✅ completed {job_id}")
    except Exception as e:
        tb = traceback.format_exc()
        print(f"❌ failed {job_id}: {e}\n{tb}")
        mark_failed(engine, job_id, f"{e}\n{tb}")


def main():
    print(f"🔬 Scientific Worker starting")
    print(f"   Redis    : {REDIS_URL}")
    print(f"   DB       : {DATABASE_URL.split('@')[-1]}")
    print(f"   Stream   : {STREAM}")
    print(f"   Group    : {GROUP}")
    print(f"   Consumer : {CONSUMER}")
    print(f"   Models   : {MODELS_DIR}")

    predictor = Predictor(MODELS_DIR)
    if not predictor.is_ready():
        print(
            f"⚠️  predictor incomplete — loaded={predictor.loaded_endpoints}. "
            "Worker will run, but predictions for missing endpoints will fail."
        )

    engine = make_engine()
    r = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    ensure_group(r)

    while True:
        try:
            resp = r.xreadgroup(
                groupname=GROUP,
                consumername=CONSUMER,
                streams={STREAM: ">"},
                count=1,
                block=BLOCK_MS,
            )
            if not resp:
                continue
            for _stream, messages in resp:
                for msg_id, fields in messages:
                    job_id = fields.get("job_id")
                    if not job_id:
                        print(f"⚠️  message {msg_id} missing job_id, acking")
                        r.xack(STREAM, GROUP, msg_id)
                        continue
                    try:
                        process_job(predictor, engine, job_id)
                    finally:
                        r.xack(STREAM, GROUP, msg_id)
        except KeyboardInterrupt:
            print("👋 worker stopping")
            break
        except Exception as e:
            print(f"⚠️  worker loop error: {e}")
            time.sleep(2)


if __name__ == "__main__":
    main()
