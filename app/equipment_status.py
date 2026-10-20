def get_equipment_status(temperature: float | None, warning_limit: float, critical_limit: float,) -> str:
    """
    Определение состояния оборудования по последней температуре
    """
    if temperature is None:
        return "UNKNOWN"

    if temperature > critical_limit:
        return "CRITICAL"

    if temperature > warning_limit:
        return "WARNING"

    return "NORMAL"