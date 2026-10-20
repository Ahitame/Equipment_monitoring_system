from datetime import datetime

from sqlalchemy import Integer, String, Float, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class Equipment(Base):
    __tablename__ = 'equipment'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    equipment_type: Mapped[str] = mapped_column(String(100), nullable=False)
    serial_number: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="UNKNOWN", server_default="UNKNOWN")
    warning_limit: Mapped[float] = mapped_column(Float, nullable=False, default=70.0, server_default="70")
    critical_limit: Mapped[float] = mapped_column(Float, nullable=False, default=90.0, server_default="90")

