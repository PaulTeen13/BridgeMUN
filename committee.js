/* ---------------------------------------------------------------
   COMMITTEE PAGE BEHAVIOUR

   This file makes committee.html work. It does four things:
     1. Checks that somebody is signed in, and finds out who.
     2. Shows every speech in the committee, updating live.
     3. Lets the signed-in delegate post a speech of their own.
     4. Lets them dictate that speech out loud instead of typing.
   --------------------------------------------------------------- */

import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

import {
  collection,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";


/* ---------------------------------------------------------------
   FINDING THE PARTS OF THE PAGE WE NEED
   --------------------------------------------------------------- */

const discussionArea = document.getElementById("discussion");
const feedEmpty = document.getElementById("feed-empty");
const feedCount = document.getElementById("feed-count");
const postTitle = document.getElementById("post-title");
const postText = document.getElementById("post-text");
const postButton = document.getElementById("post-button");
const recordButton = document.getElementById("record-button");
const recordStatus = document.getElementById("record-status");
const aiButton = document.getElementById("ai-button");
const currentUserLabel = document.getElementById("current-user");
const signoutButton = document.getElementById("signout-button");

const newSpeechAlert = document.getElementById("new-speech-alert");

// The speakers' list and the clock.
const speakerList = document.getElementById("speaker-list");
const speakersEmpty = document.getElementById("speakers-empty");
const speakersCount = document.getElementById("speakers-count");
const queueButton = document.getElementById("queue-button");
const chairControls = document.getElementById("chair-controls");
const timerBox = document.getElementById("timer");
const timerClock = document.getElementById("timer-clock");
const timerLabel = document.getElementById("timer-label");

// Voting.
const voteIdle = document.getElementById("vote-idle");
const voteOpenBox = document.getElementById("vote-open");
const voteQuestion = document.getElementById("vote-question");
const voteButtons = document.getElementById("vote-buttons");
const voteTally = document.getElementById("vote-tally");
const voteNote = document.getElementById("vote-note");
const voteChairControls = document.getElementById("vote-chair-controls");
const voteQuestionInput = document.getElementById("vote-question-input");
const openVoteButton = document.getElementById("open-vote");
const closeVoteButton = document.getElementById("close-vote");


/* ---------------------------------------------------------------
   WHO IS SIGNED IN

   Filled in once Firebase confirms the account, and used to label
   every speech this person posts.
   --------------------------------------------------------------- */

let currentDelegate = null;

// Whether the page has already been wired up to the database.
let pageAlreadySetUp = false;


/* ---------------------------------------------------------------
   STEP 1 — CHECK SOMEBODY IS SIGNED IN

   Firebase calls this when the page opens, and again whenever the
   delegate signs in or out. If nobody is signed in, the page is
   not theirs to see, so they get sent back to the sign-in screen.
   --------------------------------------------------------------- */

onAuthStateChanged(auth, async function (user) {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  // Look up the name and country saved when the account was made.
  const profileSnapshot = await getDoc(doc(db, "users", user.uid));
  const profile = profileSnapshot.exists() ? profileSnapshot.data() : {};

  currentDelegate = {
    uid: user.uid,
    name: profile.name || "Delegate",
    country: profile.country || "Unknown",
    flag: profile.flag || "🌐",
    // Accounts made before roles existed are treated as delegates.
    role: profile.role || "Delegate"
  };

  // Shows who is signed in, up in the header. The chair represents
  // the committee rather than a country, so they are simply named
  // as the chair.
  currentUserLabel.textContent = currentDelegate.role === "Chair"
    ? currentDelegate.flag + "  Chair"
    : currentDelegate.flag + "  " + currentDelegate.country;

  // The chair sees the controls for running the session. Everybody
  // else never knows they exist.
  if (currentDelegate.role === "Chair") {
    chairControls.hidden = false;
    voteChairControls.hidden = false;
    // A chair runs the vote but does not cast one, as in a real
    // committee, so the Yes/No/Abstain buttons are not for them.
    voteButtons.hidden = true;
  }

  // Only now start listening, because reading any of this requires
  // being signed in.
  // Firebase calls this again from time to time — for instance when
  // it quietly renews the sign-in. Setting everything up a second
  // time would leave two listeners watching the same data and two
  // name lines on every roster tile, so it is done only once.
  if (pageAlreadySetUp) return;
  pageAlreadySetUp = true;

  listenToDiscussion();
  listenToSpeakers();
  listenToClock();
  listenToVotes();
  setUpRoster();
  listenToDelegates();
});

// The sign-out link in the header.
signoutButton.addEventListener("click", async function () {
  await signOut(auth);
  window.location.href = "index.html";
});


/* ---------------------------------------------------------------
   STEP 2 — SHOW THE DISCUSSION, LIVE

   "onSnapshot" is the important part here. Rather than fetching
   the speeches once, it keeps watching the database. If another
   delegate posts from their own laptop, this page redraws by
   itself — no refreshing needed.
   --------------------------------------------------------------- */

function listenToDiscussion() {
  // Ask for every speech, oldest first.
  const speeches = query(collection(db, "posts"), orderBy("createdAt"));

  onSnapshot(speeches, function (snapshot) {
    // Before redrawing, note two things: which speeches are new
    // since last time, and whether the reader was already looking
    // at the bottom of the feed.
    const wasReadingNewest = isNewestVisible();
    const arrivals = snapshot.docChanges().filter(function (change) {
      return change.type === "added";
    });

    // Clear whatever is on screen and rebuild it from the database.
    discussionArea.textContent = "";

    if (snapshot.empty) {
      const empty = document.createElement("p");
      empty.className = "feed-empty";
      empty.textContent = "Nobody has spoken yet. Be the first to take the floor.";
      discussionArea.appendChild(empty);
      feedCount.textContent = "";
      return;
    }

    snapshot.forEach(function (speechDoc) {
      addMessageToScreen(speechDoc.data());
    });

    const total = snapshot.size;
    feedCount.textContent = total === 1 ? "1 speech" : total + " speeches";

    // Now decide whether the reader needs telling about any of it.
    announceArrivals(arrivals, wasReadingNewest);
  },
  function (error) {
    // If reading fails, say so on the page instead of leaving it
    // stuck on "Loading…" forever.
    discussionArea.textContent = "";
    const failed = document.createElement("p");
    failed.className = "feed-empty";
    failed.textContent = "Could not load the discussion: " + error.message;
    discussionArea.appendChild(failed);
  });
}


/* Turns one speech from the database into the boxes that appear on
   screen. Everything is inserted with "textContent", which treats
   what a delegate typed as plain words — so nobody can sneak code
   into the page through a speech. */
function addMessageToScreen(speech) {
  const message = document.createElement("div");
  message.className = "message";

  // The round flag patch on the left.
  const flagPatch = document.createElement("span");
  flagPatch.className = "flag";
  flagPatch.textContent = speech.flag || "🌐";

  // Everything to the right of the flag.
  const body = document.createElement("div");

  // Top line: country, human-or-AI badge, and the time.
  const header = document.createElement("div");
  header.className = "message-header";

  const countryLabel = document.createElement("span");
  countryLabel.className = "message-country";
  countryLabel.textContent = speech.country || "Unknown";

  // A vote result is not a delegate speaking, so it is labelled as
  // the committee's decision rather than as a human or an AI.
  const badge = document.createElement("span");

  if (speech.kind === "result") {
    badge.className = "badge badge-ai";
    badge.textContent = "Result";
  } else {
    badge.className = speech.isAI ? "badge badge-ai" : "badge";
    badge.textContent = speech.isAI ? "AI delegate" : "Human";
  }

  header.appendChild(countryLabel);
  header.appendChild(badge);

  // The time is missing for a moment on speeches you have only
  // just posted, because the clock is set by Firebase's servers.
  if (speech.createdAt) {
    const time = document.createElement("span");
    time.className = "message-time";
    time.textContent = speech.createdAt.toDate().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
    header.appendChild(time);
  }

  body.appendChild(header);

  // The subject line, shown in bold above the speech. Speeches
  // posted without a title simply skip this.
  if (speech.title) {
    const title = document.createElement("p");
    title.className = "message-title";
    title.textContent = speech.title;
    body.appendChild(title);
  }

  // What was actually said.
  const paragraph = document.createElement("p");
  paragraph.className = "message-text";
  paragraph.textContent = speech.text;

  body.appendChild(paragraph);
  message.appendChild(flagPatch);
  message.appendChild(body);
  discussionArea.appendChild(message);
}


/* ---------------------------------------------------------------
   TELLING THE READER ABOUT NEW SPEECHES

   Speeches can arrive at any moment from any delegate. Jumping the
   page down to them would snatch it away from somebody in the
   middle of reading, so instead a small notice appears and lets
   them go and look when they are ready.
   --------------------------------------------------------------- */

// How many unseen speeches have arrived.
let unreadCount = 0;

// The very first snapshot delivers the whole existing debate. That
// is not "new", so it must not set off the notice.
let isFirstLoad = true;

// The page title without any count on the front of it.
const baseTitle = document.title;


/* Is the most recent speech currently on screen? Used to work out
   whether the reader has already seen what just arrived. */
function isNewestVisible() {
  const messages = discussionArea.querySelectorAll(".message");
  if (messages.length === 0) return true;

  const newest = messages[messages.length - 1];
  const box = newest.getBoundingClientRect();

  // True when any part of it is inside the window.
  return box.top < window.innerHeight && box.bottom > 0;
}


/* Scrolls the newest speech into the middle of the window. */
function scrollToNewest() {
  const messages = discussionArea.querySelectorAll(".message");
  if (messages.length === 0) return;

  // Glide there, unless the reader has asked for less movement.
  const wantsLessMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  messages[messages.length - 1].scrollIntoView({
    behavior: wantsLessMotion ? "auto" : "smooth",
    block: "center"
  });
}


/* Decides whether newly arrived speeches are worth interrupting
   for, and if so puts the notice on screen. */
function announceArrivals(arrivals, wasReadingNewest) {
  // The opening load of the existing debate is not news.
  if (isFirstLoad) {
    isFirstLoad = false;
    return;
  }

  if (arrivals.length === 0) return;

  // Your own speech never notifies you. Instead the page moves to
  // it, so you can see it actually landed.
  const fromOthers = arrivals.filter(function (change) {
    return !currentDelegate || change.doc.data().uid !== currentDelegate.uid;
  });

  if (fromOthers.length < arrivals.length) {
    scrollToNewest();
  }

  if (fromOthers.length === 0) return;

  // Already watching the bottom of the feed with the tab in front?
  // Then they have seen it, and a notice would just be noise.
  if (wasReadingNewest && !document.hidden) return;

  unreadCount += fromOthers.length;
  showNewSpeechAlert();
}


/* Puts the notice on screen, and a count in the browser tab so it
   is visible even when BridgeMUN is in the background. */
function showNewSpeechAlert() {
  newSpeechAlert.hidden = false;
  newSpeechAlert.textContent =
    unreadCount === 1 ? "1 new speech ↓" : unreadCount + " new speeches ↓";
  document.title = "(" + unreadCount + ") " + baseTitle;
}


/* Takes the notice away and puts the tab title back to normal. */
function clearNewSpeechAlert() {
  unreadCount = 0;
  newSpeechAlert.hidden = true;
  document.title = baseTitle;
}


// Clicking the notice takes the reader to what they missed.
newSpeechAlert.addEventListener("click", function () {
  scrollToNewest();
  clearNewSpeechAlert();
});

// Scrolling down to the newest speech by hand counts as reading it.
window.addEventListener("scroll", function () {
  if (unreadCount > 0 && !document.hidden && isNewestVisible()) {
    clearNewSpeechAlert();
  }
});

// Coming back to the tab, with the newest speech already on screen,
// also counts.
document.addEventListener("visibilitychange", function () {
  if (!document.hidden && unreadCount > 0 && isNewestVisible()) {
    clearNewSpeechAlert();
  }
});


/* ---------------------------------------------------------------
   STEP 3 — POSTING A SPEECH

   Saves one speech to the database. Nothing is drawn on screen
   here: the live listener above notices the new speech and draws
   it, the same as it would for anybody else's.
   --------------------------------------------------------------- */

async function postSpeech(title, text, speaker, isAI, kind) {
  await addDoc(collection(db, "posts"), {
    uid: speaker.uid,
    name: speaker.name,
    country: speaker.country,
    flag: speaker.flag,
    isAI: isAI,
    // "speech" for anything a delegate said, "result" for the
    // outcome of a vote. Lets the feed label them differently.
    kind: kind || "speech",
    title: title,
    text: text,
    createdAt: serverTimestamp()
  });
}

postButton.addEventListener("click", async function () {
  const title = postTitle.value.trim();
  const text = postText.value.trim();

  // Nothing typed, nothing to post.
  if (text === "") {
    postText.focus();
    return;
  }
  if (!currentDelegate) return;

  // Stop the microphone first, so it does not keep writing into a
  // box that is about to be emptied.
  if (isRecording) stopRecording();

  postButton.disabled = true;
  postButton.textContent = "Posting…";

  try {
    await postSpeech(title, text, currentDelegate, false);
    postTitle.value = "";
    postText.value = "";
    recordStatus.textContent = "";

    // Having spoken, this delegate no longer needs the floor, so
    // they come off the speakers' list automatically.
    if (myQueueEntryId) {
      await leaveQueue(myQueueEntryId);
    }
  } catch (error) {
    recordStatus.textContent = "Could not post: " + error.message;
  }

  postButton.disabled = false;
  postButton.textContent = "Post";
});


/* ---------------------------------------------------------------
   THE AI DELEGATE

   Still a speech written by hand, not generated. The difference
   now is that pressing the button saves it to the database like
   any other speech, so every delegate in the committee sees it.
   --------------------------------------------------------------- */

const aiDelegate = {
  uid: "ai-united-states",
  name: "AI delegate",
  country: "United States of America",
  flag: "🇺🇸"
};

const aiOpeningSpeech =
  "Honorable chair, distinguished delegates. The United States recognizes " +
  "that autonomous weapons systems carry both real security value and " +
  "serious humanitarian risk. We hold that meaningful human control must " +
  "remain central to their use, and we favor shared international " +
  "standards over an outright ban. We look forward to working with this " +
  "committee towards a framework that is practical and verifiable.";

aiButton.addEventListener("click", async function () {
  aiButton.disabled = true;
  aiButton.textContent = "Posting…";

  try {
    await postSpeech("Opening speech", aiOpeningSpeech, aiDelegate, true);
    aiButton.textContent = "Opening speech delivered";
  } catch (error) {
    aiButton.textContent = "Generate AI opening speech";
    aiButton.disabled = false;
    recordStatus.textContent = "Could not post: " + error.message;
  }
});


/* ---------------------------------------------------------------
   WHO IS SITTING IN EACH SEAT

   The roster in committee.html is the list of seats in the room. It
   does not know which student is in which seat — that comes from
   the accounts people signed up with.

   Clicking a country reveals the name of the delegate holding it,
   or says so plainly when nobody has claimed it yet.
   --------------------------------------------------------------- */

// Everyone who has signed up, grouped by the country they chose.
let delegatesByCountry = {};


/* Watches the list of accounts. Kept live, so a seat filled by
   somebody signing up mid-session updates without a refresh. */
function listenToDelegates() {
  onSnapshot(collection(db, "users"), function (snapshot) {
    delegatesByCountry = {};

    snapshot.forEach(function (userDoc) {
      const person = userDoc.data();
      if (!person.country) return;

      // Several students could pick the same country, so each
      // seat holds a list rather than a single name.
      if (!delegatesByCountry[person.country]) {
        delegatesByCountry[person.country] = [];
      }
      delegatesByCountry[person.country].push(person);
    });

    // Any name already on screen may now be out of date.
    refreshOpenNames();
  });
}


/* Prepares each tile in the roster: works out which country it is,
   gives it a hidden line for the name, and makes it respond to
   being clicked or reached with the keyboard. */
function setUpRoster() {
  const tiles = document.querySelectorAll(".delegate");

  tiles.forEach(function (tile) {
    const countryLabel = tile.querySelector(".delegate-country");
    if (!countryLabel) return;

    const country = countryLabel.textContent.trim();

    // Is this seat marked as being played by an AI?
    const isAiSeat = tile.querySelector(".badge-ai") !== null;

    // The line that will hold the name, hidden until asked for.
    const nameLine = document.createElement("div");
    nameLine.className = "delegate-name";
    nameLine.hidden = true;
    countryLabel.parentElement.appendChild(nameLine);

    // Remembered so the tile can be updated later.
    tile.nameLine = nameLine;
    tile.country = country;
    tile.isAiSeat = isAiSeat;

    // Lets the tile be reached by pressing Tab, and tells screen
    // reading software it behaves like a button.
    tile.setAttribute("tabindex", "0");
    tile.setAttribute("role", "button");

    function toggleName() {
      nameLine.hidden = !nameLine.hidden;
      if (!nameLine.hidden) writeSeatHolder(tile);
    }

    tile.addEventListener("click", toggleName);

    // Enter and space press it, the same as a real button would.
    tile.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleName();
      }
    });
  });
}


