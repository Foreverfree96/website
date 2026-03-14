<template>
  <div class="msg-page">
    <!-- Conversation list -->
    <!-- On mobile only one panel is visible at a time; 'hidden-mobile' hides this
         panel when a conversation is open so the chat panel takes the full screen. -->

    <div class="convo-panel" :class="{ 'hidden-mobile': activeConvo }">
      <div class="convo-panel__header">
        <h2 class="panel-title">💬 Messages</h2>

        <!-- Opens the "New Message" modal -->
        <button class="new-msg-btn" @click="showNewModal = true">+ New</button>
      </div>

      <p class="mutual-notice">You can only message users who follow you back.</p>

      <p v-if="convosLoading" class="msg-status">Loading...</p>
      <p v-else-if="!conversations.length" class="msg-status">
        No conversations yet.<br>
        Message a mutual follower to start.
      </p>

      <div v-else class="convo-list">

        <!-- Conversation row -->
        <!--
        active → highlights selected conversation
        unread → highlights username if unread messages exist
        -->
        <div v-for="c in conversations" :key="c._id" class="convo-item"
          :class="{ active: activeConvo?._id === c._id, unread: c.unread > 0 }" @click="openConvo(c)">
          <div class="convo-item__name">@{{ c.other?.username }}</div>

          <!-- Last message preview -->
          <div class="convo-item__preview">
            {{ c.lastMessage || 'No messages yet' }}
          </div>

          <!-- Unread badge -->
          <span v-if="c.unread > 0" class="convo-badge">
            {{ c.unread }}
          </span>
        </div>
      </div>
      <!-- New message modal -->
      <div v-if="showNewModal" class="modal-overlay" @click.self="showNewModal = false">
        <div class="modal-box">

          <div class="modal-header">
            <h3 class="modal-title">New Message</h3>
            <button class="modal-close" @click="showNewModal = false">✕</button>
          </div>

          <p class="modal-hint">Search your mutual followers</p>

          <input v-model="mutualSearch" class="mutual-search" placeholder="Search username..." />

          <p v-if="mutualsLoading" class="msg-status">
            Loading...
          </p>

          <p v-else-if="!filteredMutuals.length" class="msg-status">
            No mutual followers found.
          </p>

          <div v-else class="mutual-list">
            <div v-for="u in filteredMutuals" :key="u._id" class="mutual-item" @click="startConvo(u)">
              @{{ u.username }}
            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- Chat panel -->
    <div class="chat-panel" :class="{ 'hidden-mobile': !activeConvo }">

      <!-- Desktop empty state -->
      <div v-if="!activeConvo" class="chat-empty">
        <p>Select a conversation or start a new one.</p>
      </div>

      <template v-else>

        <!-- Chat header -->
        <div class="chat-header">

          <div class="chat-header__top">
            <!-- Mobile back button -->
            <button class="back-btn" @click="activeConvo = null">← Back</button>

            <!-- Navigate to profile -->
            <span class="chat-header__name" @click="router.push(`/creator/${activeConvo.other?.username}`)">
              @{{ activeConvo.other?.username }}
            </span>
          </div>

          <div class="chat-header__actions">

            <template v-if="!reportMode && !recoverMode">
              <button class="report-btn" @click="enterReportMode">🚩 Report</button>
              <button class="recover-btn" @click="enterRecoverMode">📥 Recover</button>
              <button class="clear-btn" @click="openClearConfirm">🗑 Clear</button>
              <button class="block-btn" @click="openBlockConfirm">🚫 Block</button>
            </template>

            <template v-else-if="reportMode">
              <span class="report-count-txt">{{ reportSelected.size }}/25 selected</span>
              <button class="report-cancel-btn" @click="cancelReportMode">Cancel</button>
            </template>

            <template v-else-if="recoverMode">
              <span class="report-count-txt">📥 Recover messages</span>
              <button class="report-cancel-btn" @click="cancelRecoverMode">Cancel</button>
            </template>

          </div>
        </div>

        <!-- Messages -->
        <div class="chat-messages" ref="chatEl" :class="{ 'report-active': reportMode }">

          <p v-if="msgsLoading" class="msg-status">Loading...</p>

          <template v-else>

            <!-- Load earlier messages -->
            <div v-if="hasMore" class="load-more-wrap">
              <button class="load-more-btn" @click="loadMore">
                Load earlier
              </button>
            </div>

            <!-- Snapshot messages -->
            <template v-if="reportMode && snapshotMsgs.length">

              <p class="snapshot-banner">
                📋 Unsent / cleared messages (available for reporting)
              </p>

              <!-- Snapshot bubble -->
              <!-- Align right if message belongs to current user -->
              <div v-for="m in snapshotMsgs" :key="m.sentAt" class="bubble-wrap" :class="[
                m.sender?.toString() === user.id?.toString()
                  ? 'mine'
                  : 'theirs',
                'reportable'
              ]" @click="toggleReportSelect(m)">

                <div class="bubble-row">

                  <div class="bubble" :class="{ selected: reportSelected.has(m.sentAt?.toString()) }">
                    {{ m.body }}
                  </div>

                </div>

                <span class="bubble-time">
                  {{ formatTime(m.sentAt) }}
                </span>

              </div>
            </template>

            <!-- Live messages -->
            <TransitionGroup name="msg-in" tag="div" class="messages-inner">

              <!-- Message bubble -->
              <!-- Click enabled only in report mode -->
              <div v-for="m in messages" :key="m._id" class="bubble-wrap" :class="[
                m.sender._id === user.id ? 'mine' : 'theirs',
                reportMode ? 'reportable' : ''
              ]" v-on="reportMode ? { click: () => toggleReportSelect(m) } : {}">

                <div class="bubble-row">

                  <!-- Linkified message -->
                  <div class="bubble" :class="{ selected: reportMode && reportSelected.has(m._id) }"
                    v-html="linkify(m.body)">
                  </div>

                  <!-- Unsend button -->
                  <button v-if="!reportMode && m.sender._id === user.id" class="unsend-btn"
                    @click="openUnsendConfirm(m)" title="Unsend">
                    ✕
                  </button>

                </div>

                <span class="bubble-time">
                  {{ formatTime(m.createdAt) }}
                </span>

              </div>

            </TransitionGroup>

          </template>
        </div>

        <!-- Report panel -->
        <div v-if="reportMode" class="report-panel">

          <textarea v-model="reportReason" class="report-reason-input" placeholder="Reason for report (required)..."
            maxlength="500" rows="2" />

          <div class="report-panel-actions">

            <span class="report-hint">
              {{ reportSelected.size }} message
              {{ reportSelected.size !== 1 ? 's' : '' }}
              selected
            </span>

            <button class="report-submit-btn" @click="submitReport"
              :disabled="reportSubmitting || !reportReason.trim() || !reportSelected.size">
              {{ reportSubmitting ? 'Sending...' : 'Submit Report' }}
            </button>

          </div>

          <p v-if="reportError" class="report-err">
            {{ reportError }}
          </p>

        </div>

        <!-- Recover panel -->
        <div v-if="recoverMode" class="recover-panel">
          <p v-if="recoverLoading" class="msg-status">Loading...</p>
          <p v-else-if="!recoverMsgs.length" class="recover-empty">No recoverable messages found.</p>
          <div v-else class="recover-list">
            <div class="recover-all-row">
              <button class="recover-all-btn" @click="recoverAll">↩ Send All</button>
            </div>
            <div v-for="(m, i) in recoverMsgs" :key="i" class="recover-item">
              <span class="recover-body">{{ m.body }}</span>
              <span class="recover-time">{{ formatTime(m.sentAt) }}</span>
              <button class="restore-btn" @click="restoreMessage(m.body)">↩ Send</button>
            </div>
          </div>
        </div>

        <!-- Message input -->
        <div v-if="!reportMode && !recoverMode" class="chat-input-row">

          <textarea ref="chatInputEl" v-model="draft" class="chat-input" placeholder="Type a message..."
            maxlength="2000" rows="1" @keydown.enter.exact.prevent="sendMsg" />

          <button class="send-btn" @click="sendMsg" :disabled="!draft.trim()">
            Send
          </button>

        </div>

      </template>
    </div>
  </div>

  <!-- ── THEMED CONFIRMATION MODALS ─────────────────────────────────────────
       All destructive and informational confirmations use the shared AppModal
       component so styling and behaviour are consistent across the app. -->

  <!-- Clear chat -->
  <AppModal :show="clearModal" title="Clear Conversation"
    message="Delete all messages in this chat? This affects both sides and cannot be undone." danger ok-label="Clear All"
    cancel-label="Cancel" @ok="executeClear" @cancel="clearModal = false" />

  <!-- Block user -->
  <AppModal :show="blockModal.show" title="Block User" :message="blockModal.msg" danger ok-label="Yes, Block"
    cancel-label="Cancel" @ok="executeBlock" @cancel="blockModal.show = false" />

  <!-- Unsend message -->
  <AppModal :show="unsendModal.show" title="Unsend Message" message="Remove this message? This can't be undone." danger
    ok-label="Unsend" cancel-label="Cancel" @ok="executeUnsend" @cancel="unsendModal.show = false" />

  <!-- Generic alert modal -->
  <AppModal :show="alertModal.show" :message="alertModal.msg" type="alert" ok-label="OK" @ok="alertModal.show = false"
    @cancel="alertModal.show = false" />

