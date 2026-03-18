// =============================================================================
// src/composables/usePosts.js
// Posts composable — wraps all post-related API calls.
//
// Unlike useAuth/useNotifications, state here is LOCAL to each call site
// (refs are created inside the function). This is intentional: different
// pages (FeedPage, Dashboard, PostPage) each manage their own post lists
// independently, so sharing a singleton would cause one page's data to
// bleed into another.
//
// Exposed state:
//   posts   — array of post objects (used by list views)
//   post    — single post object (used by PostPage)
//   loading — boolean for spinner/skeleton display
//   error   — string error message; empty string when no error
//
// All mutating operations (createPost, updatePost, deletePost, toggleLike,
// addComment, deleteComment) do NOT automatically refresh `posts` or `post`.
// The calling component is responsible for updating local state after a
// mutation, which gives each page fine-grained control over UI updates.
// =============================================================================

import { ref } from "vue";
import axios from "axios";

// Base URL for all post REST endpoints
const API_URL = import.meta.env.VITE_API_URL + "/api/posts";

export function usePosts() {

  // ── Local reactive state ────────────────────────────────────────────────────

  // Array of posts for list views (FeedPage, Dashboard, CreatorProfile)
  const posts = ref([]);

  // Single post object for the detail view (PostPage)
  const post = ref(null);

  // True while any async operation is in flight — used to show loading states
  const loading = ref(false);

  // Human-readable error message; reset to "" before each request
  const error = ref("");

  // ── READ operations ─────────────────────────────────────────────────────────

  /**
   * Fetches a paginated list of posts from the feed.
   * Optionally filters by `category` — if empty/omitted, all categories are
   * returned. Returns the full response data (including pagination metadata)
   * so the caller can implement infinite scroll or page controls.
   *
   * @param {string} category - Category slug to filter by (optional)
   * @param {number} page     - 1-based page number (default 1)
   */
  const fetchPosts = async (category = "", page = 1, q = "", sort = "") => {
    loading.value = true;
    error.value = "";
    try {
      const params = { page, limit: 20 };
      if (category) params.category = category;
      if (q)        params.q = q;
      if (sort)     params.sort = sort;
      const res = await axios.get(API_URL, { params });
      posts.value = res.data.posts;
      return res.data; // includes total count / hasMore for pagination
    } catch {
      error.value = "Failed to load posts.";
    } finally {
      loading.value = false;
    }
  };

  const fetchCreatorPosts = async (username, page = 1) => {
    loading.value = true;
    error.value = "";
    try {
      const res = await axios.get(API_URL, { params: { author: username, page, limit: 20 } });
      posts.value = res.data.posts;
      return res.data;
    } catch {
      error.value = "Failed to load posts.";
    } finally {
      loading.value = false;
    }
  };

  /**
   * Fetches a single post by its MongoDB ObjectId.
   * Populates the `post` ref, which PostPage uses to render the full detail view.
   *
   * @param {string} id - MongoDB ObjectId of the post
   */
  const fetchPost = async (id) => {
    loading.value = true;
    error.value = "";
    try {
      const res = await axios.get(`${API_URL}/${id}`);
      post.value = res.data;
      return res.data;
    } catch {
      error.value = "Post not found.";
    } finally {
      loading.value = false;
    }
  };

  /**
   * Fetches only the posts created by the currently authenticated user.
   * Used in the Dashboard to show the creator's own content.
   * The backend derives "mine" from the JWT — no user ID param is needed.
   */
  const fetchMyPosts = async () => {
    loading.value = true;
    try {
      const res = await axios.get(`${API_URL}/mine`);
      posts.value = res.data;
      return res.data;
    } catch {
      error.value = "Failed to load your posts.";
    } finally {
      loading.value = false;
    }
  };

  // ── WRITE operations ────────────────────────────────────────────────────────

  /**
   * Creates a new post. `data` should be a FormData or plain object containing
   * the post fields (title, body, category, mediaUrl, isPremium, etc.).
   * Returns the newly created post object from the server.
   *
   * @param {Object|FormData} data - Post payload
   */
  const createPost = async (data) => {
    const res = await axios.post(API_URL, data);
    return res.data;
  };

  /**
   * Deletes a post by its id. Throws on error so the calling component can
   * catch and display a message.
   *
   * @param {string} id - MongoDB ObjectId of the post to delete
   */
  const deletePost = async (id) => {
    await axios.delete(`${API_URL}/${id}`);
  };

  /**
   * Updates an existing post's fields. Sends only the changed fields — the
   * backend merges them with the existing document.
   * Returns the updated post object.
   *
   * @param {string}          id   - MongoDB ObjectId of the post
   * @param {Object|FormData} data - Fields to update
   */
  const updatePost = async (id, data) => {
    const res = await axios.put(`${API_URL}/${id}`, data);
    return res.data;
  };

  // ── ENGAGEMENT operations ───────────────────────────────────────────────────

  /**
   * Toggles the authenticated user's like on a post (like if not liked,
   * unlike if already liked). Returns updated like count and liked state
   * so the caller can patch the local post object without a full refetch.
   *
   * @param {string} id - MongoDB ObjectId of the post
   */
  const toggleLike = async (id) => {
    const res = await axios.post(`${API_URL}/${id}/like`);
    return res.data;
  };

  /**
   * Posts a new comment on a post. `body` is the raw comment text.
   * Returns the updated comments array (or the new comment object)
   * so PostPage can append it to the local list immediately.
   *
   * @param {string} id   - MongoDB ObjectId of the post
   * @param {string} body - Comment text content
   */
  const addComment = async (id, body) => {
    const res = await axios.post(`${API_URL}/${id}/comments`, { body });
    return res.data;
  };

  /**
   * Deletes a specific comment from a post. Both IDs are required because
   * the backend needs to locate the comment within the correct post document.
   *
   * @param {string} postId    - MongoDB ObjectId of the parent post
   * @param {string} commentId - MongoDB ObjectId of the comment to delete
   */
  const deleteComment = async (postId, commentId) => {
    await axios.delete(`${API_URL}/${postId}/comments/${commentId}`);
  };

  // ── Public API ──────────────────────────────────────────────────────────────

  return { posts, post, loading, error, fetchPosts, fetchCreatorPosts, fetchMyPosts, fetchPost, createPost, updatePost, deletePost, toggleLike, addComment, deleteComment };
}
