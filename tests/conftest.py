import os

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis


TEST_DATABASE_URL = (
    "postgresql+asyncpg://test_user:test_password"
    "@127.0.0.1:5433/equipment_test"
)
TEST_REDIS_URL = "redis://127.0.0.1:6380/0"

# Задаём настройки до импорта приложения
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["REDIS_URL"] = TEST_REDIS_URL

from app.cache import cache
from app.database import Base, async_engine
from app.main import app


@pytest_asyncio.fixture
async def client(monkeypatch):
    """
    Подготовка тестовой базы, Redis и клиента для запросов к API
    """
    # Проверка подключения перед пересозданием таблиц
    if async_engine.url.database != "equipment_test" or async_engine.url.port != 5433:
        raise RuntimeError("Для тестов нужна база equipment_test на порту 5433")

    redis_client = Redis.from_url(TEST_REDIS_URL, decode_responses=True, socket_connect_timeout=1, socket_timeout=1)

    # Настройка объект кэша для текущего теста
    monkeypatch.setattr(cache, "client", redis_client)
    monkeypatch.setattr(cache, "ttl", 300)
    monkeypatch.setattr(cache, "pending_deletions", set())

    try:
        # Проверка доступности Redis и очистка тестового кэша
        await redis_client.ping()
        await redis_client.flushdb()

        # Создание пустых таблиц перед тестом
        async with async_engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
            await connection.run_sync(Base.metadata.create_all)

        # Клиент тестовой функции
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as test_client:
            yield test_client
    finally:
        # Закрытие соединения после теста
        await redis_client.aclose()
        await async_engine.dispose()