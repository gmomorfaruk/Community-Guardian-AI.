import React, { useState, useEffect } from 'react';
import './App.css'; // We'll keep the basic styling

// Define the structure of an Alert, matching our backend
// In JS, we don't have interfaces, so we just know the shape.

function App() {
  // State to hold all alerts, both initial and live
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState("Connecting...");

  useEffect(() => {
    // This effect runs once when the component mounts

    // 1. Fetch the initial list of alerts that already exist
    async function fetchInitialAlerts() {
      try {
        const response = await fetch('http://127.0.0.1:8000/alerts');
        if (response.ok) {
          const initialAlerts = await response.json();
          // Sort by most recent first
          setAlerts(initialAlerts.sort((a, b) => b.id - a.id));
        } else {
          setStatus("Error fetching initial data.");
        }
      } catch (error) {
        console.error("Fetch error:", error);
        setStatus("Could not connect to backend.");
      }
    }

    fetchInitialAlerts();

    // 2. Open the "live phone line" (WebSocket) to the backend
    const ws = new WebSocket('ws://127.0.0.1:8000/ws/alerts');

    ws.onopen = () => {
      console.log("WebSocket connection established.");
      setStatus("Live");
    };

    // 3. THIS IS THE MAGIC: What to do when a new alert arrives
    ws.onmessage = (event) => {
      console.log("Received new alert:", event.data);
      const newAlert = JSON.parse(event.data);
      
      // Add the new alert to the TOP of our list
      setAlerts(prevAlerts => [newAlert, ...prevAlerts]);
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed.");
      setStatus("Disconnected");
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setStatus("Connection Error");
    };

    // Cleanup function: Close the connection when the page is closed
    return () => {
      ws.close();
    };
  }, []); // The empty array ensures this effect runs only once

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
          <div>Timestamp</div>
          <div>User ID</div>
          <div>Location</div>
          <div>Alert Type</div>
        </div>
        
        {alerts.length === 0 ? (
          <div className="no-alerts">
            Waiting for alerts...
          </div>
        ) : (
          alerts.map((alert) => (
            <div key={alert.id} className="alert-grid data-row">
              <div><span className="alert-id-badge">{alert.id}</span></div>
              <div>{new Date(alert.timestamp).toLocaleString()}</div>
              <div>{alert.userId}</div>
              <div>{alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}</div>
              <div className="alert-type">{alert.alertType.replace('_', ' ').toUpperCase()}</div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}

export default App;