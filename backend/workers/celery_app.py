from celery import Celery
import os
from dotenv import load_dotenv
load_dotenv()

celery = Celery(
    "fbs_vetor",
    broker=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
    backend=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
    include=["workers.task_silk", "workers.task_dtf"],
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="America/Sao_Paulo",
    enable_utc=True,
    task_soft_time_limit=180,   # 3 min warn → SoftTimeLimitExceeded
    task_time_limit=200,        # 3m20s hard kill → SIGKILL
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)
