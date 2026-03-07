<template>
  <div class="creator-page" v-if="creator">
    <button class="back-btn" @click="router.back()">← Back</button>
    <!-- Profile Card -->
    <div class="creator-card">
      <div class="creator-card__top">
        <div>
          <h1 class="creator-card__username">@{{ creator.username }}</h1>
          <div class="creator-card__badges">
            <span v-for="cat in creator.categories" :key="cat" class="creator-card__category">{{ cat }}</span>
          </div>
        </div>
        <button v-if="user.id && user.id !== creator._id" class="follow-btn" :class="{ following: isFollowing }" @click="handleFollow">
          {{ isFollowing ? 'Unfollow' : 'Follow' }}
        </button>
      </div>

      <p v-if="creator.bio" class="creator-card__bio">{{ creator.bio }}</p>

      <div class="creator-card__stats">
        <span><strong>{{ followerCount }}</strong> Followers</span>
        <span><strong>{{ creator.followingCount }}</strong> Following</span>
      </div>

      <!-- Social Links -->
      <div v-if="hasSocialLinks" class="social-links">
        <a v-for="(url, platform) in socialLinks" :key="platform" :href="url" target="_blank" rel="noopener noreferrer" class="social-link">
          {{ platformLabel(platform) }}
        </a>
      </div>
    </div>

    <!-- Posts -->
    <h2 class="section-title">Posts</h2>
    <p v-if="loading" class="feed-status">Loading posts...</p>
    <p v-else-if="!posts.length" class="feed-status">No posts yet.</p>
    <div v-else class="posts-grid">
      <div v-for="p in posts" :key="p._id" class="post-card" @click="router.push(`/post/${p._id}`)">
        <h3 v-if="p.title" class="post-card__title">{{ p.title }}</h3>
        <p v-if="p.body" class="post-card__body">{{ truncate(p.body) }}</p>
        <MediaEmbed v-if="p.mediaUrl" :mediaUrl="p.mediaUrl" :embedType="p.embedType" @click.stop />
        <div class="post-card__footer">
          <span>❤️ {{ p.likes.length }}</span>
          <span>💬 {{ p.comments.length }}</span>
          <span class="post-card__date">{{ formatDate(p.createdAt) }}</span>
        </div>
      </div>
    </div>
  </div>

  <p v-else-if="pageLoading" class="feed-status">Loading...</p>
  <p v-else class="feed-status">Creator not found.</p>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { usePosts } from '../composables/usePosts.js';
import { useAuth } from '../composables/useAuth.js';
import MediaEmbed from '../components/MediaEmbed.vue';

const API_USERS = import.meta.env.VITE_API_URL + '/api/users';
const route = useRoute();
const router = useRouter();
const { posts, loading, fetchPosts } = usePosts();
const { user } = useAuth();

const creator = ref(null);
const pageLoading = ref(true);
const isFollowing = ref(false);
const followerCount = ref(0);

const hasSocialLinks = computed(() =>
  creator.value && Object.values(creator.value.socialLinks || {}).some(v => v)
);

const socialLinks = computed(() =>
  Object.fromEntries(Object.entries(creator.value?.socialLinks || {}).filter(([, v]) => v))
);

const platformLabel = (p) => ({
  youtube: '▶ YouTube', instagram: '📷 Instagram', twitch: '🎮 Twitch',
  tiktok: '🎵 TikTok', soundcloud: '🎵 SoundCloud', facebook: '📘 Facebook',
}[p] || p);

onMounted(async () => {
  try {
    const res = await axios.get(`${API_USERS}/creator/${route.params.username}`);
    creator.value = res.data;
    followerCount.value = res.data.followerCount;
    if (user.value.id) {
      isFollowing.value = res.data.followers?.includes(user.value.id);
    }
    await fetchPosts('', 1);
    posts.value = posts.value.filter(p => p.author.username === route.params.username);
  } catch {
    creator.value = null;
  } finally {
    pageLoading.value = false;
  }
});

const handleFollow = async () => {
  if (!user.value.id) { router.push('/login'); return; }
  const res = await axios.post(`${API_USERS}/creator/${creator.value.username}/follow`);
  isFollowing.value = res.data.following;
  followerCount.value = res.data.followerCount;
};

const truncate = (text) => text.length > 150 ? text.slice(0, 150) + '...' : text;
const formatDate = (d) => new Date(d).toLocaleDateString();
</script>

<style scoped>
.creator-page {
  max-width: 750px;
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
  gap: 14px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #000;
  margin-top: 10px;
}

.post-card__date {
  margin-left: auto;
  font-weight: 400;
  color: #555;
}
</style>
