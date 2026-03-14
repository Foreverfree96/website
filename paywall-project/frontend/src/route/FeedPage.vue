<template>
  <div class="feed-page">

    <!-- ── Page header ── -->
    <div class="feed-header">
      <h1 class="feed-title">Creator Hub</h1>
      <!-- Shortcut to create a new post; only shown to logged-in users -->
      <router-link v-if="user.id" to="/create-post" class="auth-button create-btn">+ New Post</router-link>
    </div>

    <!-- ── Category filter tabs ── -->
    <!--
      Each tab calls selectCategory, which resets to page 1 and re-fetches.
      The empty string represents the "All" tab (no category filter).
      The active tab is highlighted via the .active class.
    -->
    <div class="category-tabs">
      <button v-for="cat in categories" :key="cat"
        :class="['tab-btn', { active: activeCategory === cat }]"
        @click="selectCategory(cat)">
        <!--
          Empty string = "All" — show literal text.
          Any other category = prefix with its emoji from the lookup map.
        -->
        {{ cat ? (categoryEmoji[cat] + ' ' + cat) : 'All' }}
      </button>
    </div>

    <!-- ── Feed content states ── -->

    <!-- Loading spinner / message while the API call is in-flight -->
    <p v-if="loading" class="feed-status">Loading...</p>

    <!-- Empty state — shown after a successful load with zero results -->
    <p v-else-if="!posts.length" class="feed-status">No posts yet. Be the first to share!</p>

    <!-- Post card list — rendered once data is ready and non-empty -->
    <div v-else class="posts-grid">
      <div v-for="p in posts" :key="p._id" class="post-card" @click="goToPost(p._id)">

        <!-- Meta row: author handle + category badge -->
        <div class="post-card__meta">
          <!--
            .stop prevents the card's own click handler from firing when the
            user intends to navigate to the author's profile, not the post.
          -->
          <span v-if="p.author" class="post-card__author" @click.stop="goToCreator(p.author.username)">
            @{{ p.author.username }}
          </span>
          <span v-if="p.category" class="post-card__category">{{ categoryEmoji[p.category] }} {{ p.category }}</span>
        </div>

        <!-- Post title (optional field — not all posts have one) -->
        <h2 v-if="p.title" class="post-card__title">{{ p.title }}</h2>

        <!--
          Body preview — truncated to 200 chars in feed cards.
          Full text is shown on the individual PostPage.
        -->
        <p v-if="p.body" class="post-card__body">{{ truncate(p.body) }}</p>

        <!--
          Media display priority:
            1. imageUrl — a direct image (for Pictures category posts).
            2. mediaUrl — a platform embed (YouTube, Spotify, etc.).
          Image click navigates to the post; embed gets .stop so its controls work.
        -->
        <img v-if="p.imageUrl" :src="p.imageUrl" class="post-image clickable-img" alt="Post image" @click.stop="goToPost(p._id)" />
        <MediaEmbed v-else-if="p.mediaUrl" :mediaUrl="p.mediaUrl" :embedType="p.embedType" @click.stop />

        <!-- Footer: like count, comment count, and formatted creation date -->
        <div class="post-card__footer">
          <span>❤️ {{ p.likes.length }}</span>
          <span>💬 {{ p.comments.length }}</span>
          <!-- Date is pushed to the far right via margin-left: auto on .post-card__date -->
          <span class="post-card__date">{{ formatDate(p.createdAt) }}</span>
        </div>

      </div>
    </div>

    <!-- ── Pagination ── -->
    <!--
      Only rendered when the total result set spans more than one page.
      The Prev / Next buttons are disabled at the boundaries to prevent
      out-of-range API requests.
    -->
    <div v-if="totalPages > 1" class="pagination">
      <button class="auth-button pag-btn" :disabled="page === 1" @click="changePage(page - 1)">← Prev</button>
      <span class="page-info">{{ page }} / {{ totalPages }}</span>
      <button class="auth-button pag-btn" :disabled="page === totalPages" @click="changePage(page + 1)">Next →</button>
    </div>

  </div>
</template>

<script setup>
/**
 * FeedPage.vue — Public post feed
 *
 * Displays a paginated, category-filterable list of all public posts.
 * Key behaviours:
 *
 *  - On mount, checks for a ?category= query parameter so the home-page
 *    category cards can deep-link directly into a pre-filtered view.
 *  - Category tabs reset the page counter to 1 to avoid showing an
 *    out-of-range page when switching between categories.
 *  - Each post card is fully clickable (navigates to PostPage) but the
 *    author handle and any embedded media use .stop to intercept clicks
 *    without triggering the card's own navigation.
 *  - Media display prefers a direct imageUrl over a platform embed (mediaUrl).
 */
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { usePosts } from '../composables/usePosts.js';
import { useAuth } from '../composables/useAuth.js';
import MediaEmbed from '../components/MediaEmbed.vue';

// ─── COMPOSABLES ──────────────────────────────────────────────────────────────

