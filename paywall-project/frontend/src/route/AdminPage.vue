<template>
  <div class="admin-page">
    <h1 class="admin-title">🛡️ Mod Panel</h1>

    <!-- Tabs -->
    <div class="admin-tabs">
      <button :class="['tab-btn', { active: tab === 'reported' }]" @click="switchTab('reported')">
        🚩 Reported ({{ reported.length }})
      </button>
      <button :class="['tab-btn', { active: tab === 'flagged' }]" @click="switchTab('flagged')">
        ⛔ Flagged ({{ flagged.length }})
      </button>
      <button :class="['tab-btn', { active: tab === 'comments' }]" @click="switchTab('comments')">
        💬 Comments ({{ reportedComments.length }})
      </button>
      <button :class="['tab-btn', { active: tab === 'users' }]" @click="switchTab('users')">
        👥 Users ({{ users.length || '…' }})
      </button>
      <button :class="['tab-btn', { active: tab === 'dms' }]" @click="switchTab('dms')">
        📨 DMs ({{ dmReports.length }})
      </button>
      <button :class="['tab-btn', { active: tab === 'online' }]" @click="switchTab('online')">
        🟢 Online ({{ onlineUserList.length }})
      </button>
      <button :class="['tab-btn', { active: tab === 'analytics' }]" @click="switchTab('analytics')">
        📊 Analytics
      </button>
      <button :class="['tab-btn', { active: tab === 'appeals' }]" @click="switchTab('appeals')">
        📋 Appeals ({{ appeals.filter(a => a.status === 'pending').length }})
      </button>
      <button :class="['tab-btn', { active: tab === 'logs' }]" @click="switchTab('logs')">
        📝 Logs
      </button>
    </div>

    <!-- Users tab -->
    <template v-if="tab === 'users'">

      <!-- Create test account form -->
      <div class="test-user-form">
        <button class="test-user-toggle" @click="showTestForm = !showTestForm">
          {{ showTestForm ? '▲ Hide' : '➕ Create Test Account' }}
        </button>
        <div v-if="showTestForm" class="test-user-fields">
          <input v-model="testForm.username" class="test-input" placeholder="Username" />
          <input v-model="testForm.email" class="test-input" placeholder="Email" />
          <input v-model="testForm.password" class="test-input" placeholder="Password" type="password" />
          <button class="test-user-submit" :disabled="testLoading" @click="submitTestUser">
            {{ testLoading ? 'Creating…' : 'Create' }}
          </button>
          <span v-if="testMsg" class="test-msg">{{ testMsg }}</span>
        </div>

        <!-- Last created test account — credentials + quick-launch tabs -->
        <div v-if="lastTestAccount" class="test-account-result">
          <div class="test-account-creds">
            <span class="test-cred-label">Last test account:</span>
            <code class="test-cred">@{{ lastTestAccount.username }}</code>
            <code class="test-cred">{{ lastTestAccount.email }}</code>
            <code class="test-cred">{{ lastTestAccount.password }}</code>
          </div>
          <div class="test-account-links">
            <button class="test-link-btn" @click="openTestTab('/signup')">↗ Signup</button>
            <button class="test-link-btn" @click="openTestTab('/login')">↗ Login</button>
            <button class="test-link-btn" @click="openTestTab('/forgot-password')">↗ Forgot Password</button>
            <button class="test-link-btn" @click="openTestTab('/forgot-username')">↗ Forgot Username</button>
            <button class="test-link-clear" @click="lastTestAccount = null">✕ Clear</button>
          </div>
        </div>
      </div>

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
            <span :class="['user-badge', u.isOnline ? 'online-badge' : 'offline-badge']">
              {{ u.isOnline ? '🟢 Online' : '⚫ Offline' }}
            </span>
          </div>
          <div class="user-card__meta">
            <span class="user-card__email">{{ u.email }}</span>
            <span class="user-card__stats">{{ u.followerCount }} followers · {{ u.followingCount }} following</span>
            <span class="user-card__date">Joined {{ formatDate(u.createdAt) }}</span>
            <span v-if="u.isBanned" class="user-badge ban-badge">🚫 Banned</span>
            <span v-else-if="u.restrictedUntil && new Date(u.restrictedUntil) > new Date()" class="user-badge restrict-badge">
              ⏳ Restricted until {{ formatDate(u.restrictedUntil) }}
            </span>
            <button
              v-if="u._pendingAppealId && (u.isBanned || (u.restrictedUntil && new Date(u.restrictedUntil) > new Date()))"
              class="appeal-indicator-btn"
              @click="jumpToAppeal(u._pendingAppealId)"
              title="This user has a pending appeal — click to review"
            >
              📋 Pending Appeal
            </button>
            <div v-if="!u.isAdmin" class="user-card__actions">
              <select v-model="u._restrictDuration" class="restrict-select">
                <option value="">Restrict…</option>
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
                <option value="1mo">1 month</option>
                <option value="3mo">3 months</option>
                <option value="none">Lift restriction</option>
              </select>
              <button class="btn-restrict" :disabled="!u._restrictDuration" @click="applyRestrict(u)">Apply</button>
              <button v-if="!u.isVerified" class="btn-verify" @click="forceVerify(u)">✉️ Verify</button>
              <span v-else class="verified-badge">✅ Verified</span>
              <button v-if="!u.isBanned" class="btn-ban" @click="applyBan(u)">🚫 Ban</button>
              <button v-else class="btn-unban" @click="applyUnban(u)">✅ Unban</button>
              <button class="btn-delete-user" @click="promptDeleteUser(u)">🗑 Delete</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Reported Comments tab -->
    <template v-if="tab === 'comments'">
      <p v-if="loadingComments" class="feed-status">Loading...</p>
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
                <button v-if="c.author?._id" class="btn-ban btn-sm" @click="quickBan(c.author._id, c.author.username, c.author.email)">🚫 Ban</button>
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
      <p v-if="loadingPosts" class="feed-status">Loading...</p>
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
          <button v-if="p.author?._id" class="btn-ban" @click="quickBan(p.author._id, p.author.username, p.author.email)">🚫 Ban Author</button>
        </div>
      </div>
      </div>
    </template>

    <!-- DM Reports tab -->
    <template v-if="tab === 'dms'">
      <p v-if="loadingDms" class="feed-status">Loading...</p>
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
            <button v-if="r.reportedUser?._id" class="btn-ban" @click="quickBan(r.reportedUser._id, r.reportedUser.username, r.reportedUser.email)">🚫 Ban User</button>
          </div>
        </div>
      </div>
    </template>

    <!-- Online Users tab -->
    <template v-if="tab === 'online'">
      <p v-if="!onlineUserList.length" class="feed-status">No users currently online.</p>
      <div v-else class="user-list">
        <div v-for="u in onlineUserList" :key="u._id" class="user-card">
          <div class="user-card__left">
            <span class="user-card__username" @click="router.push(`/creator/${u.username}`)">@{{ u.username }}</span>
            <span v-if="u.isAdmin" class="user-badge admin-badge">🛡️ Mod</span>
            <span v-if="u.isSubscriber" class="user-badge sub-badge">⭐ Sub</span>
            <span class="user-badge online-badge">🟢 Online</span>
          </div>
          <div class="user-card__meta">
            <span class="user-card__email">{{ u.email }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Analytics tab -->
    <template v-if="tab === 'analytics'">
      <p v-if="analyticsLoading" class="feed-status">Loading analytics...</p>
      <div v-else-if="analytics" class="analytics-grid">

        <!-- Users -->
        <div class="analytics-section">
          <h2 class="analytics-section-title">👥 Users</h2>
          <div class="analytics-cards">
            <div class="stat-card">
              <span class="stat-value">{{ analytics.users.totalCreated }}</span>
              <span class="stat-label">Total Created</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ analytics.users.totalCurrent }}</span>
              <span class="stat-label">Total Current</span>
            </div>
            <div class="stat-card stat-card--green">
              <span class="stat-value">{{ analytics.users.online }}</span>
              <span class="stat-label">🟢 Online</span>
            </div>
            <div class="stat-card stat-card--dim">
              <span class="stat-value">{{ analytics.users.offline }}</span>
              <span class="stat-label">⚫ Offline</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ analytics.users.newToday }}</span>
              <span class="stat-label">New Today</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ analytics.users.newThisWeek }}</span>
              <span class="stat-label">New This Week</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ analytics.users.newThisMonth }}</span>
              <span class="stat-label">New This Month</span>
            </div>
          </div>
        </div>

        <!-- Downloads -->
        <div class="analytics-section">
          <h2 class="analytics-section-title">📥 Resume Downloads</h2>
          <div class="analytics-cards">
            <div class="stat-card stat-card--green">
              <span class="stat-value">{{ analytics.downloads }}</span>
              <span class="stat-label">Total Downloads</span>
            </div>
          </div>
        </div>

        <!-- Page Views -->
        <div class="analytics-section">
          <h2 class="analytics-section-title">📄 Page Travel</h2>
          <p v-if="!analytics.pageViews.length" class="analytics-empty">No page visits recorded yet.</p>
          <div v-else class="page-view-table">
            <div class="pv-row pv-header">
              <span>Page</span>
              <span>Visits</span>
            </div>
            <div v-for="pv in analytics.pageViews" :key="pv.path" class="pv-row">
              <span class="pv-path">{{ pv.path }}</span>
              <span class="pv-count">{{ pv.count.toLocaleString() }}</span>
              <div
                class="pv-bar"
                :style="{ width: barWidth(pv.count, analytics.pageViews[0].count) + '%' }"
              ></div>
            </div>
          </div>
        </div>

        <!-- Visitor Locations -->
        <div class="analytics-section">
          <h2 class="analytics-section-title">🌍 Visitor Locations</h2>
          <p v-if="!analytics.locations.length" class="analytics-empty">No location data yet — accumulates from live traffic.</p>
          <div v-else class="page-view-table">
            <div class="pv-row pv-header">
              <span>Country</span>
              <span>Visitors</span>
            </div>
            <div v-for="loc in analytics.locations" :key="loc.country" class="pv-row">
              <span class="pv-path">{{ loc.country }}</span>
              <span class="pv-count">{{ loc.count.toLocaleString() }}</span>
              <div
                class="pv-bar pv-bar--loc"
                :style="{ width: barWidth(loc.count, analytics.locations[0].count) + '%' }"
              ></div>
            </div>
          </div>
        </div>

        <button class="btn-refresh-analytics" @click="loadAnalytics(true)">↻ Refresh</button>
      </div>
    </template>

    <!-- Appeals tab -->
    <template v-if="tab === 'appeals'">
      <p v-if="appealsLoading" class="feed-status">Loading appeals...</p>
      <p v-else-if="!appeals.length" class="feed-status">No appeals yet.</p>
      <div v-else class="appeals-list">
        <div v-for="a in appeals" :key="a._id" :id="`appeal-${a._id}`" :class="['appeal-card', `appeal-card--${a.status}`, { 'appeal-card--highlighted': highlightedAppealId === a._id }]">
          <div class="appeal-card__header">
            <span class="appeal-type-badge" :class="a.type === 'ban' ? 'badge-ban' : 'badge-restrict'">
              {{ a.type === 'ban' ? '🚫 Ban Appeal' : '⏳ Restriction Appeal' }}
            </span>
            <span class="appeal-status-badge" :class="`status-${a.status}`">{{ a.status }}</span>
            <span class="appeal-date">{{ formatDate(a.createdAt) }}</span>
          </div>
          <div class="appeal-card__user">
            <strong>@{{ a.username }}</strong>
            <span v-if="a.email" class="appeal-email">{{ a.email }}</span>
          </div>
          <p class="appeal-text">{{ a.appealText }}</p>
          <div v-if="a.status === 'pending'" class="appeal-actions">
            <button class="btn-approve" @click="resolveAppeal(a, 'approved')">✅ Approve</button>
            <button class="btn-dismiss" @click="resolveAppeal(a, 'dismissed')">❌ Dismiss</button>
          </div>
          <p v-else class="appeal-resolved">Resolved: {{ a.status }}</p>
        </div>
      </div>
    </template>

    <!-- Logs tab -->
    <template v-if="tab === 'logs'">
      <p v-if="logsLoading" class="feed-status">Loading logs...</p>
      <p v-else-if="!adminLogs.length" class="feed-status">No admin actions logged yet.</p>
      <div v-else class="logs-list">
        <div v-for="entry in adminLogs" :key="entry._id" class="log-row">
          <span class="log-action">{{ entry.action }}</span>
          <span v-if="entry.targetUsername" class="log-target">→ @{{ entry.targetUsername }}</span>
          <span v-if="entry.detail" class="log-detail">{{ entry.detail }}</span>
          <span class="log-meta">by @{{ entry.adminUsername }} · {{ formatDate(entry.createdAt) }}</span>
        </div>
      </div>
    </template>

    <!-- Toast notification -->
    <transition name="toast-fade">
      <div v-if="toast.show" :class="['admin-toast', `admin-toast--${toast.type}`]">{{ toast.msg }}</div>
    </transition>

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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';
import { useAuth } from '../composables/useAuth';
import { useNotifications } from '../composables/useNotifications';

