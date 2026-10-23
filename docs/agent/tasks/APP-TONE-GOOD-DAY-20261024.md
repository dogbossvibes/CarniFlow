# App tone — 2026-10-24

Direct human request in Chat07, message01a16adb-6be6-7eb0-a3f5-1059daa41b72: replace the existing app greeting tone with the supplied video audio interval17–21seconds and deliver by OTA. Target remains iOSBuild55; Android/Build49 unchanged.

Exact MP3 SHA256 c153c17607f65b349124ff81bcf618ea76d4f662496dc955f55fd16c4a4d68cf:192000 samples/channel,48kHz stereo,4.000seconds. Original supplied video unchanged. No fade, normalization, speed or pitch modification.

The existing greeting player is reused. Decorative animation/startup window remains2040ms. Native completion releases the4sclip;4500ms fallback from actual play is a bounded resource safeguard. Pending startup beyond the original visual window is cancelled. Mute, blur/background, track/voice/warmup/TTS priority and audio-session safety helper remain unchanged. No native dependency or settings changes.

41 targeted tests across4suites plus TypeScript/ESLint/diff pass.07 independently reviewed the exact4 source paths and executed24 cases including2 extra interruption checks; no confirmed P1/P2. Existing test-only require warning in the separate tracking overview was present in base0eadfd.

Delivered together with the separately reviewed tracking UI only after final source/native/production environment/runtime/ancestry/bundle/asset/CDN gates. No KI activation, DB migration, native build or Store action. Native listening/device QA remains deferred, not claimed PASS.
