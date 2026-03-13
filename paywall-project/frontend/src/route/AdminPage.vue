<template>
  <div class="admin-page">
    <h1 class="admin-title">🛡️ Mod Panel</h1>

    <!-- Tabs -->
    <div class="admin-tabs">
      <button :class="['tab-btn', { active: tab === 'reported' }]" @click="tab = 'reported'; load()">
        🚩 Reported ({{ reported.length }})
      </button>
      <button :class="['tab-btn', { active: tab === 'flagged' }]" @click="tab = 'flagged'; load()">
        ⛔ Flagged ({{ flagged.length }})
      </button>
      <button :class="['tab-btn', { active: tab === 'comments' }]" @click="tab = 'comments'; loadReportedComments()">
        💬 Comments ({{ reportedComments.length }})
      </button>
      <button :class="['tab-btn', { active: tab === 'users' }]" @click="tab = 'users'; loadUsers()">
        👥 Users ({{ users.length || '…' }})
      </button>
      <button :class="['tab-btn', { active: tab === 'dms' }]" @click="tab = 'dms'; loadDmReports()">
        📨 DMs ({{ dmReports.length }})
      </button>
    </div>

    <!-- Users tab -->
    <template v-if="tab === 'users'">
      <input
        v-model="userSearch"
        class="user-search"
        placeholder="🔍 Search by username or email..."
      />
      <p v-if="usersLoading" class="feed-status">Loading users...</p>
      <p v-else-if="!filteredUsers.length" class="feed-status">No users found.</p>
      <div v-else class="user-list">
        <div v-for="u in filteredUsers" :key="u._id" class="user-card">
          <div class="user-card__left">
            <span class="user-card__username" @click="router.push(`/creator/${u.username}`)">@{{ u.username }}</span>
            <span v-if="u.isAdmin" class="user-badge admin-badge">🛡️ Mod</span>
            <span v-if="u.isSubscriber" class="user-badge sub-badge">⭐ Sub</span>
          </div>
          <div class="user-card__meta">
            <span class="user-card__email">{{ u.email }}</span>
            <span class="user-card__stats">{{ u.followerCount }} followers · {{ u.followingCount }} following</span>
            <span class="user-card__date">Joined {{ formatDate(u.createdAt) }}</span>
            <button v-if="!u.isAdmin" class="btn-delete-user" @click="promptDeleteUser(u)">🗑 Delete Account</button>
          </div>
        </div>
      </div>
    </template>

    <!-- Reported Comments tab -->
    <template v-if="tab === 'comments'">
      <p v-if="loading" class="feed-status">Loading...</p>
      <p v-else-if="!reportedComments.length" class="feed-status">No reported comments — all clear! ✅</p>
      <div v-else class="post-list">
        <div v-for="p in reportedComments" :key="p._id" class="mod-card">
          <div class="mod-card__header">
            <span class="mod-card__author" @click="router.push(`/creator/${p.author?.username}`)">@{{ p.author?.username ?? 'deleted' }}</span>
            <span class="mod-card__email">{{ p.author?.email }}</span>
            <span class="mod-card__date">{{ formatDate(p.createdAt) }}</span>
          </div>
          <h3 v-if="p.title" class="mod-card__title">{{ p.title }}</h3>

          <div class="comments-preview">
            <p class="comments-label">💬 Reported comments</p>
            <div v-for="c in p.comments" :key="c._id" class="comment-row reported-comment-row">
              <div class="reported-comment-meta">
                <span class="comment-author">@{{ c.author?.username ?? 'deleted' }}</span>
                <span class="mod-card__reports">🚩 {{ c.reportedBy.length }} report{{ c.reportedBy.length !== 1 ? 's' : '' }}</span>
                <span class="reporter-list" v-if="c.reportedByUsers?.length">by {{ c.reportedByUsers.map(u => '@' + u.username).join(', ') }}</span>
                <span class="comment-date">{{ formatDate(c.createdAt) }}</span>
              </div>
              <p class="reported-comment-body">{{ c.body }}</p>
              <div v-if="c.reports?.length" class="report-reasons-list comment-reasons">
                <div v-for="(r, i) in c.reports" :key="i" class="report-reason-row">
                  <span class="reporter-chip" @click="router.push(`/creator/${r.username}`)">@{{ r.username }}</span>
                  <span class="reason-text">"{{ r.reason }}"</span>
                </div>
              </div>
              <div class="reported-comment-actions">
                <button class="btn-clear btn-sm" @click="handleClearCommentReports(p._id, c._id, p)">Clear Reports</button>
                <button class="btn-remove btn-sm" @click="promptDeleteComment(p._id, c._id, p)">Remove Comment</button>
              </div>
            </div>
          </div>

          <div class="mod-card__actions">
            <button class="btn-view" @click="router.push(`/post/${p._id}`)">View Post</button>
          </div>
        </div>
      </div>
    </template>

    <!-- Posts tabs (Reported / Flagged) -->
    <template v-else-if="tab === 'reported' || tab === 'flagged'">
      <p v-if="loading" class="feed-status">Loading...</p>
      <p v-else-if="!currentList.length" class="feed-status">Nothing here — all clear! ✅</p>

      <div v-if="currentList.length" class="post-list">
      <div v-for="p in currentList" :key="p._id" class="mod-card">
        <div class="mod-card__header">
          <span class="mod-card__author" @click="router.push(`/creator/${p.author?.username}`)">
            @{{ p.author?.username ?? 'deleted' }}
          </span>
          <span class="mod-card__email">{{ p.author?.email }}</span>
          <span class="mod-card__reports" v-if="p.reportedBy?.length">
            🚩 {{ p.reportedBy.length }} report{{ p.reportedBy.length !== 1 ? 's' : '' }}
          </span>
          <span class="mod-card__date">{{ formatDate(p.createdAt) }}</span>
        </div>

        <!-- Reporter list with reasons -->
        <div v-if="p.reports?.length" class="reporter-detail">
          <span class="reporter-label">🚩 Reports:</span>
        </div>
        <div v-if="p.reports?.length" class="report-reasons-list">
          <div v-for="(r, i) in p.reports" :key="i" class="report-reason-row">
            <span class="reporter-chip" @click="router.push(`/creator/${r.username}`)">@{{ r.username }}</span>
            <span class="reason-text">"{{ r.reason }}"</span>
            <span class="reason-date">{{ formatDate(r.createdAt) }}</span>
          </div>
        </div>

        <!-- Post content detail -->
        <div class="post-detail">
          <div v-if="p.category" class="post-detail__row"><span class="detail-label">Category:</span> {{ p.category }}</div>
          <div v-if="p.moderationStatus" class="post-detail__row"><span class="detail-label">Status:</span> <span :class="['status-badge', p.moderationStatus]">{{ p.moderationStatus }}</span></div>
          <div v-if="p.mediaUrl" class="post-detail__row"><span class="detail-label">Media:</span> <a :href="p.mediaUrl" target="_blank" rel="noopener" class="media-link">{{ p.mediaUrl }}</a></div>
          <div v-if="p.imageUrl" class="post-detail__row"><span class="detail-label">Image:</span> <a :href="p.imageUrl" target="_blank" rel="noopener" class="media-link">{{ p.imageUrl }}</a></div>
        </div>

        <h3 v-if="p.title" class="mod-card__title">{{ p.title }}</h3>
        <p v-if="p.body" class="mod-card__body">{{ expanded.has(p._id) ? p.body : truncate(p.body) }}</p>
        <button v-if="p.body?.length > 200" class="expand-btn" @click="toggleExpand(p._id)">
          {{ expanded.has(p._id) ? 'Show less ▲' : 'Show more ▼' }}
        </button>

        <!-- Comments preview (all, with report counts) -->
        <div v-if="p.comments?.length" class="comments-preview">
          <p class="comments-label">💬 {{ p.comments.length }} comment{{ p.comments.length !== 1 ? 's' : '' }}</p>
          <div v-for="c in p.comments.slice(0, 5)" :key="c._id" class="comment-row">
            <div class="comment-row-top">
              <span class="comment-author">@{{ c.author?.username ?? 'deleted' }}:</span>
              <span v-if="c.reportedBy?.length" class="comment-report-badge">🚩 {{ c.reportedBy.length }}</span>
              <button class="btn-remove-sm" @click="promptDeleteComment(p._id, c._id, p)">Remove</button>
            </div>
            <span class="comment-body">{{ truncate(c.body, 120) }}</span>
            <span v-if="c.reportedByUsers?.length" class="reporter-list">reported by {{ c.reportedByUsers.map(u => '@' + u.username).join(', ') }}</span>
          </div>
          <p v-if="p.comments.length > 5" class="comments-more">+{{ p.comments.length - 5 }} more — view post to see all</p>
        </div>

        <div class="mod-card__actions">
          <button class="btn-view" @click="router.push(`/post/${p._id}`)">View Post</button>
          <button class="btn-clear" @click="handleClearReports(p._id)" v-if="p.reportedBy?.length">Clear Reports</button>
          <button class="btn-flag" @click="handleFlag(p._id)" v-if="p.moderationStatus !== 'flagged'">Flag</button>
          <button class="btn-remove" @click="promptDelete(p._id)">Remove Post</button>
        </div>
      </div>
      </div>
    </template>

    <!-- DM Reports tab -->
    <template v-if="tab === 'dms'">
      <p v-if="loading" class="feed-status">Loading...</p>
      <p v-else-if="!dmReports.length" class="feed-status">No pending DM reports — all clear! ✅</p>
      <div v-else class="post-list">
        <div v-for="r in dmReports" :key="r._id" class="mod-card">
          <div class="mod-card__header">
            <span class="mod-card__author">Reporter: <b @click="router.push(`/creator/${r.reporter?.username}`)" style="cursor:pointer;text-decoration:underline;">@{{ r.reporter?.username }}</b></span>
            <span class="mod-card__email">{{ r.reporter?.email }}</span>
            <span class="mod-card__date">{{ formatDate(r.createdAt) }}</span>
          </div>
          <div class="post-detail__row" style="margin-top:6px;">
            <span class="detail-label">Reported user:</span>
            <b @click="router.push(`/creator/${r.reportedUser?.username}`)" style="cursor:pointer;text-decoration:underline;">@{{ r.reportedUser?.username }}</b>
            <span class="mod-card__email" style="margin-left:8px;">{{ r.reportedUser?.email }}</span>
          </div>
          <div class="post-detail__row">
            <span class="detail-label">Reason:</span> "{{ r.reason }}"
          </div>
          <div v-if="r.messages?.length" class="comments-preview" style="margin-top:8px;">
            <p class="comments-label">📋 {{ r.messages.length }} selected message{{ r.messages.length !== 1 ? 's' : '' }}</p>
            <div v-for="(m, i) in r.messages" :key="i" class="comment-row" style="flex-direction:column;align-items:flex-start;gap:2px;">
              <span class="comment-author">@{{ m.senderUsername }}</span>
              <span class="comment-body">{{ m.body }}</span>
              <span class="comment-date" style="font-size:0.7rem;color:#999;">{{ formatDate(m.sentAt) }}</span>
            </div>
          </div>
          <div class="mod-card__actions" style="margin-top:10px;">
            <button class="btn-clear" @click="handleDmReport(r._id, 'reviewed')">✅ Mark Reviewed</button>
            <button class="btn-flag" @click="handleDmReport(r._id, 'dismissed')">✕ Dismiss</button>
          </div>
        </div>
      </div>
    </template>

    <!-- Confirm Modal -->
    <div v-if="modal.show" class="confirm-overlay" @click.self="modal.show = false">
      <div class="confirm-box">
        <p class="confirm-msg">{{ modal.title }}</p>
        <p class="confirm-sub">{{ modal.sub }}</p>
        <div class="confirm-actions">
          <button class="confirm-cancel" @click="modal.show = false">Cancel</button>
          <button class="confirm-delete" @click="modal.onConfirm">Confirm</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * AdminPage.vue — Moderator / Admin panel
 *
 * Provides five tabs for site moderation:
 *   - Reported: posts that users have flagged for review, with reporter details and reasons.
 *   - Flagged:  posts that a mod has already escalated to "flagged" status.
 *   - Comments: posts that contain at least one reported comment.
 *   - Users:    searchable list of all registered accounts with delete capability.
 *   - DMs:      reports submitted against direct-message conversations.
 *
 * All destructive actions (delete post, delete comment, delete user) are gated
 * behind a reusable confirmation modal to prevent accidental clicks.
 *
 * Data is lazy-loaded per tab:
 *   - "reported" and "flagged" are loaded together on mount and on tab switch.
 *   - "comments", "users", and "dms" are each loaded once and then cached for
 *     the lifetime of this page visit (guarded by *Loaded flags).
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

