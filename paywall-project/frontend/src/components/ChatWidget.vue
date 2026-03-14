<template>
    <!-- The entire widget is hidden on the /messages route to avoid doubling up the
       full-page MessagesPage with this floating widget.  isMessagesRoute controls this. -->
    <div class="cw" v-if="!isMessagesRoute">
        <!-- Panel -->
        <!-- cw-slide transition animates the panel sliding up/fading in when toggled -->
        <transition name="cw-slide">
            <div v-if="isOpen" class="cw-panel">
                <!-- Header -->
                <div class="cw-header">
                    <div class="cw-header-top">
                        <!-- Back button: returns from the chat view to the conversation list -->
                        <button v-if="activeConvo" class="cw-back" @click="activeConvo = null">←</button>
                        <!-- When a conversation is active, clicking the username navigates to
                 that user's creator profile and closes the widget -->
                        <span
                            v-if="activeConvo"
                            class="cw-title cw-title--link"
                            @click="router.push(`/creator/${activeConvo.other?.username}`); isOpen = false"
                        >@{{ activeConvo.other?.username }}</span>
                        <span v-else class="cw-title">💬 Messages</span>
                        <button class="cw-close" @click="isOpen = false">✕</button>
                    </div>
                    <!-- Action buttons only appear when a conversation is open -->
                    <div v-if="activeConvo" class="cw-header-actions">
                        <!-- Normal mode: Report / Recover / Clear Chat / Block -->
                        <template v-if="!reportMode && !recoverMode">
                            <button class="cw-report" @click="enterReportMode">🚩 Report</button>
                            <button class="cw-recover" @click="enterRecoverMode">📥 Recover</button>
                            <button class="cw-clear" @click="openClearConfirm">🗑 Clear</button>
                            <button class="cw-block" @click="openBlockConfirm">🚫 Block</button>
                        </template>
                        <!-- Report mode: selection counter + Cancel -->
                        <template v-else-if="reportMode">
                            <span class="cw-report-count">{{ reportSelected.size }}/25 selected</span>
                            <button class="cw-report-cancel" @click="cancelReportMode">Cancel</button>
                        </template>
                        <!-- Recover mode: label + Cancel -->
                        <template v-else-if="recoverMode">
                            <span class="cw-report-count">📥 Recover messages</span>
                            <button class="cw-report-cancel" @click="cancelRecoverMode">Cancel</button>
                        </template>
                    </div>
                </div>

                <!-- Conversation list — shown when no conversation is active -->
                <template v-if="!activeConvo">
                    <p class="cw-mutual-notice">You can only message users who follow you back.</p>
                    <p v-if="convosLoading" class="cw-status">Loading...</p>
                    <p v-else-if="!conversations.length" class="cw-status">No conversations yet.</p>
                    <div v-else class="cw-convo-list">
                        <!-- 'unread' bolds the username when there are unread messages -->
                        <div
                            v-for="c in conversations" :key="c._id"
                            class="cw-convo-item"
                            :class="{ unread: c.unread > 0 }"
                            @click="openConvo(c)"
                        >
                            <div class="cw-convo-name">@{{ c.other?.username }}</div>
                            <!-- Last message preview; truncated with CSS text-overflow -->
                            <div class="cw-convo-preview">{{ c.lastMessage || 'No messages yet' }}</div>
                            <!-- Red badge showing unread count -->
                            <span v-if="c.unread > 0" class="cw-badge">{{ c.unread }}</span>
                        </div>
                    </div>
                    <!-- Opens the "New Message" modal to start a fresh DM -->
                    <button class="cw-new-btn" @click="showNewModal = true">+ New conversation</button>
                </template>

                <!-- Chat view — shown when a conversation has been opened -->
                <template v-else>
                    <!-- Scrollable message area; 'report-active' disables link clicks during report mode -->
                    <div class="cw-messages" ref="chatEl" :class="{ 'report-active': reportMode }">
                        <p v-if="msgsLoading" class="cw-status">Loading...</p>
                        <template v-else>
                            <!-- "Load earlier" button shown when more pages exist above the current view -->
                            <div v-if="hasMore" class="cw-load-more-wrap">
                                <button class="cw-load-more" @click="loadMore">Load earlier</button>
                            </div>

                            <!-- ── SNAPSHOT MESSAGES ────────────────────────────────────────────
                   Snapshot messages are server-preserved copies of unsent/cleared
                   messages, fetched when entering report mode so evidence cannot be
                   destroyed before a report is submitted.  Keyed by sentAt because
                   they have no _id. -->
                            <template v-if="reportMode && snapshotMsgs.length">
                                <p class="cw-snapshot-banner">📋 Unsent / cleared messages (available for reporting)</p>
                                <!-- Align right if the snapshot message came from the current user -->
                                <div
                                    v-for="m in snapshotMsgs" :key="m.sentAt"
                                    class="cw-bubble-wrap"
                                    :class="[m.sender?.toString() === userId?.toString() ? 'mine' : 'theirs', 'reportable']"
                                    @click="toggleReportSelect(m)"
                                >
                                    <div class="cw-bubble-row">
                                        <!-- Purple outline + checkmark badge (CSS ::after) when selected -->
                                        <div class="cw-bubble" :class="{ selected: reportSelected.has(m.sentAt?.toString()) }">
                                            {{ m.body }}
                                        </div>
                                    </div>
                                    <span class="cw-time">{{ formatTime(m.sentAt) }}</span>
                                </div>
                            </template>

                            <!-- Live messages with entrance animation.
                   In report mode every bubble is clickable for selection.
                   Outside report mode only own messages show the unsend button. -->
                            <TransitionGroup name="cw-msg-in" tag="div" class="cw-messages-inner">
                                <!-- Attach click handler only in report mode; normal bubbles should
                                     not intercept clicks so the unsend button works correctly -->
                                <div
                                    v-for="m in messages" :key="m._id"
                                    class="cw-bubble-wrap"
                                    :class="[m.sender._id === userId ? 'mine' : 'theirs', reportMode ? 'reportable' : '']"
                                    v-on="reportMode ? { click: () => toggleReportSelect(m) } : {}"
                                >
                                    <div class="cw-bubble-row">
                                        <!-- v-html is safe: linkify() escapes HTML before injecting <a> tags -->
                                        <div class="cw-bubble" :class="{ selected: reportMode && reportSelected.has(m._id) }" v-html="linkify(m.body)"></div>
                                        <!-- Unsend button: fades in on hover via CSS; only visible for own messages -->
                                        <button
                                            v-if="!reportMode && m.sender._id === userId"
                                            class="cw-unsend"
                                            @click="openUnsendConfirm(m)"
                                            title="Unsend"
                                        >✕</button>
                                    </div>
                                    <span class="cw-time">{{ formatTime(m.createdAt) }}</span>
                                </div>
                            </TransitionGroup>
                        </template>
                    </div>

                    <!-- ── REPORT SUBMIT PANEL ──────────────────────────────────────────
               Visible only in report mode.  Requires a written reason AND at
               least one selected message before the submit button is enabled. -->
                    <div v-if="reportMode" class="cw-report-panel">
                        <textarea
                            v-model="reportReason"
                            class="cw-report-reason"
                            placeholder="Reason for report (required)..."
                            maxlength="500"
                            rows="2"
                        />
                        <div class="cw-report-actions">
                            <span class="cw-report-hint">{{ reportSelected.size }} message{{ reportSelected.size !== 1 ? 's' : '' }} selected</span>
                            <!-- Disabled while in-flight, or when reason is empty, or no messages selected -->
                            <button class="cw-report-submit" @click="submitReport" :disabled="reportSubmitting || !reportReason.trim() || !reportSelected.size">
                                {{ reportSubmitting ? 'Sending...' : 'Submit Report' }}
                            </button>
                        </div>
                        <p v-if="reportError" class="cw-report-err">{{ reportError }}</p>
                    </div>

                    <!-- ── RECOVER PANEL ────────────────────────────────────────────────
               Shows unsent/cleared messages the current user sent.
               Each item has a Send button that re-sends it into the chat. -->
                    <div v-if="recoverMode" class="cw-recover-panel">
                        <p v-if="recoverLoading" class="cw-status">Loading...</p>
                        <p v-else-if="!recoverMsgs.length" class="cw-recover-empty">No recoverable messages found.</p>
                        <div v-else class="cw-recover-list">
                            <div class="cw-recover-all-row">
                                <button class="cw-recover-all-btn" @click="recoverAll">↩ Send All</button>
                            </div>
                            <div v-for="(m, i) in recoverMsgs" :key="i" class="cw-recover-item">
                                <span class="cw-recover-body">{{ m.body }}</span>
                                <span class="cw-recover-time">{{ formatTime(m.sentAt) }}</span>
                                <button class="cw-restore-btn" @click="restoreMessage(m.body)">↩ Send</button>
                            </div>
                        </div>
                    </div>

                    <!-- Compose area — hidden during report mode -->
                    <div v-if="!reportMode" class="cw-input-row">
                        <!-- Enter alone sends; Shift+Enter inserts a newline -->
                        <textarea
                            ref="chatInputEl"
                            v-model="draft"
                            class="cw-input"
                            placeholder="Type a message..."
                            maxlength="2000"
                            rows="1"
                            @keydown.enter.exact.prevent="sendMsg"
                        />
                        <button class="cw-send" @click="sendMsg" :disabled="!draft.trim()">→</button>
                    </div>
                </template>
            </div>
        </transition>

        <!-- ── TOGGLE BUTTON ──────────────────────────────────────────────────────
         Floating circular button that opens/closes the widget.
         Shows a red unread badge when there are unread DMs and the panel is closed.
         Capped at "99+" to keep the badge compact. -->
        <button class="cw-toggle" @click="toggleWidget" :class="{ open: isOpen }">
            <span>💬</span>
            <span v-if="dmUnreadCount > 0 && !isOpen" class="cw-toggle-badge">
                {{ dmUnreadCount > 99 ? '99+' : dmUnreadCount }}
            </span>
        </button>

        <!-- ── THEMED CONFIRMATION MODALS ─────────────────────────────────────────
         Destructive actions go through AppModal for consistent UX.  Note: no
         alertModal here — the widget uses a plain alert() for errors on startConvo. -->

        <!-- Clear conversation: wipes all messages for both participants -->
        <AppModal
            :show="clearModal"
            title="⚠️ Permanently Unrecoverable"
            message="This chat was already cleared once. Any remaining messages are permanently unrecoverable and cannot be restored."
            danger
            ok-label="Clear Anyway"
            cancel-label="Cancel"
            @ok="executeClear"
            @cancel="clearModal = false"
        />
        <!-- Block user: removes mutual-follow relationship and closes the DM -->
        <AppModal
            :show="blockModal.show"
            title="Block User"
            :message="blockModal.msg"
            danger
            ok-label="Yes, Block"
            cancel-label="Cancel"
            @ok="executeBlock"
            @cancel="blockModal.show = false"
        />
        <!-- Unsend message: removes a single own message -->
        <AppModal
            :show="unsendModal.show"
            title="Unsend Message"
            message="Remove this message? This can't be undone."
            danger
            ok-label="Unsend"
            cancel-label="Cancel"
            @ok="executeUnsend"
            @cancel="unsendModal.show = false"
        />

        <!-- New conversation modal — search mutual followers and start a DM -->
        <div v-if="showNewModal" class="cw-modal-overlay" @click.self="showNewModal = false">
            <div class="cw-modal">
                <div class="cw-modal-header">
                    <h3>New Message</h3>
                    <button @click="showNewModal = false">✕</button>
                </div>
                <!-- Client-side filter input; filters filteredMutuals computed property -->
                <input v-model="mutualSearch" class="cw-mutual-search" placeholder="Search mutual followers..." />
                <p v-if="mutualsLoading" class="cw-status">Loading...</p>
                <p v-else-if="!filteredMutuals.length" class="cw-status">No mutual followers found.</p>
                <div v-else class="cw-mutual-list">
                    <!-- Clicking a user creates or reopens a conversation with them -->
                    <div v-for="u in filteredMutuals" :key="u._id" class="cw-mutual-item" @click="startConvo(u)">
                        @{{ u.username }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
/**
 * ChatWidget.vue
 *
 * A floating, collapsible direct-messaging widget rendered in a fixed position
 * at the bottom-right of every page EXCEPT /messages (where the full-page
 * MessagesPage takes over).
 *
 * The widget contains the same core DM feature set as MessagesPage:
 *   - Conversation list with unread badges
 *   - Paginated message history with "Load earlier"
 *   - Real-time incoming messages via Socket.io
 *   - Message sending, unsend, clear chat, block user
 *   - Report flow with server-side snapshot support (up to 25 messages)
 *
 * Conversations are loaded lazily — only when the widget is first opened and
 * the list is empty — to avoid unnecessary network requests on every page load.
 *
 * On mobile/tablet (≤900 px) the panel expands to the full viewport width and
 * occupies the top half of the screen so an opening keyboard doesn't cover the
 * input row.
 *
 * Socket.io handlers are registered on mount and cleaned up on unmount.
 */

import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';
import { useAuth } from '../composables/useAuth.js';
import { useNotifications } from '../composables/useNotifications.js';
import AppModal from './AppModal.vue';

// ─── API BASE URLS ────────────────────────────────────────────────────────────

// Endpoint root for message/conversation operations
const API = import.meta.env.VITE_API_URL + '/api/messages';
// Endpoint root for user-level operations (block, mutual-followers lookup)
const API_USERS = import.meta.env.VITE_API_URL + '/api/users';

// ─── COMPOSABLES ─────────────────────────────────────────────────────────────

const router = useRouter();
const route = useRoute();

// Currently authenticated user object
const { user } = useAuth();

// Real-time notification helpers and the global DM unread count for the badge
const { dmUnreadCount, addDmHandler, addClearHandler, decrementDmCount, setDmCount } = useNotifications();

// ─── COMPUTED: ROUTING & IDENTITY ────────────────────────────────────────────

/**
 * userId
 * Normalises the current user's id regardless of whether the auth composable
 * returns it as `id` or `_id`.  Used to identify own messages in the message list.
 */
const userId = computed(() => user.value?.id || user.value?._id);

/**
 * isMessagesRoute
 * True when the current page path starts with /messages.
 * The entire widget is hidden in this case (v-if on the root element) to avoid
 * showing a small floating widget alongside the full-page experience.
 */
const isMessagesRoute = computed(() => route.path.startsWith('/messages'));

// ─── WIDGET STATE ─────────────────────────────────────────────────────────────

// Controls whether the widget panel is open or collapsed
const isOpen = ref(false);

// ─── CONVERSATION LIST STATE ──────────────────────────────────────────────────

// Array of conversation objects; populated lazily when the widget is first opened
const conversations = ref([]);

// True while the conversation list is being fetched
const convosLoading = ref(false);

// The conversation object currently displayed in the chat view; null = list view
const activeConvo = ref(null);

// ─── ACTIVE CHAT STATE ───────────────────────────────────────────────────────

// Array of message objects for the currently open conversation
const messages = ref([]);

// True while messages are loading for a newly opened conversation
const msgsLoading = ref(false);

// Bound to the compose textarea
const draft = ref('');

// Template ref for the scrollable message container — used for programmatic scrolling
const chatEl = ref(null);

// Template ref for the compose textarea — used to restore focus after sending
const chatInputEl = ref(null);

// True when more messages exist before the oldest currently loaded message
const hasMore = ref(false);

// ISO timestamp of the oldest loaded message; cursor for the "Load earlier" request
const earliestDate = ref(null);

// ─── NEW CONVERSATION MODAL STATE ────────────────────────────────────────────

// Controls visibility of the "New Message" modal
const showNewModal = ref(false);

// Full list of mutual followers; fetched lazily on first modal open
const mutuals = ref([]);

// Bound to the search input in the modal
const mutualSearch = ref('');

// True while the mutual followers list is being fetched
const mutualsLoading = ref(false);

// Cleanup functions returned by the socket handler registration calls
let removeDmHandler = null;
let removeClearHandler = null;

// ─── CONFIRMATION MODAL STATE ─────────────────────────────────────────────────

// Controls the "Clear Conversation" confirmation modal
const clearModal = ref(false);

// Controls the "Block User" modal; carries targetId and convoId for executeBlock()
const blockModal = ref({ show: false, msg: '', targetId: null, convoId: null });

// Controls the "Unsend Message" modal; carries the message object
const unsendModal = ref({ show: false, msgObj: null });

// ─── REPORT MODE STATE ───────────────────────────────────────────────────────

// True when the user is in message-selection mode for a report
const reportMode = ref(false);

// Set of message keys (_id or sentAt string) selected for the report
const reportSelected = ref(new Set());

// Bound to the report reason textarea
const reportReason = ref('');

// True while the report POST request is in flight
const reportSubmitting = ref(false);

// Inline error message displayed below the report panel
const reportError = ref('');

// Server-side snapshot of unsent/cleared messages fetched when entering report mode
const snapshotMsgs = ref([]);

// ─── RECOVER MODE STATE ───────────────────────────────────────────────────────

/** Whether the recover panel is open. */
const recoverMode  = ref(false);

/** Snapshot messages sent by the current user (eligible for restore). */
const recoverMsgs  = ref([]);

/** True while the snapshot is being fetched for recover mode. */
const recoverLoading = ref(false);

// ─── REPORT MODE FUNCTIONS ───────────────────────────────────────────────────

/**
 * enterReportMode
 * Activates report mode and fetches the conversation snapshot from the server.
 * The snapshot preserves copies of unsent/cleared messages so they can be
 * included in the report even after the main message list has been wiped.
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
 * Exits report mode and resets all associated state without submitting anything.
 */
const cancelReportMode = () => {
    reportMode.value = false;
    reportSelected.value = new Set();
    reportReason.value = '';
    reportError.value = '';
    snapshotMsgs.value = [];
};

// ─── RECOVER MODE FUNCTIONS ───────────────────────────────────────────────────

/**
 * enterRecoverMode
 * Fetches the conversation snapshot and shows only messages the current user
 * sent, so they can restore any unsent/cleared text back into the draft.
 */
const _recoveredKey  = (convoId) => `recovered_msgs_${convoId}`;
const _getRecovered  = (convoId) => new Set(JSON.parse(localStorage.getItem(_recoveredKey(convoId)) || '[]'));
const _markRecovered = (convoId, sentAt) => {
    const set = _getRecovered(convoId);
    set.add(String(sentAt));
    localStorage.setItem(_recoveredKey(convoId), JSON.stringify([...set]));
    // Recovery resets the cleared flag — next clear starts fresh with no alert
    localStorage.removeItem(_clearedKey(convoId));
};

const enterRecoverMode = async () => {
    if (!activeConvo.value) return;
    recoverMode.value = true;
    recoverMsgs.value = [];
    recoverLoading.value = true;
    try {
        const res = await axios.get(`${API}/${activeConvo.value._id}/snapshot`);
        const myId       = userId.value?.toString();
        const myUsername = user.value?.username;
        const alreadyDone = _getRecovered(activeConvo.value._id);
        recoverMsgs.value = (res.data || [])
            .filter(m => m.sender?.toString() === myId || m.senderUsername === myUsername)
            .filter(m => !alreadyDone.has(String(m.sentAt)))
            .sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
    } catch {
        recoverMsgs.value = [];
    } finally {
        recoverLoading.value = false;
    }
};

/**
 * restoreMessage
 * Sends a recovered message directly back into the chat and closes the panel.
 *
 * @param {string} body - The message text to restore.
 */
// Insert a message into the messages array at the position matching its original sentAt
const _insertAtOriginalPosition = (msg, originalSentAt) => {
    const t = new Date(originalSentAt || msg.createdAt);
    const insertIdx = messages.value.findIndex(m => new Date(m.createdAt) > t);
    if (insertIdx === -1) messages.value.push(msg);
    else messages.value.splice(insertIdx, 0, msg);
};

const restoreMessage = async (body) => {
    if (!body.trim() || !activeConvo.value) return;
    const idx = recoverMsgs.value.findIndex(m => m.body === body);
    const sentAt = idx !== -1 ? recoverMsgs.value[idx].sentAt : null;
    if (idx !== -1) recoverMsgs.value.splice(idx, 1);
    if (!recoverMsgs.value.length) recoverMode.value = false;
    try {
        const res = await axios.post(`${API}/${activeConvo.value._id}`, { body });
        _insertAtOriginalPosition(res.data, sentAt);
        activeConvo.value.lastMessage = body;
        if (sentAt) _markRecovered(activeConvo.value._id, sentAt);
        await nextTick();
        scrollBottom();
    } catch { /* silently ignore */ }
};

const recoverAll = async () => {
    if (!recoverMsgs.value.length || !activeConvo.value) return;
    // Sort by original sentAt before sending so they're posted in chronological order
    const toSend = recoverMsgs.value.slice().sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
    recoverMode.value = false;
    recoverMsgs.value = [];
    const sent = [];
    for (const m of toSend) {
        if (!m.body?.trim()) continue;
        try {
            const res = await axios.post(`${API}/${activeConvo.value._id}`, { body: m.body });
            res.data._origSentAt = String(m.sentAt);
            sent.push(res.data);
            activeConvo.value.lastMessage = m.body;
            if (m.sentAt) _markRecovered(activeConvo.value._id, m.sentAt);
        } catch { /* silently ignore */ }
    }
    // Merge and re-sort: recovered messages use their original sentAt, existing use createdAt
    messages.value = [...messages.value, ...sent].sort((a, b) =>
        new Date(a._origSentAt || a.createdAt) - new Date(b._origSentAt || b.createdAt)
    );
    await nextTick();
    scrollBottom();
};

/** Closes the recover panel without restoring anything. */
const cancelRecoverMode = () => {
    recoverMode.value = false;
    recoverMsgs.value = [];
};

/**
 * toggleReportSelect
 * Toggles a message in/out of the report selection Set.
 * Creates a new Set on every mutation so Vue's reactivity detects the change.
 * Enforces a maximum of 25 selected messages.
 *
 * @param {Object} m - Message object (live or snapshot).
 */
const toggleReportSelect = (m) => {
    // Live messages use _id; snapshot messages use sentAt as a string key
    const key = m._id || m.sentAt?.toString();
    const s = new Set(reportSelected.value);
    if (s.has(key)) { s.delete(key); }
    else {
        if (s.size >= 25) { reportError.value = 'Max 25 messages'; return; }
        s.add(key);
    }
    // Replace with new Set to trigger Vue reactivity
    reportSelected.value = s;
    reportError.value = '';
};

/**
 * submitReport
 * POSTs the selected messages (normalised as snapshots) and the written reason.
 * Both live messages and snapshot messages are merged before filtering so both
 * types can be included in the same submission.
 * Exits report mode silently on success (no alert modal in the widget).
 */
const submitReport = async () => {
    if (!reportReason.value.trim()) { reportError.value = 'A reason is required.'; return; }
    if (!reportSelected.value.size) { reportError.value = 'Select at least one message.'; return; }
    reportSubmitting.value = true;
    reportError.value = '';
    try {
        // Merge live and snapshot pools so any selected key can be found
        const allMsgs = [...messages.value, ...snapshotMsgs.value];
        // Normalise sender fields: live messages have a populated object,
        // snapshot messages store raw id/username strings
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
        // Brief success feedback
        reportError.value = '';
    } catch (err) {
        reportError.value = err.response?.data?.message || 'Failed to submit report.';
    } finally {
        reportSubmitting.value = false;
    }
};

// ─── COMPUTED ─────────────────────────────────────────────────────────────────

/**
 * filteredMutuals
 * Client-side filter for the "New Message" modal search input.
 * Returns all mutuals when the query is blank, otherwise filters by username.
 */
const filteredMutuals = computed(() => {
    const q = mutualSearch.value.trim().toLowerCase();
    return q ? mutuals.value.filter(u => u.username.toLowerCase().includes(q)) : mutuals.value;
});

// ─── DATA FETCHING ────────────────────────────────────────────────────────────

/**
 * fetchConvos
 * Fetches the user's conversation list from the server and stores it.
 * Called by toggleWidget on the first open, and by the DM socket handler when
 * a message arrives for an unknown conversation (to surface the new row).
 */
const fetchConvos = async () => {
    convosLoading.value = true;
    try {
        const res = await axios.get(API);
        conversations.value = res.data;
    } catch { /* ignore */ }
    finally { convosLoading.value = false; }
};

/**
 * toggleWidget
 * Opens or closes the widget panel.
 * Lazily loads the conversation list on first open if it hasn't been fetched yet.
 */
const toggleWidget = async () => {
    isOpen.value = !isOpen.value;
    if (isOpen.value && !conversations.value.length) await fetchConvos();
};

// ─── LIFECYCLE: MOUNT ─────────────────────────────────────────────────────────

onMounted(() => {
    // ── SOCKET: CLEAR HANDLER ─────────────────────────────────────────────────
    // Fired when either participant clears the conversation.
    // Wipes the message array if the cleared conversation is currently open,
    // and blanks the preview text in the conversation list row.
    removeClearHandler = addClearHandler((data) => {
        const c = conversations.value.find(c => c._id === data.conversationId);
        if (c) c.lastMessage = '';
        if (activeConvo.value?._id === data.conversationId) messages.value = [];
    });

    // ── SOCKET: INCOMING DM HANDLER ──────────────────────────────────────────
    // Fired for every new incoming DM, regardless of which conversation it belongs to.
    removeDmHandler = addDmHandler((data) => {
        if (activeConvo.value?._id === data.conversationId.toString()) {
            // Message is for the currently open conversation — append and scroll
            messages.value.push(data.message);
            scrollBottom();
            // Mark as read immediately since the user is looking at it
            decrementDmCount(1);
            axios.put(`${API}/${data.conversationId}/read`).catch(() => {});
        }
        // Update the conversation preview and unread count in the list
        const c = conversations.value.find(c => c._id === data.conversationId.toString());
        if (c) {
            c.lastMessage = data.message.body;
            // Only increment unread badge when this conversation is NOT the active one
            if (activeConvo.value?._id !== data.conversationId.toString()) c.unread = (c.unread || 0) + 1;
        } else if (isOpen.value) {
            // Message is for a conversation not yet in the list; re-fetch to surface it
            fetchConvos();
        }
    });
});

// ─── LIFECYCLE: UNMOUNT ───────────────────────────────────────────────────────

onUnmounted(() => {
    // Deregister socket handlers to prevent them firing after the component is gone
    if (removeDmHandler) removeDmHandler();
    if (removeClearHandler) removeClearHandler();
});

// ─── CONVERSATION ACTIONS ─────────────────────────────────────────────────────

/**
 * openConvo
 * Loads messages for the selected conversation, marks it as read, and scrolls
 * to the bottom.  Resets report mode state before loading.
 *
 * @param {Object} convo - Conversation object from the conversations array.
 */
const openConvo = async (convo) => {
    activeConvo.value = convo;
    messages.value = [];
    msgsLoading.value = true;
    hasMore.value = false;
    earliestDate.value = null;
    // Always exit report mode when switching conversations
    cancelReportMode();
    try {
        const res = await axios.get(`${API}/${convo._id}`);
        messages.value = res.data;
        // Exactly 40 results means the server likely has older pages
        hasMore.value = res.data.length === 40;
        // Record the oldest message timestamp as the pagination cursor
        if (res.data.length) earliestDate.value = res.data[0].createdAt;
        // Mark unread messages as read
        if (convo.unread > 0) {
            decrementDmCount(convo.unread);
            convo.unread = 0;
            await axios.put(`${API}/${convo._id}/read`);
        }
    } catch { /* ignore */ }
    finally { msgsLoading.value = false; }
    await nextTick();
    scrollBottom();
    chatInputEl.value?.focus();
};

/**
 * loadMore
 * Fetches the previous page of messages using a cursor-based "before" parameter.
 * Prepends the older messages to the front of the messages array.
 */
const loadMore = async () => {
    if (!earliestDate.value) return;
    try {
        const res = await axios.get(`${API}/${activeConvo.value._id}?before=${earliestDate.value}&limit=40`);
        if (res.data.length) {
            // Prepend older messages while keeping the newer ones visible at the bottom
            messages.value = [...res.data, ...messages.value];
            earliestDate.value = res.data[0].createdAt;
            hasMore.value = res.data.length === 40;
        } else {
            hasMore.value = false;
        }
    } catch { /* ignore */ }
};

// ─── MESSAGE ACTIONS ──────────────────────────────────────────────────────────

/**
 * sendMsg
 * Sends the draft as a new message.  Clears the draft optimistically and
 * restores it if the request fails so the user can retry.
 */
const sendMsg = async () => {
    if (!draft.value.trim() || !activeConvo.value) return;
    const body = draft.value.trim();
    draft.value = '';
    try {
        const res = await axios.post(`${API}/${activeConvo.value._id}`, { body });
        messages.value.push(res.data);
        // Keep the conversation preview in sync without re-fetching the list
        activeConvo.value.lastMessage = body;
        await nextTick();
        scrollBottom();
    } catch { draft.value = body; } // Restore on failure
    chatInputEl.value?.focus();
};


/**
 * openUnsendConfirm
 * Opens the unsend confirmation modal for a specific message.
 *
 * @param {Object} m - The message to unsend.
 */
const openUnsendConfirm = (m) => {
    unsendModal.value = { show: true, msgObj: m };
};

/**
 * executeUnsend
 * Removes the message optimistically from the local array, then DELETEs it on
 * the server.  Rolls back silently on failure (no alert in the widget).
 */
const executeUnsend = async () => {
    const m = unsendModal.value.msgObj;
    unsendModal.value.show = false;
    if (!m || !activeConvo.value) return;
    // Optimistic removal — instant visual feedback
    const idx = messages.value.findIndex(msg => msg._id === m._id);
    if (idx !== -1) messages.value.splice(idx, 1);
    try {
        await axios.delete(`${API}/${activeConvo.value._id}/${m._id}`);
    } catch {
        // Rollback: restore the message at its original index
        if (idx !== -1) messages.value.splice(idx, 0, m);
    }
};

// ─── CLEAR CHAT ACTIONS ───────────────────────────────────────────────────────

const _clearedKey    = (id) => `cleared_convo_${id}`;
const _wasCleared    = (id) => !!localStorage.getItem(_clearedKey(id));
const _markCleared   = (id) => localStorage.setItem(_clearedKey(id), '1');

/**
 * openClearConfirm
 * Opens the "Clear Conversation" confirmation modal.
 */
const openClearConfirm = () => {
    // First clear: no confirmation, just do it immediately
    // Second+ clear: show the unrecoverable warning first
    if (activeConvo.value && _wasCleared(activeConvo.value._id)) {
        clearModal.value = true;
    } else {
        executeClear();
    }
};

/**
 * executeClear
 * Clears all messages for both participants.  Optimistically wipes the local
 * state and rolls back on failure.
 */
const executeClear = async () => {
    const convoId = activeConvo.value?._id;
    clearModal.value = false;
    if (!convoId) return;
    // Snapshot current state for potential rollback
    const backup = messages.value.slice();
    const backupMsg = activeConvo.value.lastMessage;
    // Optimistic clear
    messages.value = [];
    activeConvo.value.lastMessage = '';
    try {
        await axios.delete(`${API}/${convoId}/clear`);
        _markCleared(convoId);
    } catch {
        // Rollback both the message array and the preview text
        messages.value = backup;
        activeConvo.value.lastMessage = backupMsg;
    }
};

// ─── BLOCK USER ACTIONS ───────────────────────────────────────────────────────

/**
 * openBlockConfirm
 * Populates and opens the "Block User" confirmation modal.
 */
const openBlockConfirm = () => {
    if (!activeConvo.value?.other) return;
    blockModal.value = {
        show: true,
        msg: `Block @${activeConvo.value.other.username}? They will be removed from your followers and following.`,
        targetId: activeConvo.value.other._id,
        convoId: activeConvo.value._id,
    };
};

/**
 * executeBlock
 * Sends the block request, then removes the conversation from the list and
 * returns to the conversation list view.
 */
const executeBlock = async () => {
    const { targetId, convoId } = blockModal.value;
    blockModal.value.show = false;
    try {
        await axios.post(`${API_USERS}/block/${targetId}`);
        conversations.value = conversations.value.filter(c => c._id !== convoId);
        activeConvo.value = null;
    } catch { /* ignore */ }
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * scrollBottom
 * Scrolls the chat message container to the very bottom after the next DOM update.
 */
const scrollBottom = () => {
    nextTick(() => {
        if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight;
    });
};

/**
 * startConvo
 * Creates or retrieves a conversation with the selected mutual follower, then
 * opens it.  Adds the conversation to the top of the list if it wasn't there yet.
 *
 * @param {Object} u - User object from the mutual followers list.
 */
const startConvo = async (u) => {
    showNewModal.value = false;
    mutualSearch.value = '';
    try {
        const res = await axios.post(API, { recipientId: u._id });
        // Avoid duplicates if the conversation already existed
        const existing = conversations.value.find(c => c._id === res.data._id);
        if (!existing) conversations.value.unshift(res.data);
        await openConvo(res.data);
    } catch (err) {
        alert(err.response?.data?.message || 'Could not start conversation');
    }
};

// ─── WATCHER: NEW MESSAGE MODAL ───────────────────────────────────────────────

/**
 * Watch showNewModal
 * Lazily loads the mutual followers list the first time the modal is opened.
 * Caches the result so subsequent opens don't make another network request.
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
 * Converts raw message text to safe HTML:
 *   1. HTML-escapes all special characters to prevent XSS.
 *   2. Wraps http/https URLs in <a> tags that open in a new tab.
 * Must escape BEFORE wrapping so angle brackets in message text can't inject markup.
 *
 * @param {string} text - Raw message body.
 * @returns {string} HTML-safe string for v-html binding.
 */
const linkify = (text) => {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.replace(
        /(https?:\/\/[^\s]+)/g,
        url => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="cw-msg-link">${url}</a>`
    );
};

/**
 * formatTime
 * Returns a human-readable timestamp.
 * - Same calendar day → "3:45 PM"
 * - Different day     → "Mar 9 3:45 PM"
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
/* ── Wrapper ── */
.cw {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9000;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
}

/* ── Toggle button ── */
.cw-toggle {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    background: #000;
    color: pink;
    border: 3px solid #14532d;
    font-size: 1.35rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: transform 0.2s, box-shadow 0.2s;
    box-shadow: 0 4px 14px rgba(0,0,0,0.35);
    flex-shrink: 0;
}
.cw-toggle:hover { transform: scale(1.08); box-shadow: 0 6px 18px rgba(0,0,0,0.45); }
.cw-toggle.open { border-color: #e11d48; }

.cw-toggle-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: #e11d48;
    color: #fff;
    font-size: 0.62rem;
    font-weight: 700;
    border-radius: 9999px;
    padding: 1px 5px;
    min-width: 16px;
    text-align: center;
    pointer-events: none;
}

/* ── Panel ── */
.cw-panel {
    width: 320px;
    height: 460px;
    background: #fff0f6;
    border: 3px solid #000;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 28px rgba(0,0,0,0.3);
}

/* Slide animation */
.cw-slide-enter-active,
.cw-slide-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
}
.cw-slide-enter-from,
.cw-slide-leave-to {
    opacity: 0;
    transform: translateY(12px) scale(0.97);
}

/* ── Header ── */
.cw-header {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 9px 12px;
    background: pink;
    border-bottom: 3px solid #000;
    flex-shrink: 0;
}

.cw-header-top {
    display: flex;
    align-items: center;
    gap: 6px;
}

.cw-header-actions {
    display: flex;
    gap: 6px;
}

.cw-back {
    background: #000;
    color: pink;
    border: 2px solid #14532d;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
}

.cw-title {
    font-weight: 700;
    font-size: 0.95rem;
    color: #000;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.cw-title--link { cursor: pointer; text-decoration: underline; }
.cw-title--link:hover { color: #14532d; }

.cw-clear {
    background: #1c1c1c;
    border: 1px solid #444;
    border-radius: 6px;
    color: #ccc;
    font-size: 0.74rem;
    font-weight: 700;
    padding: 4px 9px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}
.cw-clear:hover { background: #333; color: #fff; }

.cw-block {
    background: #7f1d1d;
    border: 2px solid #450a0a;
    border-radius: 6px;
    color: #fff;
    font-size: 0.74rem;
    font-weight: 700;
    padding: 4px 9px;
    cursor: pointer;
    transition: background 0.15s, transform 0.15s;
}
.cw-block:hover { background: #991b1b; transform: translateY(-1px); }

.cw-close {
    background: none;
    border: none;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    color: #555;
    padding: 2px 4px;
    border-radius: 4px;
    flex-shrink: 0;
}
.cw-close:hover { background: rgba(0,0,0,0.1); }

/* ── Mutual notice ── */
.cw-mutual-notice {
    font-size: 0.78rem;
    font-weight: 800;
    color: #000;
    text-align: center;
    padding: 6px 10px;
    background: rgba(0,0,0,0.04);
    border-bottom: 1px solid rgba(0,0,0,0.1);
    flex-shrink: 0;
    margin: 0;
}

/* ── Status ── */
.cw-status {
    text-align: center;
    font-size: 0.85rem;
    font-weight: 600;
    color: #555;
    padding: 20px 12px;
    line-height: 1.5;
}

/* ── Conversation list ── */
.cw-convo-list {
    overflow-y: auto;
    flex: 1;
}

.cw-convo-item {
    padding: 10px 14px;
    border-bottom: 1px solid rgba(0,0,0,0.12);
    cursor: pointer;
    position: relative;
    transition: background 0.15s;
}
.cw-convo-item:hover { background: rgba(255,182,193,0.5); }
.cw-convo-item.unread .cw-convo-name { color: #14532d; }

.cw-convo-name {
    font-weight: 700;
    font-size: 0.88rem;
    color: #000;
    margin-bottom: 2px;
}
.cw-convo-preview {
    font-size: 0.76rem;
    color: #666;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 240px;
}

.cw-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    background: #e11d48;
    color: #fff;
    font-size: 0.62rem;
    font-weight: 700;
    border-radius: 9999px;
    padding: 1px 5px;
    min-width: 15px;
    text-align: center;
}

.cw-new-btn {
    display: block;
    width: calc(100% - 24px);
    margin: 10px 12px;
    background: #000;
    color: pink;
    border: 2px solid #14532d;
    border-radius: 8px;
    padding: 8px;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    text-align: center;
    transition: transform 0.15s;
}
.cw-new-btn:hover { transform: translateY(-1px); color: rgb(125,190,157); }

/* ── Messages ── */
.cw-messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.cw-load-more-wrap { text-align: center; margin-bottom: 6px; }
.cw-load-more {
    background: #000;
    color: pink;
    border: 2px solid #14532d;
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
}

/* ── Message animations ── */
/* Message animations */
.cw-messages-inner {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.cw-msg-in-enter-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.cw-msg-in-enter-from   { opacity: 0; transform: translateY(8px) scale(0.97); }

/* ── Chat bubbles ── */
.cw-bubble-wrap {
    display: flex;
    flex-direction: column;
    max-width: 80%;
}
.cw-bubble-wrap.mine { align-items: flex-end; align-self: flex-end; }
.cw-bubble-wrap.theirs { align-items: flex-start; align-self: flex-start; }

.cw-bubble-row {
    display: flex;
    align-items: center;
    gap: 3px;
}
.mine .cw-bubble-row { flex-direction: row-reverse; }

.cw-bubble {
    padding: 7px 12px;
    border-radius: 16px;
    font-size: 0.86rem;
    line-height: 1.4;
    word-break: break-word;
    white-space: pre-wrap;
    position: relative;
}
.mine .cw-bubble   { background: #000; color: pink; border-radius: 16px 16px 4px 16px; }
.theirs .cw-bubble { background: pink; color: #000; border: 2px solid #000; border-radius: 16px 16px 16px 4px; }

/* ── Unsend button ── */
.cw-unsend {
    background: rgba(0,0,0,0.08);
    border: 1px solid rgba(0,0,0,0.18);
    color: #888;
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
    padding: 3px 7px;
    border-radius: 5px;
    opacity: 0.45;
    transition: opacity 0.15s, color 0.15s, background 0.15s, border-color 0.15s, transform 0.15s;
    flex-shrink: 0;
    line-height: 1;
}
.cw-bubble-wrap:hover .cw-unsend { opacity: 1; }
.cw-unsend:hover {
    color: #fff;
    background: #e11d48;
    border-color: #9f1239;
    transform: scale(1.05);
}

.cw-time {
    font-size: 0.64rem;
    color: #999;
    margin-top: 1px;
    padding: 0 3px;
}

/* ── Input row ── */
.cw-input-row {
    display: flex;
    gap: 6px;
    padding: 10px 12px;
    border-top: 3px solid #000;
    background: pink;
    flex-shrink: 0;
    align-items: flex-end;
}

.cw-input {
    flex: 1;
    padding: 7px 10px;
    border-radius: 8px;
    border: 2px solid #7f1d1d;
    font-size: 0.86rem;
    font-weight: 600;
    outline: none;
    resize: none;
    max-height: 80px;
    box-sizing: border-box;
    transition: border-color 0.2s;
}
.cw-input:focus { border-color: #14532d; }
.cw-input::placeholder { color: #aaa; font-weight: 500; }


.cw-send {
    background: #000;
    color: pink;
    border: 2px solid #14532d;
    border-radius: 6px;
    padding: 7px 13px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s;
    flex-shrink: 0;
}
.cw-send:hover:not(:disabled) { transform: translateY(-1px); color: rgb(125,190,157); }
.cw-send:disabled { opacity: 0.4; cursor: default; }

/* ── New convo modal ── */
.cw-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9100;
}
.cw-modal {
    background: pink;
    border: 3px solid #000;
    border-radius: 14px;
    padding: 20px;
    width: 100%;
    max-width: 320px;
    max-height: 65vh;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
}
.cw-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.cw-modal-header h3 { font-size: 1rem; font-weight: 700; color: #000; margin: 0; }
.cw-modal-header button { background: none; border: none; font-weight: 700; cursor: pointer; font-size: 1rem; color: #7f1d1d; }

.cw-mutual-search {
    width: 100%;
    padding: 8px 10px;
    border-radius: 7px;
    border: 2px solid #14532d;
    font-size: 0.88rem;
    font-weight: 600;
    outline: none;
    box-sizing: border-box;
}

.cw-mutual-list { overflow-y: auto; display: flex; flex-direction: column; gap: 5px; }
.cw-mutual-item {
    background: #000;
    color: pink;
    border-radius: 7px;
    padding: 8px 12px;
    font-weight: 700;
    font-size: 0.88rem;
    cursor: pointer;
    transition: transform 0.15s;
}
.cw-mutual-item:hover { transform: translateX(4px); color: rgb(125,190,157); }

/* ── Links in messages ── */
:deep(.cw-msg-link) { color: #ffffff !important; text-decoration: underline; word-break: break-all; }
:deep(.cw-msg-link:visited) { color: #e9d5ff !important; }
.report-active :deep(.cw-msg-link) { pointer-events: none; cursor: default; }

.cw-snapshot-banner {
    text-align: center;
    font-size: 0.74rem;
    font-weight: 700;
    color: #7c3aed;
    background: #f5f3ff;
    border-radius: 6px;
    padding: 4px 8px;
    margin-bottom: 6px;
}

/* ── Report mode ── */
.cw-report {
    background: #7c3aed;
    border: 1px solid #5b21b6;
    border-radius: 6px;
    color: #fff;
    font-size: 0.74rem;
    font-weight: 700;
    padding: 4px 9px;
    cursor: pointer;
    transition: background 0.15s;
}
.cw-report:hover { background: #6d28d9; }

/* Recover button — green teal to distinguish from the purple report button */
.cw-recover {
    background: #14532d;
    border: 1px solid #166534;
    border-radius: 6px;
    color: #fff;
    font-size: 0.74rem;
    font-weight: 700;
    padding: 4px 9px;
    cursor: pointer;
    transition: background 0.15s;
}
.cw-recover:hover { background: #166534; }

/* ── Recover panel ── */
.cw-recover-panel {
    border-top: 1px solid rgba(0,0,0,0.12);
    padding: 8px;
    max-height: 180px;
    overflow-y: auto;
    background: #f8fff8;
}

.cw-recover-empty {
    text-align: center;
    font-size: 0.8rem;
    color: #777;
    padding: 10px 0;
}

.cw-recover-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.cw-recover-all-row {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 4px;
}
.cw-recover-all-btn {
    padding: 5px 12px;
    background: #1a56db;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
}
.cw-recover-all-btn:hover { background: #1e40af; }

.cw-recover-item {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #fff;
    border: 1.5px solid #14532d;
    border-radius: 8px;
    padding: 6px 10px;
}

.cw-recover-body {
    flex: 1;
    font-size: 0.8rem;
    color: #000;
    word-break: break-word;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
}

.cw-recover-time {
    font-size: 0.7rem;
    color: #888;
    flex-shrink: 0;
}

.cw-restore-btn {
    background: #14532d;
    color: #fff;
    border: none;
    border-radius: 5px;
    font-size: 0.74rem;
    font-weight: 700;
    padding: 3px 8px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s;
}
.cw-restore-btn:hover { background: #166534; }

.cw-report-count {
    font-size: 0.74rem;
    font-weight: 700;
    color: #7c3aed;
}

.cw-report-cancel {
    background: #6b7280;
    border: 1px solid #4b5563;
    border-radius: 6px;
    color: #fff;
    font-size: 0.74rem;
    font-weight: 700;
    padding: 4px 9px;
    cursor: pointer;
}

.cw-bubble-wrap.reportable { cursor: pointer; }
.cw-bubble.selected {
    outline: 2.5px solid #7c3aed;
    outline-offset: 1px;
}
.cw-bubble.selected::after {
    content: '✓';
    position: absolute;
    top: 4px;
    right: 6px;
    background: #7c3aed;
    color: #fff;
    border-radius: 50%;
    width: 16px;
    height: 16px;
    font-size: 0.65rem;
    font-weight: 900;
    display: grid;
    place-items: center;
    box-shadow: 0 1px 4px rgba(0,0,0,0.25);
    pointer-events: none;
}

.cw-report-panel {
    padding: 8px 12px;
    border-top: 2px solid #7c3aed;
    background: #f5f3ff;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.cw-report-reason {
    width: 100%;
    padding: 6px 9px;
    border-radius: 7px;
    border: 2px solid #7c3aed;
    font-size: 0.82rem;
    font-weight: 500;
    resize: none;
    outline: none;
    box-sizing: border-box;
}
.cw-report-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}
.cw-report-hint { font-size: 0.74rem; color: #555; font-weight: 600; }
.cw-report-submit {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 5px 13px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s;
}
.cw-report-submit:hover:not(:disabled) { background: #6d28d9; }
.cw-report-submit:disabled { opacity: 0.45; cursor: default; }
.cw-report-err { font-size: 0.76rem; color: #e11d48; font-weight: 600; margin: 0; }

/* ── Mobile + Tablet (incl. OnePlus Open) ── */
@media (max-width: 900px) {
    .cw-toggle {
        position: fixed;
        bottom: 14px;
        right: 14px;
        z-index: 9001;
    }

    .cw-panel {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        width: 100%;
        /* Takes up top half so keyboard opening from bottom never covers send */
        height: 48dvh;
        min-height: 260px;
        max-height: 48dvh;
        border-radius: 0 0 16px 16px;
        border-top: none;
    }

    /* Slightly smaller text/padding to fit the compressed view */
    .cw-header { padding: 7px 10px; gap: 4px; }
    .cw-input-row { padding: 8px 10px; }
    .cw-input { font-size: 0.9rem; max-height: 60px; }
    .cw-messages { padding: 8px 10px; }
    .cw-bubble { font-size: 0.84rem; padding: 6px 10px; }
}
</style>
