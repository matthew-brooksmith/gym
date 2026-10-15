# Gym Plan

An auto-updating workout plan focused on leg hypertrophy with knee-safe ranges, plus well-rounded upper-body work. It runs entirely in the browser with no build step and no server.

## Use it

Open `index.html` in a browser (or serve the folder with GitHub Pages). Then:

1. Enter body mass and height (age and sex are optional and only used for a calorie estimate).
2. Enter the working weights you know under **Working weights**. Anything you leave alone is estimated from body mass and shown in grey.
3. At the gym, log reps (or seconds for holds) for each set of the **Next session**, then press **Complete session**. The plan applies the progression rules and moves on to the next day.

Data is saved in the browser. Use **Export / Import** to move it between devices.

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

## Tests

```
npm test
```
