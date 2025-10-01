import { useState, useEffect } from 'react';
import { accelerometer, gyroscope } from 'react-native-sensors';
import { setUpdateIntervalForType, SensorTypes } from 'react-native-sensors';

// --- Tuning Parameters ---
const IMPACT_THRESHOLD = 25; // High G-force spike (m/s^2)
const TUMBLE_THRESHOLD = 8; // High rotation rate (rad/s)
const STILLNESS_THRESHOLD = 0.5; // Low rotation rate (rad/s)
const STILLNESS_DURATION = 2000; // Must be still for 2 seconds (ms)

// Set sensor speed
setUpdateIntervalForType(SensorTypes.accelerometer, 100); // 10 times per second
setUpdateIntervalForType(SensorTypes.gyroscope, 100);

export const useCrashDetection = () => {
    const [isCrashDetected, setCrashDetected] = useState(false);
    const [stage, setStage] = useState('monitoring'); // monitoring -> impact -> tumbling -> stillness
    const [stillnessTimer, setStillnessTimer] = useState(null);

    useEffect(() => {
        // --- Stage 1: Listen for Impact ---
        const accelSubscription = accelerometer.subscribe(({ x, y, z }) => {
            const magnitude = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
            if (stage === 'monitoring' && magnitude > IMPACT_THRESHOLD) {
                console.log(`💥 IMPACT DETECTED! G-force: ${magnitude.toFixed(2)}`);
                setStage('impact');
            }
        });

        // --- Stages 2 & 3: Listen for Tumbling and Stillness ---
        const gyroSubscription = gyroscope.subscribe(({ x, y, z }) => {
            const magnitude = Math.sqrt(x ** 2 + y ** 2 + z ** 2);

            // Stage 2: After impact, look for tumbling
            if (stage === 'impact' && magnitude > TUMBLE_THRESHOLD) {
                console.log(`🤸 TUMBLING DETECTED! Rotation: ${magnitude.toFixed(2)}`);
                setStage('tumbling');
            }

            // Stage 3: After tumbling, look for stillness
            if (stage === 'tumbling') {
                if (magnitude < STILLNESS_THRESHOLD) {
                    // We are still, start the timer
                    if (!stillnessTimer) {
                        console.log('Vehicle appears to be still. Starting 2-second timer...');
                        const timer = setTimeout(() => {
                            console.log('✅ CRASH CONFIRMED! Vehicle has been still for 2 seconds.');
                            setCrashDetected(true); // TRIGGER THE ALERT!
                            setStage('monitoring'); // Reset for next time
                        }, STILLNESS_DURATION);
                        setStillnessTimer(timer);
                    }
                } else {
                    // We are moving again, cancel the timer
                    if (stillnessTimer) {
                        console.log('Vehicle moved, false alarm. Resetting timer.');
                        clearTimeout(stillnessTimer);
                        setStillnessTimer(null);
                    }
                }
            }
        });

        return () => {
            accelSubscription.unsubscribe();
            gyroSubscription.unsubscribe();
            if (stillnessTimer) clearTimeout(stillnessTimer);
        };
    }, [stage, stillnessTimer]);

    return { isCrashDetected, setCrashDetected };
};