# Phase E - Multi-Platform Packaging

This phase keeps the ERP as a single React codebase and prepares native shells around the existing app without rewriting operational screens.

## Repo audit

### Already present

- React + Vite build already produces a static `dist/` output.
- Capacitor packages are already installed in `package.json`.
- Shared browser barcode scanning already exists in [src/features/reports/hooks/useBarcodeScanner.ts](../src/features/reports/hooks/useBarcodeScanner.ts).
- Export and print flows already exist in [src/lib/exportUtils.ts](../src/lib/exportUtils.ts).

### Missing before this phase

- Capacitor was still configured to load the old hosted Lovable URL instead of the local ERP bundle.
- There was no Tauri v2 desktop shell scaffold in the repo.
- Vite had no Tauri-aware dev server/HMR settings.
- There was no runtime bootstrap to identify whether the app is running on web, Capacitor, or Tauri.
- Native integration points for barcode/file handling were undocumented.

## What this phase adds

- A Tauri v2 scaffold under `src-tauri/` with a minimal Rust entrypoint and locked-down default capability file.
- A platform bootstrap layer in `src/platform/` that exposes runtime info on `window.__FOOD_CHOICE_RUNTIME__`.
- A native bridge contract on `window.__FOOD_CHOICE_NATIVE__` for optional shell-specific integrations.
- Tauri-aware Vite dev/HMR settings for desktop development.
- Capacitor config pointed back to the local `dist/` bundle.
- Shared barcode hook support for an optional native scanner before falling back to web camera scanning.

## Runtime contract

`src/platform/runtime.ts` defines the cross-platform contract:

- `window.__FOOD_CHOICE_RUNTIME__`
  - populated at startup
  - identifies `web`, `capacitor`, or `tauri`
- `window.__FOOD_CHOICE_NATIVE__`
  - optional bridge owned by the native shell
  - intended methods:
    - `scanBarcode()`
    - `saveFile()`
    - `printHtml()`

If the bridge is absent, the web fallback remains active.

## Barcode scanner integration points

Current app touchpoints:

- Shared hook: [src/features/reports/hooks/useBarcodeScanner.ts](../src/features/reports/hooks/useBarcodeScanner.ts)
  - now checks `window.__FOOD_CHOICE_NATIVE__?.scanBarcode()` first
  - falls back to ZXing + `getUserMedia`
- Legacy direct scanner flow: [src/pages/InvoiceScan.tsx](../src/pages/InvoiceScan.tsx)
  - still uses its own browser camera logic
  - should be migrated to the shared hook before native plugin wiring if this screen is part of the mobile rollout

Recommended mobile implementation:

1. Add a Capacitor barcode-scanner plugin or a custom native plugin.
2. During native webview startup, bind that plugin to `window.__FOOD_CHOICE_NATIVE__.scanBarcode`.
3. Keep the existing web fallback for browser and desktop usage.

## Desktop file/export handling integration points

Current ERP exports are generated from:

- [src/lib/exportUtils.ts](../src/lib/exportUtils.ts)

Current behavior remains browser-style download/print. For desktop hardening, wire the native shell to:

- `window.__FOOD_CHOICE_NATIVE__.saveFile`
  - for Excel/PDF save dialogs and local filesystem writes
- `window.__FOOD_CHOICE_NATIVE__.printHtml`
  - for native print-preview handling when needed

Recommended Tauri follow-up:

1. Add the Tauri dialog and filesystem plugins.
2. Expose save/print commands through the shell bridge.
3. Keep browser download fallback for web deployments.

## Commands

### Web

```sh
npm install
npm run dev
npm run build
```

### Tauri v2 desktop

Install prerequisites first:

- Rust toolchain with `cargo`
- WebView2 runtime on Windows

Then run:

```sh
npm install
npx @tauri-apps/cli@2 dev
```

Desktop production build:

```sh
npm install
npx @tauri-apps/cli@2 build
```

### Capacitor Android

Install prerequisites first:

- Android Studio
- Android SDK
- `ANDROID_HOME` or `ANDROID_SDK_ROOT`
- JDK 17 recommended by current Android toolchains

Initial platform setup:

```sh
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Repeat sync after web changes:

```sh
npm run build
npx cap sync android
```

### Capacitor iOS

Requires macOS + Xcode.

```sh
npm install
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios
```

## Environment blockers seen on this machine

- `cargo` is not installed, so Tauri build/dev could not be executed here.
- Java is present, but it is Java 8. Current Android tooling commonly expects JDK 17.
- `ANDROID_HOME` and `ANDROID_SDK_ROOT` are not configured.
- `xcodebuild` is unavailable on this Windows machine, so iOS packaging cannot be verified here.

## Notes

- No ERP routes were changed in this phase.
- No Supabase SQL migration was required in this phase.
- For native auth/reset links, set `VITE_APP_URL` explicitly so Supabase redirects do not rely on webview-local origins.
