import { firebaseConfig, logEvent } from "../core/state.js";
import { hasFirebaseConfig } from "../core/utils.js";
import { createFirebaseTransport } from "./firebaseTransport.js";
import { createLocalTransport } from "./localTransport.js";

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

export { createLocalTransport } from "./localTransport.js";
