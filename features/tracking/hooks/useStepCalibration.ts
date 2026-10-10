import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { StepCalibrationSession, type CalibrationState } from '../utils/stepCalibrationSession';

type ViewState = Omit<CalibrationState, 'phase' | 'issue'> & {
  phase: CalibrationState['phase'] | 'idle' | 'preparing';
  issue: CalibrationState['issue'] | 'permission' | 'busy';
};
const IDLE: ViewState = { phase: 'idle', distanceM: 0, accuracy: null, stepLengthM: null, issue: null };

export function useStepCalibration(blocked: boolean) {
  const [state, setState] = useState<ViewState>(IDLE);
  const generation = useRef(0);
  const alive = useRef(true);
  const busy = useRef(blocked); busy.current = blocked;
  const preparing = useRef(false);
  const session = useRef<StepCalibrationSession | null>(null);
  const source = useRef<Location.LocationSubscription | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const release = useCallback(() => {
    generation.current++; preparing.current = false; session.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const own = source.current; source.current = null;
    own?.remove();
  }, []);
  const interrupt = useCallback(() => {
    const active = preparing.current || session.current != null;
    release();
    if (active && alive.current) setState({ ...IDLE, phase: 'error', issue: 'interrupted' });
  }, [release]);
  useEffect(() => {
    alive.current = true;
    const listener = AppState.addEventListener('change', next => {
      // The permission dialog may be inactive while no measurement exists yet.
      if (next === 'background' || (next === 'inactive' && session.current)) interrupt();
    });
    return () => { alive.current = false; listener.remove(); release(); };
  }, [interrupt, release]);
  useEffect(() => { if (blocked) interrupt(); }, [blocked, interrupt]);
  const publish = useCallback((measurement: StepCalibrationSession) => {
    if (!alive.current || session.current !== measurement) return;
    setState({ ...measurement.state });
    if (measurement.state.phase === 'error' || measurement.state.phase === 'result') release();
  }, [release]);
  const start = useCallback(async () => {
    if (preparing.current || session.current) return;
    if (busy.current) { setState({ ...IDLE, phase: 'error', issue: 'busy' }); return; }
    release();
    const token = generation.current;
    const current = () => alive.current && token === generation.current && !busy.current;
    preparing.current = true; setState({ ...IDLE, phase: 'preparing' });
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!current()) return;
      if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
      if (!current()) return;
      if (permission.status !== 'granted') {
        release(); setState({ ...IDLE, phase: 'error', issue: 'permission' }); return;
      }
      if (AppState.currentState !== 'active') { interrupt(); return; }
      const measurement = new StepCalibrationSession(Date.now());
      session.current = measurement; preparing.current = false;
      setState({ ...measurement.state });
      timer.current = setInterval(() => {
        if (!current()) return;
        measurement.tick(Date.now()); publish(measurement);
      }, 1000);
      // An independently owned foreground subscription. The shared tracking source can
      // stop a native recorder or reset the external receiver buffer; never use it here.
      const subscription = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0,
      }, location => {
        if (!current()) return;
        measurement.add({ lat: location.coords.latitude, lng: location.coords.longitude,
          accuracy: location.coords.accuracy, t: location.timestamp }, Date.now());
        publish(measurement);
      });
      if (!current()) { subscription.remove(); return; }
      source.current = subscription;
    } catch {
      if (!current()) return;
      release(); setState({ ...IDLE, phase: 'error', issue: 'signal' });
    }
  }, [interrupt, publish, release]);
  const begin = useCallback(() => {
    const measurement = session.current;
    if (measurement) { measurement.begin(Date.now()); publish(measurement); }
  }, [publish]);
  const finish = useCallback(() => {
    const measurement = session.current;
    if (measurement) { measurement.finish(Date.now()); publish(measurement); }
  }, [publish]);
  const reset = useCallback(() => { release(); if (alive.current) setState(IDLE); }, [release]);
  return { ...state, start, begin, finish, interrupt, reset };
}
