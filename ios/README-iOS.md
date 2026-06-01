# Final Inspection Record Application for iOS

This folder contains a native iOS wrapper for the standalone inspection app.

## What This Is

- A SwiftUI iOS app.
- A `WKWebView` shell that loads `Resources/FinalInspectionRecord-Standalone.html` from the app bundle.
- No webserver is required on the phone or tablet.
- Camera and photo-library permission strings are included for inspection evidence photos.

## Open in Xcode

1. Copy the whole project folder to a Mac.
2. Open:

   `ios/FinalInspectionRecordApp.xcodeproj`

3. Select the `FinalInspectionRecordApp` target.
4. In **Signing & Capabilities**, choose your Apple Developer Team.
5. Change the Bundle Identifier if needed:

   `com.finalinspection.recordapp`

6. Select an iPhone or iPad simulator/device and run.

## Create an IPA

1. In Xcode, select **Any iOS Device (arm64)**.
2. Choose **Product > Archive**.
3. When Organizer opens, choose **Distribute App**.
4. Pick the distribution method:
   - App Store Connect
   - Ad Hoc
   - Enterprise
   - Development
5. Follow Xcode's signing prompts and export/upload the IPA.

## Important Notes

- A signed IPA can only be produced on macOS with Xcode.
- Device installation requires valid Apple signing.
- The embedded HTML file is bundled into the app, so the app runs independently.