</template>





<script setup>
/*
 * MessagesPage.vue
 *
 * Full-page direct messaging interface.  Displays a two-column layout:
 *   LEFT  — scrollable list of all conversations the logged-in user is part of,
 *            with unread-count badges and a "New Message" button.
 *   RIGHT — the active chat thread, with paginated message history, real-time
 *            incoming messages via Socket.io, message sending, unsend, clear chat,
 *            block user, and a report flow that lets users select up to 25 messages
 *            (including server-side snapshots of deleted messages) and submit them
 *            with a written reason.
 *
 * On mobile the two columns stack and only one is shown at a time; the Back button
 * returns from the chat view to the conversation list.
 *
 * Real-time updates are wired through the useNotifications composable which wraps
 * the Socket.io connection.  This page registers DM and clear-event handlers on
 * mount and removes them on unmount to prevent memory leaks.
 */

import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { useAuth } from '../composables/useAuth.js';
import { useNotifications } from '../composables/useNotifications.js';
import AppModal from '../components/AppModal.vue';

// ─── API BASE URLS ────────────────────────────────────────────────────────────

// Endpoint root for all message/conversation operations
const API = import.meta.env.VITE_API_URL + '/api/messages';
// Endpoint root for user-level operations (block, mutual-followers lookup)
const API_USERS = import.meta.env.VITE_API_URL + '/api/users';

