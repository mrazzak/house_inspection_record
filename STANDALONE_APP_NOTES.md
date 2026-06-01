# Final Inspection Record Application - Standalone Options

## No-Webserver Version

Use:

`FinalInspectionRecord-Standalone.html`

This is a single self-contained HTML app file. It includes the app UI, styling, PDF generator, and inspection logic in one file, so it does not need a local webserver.

What it can do:

- Run from a local file on a computer or compatible tablet browser.
- Save inspection data locally in the browser/device storage.
- Take or upload photos when the browser allows camera/file access.
- Generate PDF reports inside the app.

Limitations:

- iPhone and iPad do not install arbitrary local HTML files as true home-screen apps.
- Camera, file storage, and PDF saving behavior can vary when opened from a local file.
- For a true installed iPhone/iPad app, the app must be packaged and signed as an iOS app.
- For a true installed Android app, the app must be packaged as an APK/AAB.

## True Phone/Tablet App

The existing web app can be wrapped in a native WebView shell:

- Android: package as an APK/AAB using Android Studio.
- iPhone/iPad: package as an iOS app using Xcode and an Apple Developer account.

That version runs independently on the device and does not need a webserver.
