// Give the service worker access to Firebase Messaging.
// Note: This file must be served from the root of your application.
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/web/setup#config-object
firebase.initializeApp({
  apiKey: "AIzaSyA_7mdxS1vGfbjqgOxCXM1UMaTmUubzh44",
  authDomain: "gen-lang-client-0373170391.firebaseapp.com",
  projectId: "gen-lang-client-0373170391",
  storageBucket: "gen-lang-client-0373170391.firebasestorage.app",
  messagingSenderId: "652314507000",
  appId: "1:652314507000:web:76854737ae70d9072ead0d"
});

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/vite.svg' // or a default icon
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
