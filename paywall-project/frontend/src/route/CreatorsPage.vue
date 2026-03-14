<template>
  <div class="creators-page">
    <h1 class="page-title">Creators</h1>

    <input
      v-model="search"
      class="search-input"
      placeholder="Search creators..."
      @input="onSearch"
    />

    <p v-if="loading" class="status-msg">Loading...</p>
    <p v-else-if="!filtered.length" class="status-msg">No creators found.</p>

    <div v-else class="creators-grid">
      <div
        v-for="c in filtered"
        :key="c._id"
        class="creator-card"
        @click="router.push(`/creator/${c.username}`)"
      >
        <div class="creator-card__top">
          <span class="creator-card__username">@{{ c.username }}</span>
          <span class="creator-card__followers">{{ c.followerCount }} followers</span>
        </div>

        <div v-if="c.categories.length" class="creator-card__badges">
          <span v-for="cat in c.categories" :key="cat" class="badge">
            {{ categoryEmoji[cat] }} {{ cat }}
          </span>
        </div>

        <p v-if="c.bio" class="creator-card__bio">{{ truncate(c.bio) }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL + '/api/users/creators';
const router = useRouter();

const creators = ref([]);
const search   = ref('');
const loading  = ref(true);

const categoryEmoji = {
  'Music': '🎵', 'Videos': '🎬', 'Streamer': '🎮',
  'Pictures': '📷', 'Blogger / Writer': '✍️',
};

// Client-side filter so results update instantly while typing
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return creators.value;
  return creators.value.filter(c => c.username.toLowerCase().includes(q));
});

const truncate = (text) => text.length > 100 ? text.slice(0, 100) + '…' : text;

onMounted(async () => {
  try {
    const res = await axios.get(API);
    creators.value = res.data;
  } catch {
    /* silently fail — empty state shown */
  } finally {
    loading.value = false;
  }
});

// Keep search as client-side only — no need to re-fetch for every keystroke
const onSearch = () => {}; // filtered computed handles it
</script>

<style scoped>
.creators-page {
  max-width: 900px;
  margin: 30px auto;
  padding: 0 16px 60px;
}

.page-title {
  font-size: 2rem;
  font-weight: 700;
  color: #000;
  margin: 0 0 20px;
}

.search-input {
  width: 100%;
  padding: 10px 16px;
  border-radius: 10px;
  border: 3px solid #7f1d1d;
  font-size: 0.95rem;
  font-weight: 600;
  outline: none;
  color: #000;
  background: #fff;
  box-sizing: border-box;
  margin-bottom: 24px;
  transition: border-color 0.2s ease;
}
.search-input:focus { border-color: #14532d; }
.search-input::placeholder { color: #aaa; font-weight: 500; }

.status-msg {
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
  color: #555;
  margin-top: 40px;
}

.creators-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.creator-card {
  background: pink;
  border: 3px solid #000;
  border-radius: 14px;
  padding: 18px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.creator-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.3);
}

.creator-card__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.creator-card__username {
  font-size: 1.1rem;
  font-weight: 700;
  color: #000;
  word-break: break-word;
}

.creator-card__followers {
  font-size: 0.8rem;
  font-weight: 600;
  color: #555;
  white-space: nowrap;
  flex-shrink: 0;
}

.creator-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.badge {
  background: #000;
  color: pink;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
}

.creator-card__bio {
  font-size: 0.88rem;
  color: #1f2937;
  line-height: 1.45;
  margin: 0;
}

/* ── Responsive ── */

@media (max-width: 768px) {
  .creators-page { margin: 20px auto; padding: 0 14px 50px; }
  .page-title { font-size: 1.7rem; }
  .creators-grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
}

@media (max-width: 600px) {
  .creators-page { padding: 0 10px 44px; margin: 14px auto; }
  .page-title { font-size: 1.5rem; }
  .creators-grid { grid-template-columns: 1fr; }
}

@media (max-width: 480px) {
  .creators-page { padding: 0 8px 40px; }
  .creator-card { padding: 14px; border-radius: 10px; }
  .creator-card__username { font-size: 1rem; }
  .page-title { font-size: 1.3rem; }
}

/* Small phone (360px) */
@media (max-width: 360px) {
  .creators-page { padding: 0 6px 36px; margin: 12px auto; }
  .page-title { font-size: 1.2rem; margin-bottom: 14px; }
  .creator-card { padding: 12px; border-radius: 8px; gap: 8px; }
  .creator-card__username { font-size: 0.95rem; }
  .creator-card__followers { font-size: 0.74rem; }
  .badge { font-size: 0.68rem; padding: 2px 8px; }
  .creator-card__bio { font-size: 0.82rem; }
  .search-input { padding: 8px 12px; font-size: 0.9rem; margin-bottom: 16px; }
}

/* Very small phone (320px) */
@media (max-width: 320px) {
  .creators-page { padding: 0 4px 32px; }
  .creator-card { padding: 10px; }
  .creator-card__username { font-size: 0.9rem; }
}

/* Landscape phone */
@media (max-height: 500px) and (orientation: landscape) {
  .creators-page { margin: 8px auto; }
  .page-title { font-size: 1.4rem; margin-bottom: 12px; }
}
</style>
