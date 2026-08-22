# BridgeMUN

An app that helps students participate in a Model UN conference. Students join
committees as delegates, discuss real MUN topics, and debate alongside AI
delegates that take part as if they were students.

The person building this is learning to code, so clarity matters more than
cleverness.

## Current scope

A small website built from plain HTML, CSS and JavaScript, with Firebase
providing accounts and the shared database. There is no build step and nothing
to install — Firebase is loaded straight from Google's servers.

It does this:

- Delegates create an account and sign in (email and password)
- Each delegate picks the country they represent when signing up
- One committee page shows the topic and the roster of countries
- Delegates post speeches, which every signed-in delegate sees live
- A speech can have an optional title
- A speech can be dictated out loud instead of typed, using the browser's
  built-in speech recognition
- Delegates add themselves to a speakers' list; whoever is top has the floor
- One person signs up as chair and runs the session: a shared speech clock,
  removing speakers, moving to the next speaker
- The chair puts a motion to a vote; delegates answer Yes, No or Abstain, the
  tally updates live, and the outcome is written into the discussion
- A button posts a mock opening speech from the AI delegate

The AI speech is still written into the code by hand. There is no real AI call
yet.

Deliberately **not** in scope right now: real AI-written speeches, motions and
voting, multiple committees, storing the audio of a recording. Do not add these
unless asked.

## How to run it

It must be served over `http://`, not opened by double-clicking. Firebase login
and the microphone both refuse to work from a `file://` address.

```bash
cd "/Users/paul/Desktop/MUN Project"
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## The files

| File | What it is |
| --- | --- |
| `index.html` | Sign in / create account — the first page |
| `committee.html` | The committee: roster, discussion, recording |
| `style.css` | All styling for both pages |
| `firebase-config.js` | Firebase keys and connection setup |
| `auth.js` | Sign-in page behaviour |
| `committee.js` | Feed, posting, and voice recording |
| `firestore.rules` | Database security rules, pasted into Firebase |

## How the code is organized

Each page is one HTML file for the layout plus one JavaScript file for the
behaviour. All styling lives in `style.css`; do not add `<style>` blocks to the
HTML files.

Data lives in Firebase, in four collections:

- `users` — one document per delegate: name, country, flag, role
- `posts` — one document per speech: who said it, what they said, when
- `speakers` — one document per delegate waiting to speak, ordered by when
  they joined the queue
- `session` — a single document, `current`, holding the speech clock
- `votes` — one document per vote, each holding a `ballots` sub-collection with
  one document per delegate, filed under their account id so nobody votes twice

The speech clock is not run inside one browser. The chair writes down when it
started and how long it runs for; every page works out the remaining time from
those two values, so all the screens agree.

The discussion feed is drawn from the database, not typed into the HTML. When a
speech is posted, it is saved to `posts` and the live listener redraws the feed
by itself. Do not add messages to the page directly.

The delegate roster in `committee.html` is still written out by hand. It is the
list of seats in the room, not a list of who has signed up.

## Design rules

- Beige background, white cards, warm near-black text
- Rounded corners everywhere; no sharp edges
- One accent colour only (a muted navy), used sparingly
- Generous empty space — the page should feel uncrowded
- The UN-style emblem stays small

Colours are defined once at the top of `style.css`. Change them there, not in
individual rules.

## Rules for Claude

### 1. Comment the code

Write a comment explaining what the code does whenever you write it. Say what a
block is *for* in plain language, not just what the syntax is. Assume the reader
is new to programming.

### 2. Make small changes

Edit the smallest piece that solves the problem. Do not rewrite working code,
reorganize files, rename things, or "clean up" nearby code unless it was asked
for. If a change looks like it needs a large rewrite, say so first and explain
why, then wait.

### 3. Explain what changed

After finishing a task, explain in simple terms what changed and what will look
or behave differently. No jargon. If something was left out or does not work
yet, say that plainly.