// ─── API BASE ─────────────────────────────────────────────────────────────────

// All admin endpoints share this prefix, set via environment variable.
const API = import.meta.env.VITE_API_URL + '/api/admin';

const router = useRouter();

// ─── TAB STATE ────────────────────────────────────────────────────────────────

// Which tab is currently active: 'reported' | 'flagged' | 'comments' | 'users' | 'dms'.
const tab = ref('reported');

// ─── POST / COMMENT DATA ─────────────────────────────────────────────────────

// Posts that have been reported by users but not yet actioned.
const reported = ref([]);

// Posts that have been escalated to "flagged" status by a moderator.
const flagged = ref([]);

// Posts whose comments array contains at least one reported comment.
const reportedComments = ref([]);

// Shared loading indicator used by the reported, flagged, and comments tabs.
const loading = ref(false);

// Set of post IDs whose body text is currently fully expanded in the UI.
// Using a Set so toggling is O(1) and Vue's reactivity is triggered by
// replacing the entire Set reference rather than mutating in place.
const expanded = ref(new Set());

// ─── CONFIRM MODAL STATE ──────────────────────────────────────────────────────

// Holds the current modal's display text and the action to run on confirmation.
// Setting modal.show = true makes the overlay appear.
const modal = ref({ show: false, title: '', sub: '', onConfirm: () => {} });