/* Puts the right words on one tile's name line. */
function writeSeatHolder(tile) {
  const people = delegatesByCountry[tile.country] || [];

  if (people.length > 0) {
    // Usually one name; more if several students chose the country.
    tile.nameLine.textContent = people
      .map(function (person) {
        return person.role === "Chair"
          ? person.name + " (Chair)"
          : person.name;
      })
      .join(", ");
    return;
  }

  // Nobody signed up for this seat.
  tile.nameLine.textContent = tile.isAiSeat
    ? "Played by an AI delegate"
    : "Unregistered";
}


/* Updates every tile whose name is currently showing. */
function refreshOpenNames() {
  document.querySelectorAll(".delegate").forEach(function (tile) {
    if (tile.nameLine && !tile.nameLine.hidden) {
      writeSeatHolder(tile);
    }
  });
}


/* ---------------------------------------------------------------
   THE SPEAKERS' LIST

   The queue of delegates waiting to speak, in the order they asked
   for the floor. Whoever is at the top has it.

   Like the discussion, this is watched live, so when a delegate on
   another laptop joins the queue it appears here immediately.
   --------------------------------------------------------------- */

// Where this delegate's own place in the queue is stored, so they
// can be taken back off it again. Null when not queued.
let myQueueEntryId = null;

function listenToSpeakers() {
  // Everyone waiting, in the order they joined.
  const waiting = query(collection(db, "speakers"), orderBy("addedAt"));

  onSnapshot(waiting, function (snapshot) {
    speakerList.textContent = "";
    myQueueEntryId = null;

    // An empty queue gets a line of text instead of a blank gap.
    speakersEmpty.hidden = !snapshot.empty;
    speakersCount.textContent = snapshot.empty
      ? ""
      : snapshot.size === 1 ? "1 waiting" : snapshot.size + " waiting";

    let position = 0;

    snapshot.forEach(function (entry) {
      const speaker = entry.data();
      position += 1;

      // Remember our own entry so the button can remove it.
      if (currentDelegate && speaker.uid === currentDelegate.uid) {
        myQueueEntryId = entry.id;
      }

      addSpeakerToScreen(speaker, entry.id, position === 1);
    });

    // The button says the opposite of whatever state we are in.
    queueButton.textContent = myQueueEntryId
      ? "Leave the list"
      : "Add me to the list";
  });
}


