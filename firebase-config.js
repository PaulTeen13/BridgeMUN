/* ---------------------------------------------------------------
   FIREBASE SETUP

   This file connects the website to your Firebase project.

   YOU NEED TO EDIT THE TOP PART. Everything below the config block
   is plumbing you can leave alone.

   Where to get these values:
     1. Go to console.firebase.google.com and create a project.
     2. Inside the project, click the "</>" (Web) icon to register
        a web app.
     3. Firebase shows you a "firebaseConfig" block. Copy each value
        into the matching line below.

   Is it safe to have these keys sitting in a file anyone can read?
   Yes. Firebase keys are public identifiers, not passwords — they
   say "which project", not "who is allowed in". What actually keeps
   your data safe is the rules in firestore.rules.
   --------------------------------------------------------------- */

const firebaseConfig = {
  apiKey: "AIzaSyDUI-hwVPOldJBxtdcfS--wfApNzGEXJoU",
  authDomain: "munproject-e4723.firebaseapp.com",
  projectId: "munproject-e4723",
  storageBucket: "munproject-e4723.firebasestorage.app",
  messagingSenderId: "119666538256",
  appId: "1:119666538256:web:874cf8f530095b16f55795"
};


/* ---------------------------------------------------------------
   Below here: no edits needed.

   These lines fetch Firebase's code straight from Google's servers,
   so there is nothing to install on your computer.
   --------------------------------------------------------------- */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// Starts the connection to your Firebase project.
const app = initializeApp(firebaseConfig);

// "auth" handles accounts: signing up, signing in, signing out.
export const auth = getAuth(app);

// "db" is the database where posts and delegate profiles are stored.
export const db = getFirestore(app);