/**
 * usePosts composable:
 *   posts      — reactive array of post objects, updated after each fetchPosts call.
 *   loading    — true while the network request is in-flight.
 *   fetchPosts — async function(category, page) → { pages } that fetches posts
 *                filtered by the given category (empty = all) at the given page,
 *                populates `posts`, and returns pagination metadata.
 */
const { posts, loading, fetchPosts } = usePosts();

/**
 * useAuth composable:
 *   user — reactive user object; `user.id` is checked to conditionally
 *          show the "+ New Post" button only for authenticated users.
 */
const { user } = useAuth();

const router = useRouter();

/**
 * useRoute provides access to the current route's query parameters.
 * Used in onMounted to read an incoming ?category= value.
 */
const route = useRoute();

// ─── CATEGORY STATE ───────────────────────────────────────────────────────────

/**
 * categories
 * Full list of selectable filter tabs.
 * The empty string at index 0 represents "All" (no category filter applied).
 * The values must match the category strings stored in the database.
 */
const categories = ['', 'Music', 'Videos', 'Streamer', 'Pictures', 'Blogger / Writer'];

/**
 * categoryEmoji
 * Lookup map from category name → display emoji.
 * Used both in the tab button labels and the category badge on each post card.
 */
const categoryEmoji = {
  'Music':           '🎵',
  'Videos':          '🎬',
  'Streamer':        '🎮',
  'Pictures':        '📷',
  'Blogger / Writer':'✍️',
};

/**
 * activeCategory
 * The currently selected category filter.
 * Empty string means no filter (show all categories).
 * Changing this triggers a fresh load from page 1.
 */
const activeCategory = ref('');

// ─── PAGINATION STATE ─────────────────────────────────────────────────────────

/**
 * page
 * Current page number, 1-indexed.
 * Passed to fetchPosts and incremented / decremented by changePage.
 */
const page = ref(1);

/**
 * totalPages
 * Total number of pages for the current category + search combination.
 * Returned by the API and used to disable pagination buttons and hide the
 * pagination row entirely when there is only one page.
 */
const totalPages = ref(1);

// ─── DATA LOADING ─────────────────────────────────────────────────────────────

/**
 * load
 * Central data-fetch function.  Calls fetchPosts with the current category
 * and page values, then updates totalPages from the returned metadata.
 * All category and pagination helpers call this after updating their state.
 */
const load = async () => {
  const res = await fetchPosts(activeCategory.value, page.value);
  if (res) totalPages.value = res.pages;
};

/**
 * selectCategory
 * Called when the user clicks a category tab button.
 * Updates the active category, resets to page 1 (a new filter always starts
 * from the beginning), and triggers a fresh load.
 */
const selectCategory = (cat) => {
  activeCategory.value = cat;
  page.value = 1;
  load();
};

/**
 * changePage
 * Called by the Prev / Next pagination buttons.
 * Updates the page counter and triggers a fresh load for that page.
 * The buttons are disabled at boundaries so p will always be in range.
 */
const changePage = (p) => {
  page.value = p;
  load();
};

// ─── NAVIGATION HELPERS ───────────────────────────────────────────────────────

/**
 * goToPost
 * Navigates to the full post detail page for the given post ID.
 * Bound to the card's root @click handler.
 */
const goToPost = (id) => router.push(`/post/${id}`);

/**
 * goToCreator
 * Navigates to the creator's public profile page.
 * Bound to the author handle span with @click.stop so clicking the author
 * name does NOT also trigger the card's goToPost navigation.
 */
const goToCreator = (username) => router.push(`/creator/${username}`);

// ─── DISPLAY HELPERS ──────────────────────────────────────────────────────────

/**
 * truncate
 * Limits body text to 200 characters in feed cards to keep the list scannable.
 * The full text is available on the individual PostPage.
 */
const truncate = (text) => text.length > 200 ? text.slice(0, 200) + '...' : text;

/**
 * formatDate
 * Converts an ISO 8601 date string into the user's locale short date format
 * (e.g. "3/13/2026" in en-US).
 */
const formatDate = (d) => new Date(d).toLocaleDateString();

// ─── LIFECYCLE ────────────────────────────────────────────────────────────────

/**
 * onMounted
 * Runs once after the component is inserted into the DOM.
 *
 * Checks for a ?category= query parameter in the URL so that clicks on the
 * home-page category cards (which navigate to /feed?category=Music etc.)
 * automatically pre-select the correct tab before the first fetch.
 *
 * Then kicks off the initial data load.
 */
onMounted(() => {
  // Pre-select category from query param if present (e.g. from home page cards).
  if (route.query.category) activeCategory.value = route.query.category;
  load();
});
</script>

<style scoped>
.feed-page {
  max-width: 800px;
  margin: 30px auto;
  padding: 0 16px 60px;
}

.feed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.feed-title {
  font-size: 2rem;
  font-weight: 700;
  color: #000;
}

.create-btn {
  width: auto;
  height: auto;
  padding: 10px 20px;
  font-size: 1rem;
  margin: 0;
}

/* Horizontal scrollable row of category filter buttons */
.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 24px;
}

