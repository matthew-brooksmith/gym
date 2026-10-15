# Gym

An auto-updating workout plan focused on leg hypertrophy with knee-safe ranges, plus well-rounded upper-body work. It runs entirely in the browser with no build step and no server.

## Use it

Open `index.html` in a browser, or use the published copy at https://claude.ai/artifact/CTTfEFqGU4uVQSY3YKejSs (saves to your claude.ai account, so it works across devices).

- **Today** shows the next session. Each exercise card gives the weight to try, sets × rep range, rest time and how close to failure to go, plus what you did last time. Log the weight you actually used and the reps for each set, then press **Finish workout**.
- **All lifts** lists the next weight and last attempt for every exercise. Type your real working weights here to replace the body-mass estimates (shown in italics).
- **Me** holds body mass and height (plus optional age and sex for a calorie estimate), weekly sets per muscle, the knee rules and your history.

## How the plan updates

- **Rotation:** Lower A → Upper A → Lower B → Upper B, repeating. Train as many days a week as suits you; the next session is always the next in line, so legs get half of all sessions.
- **Double progression:** hit the top of the rep range on every set and the weight goes up by that exercise's increment next time. In range holds the weight. Falling below the range twice in a row resets the weight down 10%.
- **Unloaded work** (bands, holds, balance) progresses by adding reps or seconds instead.
- **Deloads:** sessions 21–24 of every 24 halve the sets with no progression.
- **Body mass changes** re-estimate only the weights you haven't entered or earned.

## Knee rules

Built around patellar instability from shallow trochlear grooves:

- No deep squats, lunges, jumps or pivoting. Loaded knee bend stays at or under about 60°.
- Quads: shallow-range leg press, low-box step-ups, Spanish squat isometrics.
- VMO and stability every lower day: cable terminal knee extensions, cable hip abduction and adduction, Copenhagen planks, single-leg balance.
- Cable work: pull-throughs, glute kickbacks, hip abduction/adduction and TKEs, all with the knee held at a fixed angle.
- Most leg size comes from glutes, hamstrings, adductors and calves, loaded hard with the knee still.

This is general training guidance; a physio's advice for your knee takes priority.

## Customise

Exercises, sets, rep ranges, increments and the rotation live at the top of `plan.js`.

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
