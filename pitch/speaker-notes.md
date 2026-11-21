# Socra · three-minute pitch

Rebuild from the repo root with Typst 0.15 or newer:

```sh
typst compile --root . --font-path pitch/fonts --ignore-system-fonts pitch/deck.typ pitch/deck.pdf
```

The bundled [IM Fell English](https://github.com/google/fonts/tree/main/ofl/imfellenglish) and [Nunito](https://github.com/google/fonts/tree/main/ofl/nunito) fonts match the app and need no installation. Their licenses are in `pitch/fonts/`.

## 1 · The idea | 0:00–0:25

“An AI can finish your homework in seconds. But can you solve the next problem without it? In a UC Irvine intro CS study, a slower, Socratic tutor helped students learn, especially students with less prior knowledge. That study didn’t test Socra. Our question is: would rewarding guided practice make students choose that kind of help?”

## 2 · Ask the Cat | 0:25–0:55

Switch to the `demo` browser window. In the Hall of Doors, scroll to the Caterpillar’s prompt, select **Problem**, paste the custom Python problem from [demo-content.md](../demo-content.md), and click **Ask the Cat**. In chat, ask “just give me the answer” and read the Cat’s guiding question aloud. “Your own homework is practice only. The Cat can guide you, but these steps aren’t machine-checked. To earn tarts, try a verified problem on the same idea.” Click **Earn tarts**. If no match appears, go back to the Hall of Doors and open **The Mad Hatter’s Tea Loop** directly.

## 3 · The Mad Hatter’s Tea Loop | 0:55–1:55

Use the `✗ moment` line under `cs-trace-loop-1` in the freshly generated terminal cheat sheet. Point to the red verdict chip. Send the sheet’s `kept_values` list and point to the green chip. Take one **Drink Me** hint, enter the correct total under **Try the door**, then use the strong explain-back from [demo-content.md](../demo-content.md) as your testimony. Select **Present testimony**, then **View on Solana Explorer** once it pays.

“The model identifies the claim, but the Rust verifier checks it against a known checkpoint. The red chat verdict doesn’t cost anything. One hint takes this example from 200 to 150 TARTS: no wrong final submissions, passing testimony, and room under the daily cap. The receipt records the mint on Solana devnet. It doesn’t prove anyone learned.”

## 4 · The Queen’s trial | 1:55–2:30

Switch to an isolated browser profile signed in as `copycat`. Open **The White Rabbit’s Pocket Watch**, paste the correct answer promptly, and submit “I just got that number” at the trial. Show **Off with their tarts!** “A fast or pasted answer isn’t proof of cheating. Everyone who solves a verified problem is asked to explain. It takes both a flag and failed testimony to forfeit the eligible reward.”

## 5 · What Socra checks | 2:30–3:00

“OpenAI handles the conversation, extracts claims, and grades testimony. The Rust verifier checks supported steps and final answers on verified problems. Server-side rules decide what pays, and Solana devnet records the mint. Next we’d compare Socra with and without rewards: do students choose guided practice more often, and can they solve a new problem days later?”

## Rehearsal checklist

- Confirm the demo server is using `OPENAI_API_KEY`. Smoke-test the tutor, verdict chips and testimony after restarting on the rebased build.
- Enable `DEMO_FIXED_SEEDS=true`, use the terminal cheat sheet from the current build, and start fresh sessions rather than reopening pre-rebase ones. The new RNG changes the generated problems even with fixed seeds. Keep the cheat sheet off-screen.
- Rehearse with separate browser profiles and verify the devnet mint and Explorer link. Check that the demo accounts haven’t used their reward attempt for the selected templates.
- Capture the real verdict chips, payout receipt and forfeiture in rehearsal. If the live demo stalls, show those captures; the deck’s example cards are illustrations, not receipts.
- Avoid promising perfect leak prevention or cheat detection. The verifier covers supported checkpoints on bank problems, and grading the explain-back is a separate model judgment.
