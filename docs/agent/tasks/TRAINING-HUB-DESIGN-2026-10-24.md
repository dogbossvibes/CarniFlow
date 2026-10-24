# Training-Hub: kompakter Entwurf und Apportierholz

Basis 86c3d1e2a09952148bfd35a84642ca69be820b78; Branch feat/training-hub-20261024. Isoliert vom Planlinien-Kandidaten.

Vom Nutzer freigegeben: vorgelegtes kompaktes Design umsetzen, Apportierholz nach Fotovorlage statt Hantelsymbol. Kein Rasterfoto als Icon: vorhandenes react-native-svg-Icon nutzt eine skalierbare Silhouette mit breiten, abgeflachten Holzbacken. Bestehende Tab-Verwendung übernimmt diese Form.

Training-Tab: kein Hero-Foto/Leerraum, kompakte Timer-Karte, breiter Timer-Aufruf, Dokumentation und Journal unverändert erreichbar, Fährten-Karte hervorgehoben. Bezeichnung ohne GPS-Zusatz. Texte in allen fünf bestehenden Hauptlokalisierungen. Statistik-Touchziel 44 pt mit zugänglicher Beschriftung; Karten ohne feste Texthöhe.

Keine Tracking-, Live-Share-, Datenbank-, native oder Navigationslogik geändert. Kein Commit/Push/Build/OTA. Build49 unverändert.

ESLint und diff-check PASS. TypeScript --noEmit PASS; vorhandene Training-Screen-Suite: 6 Tests PASS. Native visuelle Geräteabnahme offen; keine pixelgenaue Mockup-/Geräteübereinstimmung behauptet.
