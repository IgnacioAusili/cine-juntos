let roomOperationId = 0;

export function beginRoomOperation() {
  roomOperationId += 1;
  return roomOperationId;
}

export function invalidateRoomOperation() {
  roomOperationId += 1;
  return roomOperationId;
}

export function isRoomOperationCurrent(operationId) {
  return operationId === roomOperationId;
}

export function updateUrlRoom(roomCode) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  window.history.replaceState({}, "", url);
}

export function clearUrlRoom() {
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  window.history.replaceState({}, "", url);
}
