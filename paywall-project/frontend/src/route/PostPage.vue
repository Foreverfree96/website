<template>
  <div class="post-page" v-if="post">
    <button class="back-btn" @click="router.back()">← Back</button>
    <!-- Post Card -->
    <div class="post-full">
      <div class="post-full__meta">
        <span class="post-full__author" @click="goToCreator(post.author.username)">
          @{{ post.author.username }}
        </span>
        <span v-if="post.category" class="post-full__category">{{ post.category }}</span>
        <span class="post-full__date">{{ formatDate(post.createdAt) }}</span>
      </div>

      <span v-if="post.isPrivate" class="private-badge">🔒 Private</span>
      <h1 v-if="post.title" class="post-full__title">{{ post.title }}</h1>
      <p v-if="post.body" class="post-full__body">{{ post.body }}</p>
      <img v-if="post.imageUrl" :src="post.imageUrl" class="post-image" alt="Post image" />
      <MediaEmbed v-else-if="post.mediaUrl" :mediaUrl="post.mediaUrl" :embedType="post.embedType" />

      <!-- Actions -->
      <div class="post-full__actions">
        <button class="action-btn" @click="handleLike">
          {{ liked ? '❤️' : '🤍' }} {{ likeCount }}
        </button>
        <template v-if="user.id && post.author._id === user.id">
          <button class="action-btn edit-btn" @click="startEdit">✏️ Edit</button>
          <button class="action-btn privacy-btn" :class="{ private: post.isPrivate }" @click="handleTogglePrivate">
            {{ post.isPrivate ? '🔒 Private' : '🌐 Public' }}
          </button>
          <button class="action-btn delete-btn" @click="handleDelete">🗑 Delete</button>
        </template>
        <button v-if="user.id && post.author._id !== user.id" class="action-btn report-btn" @click="handleReport">
          🚩 Report
        </button>
      </div>

      <!-- Edit Form -->
      <div v-if="editing" class="edit-form">
        <div class="edit-form__title">Edit Post</div>

        <!-- Category -->
        <div class="edit-section-label">Category</div>
        <div class="edit-category-group">
          <button type="button" v-for="cat in allCategories" :key="cat"
            :class="['edit-badge', { active: editForm.category === cat }]"
            @click="editForm.category = editForm.category === cat ? '' : cat">
            {{ cat }}
          </button>
        </div>

        <input v-model="editForm.title" type="text" placeholder="Title" class="edit-input" maxlength="150" />
        <textarea v-model="editForm.body" placeholder="Body" class="edit-input edit-textarea" maxlength="5000" />
        <template v-if="editForm.category === 'Pictures'">
          <input v-model="editForm.imageUrl" type="url" placeholder="Image URL" class="edit-input" />
        </template>
        <template v-else>
          <input v-model="editForm.mediaUrl" type="url" placeholder="Media URL (YouTube, Spotify...)" class="edit-input" />
        </template>
        <p v-if="editError" class="edit-error">{{ editError }}</p>
        <div class="edit-form__actions">
          <button class="action-btn" @click="handleSaveEdit" :disabled="editSaving">
            {{ editSaving ? 'Saving...' : '✓ Save' }}
          </button>
          <button class="action-btn delete-btn" @click="editing = false">✕ Cancel</button>
        </div>
      </div>
    </div>

    <!-- Comments -->
    <div class="comments-section">
      <h2 class="comments-title">Comments ({{ post.comments.length }})</h2>

      <!-- Add comment -->
      <div v-if="user.id" class="comment-form">
        <textarea v-model="commentBody" placeholder="Write a comment..." class="comment-input" maxlength="1000" />
        <button class="auth-button comment-submit-btn" @click="handleComment" :disabled="!commentBody.trim()">
          Post Comment
        </button>
      </div>
      <p v-else class="login-prompt">
        <router-link to="/login" class="login-link">Log in</router-link> to comment.
      </p>

      <!-- Comment list -->
      <div v-if="post.comments.length" class="comment-list">
        <div v-for="c in post.comments" :key="c._id" class="comment-card">
          <div class="comment-card__header">
            <span class="comment-card__author" @click="goToCreator(c.author.username)">
              @{{ c.author.username }}
            </span>
            <span class="comment-card__date">{{ formatDate(c.createdAt) }}</span>
            <button v-if="user.id === c.author._id" class="comment-delete-btn" @click="handleDeleteComment(c._id)">✕</button>
          </div>
          <p class="comment-card__body">{{ c.body }}</p>
        </div>
      </div>
      <p v-else class="no-comments">No comments yet.</p>
    </div>
  </div>

  <p v-else-if="loading" class="feed-status">Loading...</p>
  <p v-else class="feed-status">Post not found.</p>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { usePosts } from '../composables/usePosts.js';
