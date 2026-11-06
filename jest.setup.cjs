/* global jest, afterAll */
// SDK 58: native gesture-handler and Worklets 0.13 code cannot initialize under
// Jest. Use the packages' official test mocks before test modules load.
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// Gesture Handler 3 enforces GestureHandlerRootView in development. Unit tests
// render individual components, so the detector becomes a transparent wrapper.
const gestureDetectorMock = () => {
  const React = require('react');
  return { GestureDetector: ({ children }) => React.createElement(React.Fragment, null, children) };
};
jest.mock('react-native-gesture-handler/src/v3/detectors/GestureDetector', gestureDetectorMock);
jest.mock('react-native-gesture-handler/lib/module/v3/detectors/GestureDetector', gestureDetectorMock);

// Expo installs lazy WinterCG globals. Resolve the fetch getter while Jest is
// still inside the test scope so Node-based suites do not require it during
// environment teardown (Jest 30 + SDK 58).
afterAll(() => {
  for (const name of [
    'TextDecoderStream', 'TextEncoderStream', 'URL', 'URLSearchParams',
    'DOMException', '__ExpoImportMetaRegistry', 'structuredClone', 'fetch',
  ]) {
    void globalThis[name];
  }
});
