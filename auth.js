/* ---------------------------------------------------------------
   SIGN-IN PAGE BEHAVIOUR

   This file makes index.html work. It handles two things:
     - creating a new delegate account
     - signing an existing delegate back in

   When either succeeds, the browser is sent to committee.html.
   --------------------------------------------------------------- */

// Brings in the Firebase connection set up in firebase-config.js.
import { auth, db } from "./firebase-config.js";

// The specific Firebase commands this page needs.
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";


/* ---------------------------------------------------------------
   FINDING THE PARTS OF THE PAGE WE NEED
   --------------------------------------------------------------- */

const form = document.getElementById("auth-form");
const nameField = document.getElementById("name-field");
const countryField = document.getElementById("country-field");
const roleField = document.getElementById("role-field");
const nameInput = document.getElementById("name");
const countryInput = document.getElementById("country");
const roleInput = document.getElementById("role");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorLine = document.getElementById("form-error");
const submitButton = document.getElementById("submit-button");
const formTitle = document.getElementById("form-title");
const formSubtitle = document.getElementById("form-subtitle");
const switchText = document.getElementById("switch-text");
const switchButton = document.getElementById("switch-button");


/* ---------------------------------------------------------------
   WHICH MODE THE FORM IS IN

   The same form is used for both jobs. This remembers which one is
   currently showing.
   --------------------------------------------------------------- */

let isCreatingAccount = false;

// True only while an account is being made. It stops the check at
// the bottom of this file from rushing off to the committee before
// the delegate's profile has actually been saved.
let signupInProgress = false;

/* The chair runs the committee rather than representing anywhere,
   so the country question does not apply to them. This shows or
   hides it to match the role chosen. */
function updateCountryVisibility() {
  const isChair = roleInput.value === "Chair";

  countryField.hidden = isChair;

  formSubtitle.textContent = isChair
    ? "You will run the committee."
    : "Choose the country you will represent.";
}

// Switching role shows or hides the country question straight away.
roleInput.addEventListener("change", updateCountryVisibility);


/* Rewrites the wording on the page to match the current mode, and
   shows or hides the name, country and role boxes. */
function updateFormMode() {
  errorLine.textContent = "";

  if (isCreatingAccount) {
    formTitle.textContent = "Create an account";
    submitButton.textContent = "Create account";
    nameField.hidden = false;
    roleField.hidden = false;
    // Decides for itself whether the country box belongs.
    updateCountryVisibility();
    passwordInput.autocomplete = "new-password";
    switchText.textContent = "Already have an account?";
    switchButton.textContent = "Sign in";
  } else {
    formTitle.textContent = "Sign in";
    formSubtitle.textContent = "Take your seat in the committee.";
    submitButton.textContent = "Sign in";
    nameField.hidden = true;
    countryField.hidden = true;
    roleField.hidden = true;
    passwordInput.autocomplete = "current-password";
    switchText.textContent = "New delegate?";
    switchButton.textContent = "Create an account";
  }
}

// Clicking the link at the bottom flips between the two modes.
switchButton.addEventListener("click", function () {
  isCreatingAccount = !isCreatingAccount;
  updateFormMode();
});


/* ---------------------------------------------------------------
   TURNING FIREBASE ERRORS INTO PLAIN ENGLISH

   Firebase reports problems with codes like
   "auth/invalid-credential", which mean nothing to a student. This
   swaps the common ones for a readable sentence.
   --------------------------------------------------------------- */

function friendlyError(error) {
  switch (error.code) {
    case "auth/invalid-email":
      return "That does not look like a valid email address.";
    case "auth/missing-password":
      return "Please enter a password.";
    case "auth/weak-password":
      return "Password is too short — use at least 6 characters.";
    case "auth/email-already-in-use":
      return "An account already exists with that email. Try signing in instead.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/network-request-failed":
      return "Could not reach Firebase. Check your internet connection.";
    case "auth/configuration-not-found":
    case "auth/api-key-not-valid":
      return "Firebase is not set up yet. Check the keys in firebase-config.js.";
    default:
      // Anything unexpected: show the raw message rather than
      // pretending nothing happened.
      return error.message;
  }
}


/* ---------------------------------------------------------------
   WHAT HAPPENS WHEN THE FORM IS SUBMITTED
   --------------------------------------------------------------- */

form.addEventListener("submit", async function (event) {
  // Stops the browser's own default of reloading the page.
  event.preventDefault();

  errorLine.textContent = "";
  submitButton.disabled = true;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    if (isCreatingAccount) {
      // --- Creating a new delegate account ---

      const name = nameInput.value.trim();
      const role = roleInput.value;
      const isChair = role === "Chair";

      // Checked here rather than by the browser, so the message
      // matches the rest of the page.
      if (name === "") {
        throw { code: "custom", message: "Please enter your name." };
      }

      // Only delegates need a country. The chair represents the
      // committee itself.
      let flag = "⚖️";
      let country = "Chair";

      if (!isChair) {
        const countryChoice = countryInput.value;

        if (countryChoice === "") {
          throw { code: "custom", message: "Please choose a country to represent." };
        }

        // The dropdown stores the flag and country together in one
        // value, e.g. "🇰🇷|South Korea". This splits them apart.
        [flag, country] = countryChoice.split("|");
      }

      // Creating the account signs the delegate straight in, which
      // would normally bounce them to the committee. Hold that off
      // until the profile below has been saved too, so a half-made
      // account cannot slip through looking finished.
      signupInProgress = true;

      // Creates the account. Firebase stores the email and password
      // for us — the password never touches our own database.
      const result = await createUserWithEmailAndPassword(auth, email, password);

      // Saves the things Firebase does not store: the delegate's
      // name and which country they represent. This lives in a
      // "users" collection, filed under the account's unique id.
      try {
        await setDoc(doc(db, "users", result.user.uid), {
          name: name,
          country: country,
          flag: flag,
          role: role,
          email: email,
          createdAt: serverTimestamp()
        });
      } catch (profileError) {
        // The account exists but has no profile, which would leave
        // a delegate with no country. Sign back out so nothing is
        // left half-finished, then report what went wrong.
        await signOut(auth);
        throw profileError;
      }

      signupInProgress = false;

    } else {
      // --- Signing an existing delegate back in ---
      await signInWithEmailAndPassword(auth, email, password);
    }

    // Both paths end the same way: go to the committee.
    window.location.href = "committee.html";

  } catch (error) {
    signupInProgress = false;
    errorLine.textContent = friendlyError(error);
    submitButton.disabled = false;
  }
});


/* ---------------------------------------------------------------
   ALREADY SIGNED IN?

   Firebase remembers a delegate between visits. If someone is
   still signed in from last time, skip the form entirely.
   --------------------------------------------------------------- */

onAuthStateChanged(auth, function (user) {
  if (user && !signupInProgress) {
    window.location.href = "committee.html";
  }
});

// Sets the wording correctly when the page first opens.
updateFormMode();