// ─── EXPAND TOGGLE ────────────────────────────────────────────────────────────

/**
 * toggleExpand
 * Adds or removes a post ID from the expanded Set so long post bodies
 * can be shown in full or truncated on demand.
 * A new Set is assigned each time to trigger Vue's reactivity system.
 */
const toggleExpand = (id) => {
  const s = new Set(expanded.value);
  s.has(id) ? s.delete(id) : s.add(id);
  expanded.value = s;
};

// ─── USERS TAB ────────────────────────────────────────────────────────────────

// Full list of all registered users, populated when the Users tab is opened.
const users = ref([]);

// Separate loading flag for the users tab so it doesn't interfere with the
// shared `loading` flag used by the posts/comments tabs.
const usersLoading = ref(false);

// Guards against re-fetching users on every tab visit within the same session.
const usersLoaded = ref(false);

// The string the moderator has typed into the user search box.
const userSearch = ref('');

/**
 * filteredUsers
 * Returns users whose username or email contains the search query.
 * If the query is empty, all users are returned.
 */
const filteredUsers = computed(() => {
  const q = userSearch.value.trim().toLowerCase();
  if (!q) return users.value;
  return users.value.filter(u =>
    u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  );
});

/**
 * loadUsers
 * Fetches all users from the admin API.
 * Short-circuits if users have already been loaded this session.
 */
