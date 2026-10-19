from fastapi import APIRouter, status, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models import Equipment as EquipmentModel
from app.schemas import Equipment as EquipmentSchema, EquipmentCreate, EquipmentStatistics

from app.db_depends import get_async_db


router = APIRouter(
    prefix="/equipment",
    tags=["equipment"],
)


@router.post("/", response_model=EquipmentSchema, status_code=status.HTTP_201_CREATED)
async def create_equipment(equipment: EquipmentCreate, db: AsyncSession = Depends(get_async_db)):
    """
    Создание нового оборудования
    """
    # Проверка уникальности серийного номера
    result = await db.scalars(select(EquipmentModel).where(EquipmentModel.serial_number == equipment.serial_number))
    if result.first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Серийный номер оборудования уже зарегистрирован")

    # Создание нового оборудования
    db_equipment = EquipmentModel(**equipment.model_dump())
    db.add(db_equipment)
    await db.commit()
    await db.refresh(db_equipment)
    return db_equipment


@router.get("/", response_model=list[EquipmentSchema], status_code=status.HTTP_200_OK)
async def get_all_equipment(
        search: str | None = Query(
            default=None,
            min_length=1,
            description="Поиск по части названия оборудования",
        ),
        equipment_status: str | None = Query(
            default=None,
            alias="status",
            pattern="^(NORMAL|WARNING|CRITICAL|UNKNOWN)$",
            description="Состояние оборудования",
        ),
        db: AsyncSession = Depends(get_async_db)
):
    """
    Получение списка всего оборудования с фильтрацией по названию и состоянию
    """

    equipment = select(EquipmentModel)
    if search:
        equipment = equipment.where(EquipmentModel.name.ilike(f"%{search}%"))

    if equipment_status is not None:
        equipment = equipment.where(EquipmentModel.status == equipment_status)

    equipment_list = await db.scalars(equipment.order_by(EquipmentModel.id))
    return equipment_list.all()


@router.get("/statistics", response_model=EquipmentStatistics)
async def get_equipment_statistics(db: AsyncSession = Depends(get_async_db)):
    """
    Получение сводной статистики оборудования
    """
    # Подсчет оборудования в каждом состоянии
    status_count = await db.execute(select(EquipmentModel.status, func.count(EquipmentModel.id)).group_by(EquipmentModel.status))

    # Создание словаря со сводной статистикой
    statistics = {equipment_status: count for equipment_status, count in status_count.all()}

    return EquipmentStatistics(
        total=sum(statistics.values()),
        normal=statistics.get("NORMAL", 0),
        warning=statistics.get("WARNING", 0),
        critical=statistics.get("CRITICAL", 0),
        unknown=statistics.get("UNKNOWN", 0),
    )


@router.get("/{equipment_id}", response_model=EquipmentSchema, status_code=status.HTTP_200_OK)
async def get_one_equipment(equipment_id: int, db: AsyncSession = Depends(get_async_db)):
    """
    Получение одного оборудования
    """
    # Проверка существования конкретного оборудования
    equipment_result = await db.scalars(select(EquipmentModel).where(EquipmentModel.id == equipment_id))
    one_equipment = equipment_result.first()
    if not one_equipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Оборудование не найдено")

    return one_equipment


@router.put("/{equipment_id}", response_model=EquipmentSchema)
async def update_equipment(equipment_id: int, equipment: EquipmentCreate, db: AsyncSession = Depends(get_async_db)):
    """
    Обновление оборудования
    """
    # Проверка существования конкретного оборудования
    equipment_result = await db.scalars(select(EquipmentModel).where(EquipmentModel.id == equipment_id))
    db_equipment = equipment_result.first()
    if not db_equipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Оборудование не найдено")

    # Проверка уникальности серийного номера
    serial_number_result = await db.scalars(
        select(EquipmentModel).where(
            EquipmentModel.serial_number == equipment.serial_number,
            EquipmentModel.id != equipment_id
        )
    )
    if serial_number_result.first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Серийный номер оборудования уже зарегистрирован")

    # Обновление оборудования
    db_equipment.name = equipment.name
    db_equipment.equipment_type = equipment.equipment_type
    db_equipment.serial_number = equipment.serial_number


    await db.commit()
    await db.refresh(db_equipment)

    return db_equipment


@router.delete("/{equipment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_one_equipment(equipment_id: int, db: AsyncSession = Depends(get_async_db)):
    """
    Удаление оборудования
    """
    # Проверка существования конкретного оборудования
    equipment_result = await db.scalars(select(EquipmentModel).where(EquipmentModel.id == equipment_id))
    db_equipment = equipment_result.first()
    if not db_equipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Оборудование не найдено")

    await db.delete(db_equipment)
    await db.commit()
