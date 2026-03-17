// Kopieer dit bestand naar firebase-config.js en vul jouw Firebase-project in.
//
// Hoe te verkrijgen:
//  1. Ga naar https://console.firebase.google.com
//  2. Maak een nieuw project aan (of gebruik een bestaand)
//  3. Klik op het tandwiel → Project-instellingen → Jouw apps → </> (web)
//  4. Kopieer het 'firebaseConfig' object hieronder
//  5. Ga naar Realtime Database → Regels en stel in:
//     {
//       "rules": {
//         "rooms": {
//           "$room": { ".read": true, ".write": true }
//         }
//       }
//     }

window.FIREBASE_CONFIG = {
  apiKey:            "JOUW_API_KEY",
  authDomain:        "JOUW_PROJECT.firebaseapp.com",
  databaseURL:       "https://JOUW_PROJECT-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "JOUW_PROJECT",
  storageBucket:     "JOUW_PROJECT.appspot.com",
  messagingSenderId: "JOUW_SENDER_ID",
  appId:             "JOUW_APP_ID",
};
