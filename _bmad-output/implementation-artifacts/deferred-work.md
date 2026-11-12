- source_spec: `_bmad-output/implementation-artifacts/spec-gh-31-trainingsdoku-etappe1.md`
  summary: RPC training_document_v1 versionieren, um rating_scale (Speichern/Laden) ergänzen und Vertragstest gegen Staging für save/get/select.
  evidence: Definition in keinem Repo; ohne sie wird rating_scale nicht gespeichert (Lernstufen erschienen als alte Sterne). Release-Blocker vor Migration und OTA.
- source_spec: `_bmad-output/implementation-artifacts/spec-gh-31-trainingsdoku-etappe1.md`
  summary: Ältere Apps (Build 57) könnten Lernstufen-Zeilen ohne rating_scale neu schreiben.
  evidence: maybe-false; klären über RPC-Verhalten beim Ersetzen von Übungszeilen (rating_scale erhalten, wenn nicht mitgesendet).
- source_spec: `_bmad-output/implementation-artifacts/spec-gh-31-trainingsdoku-etappe1.md`
  summary: Tests für umgelenkte Einstiege (Coach, leeres Journal, KI-Hub) und für Intent-Restore mit rating_scale.
  evidence: Änderung trivial, aber ohne Test; Intent-Restore-Pfad prüft rating_scale nicht.
