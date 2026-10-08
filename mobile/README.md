# NOOK Mobile

Flutter client for NOOK messaging, with account registration and sign-in, a conversation inbox, direct-chat search, message history, and live message updates.

## Run

Start the NOOK backend first. Android emulators use `10.0.2.2:3000` to reach the host machine:

```powershell
cd mobile
flutter pub get
flutter run
```

Set `NOOK_API_URL` if the backend uses another address. Use `http://localhost:3000` for the iOS simulator or the computer's LAN IP for a physical device:

```powershell
flutter run --dart-define=NOOK_API_URL=http://localhost:3000
```

Use an HTTPS backend for production. Android cleartext traffic is enabled only in the debug manifest for local development.