const loadUsers = async () => {
  if (usersLoaded.value) return;
  usersLoading.value = true;
  try {
    const res = await axios.get(`${API}/users`);
    users.value = res.data;
    usersLoaded.value = true;
  } catch {
    // ignore — user sees an empty list
  } finally {
    usersLoading.value = false;
  }
};

// ─── COMPUTED LIST ALIAS ──────────────────────────────────────────────────────

/**
 * currentList
 * Returns the correct post array for the active tab so the posts template
 * doesn't need to branch on tab name itself.
 */
const currentList = computed(() => tab.value === 'reported' ? reported.value : flagged.value);

// ─── DATA LOADERS ─────────────────────────────────────────────────────────────

/**
 * loadReportedComments
 * Fetches posts that contain reported comments.
 * The API returns the full post objects with their comments pre-filtered
 * to only those that have at least one report.
 */
const loadReportedComments = async () => {
  loading.value = true;
  try {
    const res = await axios.get(`${API}/reported-comments`);
    reportedComments.value = res.data;
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
};

/**
 * load
 * Fetches both reported and flagged post lists in parallel.
 * Called on mount and whenever the reported or flagged tab is clicked.
 */
const load = async () => {
  loading.value = true;
  try {
    const [r, f] = await Promise.all([
      axios.get(`${API}/reported`),
      axios.get(`${API}/flagged`),
    ]);
    reported.value = r.data;
    flagged.value = f.data;
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
};

// ─── LIFECYCLE ────────────────────────────────────────────────────────────────

// Load reported and flagged posts immediately so they are ready when the
// default "Reported" tab is displayed.
onMounted(load);

// ─── CONFIRM MODAL HELPERS ────────────────────────────────────────────────────

/**
 * openModal
 * Shows the confirmation modal with a custom title, subtitle, and callback.
 * The onConfirm wrapper closes the modal before executing the action so that
 * the UI resets even if the action throws.
 */
const openModal = (title, sub, onConfirm) => {
  modal.value = { show: true, title, sub, onConfirm: async () => { modal.value.show = false; await onConfirm(); } };
};

// ─── POST ACTIONS ─────────────────────────────────────────────────────────────

/**
 * promptDelete
 * Opens a confirmation modal before permanently deleting a post.
 * On confirmation, removes the post from both the reported and flagged lists.
 */
const promptDelete = (postId) => {
  openModal('Remove this post?', 'This will permanently delete the post.', async () => {
    await axios.delete(`${API}/posts/${postId}`);
    reported.value = reported.value.filter(p => p._id !== postId);
    flagged.value = flagged.value.filter(p => p._id !== postId);
  });
};

/**
 * promptDeleteComment
 * Opens a confirmation modal before permanently deleting a single comment.
 * Mutates the parent post's comments array in place so the UI updates
 * without a full page reload.
 */
const promptDeleteComment = (postId, commentId, post) => {
  openModal('Remove this comment?', 'This will permanently delete the comment.', async () => {
    await axios.delete(`${API}/posts/${postId}/comments/${commentId}`);
    post.comments = post.comments.filter(c => c._id !== commentId);
  });
};

/**
 * handleClearReports
 * Clears all report records on a post without deleting the post itself.
 * Also removes the post from the reported list since it no longer qualifies.
 */
const handleClearReports = async (postId) => {
  await axios.put(`${API}/posts/${postId}/clear-reports`);
  reported.value = reported.value.filter(p => p._id !== postId);
};

/**
 * handleClearCommentReports
 * Clears the report records on a specific comment.
 * Removes the comment from its parent post's comments array and prunes
 * any parent posts that now have zero reported comments remaining.
 */
const handleClearCommentReports = async (postId, commentId, post) => {
  await axios.put(`${API}/posts/${postId}/comments/${commentId}/clear-reports`);
  post.comments = post.comments.filter(c => c._id !== commentId);
  // Remove the parent post from the reportedComments list if it has no more
  // reported comments — keeps the tab count accurate.
  reportedComments.value = reportedComments.value.filter(p => p.comments.length > 0);
};

/**
 * handleFlag
 * Escalates a post's moderation status to "flagged".
 * Reloads both lists afterward so tab counts and card states are in sync.
 */
const handleFlag = async (postId) => {
  await axios.put(`${API}/posts/${postId}/flag`);
  await load();
};

// ─── DM REPORTS ───────────────────────────────────────────────────────────────

// List of DM (direct-message) reports submitted by users.
const dmReports = ref([]);

// Guards against re-fetching DM reports on every tab visit.
const dmReportsLoaded = ref(false);

/**
 * loadDmReports
 * Fetches pending DM reports from the admin API.
 * Short-circuits if already loaded this session.
 */
const loadDmReports = async () => {
  if (dmReportsLoaded.value) return;
  loading.value = true;
  try {
    const res = await axios.get(`${API}/dm-reports`);
    dmReports.value = res.data;
    dmReportsLoaded.value = true;
  } catch { /* ignore */ }
  finally { loading.value = false; }
};

/**
 * handleDmReport
 * Updates a DM report's status to either 'reviewed' or 'dismissed'.
 * Removes the report from the list on success so the tab clears out.
 */
const handleDmReport = async (reportId, status) => {
  try {
    await axios.put(`${API}/dm-reports/${reportId}`, { status });
    dmReports.value = dmReports.value.filter(r => r._id !== reportId);
  } catch { /* ignore */ }
};

// ─── USER ACTIONS ─────────────────────────────────────────────────────────────

/**
 * promptDeleteUser
 * Opens a confirmation modal before permanently deleting a user account.
 * Admin accounts are excluded from deletion (no button rendered in the template).
 * After deletion, marks usersLoaded as false so the list refreshes on the
 * next visit to the Users tab, ensuring stale data isn't shown.
 */
const promptDeleteUser = (u) => {
  openModal(
    `Delete @${u.username}?`,
    `This will permanently delete their account and all their posts. This cannot be undone.`,
    async () => {
      await axios.delete(`${API}/users/${u._id}`);
      users.value = users.value.filter(x => x._id !== u._id);
      usersLoaded.value = false; // force reload next time
    }
  );
};

// ─── DISPLAY HELPERS ──────────────────────────────────────────────────────────

/**
 * truncate
 * Shortens a string to `len` characters and appends "..." if it exceeds that
 * length. Used for post body previews in the mod cards.
 */
const truncate = (text, len = 200) => text?.length > len ? text.slice(0, len) + '...' : text;

/**
 * formatDate
 * Converts an ISO date string to a locale-aware short date (e.g. "3/13/2026").
 */
const formatDate = (d) => new Date(d).toLocaleDateString();
</script>

<style scoped>
.admin-page {
  max-width: 800px;
  margin: 30px auto;
  padding: 0 16px 60px;
}

.admin-title {
  font-size: 1.8rem;
  font-weight: 700;
  color: #000;
  margin-bottom: 20px;
}

.admin-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 24px;
}

.tab-btn {
  background: #000;
  color: pink;
  border: 3px solid #14532d;
  border-radius: 8px;
  padding: 8px 18px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s;
}
.tab-btn:hover { transform: translateY(-2px); color: rgb(125, 190, 157); }
.tab-btn.active { border-color: #7f1d1d; color: #ff9999; }

.feed-status {
  text-align: center;
  font-size: 1.1rem;
  font-weight: 600;
  color: #000;
  margin-top: 40px;
}

.post-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mod-card {
  background: pink;
  border: 3px solid #7f1d1d;
  border-radius: 14px;
  padding: 18px;
}

.mod-card__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.mod-card__author {
  font-weight: 700;
  color: #000;
  cursor: pointer;
  text-decoration: underline;
  font-size: 0.95rem;
}
.mod-card__author:hover { color: #14532d; }

.mod-card__email {
  font-size: 0.8rem;
  color: #555;
}

.mod-card__reports {
  background: #7f1d1d;
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
}

.mod-card__date {
  margin-left: auto;
  font-size: 0.8rem;
  color: #555;
}

.mod-card__title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #000;
  margin: 0 0 6px;
}

.mod-card__body {
  font-size: 0.9rem;
  color: #1f2937;
  margin: 0 0 12px;
  line-height: 1.5;
}

.comments-preview {
  background: #fff0f6;
  border: 2px solid #000;
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 12px;
}

.comments-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #000;
  margin: 0 0 8px;
}

.comment-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 0.85rem;
}