/* Draws one delegate in the queue. The first one is marked as
   having the floor. */
function addSpeakerToScreen(speaker, entryId, hasFloor) {
  const row = document.createElement("li");
  row.className = hasFloor ? "speaker speaker-current" : "speaker";

  const flagPatch = document.createElement("span");
  flagPatch.className = "flag";
  flagPatch.textContent = speaker.flag || "🌐";

  const country = document.createElement("span");
  country.className = "speaker-country";
  country.textContent = speaker.country || "Unknown";

  row.appendChild(flagPatch);
  row.appendChild(country);

  if (hasFloor) {
    const tag = document.createElement("span");
    tag.className = "speaker-tag";
    tag.textContent = "Has the floor";
    row.appendChild(tag);
  }

  // You may take yourself off the list; the chair may remove
  // anybody. The database rules enforce this too, so it is not
  // just the button being hidden.
  const canRemove =
    currentDelegate &&
    (speaker.uid === currentDelegate.uid || currentDelegate.role === "Chair");

  if (canRemove) {
    const remove = document.createElement("button");
    remove.className = "speaker-remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", function () {
      leaveQueue(entryId);
    });
    row.appendChild(remove);
  }

  speakerList.appendChild(row);
}


/* Puts this delegate at the back of the queue. */
async function joinQueue() {
  if (!currentDelegate) return;

  await addDoc(collection(db, "speakers"), {
    uid: currentDelegate.uid,
    name: currentDelegate.name,
    country: currentDelegate.country,
    flag: currentDelegate.flag,
    addedAt: serverTimestamp()
  });
}


