import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { accelerometer, gyroscope } from 'react-native-sensors';
import { Subscription } from 'rxjs';

// The different states our app can be in
type AppStatus = 'initializing' | 'monitoring' | 'permission_denied';

const App = () => {
  // Single state to manage the app's status
  const [status, setStatus] = useState<AppStatus>('initializing');

  useEffect(() => {
    // This effect runs only once when the app starts
    let accelSubscription: Subscription | null = null;
    let gyroSubscription: Subscription | null = null;

    const initializeApp = async () => {
      // For Android, sensor permissions are usually granted by default.
      // For iOS, they must be in Info.plist. This check is for future-proofing.
      if (Platform.OS === 'android') {
        console.log('Android platform detected. Assuming sensor access.');
      }
      
      console.log('Attempting to subscribe to sensors...');
      
      try {
        // Subscribe to the sensors
        accelSubscription = accelerometer.subscribe(({ x, y, z }) => {
          // In a real app, we'd analyze this data
        });

        gyroSubscription = gyroscope.subscribe(({ x, y, z }) => {
          // In a real app, we'd analyze this data
        });

        // If subscriptions succeed, we are ready to monitor
        console.log('Successfully subscribed to sensors. Ready to monitor.');
        setStatus('monitoring');

      } catch (error) {
        console.error('Failed to subscribe to sensors:', error);
        setStatus('permission_denied');
      }
    };

    initializeApp();

    // This is the cleanup function. It runs when the app closes.
    return () => {
      accelSubscription?.unsubscribe();
      gyroSubscription?.unsubscribe();
      console.log('Sensor subscriptions stopped.');
    };
  }, []); // The empty array [] means this useEffect runs only once.

  const simulateCrash = async () => {
    console.log('Simulating a crash event...');
    try {
      // The IP '10.0.2.2' is a special address for the emulator to reach the host machine (your laptop)
      const response = await fetch('http://10.0.2.2:8000/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user-gm',
          location: { latitude: 34.0522, longitude: -118.2437 },
          alertType: 'crash_simulation',
        }),
      });
      if (response.ok) {
        const result = await response.json();
        console.log('SUCCESS: Alert sent to backend:', result);
      } else {
        const errorText = await response.text();
        console.error('ERROR: Failed to send alert. Server responded with:', response.status, errorText);
      }
    } catch (error) {
      console.error('FATAL: Network error while trying to send alert:', error);
    }
  };

  // Render different UI based on the app's status
  const renderContent = () => {
    switch (status) {
      case 'initializing':
        return (
          <>
            <Text style={styles.statusText}>Initializing Sensors...</Text>
            <ActivityIndicator size="large" color="#4CAF50" />
          </>
        );
      case 'monitoring':
        return (
          <>
            <Text style={styles.statusText}>Monitoring for accidents...</Text>
            <TouchableOpacity style={styles.button} onPress={simulateCrash}>
              <Text style={styles.buttonText}>Simulate Crash</Text>
            </TouchableOpacity>
          </>
        );
      case 'permission_denied':
        return <Text style={styles.statusText}>Error: Could not access sensors.</Text>;
      default:
        return <Text style={styles.statusText}>Unknown state.</Text>;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Community Guardian</Text>
      </View>
      <View style={styles.content}>{renderContent()}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: { padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#333' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  statusText: { fontSize: 18, color: '#AAAAAA', marginBottom: 20, textAlign: 'center' },
  button: { backgroundColor: '#B71C1C', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 30, marginTop: 20, elevation: 5 },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
});

export default App;