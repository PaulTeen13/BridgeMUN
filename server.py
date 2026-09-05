"""
BridgeMUN local server.

This replaces the `python3 -m http.server` command you were running.
It does the same job — hands the browser index.html, committee.html,
style.css and the rest — but it can also do one thing more: ask Claude
for a debate topic.

Why a server is needed at all:

    The API key must never appear in committee.js. Anything in that
    file is downloadable by anyone who opens the site, so a key there
    would be a key given away. Instead the browser asks THIS program
    for a topic, and this program — running on your own machine, where
    the key lives — talks to Claude.

    Browser  ->  server.py (holds the key)  ->  Claude

Run it with:

    python3 server.py

Then open http://localhost:5173
"""

import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import anthropic


# The address the site is served on. Change this if 5173 is busy.
PORT = 5173

# Which Claude model to ask. See README for what this costs.
MODEL = "claude-opus-5"

# The folder holding index.html and friends — the one this file is in.
PROJECT_FOLDER = os.path.dirname(os.path.abspath(__file__))


def load_env_file():
    """Reads the .env file and puts what it finds into the environment.

    A .env file is just lines of NAME=value. Keeping the key there
    rather than in the code means the key never gets committed to
    GitHub — .gitignore blocks the file.
    """
    path = os.path.join(PROJECT_FOLDER, ".env")

    if not os.path.exists(path):
        return

    with open(path) as env_file:
        for line in env_file:
            line = line.strip()

            # Skip blank lines and comments.
            if not line or line.startswith("#") or "=" not in line:
                continue

            name, value = line.split("=", 1)
            # Strip any quotes people wrap their keys in.
            os.environ[name.strip()] = value.strip().strip('"').strip("'")


load_env_file()


# Set up the connection to Claude. If there is no key, the site still
# works — the Suggest button just falls back to its built-in list of
# topics instead of asking for a new one.
if os.environ.get("ANTHROPIC_API_KEY"):
    claude = anthropic.Anthropic()
else:
    claude = None
    print(
        "\n  No ANTHROPIC_API_KEY found.\n"
        "  The site will run, but 'Suggest a topic' will fall back to its\n"
        "  built-in list. To enable Claude, put your key in a .env file:\n"
        "      ANTHROPIC_API_KEY=sk-ant-...\n"
    )


# Which UN Sustainable Development Goal the topics must sit inside.
# To move the committee to a different goal, change these three values
# and nothing else.
SDG_NUMBER = "9"
SDG_NAME = "Industry, Innovation and Infrastructure"
SDG_SCOPE = (
    "building resilient and sustainable infrastructure; inclusive and "
    "sustainable industrialisation; access to finance and markets for "
    "small-scale industry; scientific research and domestic technological "
    "capability; retrofitting industry to be cleaner and more resource "
    "efficient; and the digital divide, meaning universal and affordable "
    "access to information and communications technology"
)


# What Claude is told about its job, every time. Kept short and strict,
# because we want one usable line back — not a paragraph explaining
# itself.
TOPIC_INSTRUCTIONS = (
    "You suggest debate topics for a Model UN committee. "
    "Every topic you suggest must fall inside UN Sustainable Development "
    "Goal " + SDG_NUMBER + " (" + SDG_NAME + "), which covers: "
    + SDG_SCOPE + ". "
    "Do not stray outside that goal, even if another issue seems more "
    "obviously suited to the committee. "
    "Reply with the topic and nothing else: one line, no quotation marks, "
    "no numbering, no explanation, no closing remark. "
    "Between four and twelve words. "
    "Phrase it the way a conference programme would print it. "
    "It must be a real, current issue that delegates could argue about "
    "from genuinely different national positions."
)


def ask_claude_for_topic(committee, avoid):
    """Asks Claude for one debate topic.

    "committee" is the name of the committee, e.g. "UN Security Council".
    "avoid" is a list of topics already suggested, so it does not repeat
    itself. Returns the topic as a string.
    """
    request = (
        "Suggest one debate topic for the " + committee +
        ", within Sustainable Development Goal " + SDG_NUMBER + "."
    )

    if avoid:
        request += (
            "\n\nDo not suggest any of these, or anything close to them:\n- "
            + "\n- ".join(avoid)
        )

    response = claude.beta.messages.create(
        model=MODEL,
        # Room for Claude to think before answering. The reply itself is
        # one line, but thinking counts towards this limit too.
        max_tokens=4000,
        # "low" effort: this is a small, well-defined task, so there is
        # no need to pay for deep deliberation.
        output_config={"effort": "low"},
        # If Claude declines to answer, the request is automatically
        # retried on another model rather than simply failing.
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=TOPIC_INSTRUCTIONS,
        messages=[{"role": "user", "content": request}],
    )

    # Claude can decline a request. Check before reading the answer.
    if response.stop_reason == "refusal":
        raise RuntimeError("Claude declined to answer that request.")

    # The reply comes back as a list of blocks. We want the text one.
    for block in response.content:
        if block.type == "text" and block.text.strip():
            return block.text.strip()

    raise RuntimeError("Claude returned an empty answer.")


class BridgeMunHandler(SimpleHTTPRequestHandler):
    """Serves the website, and answers requests for a topic."""

    def __init__(self, *args, **kwargs):
        # Serve files out of the project folder, whatever folder the
        # command happened to be run from.
        super().__init__(*args, directory=PROJECT_FOLDER, **kwargs)

    def do_POST(self):
        """Handles the browser asking for a topic."""
        if self.path != "/api/topic":
            self.send_error(404, "No such address")
            return

        if claude is None:
            self.reply(503, {"error": "No API key set on the server."})
            return

        # Read what the browser sent.
        try:
            length = int(self.headers.get("Content-Length", 0))
            sent = json.loads(self.rfile.read(length) or "{}")
        except (ValueError, json.JSONDecodeError):
            self.reply(400, {"error": "Could not read the request."})
            return

        committee = sent.get("committee") or "UN Security Council"
        avoid = sent.get("avoid") or []

        # Ask Claude, and turn any problem into a readable sentence
        # rather than a crash.
        try:
            topic = ask_claude_for_topic(committee, avoid)
            self.reply(200, {"topic": topic})

        except anthropic.AuthenticationError:
            self.reply(401, {"error": "That API key was not accepted."})
        except anthropic.RateLimitError:
            self.reply(429, {"error": "Too many requests. Wait a moment."})
        except anthropic.APIConnectionError:
            self.reply(503, {"error": "Could not reach Claude. Check your connection."})
        except anthropic.APIStatusError as problem:
            self.reply(502, {"error": "Claude returned an error: " + problem.message})
        except RuntimeError as problem:
            self.reply(502, {"error": str(problem)})

    def reply(self, status, payload):
        """Sends one JSON answer back to the browser."""
        body = json.dumps(payload).encode("utf-8")

        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    # ThreadingHTTPServer means a slow request to Claude does not stop
    # the rest of the site from loading while it waits.
    server = ThreadingHTTPServer(("localhost", PORT), BridgeMunHandler)

    print("BridgeMUN is running at http://localhost:" + str(PORT))
    print("Press Control-C to stop it.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
