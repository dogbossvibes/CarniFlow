# ANYVO Website / Marketing – Status 2026-10-29

## Scope and status
- Website refresh and Google Play availability link are merged to `main`.
- Current October app screenshots are live; the six screenshot files are served as JPEG because the former WebP URLs did not render in production.
- Live Google Play target: https://play.google.com/store/apps/details?id=com.anyvo.app

## Source and release evidence
- PR #5 (marketing refresh): https://github.com/dogbossvibes/CarniFlow/pull/5
- PR #6 (JPEG delivery fix): https://github.com/dogbossvibes/CarniFlow/pull/6
- Main source commit: `84ba7782ad4afa0ef65aa12a76ef246c29f22d1c`
- Vercel production deployment: `dpl_C3xjvWDXENqaFpw7LRrQEzXJ2o2h` (READY; aliases include `www.anyvo.app` and `anyvo.app`).

## Verification and gates
- Browser confirmed the homepage, Google Play link, hero screenshot, and all six October JPEG screenshot assets on the public site.
- No automated tests or full QA were run; this record does not claim release readiness beyond the live checks above.
- No new deployment, mobile build, App Store / Google Play submission, or OTA was performed for this backup task.

## Local checkout note
- The local checkout was on `release/android-store-current` at `39964e1f073e34783fa80d7603b12c0591688826`, not the website branch.
- Website CSS, both feature pages, and the local JPEG assets matched current `main`. The local homepage still referenced WebP, so that stale local version was not pushed over the newer main version.
- Scope intentionally excluded app, tracking, GPS, customer, personal, media, build, and unrelated worktree changes.
