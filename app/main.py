from fastapi import FastAPI

from contextlib import asynccontextmanager
from app.cache import cache

from app.routers import equipment, measurements

# Закрытие Redis при остановке приложения
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        yield
    finally:
        await cache.close()

# Приложение
app = FastAPI(
    title='Equipment monitoring system',
    version='0.7.0',
    lifespan=lifespan,
)

# Подключение маршрутов
app.include_router(equipment.router)
app.include_router(measurements.router)

# Корневой эндпоинт
@app.get("/")
async def root():
    """ Корневой маршрут """
    return {"message": "API системы мониторинга оборудования"}