// ─── COMPOSABLES ─────────────────────────────────────────────────────────────

const router = useRouter();

// Currently authenticated user; provides user.id used to distinguish own messages
const { user } = useAuth();

// Real-time notification helpers:
//   addDmHandler    — registers a callback for incoming DM socket events
//   addClearHandler — registers a callback for chat-clear socket events
//   decrementDmCount — subtracts from the global unread DM badge in the nav
//   setDmCount      — overrides the global unread DM badge count
const { addDmHandler, addClearHandler, decrementDmCount, setDmCount } = useNotifications();

// ─── CONVERSATION LIST STATE ──────────────────────────────────────────────────

// Array of conversation objects fetched on mount; each has _id, other (user), lastMessage, unread
const conversations = ref([]);

// True while the initial conversation list is being fetched
const convosLoading = ref(true);

// The conversation object that is currently open in the chat panel; null = no selection
const activeConvo = ref(null);

// ─── ACTIVE CHAT STATE ───────────────────────────────────────────────────────

// Array of message objects for the currently open conversation
const messages = ref([]);

// True while messages are being loaded for a newly opened conversation
const msgsLoading = ref(false);

// Bound to the compose textarea; the text the user is currently typing
const draft = ref('');

// Template ref for the scrollable message container — used to programmatically scroll to bottom
const chatEl = ref(null);

// Template ref for the message compose textarea — used to restore focus after sending
const chatInputEl = ref(null);

// True when the server indicates there are older messages before the current page
const hasMore = ref(false);

// ISO timestamp of the oldest message currently loaded; used as a cursor for
// the "Load earlier" pagination request (?before=<earliestDate>)
const earliestDate = ref(null);

// ─── NEW CONVERSATION MODAL STATE ────────────────────────────────────────────

// Controls visibility of the "New Message" modal
const showNewModal = ref(false);

// Full list of mutual followers fetched lazily when the modal is first opened
const mutuals = ref([]);

// Bound to the search input inside the modal; used to filter the mutuals list
const mutualSearch = ref('');

// True while the mutual followers list is being fetched from the server
const mutualsLoading = ref(false);

// ─── CONFIRMATION MODAL STATE ─────────────────────────────────────────────────

// Controls the "Clear Conversation" confirmation modal (boolean)
const clearModal = ref(false);

// Controls the "Block User" confirmation modal; carries the target user id and
// conversation id so executeBlock() knows what to act on
const blockModal = ref({ show: false, msg: '', targetId: null, convoId: null });

// Controls the "Unsend Message" confirmation modal; carries the message object
const unsendModal = ref({ show: false, msgObj: null });

// Generic alert modal used for success/failure feedback (e.g. after a report)
const alertModal = ref({ show: false, msg: '' });

// ─── REPORT MODE STATE ───────────────────────────────────────────────────────

// True when the user has clicked "Report" and is selecting messages to include
const reportMode = ref(false);

// Set of message identifiers (_id for live messages, sentAt string for snapshots)
// that the user has tapped/clicked to include in the report
const reportSelected = ref(new Set());

// Bound to the report reason textarea
const reportReason = ref('');

// True while the report POST request is in flight
const reportSubmitting = ref(false);

// Inline error message shown below the report panel
const reportError = ref('');

// Server-side snapshot of unsent/cleared messages for the active conversation.
// Fetched when entering report mode so evidence cannot be hidden before reporting.
const snapshotMsgs = ref([]);

// ─── RECOVER MODE STATE ───────────────────────────────────────────────────────

const recoverMode    = ref(false);
const recoverMsgs    = ref([]);
const recoverLoading = ref(false);

// ─── REPORT MODE FUNCTIONS ───────────────────────────────────────────────────

/**
 * enterReportMode
 * Activates report mode and fetches the conversation snapshot from the server.
 * The snapshot contains copies of messages that were unsent or cleared — they are
 * preserved server-side specifically to support abuse reports.
 */
const enterReportMode = async () => {
  reportMode.value = true;
  reportSelected.value = new Set();
  reportReason.value = '';
  reportError.value = '';
  if (activeConvo.value) {
    try {
      const res = await axios.get(`${API}/${activeConvo.value._id}/snapshot`);
      snapshotMsgs.value = (res.data || []).slice().sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
    } catch { snapshotMsgs.value = []; }
  }
};

/**
 * cancelReportMode
 * Exits report mode and resets all related state without submitting anything.
 */
const cancelReportMode = () => {
  reportMode.value = false;
  reportSelected.value = new Set();
  reportReason.value = '';
  reportError.value = '';
  snapshotMsgs.value = [];
};

// ─── RECOVER MODE FUNCTIONS ───────────────────────────────────────────────────

const enterRecoverMode = async () => {
  if (!activeConvo.value) return;
  recoverMode.value = true;
  recoverMsgs.value = [];
  recoverLoading.value = true;
  try {
    const res = await axios.get(`${API}/${activeConvo.value._id}/snapshot`);
    const myId       = user.value?.id?.toString() || user.value?._id?.toString();
    const myUsername = user.value?.username;
    recoverMsgs.value = (res.data || [])
      .filter(m => m.sender?.toString() === myId || m.senderUsername === myUsername)
      .sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
  } catch {
    recoverMsgs.value = [];
  } finally {
    recoverLoading.value = false;
  }
};

