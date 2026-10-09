import { state } from "../core/state.js?v=20261008";

export function resetRoomPlayerState() {
  state.player.lastRemoteState = null;
  state.player.lastStateSentAt = 0;
  state.player.lastActionAt = 0;
  state.player.lastActionAuthor = "";
  state.player.lastPlaybackIssueAt = 0;
  state.player.lastPlaybackIssueReason = "";
  state.player.lastPlaybackIssueAnnouncementAt = 0;
  state.player.lastPlaybackIssueAnnouncementKey = "";
  state.player.remotePlaybackIssueCooldownUntil = 0;
  window.clearInterval(state.player.playButtonCooldownTimeoutId);
  state.player.lastUserPauseAt = 0;
  state.player.playButtonPressTimes = [];
  state.player.playButtonCooldownUntil = 0;
  state.player.playButtonCooldownTimeoutId = null;
  if (state.player.playbackRecoveryTimeoutId) {
    window.clearTimeout(state.player.playbackRecoveryTimeoutId);
  }
  if (state.player.playbackErrorTimeoutId) {
    window.clearTimeout(state.player.playbackErrorTimeoutId);
  }
  state.player.playbackRecoveryPending = false;
  state.player.playbackRecoveryAttempting = false;
  state.player.playbackRecoveryTimeoutId = null;
  state.player.playbackErrorTimeoutId = null;
  state.player.playbackErrorSnapshot = null;
  state.player.remoteStateActive = false;
  state.player.suppressVideoEvents = false;
}
