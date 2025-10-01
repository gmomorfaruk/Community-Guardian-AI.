from fastapi import FastAPI, WebSocket, WebSocketDisconnect
# --- NEW: Import the jsonable_encoder ---
from fastapi.encoders import jsonable_encoder 
from pydantic import BaseModel
from typing import List
import datetime

# --- Database Simulation ---
class Alert(BaseModel):
    id: int
    timestamp: datetime.datetime
    latitude: float
    longitude: float
    userId: str
    alertType: str

fake_database: List[Alert] = []
next_id = 1

# --- WebSocket Connection Manager ---
websocket_connections: List[WebSocket] = []

async def broadcast_alert(alert: Alert):
    """Sends a new alert to all connected dashboards."""
    
    # --- THIS IS THE FIX ---
    # We use jsonable_encoder to correctly convert the alert,
    # including the datetime object, into a format that can be sent as JSON.
    encoded_alert = jsonable_encoder(alert)
    
    for connection in websocket_connections:
        # Send the properly encoded data
        await connection.send_json(encoded_alert)

# --- Application Setup ---
app = FastAPI(
    title="Community Guardian AI - Backend",
    description="API for receiving SOS alerts and broadcasting them to dashboards.",
    version="1.0.0"
)

# --- Data Models ---
class Location(BaseModel):
    latitude: float
    longitude: float

class SOSPayload(BaseModel):
    userId: str
    location: Location
    alertType: str

# --- API Endpoints ---

@app.get("/")
def read_root():
    return {"status": "Community Guardian AI Backend is running"}

@app.post("/sos", response_model=Alert)
async def receive_sos(payload: SOSPayload):
    """
    Receives an SOS alert from a mobile device, saves it,
    and broadcasts it to all live dashboards.
    """
    global next_id
    
    new_alert = Alert(
        id=next_id,
        timestamp=datetime.datetime.utcnow(),
        latitude=payload.location.latitude,
        longitude=payload.location.longitude,
        userId=payload.userId,
        alertType=payload.alertType
    )
    
    fake_database.append(new_alert)
    next_id += 1
    
    # This function will now work correctly
    await broadcast_alert(new_alert)
    
    print(f"Received and broadcasted alert ID: {new_alert.id}")
    return new_alert

@app.get("/alerts", response_model=List[Alert])
def get_all_alerts():
    """Gets all historical alerts from the database."""
    return fake_database

# --- LIVE DASHBOARD ENDPOINT ---

@app.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    """
    The endpoint for live dashboards to connect to.
    """
    await websocket.accept()
    websocket_connections.append(websocket)
    print(f"New dashboard connected. Total connections: {len(websocket_connections)}")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        websocket_connections.remove(websocket)
        print(f"Dashboard disconnected. Total connections: {len(websocket_connections)}")
