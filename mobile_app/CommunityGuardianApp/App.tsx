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
  StatusBar,
  Linking, // <-- IMPORTANT: We are now using the built-in Linking API
} from 'react-native';
import { accelerometer, gyroscope } from 'react-native-sensors';
import { Subscription } from 'rxjs';
import Geolocation, { GeoPosition } from 'react-native-geolocation-service';
import { NavigationContainer, useNavigation, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';

// --- TYPE DEFINITIONS ---
type RootStackParamList = {
  Monitoring: undefined;
  Countdown: { alertType: AlertType };
};
type AppStatus = 'initializing' | 'monitoring' | 'permission_denied';
type LocationStatus = 'waiting' | 'acquiring' | 'ready' | 'denied' | 'error';
type AlertType = 'crash_simulation' | 'sos';
type MonitoringScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Monitoring'>;

// --- GLOBAL STATE & FUNCTIONS ---
let globalCurrentLocation: GeoPosition | null = null;
const sendAlert = async (alertType: AlertType): Promise<boolean> => {
    if (!globalCurrentLocation) {
      console.log("Cannot send alert: Location not available.");
      return false;
    }
    console.log(`Sending ${alertType} alert...`);

    try {
      const response = await fetch('http://10.0.2.2:8000/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user-gm',
          location: {
            latitude: globalCurrentLocation.coords.latitude,
            longitude: globalCurrentLocation.coords.longitude,
            speed: globalCurrentLocation.coords.speed,
            accuracy: globalCurrentLocation.coords.accuracy,
            timestamp: globalCurrentLocation.timestamp,
          },
          alertType: alertType,
        }),
      });

      if (response.ok) {
        console.log('SUCCESS: Alert sent to backend.');
        return true;
      } else {
        const errorText = await response.text();
        console.error('ERROR: Failed to send alert. Server responded with:', response.status, errorText);
        return false;
      }
    } catch (error) {
      console.error('FATAL: Network error while trying to send alert:', error);
      return false;
    }
};

// --- COUNTDOWN SCREEN COMPONENT ---
const CountdownScreen = () => {
    const navigation = useNavigation<MonitoringScreenNavigationProp>();
    const route = useRoute();
    const { alertType } = route.params as { alertType: AlertType };
    const [counter, setCounter] = useState(15);
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        if (counter > 0) {
            const timer = setTimeout(() => setCounter(counter - 1), 1000);
            return () => clearTimeout(timer);
        } else if (!isSending) {
            setIsSending(true);
            
            sendAlert(alertType).then((success) => {
                if (success) {
                    console.log("Contacting emergency services and contacts...");
                    
                    const ambulanceNumber = '911'; 
                    const emergencyContacts = ['1234567890', '0987654321'];
                    
                    const locationURL = `https://www.google.com/maps/search/?api=1&query=${globalCurrentLocation?.coords.latitude},${globalCurrentLocation?.coords.longitude}`;
                    const message = `EMERGENCY! An alert has been triggered for user-gm via Community Guardian. Last known location: ${locationURL}`;

                    // --- NEW, MODERN WAY TO CALL AND TEXT ---
                    // Make the phone call
                    Linking.openURL(`tel:${ambulanceNumber}`);

                    // Send one SMS to all contacts (most phones support this)
                    const recipients = emergencyContacts.join(',');
                    Linking.openURL(`sms:${recipients}?body=${encodeURIComponent(message)}`);
                }
                
                navigation.goBack();
            });
        }
    }, [counter, navigation, alertType, isSending]);

    const handleCancel = () => {
        console.log("Alert cancelled by user.");
        navigation.goBack();
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                {isSending ? (
                    <>
                        <ActivityIndicator size={80} color="#58A6FF" />
                        <Text style={styles.countdownStatusText}>SENDING ALERT & NOTIFYING CONTACTS...</Text>
                    </>
                ) : (
                    <>
                        <Text style={styles.countdownStatusText}>EMERGENCY ALERT IN:</Text>
                        <Text style={styles.countdownText}>{counter}</Text>
                        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                            <Text style={styles.cancelButtonText}>CANCEL</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </SafeAreaView>
    );
};

// --- MONITORING SCREEN COMPONENT ---
const MonitoringScreen = () => {
  const navigation = useNavigation<MonitoringScreenNavigationProp>();
  const [appStatus, setAppStatus] = useState<AppStatus>('initializing');
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('waiting');

  useEffect(() => {
    let accelSub: Subscription | null = null;
    let gyroSub: Subscription | null = null;
    let locationWatcherId: number | null = null;

    const initialize = async () => {
      setAppStatus('initializing');
      const hasLocationPermission = await requestLocationPermission();

      if (!hasLocationPermission) {
        setLocationStatus('denied');
        setAppStatus('permission_denied');
        return;
      }

      setLocationStatus('acquiring');
      locationWatcherId = Geolocation.watchPosition(
        (position) => {
          globalCurrentLocation = position; 
          setLocationStatus('ready');
          setAppStatus('monitoring');
        },
        (error) => {
          console.error("Location Error:", error);
          setLocationStatus('error');
          setAppStatus('permission_denied');
        },
        { enableHighAccuracy: true, distanceFilter: 10, interval: 5000, fastestInterval: 2000 }
      );

      try {
        accelSub = accelerometer.subscribe(() => {});
        gyroSub = gyroscope.subscribe(() => {});
      } catch (error) {
        console.error('Failed to subscribe to sensors:', error);
        setAppStatus('permission_denied');
      }
    };

    initialize();

    return () => {
      accelSub?.unsubscribe();
      gyroSub?.unsubscribe();
      if (locationWatcherId !== null) Geolocation.clearWatch(locationWatcherId);
    };
  }, []);

  const requestLocationPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) { return false; }
    }
    return true;
  };

  const handleAlertTrigger = (alertType: AlertType) => {
    if (locationStatus !== 'ready') {
        console.log("Cannot trigger alert: GPS not ready.");
        return;
    }
    navigation.navigate('Countdown', { alertType });
  };

  const renderStatusPill = () => {
    let text = 'Initializing...'; let color = '#FFA000';
    if (locationStatus === 'ready') { text = 'GPS Lock Acquired'; color = '#388E3C'; }
    else if (locationStatus === 'acquiring') { text = 'Acquiring GPS Signal...'; color = '#FFA000'; }
    else if (locationStatus === 'denied') { text = 'GPS Permission Denied'; color = '#D32F2F'; }
    else if (locationStatus === 'error') { text = 'GPS Error'; color = '#D32F2F'; }
    return <View style={[styles.statusPill, { backgroundColor: color }]}><Text style={styles.statusPillText}>{text}</Text></View>;
  };

  const renderContent = () => {
    if (appStatus === 'permission_denied') {
      return (
        <View style={styles.centeredContent}>
          <Text style={styles.mainStatusText}>Permission Required</Text>
          <Text style={styles.subStatusText}>Guardian requires location access. Please grant permission in settings.</Text>
          <TouchableOpacity style={styles.settingsButton} onPress={() => Linking.openSettings()}><Text style={styles.settingsButtonText}>Open Settings</Text></TouchableOpacity>
        </View>
      );
    }
    if (appStatus === 'initializing' || locationStatus !== 'ready') {
      return (
        <View style={styles.centeredContent}>
            <ActivityIndicator size={80} color="#4FC3F7" />
            <Text style={styles.mainStatusText}>Calibrating Systems...</Text>
            <Text style={styles.subStatusText}>Establishing secure connection and GPS lock.</Text>
        </View>
      );
    }
    return (
      <>
        <View style={styles.monitoringHeader}><Text style={styles.mainStatusText}>System Active</Text><Text style={styles.subStatusText}>Monitoring for potential incidents.</Text></View>
        <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.sosButton} onPress={() => handleAlertTrigger('sos')}><Text style={styles.sosButtonText}>SOS</Text></TouchableOpacity>
            <Text style={styles.buttonLabel}>Manual Alert</Text>
        </View>
        <TouchableOpacity style={styles.testButton} onPress={() => handleAlertTrigger('crash_simulation')}><Text style={styles.testButtonText}>Simulate Crash</Text></TouchableOpacity>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D1117" />
      <View style={styles.header}><Text style={styles.title}>COMMUNITY GUARDIAN</Text>{renderStatusPill()}</View>
      <View style={styles.content}>{renderContent()}</View>
    </SafeAreaView>
  );
};