/* Takes one delegate off the queue. */
async function leaveQueue(entryId) {
  await deleteDoc(doc(db, "speakers", entryId));
}


// One button that both joins and leaves.
queueButton.addEventListener("click", async function () {
  queueButton.disabled = true;

  try {
    if (myQueueEntryId) {
      await leaveQueue(myQueueEntryId);
    } else {
      await joinQueue();
    }
  } catch (error) {
    recordStatus.textContent = "Could not update the list: " + error.message;
  }

  queueButton.disabled = false;
});


/* ---------------------------------------------------------------
   THE SPEECH CLOCK

   Every delegate needs to see the same countdown, so the clock
   cannot simply run inside one person's browser. Instead the chair
   writes down *when* the clock was started and *how long* it runs
   for, and every laptop works out the remaining time from that.
   That way all the screens agree.
   --------------------------------------------------------------- */

// The most recent clock instruction from the chair.
let clockState = null;

function listenToClock() {
  onSnapshot(doc(db, "session", "current"), function (snapshot) {
    clockState = snapshot.exists() ? snapshot.data() : null;
    drawClock();
  });
}

/* Works out how much time is left and puts it on screen. Runs four
   times a second so the countdown looks smooth. */
function drawClock() {
  // No clock running: hide the whole thing.
  if (!clockState || !clockState.running || !clockState.startedAt) {
    timerBox.hidden = true;
    return;
  }

  timerBox.hidden = false;

  // How long since the chair started it.
  const startedMs = clockState.startedAt.toDate().getTime();
  const elapsedSeconds = (Date.now() - startedMs) / 1000;
  let remaining = Math.ceil(clockState.seconds - elapsedSeconds);

  if (remaining < 0) remaining = 0;

  // Turn the numbers into "1:05" rather than "65".
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  timerClock.textContent = minutes + ":" + String(seconds).padStart(2, "0");

  if (remaining === 0) {
    timerLabel.textContent = "time is up";
    timerBox.classList.add("timer-low");
  } else {
    timerLabel.textContent = "remaining";
    // The last ten seconds turn red as a warning.
    timerBox.classList.toggle("timer-low", remaining <= 10);
  }
}