// ─── API BASE ─────────────────────────────────────────────────────────────────

// All admin endpoints share this prefix, set via environment variable.
const API = import.meta.env.VITE_API_URL + '/api/admin';

const router = useRouter();
const route  = useRoute();
const { user } = useAuth();
const { getSocket } = useNotifications();

// ─── ADMIN GUARD ──────────────────────────────────────────────────────────────

// Watch the user object so the redirect fires correctly whether auth is already
// loaded (direct nav while logged in) or resolves asynchronously (page refresh).
// id !== null means auth has finished loading — null is the logged-out default.
watch(user, (u) => {
  if (u.id !== null && !u.isAdmin) router.replace('/');
}, { immediate: true, deep: true });

// ─── TAB STATE ────────────────────────────────────────────────────────────────

// Which tab is currently active: 'reported' | 'flagged' | 'comments' | 'users' | 'dms'.
const tab = ref('users');

// ─── POST / COMMENT DATA ─────────────────────────────────────────────────────

const reported        = ref([]);
const flagged         = ref([]);
const reportedComments = ref([]);

// Each tab has its own independent loading flag — no shared state.
const loadingPosts    = ref(false);
const loadingComments = ref(false);
const loadingDms      = ref(false);

// Set of post IDs whose body text is currently fully expanded in the UI.
// Using a Set so toggling is O(1) and Vue's reactivity is triggered by
// replacing the entire Set reference rather than mutating in place.
const expanded = ref(new Set());

