<template>
  <div class="creator-page" v-if="creator">
    <button class="back-btn" @click="router.back()">← Back</button>

    <!-- Profile card: username, category badges, follow button, bio, stats, social links -->
    <div class="creator-card">
      <div class="creator-card__top">
        <div>
          <h1 class="creator-card__username">@{{ creator.username }}</h1>
          <!-- Category badges (Music, Videos, etc.) -->
          <div class="creator-card__badges">
            <span v-for="cat in creator.categories" :key="cat" class="creator-card__category">{{ categoryEmoji[cat] }} {{ cat }}</span>
          </div>
        </div>
        <!-- Follow / Unfollow button — hidden for the profile owner and guests -->
        <button v-if="user.id && user.id !== creator._id" class="follow-btn" :class="{ following: isFollowing }" @click="handleFollow">
          {{ isFollowing ? 'Unfollow' : 'Follow' }}
        </button>
      </div>

      <!-- Bio is hidden for private accounts (unless viewer is admin or owner) -->
      <p v-if="creator.bio && (!creator.isPrivateAccount || user.isAdmin || user.id === creator._id)" class="creator-card__bio">{{ creator.bio }}</p>

      <!-- Follower / Following counts — clickable to open the modal list -->
      <div v-if="!creator.isPrivateAccount || user.isAdmin || user.id === creator._id" class="creator-card__stats">
        <span class="stats-clickable" @click="openModal('followers')"><strong>{{ followerCount }}</strong> Followers</span>
        <span class="stats-clickable" @click="openModal('following')"><strong>{{ creator.followingCount }}</strong> Following</span>
      </div>

      <!-- Social Links row — only shown when at least one URL is set -->
      <div v-if="hasSocialLinks" class="social-links">
        <a v-for="(url, platform) in socialLinks" :key="platform" :href="url" target="_blank" rel="noopener noreferrer" class="social-link">
          {{ platformLabel(platform) }}
        </a>
      </div>
    </div>

    <!-- Private account wall: shown to all non-admin visitors when account is private -->
    <div v-if="creator.isPrivateAccount && !user.isAdmin && user.id !== creator._id" class="private-wall">
      <span class="private-wall__icon">🔒</span>
      <p class="private-wall__msg">This account is private.</p>
    </div>

    <!-- Posts section (hidden for private accounts unless admin/owner) -->
    <template v-else>
    <h2 class="section-title">Posts</h2>
    <p v-if="loading" class="feed-status">Loading posts...</p>
    <p v-else-if="!posts.length" class="feed-status">No posts yet.</p>
    <div v-else class="posts-grid">
      <div v-for="p in posts" :key="p._id" class="post-card" @click="router.push(`/post/${p._id}`)">
        <h3 v-if="p.title" class="post-card__title">{{ p.title }}</h3>
        <p v-if="p.body" class="post-card__body">{{ truncate(p.body) }}</p>
        <!-- .stop prevents the card's click from also firing when interacting with the embed -->
        <MediaEmbed v-if="p.mediaUrl" :mediaUrl="p.mediaUrl" :embedType="p.embedType" @click.stop />
        <div class="post-card__footer">
          <span class="like-wrap">
            <button
              class="like-btn"
              :class="{ 'like-btn--liked': p.likes.includes(user?.id) }"
              @click.stop="handleLike($event, p)"
              :title="user?.id ? (p.likes.includes(user?.id) ? 'Unlike' : 'Like') : 'Log in to like'"
            >{{ p.likes.includes(user?.id) ? '❤️' : '🤍' }}</button>
            <span
              class="like-count"
              :class="{ 'like-count--clickable': p.likes.length > 0 }"
              @click.stop="p.likes.length && showLikers(p._id)"
            >{{ p.likes.length }}</span>
          </span>
          <span
            class="comment-count"
            :class="{ 'comment-count--clickable': p.comments.length > 0 }"
            @click.stop="p.comments.length && showComments(p)"
          >💬 {{ p.comments.length }}</span>
          <span class="post-card__date">{{ formatDate(p.createdAt) }}</span>
        </div>
      </div>
    </div>
    </template>
  </div>

  <p v-else-if="pageLoading" class="feed-status">Loading...</p>
  <p v-else class="feed-status">Creator not found.</p>

  <!-- Followers / Following Modal -->
  <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
    <div class="modal-box">
      <div class="modal-header">
        <h2 class="modal-title">{{ modalType === 'followers' ? 'Followers' : 'Following' }}</h2>
        <button class="modal-close" @click="showModal = false">✕</button>
      </div>
      <div v-if="!modalList.length" class="modal-empty">No users yet.</div>
      <div v-else class="modal-list">
        <!-- Each row navigates to that user's creator profile -->
        <div v-for="u in modalList" :key="u._id" class="modal-user" @click="goToUser(u.username)">
          @{{ u.username }}
        </div>
      </div>
    </div>
  </div>

  <!-- Comments preview modal -->
  <div v-if="commentsModal.open" class="modal-overlay" @click.self="commentsModal.open = false">
    <div class="modal-box comments-modal-box">
      <div class="modal-header">
        <h2 class="modal-title">💬 Comments</h2>
        <button class="modal-close" @click="commentsModal.open = false">✕</button>
      </div>
      <p v-if="commentsModal.loading" class="modal-empty">Loading...</p>
      <div v-else-if="!commentsModal.list.length" class="modal-empty">No comments yet.</div>
      <div v-else class="comments-preview-list">
        <div v-for="c in commentsModal.list" :key="c._id" class="comment-preview">
          <span class="comment-preview__author">@{{ c.author?.username || 'user' }}</span>
          <p class="comment-preview__body">{{ c.body }}</p>
          <span class="comment-preview__time">{{ formatDate(c.createdAt) }}</span>
        </div>
      </div>
      <button v-if="!commentsModal.loading" class="view-all-btn" @click="router.push(`/post/${commentsModal.postId}`)">
        View all {{ commentsModal.total }} comment{{ commentsModal.total !== 1 ? 's' : '' }} →
      </button>
    </div>
  </div>

  <!-- Liked-by modal -->
  <div v-if="likersModal.open" class="modal-overlay" @click.self="likersModal.open = false">
    <div class="modal-box">
      <div class="modal-header">
        <h2 class="modal-title">❤️ Liked by</h2>
        <button class="modal-close" @click="likersModal.open = false">✕</button>
      </div>
      <p v-if="likersModal.loading" class="modal-empty">Loading...</p>
      <div v-else-if="!likersModal.list.length" class="modal-empty">No likes yet.</div>
      <div v-else class="modal-list">
        <div v-for="u in likersModal.list" :key="u._id" class="modal-user" @click="goToUser(u.username)">
          @{{ u.username }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * CreatorProfile.vue — Public creator profile page
 *
 * Displays a creator's profile card (username, categories, bio, follower /
 * following counts, social links) and a list of their public posts.
 * Private accounts show a lock wall instead of content to non-admin visitors
 * who do not own the profile.
 *
 * Follower and following counts are clickable and open a modal that lists
 * the relevant users. Each user row in the modal links to their own profile.
 *
 * The follow/unfollow button is only shown to logged-in users who are not
 * the profile owner. Guests are redirected to /login on click.
 */
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { usePosts } from '../composables/usePosts.js';
import { useAuth } from '../composables/useAuth.js';
import MediaEmbed from '../components/MediaEmbed.vue';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

