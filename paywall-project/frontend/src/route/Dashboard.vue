<template>
  <div class="dash-page" v-if="user.id">
    <!-- Title + quick action buttons -->
    <div class="dash-header">
      <h1 class="dash-title">My Dashboard</h1>
      <div class="dash-actions">
        <router-link to="/create-post" class="auth-button dash-btn">+ New Post</router-link>
        <router-link to="/create-post?private=true" class="auth-button dash-btn dash-btn--private">🔒 Private Post</router-link>
        <router-link to="/feed" class="auth-button dash-btn">Feed</router-link>
      </div>
    </div>

    <!-- Summary stat cards -->
    <div class="dash-stats">
      <div class="stat-card">
        <span class="stat-num">{{ publicPosts.length }}</span>
        <span class="stat-label">🌐 Public</span>
      </div>
      <div class="stat-card">
        <span class="stat-num">{{ privatePosts.length }}</span>
        <span class="stat-label">🔒 Private</span>
      </div>
      <div class="stat-card">
        <span class="stat-num">{{ totalLikes }}</span>
        <span class="stat-label">❤️ Likes</span>
      </div>
      <div class="stat-card">
        <span class="stat-num">{{ totalComments }}</span>
        <span class="stat-label">💬 Comments</span>
      </div>
    </div>

    <!-- ── Search + filter + sort row ── -->
    <div class="dash-filter-row">
      <input
        v-model="dashSearch"
        type="search"
        placeholder="Search your posts..."
        class="dash-search-input"
      />
      <div class="dash-filter-tabs">
        <button
          v-for="cat in ['All', ...categories]" :key="cat"
          :class="['dash-tab', { active: dashCat === (cat === 'All' ? '' : cat) }]"
          @click="dashCat = cat === 'All' ? '' : cat"
        >{{ cat }}</button>
      </div>
      <div class="dash-sort-toggle">
        <button :class="['sort-btn', { active: dashSort === 'recent' }]"  @click="dashSort = 'recent'">Recent</button>
        <button :class="['sort-btn', { active: dashSort === 'popular' }]" @click="dashSort = 'popular'">Popular</button>
      </div>
    </div>

    <!-- Loading / empty states -->
    <p v-if="loading" class="feed-status">Loading your posts...</p>
    <p v-else-if="!allPosts.length" class="feed-status">No posts yet. <router-link to="/create-post" class="create-link">Create your first post →</router-link></p>

    <!-- Comments modal -->
    <div v-if="commentsModal.show" class="dash-modal-overlay" @click.self="commentsModal.show = false">
      <div class="dash-modal">
        <div class="dash-modal-header">
          <span class="dash-modal-title">💬 Comments</span>
          <button class="dash-modal-close" @click="commentsModal.show = false">×</button>
        </div>
        <div v-if="!commentsModal.comments.length" class="dash-modal-empty">No comments yet.</div>
        <div v-else class="dash-modal-list">
          <div v-for="c in commentsModal.comments" :key="c._id" class="dash-modal-item">
            <span class="dash-modal-user">@{{ c.author?.username || 'Unknown' }}</span>
            <span class="dash-modal-text">{{ c.body }}</span>
          </div>
        </div>
      </div>
    </div>

    <template v-else>
      <!-- Private posts section — only shown when there are private posts matching current filter -->
      <div v-if="filteredPrivate.length" class="post-group">
        <h2 class="group-title">🔒 Private Posts</h2>
        <div class="posts-grid">
          <div v-for="p in filteredPrivate" :key="p._id" class="dash-post-card private" @click="goToPost(p._id)">
            <img v-if="p.imageUrl" :src="p.imageUrl" class="card-thumb" alt="" />
            <div class="card-body">
              <div class="card-top">
                <span v-if="p.category" class="post-cat">{{ p.category }}</span>
                <span class="post-date">{{ formatDate(p.createdAt) }}</span>
              </div>
              <p class="card-author">@{{ p.author?.username || user.username }}</p>
              <p v-if="p.title" class="card-title">{{ p.title }}</p>
              <p v-if="p.body" class="card-preview">{{ truncate(p.body, 80) }}</p>
              <div class="card-footer">
                <span>❤️ {{ p.likes.length }}</span>
                <span class="comments-btn" @click.stop="openComments(p)">💬 {{ p.comments.length }}</span>
                <span class="private-tag">🔒</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Public posts section — only shown when there are public posts matching current filter -->
      <div v-if="filteredPublic.length" class="post-group">
        <h2 class="group-title">🌐 Public Posts</h2>
        <div class="posts-grid">
          <div v-for="p in filteredPublic" :key="p._id" class="dash-post-card" @click="goToPost(p._id)">
            <img v-if="p.imageUrl" :src="p.imageUrl" class="card-thumb" alt="" />
            <div class="card-body">
              <div class="card-top">
                <span v-if="p.category" class="post-cat">{{ p.category }}</span>
                <span class="post-date">{{ formatDate(p.createdAt) }}</span>
              </div>
              <p class="card-author">@{{ p.author?.username || user.username }}</p>
              <p v-if="p.title" class="card-title">{{ p.title }}</p>
              <p v-if="p.body" class="card-preview">{{ truncate(p.body, 80) }}</p>
              <div class="card-footer">
                <span>❤️ {{ p.likes.length }}</span>
                <span class="comments-btn" @click.stop="openComments(p)">💬 {{ p.comments.length }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state after filtering -->
      <p v-if="!filteredPrivate.length && !filteredPublic.length" class="feed-status">No posts match your search.</p>
    </template>
  </div>
</template>

<script setup>
/**
 * Dashboard.vue — Authenticated user's personal content overview
 *
 * Shows aggregate stats (public count, private count, total likes, total
 * comments) and a two-column card grid of the user's own posts, split into
 * Private and Public sections.  Clicking a card navigates to the post page.
 *
 * The page is only rendered when `user.id` is present; Vue-Router guards
 * should redirect unauthenticated visitors before they reach this route.
 */
import { computed, ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { usePosts } from '../composables/usePosts.js';

const router = useRouter();
const route  = useRoute();

// ─── COMPOSABLES ─────────────────────────────────────────────────────────────

// `user`       — reactive user object (id, username, etc.).
// `getProfile` — refreshes the user object from the API.
const { user, getProfile } = useAuth();

// `allPosts`    — reactive array of the current user's posts.
// `loading`     — true while the fetch is in-flight.
// `fetchMyPosts`— fetches only posts belonging to the logged-in user.
const { posts: allPosts, loading, fetchMyPosts } = usePosts();

// ─── COMPUTED STATS ──────────────────────────────────────────────────────────

// ─── FILTER / SEARCH / SORT STATE ────────────────────────────────────────────

const categories = ['Music', 'Videos', 'Streamer', 'Pictures', 'Blogger / Writer'];

/** Text typed in the dashboard search input (client-side filter). */
const dashSearch = ref('');

/** Selected category filter: '' = all. */
const dashCat = ref('');

/** Sort order: 'recent' or 'popular'. */
const dashSort = ref('recent');

// ─── COMMENTS MODAL STATE ────────────────────────────────────────────────────

const commentsModal = ref({ show: false, comments: [] });

const openComments = (post) => {
  commentsModal.value = { show: true, comments: post.comments || [] };
};

// ─── COMPUTED STATS & FILTERED POSTS ─────────────────────────────────────────

// Separate posts into public and private for the two card sections.
const publicPosts  = computed(() => allPosts.value.filter(p => !p.isPrivate));
const privatePosts = computed(() => allPosts.value.filter(p => p.isPrivate));

// Sum of all likes across every post owned by this user.
const totalLikes = computed(() => allPosts.value.reduce((sum, p) => sum + p.likes.length, 0));

// Sum of all comments across every post owned by this user.
const totalComments = computed(() => allPosts.value.reduce((sum, p) => sum + p.comments.length, 0));

/**
 * Apply search + category filter + sort to a base post array.
 * Used for both public and private post sections.
 */
const applyFilters = (base) => {
  let arr = base;
  if (dashCat.value) arr = arr.filter(p => p.category === dashCat.value);
  if (dashSearch.value.trim()) {
    const q = dashSearch.value.trim().toLowerCase();
    arr = arr.filter(p =>
      p.title?.toLowerCase().includes(q) ||
      p.body?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q)
    );
  }
  if (dashSort.value === 'popular') {
    arr = [...arr].sort((a, b) => b.likes.length - a.likes.length);
  }
  return arr;
};

const filteredPublic  = computed(() => applyFilters(publicPosts.value));
const filteredPrivate = computed(() => applyFilters(privatePosts.value));

// ─── LIFECYCLE ───────────────────────────────────────────────────────────────

/**
 * onMounted — ensure the user profile is fresh (needed for username display)
 * then load all of the user's own posts.
 */
onMounted(async () => {
  await getProfile();
  await fetchMyPosts();
});

// ─── NAVIGATION & DISPLAY HELPERS ────────────────────────────────────────────

// Navigate to a post's detail page.
const goToPost = (id) => router.push(`/post/${id}`);

// Truncate body text for the card preview (default 120 chars).
const truncate = (text, len = 120) => text.length > len ? text.slice(0, len) + '...' : text;

// Format an ISO date as a locale short date string.
const formatDate = (d) => new Date(d).toLocaleDateString();
</script>

<style scoped>
.dash-page {
  max-width: 800px;
  margin: 20px auto;
  padding: 0 16px 50px;
}

.dash-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 12px;
  flex-wrap: wrap;
}