// ─── TOAST NOTIFICATION ───────────────────────────────────────────────────────

const toast = ref({ show: false, msg: '', type: 'success' });
let toastTimer = null;
const showToast = (msg, type = 'success') => {
  clearTimeout(toastTimer);
  toast.value = { show: true, msg, type };
  toastTimer = setTimeout(() => { toast.value.show = false; }, 3500);
};

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

// The string the moderator has typed into the user search box.
const userSearch = ref('');

// ── Test account creation ──────────────────────────────────────────────────────
const showTestForm   = ref(false);
const testLoading    = ref(false);
const testMsg        = ref('');
const testForm       = ref({ username: '', email: '', password: '' });
const lastTestAccount = ref(null); // { username, email, password } of most recently created account

const submitTestUser = async () => {
  testMsg.value = '';
  if (!testForm.value.username || !testForm.value.email || !testForm.value.password) {
    testMsg.value = 'All fields required.'; return;
  }
  testLoading.value = true;
  const savedPassword = testForm.value.password;
  try {
    const res = await axios.post(`${API}/create-test-user`, testForm.value);
    testMsg.value = res.data.message;
    lastTestAccount.value = {
      username: testForm.value.username,
      email: testForm.value.email,
      password: savedPassword,
    };
    testForm.value = { username: '', email: '', password: '' };
    await loadUsers();
  } catch (err) {
    testMsg.value = err.response?.data?.message || 'Failed to create account.';
  } finally {
    testLoading.value = false;
  }
};