import { useAuth } from '../composables/useAuth.js';
import MediaEmbed from '../components/MediaEmbed.vue';

const route = useRoute();
const router = useRouter();
const { post, loading, fetchPost, deletePost, updatePost, toggleLike, addComment, deleteComment } = usePosts();
const { user } = useAuth();

const allCategories = ['Music', 'Videos', 'Streamer', 'Pictures', 'Blogger / Writer'];
const editing = ref(false);
const editSaving = ref(false);
const editError = ref('');
const editForm = ref({ title: '', body: '', mediaUrl: '', imageUrl: '', category: '', isPrivate: false });

const commentBody = ref('');
const likeCount = ref(0);
const liked = computed(() => post.value?.likes?.includes(user.value.id));

onMounted(async () => {
  await fetchPost(route.params.id);
  if (post.value) likeCount.value = post.value.likes.length;
});

const handleLike = async () => {
  if (!user.value.id) { router.push('/login'); return; }
  const res = await toggleLike(route.params.id);
  likeCount.value = res.likes;
  if (res.liked) post.value.likes.push(user.value.id);
  else post.value.likes = post.value.likes.filter(id => id !== user.value.id);
};

const handleComment = async () => {
  if (!commentBody.value.trim()) return;
  const comment = await addComment(route.params.id, commentBody.value);
  post.value.comments.push(comment);
  commentBody.value = '';
};

const handleDeleteComment = async (commentId) => {
  await deleteComment(route.params.id, commentId);
  post.value.comments = post.value.comments.filter(c => c._id !== commentId);
};

const handleReport = async () => {
  if (!confirm('Report this post for inappropriate content?')) return;
  try {
    await axios.post(`${import.meta.env.VITE_API_URL}/api/posts/${route.params.id}/report`);
    alert('Post reported. Thank you for helping keep the community safe.');
  } catch (err) {
    alert(err.response?.data?.message || 'Failed to report post.');
  }
};

const handleDelete = async () => {
  if (!confirm('Delete this post?')) return;
  await deletePost(route.params.id);
  router.push('/feed');
};

const startEdit = () => {
  editForm.value = {
    title: post.value.title || '',
    body: post.value.body || '',
    mediaUrl: post.value.mediaUrl || '',
    imageUrl: post.value.imageUrl || '',
    category: post.value.category || '',
    isPrivate: post.value.isPrivate ?? false,
  };
  editError.value = '';
  editing.value = true;
};

const handleSaveEdit = async () => {
  editError.value = '';
  editSaving.value = true;
  try {
    const updated = await updatePost(route.params.id, editForm.value);
    Object.assign(post.value, updated);
    editing.value = false;
  } catch (err) {
    editError.value = err.response?.data?.message || 'Failed to save changes.';
  } finally {
    editSaving.value = false;
  }
};


const handleTogglePrivate = async () => {
  try {
    const updated = await updatePost(route.params.id, { isPrivate: !post.value.isPrivate });
    post.value.isPrivate = updated.isPrivate;
  } catch (err) {
    alert(err.response?.data?.message || 'Failed to update privacy.');
  }
};

const goToCreator = (username) => router.push(`/creator/${username}`);
const formatDate = (d) => new Date(d).toLocaleDateString();
</script>

<style scoped>
.post-page {
  max-width: 750px;
  margin: 30px auto;
  padding: 0 16px 60px;
}

.feed-status {
  text-align: center;
  font-size: 1.1rem;
  font-weight: 600;
  color: #000;
  margin-top: 60px;
}

.post-full {
  background: pink;
  border: 3px solid #000;
  border-radius: 14px;
  padding: 24px;
  margin-bottom: 24px;
}