// Base URL for the user API endpoints.
const API_USERS = import.meta.env.VITE_API_URL + '/api/users';

const route = useRoute();
const router = useRouter();

// ─── COMPOSABLES ─────────────────────────────────────────────────────────────

// `posts`      — reactive array; populated with the creator's posts after fetch.
// `loading`    — true while posts are being fetched.
// `fetchPosts` — loads all posts then we filter to just this creator's.
const { posts, loading, fetchPosts, toggleLike } = usePosts();

// `user` — the currently logged-in visitor (may be empty for guests).
const { user } = useAuth();

// ─── CATEGORY EMOJI MAP ──────────────────────────────────────────────────────

// Maps each content category to a representative emoji for the badge display.
const categoryEmoji = { 'Music': '🎵', 'Videos': '🎬', 'Streamer': '🎮', 'Pictures': '📷', 'Blogger / Writer': '✍️' };

// ─── PROFILE STATE ───────────────────────────────────────────────────────────

// Populated from the API; null while loading or if the profile was not found.
const creator = ref(null);

// True while the profile API call is in-flight.
const pageLoading = ref(true);

// Whether the currently logged-in user follows this creator.
const isFollowing = ref(false);

// Kept as a separate ref so it can be updated optimistically without refetching
// the full creator object after a follow/unfollow action.
const followerCount = ref(0);

// ─── COMPUTED SOCIAL LINKS ───────────────────────────────────────────────────

/**
 * hasSocialLinks
 * Returns true when at least one social link URL is non-empty.
 * Used to conditionally render the social links row.
 */
