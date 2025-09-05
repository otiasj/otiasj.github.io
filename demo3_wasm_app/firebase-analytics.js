import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { firebaseConfig } from './firebase-config.js';

console.log("[ANALYTICS.JS_FIREBASE_TYPED] File loaded and parsed.");

let firebaseAnalyticsInstance;
try {
  const app = initializeApp(firebaseConfig);
  firebaseAnalyticsInstance = getAnalytics(app); 
  console.log("[ANALYTICS.JS_FIREBASE_TYPED] Firebase Analytics initialized!");
} catch (initError) {
  console.error("[ANALYTICS.JS_FIREBASE_TYPED] Firebase initialization ERROR:", initError);
}

const FirebaseJsAPI = {
  sendFirebaseEvent: function(eventName, propertiesJson) {
    console.log('[ANALYTICS.JS_FIREBASE_TYPED] FirebaseJsAPI.sendFirebaseEvent CALLED. EventName:', eventName, 'PropertiesJSON:', propertiesJson);
    if (!firebaseAnalyticsInstance) {
      console.error("[ANALYTICS.JS_FIREBASE_TYPED] Firebase not initialized. Cannot send event.");
      return; // Or handle error appropriately
    }
    try {
      const properties = JSON.parse(propertiesJson);
      console.log('[ANALYTICS.JS_FIREBASE_TYPED] Parsed properties:', properties);
      logEvent(firebaseAnalyticsInstance, eventName, properties);
      console.log('[ANALYTICS.JS_FIREBASE_TYPED] Firebase event logged:', eventName);
      return "Event '" + eventName + "' sent to Firebase."; // Optional: return a success message
    } catch (e) {
      console.error("[ANALYTICS.JS_FIREBASE_TYPED] Error in sendFirebaseEvent:", e, "EventName:", eventName, "JSON:", propertiesJson);
      throw e; // Re-throw to allow Kotlin to catch it if desired
    }
  }
  // You could add other related JS functions here, e.g., setUserProperties, etc.
};

export default FirebaseJsAPI;

console.log("[ANALYTICS.JS_FIREBASE_TYPED] FirebaseJsAPI object created and exported.");