// --- APP CONTAINER & NAVIGATION ---
const Stack = createNativeStackNavigator<RootStackParamList>();
const App = () => { // <-- THE PERIOD IS GONE!
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="Monitoring" component={MonitoringScreen} />
        <Stack.Screen name="Countdown" component={CountdownScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

// --- STYLESHEET ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1117' },
  header: { paddingVertical: 15, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#30363D', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#C9D1D9', letterSpacing: 2, marginBottom: 10 },
  statusPill: { borderRadius: 15, paddingVertical: 4, paddingHorizontal: 12 },
  statusPillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  content: { flex: 1, justifyContent: 'space-around', alignItems: 'center', padding: 20 },
  centeredContent: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, flex: 1 },
  mainStatusText: { fontSize: 28, fontWeight: '600', color: '#F0F6FC', textAlign: 'center', marginBottom: 10 },
  subStatusText: { fontSize: 16, color: '#8B949E', textAlign: 'center', lineHeight: 24 },
  monitoringHeader: { alignItems: 'center' },
  buttonContainer: { alignItems: 'center' },
  sosButton: { width: 180, height: 180, borderRadius: 90, backgroundColor: '#DA3633', justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: 'rgba(218, 54, 51, 0.3)', elevation: 10, shadowColor: '#DA3633', shadowOpacity: 0.5, shadowRadius: 15 },
  sosButtonText: { fontSize: 50, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: 2 },
  buttonLabel: { fontSize: 16, color: '#8B949E', marginTop: 15, fontWeight: '600' },
  testButton: { backgroundColor: '#21262D', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 10, borderWidth: 1, borderColor: '#30363D' },
  testButtonText: { color: '#58A6FF', fontSize: 16, fontWeight: 'bold' },
  settingsButton: { marginTop: 30, backgroundColor: '#58A6FF', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 10 },
  settingsButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  // Countdown Screen Styles
  countdownStatusText: { fontSize: 24, color: '#8B949E', fontWeight: '600', marginBottom: 20, textAlign: 'center' },
  countdownText: { fontSize: 120, fontWeight: 'bold', color: '#F0F6FC', marginBottom: 40 },
  cancelButton: { width: '80%', backgroundColor: '#388E3C', paddingVertical: 20, borderRadius: 15, justifyContent: 'center', alignItems: 'center', elevation: 8 },
  cancelButtonText: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: 2 },
});

export default App;