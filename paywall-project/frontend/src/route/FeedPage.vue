<template>
  <div class="feed-page">
    <!-- Header -->
    <div class="feed-header">
      <h1 class="feed-title">Creator Hub</h1>
      <router-link v-if="user.id" to="/create-post" class="auth-button create-btn">+ New Post</router-link>
    </div>

    <!-- Category Tabs -->
    <div class="category-tabs">
      <button v-for="cat in categories" :key="cat"
        :class="['tab-btn', { active: activeCategory === cat }]"
        @click="selectCategory(cat)">
        {{ cat || 'All' }}
      </button>
    </div>

    <!-- Loading -->
    <p v-if="loading" class="feed-status">Loading...</p>

    <!-- Empty -->
    <p v-else-if="!posts.length" class="feed-status">No posts yet. Be the first to share!</p>

    <!-- Posts -->
    <div v-else class="posts-grid">
      <div v-for="p in posts" :key="p._id" class="post-card" @click="goToPost(p._id)">
        <div class="post-card__meta">
          <span v-if="p.author" class="post-card__author" @click.stop="goToCreator(p.author.username)">
            @{{ p.author.username }}
          </span>
          <span v-if="p.category" class="post-card__category">{{ p.category }}</span>
        </div>
        <h2 v-if="p.title" class="post-card__title">{{ p.title }}</h2>
        <p v-if="p.body" class="post-card__body">{{ truncate(p.body) }}</p>
        <img v-if="p.imageUrl" :src="p.imageUrl" class="post-image" alt="Post image" @click.stop />
        <MediaEmbed v-else-if="p.mediaUrl" :mediaUrl="p.mediaUrl" :embedType="p.embedType" @click.stop />
        <div class="post-card__footer">
          <span>❤️ {{ p.likes.length }}</span>
          <span>💬 {{ p.comments.length }}</span>
          <span class="post-card__date">{{ formatDate(p.createdAt) }}</span>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination">
      <button class="auth-button pag-btn" :disabled="page === 1" @click="changePage(page - 1)">← Prev</button>
      <span class="page-info">{{ page }} / {{ totalPages }}</span>
      <button class="auth-button pag-btn" :disabled="page === totalPages" @click="changePage(page + 1)">Next →</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePosts } from '../composables/usePosts.js';
import { useAuth } from '../composables/useAuth.js';
import MediaEmbed from '../components/MediaEmbed.vue';

const { posts, loading, fetchPosts } = usePosts();
const { user } = useAuth();
const router = useRouter();

const categories = ['', 'Music', 'Videos', 'Streamer', 'Pictures', 'Blogger / Writer'];
const activeCategory = ref('');
const page = ref(1);
const totalPages = ref(1);

const load = async () => {
  const res = await fetchPosts(activeCategory.value, page.value);
  if (res) totalPages.value = res.pages;
};

const selectCategory = (cat) => {
  activeCategory.value = cat;
  page.value = 1;
  load();
};

const changePage = (p) => {
  page.value = p;
  load();
};

const goToPost = (id) => router.push(`/post/${id}`);
const goToCreator = (username) => router.push(`/creator/${username}`);

const truncate = (text) => text.length > 200 ? text.slice(0, 200) + '...' : text;
const formatDate = (d) => new Date(d).toLocaleDateString();

onMounted(load);
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

.tab-btn:hover, .tab-btn.active {
  background: #14532d;
  color: #fff;
}

.feed-status {
  text-align: center;
  font-size: 1.1rem;
  font-weight: 600;
  color: #000;
  margin-top: 40px;
}

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

.post-card__footer {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #000;
}

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

.pag-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.page-info {
  font-weight: 600;
  color: #000;
}
</style>
