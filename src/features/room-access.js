import { createRandomId } from "../core/random-id.js?v=20260902-mobile-real-browser-02";

const ACTIVE_TAB_KEY = "cine-juntos-active-tab";
const ACTIVE_TAB_TTL_MS = 30000;
const MAX_OPEN_TABS = 1;

export function getTabId() {
  const stored = sessionStorage.getItem("cine-juntos-tab-id");
  if (stored) return stored;
  const next = createRandomId();
  sessionStorage.setItem("cine-juntos-tab-id", next);
  return next;
}

export function readActiveTabs() {
  const now = Date.now();
  const tabs = [];
  const seen = new Set();

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== ACTIVE_TAB_KEY && !key?.startsWith(ACTIVE_TAB_KEY + ":")) continue;

    try {
      const record = JSON.parse(localStorage.getItem(key));
      if (!record?.tabId || !record?.lastSeenAt) {
        localStorage.removeItem(key);
        continue;
      }
      if (now - record.lastSeenAt > ACTIVE_TAB_TTL_MS) {
        localStorage.removeItem(key);
        continue;
      }
      if (seen.has(record.tabId)) continue;
      seen.add(record.tabId);
      tabs.push(record);
    } catch {
      localStorage.removeItem(key);
    }
  }

  return tabs;
}

function getActiveTabRecordKey(tabId = getTabId()) {
  return ACTIVE_TAB_KEY + ":" + tabId;
}

export function writeActiveTabRecord(roomCode) {
  const record = {
    tabId: getTabId(),
    roomCode,
    lastSeenAt: Date.now(),
  };
  localStorage.setItem(getActiveTabRecordKey(record.tabId), JSON.stringify(record));
  return record;
}

export function removeActiveTabRecord() {
  localStorage.removeItem(getActiveTabRecordKey());
}

export function shouldEnforceSingleActiveTabLimit() {
  const hostname = window.location.hostname;
  if (window.location.protocol === "file:") return false;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0") {
    return false;
  }
  return true;
}

export function getRoomTabLimitConflictCount() {
  const tabId = getTabId();
  const activeTabs = readActiveTabs();
  const isCurrentTabActive = activeTabs.some((record) => record.tabId === tabId);
  const otherTabCount = activeTabs.filter((record) => record.tabId !== tabId).length;
  return shouldEnforceSingleActiveTabLimit() && !isCurrentTabActive && otherTabCount >= MAX_OPEN_TABS
    ? otherTabCount
    : 0;
}

export { MAX_OPEN_TABS };
