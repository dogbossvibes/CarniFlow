#!/bin/zsh
print -r -- "ANYVO T115 – vollständige A/B-Abnahme (Full5)"
print -r -- "Nur nach Freigabe durch Chat 01 starten. Passwoerter ausschliesslich verdeckt im Terminal eingeben."
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 "${PROJECT_ROOT}/outputs/t115-full5-qa-05-20261102/t115-final-qa-full5-05.py" --execute-approved --stage-b-install-receipt "${PROJECT_ROOT}/outputs/t115-integration-review-01-20261101/T115-STAGE-B-INSTALL-POSTFLIGHT-20261101.json" --storage-preflight-receipt "${PROJECT_ROOT}/outputs/t115-health-sharing-db-05-20261029/T115-FULL5-STORAGE-ABSENCE-20261102.json"
print -r -- "Ablauf beendet. Ergebniszeile an Chat 01 melden, keine Zugangsdaten."
read "?Zum Schliessen Return druecken: "
