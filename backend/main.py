import datetime
from typing import List, Optional

import databases
import sqlalchemy

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel

# --- 1. DATABASE SETUP (with userName) ---
DATABASE_URL = "sqlite:///./database.db"
database = databases.Database(DATABASE_URL)
metadata = sqlalchemy.MetaData()

# Define the structure of our 'alerts' table, now with 'userName'.
alerts = sqlalchemy.Table(
    "alerts",
    metadata,
    sqlalchemy.Column("id", sqlalchemy.Integer, primary_key=True),
    sqlalchemy.Column("timestamp", sqlalchemy.String, nullable=False),
    sqlalchemy.Column("latitude", sqlalchemy.Float, nullable=False),
    sqlalchemy.Column("longitude", sqlalchemy.Float, nullable=False),
    # --- THIS IS THE KEY CHANGE ---
    sqlalchemy.Column("userName", sqlalchemy.String, nullable=False),
    sqlalchemy.Column("alertType", sqlalchemy.String, nullable=False),
)

engine = sqlalchemy.create_engine(DATABASE_URL)
metadata.create_all(engine)


# --- DATA MODELS (Pydantic Models) ---

# This model is for data coming INTO the API
class LocationWithTime(BaseModel):
    latitude: float
    longitude: float
    speed: Optional[float] = None
    accuracy: Optional[float] = None
    timestamp: int

class SOSPayload(BaseModel):
    # --- THIS IS THE KEY CHANGE ---
    userName: str  # We now expect userName instead of userId
    location: LocationWithTime
    alertType: str

# This model is for data going OUT of the API (and to the database)
class Alert(BaseModel):
    id: int
    timestamp: str
    latitude: float
    longitude: float
    # --- THIS IS THE KEY CHANGE ---
    userName: str
    alertType: str


# --- WEBSOCKET MANAGER (Unchanged) ---
websocket_connections: List[WebSocket] = []
async def broadcast_alert(alert: Alert):
    encoded_alert = jsonable_encoder(alert)
    for connection in websocket_connections:
        await connection.send_json(encoded_alert)


# --- APPLICATION SETUP (Unchanged) ---
app = FastAPI(
    title="Community Guardian AI - Backend",
    description="API for receiving SOS alerts and broadcasting them to dashboards.",
    version="1.2.0-username"
)

# --- FASTAPI LIFECYCLE EVENTS (Unchanged) ---
@app.on_event("startup")
async def startup():
    await database.connect()
    print("Database connection established.")

@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()
    print("Database connection closed.")


# --- API ENDPOINTS ---

@app.post("/sos", response_model=Alert)
async def receive_sos(payload: SOSPayload):
    utc_timestamp = datetime.datetime.fromtimestamp(
        payload.location.timestamp / 1000, tz=datetime.timezone.utc
    )
    
    # --- INSERT a new record into the database ---
    query = alerts.insert().values(
        timestamp=utc_timestamp.isoformat(),
        latitude=payload.location.latitude,
        longitude=payload.location.longitude,
        # --- THIS IS THE KEY CHANGE ---
        userName=payload.userName,
        alertType=payload.alertType
    )
    
    last_record_id = await database.execute(query)
    
    # Create an Alert object to send back and broadcast
    new_alert = Alert(
        id=last_record_id,
        timestamp=utc_timestamp.isoformat(),
        latitude=payload.location.latitude,
        longitude=payload.location.longitude,
        # --- THIS IS THE KEY CHANGE ---
        userName=payload.userName,
        alertType=payload.alertType
    )
    
    await broadcast_alert(new_alert)
    
    print(f"Saved and broadcasted alert for user: {new_alert.userName}")
    return new_alert

@app.get("/alerts", response_model=List[Alert])
async def get_all_alerts():
    query = alerts.select().order_by(alerts.c.id.desc())
    return await database.fetch_all(query)


# --- WEBSOCKET ENDPOINT (Unchanged) ---
@app.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    websocket_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        websocket_connections.remove(websocket)