const restoreMessage = async (body) => {
  if (!body.trim() || !activeConvo.value) return;
  recoverMode.value = false;
  recoverMsgs.value = [];
  try {
    const res = await axios.post(`${API}/${activeConvo.value._id}`, { body });
    messages.value.push(res.data);
    activeConvo.value.lastMessage = body;
    await nextTick();
    scrollBottom();
  } catch { /* silently ignore */ }
};

const recoverAll = async () => {
  if (!recoverMsgs.value.length || !activeConvo.value) return;
  const toSend = recoverMsgs.value.slice();
  recoverMode.value = false;
  recoverMsgs.value = [];
  for (const m of toSend) {
    if (!m.body?.trim()) continue;
    try {
      const res = await axios.post(`${API}/${activeConvo.value._id}`, { body: m.body });
      messages.value.push(res.data);
      activeConvo.value.lastMessage = m.body;
    } catch { /* silently ignore */ }
  }
  await nextTick();
  scrollBottom();
};

const cancelRecoverMode = () => {
  recoverMode.value = false;
  recoverMsgs.value = [];
};

/**
 * toggleReportSelect
 * Adds or removes a message from the report selection Set.
 * Uses a new Set instance on every change so Vue's reactivity system detects
 * the mutation (Sets are not deeply reactive by default).
 * Enforces a hard cap of 25 selected messages.
 *
 * @param {Object} m - Message object; can be a live message (has _id) or
 *                     a snapshot message (has sentAt but no _id).
 */
const toggleReportSelect = (m) => {
  // Use _id for live messages; fall back to sentAt string for snapshot messages
  const key = m._id || m.sentAt?.toString();
  const s = new Set(reportSelected.value);
  if (s.has(key)) { s.delete(key); }
  else {
    if (s.size >= 25) { reportError.value = 'Max 25 messages'; return; }
    s.add(key);
  }
  // Replace the ref value with a new Set so Vue re-renders the selected state
  reportSelected.value = s;
  reportError.value = '';
};

/**
 * submitReport
 * POSTs the selected messages (as snapshots) and the written reason to the API.
 * Merges live messages and snapshot messages into one pool before filtering so
 * both types can be included in the same report.
 * Resets report mode on success and shows a confirmation alert.
 */
const submitReport = async () => {
  if (!reportReason.value.trim()) { reportError.value = 'A reason is required.'; return; }
  if (!reportSelected.value.size) { reportError.value = 'Select at least one message.'; return; }
  reportSubmitting.value = true;
  reportError.value = '';
  try {
    // Merge live and snapshot messages so we can look up any selected key
    const allMsgs = [...messages.value, ...snapshotMsgs.value];
    // Build serialised snapshots: normalise sender fields because live messages
    // have a populated sender object while snapshot messages store raw ids/usernames
    const snapshots = allMsgs
      .filter(m => reportSelected.value.has(m._id || m.sentAt))
      .map(m => ({
        sender: m.sender?._id || m.sender,
        senderUsername: m.sender?.username || m.senderUsername,
        body: m.body,
        sentAt: m.createdAt || m.sentAt,
      }));
    await axios.post(`${API}/${activeConvo.value._id}/report`, {
      reason: reportReason.value.trim(),
      messages: snapshots,
    });
    cancelReportMode();
    alertModal.value = { show: true, msg: 'Report submitted. Thank you.' };
  } catch (err) {
    reportError.value = err.response?.data?.message || 'Failed to submit report.';
  } finally {
    reportSubmitting.value = false;
  }
};

// ─── COMPUTED ─────────────────────────────────────────────────────────────────

/**
 * filteredMutuals
 * Client-side filter of the mutual followers list used in the "New Message" modal.
 * Returns all mutuals when the search query is empty, otherwise returns only
 * those whose username contains the query string (case-insensitive).
 */
const filteredMutuals = computed(() => {
  const q = mutualSearch.value.trim().toLowerCase();
  return q ? mutuals.value.filter(u => u.username.toLowerCase().includes(q)) : mutuals.value;
});

// ─── SOCKET HANDLER CLEANUP REFS ─────────────────────────────────────────────

// Hold the de-registration functions returned by addDmHandler / addClearHandler.
// Called in onUnmounted to prevent the handlers from firing after the page is gone.
let removeDmHandler = null;
let removeClearHandler = null;

// ─── LIFECYCLE: MOUNT ─────────────────────────────────────────────────────────