const openTestTab = (path) => window.open(path, '_blank');

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
  usersLoading.value = true;
  try {
    const [res, appealsRes] = await Promise.allSettled([
      axios.get(`${API}/users`),
      axios.get(`${API}/appeals`),
    ]);

    // Build a map of username → appeal status for pending appeals
    const pendingAppealMap = {};
    if (appealsRes.status === 'fulfilled') {
      appeals.value = appealsRes.value.data;
      appealsRes.value.data
        .filter(a => a.status === 'pending')
        .forEach(a => { pendingAppealMap[a.username] = a._id; });
    }

    // Fetch online IDs separately so isOnline is always fresh
    let onlineIds = new Set();
    try {
      const ol = await axios.get(`${API}/online-users`);
      onlineIds = new Set(ol.data.map(u => u._id));
    } catch {}

    if (res.status === 'fulfilled') {
      users.value = res.value.data.map(u => ({
        ...u,
        _restrictDuration: '',
        isOnline: onlineIds.has(u._id),
        _pendingAppealId: pendingAppealMap[u.username] || null,
      }));
    }
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
  loadingComments.value = true;
  try {
    const res = await axios.get(`${API}/reported-comments`);
    reportedComments.value = res.data;
  } catch {
    // ignore
  } finally {
    loadingComments.value = false;
  }
};

const load = async () => {
  loadingPosts.value = true;
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
    loadingPosts.value = false;
  }
};

// ─── LIFECYCLE ────────────────────────────────────────────────────────────────

// ─── TAB SWITCHING ────────────────────────────────────────────────────────────

/**
 * switchTab — the single entry point for changing tabs.
 * Sets the active tab and triggers that tab's loader.
 * Called by tab buttons directly; does NOT touch the router (no history noise).
 */
const switchTab = (name) => {
  tab.value = name;
  if (name === 'analytics') loadAnalytics();
  else if (name === 'comments') loadReportedComments();
  else if (name === 'users') loadUsers();
  else if (name === 'dms') loadDmReports();
  else if (name === 'online') loadOnlineUsers();
  else if (name === 'appeals') loadAppeals();
  else if (name === 'logs') loadAdminLogs();
  else load(); // reported + flagged
};

