import json
import pytest

from app.cache import cache, get_latest_measurement_key
from redis.exceptions import ConnectionError as RedisConnectionError


@pytest.mark.asyncio
async def test_latest_measurement_cache_updates(client):
    """
    Проверка актуальности кэша после добавления нового измерения
    """
    # Создание оборудования
    response = await client.post(
        "/equipment/",
        json={
            "name": "Тестовый насос",
            "equipment_type": "Насос",
            "serial_number": "TEST-CACHE-001",
        },
    )

    assert response.status_code == 201, response.text
    equipment_id = response.json()["id"]

    measurements_url = f"/equipment/{equipment_id}/measurements/"
    latest_url = f"/equipment/{equipment_id}/measurements/latest"
    cache_key = get_latest_measurement_key(equipment_id)

    # Добавление первого измерения
    response = await client.post(measurements_url, json={"temperature": 65, "pressure": 1.5})

    assert response.status_code == 201, response.text
    first_measurement_id = response.json()["id"]

    # Получение измерения и заполнение кэша
    response = await client.get(latest_url)

    assert response.status_code == 200, response.text
    assert response.json()["id"] == first_measurement_id

    # Проверка наличия первого измерения в Redis
    cached_data = await cache.client.get(cache_key)

    assert cached_data is not None
    assert json.loads(cached_data)["id"] == first_measurement_id
    assert await cache.client.ttl(cache_key) > 0

    # Добавление нового измерения
    response = await client.post(measurements_url, json={"temperature": 95, "pressure": 2.0})

    assert response.status_code == 201, response.text
    new_measurement = response.json()

    assert new_measurement["id"] != first_measurement_id

    # Возвращение измерения от API
    response = await client.get(latest_url)

    assert response.status_code == 200, response.text
    assert response.json() == new_measurement

    # Проверка В Redis нового измерения
    cached_data = await cache.client.get(cache_key)

    assert cached_data is not None
    assert json.loads(cached_data) == new_measurement


@pytest.mark.asyncio
async def test_api_works_without_redis(client, monkeypatch):
    """
    Проверка работы API при недоступности Redis
    """
    # Создание оборудования
    response = await client.post(
        "/equipment/",
        json={
            "name": "Тестовый насос",
            "equipment_type": "Насос",
            "serial_number": "TEST-REDIS-UNAVAILABLE",
        },
    )

    assert response.status_code == 201, response.text
    equipment_id = response.json()["id"]

    measurements_url = f"/equipment/{equipment_id}/measurements/"
    latest_url = f"/equipment/{equipment_id}/measurements/latest"

    # Добавление первого измерения
    response = await client.post(measurements_url, json={"temperature": 65})

    assert response.status_code == 201, response.text
    first_measurement = response.json()

    # Имитация ошибки подключения при обращении к Redis
    async def redis_unavailable(*args, **kwargs):
        raise RedisConnectionError("Redis недоступен")

    monkeypatch.setattr(cache.client, "get", redis_unavailable)
    monkeypatch.setattr(cache.client, "set", redis_unavailable)
    monkeypatch.setattr(cache.client, "delete", redis_unavailable)

    # Получение измерения из PostgreSQL при ошибке Redis
    response = await client.get(latest_url)

    assert response.status_code == 200, response.text
    assert response.json() == first_measurement

    # Сохранение нового измерения при недоступном Redis
    response = await client.post(measurements_url, json={"temperature": 95})

    assert response.status_code == 201, response.text
    new_measurement = response.json()

    assert new_measurement["id"] != first_measurement["id"]

    # Получение актуального измерения
    response = await client.get(latest_url)

    assert response.status_code == 200, response.text
    assert response.json() == new_measurement

    # Получение актуальной статистики
    response = await client.get("/equipment/statistics")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "total": 1,
        "normal": 0,
        "warning": 0,
        "critical": 1,
        "unknown": 0,
    }