.post-full__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.post-full__author {
  font-weight: 700;
  color: #000;
  cursor: pointer;
  text-decoration: underline;
}

.post-full__author:hover { color: #14532d; }

.post-full__category {
  background: #000;
  color: pink;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
}

.post-full__date {
  margin-left: auto;
  font-size: 0.85rem;
  color: #555;
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

.post-image {
  width: 100%;
  max-height: 500px;
  object-fit: contain;
  border-radius: 10px;
  margin-top: 10px;
}

.report-btn { border-color: #7f1d1d; margin-left: auto; }
.private-badge {
  display: inline-block;
  background: #555;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  margin-bottom: 8px;
}

.edit-btn { border-color: #1e3a5f; }
.privacy-btn { border-color: #14532d; }
.privacy-btn.private { border-color: #7f1d1d; color: #ff4444; }

.post-full__title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #000;
  margin: 0 0 12px;
}

.post-full__body {
  color: #1f2937;
  font-size: 1rem;
  line-height: 1.6;
  text-align: left;
  white-space: pre-wrap;
  margin: 0 0 12px;
}

.post-full__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.action-btn {
  background: #000;
  color: pink;
  border: 3px solid #14532d;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.action-btn:hover { transform: translateY(-2px); color: rgb(125,190,157); }

.delete-btn { border-color: #7f1d1d; }

/* Comments */
.comments-section {
  background: pink;
  border: 3px solid #000;
  border-radius: 14px;
  padding: 24px;
}

.comments-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #000;
  margin: 0 0 16px;
}

.comment-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.comment-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 10px;
  border: 3.5px solid #7f1d1d;
  font-size: 0.95rem;
  font-weight: 600;
  outline: none;
  resize: vertical;
  min-height: 80px;
  box-sizing: border-box;
  transition: border-color 0.2s ease;
}

.comment-input:focus { border-color: #14532d; }
.comment-input::placeholder { color: #aaa; }

.comment-submit-btn {
  width: auto;
  height: auto;
  padding: 10px 24px;
  font-size: 0.95rem;
  margin: 0;
  align-self: flex-end;
}

.login-prompt {
  font-size: 0.95rem;
  font-weight: 600;
  color: #000;
  margin-bottom: 16px;
}

.login-link {
  color: #14532d;
  font-weight: 700;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.comment-card {
  background: #fff0f6;
  border: 2px solid #000;
  border-radius: 10px;
  padding: 14px;
}

.comment-card__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.comment-card__author {
  font-weight: 700;
  color: #000;
  cursor: pointer;
  font-size: 0.9rem;
  text-decoration: underline;
}

.comment-card__author:hover { color: #14532d; }

.comment-card__date {
  font-size: 0.8rem;
  color: #777;
}

.comment-delete-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: #7f1d1d;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.9rem;
}

.comment-card__body {
  color: #1f2937;
  font-size: 0.95rem;
  line-height: 1.5;
  text-align: left;
  white-space: pre-wrap;
  margin: 0;
}

.no-comments {
  color: #555;
  font-size: 0.95rem;
  text-align: center;
}

/* Edit form */
.edit-section-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #000;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: -4px;
}

.edit-form {
  margin-top: 20px;
  border-top: 2px solid #000;
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.edit-form__title {
  font-size: 1rem;
  font-weight: 700;
  color: #000;
}

.edit-category-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.edit-badge {
  padding: 6px 14px;
  border-radius: 20px;
  border: 3px solid #14532d;
  background: #000;
  color: pink;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.2s ease;
}
.edit-badge:hover, .edit-badge.active { background: #14532d; color: #fff; }

.edit-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 3px solid #7f1d1d;
  font-size: 0.95rem;
  font-weight: 600;
  outline: none;
  color: #000;
  background: #fff;
  box-sizing: border-box;
  transition: border-color 0.2s ease;
}
.edit-input:focus { border-color: #14532d; }
.edit-textarea { min-height: 100px; resize: vertical; }

.edit-error {
  color: #7f1d1d;
  font-size: 0.9rem;
  font-weight: 600;
  margin: 0;
}

.edit-form__actions {
  display: flex;
  gap: 10px;
}
</style>
