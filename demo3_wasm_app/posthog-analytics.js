import posthog from 'posthog-js';
import {  POSTHOG_API_KEY, POSTHOG_API_HOST } from './posthog-config.js';

console.log("[POSTHOG-ANALYTICS.JS] File loaded and parsed.");

// Provide comprehensive fallbacks for missing web APIs that PostHog might try to access
if (typeof window !== 'undefined') {
  // Provide fallback for web vitals APIs if they don't exist
  if (!window.PerformanceObserver) {
    window.PerformanceObserver = class {
      constructor() {}
      observe() {}
      disconnect() {}
    };
  }
  
  // Provide fallback for performance navigation API
  if (!window.performance) {
    window.performance = {
      now: () => Date.now(),
      timing: {},
      navigation: {},
      getEntriesByType: () => [],
      getEntriesByName: () => [],
      mark: () => {},
      measure: () => {}
    };
  }
  
  // Provide fallback for web vitals callback if it doesn't exist
  if (!window.webVitals) {
    window.webVitals = {
      onLCP: function() {},
      onFID: function() {},
      onCLS: function() {},
      onFCP: function() {},
      onTTFB: function() {}
    };
  }
  
  // Provide fallback for intersection observer
  if (!window.IntersectionObserver) {
    window.IntersectionObserver = class {
      constructor() {}
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  
  // Provide fallback for mutation observer
  if (!window.MutationObserver) {
    window.MutationObserver = class {
      constructor() {}
      observe() {}
      disconnect() {}
    };
  }
}

let posthogInitialized = false;

try {
  // Wrap PostHog initialization with additional error handling
  const originalConsoleError = console.error;
  console.error = function(...args) {
    // Filter out known PostHog web vitals errors
    const message = args.join(' ');
    if (message.includes('onLCP') || message.includes('web-vitals') || message.includes('PerformanceObserver')) {
      console.warn('[POSTHOG-ANALYTICS.JS] Suppressed PostHog web vitals error (expected in WASM):', ...args);
      return;
    }
    originalConsoleError.apply(console, args);
  };

  posthog.init(POSTHOG_API_KEY, {
    api_host: POSTHOG_API_HOST,
    // Disable features that might not work in WASM environment
    capture_performance: false,
    capture_pageview: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_compression: true,
    // Disable web vitals which is causing the onLCP error
    capture_heatmaps: false,
    // Disable automatic event capture that might use unsupported APIs
    autocapture: false,
    // Add error handling for missing APIs
    loaded: function(posthog) {
      console.log("[POSTHOG-ANALYTICS.JS] PostHog loaded successfully");
      posthogInitialized = true;
      // Restore original console.error after initialization
      console.error = originalConsoleError;
    },
    // Provide fallbacks for missing web APIs
    bootstrap: {
      distinctId: 'wasm-user-' + Math.random().toString(36).substr(2, 9)
    }
  });
  
  console.log("[POSTHOG-ANALYTICS.JS] PostHog posthog.init() called.");
  
  // Set a timeout to restore console.error in case loaded callback doesn't fire
  setTimeout(() => {
    console.error = originalConsoleError;
    if (!posthogInitialized) {
      console.warn("[POSTHOG-ANALYTICS.JS] PostHog initialization may have failed, but continuing...");
    }
  }, 5000);
  
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