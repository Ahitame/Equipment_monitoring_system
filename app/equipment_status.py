def get_equipment_status(temperature: float | None) -> str:
    """
    Определение состояния оборудования по последней температуре
    """
    if temperature is None:
        return "UNKNOWN"

    if temperature > 90:
        return "CRITICAL"

    if temperature > 70:
        return "WARNING"

    return "NORMAL"