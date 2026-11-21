// Build from the repo root with Typst 0.15+: typst compile --root . --font-path pitch/fonts --ignore-system-fonts pitch/deck.typ pitch/deck.pdf
// Palette: frontend/src/index.css. Fonts: frontend/index.html; OFL copies in pitch/fonts/.
#set document(title: "Socra — Reward the reasoning", author: "Team Socra")
#set text(font: "Nunito", size: 19pt, lang: "en")
#set par(leading: 0.47em, spacing: 0pt)
#show raw: set text(font: "DejaVu Sans Mono", size: 16pt)

#let display = "IM Fell English"
#let day = (
  sky: rgb("#b9deff"), haze: rgb("#d6ecf7"), base: rgb("#faf8f1"),
  card: rgb("#faf8f1"), edge: rgb("#dccfb3"),
  ink: rgb("#334356"), dim: rgb("#5b6a7c"), tan: rgb("#5f4a2c"),
  accent: rgb("#f6e7c8"), gold: rgb("#e0b775"),
  heart: rgb("#c8314a"), cat: rgb("#7b4bb3"), floor: rgb("#334356"),
)
#let secondary = rgb("#e2eef7")
#let muted = rgb("#eef3f6")
#let red-bg = rgb("#ffe2e2")
#let red-ink = rgb("#9f0712")
#let green-bg = rgb("#d0fae5")
#let green-ink = rgb("#006045")
#let potion-bg = rgb("#dff1ee")
#let potion-ink = rgb("#215f59")
#let total = 5
#let grin(size) = image("../frontend/public/grin.svg", width: size, height: size)
// The jam tart mark from the frontend's Tart component in components/wonder.tsx.
#let tart(size) = image(bytes("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M2.5 12.5h19l-2 6.2a2 2 0 0 1-1.9 1.3H6.4a2 2 0 0 1-1.9-1.3z' fill='#e7b863' stroke='#9a6a1f' stroke-width='1.2'/><path d='M4 12.5c0-3.6 3.6-5.5 8-5.5s8 1.9 8 5.5' fill='#c8314a' stroke='#8d1d31' stroke-width='1.2'/><path d='M12 5.2c-.9-1.2-2.8-.6-2.5.9.2.9 2.5 2.4 2.5 2.4s2.3-1.5 2.5-2.4c.3-1.5-1.6-2.1-2.5-.9z' fill='#c8314a'/></svg>"), width: size, height: size, format: "svg")

#let title(body, size: 29pt) = text(font: display, size: size, body)
#let amount(body, size: 36pt) = text(size: size, weight: 800, fill: red-ink, body)
#let copy(body, size: 18pt, fill: day.dim) = text(size: size, fill: fill, body)
#let eyebrow(body, fill: day.tan) = text(size: 11pt, weight: 700, tracking: 1.25pt, fill: fill, upper(body))
#let pill(body, bg: day.accent, fg: day.tan, stroke: none) = box(
  fill: bg, stroke: stroke, radius: 20pt, inset: (x: 10pt, y: 5pt),
  text(size: 12pt, weight: 700, fill: fg, body),
)
#let card(body, height: auto, bg: day.card, edge: day.edge, suit: none, pip: day.heart) = block(
  width: 100%, height: height, fill: bg,
  stroke: 1.2pt + edge, radius: 15pt, inset: 18pt, breakable: false,
  {
    if suit != none {
      let mark = text(font: "New Computer Modern Math", size: 17pt, fill: pip, suit)
      place(top + right, dx: 4pt, dy: -6pt, mark)
      place(bottom + left, dx: -4pt, dy: 6pt, rotate(180deg, mark))
    }
    body
  },
)
#let bubble(body, student: false) = block(
  width: if student { auto } else { 100% },
  radius: if student { (rest: 13pt, bottom-right: 3pt) } else { (rest: 13pt, bottom-left: 3pt) },
  inset: (x: 13pt, y: 9pt), fill: if student { day.ink } else { secondary },
  stroke: if student { none } else { 1pt + day.edge },
  copy(size: 17pt, fill: if student { day.card } else { day.ink }, body),
)
#let button(body) = box(
  fill: day.ink, radius: 8pt, inset: (x: 12pt, y: 8pt),
  text(size: 13pt, weight: 700, fill: day.card, body),
)