const hasSocialLinks = computed(() =>
  creator.value && Object.values(creator.value.socialLinks || {}).some(v => v)
);

/**
 * socialLinks
 * Returns only the non-empty entries from the creator's socialLinks object,
 * so the template never renders an empty anchor tag.
 */
const socialLinks = computed(() =>
  Object.fromEntries(Object.entries(creator.value?.socialLinks || {}).filter(([, v]) => v))
);

/**
 * platformLabel
 * Maps a socialLinks key (e.g. 'youtube') to a display label with icon emoji.
 * Falls back to the raw key if the platform is not in the lookup table.
 */
const platformLabel = (p) => ({
  youtube: '▶ YouTube', instagram: '📷 Instagram', twitch: '🎮 Twitch',
  tiktok: '🎵 TikTok', soundcloud: '🎵 SoundCloud', facebook: '📘 Facebook',
}[p] || p);

// ─── LIFECYCLE ───────────────────────────────────────────────────────────────

/**
 * onMounted — loads the creator's profile then their posts.
 *
 * Posts are fetched globally via the usePosts composable and then
 * filtered client-side to only include posts belonging to this creator.
 * A dedicated per-creator endpoint would be more efficient, but this
 * approach reuses the existing composable without requiring a new route.
 *
 * Sets creator to null on any API error so the "not found" message renders.
 */
const loadCreator = async (username) => {
  creator.value = null;
  pageLoading.value = true;
  showModal.value = false;
  try {
    const res = await axios.get(`${API_USERS}/creator/${username}`);
    creator.value = res.data;
    followerCount.value = res.data.followerCount;

    if (user.value.id) {
      isFollowing.value = res.data.followers?.some(f => f._id === user.value.id);
    }

    await fetchPosts('', 1);
    posts.value = posts.value.filter(p => p.author.username === username);
  } catch {
    creator.value = null;
  } finally {
    pageLoading.value = false;
  }
};

onMounted(() => loadCreator(route.params.username));

// Re-load when navigating between creator profiles without a full page reload
watch(() => route.params.username, (newUsername) => {
  if (newUsername) loadCreator(newUsername);
});

// ─── FOLLOW / UNFOLLOW ───────────────────────────────────────────────────────

/**
 * handleFollow
 * Toggles follow state for the currently logged-in user.
 * Redirects to /login if the visitor is not authenticated.
 * Updates isFollowing and followerCount from the API response so the UI
 * reflects the new state immediately without a full profile reload.
 */
const handleFollow = async () => {
  if (!user.value.id) { router.push('/login'); return; }
  const res = await axios.post(`${API_USERS}/creator/${creator.value.username}/follow`);
  isFollowing.value = res.data.following;
  followerCount.value = res.data.followerCount;
};

// ─── FOLLOWERS / FOLLOWING MODAL ─────────────────────────────────────────────

// Whether the modal is currently visible.
const showModal = ref(false);

// Which list is being displayed: 'followers' or 'following'.
const modalType = ref('followers');

/**
 * modalList
 * Returns the appropriate user list from the creator object based on modalType.
 * Returns an empty array while the creator is loading to avoid template errors.
 */
const modalList = computed(() => {
  if (!creator.value) return [];
  return modalType.value === 'followers' ? creator.value.followers : creator.value.following;
});

// Open the modal and set which list to show ('followers' or 'following').
const openModal = (type) => { modalType.value = type; showModal.value = true; };

// Navigate to a user's profile and close the modal so it doesn't persist.
const goToUser = (username) => { showModal.value = false; router.push(`/creator/${username}`); };

// ─── DISPLAY HELPERS ─────────────────────────────────────────────────────────

// Truncate post body to 150 chars for the card preview.
const truncate = (text) => text.length > 150 ? text.slice(0, 150) + '...' : text;

// Format an ISO date string as a locale short date (e.g. "3/13/2026").
const formatDate = (d) => new Date(d).toLocaleDateString();

const handleLike = async (e, p) => {
  e.stopPropagation();
  if (!user.value?.id) return;
  try {
    const res = await toggleLike(p._id);
    p.likes = res.liked
      ? [...p.likes, user.value.id]
      : p.likes.filter(id => id !== user.value.id);
  } catch {}
};

const commentsModal = ref({ open: false, loading: false, list: [], postId: null, total: 0 });
const showComments = async (p) => {
  commentsModal.value = { open: true, loading: true, list: [], postId: p._id, total: p.comments.length };
  try {
    const res = await axios.get(`${API_USERS.replace('/users', '')}/posts/${p._id}`);
    const all = res.data.comments || [];
    commentsModal.value.list = all.slice(-3).reverse();
    commentsModal.value.total = all.length;
  } catch {}
  commentsModal.value.loading = false;
};

