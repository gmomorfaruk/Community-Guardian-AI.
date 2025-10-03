import React, { useState, useEffect } from 'react';
import './App.css';

// --- SERVER CONFIG (Unchanged) ---
const SERVER_IP = '192.168.0.107'; // <-- IMPORTANT: Make sure this is your computer's IP
const API_URL = `http://${SERVER_IP}:8000/alerts`;
const WS_URL = `ws://${SERVER_IP}:8000/ws/alerts`;

function App() {
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState("Connecting...");

  const formatTimestamp = (isoString) => {
    const date = new Date(isoString);
    const options = {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: true, timeZone: 'Asia/Dhaka'
    };
    return date.toLocaleString('en-US', options);
  };

  useEffect(() => {
    async function fetchInitialAlerts() {
      try {
        const response = await fetch(API_URL);
        if (response.ok) {
          const data = await response.json();
          setAlerts(data);
        } else {
          setStatus("Error fetching initial data.");
        }
      } catch (error) {
        console.error("Fetch error:", error);
        setStatus("Could not connect to backend.");
      }
    }

    fetchInitialAlerts();

    const ws = new WebSocket(WS_URL);
    ws.onopen = () => setStatus("Live");
    ws.onmessage = (event) => {
      const newAlert = JSON.parse(event.data);
      setAlerts(prevAlerts => [newAlert, ...prevAlerts]);
    };
    ws.onclose = () => setStatus("Disconnected");
    ws.onerror = () => setStatus("Connection Error");

    return () => ws.close();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <h1>Live Alert Dashboard</h1>
          <div className="status-indicator">
              <span className={`status-dot ${status === 'Live' ? 'live' : 'offline'}`}></span>
              <span>{status}</span>
          </div>
        </div>
      </header>
      <main className="alert-container">
        <div className="alert-grid header-row">
          <div>Alert ID</div>
          <div>Timestamp (Bangladesh Time)</div>
          <div>User Name</div>
          <div>Location (Click to Open Map)</div>
          <div>Alert Type</div>
        </div>
        {alerts.length === 0 ? (
          <div className="no-alerts">Waiting for alerts...</div>
        ) : (
          alerts.map((alert) => (
            <div key={alert.id} className="alert-grid data-row">
              <div><span className="alert-id-badge">{alert.id}</span></div>
              <div>{formatTimestamp(alert.timestamp)}</div>
              <div>{alert.userName}</div>
              
              {/* --- THIS IS THE KEY CHANGE --- */}
              <div>
                <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${alert.latitude},${alert.longitude}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="location-link"
                >
                  {`${alert.latitude.toFixed(4)}, ${alert.longitude.toFixed(4)}`}
                </a>
              </div>
              
              <div className="alert-type">{alert.alertType.replace('_', ' ').toUpperCase()}</div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}

export default App;