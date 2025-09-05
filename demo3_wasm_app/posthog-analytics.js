import posthog from 'posthog-js';
import {  POSTHOG_API_KEY, POSTHOG_API_HOST } from './posthog-config.js';

console.log("[POSTHOG-ANALYTICS.JS] File loaded and parsed.");

try {
  posthog.init(POSTHOG_API_KEY, {
    api_host: POSTHOG_API_HOST,
  });
  console.log("[POSTHOG-ANALYTICS.JS] PostHog posthog.init() called.");
  // Note: posthog.init is asynchronous. True initialization success is often checked via callback or posthog.__loaded
} catch (initError) {
  console.error("[POSTHOG-ANALYTICS.JS] Error during posthog.init() call:", initError);
}

const PostHogJsAPI = {
  sendEvent: function(eventName, propertiesJson) {
    console.log('[POSTHOG-ANALYTICS.JS] PostHogJsAPI.sendEvent CALLED. EventName:', eventName, 'PropertiesJSON:', propertiesJson);
    
    // Check if PostHog is loaded and capturing is enabled (basic check)
    // For a more robust check, you might want to see if posthog.__loaded is true or use the 'loaded' callback.
    if (!posthog || !POSTHOG_API_KEY.startsWith("phc_")) { 
        // A simple check if API key looks like a real PostHog key (client-side keys start with phc_)
      console.error("[POSTHOG-ANALYTICS.JS] PostHog not initialized or API key is a placeholder. Cannot send event.");
      return "Error: PostHog not initialized or API key is a placeholder.";
    }

    try {
      const properties = JSON.parse(propertiesJson);
      console.log('[POSTHOG-ANALYTICS.JS] Parsed properties:', properties);
      posthog.capture(eventName, properties);
      console.log('[POSTHOG-ANALYTICS.JS] PostHog event captured:', eventName);
      return "Event '" + eventName + "' sent to PostHog.";
    } catch (e) {
      console.error("[POSTHOG-ANALYTICS.JS] Error in sendEvent:", e, "EventName:", eventName, "JSON:", propertiesJson);
      return "Error sending event to PostHog: " + e.message;
    }
  }
};

export default PostHogJsAPI;

console.log("[POSTHOG-ANALYTICS.JS] PostHogJsAPI object created and exported.");