// Keeps the countdown ticking between database updates.
setInterval(drawClock, 250);


/* ---------------------------------------------------------------
   CHAIR CONTROLS

   Starting and stopping the clock, and moving the queue along.
   These buttons only appear for the chair, and the database rules
   refuse the change for anyone else.
   --------------------------------------------------------------- */

/* Starts the clock for the given number of seconds. */
async function startClock(seconds) {
  try {
    await setDoc(doc(db, "session", "current"), {
      startedAt: serverTimestamp(),
      seconds: seconds,
      running: true
    });
  } catch (error) {
    recordStatus.textContent = "Could not start the clock: " + error.message;
  }
}

document.getElementById("timer-60").addEventListener("click", function () {
  startClock(60);
});

document.getElementById("timer-90").addEventListener("click", function () {
  startClock(90);
});

document.getElementById("timer-stop").addEventListener("click", async function () {
  try {
    await setDoc(doc(db, "session", "current"), { running: false }, { merge: true });
  } catch (error) {
    recordStatus.textContent = "Could not stop the clock: " + error.message;
  }
});

/* Drops whoever is at the top of the queue and stops the clock, so
   the next delegate can be given the floor. */
document.getElementById("next-speaker").addEventListener("click", async function () {
  const firstRow = speakerList.querySelector(".speaker");
  if (!firstRow) return;

  // The remove button on that row already knows which entry it
  // belongs to, so pressing it does exactly the right thing.
  const removeButton = firstRow.querySelector(".speaker-remove");
  if (!removeButton) return;

  try {
    removeButton.click();
    await setDoc(doc(db, "session", "current"), { running: false }, { merge: true });
  } catch (error) {
    recordStatus.textContent = "Could not move on: " + error.message;
  }
});


