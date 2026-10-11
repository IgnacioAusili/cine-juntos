export const chatDockTransitionState = {
  pendingBottomToRightSwitch: null,
  pendingChatDockSwitch: null,
  bottomChatTransition: null,
};

export const chatDockTransitionOperations = {};

export function configureChatDockTransitionOperations(operations) {
  if (!operations) throw new TypeError("Se requieren operaciones del layout de chat para configurar las transiciones.");
  Object.assign(chatDockTransitionOperations, operations);
}

export function getChatDockOperations() {
  if (!Object.keys(chatDockTransitionOperations).length) {
    throw new Error("Las operaciones del layout deben configurarse antes de iniciar una transición.");
  }
  return chatDockTransitionOperations;
}
