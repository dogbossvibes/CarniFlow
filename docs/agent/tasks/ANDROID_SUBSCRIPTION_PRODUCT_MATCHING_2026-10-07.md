# Android subscription product matching — 2026-10-07

Base: verified latest Android production OTA commit 68b23f186ca0f527dc04cf7426d80736d74a7ff2, group 917f8312-8085-4d9a-ba64-d3f8972a9d21, runtime 1.0.3.
Branch: codex/android-subscription-product-matching.

User screenshots show active Google base plans for Active and Trainer, mapped in RevenueCat default offering as:
- anyvo_active_monthly_10:anyvo-active-monthly-400
- anyvo_trainer_monthly_30.00:anyvo-trainer-monthly-3000

Code previously matched only bare subscription IDs. This rejects suffixed IDs in paywall/package availability, membership pricing, trial selection and restore fallback. A shared comparison now recognizes known subscription IDs with a nonempty base plan suffix. Original package objects and identifiers stay intact for SDK purchase and Android replacement calls. Active's stale hardcoded CHF 9.00 fallback is now neutral; displayed paid prices come from store packages.

Validation: 16 suites / 245 tests passed (purchase/configuration/restore/paywall and subscription suites). ESLint: zero errors; one preexisting unused IconName warning in membership.tsx. Diff whitespace check passed. TypeScript typecheck passed.

Limitations: actual Google Play price, country availability, current-offering selection and device SDK response have not been verified. Screenshots cannot establish that getOfferings succeeds on the affected device; identifier matching is a demonstrated code defect, not proof it is the only cause. Production Android RevenueCat env variable exists; its inclusion in the delivered JS bundle was not independently verified.

No commit, push, OTA, store configuration or database change. Release requires explicit user authorization, fresh production ancestry check, Android export, and device verification after delivery.