onMounted(async () => {
  // Fetch the user's conversation list to populate the left panel
  try {
    const res = await axios.get(API);
    conversations.value = res.data;
  } catch { /* ignore — the panel shows an empty-state message */ }
  finally { convosLoading.value = false; }

  // Sync the global unread DM count badge in the nav with the server's value.
  // This ensures the badge is accurate even if messages arrived while the user
  // was away and the Socket.io handler missed them.
  try {
    const r = await axios.get(`${API}/unread-count`);
    setDmCount(r.data.count);
  } catch { /* ignore */ }

  // ── SOCKET: CLEAR HANDLER ─────────────────────────────────────────────────
  // Fired when the other participant clears the conversation from their side.
  // Updates the preview text in the left panel and wipes the message array if
  // the cleared conversation is the one currently open.
  removeClearHandler = addClearHandler((data) => {
    const c = conversations.value.find(c => c._id === data.conversationId);
    if (c) c.lastMessage = '';
    if (activeConvo.value?._id === data.conversationId) messages.value = [];
  });

  // ── SOCKET: INCOMING DM HANDLER ──────────────────────────────────────────
  // Fired when a new message arrives for any conversation belonging to this user.
  removeDmHandler = addDmHandler((data) => {
    if (activeConvo.value?._id === data.conversationId.toString()) {
      // The message is for the currently open conversation — append it and scroll
      messages.value.push(data.message);
      scrollBottom();
      // Mark as read immediately since the user is looking at the conversation
      decrementDmCount(1);
      axios.put(`${API}/${data.conversationId}/read`).catch(() => { });
    }
    // Update the conversation preview row in the left panel
    const c = conversations.value.find(c => c._id === data.conversationId.toString());
    if (c) {
      c.lastMessage = data.message.body;
      // Increment unread badge only when the conversation is NOT currently open
      if (activeConvo.value?._id !== data.conversationId.toString()) c.unread = (c.unread || 0) + 1;
    } else {
      // The message belongs to a conversation not yet in the list (e.g. first-ever DM).
      // Re-fetch the full list so the new conversation row appears.
      axios.get(API).then(r => { conversations.value = r.data; }).catch(() => { });
    }
  });
});

// ─── LIFECYCLE: UNMOUNT ───────────────────────────────────────────────────────

onUnmounted(() => {
  // Remove socket handlers to avoid them firing on a destroyed component instance
  if (removeDmHandler) removeDmHandler();
  if (removeClearHandler) removeClearHandler();
});

// ─── CONVERSATION ACTIONS ─────────────────────────────────────────────────────

/**
 * openConvo
 * Opens a conversation in the chat panel by fetching its messages from the API.
 * Also marks the conversation as read (both locally and on the server) and
 * scrolls to the bottom after the DOM updates.
 *
 * @param {Object} convo - Conversation object from the conversations array.
 */
const openConvo = async (convo) => {
  activeConvo.value = convo;
  messages.value = [];
  msgsLoading.value = true;
  hasMore.value = false;
  earliestDate.value = null;
  // Exit report/recover mode whenever a new conversation is opened
  cancelReportMode();
  cancelRecoverMode();
  try {
    const res = await axios.get(`${API}/${convo._id}`);
    messages.value = res.data;
    // If exactly 40 messages were returned the server likely has more pages
    hasMore.value = res.data.length === 40;
    // Store the oldest message's timestamp to use as the "before" cursor
    if (res.data.length) earliestDate.value = res.data[0].createdAt;
    // Mark unread messages as read if there are any
    if (convo.unread > 0) {
      decrementDmCount(convo.unread);
      convo.unread = 0;
      await axios.put(`${API}/${convo._id}/read`);
    }
  } catch { /* ignore */ }
  finally { msgsLoading.value = false; }
  // Wait for Vue to finish rendering the messages before scrolling
  await nextTick();
  scrollBottom();
  chatInputEl.value?.focus();
};

/**
 * loadMore
 * Fetches the previous page of messages using a cursor-based "before" parameter.
 * Prepends the older messages to the front of the messages array and updates
 * the earliest-date cursor for the next load.
 */
const loadMore = async () => {
  if (!earliestDate.value) return;
  try {
    const res = await axios.get(`${API}/${activeConvo.value._id}?before=${earliestDate.value}&limit=40`);
    if (res.data.length) {
      // Prepend older messages while keeping newer ones at the bottom
      messages.value = [...res.data, ...messages.value];
      earliestDate.value = res.data[0].createdAt;
      // Still more pages if a full page was returned
      hasMore.value = res.data.length === 40;
    } else {
      // No more messages exist above this point
      hasMore.value = false;
    }
  } catch { /* ignore */ }
};

// ─── MESSAGE ACTIONS ──────────────────────────────────────────────────────────

/**
 * sendMsg
 * Sends the current draft as a new message.
 * Clears the draft optimistically before the request; restores it on failure
 * so the user doesn't lose their text.
 */
const sendMsg = async () => {
  if (!draft.value.trim() || !activeConvo.value) return;
  const body = draft.value.trim();
  draft.value = '';
  try {
    const res = await axios.post(`${API}/${activeConvo.value._id}`, { body });
    messages.value.push(res.data);
    // Keep the left-panel preview in sync without re-fetching the full list
    activeConvo.value.lastMessage = body;
    await nextTick();
    scrollBottom();
  } catch { draft.value = body; } // Restore draft so the user can retry
  chatInputEl.value?.focus();
};

/**
 * openUnsendConfirm
 * Opens the "Unsend Message" confirmation modal, storing the target message
 * object so executeUnsend() can act on the correct message.
 *
 * @param {Object} m - The message object to unsend.
 */
const openUnsendConfirm = (m) => {
  unsendModal.value = { show: true, msgObj: m };
};

/**
 * executeUnsend
 * Removes a message optimistically from the local array, then sends the DELETE
 * request.  If the request fails the message is restored at its original index
 * and an error alert is shown.
 */
const executeUnsend = async () => {
  const m = unsendModal.value.msgObj;
  unsendModal.value.show = false;
  if (!m || !activeConvo.value) return;
  // Optimistic removal — gives instant feedback before the server responds
  const idx = messages.value.findIndex(msg => msg._id === m._id);
  if (idx !== -1) messages.value.splice(idx, 1);
  try {
    await axios.delete(`${API}/${activeConvo.value._id}/${m._id}`);
  } catch (err) {
    // Rollback: re-insert the message at its original position
    if (idx !== -1) messages.value.splice(idx, 0, m);
    alertModal.value = { show: true, msg: err.response?.data?.message || 'Could not unsend message.' };
  }
};

