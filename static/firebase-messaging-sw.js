importScripts(
  "https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: "AIzaSyCkIQl9qFkVNOyh3tQUy8yZh4ZVqg6FOO4",
  authDomain: "bamanstock.firebaseapp.com",
  projectId: "bamanstock",
  storageBucket: "bamanstock.firebasestorage.app",
  messagingSenderId: "185981899513",
  appId: "1:185981899513:web:0f09f237d8429804654828",
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[PushNotification] background message received:", payload);
  const { title, body } = payload.notification ?? {};
  const notificationOptions = {
    body: body ?? "",
    icon: "/logonew.png",
    sound: "/notification-sound.wav",
  };
  self.registration.showNotification(title ?? "Bamanstock", notificationOptions);

  self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      clients.forEach((client) => client.postMessage({ type: "FCM_MESSAGE", payload }));
    });
});