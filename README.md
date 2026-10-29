# Gym

A simple workout tracker: days in a fixed order, any exercises you like, and the weight × reps for every set. It runs entirely in the browser with no build step and no server.

## Use it

Open `index.html` in a browser, or use the published copy at https://claude.ai/artifact/CTTfEFqGU4uVQSY3YKejSs (saves to your claude.ai account, so it works across devices).

- **Today** is the next day in the rotation. It starts with the exercises you did last time on that day. Add more from **Previous exercises** or type a new one. Each exercise has kg and reps boxes per set (greyed hints show last time), **+ Set**, a 2:00 rest timer that starts when you enter reps, and a YouTube **Help** search. **Finish workout** saves the session and moves to the next day.
- **Lifts** lists every exercise with its last session and heaviest set.
- **Me** holds body mass and height (BMI, protein, optional calorie estimate), the day order (one per line), history, backup and erase.

Days have no weekdays: train when you like and the app always shows the next one in line. Tapping Finish twice with nothing logged skips a day.

Data from the earlier fixed plan (v1) is carried over automatically: its logged sets become history and its exercise names appear under Previous exercises.

## Install on a phone

The app is a Progressive Web App: hosted on GitHub Pages it installs to the home screen, runs full screen and works offline. Data stays on the phone (use Me → Backup to export it).

1. Repo **Settings → Pages**: Source "Deploy from a branch", branch `main`, folder `/ (root)`.
2. On the phone, open https://matthew-brooksmith.github.io/gym/ in Chrome and tap **Install app** (or ⋮ → Add to Home screen).

After changing app files, bump `CACHE` in `sw.js` so installed copies pick up the new version.

## Android app (APK)

`android/` wraps the same web app in a full-screen WebView. Every push to `main` builds it on GitHub Actions and publishes `gym.apk` as the latest release:
https://github.com/matthew-brooksmith/gym/releases/latest/download/gym.apk

Install it on the phone (allow your browser to install unknown apps when asked). New releases install over the old one and keep your data, because every build is signed with the same sideload key in `android/signing/`. Build locally with `gradle -p android assembleRelease` if you have the Android SDK.

## Publishing a single-file copy

`node scripts/build-single.js [out.html]` inlines the CSS and JS into one page (no doctype/head, as claude.ai artifacts expect).

## Tests

```
npm test
```