const likersModal = ref({ open: false, loading: false, list: [] });
const showLikers = async (postId) => {
  likersModal.value = { open: true, loading: true, list: [] };
  try {
    const res = await axios.get(`${API_USERS.replace('/users', '')}/posts/${postId}/likes`);
    likersModal.value.list = res.data.likes;
  } catch {}
  likersModal.value.loading = false;
};
</script>

<style scoped>
.creator-page {
  max-width: 800px;
  margin: 30px auto;
  padding: 0 16px 60px;
}

.back-btn {
  background: #000;
  color: pink;
  border: 3px solid #14532d;
  border-radius: 8px;
  padding: 8px 18px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  margin-bottom: 16px;
  transition: transform 0.2s ease;
}
.back-btn:hover { transform: translateY(-2px); color: rgb(125,190,157); }

.feed-status {
  text-align: center;
  font-size: 1.1rem;
  font-weight: 600;
  color: #000;
  margin-top: 40px;
}

.creator-card {
  background: pink;
  border: 3px solid #000;
  border-radius: 14px;
  padding: 24px;
  margin-bottom: 28px;
}

.creator-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.creator-card__username {
  font-size: 1.6rem;
  font-weight: 700;
  color: #000;
  margin: 0 0 6px;
  word-break: break-word;
  overflow-wrap: anywhere;
  max-width: 100%;
}

.creator-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.creator-card__category {
  background: #000;
  color: pink;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
}

