// Fährten-Simulator (T-210): Matrixgruppe "androidlegen". Läuft nur mit FAEHRTEN_SIM=full (oder FAEHRTEN_SIM=androidlegen).
import { defineMatrixGroupTest } from './matrixTestSupport';

jest.mock('../../utils/trackingEngineMode', () => ({ getTrackingEngineMode: () => 'current' }));
jest.mock('../../utils/backgroundLayDiagnostics', () => ({ recordBackgroundLayEvent: jest.fn(async () => {}) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) }));

defineMatrixGroupTest('androidlegen');
