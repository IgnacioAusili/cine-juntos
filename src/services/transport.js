import { firebaseConfig, logEvent } from "../core/state.js?v=20260902-mobile-real-browser-01";
import { hasFirebaseConfig } from "../core/utils.js";
import { createFirebaseTransport } from "./firebaseTransport.js?v=20260902-mobile-real-browser-01";
import { createLocalTransport } from "./localTransport.js?v=20260902-mobile-real-browser-01";

export async function createTransport(roomCode) {
  let firebaseError = null;
  if (hasFirebaseConfig(firebaseConfig)) {
    try {
      return await createFirebaseTransport(roomCode, firebaseConfig);
    } catch (error) {
      firebaseError = error;
      console.error(error);
      logEvent("error", `Firebase no inicio: ${error.message || error}`);
    }
  }

  return createLocalTransport(roomCode, firebaseError);
}

export { createLocalTransport } from "./localTransport.js?v=20260902-mobile-real-browser-01";
