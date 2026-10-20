from fastapi import APIRouter, status, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from datetime import datetime
from app.models import Measurement as MeasurementModel, Equipment as EquipmentModel
from app.schemas import Measurement as MeasurementSchema, MeasurementCreate
from app.equipment_status import get_equipment_status

from app.cache import cache, STATISTICS_CACHE_KEY, get_latest_measurement_key

from app.db_depends import get_async_db


router = APIRouter(prefix="/equipment/{equipment_id}/measurements", tags=["measurements"])


@router.post("/", response_model=MeasurementSchema, status_code=status.HTTP_201_CREATED)
async def create_measurement(equipment_id: int, measurement: MeasurementCreate, db: AsyncSession = Depends(get_async_db)):
    """
    Создание измерений оборудования
    """
    # Проверка корректности ID оборудования
    db_equipment = await db.scalar(select(EquipmentModel).where(EquipmentModel.id == equipment_id))
    if not db_equipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Оборудование не найдено")

    # Создание измерения оборудования
    db_measurement = MeasurementModel(equipment_id=equipment_id, **measurement.model_dump())
    db.add(db_measurement)

    # Обновление состояния оборудования
    db_equipment.status = get_equipment_status(measurement.temperature, db_equipment.warning_limit, db_equipment.critical_limit)

    await db.commit()
    await cache.delete(STATISTICS_CACHE_KEY, get_latest_measurement_key(equipment_id))
    await db.refresh(db_measurement)

    return db_measurement


@router.get("/latest", response_model=MeasurementSchema)
async def get_latest_measurement(equipment_id: int, db: AsyncSession = Depends(get_async_db)):
    """
    Получение последнего измерения оборудования
    """
    # Проверка корректности ID оборудования
    db_equipment = await db.scalar(select(EquipmentModel).where(EquipmentModel.id == equipment_id))
    if not db_equipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Оборудование не найдено")

    # Получение измерения из Redis
    cache_key = get_latest_measurement_key(equipment_id)
    cached_measurement = await cache.get(cache_key)

    if cached_measurement is not None:
        try:
            return MeasurementSchema.model_validate_json(cached_measurement)
        except ValueError:
            # Удаление некорректного кэша
            await cache.delete(cache_key)


    # Получение последнего измерения
    last_measurement = await db.scalar(select(MeasurementModel)
        .where(
            MeasurementModel.equipment_id == equipment_id
        )
        .order_by(
            MeasurementModel.received_at.desc(),
            MeasurementModel.id.desc(),
        )
        .limit(1)
    )

    # Проверка существования измерений
    if not last_measurement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Измерения оборудования не найдены")

    # Преобразование объекта SQLAlchemy в схему ответа
    last_measurement = MeasurementSchema.model_validate(last_measurement)

    await cache.set(cache_key, last_measurement.model_dump_json())

    return last_measurement


@router.get("/", response_model=list[MeasurementSchema])
async def get_measurements_history(equipment_id: int, date_from: datetime, date_to: datetime, db: AsyncSession = Depends(get_async_db)):
    """
    Получение истории измерений оборудования за заданный период
    """
    # Проверка корректности ID оборудования
    db_equipment = await db.scalar(select(EquipmentModel).where(EquipmentModel.id == equipment_id))
    if not db_equipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Оборудование не найдено")

    # Проверка корректности дат
    if date_from.utcoffset() is None or date_to.utcoffset() is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Отсутствует часовой пояс")
    if date_from > date_to:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Невозможный временной промежуток")

    # Получение измерений за выбранный период
    measurements_result = await db.scalars(
        select(MeasurementModel)
        .where(
            MeasurementModel.equipment_id == equipment_id,
            MeasurementModel.received_at >= date_from,
            MeasurementModel.received_at <= date_to,
        )
        .order_by(
            MeasurementModel.received_at,
            MeasurementModel.id,
        )
    )

    return measurements_result.all()

