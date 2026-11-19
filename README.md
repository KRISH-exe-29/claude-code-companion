> **Marvel fan edition.** Non-commercial fan art: the SENTRY, SILVER SURFER and ULTRON look-alike characters here were AI-generated as a tribute. Marvel and these character names are trademarks of Marvel / Disney; this project is not affiliated with or endorsed by Marvel, Disney or Anthropic. For the original-character release, see the [`main` branch](https://github.com/KRISH-exe-29/claude-code-companion).

# Coding Companion

The Claude Code team character roams your screen on a transparent, click-through layer and shows what Claude is doing. No window, no border: just the character.

| Command | Character | Model |
|---|---|---|
| `sentry` | Sentry (gold) | Haiku 5.5, quick tasks |
| `surfer` | Silver Surfer (silver-blue) | Opus 5.5, builds |
| `ultron` | Ultron (red) | Opus 5.5 max effort, plan mode |
| plain `claude` | neutral orb | |

Moods: **idle** (drifts slowly), **thinking**, **working** (flies faster, more particles), **needs you** (stops, hops, glows, chimes), **done** (sparkle burst, slow drift until your next message).

## Use

- Type `sentry`, `surfer` or `ultron` in PowerShell. The companion opens by itself.
- Start it on its own with `companion`.
- Tray icon (right-click): **Mute chime**, **Hide/Show**, **Quit**.
- **Click** the character: a ring opens around it with **Minimize** (–, parks it in the corner; shows □ Restore when parked) and **Close** (×, quits the companion). It closes by itself a few seconds after the mouse leaves.
- **Drag** the character anywhere; it stays where you drop it. **Double-click** it to let it roam again.
- **Switch windows or browser tabs** and it flies to the bottom-right corner and parks small. When Claude needs you it grows back to full size there and hops. Double-click to roam again.
- Clicks pass straight through everywhere except on the character itself. Use the tray's **Hide/Show** to get it out of the way.

## Change a character

- Still image: replace `assets/<team>/character.png` (transparent PNG, portrait).
- Video for a mood (for example from Google Flow): drop `assets/<team>/<mood>.mp4`, where mood is `idle`, `thinking`, `working`, `needs-you` or `done`. A clip replaces the animated image for that mood only.
- Preview without running Claude: `npx electron scripts/snap.js <team> snaps` writes one PNG per mood, or run `npm start` and then `node scripts/demo.js <team>`.

## Install / uninstall the hooks

- `node scripts/install-hooks.js` adds the hooks to `~/.claude/settings.json` (backup: `settings.json.companion-bak`).
- `node scripts/install-hooks.js --uninstall` removes only the companion's hooks.

## Privacy

Listens on 127.0.0.1:7777 only. The hook sends the event type, tool name and file name, never prompts, commands or file contents. Nothing is logged.

## Tests

`npm test`

## Animated clips (Google Flow)

Every team has a transparent VP9 clip per mood in `assets/<team>/<mood>.webm`; a missing mood falls back to `idle.webm`, and a team with no clips shows the still image.

To regenerate: prompts are in `flow/prompts.json`, start frames (flat #00FF00) in `flow/inputs/`. Generate 9:16 image-to-video clips in Flow (Veo 3.1 Fast, 20 credits each), then with the Flow tab open in the gstack browser:

```
python flow/fetch.py <scratch-dir>   # downloads finished clips to flow/raw/<team>-<mood>.mp4, matched by prompt text
python flow/key.py                   # keys out the green, one crop per team, writes assets/<team>/<mood>.webm
```
