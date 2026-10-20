from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict


class EquipmentCreate(BaseModel):
    """
    Данные для создания и обновления оборудования
    """
    name: str = Field(min_length=3, max_length=100, description="Название оборудования (3-100 символов)")
    equipment_type: str = Field(min_length=3, max_length=100, description="Тип оборудования (3-100 символов)")
    serial_number: str = Field(min_length=1, max_length=100, description="Серийный номер оборудования (1-100 символов)")
    warning_limit: float = Field(default=70.0, ge=-273.15, description="Порог WARNING в градусах Цельсия")
    critical_limit: float = Field(default=90.0, ge=-273.15, description="Порог CRITICAL в градусах Цельсия")

class Equipment(BaseModel):
    """
    Данные для ответа с данными оборудования
    """
    id: int = Field(description="ID оборудования")
    name: str = Field(description="Название оборудования")
    equipment_type: str = Field(description="Тип оборудования")
    serial_number: str = Field(description="Серийный номер оборудования")
    created_at: datetime = Field(description="Время создания оборудования")
    status: str = Field(pattern="^(NORMAL|WARNING|CRITICAL|UNKNOWN)$", description="Состояние оборудования")
    warning_limit: float = Field(description="Порог WARNING в градусах Цельсия")
    critical_limit: float = Field(description="Порог CRITICAL в градусах Цельсия")

    model_config = ConfigDict(from_attributes=True)

class MeasurementCreate(BaseModel):
    """
    Данные для добавления измерений оборудования
    """
    temperature: float = Field(ge=-273.15, description="Температура в градусах Цельсия (минимум -273.15)")
    pressure: float | None = Field(default=None, description="Давление в барах")

class Measurement(BaseModel):
    """
    Данные для ответа с измерениями оборудования
    """
    id: int = Field(description="ID показания")
    equipment_id: int = Field(description="ID оборудования")
    temperature: float = Field(ge=-273.15, description="Температура в градусах Цельсия (минимум -273.15)")
    pressure: float | None = Field(description="Давление в барах")
    received_at: datetime = Field(description="Время получения показания")

    model_config = ConfigDict(from_attributes=True)


class EquipmentStatistics(BaseModel):
    """
    Сводная статистика оборудования (общее количество и состояния)
    """
    total: int = Field(ge=0, description="Количество устройств")
    normal: int = Field(ge=0, description="Количество устройств в состоянии NORMAL")
    warning: int = Field(ge=0, description="Количество устройств в состоянии WARNING")
    critical: int = Field(ge=0, description="Количество устройств в состоянии CRITICAL")
    unknown: int = Field(ge=0, description="Нет измерений")