// ─── CLEAR CHAT ACTIONS ───────────────────────────────────────────────────────

/**
 * openClearConfirm
 * Opens the "Clear Conversation" confirmation modal.
 */
const openClearConfirm = () => { clearModal.value = true; };

/**
 * executeClear
 * Clears all messages in the active conversation for both participants.
 * Applies the change optimistically and rolls back on failure.
 */
const executeClear = async () => {
  const convoId = activeConvo.value?._id;
  clearModal.value = false;
  if (!convoId) return;
  // Snapshot current state for rollback
  const backup = messages.value.slice();
  const backupMsg = activeConvo.value.lastMessage;
  // Optimistic clear — clear instantly before the request
  messages.value = [];
  activeConvo.value.lastMessage = '';
  try {
    await axios.delete(`${API}/${convoId}/clear`);
  } catch (err) {
    // Rollback both the message array and the preview text
    messages.value = backup;
    activeConvo.value.lastMessage = backupMsg;
    alertModal.value = { show: true, msg: err.response?.data?.message || 'Could not clear conversation.' };
  }
};

// ─── BLOCK USER ACTIONS ───────────────────────────────────────────────────────

/**
 * openBlockConfirm
 * Populates and opens the "Block User" confirmation modal.
 * Stores the target user's id and the current conversation's id in blockModal
 * so executeBlock() knows which user to block and which conversation to remove.
 */
const openBlockConfirm = () => {
  if (!activeConvo.value?.other) return;
  blockModal.value = {
    show: true,
    msg: `Block @${activeConvo.value.other.username}? They will be removed from your followers and following, and you won't be able to DM each other.`,
    targetId: activeConvo.value.other._id,
    convoId: activeConvo.value._id,
  };
};

/**
 * executeBlock
 * Sends the block request to the server.  On success, removes the conversation
 * from the left panel and closes the chat panel by clearing activeConvo.
 */