const validTabs = ['reported', 'flagged', 'comments', 'users', 'dms', 'online', 'analytics', 'appeals', 'logs'];

// ─── APPEALS ─────────────────────────────────────────────────────────────────

const appeals        = ref([]);
const appealsLoading = ref(false);

const loadAppeals = async () => {
  appealsLoading.value = true;
  try {
    const res = await axios.get(`${API}/appeals`);
    appeals.value = res.data;
  } catch { /* silent */ } finally {
    appealsLoading.value = false;
  }
};

// ─── ADMIN LOGS ──────────────────────────────────────────────────────────────

const adminLogs   = ref([]);
const logsLoading = ref(false);

const loadAdminLogs = async () => {
  logsLoading.value = true;
  try {
    const res = await axios.get(`${API}/logs`);
    adminLogs.value = res.data;
  } catch { /* silent */ } finally {
    logsLoading.value = false;
  }
};

// Jump to the Appeals tab and highlight a specific appeal
const highlightedAppealId = ref(null);
const jumpToAppeal = (appealId) => {
  highlightedAppealId.value = appealId;
  switchTab('appeals');
  // Scroll to the card after the tab renders
  setTimeout(() => {
    const el = document.getElementById(`appeal-${appealId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 150);
};

const resolveAppeal = async (appeal, status) => {
  try {
    const res = await axios.put(`${API}/appeals/${appeal._id}`, { status });
    const idx = appeals.value.findIndex(a => a._id === appeal._id);
    if (idx !== -1) appeals.value[idx] = { ...appeals.value[idx], status: res.data.status };

    // Apply auto-unban / lift restriction to the user card if backend did it
    const uIdx = users.value.findIndex(u => u.username === appeal.username);
    if (uIdx !== -1) {
      const changes = { _pendingAppealId: null };
      if (res.data.userChanges) Object.assign(changes, res.data.userChanges);
      users.value[uIdx] = { ...users.value[uIdx], ...changes };
    }

    if (highlightedAppealId.value === appeal._id) highlightedAppealId.value = null;

    const action = status === 'approved'
      ? appeal.type === 'ban' ? 'Appeal approved — user unbanned.' : 'Appeal approved — restriction lifted.'
      : 'Appeal dismissed.';
    showToast(action, status === 'approved' ? 'success' : 'error');
  } catch (err) {
    showToast(err.response?.data?.message || 'Failed to update appeal.', 'error');
  }
};

// If the nav link is clicked while already on /admin the query param changes
// but the component isn't remounted — watch handles that specific case only.
watch(() => route.query.tab, (qTab) => {
  if (qTab && validTabs.includes(qTab) && qTab !== tab.value) {
    switchTab(qTab);
  }
});

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

// ─── ONLINE USERS ─────────────────────────────────────────────────────────────

const onlineUserList = ref([]);

const loadOnlineUsers = async () => {
  try {
    const res = await axios.get(`${API}/online-users`);
    onlineUserList.value = res.data;
  } catch {}
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
  loadingDms.value = true;
  try {
    const res = await axios.get(`${API}/dm-reports`);
    dmReports.value = res.data;
    dmReportsLoaded.value = true;
  } catch { /* ignore */ }
  finally { loadingDms.value = false; }
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

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

// Aggregated platform metrics returned by GET /api/admin/analytics.
const analytics = ref(null);

// Separate loading flag so it doesn't share state with the posts loading flag.
const analyticsLoading = ref(false);

// Guards against re-fetching on every tab visit.
const analyticsLoaded = ref(false);

/**
 * loadAnalytics
 * Fetches platform-wide metrics from the admin API.
 * Pass force=true to bypass the cache and reload fresh data.
 */
const loadAnalytics = async (force = false) => {
  if (analyticsLoaded.value && !force) return;
  analyticsLoading.value = true;
  try {
    const res = await axios.get(`${API}/analytics`);
    analytics.value = res.data;
    analyticsLoaded.value = true;
  } catch {
    // ignore — analytics section just won't render
  } finally {
    analyticsLoading.value = false;
  }
};

// Silent background refresh — updates numbers in place with no loading spinner.
// Only runs while the analytics tab is visible.
const refreshAnalyticsSilent = async () => {
  if (tab.value !== 'analytics' || !analytics.value) return;
  try {
    const res = await axios.get(`${API}/analytics`);
    analytics.value = res.data;
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
    }
  );
};

// ─── RESTRICT / BAN USER ─────────────────────────────────────────────────────

// Helper: patch a user object in users.value by _id and merge changes
const patchUser = (id, changes) => {
  const idx = users.value.findIndex(x => x._id === id);
  if (idx !== -1) users.value[idx] = { ...users.value[idx], ...changes };
};

const forceVerify = async (u) => {
  try {
    await axios.put(`${API}/users/${u._id}/verify`);
    patchUser(u._id, { isVerified: true });
    showToast(`@${u.username} is now verified.`);
  } catch (err) {
    showToast(err.response?.data?.message || 'Failed to verify.', 'error');
  }
};

const applyRestrict = async (u) => {
  if (!u._restrictDuration) return;
  try {
    const res = await axios.put(`${API}/users/${u._id}/restrict`, { duration: u._restrictDuration });
    patchUser(u._id, { restrictedUntil: res.data.restrictedUntil, _restrictDuration: '' });
    showToast(res.data.message);
  } catch (err) {
    showToast(err.response?.data?.message || 'Failed to apply restriction.', 'error');
  }
};

const applyBan = (u) => {
  openModal(
    `Ban @${u.username}?`,
    `This will permanently ban their account and block their email (${u.email}) from re-registering.`,
    async () => {
      await axios.put(`${API}/users/${u._id}/ban`);
      patchUser(u._id, { isBanned: true });
    }
  );
};

const quickBan = (userId, username, email) => {
  const detail = email ? ` and block their email (${email}) from re-registering` : '';
  openModal(
    `Ban @${username}?`,
    `This will permanently ban their account${detail}.`,
    async () => {
      await axios.put(`${API}/users/${userId}/ban`);
    }
  );
};

const applyUnban = async (u) => {
  try {
    await axios.put(`${API}/users/${u._id}/ban`, { unban: true });
    patchUser(u._id, { isBanned: false });
    showToast(`@${u.username} has been unbanned.`);
  } catch (err) {
    showToast(err.response?.data?.message || 'Failed to unban.', 'error');
  }
};

// ─── REAL-TIME ANALYTICS ──────────────────────────────────────────────────────

let analyticsInterval = null;

onMounted(() => {
  // Initialise the correct tab from the URL param — done here (not at module
  // level) so all const loaders are fully initialised before switchTab runs.
  const initTab = route.query.tab;
  switchTab(validTabs.includes(initTab) ? initTab : 'users');

  const sock = getSocket();
  if (sock) {
    // Live online count — fires whenever any user connects or disconnects
    sock.on("analytics:online", ({ count, users: onlineList }) => {
      if (analytics.value) {
        analytics.value.users.online  = count;
        analytics.value.users.offline = Math.max(0, analytics.value.users.totalCurrent - count);
      }
      if (onlineList) {
        onlineUserList.value = onlineList;
        // Update isOnline on the users list in real-time
        const onlineIds = new Set(onlineList.map(u => u._id));
        users.value = users.value.map(u => ({ ...u, isOnline: onlineIds.has(u._id) }));
      }
    });

    // Live page view — fires whenever any page is visited
    sock.on("analytics:pageview", ({ path, count }) => {
      if (!analytics.value) return;
      const idx = analytics.value.pageViews.findIndex(p => p.path === path);
      if (idx >= 0) {
        analytics.value.pageViews[idx] = { path, count };
      } else {
        analytics.value.pageViews.push({ path, count });
      }
      analytics.value.pageViews.sort((a, b) => b.count - a.count);
    });
  }

  // Background poll every 30 s — silently refreshes user counts and downloads
  // without showing a loading spinner. Only fetches when the analytics tab is active.
  analyticsInterval = setInterval(refreshAnalyticsSilent, 10_000);
});

onUnmounted(() => {
  const sock = getSocket();
  if (sock) {
    sock.off("analytics:online");
    sock.off("analytics:pageview");
  }
  clearInterval(analyticsInterval);
});

// ─── ANALYTICS HELPERS ────────────────────────────────────────────────────────

/**
 * barWidth
 * Returns a percentage (0–100) for the progress bar in the page-view and
 * location tables. The top entry always fills 100%; others scale relative to it.
 */
const barWidth = (count, max) => max > 0 ? Math.round((count / max) * 100) : 0;

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
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none; /* Firefox */
  padding-bottom: 4px;
}
.admin-tabs::-webkit-scrollbar { display: none; } /* Chrome/Safari */

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
  flex-shrink: 0;
  white-space: nowrap;
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
.admin-badge    { background: #92400e; color: #fff; }
.sub-badge      { background: #14532d; color: #fff; }
.online-badge   { background: #14532d; color: #fff; }
.offline-badge  { background: #374151; color: #d1d5db; }
.ban-badge      { background: #7f1d1d; color: #fff; }
.restrict-badge { background: #78350f; color: #fff; }

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

.user-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
  margin-top: 4px;
}
.restrict-select {
  font-size: 0.78rem;
  border: 2px solid #000;
  border-radius: 8px;
  padding: 4px 8px;
  cursor: pointer;
}
.btn-restrict {
  background: #78350f;
  color: #fff;
  border: 2px solid #000;
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-restrict:disabled { opacity: 0.4; cursor: default; }
.btn-restrict:not(:disabled):hover { background: #92400e; }
.btn-ban {
  background: #7f1d1d;
  color: #fff;
  border: 2px solid #000;
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-ban:hover { background: #991b1b; }
.btn-unban {
  background: #14532d;
  color: #fff;
  border: 2px solid #000;
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-unban:hover { background: #166534; }
.btn-verify {
  background: #1e3a5f;
  color: #fff;
  border: 2px solid #000;
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-verify:hover { background: #1e40af; }
.verified-badge {
  font-size: 0.75rem;
  font-weight: 700;
  color: #14532d;
  background: #dcfce7;
  border: 2px solid #16a34a;
  border-radius: 8px;
  padding: 4px 10px;
  white-space: nowrap;
}

/* Test account creation form */
.test-user-form {
  margin-bottom: 16px;
}
.test-user-toggle {
  background: #1e3a5f;
  color: #fff;
  border: 2px solid #000;
  border-radius: 8px;
  padding: 7px 16px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}
.test-user-toggle:hover { background: #1e40af; }
.test-user-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
  align-items: center;
}
.test-input {
  border: 2px solid #000;
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 0.88rem;
  font-weight: 600;
  min-width: 140px;
  flex: 1;
}
.test-user-submit {
  background: #14532d;
  color: #fff;
  border: 2px solid #000;
  border-radius: 8px;
  padding: 7px 18px;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.test-user-submit:disabled { opacity: 0.5; cursor: default; }
.test-user-submit:not(:disabled):hover { background: #166534; }
.test-msg {
  font-size: 0.82rem;
  font-weight: 700;
  color: #14532d;
}

.test-account-result {
  margin-top: 12px;
  border: 2px solid #000;
  border-radius: 10px;
  padding: 12px 14px;
  background: #f0fdf4;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.test-account-creds {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.test-cred-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #555;
}
.test-cred {
  background: #000;
  color: #86efac;
  font-size: 0.82rem;
  font-family: monospace;
  padding: 3px 8px;
  border-radius: 6px;
  user-select: all;
}
.test-account-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.test-link-btn {
  background: #1e3a5f;
  color: #fff;
  border: 2px solid #000;
  border-radius: 8px;
  padding: 5px 12px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}
.test-link-btn:hover { background: #1e40af; }
.test-link-clear {
  background: none;
  border: 2px solid #999;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  color: #666;
  margin-left: auto;
}
.test-link-clear:hover { background: #fee2e2; border-color: #ef4444; color: #b91c1c; }

/* ── Toast ── */
.admin-toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 10px;
  border: 2px solid #000;
  font-weight: 700;
  font-size: 0.92rem;
  z-index: 9999;
  white-space: nowrap;
  box-shadow: 0 4px 16px rgba(0,0,0,0.18);
}
.admin-toast--success { background: #dcfce7; color: #14532d; border-color: #16a34a; }
.admin-toast--error   { background: #fee2e2; color: #b91c1c; border-color: #dc2626; }
.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity 0.3s, transform 0.3s; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(10px); }

/* ── Appeals tab ── */
.appeals-list { display: flex; flex-direction: column; gap: 14px; }
.appeal-card {
  border: 2px solid #000;
  border-radius: 12px;
  padding: 16px 18px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.appeal-card--approved  { border-color: #16a34a; background: #f0fdf4; }
.appeal-card--dismissed { border-color: #9ca3af; background: #f9fafb; opacity: 0.7; }
.appeal-card--highlighted { border-color: #d97706 !important; box-shadow: 0 0 0 3px #fde68a; }

/* Pending appeal badge on user cards */
.appeal-indicator-btn {
  background: #d97706;
  color: #fff;
  border: 2px solid #000;
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;
  animation: pulse-appeal 1.8s ease-in-out infinite;
}
.appeal-indicator-btn:hover { background: #b45309; }
@keyframes pulse-appeal {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.65; }
}
.appeal-card__header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.appeal-type-badge {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  border: 2px solid #000;
}
.badge-ban      { background: #fee2e2; color: #b91c1c; }
.badge-restrict { background: #fffbeb; color: #92400e; }
.appeal-status-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  text-transform: capitalize;
}
.status-pending   { background: #fef9c3; color: #854d0e; border: 2px solid #ca8a04; }
.status-approved  { background: #dcfce7; color: #14532d; border: 2px solid #16a34a; }
.status-dismissed { background: #f3f4f6; color: #6b7280; border: 2px solid #9ca3af; }
.appeal-date { font-size: 0.78rem; color: #888; margin-left: auto; }
.appeal-card__user { display: flex; align-items: center; gap: 10px; }
.appeal-email { font-size: 0.8rem; color: #555; }
.appeal-text {
  font-size: 0.88rem;
  color: #222;
  background: #f8f8f8;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 10px 12px;
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.5;
}
.appeal-actions { display: flex; gap: 8px; }
.btn-approve {
  background: #14532d; color: #fff; border: 2px solid #000;
  border-radius: 8px; padding: 6px 16px; font-size: 0.85rem;
  font-weight: 700; cursor: pointer;
}
.btn-approve:hover { background: #166534; }
.btn-dismiss {
  background: #6b7280; color: #fff; border: 2px solid #000;
  border-radius: 8px; padding: 6px 16px; font-size: 0.85rem;
  font-weight: 700; cursor: pointer;
}
.btn-dismiss:hover { background: #4b5563; }
.appeal-resolved { font-size: 0.82rem; font-weight: 700; color: #555; margin: 0; text-transform: capitalize; }

/* ── Admin Logs ─────────────────────────────────────────────────────────────── */
.logs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.log-row {
  background: pink;
  border: 2px solid #000;
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
}
.log-action {
  font-weight: 800;
  color: #000;
}
.log-target {
  font-weight: 700;
  color: #14532d;
}
.log-detail {
  color: #555;
  font-style: italic;
}
.log-meta {
  margin-left: auto;
  font-size: 0.78rem;
  color: #888;
  white-space: nowrap;
}

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
  .user-card__actions { justify-content: flex-start; }
  .restrict-select { flex: 1; min-width: 0; }
  .btn-restrict, .btn-verify, .btn-ban, .btn-unban, .btn-delete-user { flex: 1; min-width: 0; text-align: center; }
  .admin-page { padding: 0 10px 44px; margin: 14px auto; }
  .admin-title { font-size: 1.3rem; margin-bottom: 14px; }
  .tab-btn { padding: 8px 12px; font-size: 0.88rem; }
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

/* ── Analytics tab ── */
.analytics-grid {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.analytics-section {
  background: pink;
  border: 3px solid #000;
  border-radius: 14px;
  padding: 18px 20px 20px;
}

.analytics-section-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #000;
  margin: 0 0 14px;
}

.analytics-empty {
  font-size: 0.88rem;
  color: #555;
  margin: 0;
  font-style: italic;
}

/* Stat cards */
.analytics-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.stat-card {
  background: #000;
  color: pink;
  border: 3px solid #14532d;
  border-radius: 12px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 110px;
  flex: 1;
  gap: 6px;
}
.stat-card--green { border-color: #14532d; background: #14532d; color: #fff; }
.stat-card--dim   { border-color: #374151; background: #374151; color: #d1d5db; }

.stat-value {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
}

.stat-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
  opacity: 0.9;
  line-height: 1.3;
}

/* Page view / location bar table */
.page-view-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pv-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 10px;
  position: relative;
  background: #fff0f6;
  border-radius: 8px;
  padding: 8px 12px;
  overflow: hidden;
  min-height: 36px;
}

.pv-header {
  background: #000;
  color: pink;
  font-size: 0.78rem;
  font-weight: 700;
  border-radius: 8px;
  padding: 6px 12px;
}

.pv-path {
  font-size: 0.85rem;
  font-weight: 600;
  color: #000;
  z-index: 1;
  word-break: break-all;
}

.pv-count {
  font-size: 0.85rem;
  font-weight: 700;
  color: #7f1d1d;
  z-index: 1;
  white-space: nowrap;
}

/* Progress bar absolutely fills the row behind the text */
.pv-bar {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: rgba(127, 29, 29, 0.12);
  border-radius: 8px;
  transition: width 0.4s ease;
  z-index: 0;
}
.pv-bar--loc { background: rgba(20, 83, 45, 0.12); }

.btn-refresh-analytics {
  align-self: flex-start;
  background: #000;
  color: pink;
  border: 3px solid #14532d;
  border-radius: 8px;
  padding: 8px 20px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s, color 0.15s;
}
.btn-refresh-analytics:hover { transform: translateY(-2px); color: rgb(125, 190, 157); }

@media (max-width: 480px) {
  .stat-card { min-width: 90px; padding: 12px 14px; }
  .stat-value { font-size: 1.6rem; }
  .analytics-section { padding: 14px; }
  .pv-path { font-size: 0.78rem; }
}
</style>