#let scenery = {
  rect(width: 100%, height: 100%, stroke: none, fill: gradient.linear(
    (day.sky, 0%), (day.haze, 42%), (day.base, 100%), angle: 90deg,
  ))
  let glow = (width, height, x, y, color) => place(top + left, dx: x, dy: y,
    ellipse(width: width, height: height, stroke: none, fill: gradient.radial(color, color.transparentize(100%))),
  )
  glow(600pt, 360pt, -116pt, -142pt, rgb("#fbd6e6").transparentize(30%))
  glow(590pt, 410pt, 478pt, -180pt, day.gold.transparentize(58%))
  for (x, y, size) in ((20pt, 143pt, 10pt), (36pt, 378pt, 5pt), (920pt, 96pt, 9pt), (941pt, 335pt, 9pt), (805pt, 85pt, 5pt)) {
    place(top + left, dx: x, dy: y, text(font: "New Computer Modern Math", size: size, fill: white, [✦]))
  }
  place(bottom + left, grid(columns: (8pt,) * 120, ..range(240).map(i => {
    let dark-square = calc.rem(i + calc.quo(i, 120), 2) == 0
    rect(width: 8pt, height: 8pt, stroke: none, fill: if dark-square { day.floor } else { day.card })
  })))
}
#let footer(n) = {
  line(length: 100%, stroke: 1pt + day.edge)
  v(6pt)
  grid(
    columns: (1fr, auto, 1fr), align: (left + horizon, center + horizon, right + horizon),
    eyebrow(fill: day.dim)[Dream to Wonderland · Cutie Hack 2026],
    grid(columns: (18pt,) * total, column-gutter: 5pt, ..range(1, total + 1).map(i =>
      rect(width: 18pt, height: 3pt, radius: 1.5pt, stroke: none, fill: if i == n { day.cat } else { day.edge })
    )),
    copy(size: 12pt)[#str(n) / #str(total)],
  )
}
#let slide(n, section, body) = page(
  width: 960pt, height: 540pt, margin: (x: 48pt, top: 26pt, bottom: 59pt),
  background: scenery, footer: footer(n),
  {
    set text(fill: day.ink)
    grid(columns: (auto, 1fr, auto), column-gutter: 8pt, align: (left + horizon, left + horizon, right + horizon),
      grin(31pt), title(size: 25pt)[Socra],
      pill(stroke: 1pt + day.edge, section),
    )
    v(9pt)
    line(length: 100%, stroke: 1pt + day.edge)
    body
  },
)
#let headline(heading, subtitle) = {
  v(36pt)
  title(size: 49pt, heading)
  v(13pt)
  copy(size: 21pt, subtitle)
  v(25pt)
}

// 1 · Hook (0:00–0:25)
#slide(1, [The idea])[
  #v(100pt)
  #grid(
    columns: (1.65fr, 1fr), column-gutter: 34pt, align: horizon,
    [
      #eyebrow(fill: day.cat)[AI tutoring for intro CS and math]
      #v(9pt)
      #block({
        set par(leading: 0.24em)
        title(size: 55pt)[Reward the reasoning, \ not just the answer.]
      })
      #v(20pt)
      #copy(size: 22pt, fill: day.ink)[The Cheshire Cat tutors with questions. Students earn devnet TARTS on verified challenges.]
    ],
    [
      #place(top + left, dx: 5pt, dy: 2pt, rotate(4deg, origin: center + horizon,
        block(width: 100%, height: 214pt, radius: 15pt, fill: day.accent, stroke: 1.2pt + day.edge),
      ))
      #card(height: 214pt, suit: [♦])[
        #eyebrow[Why Socratic tutoring?]
        #v(9pt)
        #title(size: 27pt)[Slower, Socratic tutoring helped students learn.]
        #v(9pt)
        #copy(size: 16pt)[In a UC Irvine intro CS study, the benefit was greatest for students with less prior knowledge.]
        #v(12pt)
        #link("https://sigcse2026.sigcse.org/details/sigcse-ts-2026-Papers/2/Pacing-for-Mastery-Optimizing-LLM-Interactions-for-Learning")[#underline[#copy(size: 11pt, fill: day.cat)[Tran et al., “Pacing for Mastery” · SIGCSE 2026]]]
      ]
    ],
  )
]

// 2 · Refusal (0:25–0:55)
#slide(2, [Demo 01 · Ask the Cat])[
  #headline([Get a question, not the answer.], [Bring your own homework for practice. Only verified challenges can pay TARTS.])
  #grid(
    columns: (0.94fr, 1.06fr), column-gutter: 18pt,
    card(height: 258pt)[
      #grid(columns: (1fr, auto), column-gutter: 7pt, align: horizon,
        title(size: 26pt)[What does this print?], pill(bg: secondary, fg: day.ink)[Practice dream])
      #v(14pt)
      #block(width: 100%, radius: 8pt, fill: muted, inset: 13pt)[
        ```
        count = 0
        for n in range(3, 20):
            if n % 3 == 0:
                count += n
        print(count)
        ```
      ]
      #v(13pt)
      #grid(columns: (1fr, auto), column-gutter: 10pt, align: horizon,
        copy(size: 16pt)[Try a verified door on the same idea.], button[Earn tarts])
    ],
    card(height: 258pt)[
      #grid(columns: (auto, 1fr, auto), column-gutter: 8pt, align: horizon,
        grin(32pt), [
          #title(size: 24pt)[The Cheshire Cat]
          #v(3pt)
          #copy(size: 13pt)[asks, never tells]
        ], eyebrow(fill: day.cat)[Example chat])
      #v(10pt)
      #line(length: 100%, stroke: 1pt + day.edge)
      #v(11pt)
      #align(right, bubble(student: true)[Just give me the answer.])
      #v(9pt)
      #grid(columns: (auto, 1fr), column-gutter: 7pt, align: bottom,
        grin(20pt), bubble[I won’t give the output. Which values of `n` make `n % 3 == 0` true?])
      #v(13pt)
      #copy(size: 15pt)[Practice dream: steps aren’t machine-checked here.]
    ],
  )
]

