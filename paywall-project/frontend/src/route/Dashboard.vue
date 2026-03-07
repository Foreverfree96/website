<template>
  <div class="dash-page" v-if="user.id">
    <h1 class="dash-title">My Dashboard</h1>

    <!-- Stats row -->
    <div class="dash-stats">
      <div class="stat-card">
        <span class="stat-num">{{ publicPosts.length }}</span>
        <span class="stat-label">🌐 Public Posts</span>
      </div>
      <div class="stat-card">
        <span class="stat-num">{{ privatePosts.length }}</span>
        <span class="stat-label">🔒 Private Posts</span>
      </div>
      <div class="stat-card">
        <span class="stat-num">{{ totalLikes }}</span>
        <span class="stat-label">❤️ Total Likes</span>
      </div>
      <div class="stat-card">
        <span class="stat-num">{{ totalComments }}</span>
        <span class="stat-label">💬 Total Comments</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="dash-actions">
      <router-link to="/create-post" class="auth-button dash-btn">+ New Post</router-link>
      <router-link to="/feed" class="auth-button dash-btn">Browse Feed</router-link>
    </div>

    <!-- Posts -->
    <p v-if="loading" class="feed-status">Loading your posts...</p>
    <p v-else-if="!allPosts.length" class="feed-status">No posts yet. <router-link to="/create-post" class="create-link">Create your first post →</router-link></p>

    <template v-else>
      <!-- Private posts -->
      <div v-if="privatePosts.length" class="post-group">
        <h2 class="group-title">🔒 Private Posts</h2>
        <div class="post-list">
          <div v-for="p in privatePosts" :key="p._id" class="dash-post-card private" @click="goToPost(p._id)">
            <div class="dash-post-card__top">
              <span v-if="p.category" class="post-cat">{{ p.category }}</span>
              <span class="post-date">{{ formatDate(p.createdAt) }}</span>
            </div>
            <p v-if="p.title" class="dash-post-title">{{ p.title }}</p>
            <p v-if="p.body" class="dash-post-body">{{ truncate(p.body) }}</p>
            <div class="dash-post-footer">
              <span>❤️ {{ p.likes.length }}</span>
              <span>💬 {{ p.comments.length }}</span>
              <span class="private-tag">🔒 Private</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Public posts -->
      <div v-if="publicPosts.length" class="post-group">
        <h2 class="group-title">🌐 Public Posts</h2>
        <div class="post-list">
          <div v-for="p in publicPosts" :key="p._id" class="dash-post-card" @click="goToPost(p._id)">
            <div class="dash-post-card__top">
              <span v-if="p.category" class="post-cat">{{ p.category }}</span>
              <span class="post-date">{{ formatDate(p.createdAt) }}</span>
            </div>
            <p v-if="p.title" class="dash-post-title">{{ p.title }}</p>
            <p v-if="p.body" class="dash-post-body">{{ truncate(p.body) }}</p>
            <div class="dash-post-footer">
              <span>❤️ {{ p.likes.length }}</span>
              <span>💬 {{ p.comments.length }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { usePosts } from '../composables/usePosts.js';

const router = useRouter();
const { user, getProfile } = useAuth();
const { posts: allPosts, loading, fetchMyPosts } = usePosts();

const publicPosts = computed(() => allPosts.value.filter(p => !p.isPrivate));
const privatePosts = computed(() => allPosts.value.filter(p => p.isPrivate));
const totalLikes = computed(() => allPosts.value.reduce((sum, p) => sum + p.likes.length, 0));
const totalComments = computed(() => allPosts.value.reduce((sum, p) => sum + p.comments.length, 0));

onMounted(async () => {
  await getProfile();
  await fetchMyPosts();
});

const goToPost = (id) => router.push(`/post/${id}`);
const truncate = (text) => text.length > 120 ? text.slice(0, 120) + '...' : text;
const formatDate = (d) => new Date(d).toLocaleDateString();
</script>

<style scoped>
.dash-page {
  max-width: 800px;
  margin: 30px auto;
  padding: 0 16px 60px;
}

.dash-title {
  font-size: 2rem;
  font-weight: 700;
  color: #000;
  margin-bottom: 24px;
}

.dash-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

@media (max-width: 600px) {
  .dash-stats { grid-template-columns: repeat(2, 1fr); }
}

.stat-card {
  background: pink;
  border: 3px solid #000;
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-num {
  font-size: 1.8rem;
  font-weight: 700;
  color: #000;
}

.stat-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #333;
  text-align: center;
}

.dash-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 32px;
}

.dash-btn {
  width: auto;
  height: auto;
  padding: 10px 22px;
  font-size: 0.95rem;
  margin: 0;
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

.dash-post-card {
  background: pink;
  border: 3px solid #000;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.dash-post-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.dash-post-card.private {
  border-color: #7f1d1d;
  background: #000;
}

.dash-post-card.private .dash-post-title {
  color: #ff4444;
}

.dash-post-card.private .dash-post-body {
  color: #cc3333;
}

.dash-post-card.private .dash-post-footer {
  color: #ff4444;
}

.dash-post-card.private .post-date {
  color: #cc3333;
}

.dash-post-card__top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.post-cat {
  background: #000;
  color: pink;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
}

.dash-post-card.private .post-cat {
  background: #7f1d1d;
  color: #ff4444;
}

.post-date {
  margin-left: auto;
  font-size: 0.8rem;
  color: #777;
}

.dash-post-title {
  font-size: 1rem;
  font-weight: 700;
  color: #000;
  margin: 0 0 4px;
}

.dash-post-body {
  font-size: 0.9rem;
  color: #333;
  margin: 0 0 8px;
  line-height: 1.4;
}

.dash-post-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #000;
}

.private-tag {
  margin-left: auto;
  font-size: 0.78rem;
  font-weight: 700;
  color: #555;
}
</style>