.dash-title {
  font-size: 1.6rem;
  font-weight: 700;
  color: #000;
  margin: 0;
}

.dash-actions {
  display: flex;
  gap: 8px;
}

.dash-btn {
  width: auto;
  height: auto;
  padding: 8px 18px;
  font-size: 0.9rem;
  margin: 0;
}
.dash-btn--private {
  border-color: #7f1d1d !important;
  color: #ff9999 !important;
}
.dash-btn--private:hover { color: #ffd0d0 !important; }

/* ── Filter row ── */
.dash-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 14px;
}

.dash-search-input {
  flex: 1;
  min-width: 160px;
  padding: 8px 12px;
  border: 3px solid #000;
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 500;
  background: #fff;
  color: #000;
  outline: none;
  transition: border-color 0.2s;
}
.dash-search-input:focus { border-color: #14532d; }

.dash-filter-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.dash-tab {
  padding: 5px 11px;
  border-radius: 16px;
  border: 2px solid #000;
  background: #000;
  color: pink;
  font-weight: 600;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.15s;
}
.dash-tab.active, .dash-tab:hover {
  background: #14532d;
  border-color: #14532d;
  color: #fff;
}

.dash-sort-toggle { display: flex; gap: 4px; }

.sort-btn {
  padding: 6px 12px;
  border-radius: 8px;
  border: 2px solid #000;
  background: #000;
  color: pink;
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}
.sort-btn.active, .sort-btn:hover {
  background: #14532d;
  border-color: #14532d;
  color: #fff;
}

/* Comments button inside card footer */
.comments-btn {
  cursor: pointer;
  transition: color 0.15s;
}
.comments-btn:hover { color: #14532d; }

/* ── Comments modal ── */
.dash-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.dash-modal {
  background: #fff;
  border: 3px solid #000;
  border-radius: 16px;
  width: 100%;
  max-width: 420px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dash-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 2px solid #000;
  background: pink;
}

.dash-modal-title { font-size: 1rem; font-weight: 700; color: #000; }

.dash-modal-close {
  background: none;
  border: none;
  font-size: 1.4rem;
  font-weight: 700;
  cursor: pointer;
  color: #000;
  line-height: 1;
}

.dash-modal-empty {
  padding: 24px;
  text-align: center;
  font-weight: 600;
  color: #555;
}

.dash-modal-list {
  overflow-y: auto;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dash-modal-item {
  background: #f9f9f9;
  border: 2px solid #000;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dash-modal-user {
  font-size: 0.8rem;
  font-weight: 700;
  color: #14532d;
}

.dash-modal-text {
  font-size: 0.88rem;
  color: #000;
  word-break: break-word;
}

.dash-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

@media (max-width: 600px) {
  .dash-stats { grid-template-columns: repeat(2, 1fr); }
}

.stat-card {
  background: pink;
  border: 3px solid #000;
  border-radius: 10px;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-num {
  font-size: 1.5rem;
  font-weight: 700;
  color: #000;
}

.stat-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #333;
  text-align: center;
}


.feed-status {
  text-align: center;
  font-size: 1.1rem;
  font-weight: 600;
  color: #000;
  margin-top: 40px;
}

.create-link {
  color: #14532d;
  font-weight: 700;
  text-decoration: underline;
}

.post-group { margin-bottom: 32px; }

.group-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #000;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid #000;
}

.post-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.posts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.dash-post-card {
  background: pink;
  border: 3px solid #000;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  display: flex;
  flex-direction: column;
}
.dash-post-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}
/* Private cards use a dark background with red border to differentiate visually */
.dash-post-card.private { border-color: #7f1d1d; background: #111; }

.card-thumb {
  width: 100%;
  height: 130px;
  object-fit: cover;
  display: block;
}

.card-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.card-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.post-cat {
  background: #000;
  color: pink;
  font-size: 0.66rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 20px;
  flex-shrink: 0;
}
.dash-post-card.private .post-cat { background: #7f1d1d; color: #ff9999; }

.post-date {
  margin-left: auto;
  font-size: 0.7rem;
  color: #777;
  white-space: nowrap;
}
.dash-post-card.private .post-date { color: #cc3333; }

.card-author {
  font-size: 0.78rem;
  font-weight: 700;
  color: #14532d;
  margin: 0;
}
.dash-post-card.private .card-author { color: #66cc88; }

.card-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #000;
  margin: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}
.dash-post-card.private .card-title { color: #ff9999; }

.card-preview {
  font-size: 0.78rem;
  color: #333;
  margin: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
}
.dash-post-card.private .card-preview { color: #cc6666; }

.card-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #000;
  margin-top: auto;
  padding-top: 4px;
}
.dash-post-card.private .card-footer { color: #ff9999; }

.private-tag { margin-left: auto; }

/* ── Responsive ── */

/* Large tablet landscape */
@media (max-width: 1024px) {
  .dash-page { max-width: 700px; }
}

/* Tablet portrait */
@media (max-width: 768px) {
  .dash-page { max-width: 100%; padding: 0 14px 46px; margin: 16px auto; }
  .dash-title { font-size: 1.4rem; }
  .dash-stats { gap: 8px; }
  .stat-num { font-size: 1.35rem; }
}

/* Large phone */
@media (max-width: 600px) {
  .dash-page { padding: 0 10px 40px; margin: 12px auto; }
  .dash-title { font-size: 1.25rem; }
  .dash-stats { grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .stat-card { padding: 8px; }
  .stat-num { font-size: 1.2rem; }
  .stat-label { font-size: 0.7rem; }
  .dash-btn { padding: 7px 14px !important; font-size: 0.85rem !important; }
  .group-title { font-size: 0.95rem; }
  .posts-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .card-thumb { height: 100px; }
}

/* Phone */
@media (max-width: 480px) {
  .dash-page { padding: 0 8px 36px; }
  .dash-title { font-size: 1.15rem; }
  .dash-stats { gap: 5px; }
  .stat-card { padding: 7px 6px; border-radius: 8px; }
  .stat-num { font-size: 1.1rem; }
  /* Single-column cards on small phones */
  .posts-grid { grid-template-columns: 1fr; }
  .card-thumb { height: 160px; }
}

/* Small phone (360px) */
@media (max-width: 360px) {
  .dash-title { font-size: 1.05rem; }
  .dash-stats { gap: 4px; }
  .stat-num { font-size: 1rem; }
  .stat-label { font-size: 0.66rem; }
  .dash-header { flex-direction: column; align-items: flex-start; gap: 8px; }
}

/* Very small phone (320px) */
@media (max-width: 320px) {
  .dash-page { padding: 0 6px 34px; }
  .stat-card { padding: 6px 4px; }
}

/* Landscape phone */
@media (max-height: 500px) and (orientation: landscape) {
  .dash-page { margin: 8px auto; }
  .dash-stats { grid-template-columns: repeat(4, 1fr); }
}
</style>
