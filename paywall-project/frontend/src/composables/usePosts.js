import { ref } from "vue";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL + "/api/posts";

export function usePosts() {
  const posts = ref([]);
  const post = ref(null);
  const loading = ref(false);
  const error = ref("");

  const fetchPosts = async (category = "", page = 1) => {
    loading.value = true;
    error.value = "";
    try {
      const params = { page, limit: 20 };
      if (category) params.category = category;
      const res = await axios.get(API_URL, { params });
      posts.value = res.data.posts;
      return res.data;
    } catch {
      error.value = "Failed to load posts.";
    } finally {
      loading.value = false;
    }
  };

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

  const createPost = async (data) => {
    const res = await axios.post(API_URL, data);
    return res.data;
  };

  const deletePost = async (id) => {
    await axios.delete(`${API_URL}/${id}`);
  };

  const updatePost = async (id, data) => {
    const res = await axios.put(`${API_URL}/${id}`, data);
    return res.data;
  };

  const toggleLike = async (id) => {
    const res = await axios.post(`${API_URL}/${id}/like`);
    return res.data;
  };

  const addComment = async (id, body) => {
    const res = await axios.post(`${API_URL}/${id}/comments`, { body });
    return res.data;
  };

  const deleteComment = async (postId, commentId) => {
    await axios.delete(`${API_URL}/${postId}/comments/${commentId}`);
  };

  return { posts, post, loading, error, fetchPosts, fetchMyPosts, fetchPost, createPost, updatePost, deletePost, toggleLike, addComment, deleteComment };
}
