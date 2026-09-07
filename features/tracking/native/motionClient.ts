// Dünner Client über die native Motion-Bridge (modules/anyvo-motion). Bündelt
// Start/Stop, Status und Event-Listener an einer Stelle, damit Engine/Hooks
// nicht direkt ins Modul greifen. Dasselbe Muster wie precisionLocationClient.
import {
  isMotionModuleAvailable, isMotionAvailable, getMotionStatus,
  startMotionUpdates, stopMotionUpdates,
  addMotionSampleListener, addMotionErrorListener,
} from '@/modules/anyvo-motion';

export const motionClient = {
  isModuleAvailable: isMotionModuleAvailable,
  isAvailable:       isMotionAvailable,
  getStatus:         getMotionStatus,
  start:             startMotionUpdates,
  stop:              stopMotionUpdates,
  onSample:          addMotionSampleListener,
  onError:           addMotionErrorListener,
};

export type MotionClient = typeof motionClient;
