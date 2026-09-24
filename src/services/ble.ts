/**
 * BLE service for ISL Glove (ESP32 device).
 *
 * The ESP32 firmware is expected to advertise as "ISL_GLOVE" and expose
 * a characteristic that sends UTF-8 gesture strings via BLE notifications.
 *
 * Default UUIDs can be overridden by constants at the top of this file.
 * The service scans until it finds the target device name, connects, discovers
 * services, enables notifications on the gesture characteristic, and decodes
 * each notification payload as a UTF-8 string.
 */

import {
  BleManager,
  Device,
  Characteristic,
  State,
  BleError,
} from 'react-native-ble-plx';
import { Buffer } from 'buffer'; // available globally in RN via polyfill

// ─── Configuration ──────────────────────────────────────────────────────────
/** Advertised name of the ESP32 device */
export const TARGET_DEVICE_NAME = 'ISL_GLOVE';

/**
 * UUID of the GATT service that contains the gesture characteristic.
 * The ESP32 firmware must expose this service.
 * Change to match whatever the firmware declares.
 */
export const GESTURE_SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab';

/**
 * UUID of the characteristic that sends UTF-8 gesture strings.
 * Must have the NOTIFY property enabled on the ESP32 side.
 */
export const GESTURE_CHAR_UUID = '12345678-1234-1234-1234-1234567890cd';

// ─── Singleton BLE manager ───────────────────────────────────────────────────
let _manager: BleManager | null = null;

export function getBleManager(): BleManager {
  if (!_manager) {
    _manager = new BleManager();
  }
  return _manager;
}

export function destroyBleManager(): void {
  if (_manager) {
    _manager.destroy();
    _manager = null;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────
export type BleConnectionState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'discovering'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface GloveGesture {
  label: string;
  receivedAt: number; // epoch ms
}

export type GestureCallback = (gesture: GloveGesture) => void;
export type StateCallback = (state: BleConnectionState) => void;
export type ErrorCallback = (message: string) => void;

// ─── BLE session ─────────────────────────────────────────────────────────────
let _connectedDevice: Device | null = null;
let _gestureSubscription: ReturnType<Characteristic['monitor']> | null = null;
let _onGesture: GestureCallback | null = null;
let _onStateChange: StateCallback | null = null;
let _onError: ErrorCallback | null = null;

function emitState(state: BleConnectionState): void {
  _onStateChange?.(state);
}

function emitError(msg: string): void {
  _onError?.(msg);
}

/**
 * Decode a base-64 characteristic value to UTF-8 string.
 * react-native-ble-plx delivers characteristic values as base-64.
 */
function decodeGestureValue(base64Value: string | null): string | null {
  if (!base64Value) return null;
  try {
    const bytes = Buffer.from(base64Value, 'base64');
    return bytes.toString('utf8').trim();
  } catch {
    return null;
  }
}

// ─── Main connect flow ───────────────────────────────────────────────────────
/**
 * Start the full BLE flow:
 * scan -> connect -> discover -> subscribe.
 *
 * Resolves when a gesture notification subscription is active,
 * or rejects on hard failure.
 */
export async function connectToGlove(options: {
  onGesture: GestureCallback;
  onStateChange: StateCallback;
  onError: ErrorCallback;
  scanTimeoutMs?: number;
}): Promise<void> {
  _onGesture = options.onGesture;
  _onStateChange = options.onStateChange;
  _onError = options.onError;

  const manager = getBleManager();
  const scanTimeout = options.scanTimeoutMs ?? 15_000;

  // 1. Wait for BLE to be powered on
  emitState('scanning');

  const adapterState = await manager.state();
  if (adapterState !== State.PoweredOn) {
    // Wait for BT to come on (up to 6s)
    await new Promise<void>((resolve, reject) => {
      const sub = manager.onStateChange((s) => {
        if (s === State.PoweredOn) {
          sub.remove();
          resolve();
        } else if (
          s === State.PoweredOff ||
          s === State.Unauthorized ||
          s === State.Unsupported
        ) {
          sub.remove();
          reject(new Error(`Bluetooth is in state: ${s}`));
        }
      }, true);
      setTimeout(() => {
        sub.remove();
        reject(new Error('Bluetooth did not turn on in time.'));
      }, 6000);
    });
  }

  // 2. Scan for target device
  const device = await new Promise<Device>((resolve, reject) => {
    const timer = setTimeout(() => {
      manager.stopDeviceScan();
      reject(new Error(`Device "${TARGET_DEVICE_NAME}" not found after ${scanTimeout / 1000}s`));
    }, scanTimeout);

    manager.startDeviceScan(null, { allowDuplicates: false }, (err, scannedDevice) => {
      if (err) {
        clearTimeout(timer);
        manager.stopDeviceScan();
        reject(err);
        return;
      }
      if (
        scannedDevice &&
        (scannedDevice.name === TARGET_DEVICE_NAME ||
          scannedDevice.localName === TARGET_DEVICE_NAME)
      ) {
        clearTimeout(timer);
        manager.stopDeviceScan();
        resolve(scannedDevice);
      }
    });
  });

  // 3. Connect
  emitState('connecting');
  const connected = await device.connect({ autoConnect: false });

  // 4. Discover services & characteristics
  emitState('discovering');
  const discovered = await connected.discoverAllServicesAndCharacteristics();

  // 5. Subscribe to gesture characteristic
  emitState('connected');
  _connectedDevice = discovered;

  // Monitor disconnection
  _connectedDevice.onDisconnected((_err: BleError | null, _dev: Device | null) => {
    _connectedDevice = null;
    _gestureSubscription = null;
    emitState('disconnected');
  });

  _gestureSubscription = discovered.monitorCharacteristicForService(
    GESTURE_SERVICE_UUID,
    GESTURE_CHAR_UUID,
    (err: BleError | null, characteristic: Characteristic | null) => {
      if (err) {
        // Ignore subscription cancel errors (happen on intentional disconnect)
        if (err.errorCode !== 2) {
          emitError(`BLE notification error: ${err.message}`);
        }
        return;
      }
      if (characteristic?.value) {
        const label = decodeGestureValue(characteristic.value);
        if (label) {
          _onGesture?.({ label, receivedAt: Date.now() });
        }
      }
    },
  );
}

/**
 * Disconnect from the glove and clean up subscriptions.
 */
export async function disconnectGlove(): Promise<void> {
  _gestureSubscription?.remove();
  _gestureSubscription = null;

  if (_connectedDevice) {
    try {
      await _connectedDevice.cancelConnection();
    } catch {
      // Already disconnected -- ignore
    }
    _connectedDevice = null;
  }

  emitState('disconnected');
}

/**
 * Whether there is currently an active device connection.
 */
export function isGloveConnected(): boolean {
  return _connectedDevice !== null;
}
