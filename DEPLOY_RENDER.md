# Deploy to Render

This app can be deployed on Render as a Static Site.

## Recommended Render Settings

- Service type: Static Site
- Build command: `echo "No build required"`
- Publish directory: `.`
- Branch: your production branch, usually `main`

The included `render.yaml` already defines these settings for a Render Blueprint.

## Steps

1. Push this folder to a GitHub, GitLab, or Bitbucket repository.
2. Log in to Render.
3. Choose **New > Blueprint** if you want Render to use `render.yaml`.
4. Connect the repository.
5. Apply the Blueprint and deploy.

Alternative manual setup:

1. Choose **New > Static Site**.
2. Connect the repository.
3. Set Build Command to:

   `echo "No build required"`

4. Set Publish Directory to:

   `.`

5. Click **Create Static Site**.

## After Deploy

Render gives you an HTTPS URL like:

`https://final-inspection-record-app.onrender.com`

Open that URL on iPhone/iPad Safari, then use **Share > Add to Home Screen**.

On Android, open the URL in Chrome and choose **Install app** or **Add to Home screen**.

## Notes

- Camera access on phones requires HTTPS. Render provides HTTPS automatically.
- Inspection data and photos are stored locally on each device using browser storage.
- Render hosting does not create an IPA or APK. It hosts the PWA/web version.
