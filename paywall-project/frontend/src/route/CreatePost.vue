<template>
  <div class="auth-wrapper create-wrapper">
    <h2 class="lgn-sgnup-txt">Create Post</h2>

    <form @submit.prevent="handleSubmit" class="create-form">
      <!-- Category badges -->
      <div class="field-label">Category</div>
      <div class="badge-group">
        <button type="button" v-for="cat in allCategories" :key="cat"
          :class="['badge', { active: form.category === cat }]"
          @click="form.category = form.category === cat ? '' : cat">
          {{ cat }}
        </button>
      </div>

      <!-- Title -->
      <input v-model="form.title" type="text" placeholder="Title (optional)" class="create-input" maxlength="150" />

      <!-- Body -->
      <textarea v-model="form.body" placeholder="What's on your mind? (optional)" class="create-input create-textarea" maxlength="5000" />

      <!-- Image URL (Pictures category) -->
      <template v-if="form.category === 'Pictures'">
        <div class="field-label">Image URL</div>
        <input v-model="form.imageUrl" type="url" placeholder="Paste a direct image link (jpg, png, gif...)"
          class="create-input" />
        <img v-if="form.imageUrl" :src="form.imageUrl" class="image-preview" alt="Preview"
          @error="imageError = true" @load="imageError = false" />
        <p v-if="imageError" class="auth-error" style="font-size:0.85rem;">Could not load image — check the URL.</p>
      </template>

      <!-- Media URL (non-Pictures) -->
      <template v-else>
        <input v-model="form.mediaUrl" type="url"
          placeholder="Paste a YouTube, Twitch, Spotify, SoundCloud, Apple Music link... (optional)"
          class="create-input" @input="detectEmbed" />
        <div v-if="form.mediaUrl && detectedType" class="detected-badge">{{ embedLabel }}</div>
        <MediaEmbed v-if="form.mediaUrl" :mediaUrl="form.mediaUrl" :embedType="detectedType" />
      </template>

      <!-- TOS checkbox -->
      <label class="tos-label">
        <input type="checkbox" v-model="agreedToTos" class="tos-checkbox" />
        <span>I agree to the <strong>community guidelines</strong> — no nudity, violence, hate speech, or spam.</span>
      </label>

      <button type="submit" class="auth-button button-size" :disabled="loading || !agreedToTos">
        {{ loading ? 'Posting...' : 'Post' }}
      </button>
    </form>

    <p v-if="error" class="auth-error">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePosts } from '../composables/usePosts.js';
import { useAuth } from '../composables/useAuth.js';
import MediaEmbed from '../components/MediaEmbed.vue';

const router = useRouter();
const { createPost, loading, error } = usePosts();
const { user } = useAuth();

const allCategories = ['Music', 'Videos', 'Streamer', 'Pictures', 'Blogger / Writer'];
const form = ref({ title: '', body: '', mediaUrl: '', imageUrl: '', category: '' });
const detectedType = ref('');
const embedLabel = ref('');
const agreedToTos = ref(false);
const imageError = ref(false);

onMounted(() => {
  const userCats = user.value?.categories || [];
  if (userCats.length === 1) form.value.category = userCats[0];
});

const embedLabels = {
  youtube: '▶ YouTube', twitch: '🎮 Twitch', soundcloud: '🎵 SoundCloud',
  spotify: '🎵 Spotify', applemusic: '🎵 Apple Music',
  instagram: '📷 Instagram', tiktok: '🎵 TikTok',
  facebook: '📘 Facebook', twitter: '🐦 Twitter/X', other: '🔗 Link',
};

const detectEmbed = () => {
  const url = form.value.mediaUrl;
  if (!url) { detectedType.value = ''; embedLabel.value = ''; return; }
  if (/youtube\.com|youtu\.be/.test(url)) detectedType.value = 'youtube';
  else if (/twitch\.tv/.test(url)) detectedType.value = 'twitch';
  else if (/open\.spotify\.com/.test(url)) detectedType.value = 'spotify';
  else if (/music\.apple\.com/.test(url)) detectedType.value = 'applemusic';
  else if (/soundcloud\.com/.test(url)) detectedType.value = 'soundcloud';
  else if (/instagram\.com/.test(url)) detectedType.value = 'instagram';
  else if (/facebook\.com/.test(url)) detectedType.value = 'facebook';
  else if (/twitter\.com|x\.com/.test(url)) detectedType.value = 'twitter';
  else if (/tiktok\.com/.test(url)) detectedType.value = 'tiktok';
  else detectedType.value = 'other';
  embedLabel.value = embedLabels[detectedType.value] || '🔗 Link';
};

const handleSubmit = async () => {
  error.value = '';
  if (!form.value.title && !form.value.body && !form.value.mediaUrl && !form.value.imageUrl) {
    error.value = 'Add a title, text, media link, or image.';
    return;
  }
  try {
    const post = await createPost({ ...form.value, agreedToTos: agreedToTos.value });
    router.push(`/post/${post._id}`);
  } catch (err) {
    error.value = err.response?.data?.message || 'Failed to create post.';
  }
};
</script>

<style scoped>
.create-wrapper { max-width: 600px; }

.create-form { display: flex; flex-direction: column; gap: 14px; width: 100%; }

.field-label {
  color: pink;
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: -6px;
}

.badge-group { display: flex; flex-wrap: wrap; gap: 8px; }

.badge {
  padding: 7px 16px;
  border-radius: 20px;
  border: 3px solid #14532d;
  background: #000;
  color: pink;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}
.badge:hover, .badge.active { background: #14532d; color: #fff; }

.create-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 10px;
  border: 3.5px solid #7f1d1d;
  font-size: 1rem;
  font-weight: 600;
  outline: none;
  color: #000;
  background: #fff;
  box-sizing: border-box;
  transition: border-color 0.2s ease, transform 0.2s ease;
}
.create-input:focus { border-color: #14532d; transform: translateY(-2px); }
.create-input::placeholder { color: #aaa; font-weight: 600; }
.create-textarea { min-height: 120px; resize: vertical; }

.image-preview {
  width: 100%;
  max-height: 320px;
  object-fit: cover;
  border-radius: 10px;
  border: 3px solid #14532d;
}

.detected-badge {
  display: inline-block;
  background: #14532d;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 20px;
}

.tos-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: pink;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  line-height: 1.4;
}

.tos-checkbox {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 2px;
  cursor: pointer;
  accent-color: #14532d;
}
</style>