.tab-btn {
  padding: 8px 16px;
  border-radius: 20px;
  border: 3px solid #14532d;
  background: #000;
  color: pink;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}
/* Active and hovered tabs share the same filled green style */
.tab-btn:hover, .tab-btn.active {
  background: #14532d;
  color: #fff;
}

/* Loading / empty state text */
.feed-status {
  text-align: center;
  font-size: 1.1rem;
  font-weight: 600;
  color: #000;
  margin-top: 40px;
}

/* Vertical stack of post cards */
.posts-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.post-card {
  background: pink;
  border: 3px solid #000;
  border-radius: 14px;
  padding: 20px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
/* Lift the card on hover for a tactile feel */
.post-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 14px rgba(0,0,0,0.3);
}

.post-card__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.post-card__author {
  font-weight: 700;
  color: #000;
  font-size: 0.95rem;
  cursor: pointer;
  text-decoration: underline;
}
.post-card__author:hover {
  color: #14532d;
}

/* Pill badge showing the post's category */
.post-card__category {
  background: #000;
  color: pink;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
}

.post-card__title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #000;
  margin: 0 0 8px;
}

.post-card__body {
  color: #1f2937;
  font-size: 0.95rem;
  line-height: 1.5;
  margin: 0 0 8px;
  text-align: left;
}

/* Likes, comments, and date row at the bottom of each card */
.post-card__footer {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #000;
}
/* Date is pushed to the right end of the footer row */
.post-card__date {
  margin-left: auto;
  font-weight: 400;
  color: #555;
}

.post-image {
  width: 100%;
  max-height: 400px;
  object-fit: contain;
  border-radius: 10px;
  margin-top: 10px;
}

/* Centered prev / next / page indicator row */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 32px;
}

.pag-btn {
  width: auto;
  height: auto;
  padding: 8px 20px;
  font-size: 0.95rem;
  margin: 0;
}
/* Disabled buttons lose interactivity and visually dim */
.pag-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.page-info {
  font-weight: 600;
  color: #000;
}

/* ── Responsive ── */

/* Large tablet landscape */
@media (max-width: 1024px) {
  .feed-page { max-width: 700px; }
}

/* Tablet portrait */
@media (max-width: 768px) {
  .feed-page { max-width: 100%; padding: 0 14px 50px; margin: 20px auto; }
  .feed-title { font-size: 1.75rem; }
  .feed-header { margin-bottom: 16px; }
  /* Tabs scroll horizontally rather than wrapping on narrow screens */
  .category-tabs { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 6px; margin-bottom: 18px; gap: 6px; }
  .tab-btn { flex-shrink: 0; padding: 7px 14px; font-size: 0.88rem; }
  .post-card { padding: 16px; }
  .post-card__title { font-size: 1.1rem; }
  .post-image { max-height: 320px; }
  .pag-btn { padding: 8px 16px !important; }
}

/* Large phone */
@media (max-width: 600px) {
  .feed-page { padding: 0 10px 46px; margin: 14px auto; }
  .feed-title { font-size: 1.5rem; }
  .feed-header { flex-wrap: wrap; gap: 8px; }
  .create-btn { padding: 8px 14px !important; font-size: 0.88rem !important; }
  .post-card { padding: 14px; border-radius: 10px; }
  .post-card__body { font-size: 0.9rem; }
  .post-card__footer { gap: 10px; font-size: 0.85rem; flex-wrap: wrap; }
  .post-image { max-height: 260px; }
  .pagination { gap: 10px; margin-top: 24px; }
  .pag-btn { padding: 7px 14px !important; font-size: 0.87rem !important; }
  .page-info { font-size: 0.9rem; }
}

/* Phone */
@media (max-width: 480px) {
  .feed-page { padding: 0 8px 42px; }
  .feed-title { font-size: 1.3rem; }
  .post-card { padding: 12px; }
  .post-card__title { font-size: 1rem; }
  .post-card__meta { flex-wrap: wrap; gap: 6px; }
  .post-card__footer { font-size: 0.8rem; gap: 8px; }
  .tab-btn { padding: 5px 11px; font-size: 0.8rem; }
  .post-image { max-height: 220px; }
}

/* Small phone (360px) */
@media (max-width: 360px) {
  .feed-title { font-size: 1.2rem; }
  .post-card { padding: 10px; }
  .post-card__author { font-size: 0.88rem; }
  .post-card__footer { gap: 6px; }
  .tab-btn { padding: 4px 9px; font-size: 0.75rem; }
  .pagination { gap: 8px; }
  .pag-btn { padding: 6px 10px !important; font-size: 0.82rem !important; }
}

/* Very small phone (320px) */
@media (max-width: 320px) {
  .feed-page { padding: 0 6px 40px; }
  .feed-title { font-size: 1.1rem; }
  .post-card { padding: 8px; border-radius: 8px; }
}

/* Landscape phone — reduce vertical spacing */
@media (max-height: 500px) and (orientation: landscape) {
  .feed-page { margin: 10px auto; }
  .feed-header { margin-bottom: 12px; }
  .category-tabs { margin-bottom: 12px; }
}
</style>
