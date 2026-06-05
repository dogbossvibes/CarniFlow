import React from 'react';

// Fängt Render-Fehler eines Teilbaums ab und zeigt einen Fallback — z. B. wenn
// ein natives Modul (react-native-maps) im aktuellen Build noch nicht enthalten
// ist und die native View nicht rendern kann.
export class SoftBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* still – Fallback genügt */ }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
