from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.declarative import declarative_base

# Database Setup
DATABASE_URL = "sqlite:///./community_guardian.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Database Table Model
class AlertRecord(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    userId = Column(String, index=True)
    latitude = Column(Float)
    longitude = Column(Float)
    alertType = Column(String)

Base.metadata.create_all(bind=engine)

# FastAPI App
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Model for incoming data
class SosAlert(BaseModel):
    userId: str
    location: dict
    alertType: str

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def read_root():
    return {"message": "Community Guardian Backend is running!"}

@app.post("/sos")
async def receive_sos_alert(alert: SosAlert, db: Session = Depends(get_db)):
    print(f"--- 🚨 SOS ALERT RECEIVED for user: {alert.userId} 🚨 ---")
    db_alert = AlertRecord(
        userId=alert.userId,
        latitude=alert.location.get('latitude'),
        longitude=alert.location.get('longitude'),
        alertType=alert.alertType
    )
    db.add(db_alert)
    db.commit()
    db.refresh(db_alert)
    print("--- ✅ Alert saved to database! ---")
    return {"status": "success", "database_id": db_alert.id}

@app.get("/alerts")
def get_all_alerts(db: Session = Depends(get_db)):
    return db.query(AlertRecord).all()
