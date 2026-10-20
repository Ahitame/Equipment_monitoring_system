import pytest

from app.equipment_status import get_equipment_status


@pytest.mark.parametrize(
    "temperature, warning_limit, critical_limit, expected_status",
    [
        (None, 70, 90, "UNKNOWN"),
        (0, 70, 90, "NORMAL"),
        (70, 70, 90, "NORMAL"),
        (71, 70, 90, "WARNING"),
        (90, 70, 90, "WARNING"),
        (91, 70, 90, "CRITICAL"),
        (75, 80, 100, "NORMAL"),
        (95, 80, 100, "WARNING"),
        (101, 80, 100, "CRITICAL"),
    ],
)
def test_get_equipment_status(temperature, warning_limit, critical_limit, expected_status):
    """
    Проверка состояния оборудования при разных температурах и порогах
    """
    result = get_equipment_status(temperature, warning_limit, critical_limit)

    assert result == expected_status