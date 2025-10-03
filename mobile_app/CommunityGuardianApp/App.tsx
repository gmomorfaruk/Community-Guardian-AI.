import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  Alert,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Linking, // <-- NEW IMPORT
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation, { GeoPosition } from 'react-native-geolocation-service';
import { NavigationContainer, RouteProp } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';

import BackgroundJob from 'react-native-background-actions';
import haversine from 'haversine-distance';

// --- TYPE DEFINITIONS ---
type AlertType = 'SOS' | 'CRASH_SIMULATION' | 'GEOFENCE_BREACH';
type RootStackParamList = { Monitoring: undefined; Countdown: { alertType: Exclude<AlertType, 'GEOFENCE_BREACH'>; freshPosition: GeoPosition }; };
type MonitoringScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Monitoring'>;
type CountdownScreenRouteProp = RouteProp<RootStackParamList, 'Countdown'>;
type HomeLocation = { latitude: number; longitude: number; };

// --- SERVER CONFIG ---
const SERVER_IP = '192.168.0.107'; // <-- IMPORTANT: Make sure this is your computer's IP
const SERVER_URL = `http://${SERVER_IP}:8000/sos`;

// --- PERMISSION FUNCTION ---
const requestLocationPermission = async () => {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: "Location Permission",
          message: "This app needs access to your location.",
          buttonPositive: "OK"
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn(err);
      return false;
    }
  }
  return true;
};

// --- UNIVERSAL ALERT SENDER ---
const sendAlert = async (alertType: AlertType, position: GeoPosition, userName: string) => {
  const payload = {
    userName: userName,
    location: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      speed: position.coords.speed,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    },
    alertType: alertType,
  };
  try {
    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorText = await response.text();
      if (alertType !== 'GEOFENCE_BREACH') {
        Alert.alert('Failed to Send Alert', `Server responded with an error: ${errorText}`);
      }
    }
  } catch (error) {
    if (alertType !== 'GEOFENCE_BREACH') {
        Alert.alert('Network Error', 'Could not connect to the server.');
    }
  }
};

// --- A "Promisified" function to get location. ---
const getCurrentPositionAsync = (): Promise<GeoPosition> => {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        (position) => resolve(position),
        (error) => reject(error),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });
  };
  
// --- BACKGROUND TASK ---
const sleep = (time: number) => new Promise<void>(resolve => setTimeout(() => resolve(), time));

const backgroundTask = async (taskData: any) => {
    const { delay } = taskData;
    console.log('Background task started.');
  
    for (let i = 0; BackgroundJob.isRunning(); i++) {
      try {
        const userName = await AsyncStorage.getItem('userName') || 'Unknown User';
        const homeLocationJson = await AsyncStorage.getItem('homeLocation');
        const radiusKmJson = await AsyncStorage.getItem('safeRadiusKm');
  
        if (homeLocationJson && radiusKmJson) {
          const homeLocation: HomeLocation = JSON.parse(homeLocationJson);
          const radiusMeters = parseFloat(radiusKmJson) * 1000;
          
          console.log('BG Task: Checking location...');
          const position = await getCurrentPositionAsync();
          
          const currentPosition = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          const distance = haversine(homeLocation, currentPosition);
          
          const taskDesc = `Monitoring... Distance: ${Math.round(distance)}m / ${radiusMeters}m`;
          console.log(`BG Task: ${taskDesc}`);
          await BackgroundJob.updateNotification({ taskDesc });
  
          if (distance > radiusMeters) {
            console.log('BG Task: Geofence breached! Sending alert.');
            await sendAlert('GEOFENCE_BREACH', position, userName);
            await BackgroundJob.stop();
            console.log('BG Task: Stopped after sending alert.');
            break; 
          }
        } else {
          console.log('BG Task: Home location or radius not set. Skipping check.');
        }
      } catch (error) {
        console.error("BACKGROUND_TASK_ERROR", error);
      }
      console.log(`BG Task: Sleeping for ${delay / 1000} seconds...`);
      await sleep(delay);
    }
    console.log('Background task finished.');
};
  
// --- UPDATED BACKGROUND OPTIONS ---
const backgroundOptions = {
    taskName: 'CommunityGuardianTrip',
    taskTitle: 'Trip Monitoring Active',
    taskDesc: 'Checking your location to keep you safe...',
    taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
    },
    color: '#ff00ff',
    linkingURI: 'communityguardian://',
    parameters: {
        delay: 60000,
    },
    channelId: 'CommunityGuardianChannel',
    channelName: 'Trip Monitoring',
};

