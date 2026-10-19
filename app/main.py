from fastapi import FastAPI

from app.routers import equipment, measurements

# Приложение
app = FastAPI(
    title='Equipment monitoring system',
    version='0.1.0',
)

# Подключение маршрутов
app.include_router(equipment.router)
app.include_router(measurements.router)

# Корневой эндпоинт
@app.get("/")
async def root():
    """ Корневой маршрут """
    return {"message": "API системы мониторинга оборудования"}