.follow-btn {
  background: #000;
  color: pink;
  border: 3px solid #14532d;
  border-radius: 8px;
  padding: 8px 20px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.follow-btn:hover { transform: translateY(-2px); color: rgb(125,190,157); }
/* Red border when already following indicates the destructive unfollow action */
.follow-btn.following { border-color: #7f1d1d; }

.creator-card__bio {
  color: #1f2937;
  font-size: 1rem;
  line-height: 1.5;
  margin: 0 0 12px;
  text-align: left;
}

.creator-card__stats {
  display: flex;
  gap: 20px;
  font-size: 0.95rem;
  color: #000;
  margin-bottom: 14px;
}

.stats-clickable {
  cursor: pointer;
  text-decoration: underline;
  transition: color 0.2s;
}
.stats-clickable:hover { color: #14532d; }

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
  padding: 24px;
  width: 100%;
  max-width: 360px;
  max-height: 70vh;
  overflow-y: auto;
  overflow-x: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.modal-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #000;
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.2rem;
  font-weight: 700;
  cursor: pointer;
  color: #7f1d1d;
}

.modal-empty {
  color: #555;
  font-size: 0.95rem;
  text-align: center;
}

.modal-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modal-user {
  background: #000;
  color: pink;
  border-radius: 8px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.95rem;
  transition: transform 0.15s;
}
.modal-user:hover { transform: translateY(-2px); color: rgb(125, 190, 157); }

.social-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.social-link {
  background: #000;
  color: pink;
  border: 2px solid #14532d;
  border-radius: 20px;
  padding: 6px 14px;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  transition: transform 0.2s ease;
}

.social-link:hover { transform: translateY(-2px); color: rgb(125,190,157); }

/* ── Responsive ── */

/* Large tablet landscape */
@media (max-width: 1024px) {
  .creator-page { max-width: 700px; }
}

/* Tablet portrait */
@media (max-width: 768px) {
  .creator-page { max-width: 100%; padding: 0 14px 50px; margin: 20px auto; }
  .creator-card { padding: 18px; border-radius: 10px; }
  .creator-card__username { font-size: 1.4rem; }
  .modal-box { max-width: calc(100% - 32px); padding: 18px; }
}

/* Large phone */
@media (max-width: 600px) {
  .creator-page { padding: 0 10px 44px; margin: 14px auto; }
  .creator-card { padding: 14px; }
  .creator-card__top { flex-wrap: wrap; gap: 10px; }
  .creator-card__username { font-size: 1.3rem; }
  .follow-btn { width: 100%; text-align: center; justify-content: center; }
  .creator-card__stats { gap: 14px; font-size: 0.9rem; }
  .social-links { gap: 6px; }
  .social-link { padding: 5px 12px; font-size: 0.8rem; }
  .post-card { padding: 14px; }
  .post-card__title { font-size: 1rem; }
  .post-card__body { font-size: 0.9rem; }
  .post-card__footer { font-size: 0.95rem; gap: 8px; }
}

/* Phone */
@media (max-width: 480px) {
  .creator-page { padding: 0 8px 40px; }
  .creator-card { padding: 12px; border-radius: 8px; }
  .creator-card__username { font-size: 1.2rem; }
  .creator-card__category { font-size: 0.7rem; padding: 2px 8px; }
  .post-card { padding: 12px; border-radius: 10px; }
  .modal-box { padding: 16px; border-radius: 10px; }
  .modal-title { font-size: 1.1rem; }
  .modal-user { padding: 9px 12px; font-size: 0.9rem; }
}

/* Small phone (360px) */
@media (max-width: 360px) {
  .creator-card__badges { gap: 4px; }
  .creator-card__stats { flex-direction: column; gap: 6px; align-items: flex-start; }
  .creator-card__username { font-size: 1.1rem; }
  .modal-user { padding: 8px 11px; font-size: 0.85rem; }
  .back-btn { padding: 6px 14px; font-size: 0.88rem; }
}

/* Very small phone (320px) */
@media (max-width: 320px) {
  .creator-page { padding: 0 6px 36px; }
  .creator-card { padding: 10px; }
  .creator-card__username { font-size: 1rem; }
}

/* Landscape phone */
@media (max-height: 500px) and (orientation: landscape) {
  .creator-page { margin: 8px auto; }
}

.private-wall {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 20px;
  background: pink;
  border: 3px solid #000;
  border-radius: 14px;
  margin-top: 8px;
}
.private-wall__icon { font-size: 2.5rem; }
.private-wall__msg  { font-size: 1rem; font-weight: 700; color: #000; margin: 0; }

.section-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: #000;
  margin-bottom: 16px;
}

.posts-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.post-card {
  background: pink;
  border: 3px solid #000;
  border-radius: 14px;
  padding: 18px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.post-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 14px rgba(0,0,0,0.3);
}

.post-card__title {
  font-size: 1.1rem;
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

.post-card__footer {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1rem;
  font-weight: 600;
  color: #000;
  margin-top: 14px;
}

.like-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0;
  background: #f3f4f6;
  border: 2px solid #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
}
.like-btn {
  background: none;
  border: none;
  padding: 6px 10px;
  font-size: 1.05rem;
  font-weight: 700;
  color: #000;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  transition: background 0.15s, transform 0.15s;
  line-height: 1;
}
.like-btn:hover { background: #e5e7eb; transform: scale(1.15); }
.like-btn--liked { color: #e11d48; }
.like-count { font-weight: 700; font-size: 0.95rem; padding: 6px 16px 6px 4px; line-height: 1; background: #fff; color: #000; }
.like-count--clickable { cursor: pointer; }
.like-count--clickable:hover { color: #000; }

.comment-count {
  font-weight: 700;
  font-size: 1.05rem;
  background: #f3f4f6;
  border: 2px solid #e5e7eb;
  border-radius: 999px;
  padding: 6px 18px;
  line-height: 1;
}
.comment-count--clickable { cursor: pointer; }
.comment-count--clickable:hover { background: #e5e7eb; border-color: #000; color: #000; }

@media (hover: none) {
  .like-count--clickable:hover { color: inherit; }
  .comment-count--clickable:hover { background: #f3f4f6; border-color: #e5e7eb; color: inherit; }
}

@media (max-width: 640px) {
  .like-btn { padding: 8px 12px; font-size: 1.1rem; }
  .like-count { padding: 8px 18px 8px 4px; font-size: 1rem; }
  .comment-count { padding: 8px 20px; font-size: 1rem; }
}

.comments-modal-box { max-width: 460px; }
.comments-preview-list { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; max-height: 40vh; }
.comment-preview { border: 2px solid #e5e7eb; border-radius: 10px; padding: 10px 14px; display: flex; flex-direction: column; gap: 4px; }
.comment-preview__author { font-weight: 700; font-size: 0.85rem; color: #7c3aed; }
.comment-preview__body { font-size: 0.92rem; margin: 0; line-height: 1.4; word-break: break-word; }
.comment-preview__time { font-size: 0.78rem; color: #888; }
.view-all-btn { margin-top: 4px; padding: 8px 16px; background: #000; color: #fff; border: none; border-radius: 8px; font-weight: 700; font-size: 0.9rem; cursor: pointer; align-self: flex-start; transition: background 0.15s; }
.view-all-btn:hover { background: #374151; }

.post-card__date {
  margin-left: auto;
  font-weight: 400;
  color: #555;
}
</style>