/* ---------------------------------------------------------------
   VOTING

   The chair states a motion and opens the floor to a vote. Every
   delegate answers Yes, No or Abstain, and the tally updates live
   on everybody's screen as the votes come in.

   Two pieces of data are involved:
     - the vote itself, in a "votes" collection
     - one ballot per delegate, kept inside that vote

   Storing each ballot under the delegate's own id means nobody can
   vote twice: voting again simply replaces their earlier answer.
   --------------------------------------------------------------- */

// The vote currently open, or null when there is none.
let activeVote = null;

// The running count, kept so the chair can record it on closing.
let latestTally = { yes: 0, no: 0, abstain: 0 };

// How this delegate voted, or null if they have not yet.
let myBallot = null;

// Lets us stop listening to an old vote's ballots when a new vote
// begins, so counts from a finished vote cannot leak into the next.
let stopWatchingBallots = null;
let watchedVoteId = null;


function listenToVotes() {
  // There is only ever one vote open at a time.
  const openVotes = query(collection(db, "votes"), where("open", "==", true));

  onSnapshot(openVotes, function (snapshot) {
    if (snapshot.empty) {
      activeVote = null;
      voteIdle.hidden = false;
      voteOpenBox.hidden = true;
      voteNote.textContent = "";
      openVoteButton.disabled = false;
      closeVoteButton.disabled = true;

      // Stop counting the ballots of the vote that just ended.
      if (stopWatchingBallots) {
        stopWatchingBallots();
        stopWatchingBallots = null;
        watchedVoteId = null;
      }
      return;
    }

    const voteDoc = snapshot.docs[0];
    activeVote = { id: voteDoc.id, question: voteDoc.data().question };

    voteIdle.hidden = true;
    voteOpenBox.hidden = false;
    voteQuestion.textContent = activeVote.question;
    voteNote.textContent = "Vote in progress";
    openVoteButton.disabled = true;
    closeVoteButton.disabled = false;

    listenToBallots(activeVote.id);
  });
}


