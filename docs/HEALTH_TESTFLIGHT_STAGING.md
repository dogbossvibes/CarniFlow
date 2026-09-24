# ANYVO Health TestFlight staging environment

This configuration is for the existing ANYVO iOS app and the
`health-testflight` EAS profile only. It must use the existing ANYVO Staging
Supabase project. Do not put values from this document into source control.

## Required EAS environment variables

The EAS environment `health-testflight` must contain:

- `EXPO_PUBLIC_BACKEND_ENV=staging`
- `EXPO_PUBLIC_SUPABASE_URL=https://cbhrxkjclakzlvajyvfn.supabase.co`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY=<Staging publishable/anon key>`

The anon key is configured in EAS only and must never be committed, printed,
or replaced with a service-role key.

The `health-testflight` profile uses the `health-testflight` update channel and
the existing `com.anyvo.app` iOS application identity. The app fails closed if
the backend environment and Supabase project reference do not match.

RevenueCat keys are optional for app startup. If subscription QA is required,
configure the appropriate non-production public SDK key separately; never copy
a Production service credential into this environment.
