import { ref, reactive } from "vue";
import axios from "axios";

// Backend base URL from environment variable
const API_URL = import.meta.env.VITE_API_URL + "/api/users";

export function useAuth() {
  // Reactive state
  const user = reactive({
    id: null,
    name: "",
    email: "",
    isSubscriber: false,
  });
  const error = ref(null);

  // Helper: set token in axios headers
  const setAuthHeader = (token) => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  };

  // Load token from localStorage if exists
  const token = localStorage.getItem("jwtToken");
  if (token) setAuthHeader(token);

  // Signup
  const signup = async (name, email, password) => {
    error.value = null;
    try {
      const res = await axios.post(`${API_URL}/signup`, { name, email, password });
      localStorage.setItem("jwtToken", res.data.token);
      setAuthHeader(res.data.token);
      Object.assign(user, res.data.user);
    } catch (err) {
      console.error(err);
      error.value = err.response?.data?.message || "Signup failed.";
      throw err;
    }
  };

  // Login
  const login = async (email, password) => {
    error.value = null;
    try {
      const res = await axios.post(`${API_URL}/login`, { email, password });
      localStorage.setItem("jwtToken", res.data.token);
      setAuthHeader(res.data.token);
      Object.assign(user, res.data.user);
    } catch (err) {
      console.error(err);
      error.value = err.response?.data?.message || "Login failed.";
      throw err;
    }
  };

  // Logout
  const logout = () => {
    localStorage.removeItem("jwtToken");
    setAuthHeader(null);
    Object.assign(user, { id: null, name: "", email: "", isSubscriber: false });
  };

  // Get profile
  const getProfile = async () => {
    error.value = null;
    try {
      const res = await axios.get(`${API_URL}/profile`);
      Object.assign(user, res.data);
    } catch (err) {
      console.error(err);
      error.value = err.response?.data?.message || "Failed to fetch profile.";
      throw err;
    }
  };

  // Subscribe (upgrade user to subscriber)
  const subscribe = async () => {
    error.value = null;
    try {
      const res = await axios.post(`${API_URL}/subscribe`);
      user.isSubscriber = res.data.user.isSubscriber;
    } catch (err) {
      console.error(err);
      error.value = err.response?.data?.message || "Subscription failed.";
      throw err;
    }
  };

  // Get premium content
  const getPremiumContent = async () => {
    error.value = null;
    try {
      const res = await axios.get(`${API_URL}/premium-content`);
      return res.data;
    } catch (err) {
      console.error(err);
      error.value = err.response?.data?.message || "Failed to load premium content.";
      throw err;
    }
  };

  return { user, error, signup, login, logout, getProfile, subscribe, getPremiumContent };
}
