---
name: anyvo-quality
description: Führt die ANYVO-Qualitätsprüfung für die eigenen Änderungen aus — diff --check inkl. unversionierter Dateien, Secret-Muster, TypeScript, ESLint, betroffene oder alle Jest-Tests, Regressionen und Hinweise auf kritische Bereiche. Vor jedem Abschlussbericht und vor jedem Commit verwenden.
---

# ANYVO Qualitätsprüfung

## Ablauf
1. Basis festlegen: `HEAD` für uncommittete Arbeit, sonst der Branch-Ursprung
   (z. B. `origin/main` oder die Task-Basis aus dem Report).
2. Ausführen:
   ```
   node scripts/claude/quality-check.mjs --base <basis>          # Standard
   node scripts/claude/quality-check.mjs --base <basis> --full   # vor Commit/PR/Release
   node scripts/claude/quality-check.mjs --skip-tsc              # reine Doku-Änderung
   ```
   Das Skript ist lesend; es ändert nichts und ruft nichts Remote auf.
3. Regressionen: neben den betroffenen Tests die angrenzenden Abläufe benennen
   (Aufrufer, gemeinsam genutzte Hooks/Stores, Offline-Sync, Altformate) und
   dafür vorhandene Tests gezielt mitlaufen lassen. Fehlt ein Regressionstest
   für behobenes Fehlverhalten, einen Verhaltenstest ergänzen.
4. Gemeldete kritische Bereiche an die Fach-Skills geben:
   `/anyvo-tracking-review`, `/anyvo-security-review`, Abo/RevenueCat-Sandbox.

## Verbote
- Tests nie abschwächen, überspringen (`.skip`, `xit`), Schwellen senken oder
  Erwartungen an fehlerhaftes Verhalten anpassen. Anpassung nur bei belegt
  geänderter Anforderung und mit Begründung im Bericht.
- Kein `any`, kein pauschales `eslint-disable`, kein `@ts-ignore` als Fix.
- Timeout, Abbruch oder fehlendes `node_modules` ist kein bestandener Check.

## Bericht
Exakte Befehle mit Ergebnis (PASS/FAIL/SKIP), vorbestehende Fehler getrennt
(Vergleich mit der Basis), nicht ausgeführte Prüfungen und nötige Geräteabnahme.