// 3 · Payout (0:55–1:55)
#slide(3, [Demo 02 · The Mad Hatter’s Tea Loop])[
  #headline([Solve it. Explain why. Earn TARTS.], [Check your work with the Cat, submit the final answer, then testify.])
  #grid(
    columns: (1fr,) * 3, column-gutter: 15pt,
    card(height: 215pt, suit: [♣], pip: day.ink)[
      #eyebrow[01 · Step check]
      #v(9pt)
      #title[Fix a wrong step]
      #v(10pt)
      #pill(bg: red-bg, fg: red-ink)[× the values added to total]
      #v(5pt)
      #pill(bg: green-bg, fg: green-ink)[✓ the values added to total]
      #v(11pt)
      #copy(size: 17pt)[Chat corrections don’t count as wrong final answers.]
    ],
    card(height: 215pt, suit: [♠], pip: day.cat)[
      #eyebrow[02 · The trial]
      #v(9pt)
      #title[Present testimony]
      #v(10pt)
      #copy(size: 18pt, fill: day.ink)[“The range stops before its upper bound. The loop adds only values with zero remainder.”]
    ],
    card(height: 215pt, bg: day.accent, suit: [♥])[
      #eyebrow[03 · Example payout]
      #v(9pt)
      #title[You woke up!]
      #v(8pt)
      #grid(columns: (auto, 1fr), column-gutter: 7pt, align: horizon,
        tart(28pt), amount[150 TARTS])
      #v(7pt)
      #pill(bg: potion-bg, fg: potion-ink, stroke: 1pt + rgb("#b9ddd7"))[Base 200 × Drink Me 0.75]
      #v(10pt)
      #copy(size: 16pt, fill: day.ink)[#underline[View on Solana Explorer] ↗]
    ],
  )
  #v(12pt)
  #copy(size: 15pt)[Example: one hint, no wrong final answers, passing testimony, and room under the daily cap.]
  #v(5pt)
  #copy(size: 15pt)[TARTS are Solana devnet tokens, not real money. The receipt records the mint, not what the student learned.]
]

// 4 · Catch (1:55–2:30)
#slide(4, [Demo 03 · The Queen’s trial])[
  #headline([A correct answer can earn nothing.], [A flagged solve forfeits the reward only if the testimony doesn’t pass.])
  #grid(
    columns: (1fr, 1fr), column-gutter: 18pt,
    card(height: 202pt, suit: [♥])[
      #eyebrow[The White Rabbit’s Pocket Watch]
      #v(10pt)
      #title[Who stole the tarts?]
      #v(10pt)
      #pill(bg: red-bg, fg: red-ink)[Pasted answer] #h(3pt) #pill(bg: red-bg, fg: red-ink)[Very fast solve]
      #v(13pt)
      #block(width: 100%, fill: day.base, stroke: 1pt + day.edge, radius: 8pt, inset: 11pt)[
        #copy(size: 18pt, fill: day.ink)[“I just got that number.”]
      ]
    ],
    card(height: 202pt, bg: rgb("#fff1f2"), edge: rgb("#f4c2c9"), suit: [♥])[
      #eyebrow(fill: red-ink)[Example result]
      #v(10pt)
      #title[Off with their tarts!]
      #v(7pt)
      #amount(size: 42pt)[0 TARTS]
      #v(7pt)
      #copy(size: 18pt, fill: day.ink)[The answer was correct, but the testimony didn’t pass.]
    ],
  )
  #v(13pt)
  #copy(size: 16pt)[A flag isn’t proof of cheating. Convincing testimony can still keep the reward.]
]

// 5 · Architecture and next test (2:30–3:00)
#slide(5, [Under the hood])[
  #headline([What Socra checks], [The model guides. The server checks the work and decides the reward.])
  #grid(
    columns: (1fr,) * 3, column-gutter: 15pt,
    card(height: 150pt, suit: [♠], pip: day.cat)[
      #eyebrow[01 · OpenAI]
      #v(5pt)
      #title[Guides]
      #v(9pt)
      #copy(size: 17pt)[Drafts tutor replies, extracts claims, and grades testimony.]
    ],
    card(height: 150pt, suit: [♣], pip: day.ink)[
      #eyebrow[02 · Rust verifier]
      #v(5pt)
      #title[Checks]
      #v(9pt)
      #copy(size: 17pt)[Checks supported steps and final answers on verified problems.]
    ],
    card(height: 150pt, suit: [♥])[
      #eyebrow[03 · Reward rules]
      #v(5pt)
      #title[Pays]
      #v(9pt)
      #copy(size: 17pt)[Applies reward rules and daily caps, then mints eligible rewards on devnet.]
    ],
  )
  #v(12pt)
  #card(bg: day.accent)[
    #eyebrow[Next test]
    #v(4pt)
    #title(size: 27pt)[Do rewards make students choose guided practice?]
    #v(9pt)
    #copy(size: 17pt)[Compare Socra with and without rewards. Measure who returns and who solves a new problem days later.]
  ]
]
