/**
 * useBLE hook
 *
 * Manages the full BLE lifecycle for the ISL Glove:
 *   - Requests Android runtime permissions (BLUETOOTH_SCAN, BLUETOOTH_CONNECT,
 *     ACCESS_FINE_LOCATION) before every connect attempt.
 *   - Delegates the actual BLE work to the ble service.
 *   - Exposes connection state, the latest gesture, and error messages.
 *   - Auto-reconnects are NOT done intentionally; the user triggers connect/disconnect.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import {
  connectToGlove,
  disconnectGlove,
  BleConnectionState,
  GloveGesture,
} from '../services/ble';

// ─── Types ─────────────────────────────────────────────────────────────────
export interface BLEState {
  /** Current BLE connection stage */
  connectionState: BleConnectionState;
  /** Last gesture received from the glove */
  latestGesture: GloveGesture | null;
  /** Human-readable error, cleared on next connect attempt */
  bleError: string | null;
  /** True while a connect attempt is in progress */
  isConnecting: boolean;
}

export interface BLEActions {
  /** Start scanning and connecting to ISL_GLOVE */
  startConnection: () => Promise<void>;
  /** Gracefully disconnect from the glove */
  stopConnection: () => Promise<void>;
}

// ─── Permission helper ──────────────────────────────────────────────────────
async function requestAndroidBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const apiLevel = Platform.Version as number;

  if (apiLevel >= 31) {
    // Android 12+ needs BLUETOOTH_SCAN + BLUETOOTH_CONNECT
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return (
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
      results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
    );
  } else {
    // Android 6-11 needs ACCESS_FINE_LOCATION to scan BLE
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location permission for Bluetooth',
        message:
          'Mitzy needs location permission to scan for the ISL glove via Bluetooth.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Deny',
        buttonPositive: 'Allow',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────
export function useBLE(onNewGesture: (gesture: GloveGesture) => void): BLEState & BLEActions {
  const [connectionState, setConnectionState] = useState<BleConnectionState>('idle');
  const [latestGesture, setLatestGesture] = useState<GloveGesture | null>(null);
  const [bleError, setBleError] = useState<string | null>(null);

  // Keep a stable ref to the gesture callback so we don't re-subscribe on every render
  const onNewGestureRef = useRef(onNewGesture);
  useEffect(() => {
    onNewGestureRef.current = onNewGesture;
  }, [onNewGesture]);

  const isConnecting =
    connectionState === 'scanning' ||
    connectionState === 'connecting' ||
    connectionState === 'discovering';

  const startConnection = useCallback(async () => {
    setBleError(null);
    setConnectionState('scanning');

    const granted = await requestAndroidBlePermissions();
    if (!granted) {
      setBleError('Bluetooth permissions were denied. Please grant them in Settings.');
      setConnectionState('error');
      return;
    }

    try {
      await connectToGlove({
        onStateChange: (state) => setConnectionState(state),
        onGesture: (gesture) => {
          setLatestGesture(gesture);
          onNewGestureRef.current(gesture);
        },
        onError: (message) => {
          setBleError(message);
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setBleError(message);
      setConnectionState('disconnected');
    }
  }, []);

  const stopConnection = useCallback(async () => {
    await disconnectGlove();
    setConnectionState('disconnected');
    setLatestGesture(null);
    setBleError(null);
  }, []);

  return {
    connectionState,
    latestGesture,
    bleError,
    isConnecting,
    startConnection,
    stopConnection,
  };
}