/* Watches the ballots of one vote and keeps the tally up to date. */
function listenToBallots(voteId) {
  // Already watching this one — nothing to do.
  if (watchedVoteId === voteId) return;

  if (stopWatchingBallots) stopWatchingBallots();
  watchedVoteId = voteId;

  stopWatchingBallots = onSnapshot(
    collection(db, "votes", voteId, "ballots"),
    function (snapshot) {
      let yes = 0;
      let no = 0;
      let abstain = 0;
      myBallot = null;

      snapshot.forEach(function (ballot) {
        const choice = ballot.data().choice;

        if (choice === "Yes") yes += 1;
        else if (choice === "No") no += 1;
        else abstain += 1;

        // Each ballot is filed under the delegate's own id, so this
        // finds our own answer.
        if (currentDelegate && ballot.id === currentDelegate.uid) {
          myBallot = choice;
        }
      });

      latestTally = { yes: yes, no: no, abstain: abstain };
      drawTally();
    }
  );
}


/* Puts the running count on screen and marks how this delegate
   voted. */
function drawTally() {
  voteTally.textContent = "";

  addTallyColumn(latestTally.yes, "For");
  addTallyColumn(latestTally.no, "Against");
  addTallyColumn(latestTally.abstain, "Abstaining");

  // A quiet reminder of your own answer, off to the right.
  if (myBallot) {
    const yours = document.createElement("span");
    yours.className = "vote-yours";
    yours.textContent = "You voted " + myBallot.toLowerCase();
    voteTally.appendChild(yours);
  }

  // Highlight whichever button this delegate chose.
  markChosenButton();
}


/* One column of the tally: a number with a word beneath it. */
function addTallyColumn(count, label) {
  const item = document.createElement("div");
  item.className = "vote-tally-item";

  const number = document.createElement("span");
  number.className = "vote-tally-number";
  number.textContent = count;

  const caption = document.createElement("span");
  caption.className = "vote-tally-label";
  caption.textContent = label;

  item.appendChild(number);
  item.appendChild(caption);
  voteTally.appendChild(item);
}


/* Fills in the button matching this delegate's answer, so their own
   vote is obvious at a glance. */
function markChosenButton() {
  const choices = [
    { id: "vote-yes", value: "Yes" },
    { id: "vote-no", value: "No" },
    { id: "vote-abstain", value: "Abstain" }
  ];

  choices.forEach(function (choice) {
    const button = document.getElementById(choice.id);
    const chosen = myBallot === choice.value;
    button.classList.toggle("button-primary", chosen);
    button.classList.toggle("button-quiet", !chosen);
  });
}


/* Records this delegate's answer. Voting again overwrites the
   earlier one rather than adding a second. */
async function castVote(choice) {
  if (!activeVote || !currentDelegate) return;

  try {
    await setDoc(
      doc(db, "votes", activeVote.id, "ballots", currentDelegate.uid),
      {
        choice: choice,
        country: currentDelegate.country,
        flag: currentDelegate.flag,
        castAt: serverTimestamp()
      }
    );
  } catch (error) {
    voteNote.textContent = "Could not vote: " + error.message;
  }
}

document.getElementById("vote-yes").addEventListener("click", function () {
  castVote("Yes");
});
document.getElementById("vote-no").addEventListener("click", function () {
  castVote("No");
});
document.getElementById("vote-abstain").addEventListener("click", function () {
  castVote("Abstain");
});


/* ---------------------------------------------------------------
   RUNNING A VOTE — CHAIR ONLY
   --------------------------------------------------------------- */

// The committee itself, used as the speaker when a result is
// written into the discussion.
const committeeSpeaker = {
  uid: "committee",
  name: "Committee",
  country: "Committee decision",
  flag: "🗳️"
};

openVoteButton.addEventListener("click", async function () {
  const question = voteQuestionInput.value.trim();

  if (question === "") {
    voteQuestionInput.focus();
    return;
  }

  openVoteButton.disabled = true;

  try {
    await addDoc(collection(db, "votes"), {
      question: question,
      open: true,
      openedAt: serverTimestamp()
    });
    voteQuestionInput.value = "";
  } catch (error) {
    voteNote.textContent = "Could not open the vote: " + error.message;
    openVoteButton.disabled = false;
  }
});


