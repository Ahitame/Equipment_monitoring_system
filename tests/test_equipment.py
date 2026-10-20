import pytest
import json

from app.cache import cache, STATISTICS_CACHE_KEY

@pytest.mark.asyncio
async def test_equipment_crud(client):
    """
    Проверка создания, получения, изменения и удаления оборудования
    """
    equipment_data = {
        "name": "Тестовый насос",
        "equipment_type": "Насос",
        "serial_number": "TEST-API-001",
    }

    # Создание оборудования
    response = await client.post("/equipment/", json=equipment_data)

    assert response.status_code == 201, response.text

    equipment = response.json()
    equipment_id = equipment["id"]

    assert equipment["name"] == equipment_data["name"]
    assert equipment["status"] == "UNKNOWN"
    assert equipment["warning_limit"] == 70
    assert equipment["critical_limit"] == 90

    # Получение оборудования по ID
    response = await client.get(f"/equipment/{equipment_id}")

    assert response.status_code == 200, response.text
    assert response.json()["serial_number"] == equipment_data["serial_number"]

    # Изменение оборудования
    equipment_data["name"] = "Обновлённый насос"

    response = await client.put(f"/equipment/{equipment_id}", json=equipment_data)

    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Обновлённый насос"

    # Удаление оборудования
    response = await client.delete(f"/equipment/{equipment_id}")

    assert response.status_code == 204
    assert response.content == b""

    response = await client.get(f"/equipment/{equipment_id}")

    assert response.status_code == 404


async def check_statistics(client, expected_statistics):
    """
    Проверка статистики в ответе API и в Redis
    """
    response = await client.get("/equipment/statistics")

    assert response.status_code == 200, response.text
    assert response.json() == expected_statistics

    cached_data = await cache.client.get(STATISTICS_CACHE_KEY)

    assert cached_data is not None
    assert json.loads(cached_data) == expected_statistics
    assert await cache.client.ttl(STATISTICS_CACHE_KEY) > 0


@pytest.mark.asyncio
async def test_statistics_cache_updates(client):
    """
    Проверка актуальности кэша статистики после изменения данных
    """
    statistics = {
        "total": 0,
        "normal": 0,
        "warning": 0,
        "critical": 0,
        "unknown": 0,
    }

    # Заполнение кэша статистикой пустой базы
    await check_statistics(client, statistics)

    # Создание оборудования без измерений
    equipment_data = {
        "name": "Тестовый насос",
        "equipment_type": "Насос",
        "serial_number": "TEST-STATISTICS-001",
    }

    response = await client.post("/equipment/", json=equipment_data)

    assert response.status_code == 201, response.text
    equipment_id = response.json()["id"]

    statistics.update(total=1, unknown=1)
    await check_statistics(client, statistics)

    # Добавление измерения с критической температурой
    response = await client.post(f"/equipment/{equipment_id}/measurements/", json={"temperature": 95})

    assert response.status_code == 201, response.text

    statistics.update(unknown=0, critical=1)
    await check_statistics(client, statistics)

    # Повышение порогов
    equipment_data.update(warning_limit=100, critical_limit=120)

    response = await client.put(f"/equipment/{equipment_id}", json=equipment_data,
    )

    assert response.status_code == 200, response.text

    statistics.update(critical=0, normal=1)
    await check_statistics(client, statistics)

    # Удаление оборудования
    response = await client.delete(f"/equipment/{equipment_id}")

    assert response.status_code == 204

    statistics.update(total=0, normal=0)
    await check_statistics(client, statistics)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "warning_limit, critical_limit",
    [
        (90, 90),
        (100, 90),
    ],
)
async def test_invalid_equipment_limits(client, warning_limit, critical_limit):
    """
    Проверка отклонения неверных порогов при создании и обновлении оборудования
    """
    expected_error = (
        "Порог предупреждения должен быть ниже критического порога"
    )

    equipment_data = {
        "name": "Тестовый насос",
        "equipment_type": "Насос",
        "serial_number": "TEST-LIMITS-001",
        "warning_limit": warning_limit,
        "critical_limit": critical_limit,
    }

    # Создание оборудования с неверными порогами
    response = await client.post("/equipment/", json=equipment_data)

    assert response.status_code == 400, response.text
    assert response.json()["detail"] == expected_error

    response = await client.get("/equipment/")

    assert response.status_code == 200, response.text
    assert response.json() == []

    # Создание оборудования с правильными порогами
    equipment_data.update(warning_limit=70, critical_limit=90)

    response = await client.post("/equipment/", json=equipment_data)

    assert response.status_code == 201, response.text

    original_equipment = response.json()
    equipment_id = original_equipment["id"]

    # Обновление с неверными порогами
    equipment_data.update(
        name="Изменённый насос",
        warning_limit=warning_limit,
        critical_limit=critical_limit,
    )

    response = await client.put(f"/equipment/{equipment_id}", json=equipment_data)

    assert response.status_code == 400, response.text
    assert response.json()["detail"] == expected_error

    response = await client.get(f"/equipment/{equipment_id}")

    assert response.status_code == 200, response.text
    assert response.json() == original_equipment