const executeBlock = async () => {
  const { targetId, convoId } = blockModal.value;
  blockModal.value.show = false;
  try {
    await axios.post(`${API_USERS}/block/${targetId}`);
    // Remove the conversation from the list so it disappears from the panel
    conversations.value = conversations.value.filter(c => c._id !== convoId);
    activeConvo.value = null;
  } catch (err) {
    alertModal.value = { show: true, msg: err.response?.data?.message || 'Could not block user.' };
  }
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * scrollBottom
 * Scrolls the chat message container to the bottom so the latest message is
 * visible.  Wrapped in nextTick to run after Vue has finished rendering.
 */
const scrollBottom = () => {
  nextTick(() => {
    if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight;
  });
};

/**
 * startConvo
 * Creates a new conversation with the selected mutual follower (or retrieves
 * the existing one if it already exists) via a POST to the API, then opens it.
 * Prepends the new conversation to the top of the list if it isn't already there.
 *
 * @param {Object} u - User object from the mutual followers list.
 */
const startConvo = async (u) => {
  showNewModal.value = false;
  mutualSearch.value = '';
  try {
    const res = await axios.post(API, { recipientId: u._id });
    // Avoid duplicate entries in the list if the conversation already existed
    const existing = conversations.value.find(c => c._id === res.data._id);
    if (!existing) conversations.value.unshift(res.data);
    await openConvo(res.data);
  } catch (err) {
    alertModal.value = { show: true, msg: err.response?.data?.message || 'Could not start conversation.' };
  }
};

// ─── WATCHER: NEW MESSAGE MODAL ───────────────────────────────────────────────

/**
 * Watch showNewModal
 * Lazily fetches the mutual followers list the first time the modal is opened.
 * Subsequent opens reuse the cached list to avoid redundant network requests.
 */
watch(showNewModal, async (val) => {
  if (val && !mutuals.value.length) {
    mutualsLoading.value = true;
    try {
      const res = await axios.get(`${API_USERS}/mutual-followers`);
      mutuals.value = res.data.mutuals;
    } catch { mutuals.value = []; }
    finally { mutualsLoading.value = false; }
  }
});

// ─── FORMATTING UTILITIES ─────────────────────────────────────────────────────

/**
 * linkify
 * Converts plain-text message bodies into safe HTML by:
 *   1. HTML-escaping all special characters to prevent XSS.
 *   2. Wrapping http/https URLs in <a> tags that open in a new tab.
 * The output is rendered via v-html so escaping MUST happen before URL wrapping.
 *
 * @param {string} text - Raw message body.
 * @returns {string} HTML string safe to bind with v-html.
 */
const linkify = (text) => {
  // Escape HTML entities first so angle brackets in text can't inject tags
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(
    /(https?:\/\/[^\s]+)/g,
    url => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="msg-link">${url}</a>`
  );
};

/**
 * formatTime
 * Returns a human-readable timestamp for a message.
 * - Same day  → "3:45 PM"
 * - Other day → "Mar 9 3:45 PM"
 *
 * @param {string|Date} d - ISO date string or Date object.
 * @returns {string} Formatted time string.
 */
const formatTime = (d) => {
  const date = new Date(d);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
</script>

<style scoped>
.msg-page {
  display: flex;
  height: calc(100vh - 56px - 24px);
  max-width: 900px;
  margin: 12px auto 12px;
  border: 3px solid #000;
  border-radius: 14px;
  gap: 0;
  overflow: hidden;
}

/* ── Conversation panel ── */
.convo-panel {
  width: 280px;
  flex-shrink: 0;
  border-right: 3px solid #000;
  display: flex;
  flex-direction: column;
  background: pink;
  overflow: hidden;
}

.convo-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 2px solid #000;
  flex-shrink: 0;
}

.panel-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #000;
  margin: 0;
}

.new-msg-btn {
  background: #000;
  color: pink;
  border: 2px solid #14532d;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s;
}

.new-msg-btn:hover {
  transform: translateY(-1px);
  color: rgb(125, 190, 157);
}

.msg-status {
  text-align: center;
  font-size: 0.9rem;
  font-weight: 600;
  color: #555;
  padding: 24px 16px;
  line-height: 1.5;
}

.mutual-notice {
  font-size: 0.88rem;
  font-weight: 800;
  color: #000;
  text-align: center;
  padding: 7px 12px;
  background: rgba(0, 0, 0, 0.04);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.convo-list {
  overflow-y: auto;
  flex: 1;
}

.convo-item {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.15);
  cursor: pointer;
  position: relative;
  transition: background 0.15s;
}

.convo-item:hover {
  background: rgba(0, 0, 0, 0.06);
}

.convo-item.active {
  background: rgba(0, 0, 0, 0.12);
}

.convo-item.unread .convo-item__name {
  color: #14532d;
}

.convo-item__name {
  font-weight: 700;
  font-size: 0.92rem;
  color: #000;
  margin-bottom: 2px;
}

.convo-item__preview {
  font-size: 0.8rem;
  color: #555;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.convo-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  background: #e11d48;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  border-radius: 9999px;
  padding: 1px 5px;
  min-width: 16px;
  text-align: center;
}

/* ── Chat panel ── */
.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff0f6;
}

.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  font-size: 0.95rem;
  font-weight: 600;
}

.chat-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 3px solid #000;
  background: pink;
  flex-shrink: 0;
}

.chat-header__top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-header__actions {
  display: flex;
  gap: 8px;
}

.back-btn {
  background: #000;
  color: pink;
  border: 2px solid #14532d;
  border-radius: 6px;
  padding: 4px 9px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  display: none;
  flex-shrink: 0;
}

.chat-header__name {
  font-weight: 700;
  font-size: 1.05rem;
  color: #000;
  cursor: pointer;
  text-decoration: underline;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-header__name:hover {
  color: #14532d;
}

.clear-btn {
  background: #1c1c1c;
  color: #ccc;
  border: 2px solid #444;
  border-radius: 7px;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 5px 11px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s, transform 0.15s;
}

.clear-btn:hover {
  background: #333;
  color: #fff;
  transform: translateY(-1px);
}

.block-btn {
  background: #7f1d1d;
  color: #fff;
  border: 2px solid #450a0a;
  border-radius: 7px;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 5px 11px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, transform 0.15s;
}

.block-btn:hover {
  background: #991b1b;
  transform: translateY(-1px);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.messages-inner {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.load-more-wrap {
  text-align: center;
  margin-bottom: 8px;
}

.load-more-btn {
  background: #000;
  color: pink;
  border: 2px solid #14532d;
  border-radius: 6px;
  padding: 5px 14px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.bubble-wrap {
  display: flex;
  flex-direction: column;
  max-width: 72%;
}

.bubble-wrap.mine {
  align-items: flex-end;
  align-self: flex-end;
}

.bubble-wrap.theirs {
  align-items: flex-start;
  align-self: flex-start;
}

.bubble-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mine .bubble-row {
  flex-direction: row-reverse;
}

.bubble {
  padding: 9px 14px;
  border-radius: 18px;
  font-size: 0.92rem;
  line-height: 1.45;
  word-break: break-word;
  white-space: pre-wrap;
  position: relative;
}

.mine .bubble {
  background: #000;
  color: pink;
  border-radius: 18px 18px 4px 18px;
}

.theirs .bubble {
  background: pink;
  color: #000;
  border: 2px solid #000;
  border-radius: 18px 18px 18px 4px;
}

.unsend-btn {
  background: rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.18);
  color: #888;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  opacity: 0.45;
  transition: opacity 0.15s, color 0.15s, background 0.15s, border-color 0.15s, transform 0.15s;
  flex-shrink: 0;
  line-height: 1;
}

.bubble-wrap:hover .unsend-btn {
  opacity: 1;
}

.unsend-btn:hover {
  color: #fff;
  background: #e11d48;
  border-color: #9f1239;
  transform: scale(1.05);
}

.bubble-time {
  font-size: 0.68rem;
  color: #999;
  margin-top: 2px;
  padding: 0 4px;
}

/* Incoming message animation */
.msg-in-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.msg-in-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.97);
}

.chat-input-row {
  display: flex;
  gap: 8px;
  padding: 12px 14px;
  border-top: 3px solid #000;
  background: pink;
  flex-shrink: 0;
  align-items: flex-end;
}

.chat-input {
  flex: 1;
  padding: 9px 12px;
  border-radius: 10px;
  border: 3px solid #7f1d1d;
  font-size: 0.92rem;
  font-weight: 600;
  outline: none;
  resize: none;
  max-height: 120px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.chat-input:focus {
  border-color: #14532d;
}

.chat-input::placeholder {
  color: #aaa;
  font-weight: 500;
}

.send-btn {
  background: #000;
  color: pink;
  border: 3px solid #14532d;
  border-radius: 8px;
  padding: 9px 18px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  color: rgb(125, 190, 157);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* ── New message modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-box {
  background: pink;
  border: 3px solid #000;
  border-radius: 14px;
  padding: 22px;
  width: 100%;
  max-width: 340px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #000;
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  color: #7f1d1d;
}

.modal-hint {
  font-size: 0.82rem;
  color: #555;
  margin: 0;
}

.mutual-search {
  width: 100%;
  padding: 9px 12px;
  border-radius: 8px;
  border: 3px solid #14532d;
  font-size: 0.9rem;
  font-weight: 600;
  outline: none;
  box-sizing: border-box;
}

.mutual-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mutual-item {
  background: #000;
  color: pink;
  border-radius: 8px;
  padding: 9px 14px;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  transition: transform 0.15s;
}

.mutual-item:hover {
  transform: translateX(4px);
  color: rgb(125, 190, 157);
}

/* ── Links in messages ── */
:deep(.msg-link) {
  color: #ffffff !important;
  text-decoration: underline;
  word-break: break-all;
}

:deep(.msg-link:visited) {
  color: #e9d5ff !important;
}

.report-active :deep(.msg-link) {
  pointer-events: none;
  cursor: default;
}

.snapshot-banner {
  text-align: center;
  font-size: 0.82rem;
  font-weight: 700;
  color: #7c3aed;
  background: #f5f3ff;
  border-radius: 8px;
  padding: 6px 12px;
  margin-bottom: 8px;
}

/* ── Report mode ── */
.report-btn {
  background: #7c3aed;
  color: #fff;
  border: 2px solid #5b21b6;
  border-radius: 7px;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 5px 11px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}
.report-btn:hover { background: #6d28d9; }

.recover-btn {
  background: #14532d;
  color: #fff;
  border: 2px solid #166534;
  border-radius: 7px;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 5px 11px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}
.recover-btn:hover { background: #166534; }

/* ── Recover panel ── */
.recover-panel {
  border-top: 1px solid rgba(0,0,0,0.12);
  padding: 10px 14px;
  max-height: 200px;
  overflow-y: auto;
  background: #f8fff8;
}

.recover-empty {
  text-align: center;
  font-size: 0.85rem;
  color: #777;
  padding: 12px 0;
}

.recover-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.recover-all-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 4px;
}
.recover-all-btn {
  padding: 6px 14px;
  background: #1a56db;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}
.recover-all-btn:hover { background: #1e40af; }

.recover-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border: 2px solid #14532d;
  border-radius: 10px;
  padding: 8px 12px;
}

.recover-body {
  flex: 1;
  font-size: 0.88rem;
  color: #000;
  word-break: break-word;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.recover-time {
  font-size: 0.75rem;
  color: #888;
  flex-shrink: 0;
}

.restore-btn {
  background: #14532d;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 4px 10px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}
.restore-btn:hover { background: #166534; }

.report-count-txt {
  font-size: 0.82rem;
  font-weight: 700;
  color: #7c3aed;
}

.report-cancel-btn {
  background: #6b7280;
  color: #fff;
  border: 2px solid #4b5563;
  border-radius: 7px;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 5px 11px;
  cursor: pointer;
}

.bubble-wrap.reportable {
  cursor: pointer;
}

.bubble.selected {
  outline: 2.5px solid #7c3aed;
  outline-offset: 1px;
}

.bubble.selected::after {
  content: '✓';
  position: absolute;
  top: -8px;
  right: -8px;
  background: #7c3aed;
  color: #fff;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  font-size: 0.72rem;
  font-weight: 900;
  display: grid;
  place-items: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}

.report-panel {
  padding: 12px 14px;
  border-top: 2px solid #7c3aed;
  background: #f5f3ff;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.report-reason-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  border: 2px solid #7c3aed;
  font-size: 0.9rem;
  font-weight: 500;
  resize: none;
  outline: none;
  box-sizing: border-box;
}

.report-panel-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.report-hint {
  font-size: 0.8rem;
  color: #555;
  font-weight: 600;
}

.report-submit-btn {
  background: #7c3aed;
  color: #fff;
  border: none;
  border-radius: 7px;
  padding: 7px 18px;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}

.report-submit-btn:hover:not(:disabled) {
  background: #6d28d9;
}

.report-submit-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.report-err {
  font-size: 0.8rem;
  color: #e11d48;
  font-weight: 600;
  margin: 0;
}

/* ── Mobile ── */
@media (max-width: 640px) {
  .msg-page {
    height: calc(100vh - 50px - 16px);
    margin: 8px 8px 8px;
    flex-direction: column;
    border-radius: 10px;
  }

  .convo-panel {
    width: 100%;
    border-right: none;
    border-bottom: 3px solid #000;
  }

  .chat-panel {
    width: 100%;
  }

  .hidden-mobile {
    display: none;
  }

  .back-btn {
    display: block;
  }

  .clear-btn,
  .block-btn {
    font-size: 0.74rem;
    padding: 4px 9px;
  }
}
</style>