closeVoteButton.addEventListener("click", async function () {
  if (!activeVote) return;

  closeVoteButton.disabled = true;

  const yes = latestTally.yes;
  const no = latestTally.no;
  const abstain = latestTally.abstain;

  // A motion carries on a simple majority of the votes actually
  // cast. Abstentions are recorded but do not count either way.
  const passed = yes > no;

  const question = activeVote.question;

  try {
    // Close the vote and keep the final numbers with it.
    await updateDoc(doc(db, "votes", activeVote.id), {
      open: false,
      yes: yes,
      no: no,
      abstain: abstain,
      passed: passed,
      closedAt: serverTimestamp()
    });

    // Write the outcome into the discussion, so the record of the
    // debate contains its decisions and not only its speeches.
    const outcome =
      (passed ? "Motion carried" : "Motion failed") +
      " — " + yes + " in favour, " + no + " against, " +
      abstain + " abstaining.";

    await postSpeech(question, outcome, committeeSpeaker, false, "result");
  } catch (error) {
    voteNote.textContent = "Could not close the vote: " + error.message;
    closeVoteButton.disabled = false;
  }
});


/* ---------------------------------------------------------------
   STEP 4 — RECORDING A SPEECH OUT LOUD

   This uses speech recognition that is already built into the
   browser, so there is nothing to install and no service to pay
   for. It listens through the microphone and writes what it hears
   straight into the writing box, where it can still be edited
   before posting.

   It works in Chrome, Edge and Safari. Firefox does not have it,
   so there the Record button is switched off and says so.
   --------------------------------------------------------------- */

// Different browsers use slightly different names for the same tool.
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;   // the listener itself, made on first use
let isRecording = false;  // whether we are currently listening

// Everything heard so far this session, kept separately from the
// half-finished words the browser is still deciding about.
let confirmedText = "";

// Turn the button off entirely if this browser cannot do it.
if (!SpeechRecognition) {
  recordButton.disabled = true;
  recordButton.title = "Voice recording needs Chrome, Edge or Safari.";
  recordStatus.textContent = "Voice recording is not available in this browser.";
}

/* Creates the listener and describes what to do as it hears things.
   Only ever runs once. */
function createRecognition() {
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";       // the language being spoken
  recognition.continuous = true;    // keep listening through pauses
  recognition.interimResults = true; // show words before they are final

  // Runs every time the browser has heard something new.
  recognition.onresult = function (event) {
    let stillDeciding = "";

    // Walk through the new results only.
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        // The browser has settled on these words.
        confirmedText += result[0].transcript;
      } else {
        // Still a guess — shown, but may change.
        stillDeciding += result[0].transcript;
      }
    }

    postText.value = (confirmedText + stillDeciding).trim();
  };

  // Runs if something goes wrong, most often the microphone being
  // blocked in the browser's permission popup.
  recognition.onerror = function (event) {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      recordStatus.textContent = "Microphone blocked. Allow it in your browser settings.";
    } else if (event.error === "no-speech") {
      recordStatus.textContent = "Did not hear anything.";
    } else {
      recordStatus.textContent = "Recording problem: " + event.error;
    }
    stopRecording();
  };

  // The browser stops listening on its own after a long silence.
  // If the delegate has not pressed Stop, start it up again so a
  // pause for breath does not end the speech.
  recognition.onend = function () {
    if (isRecording) {
      recognition.start();
    }
  };
}

/* Begins listening. */
function startRecording() {
  if (!recognition) createRecognition();

  // Carry on from whatever is already in the box rather than
  // overwriting it.
  const existing = postText.value.trim();
  confirmedText = existing === "" ? "" : existing + " ";

  isRecording = true;
  recognition.start();

  recordButton.textContent = "Stop";
  recordStatus.innerHTML = "";
  const dot = document.createElement("span");
  dot.className = "record-dot";
  recordStatus.appendChild(dot);
  recordStatus.appendChild(document.createTextNode("Listening…"));
}

/* Stops listening. */
function stopRecording() {
  isRecording = false;

  if (recognition) recognition.stop();

  recordButton.textContent = "Record";

  // Leave any error message alone; only clear the "Listening…" line.
  if (recordStatus.querySelector(".record-dot")) {
    recordStatus.textContent = "";
  }
}

// One button that switches between starting and stopping.
recordButton.addEventListener("click", function () {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});
