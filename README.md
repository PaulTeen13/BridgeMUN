# BridgeMUN

A web app for running a Model UN committee, where students debate alongside AI
delegates that take part as if they were students.

Delegates sign in, take a seat as a country, join the speakers' list, and give
speeches — typed or spoken aloud. A chair runs the session: the speech clock,
the order of speakers, and votes on motions. Everything appears live on every
delegate's screen at once.

## What it does

**Accounts and seats**
- Sign up with email and password, choosing the country you represent
- Or sign up as the chair, who runs the committee instead of representing a
  country
- Click a country in the roster to see which student holds that seat

**Debate**
- A live discussion feed, shared by everyone signed in
- Speeches can carry an optional title
- Speeches can be dictated out loud, transcribed by the browser as you speak
- Any speech can be read back aloud, in whichever English accent the listener
  prefers — a personal setting, so a student new to Model UN can follow every
  delegate in an accent they find easy
- A notice appears when speeches arrive while you are reading elsewhere

**Running the committee**
- A speakers' list delegates add themselves to; whoever is at the top has
  the floor
- A speech clock every delegate sees, started and stopped by the chair
- Voting: the chair puts a motion to the floor, delegates answer Yes, No or
  Abstain, the tally updates live, and the outcome is written permanently into
  the discussion
- The chair sets the committee topic, and can ask Claude to suggest one.
  Suggestions are constrained to UN Sustainable Development Goal 9 — Industry,
  Innovation and Infrastructure

## What is not real yet

**The AI delegate is a hand-written paragraph.** Pressing "Generate AI opening
speech" posts a speech that is typed into the source code. There is no model
call behind it. Topic suggestions, by contrast, are genuinely written by Claude
— that path already exists in `server.py` and the delegate's speech could
follow it.

**Voice recording needs Chrome, Edge or Safari.** It uses the browser's own
speech recognition, which Firefox does not have. The button disables itself and
says so there. Audio is transcribed live and never saved.

**Accents depend on the listener's computer.** Reading speeches aloud uses the
voices the operating system already has, so the choice on offer differs from
machine to machine — a Mac typically has six English accents, a Windows laptop
may have two. They are English varieties (American, British, Indian,
Australian…), not arbitrary national accents.

**Anyone can sign up as the chair.** There is no invitation system. Fine for a
classroom, not for anything public.

Not built: motions raised by delegates, P5 veto power, roll-call voting,
resolution drafting, or multiple committees.

## Running it

There is no build step. You do need your own Firebase project, because the
database and accounts are yours, not shared.

**1. Create a Firebase project** at
[console.firebase.google.com](https://console.firebase.google.com)

- Register a web app, and copy the config values into the top of
  `firebase-config.js`
- Under Authentication, enable the **Email/Password** sign-in method
- Create a **Firestore** database
- Open the Firestore **Rules** tab and paste in the contents of
  `firestore.rules`

**2. Install the one Python dependency**

```bash
pip3 install -r requirements.txt
```

**3. Add an Anthropic API key** — optional, only for topic suggestions

```bash
cp .env.example .env
```

Then put a key from [console.anthropic.com](https://console.anthropic.com) into
that file. Without one, everything still runs — "Suggest a topic" simply falls
back to a fixed list in `committee.js` instead of asking Claude.

**4. Start the server**

```bash
python3 server.py
```

Then open <http://localhost:5173>.

It must be served over `http://`, not opened by double-clicking the file.
Firebase sign-in and the microphone both refuse to work from a `file://`
address.

## The files

| File | What it is |
| --- | --- |
| `index.html` | Sign in / create account — the first page |
| `committee.html` | The committee: roster, speakers' list, voting, discussion |
| `style.css` | All styling for both pages |
| `firebase-config.js` | Firebase keys and connection setup |
| `auth.js` | Sign-in page behaviour |
| `committee.js` | Feed, posting, recording, speakers' list, clock, voting |
| `firestore.rules` | Database security rules, pasted into Firebase |

## How it is built

Plain HTML, CSS and JavaScript — no framework, no bundler, no `npm install`.
Firebase is loaded straight from Google's servers as an ES module.

Data lives in Firebase in five collections: `users`, `posts`, `speakers`,
`session`, and `votes`.

The speech clock is worth a note. It does not run inside one browser and get
broadcast. The chair records *when* it started and *how long* it runs for, and
every page works out the remaining time from those two values — which is why
all the screens agree instead of drifting apart.

## A note on the Firebase keys

The values in `firebase-config.js` are committed on purpose. Firebase web keys
are public identifiers, not passwords: they say which project to talk to, not
who is allowed in. What actually protects the data is `firestore.rules`.

A Firebase **service account key** would be a real secret. There is none in this
project, and `.gitignore` blocks one from being committed by accident.
