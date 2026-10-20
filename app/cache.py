from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.config import REDIS_URL, CACHE_TTL


STATISTICS_CACHE_KEY = "equipment:statistics"


def get_latest_measurement_key(equipment_id: int) -> str:
    """
    Создание ключа для последнего измерения оборудования
    """
    return f"equipment:{equipment_id}:latest"

class RedisCache:
    """
    Работа с кэшем Redis
    """
    def __init__(self, client: Redis, ttl: int):
        self.client = client
        self.ttl = ttl
        self.pending_deletions: set[str] = set()

    async def get(self, key: str) -> str | None:
        """
        Получение значения
        """
        #
        if key in self.pending_deletions:
            await self.delete(key)
            return

        try:
            return await self.client.get(key)
        except RedisError:
            return None

    async def set(self, key: str, value: str) -> None:
        """
        Сохранение значения
        """
        try:
            await self.client.set(key, value, ex=self.ttl)
        except RedisError:
            return
        
        self.pending_deletions.discard(key)

    async def delete(self, *keys: str) -> None:
        """
        Удаление записей кэша
        """
        if not keys:
            return

        # Ключи к удалению в Redis
        self.pending_deletions.update(keys)

        try:
            await self.client.delete(*keys)
        except RedisError:
            return

        # Удаление ключей
        self.pending_deletions.difference_update(keys)

    async def close(self) -> None:
        """
        Закрытие соединений клиента Redis
        """
        await self.client.aclose()


redis_client = Redis.from_url(
    REDIS_URL,
    decode_responses=True,
    socket_connect_timeout=1,
    socket_timeout=1,
)

cache = RedisCache(redis_client, CACHE_TTL)