// --- MAIN APP COMPONENT ---
function App(): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [inputName, setInputName] = useState('');

  useEffect(() => {
    const loadUserName = async () => {
      try {
        const storedName = await AsyncStorage.getItem('userName');
        setUserName(storedName);
      } catch (e) { console.error("Failed to load user name.", e); }
      finally { setIsLoading(false); }
    };
    loadUserName();
  }, []);

  const handleSaveName = async () => {
    if (inputName.trim().length > 0) {
      try {
        await AsyncStorage.setItem('userName', inputName.trim());
        setUserName(inputName.trim());
      } catch (e) { Alert.alert("Error", "Could not save your name."); }
    } else { Alert.alert("Invalid Name", "Please enter a valid name."); }
  };

  if (isLoading) { return <View style={styles.centered}><ActivityIndicator size="large" /></View>; }

  if (!userName) {
    return (
      <SafeAreaView style={styles.setupContainer}>
        <Text style={styles.setupTitle}>Welcome!</Text>
        <Text style={styles.setupSubtitle}>Please enter your name to continue.</Text>
        <TextInput style={styles.input} placeholder="Your Name" value={inputName} onChangeText={setInputName} />
        <TouchableOpacity style={styles.utilityButton} onPress={handleSaveName}><Text style={styles.utilityButtonText}>Save and Continue</Text></TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator>
        <RootStack.Screen name="Monitoring">
          {(props) => <MonitoringScreen {...props} userName={userName} />}
        </RootStack.Screen>
        <RootStack.Screen name="Countdown" component={CountdownScreen} options={{ title: 'Alerting...' }} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

// --- SCREEN COMPONENTS ---
const MonitoringScreen = ({ navigation, userName }: { navigation: MonitoringScreenNavigationProp; userName: string }) => {
    const [isMonitoring, setIsMonitoring] = useState(BackgroundJob.isRunning());
    const [homeLocation, setHomeLocation] = useState<HomeLocation | null>(null);
    const [radius, setRadius] = useState('5');
  
    useEffect(() => {
      const loadSettings = async () => {
        const homeJson = await AsyncStorage.getItem('homeLocation');
        if (homeJson) setHomeLocation(JSON.parse(homeJson));
        const radiusJson = await AsyncStorage.getItem('safeRadiusKm');
        if (radiusJson) setRadius(radiusJson);
      };
      loadSettings();
    }, []);
  
    const handleSetHome = () => {
        requestLocationPermission().then(granted => {
          if (granted) {
            Geolocation.getCurrentPosition(
              async (position) => {
                const newHome = {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                };
                await AsyncStorage.setItem('homeLocation', JSON.stringify(newHome));
                setHomeLocation(newHome);
                Alert.alert("Home Set", `Your home location has been set to your current position.`);
              },
              (error) => { Alert.alert("Location Error", error.message); },
              { enableHighAccuracy: true, maximumAge: 0 }
            );
          }
        });
    };
  
    // --- FULLY UPDATED handleStartMonitoring FUNCTION ---
    const handleStartMonitoring = async () => {
        if (!homeLocation) {
            Alert.alert("Error", "Please set a home location first.");
            return;
        }
    
        const hasLocationPermission = await requestLocationPermission();
        if (!hasLocationPermission) {
            Alert.alert("Permission Denied", "Location permission is required to start monitoring.");
            return;
        }
    
        if (Platform.OS === 'android' && Platform.Version >= 29) {
            const backgroundPermission = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
            );
    
            if (backgroundPermission !== PermissionsAndroid.RESULTS.GRANTED) {
                Alert.alert(
                    "Background Location Required",
                    "This feature needs 'Allow all the time' location access to work correctly. Please tap 'Open Settings' and change the location permission for this app to 'Allow all the time'.",
                    [
                        { text: "Cancel", style: "cancel" },
                        { text: "Open Settings", onPress: () => Linking.openSettings() }
                    ]
                );
                return;
            }
        }
    
        if (Platform.OS === 'android' && Platform.Version >= 33) {
            const notificationPermission = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
            );
            if (notificationPermission !== PermissionsAndroid.RESULTS.GRANTED) {
                Alert.alert("Permission Denied", "The monitoring service cannot start without notification permission.");
                return;
            }
        }
    
        try {
            console.log('All permissions granted. Starting background job...');
            await AsyncStorage.setItem('safeRadiusKm', radius);
            await BackgroundJob.start(backgroundTask, backgroundOptions);
            setIsMonitoring(true);
            Alert.alert("Monitoring Started", "We will now monitor your location. You can close the app.");
            console.log('Background job started successfully.');
        } catch (e) {
            console.error("Failed to start background job", e);
            Alert.alert("Error", "Could not start the background monitoring service.");
        }
    };

    const handleStopMonitoring = async () => {
      console.log('Stopping background job...');
      await BackgroundJob.stop();
      setIsMonitoring(false);
      Alert.alert("Monitoring Stopped", "Background location tracking has been stopped.");
      console.log('Background job stopped successfully.');
    };
  
    const handleManualAlert = (alertType: 'SOS' | 'CRASH_SIMULATION') => {
      requestLocationPermission().then(granted => {
        if (granted) {
          Geolocation.getCurrentPosition(
            (position) => {
              navigation.navigate('Countdown', { alertType, freshPosition: position });
            },
            (error) => { Alert.alert("Location Error", error.message); },
            { enableHighAccuracy: true, maximumAge: 0 }
          );
        }
      });
    };
  
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Manual Alerts</Text>
            <View style={styles.buttonContainer}>
              <TouchableOpacity style={styles.sosButton} onPress={() => handleManualAlert('SOS')}><Text style={styles.buttonText}>SOS</Text></TouchableOpacity>
              <TouchableOpacity style={styles.crashButton} onPress={() => handleManualAlert('CRASH_SIMULATION')}><Text style={styles.buttonText}>Simulate Crash</Text></TouchableOpacity>
            </View>
          </View>
  
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trip Monitoring (Geofence)</Text>
            <Text style={styles.locationText}>
                Home: {homeLocation ? `${homeLocation.latitude.toFixed(3)}, ${homeLocation.longitude.toFixed(3)}` : 'Not Set'}
            </Text>
            <TouchableOpacity style={styles.utilityButton} onPress={handleSetHome}>
                <Text style={styles.utilityButtonText}>Set Current Location as Home</Text>
            </TouchableOpacity>
            <View style={styles.radiusContainer}>
                <Text>Safe Radius (km):</Text>
                <TextInput
                style={styles.input}
                value={radius}
                onChangeText={setRadius}
                keyboardType="numeric"
                />
            </View>
            {isMonitoring ? (
                <TouchableOpacity style={[styles.monitorButton, styles.stopButton]} onPress={handleStopMonitoring}>
                <Text style={styles.monitorButtonText}>Stop Monitoring</Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity style={[styles.monitorButton, styles.startButton]} onPress={handleStartMonitoring}>
                <Text style={styles.monitorButtonText}>Start Monitoring</Text>
                </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
};
  
const CountdownScreen = ({ route }: { route: CountdownScreenRouteProp }) => {
    const { alertType, freshPosition } = route.params;
    const [countdown, setCountdown] = useState(15);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
    useEffect(() => {
      const performSend = async () => {
          const storedUserName = await AsyncStorage.getItem('userName');
          if (storedUserName) {
              await sendAlert(alertType, freshPosition, storedUserName);
              Alert.alert('Alert Sent', 'Your alert has been successfully sent.');
          } else {
              Alert.alert('Critical Error', 'Could not find user name to send alert.');
          }
      };
  
      if (countdown === 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        performSend();
      }
    }, [countdown]);
  
    useEffect(() => {
      timerRef.current = setInterval(() => setCountdown(prev => prev - 1), 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);
  
    return (
      <View style={styles.centered}>
        <Text style={styles.countdownText}>{countdown}</Text>
        <Text>Sending {alertType.replace('_', ' ')} alert...</Text>
      </View>
    );
};

// --- STYLES ---
const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { padding: 20 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    section: { marginBottom: 30, padding: 15, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, },
    sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
    buttonContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', width: '100%' },
    sosButton: { backgroundColor: 'red', padding: 20, borderRadius: 100, width: 100, height: 100, justifyContent: 'center', alignItems: 'center' },
    crashButton: { backgroundColor: 'orange', padding: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 18, textAlign: 'center' },
    locationText: { fontSize: 16, marginBottom: 10, color: '#555' },
    utilityButton: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 15 },
    utilityButtonText: { fontSize: 16, color: 'white', fontWeight: 'bold' },
    radiusContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    input: { height: 40, borderColor: 'gray', borderWidth: 1, borderRadius: 5, paddingHorizontal: 10, marginLeft: 10, flex: 1, },
    monitorButton: { padding: 20, borderRadius: 10, alignItems: 'center' },
    startButton: { backgroundColor: 'green' },
    stopButton: { backgroundColor: 'darkred' },
    monitorButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    countdownText: { fontSize: 80, fontWeight: 'bold' },
    setupContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    setupTitle: { fontSize: 32, fontWeight: 'bold', marginBottom: 10 },
    setupSubtitle: { fontSize: 18, color: 'gray', marginBottom: 20, textAlign: 'center' },
});

const RootStack = createNativeStackNavigator<RootStackParamList>();

export default App;