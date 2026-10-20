import os

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ['DATABASE_URL']

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CACHE_TTL = int(os.getenv("CACHE_TTL", "60"))