.comment-author { font-weight: 700; color: #000; flex-shrink: 0; }
.comment-body { color: #333; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.btn-remove-sm {
  background: #7f1d1d;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}
.btn-remove-sm:hover { background: #991b1b; }

.comments-more { font-size: 0.8rem; color: #777; margin: 4px 0 0; }

/* Reporter detail */
.reporter-detail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 0.82rem;
}
.reporter-label { font-weight: 700; color: #7f1d1d; }
.reporter-chip {
  background: #7f1d1d;
  color: #fff;
  border-radius: 20px;
  padding: 2px 9px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.reporter-chip:hover { background: #991b1b; }

/* Post detail rows */
.post-detail { margin-bottom: 10px; display: flex; flex-direction: column; gap: 4px; }
.post-detail__row { font-size: 0.82rem; color: #333; }
.detail-label { font-weight: 700; color: #000; }
.media-link { color: #003087; text-decoration: underline; word-break: break-all; font-size: 0.8rem; }

/* Status badge */
.status-badge { font-size: 0.78rem; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
.status-badge.flagged { background: #92400e; color: #fff; }
.status-badge.approved { background: #14532d; color: #fff; }
.status-badge.pending  { background: #555; color: #fff; }

/* Expand toggle */
.expand-btn {
  background: none;
  border: none;
  color: #003087;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  margin-bottom: 8px;
  text-decoration: underline;
}

/* Comment row enhancements */
.comment-row-top {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.comment-report-badge {
  background: #7f1d1d;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 20px;
  flex-shrink: 0;
}
.reporter-list { font-size: 0.75rem; color: #7f1d1d; font-style: italic; margin-top: 2px; }

/* Reported comment rows */
.reported-comment-row { flex-direction: column; align-items: flex-start; gap: 6px; padding: 10px; background: #fff; border-radius: 8px; border: 2px solid #7f1d1d; }
.reported-comment-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; width: 100%; }
.comment-date { font-size: 0.75rem; color: #777; margin-left: auto; }
.reported-comment-body { font-size: 0.88rem; color: #1f2937; line-height: 1.5; white-space: pre-wrap; margin: 0; width: 100%; }
.reported-comment-actions { display: flex; gap: 8px; }
.btn-sm { padding: 4px 12px !important; font-size: 0.8rem !important; }

.mod-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.btn-view, .btn-clear, .btn-flag, .btn-remove {
  border-radius: 8px;
  padding: 7px 16px;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s;
  border: 3px solid #000;
}
.btn-view   { background: #000; color: pink; }
.btn-clear  { background: #14532d; color: #fff; }
.btn-flag   { background: #92400e; color: #fff; }
.btn-remove { background: #7f1d1d; color: #fff; }

.btn-view:hover, .btn-clear:hover, .btn-flag:hover, .btn-remove:hover { transform: translateY(-2px); }

/* Modal */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.confirm-box {
  background: pink;
  border: 3px solid #000;
  border-radius: 14px;
  padding: 28px 32px;
  text-align: center;
  min-width: 280px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  animation: pop-in 0.15s ease;
}
@keyframes pop-in {
  from { transform: scale(0.9); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
.confirm-msg { font-size: 1.15rem; font-weight: 700; color: #000; margin: 0 0 6px; }
.confirm-sub { font-size: 0.875rem; color: #555; margin: 0 0 22px; }
.confirm-actions { display: flex; gap: 12px; justify-content: center; }
.confirm-cancel {
  background: #000; color: pink; border: 3px solid #14532d;
  border-radius: 8px; padding: 8px 22px; font-size: 0.95rem;
  font-weight: 700; cursor: pointer; transition: transform 0.15s;
}
.confirm-cancel:hover { transform: translateY(-2px); color: rgb(125,190,157); }
.confirm-delete {
  background: #7f1d1d; color: #fff; border: 3px solid #000;
  border-radius: 8px; padding: 8px 22px; font-size: 0.95rem;
  font-weight: 700; cursor: pointer; transition: transform 0.15s;
}
.confirm-delete:hover { transform: translateY(-2px); background: #991b1b; }

/* ── User list ── */
.user-search {
  width: 100%;
  padding: 11px 14px;
  border-radius: 10px;
  border: 3px solid #14532d;
  font-size: 0.95rem;
  font-weight: 600;
  outline: none;
  color: #000;
  background: #fff;
  box-sizing: border-box;
  margin-bottom: 16px;
  transition: border-color 0.2s;
}
.user-search:focus { border-color: #000; }
.user-search::placeholder { color: #aaa; font-weight: 500; }

.user-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.user-card {
  background: pink;
  border: 3px solid #000;
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.user-card__left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.user-card__username {
  font-weight: 700;
  font-size: 1rem;
  color: #000;
  cursor: pointer;
  text-decoration: underline;
}
.user-card__username:hover { color: #14532d; }

.user-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
}
.admin-badge { background: #92400e; color: #fff; }
.sub-badge   { background: #14532d; color: #fff; }

.user-card__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  text-align: right;
}

.user-card__email {
  font-size: 0.82rem;
  color: #333;
  font-weight: 600;
  word-break: break-all;
}

.user-card__stats {
  font-size: 0.78rem;
  color: #555;
}

.user-card__date {
  font-size: 0.75rem;
  color: #777;
}

.btn-delete-user {
  background: #7f1d1d;
  color: #fff;
  border: 2px solid #000;
  border-radius: 8px;
  padding: 4px 12px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  margin-top: 4px;
  transition: background 0.15s, transform 0.15s;
}
.btn-delete-user:hover { background: #991b1b; transform: translateY(-1px); }

/* Report reasons */
.report-reasons-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}
.report-reason-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  background: #fff0f0;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.82rem;
}
.reason-text {
  color: #1f2937;
  font-style: italic;
  flex: 1;
}
.reason-date {
  font-size: 0.72rem;
  color: #999;
  flex-shrink: 0;
}
.comment-reasons { margin-top: 6px; }

/* ── Responsive ── */

/* Large tablet landscape */
@media (max-width: 1024px) {
  .admin-page { max-width: 680px; }
}

/* Tablet portrait */
@media (max-width: 768px) {
  .admin-page { max-width: 100%; padding: 0 14px 50px; margin: 20px auto; }
  .admin-title { font-size: 1.5rem; }
  .admin-tabs { gap: 8px; }
  .mod-card { padding: 14px; }
}

/* Large phone */
@media (max-width: 600px) {
  .user-card { flex-direction: column; gap: 8px; }
  .user-card__meta { align-items: flex-start; text-align: left; }
  .admin-page { padding: 0 10px 44px; margin: 14px auto; }
  .admin-title { font-size: 1.3rem; margin-bottom: 14px; }
  .admin-tabs { flex-wrap: wrap; }
  .tab-btn { flex: 1; text-align: center; padding: 8px 12px; font-size: 0.88rem; }
  .mod-card { padding: 12px; border-radius: 10px; }
  .mod-card__header { gap: 6px; }
  .mod-card__email { font-size: 0.75rem; word-break: break-all; }
  .mod-card__date { margin-left: 0; font-size: 0.76rem; }
  .mod-card__title { font-size: 0.97rem; }
  .mod-card__body { font-size: 0.87rem; }
  .comment-row { flex-wrap: wrap; gap: 5px; }
  .comment-body { white-space: normal; overflow: visible; text-overflow: unset; }
  .mod-card__actions { gap: 6px; }
  .btn-view, .btn-clear, .btn-flag, .btn-remove { padding: 6px 12px; font-size: 0.82rem; }
  .confirm-box { padding: 22px 20px; min-width: 240px; max-width: calc(100% - 32px); }
}

/* Phone */
@media (max-width: 480px) {
  .admin-page { padding: 0 8px 40px; }
  .admin-title { font-size: 1.2rem; }
  .mod-card__actions { flex-wrap: wrap; }
  .btn-view, .btn-clear, .btn-flag, .btn-remove { flex: 1; min-width: 80px; text-align: center; justify-content: center; }
  .comments-preview { padding: 8px 10px; }
  .comment-row { flex-direction: column; align-items: flex-start; gap: 4px; }
  .btn-remove-sm { align-self: flex-start; }
}

/* Small phone (360px) */
@media (max-width: 360px) {
  .mod-card__header { flex-direction: column; align-items: flex-start; }
  .btn-view, .btn-clear, .btn-flag, .btn-remove { width: 100%; min-width: unset; }
  .confirm-box { padding: 16px 12px; min-width: 200px; }
  .confirm-actions { flex-direction: column; gap: 8px; }
  .confirm-cancel, .confirm-delete { width: 100%; }
  .tab-btn { font-size: 0.82rem; padding: 7px 8px; }
}

/* Very small phone (320px) */
@media (max-width: 320px) {
  .admin-page { padding: 0 6px 36px; }
  .mod-card { padding: 10px; }
  .admin-title { font-size: 1.1rem; }
}

/* Landscape phone */
@media (max-height: 500px) and (orientation: landscape) {
  .admin-page { margin: 8px auto; }
}
</style>
