import { ref, reactive } from "vue";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL + "/api/users";

export function useAuth() {
  // Reactive state
  const user = reactive({
    id: null,
    username: "",
    email: "",
    isSubscriber: false,
  });

  const error = ref(null);

  // ---------------------------
  // Set JWT Header Globally
  // ---------------------------
  const setAuthHeader = (token) => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  };

  // Load stored token on refresh
  const token = localStorage.getItem("jwtToken");
  if (token) setAuthHeader(token);

  // ---------------------------
  // Signup
  // ---------------------------
  const signup = async (username, email, password) => {
    error.value = null;
    try {
      const res = await axios.post(`${API_URL}/signup`, {
        username,
        email,
        password,
      });

      localStorage.setItem("jwtToken", res.data.token);
      setAuthHeader(res.data.token);

      Object.assign(user, res.data);
    } catch (err) {
      console.error(err);
      error.value = err.response?.data?.message || "Signup failed.";
      throw err;
    }
  };

  // ---------------------------
  // Login
  // ---------------------------
  const login = async (usernameOrEmail, password) => {
    error.value = null;
    try {
      const res = await axios.post(`${API_URL}/login`, {
        username: usernameOrEmail,
        email: usernameOrEmail,
        password,
      });

      localStorage.setItem("jwtToken", res.data.token);
      setAuthHeader(res.data.token);

      Object.assign(user, res.data);
    } catch (err) {
      console.error(err);
      error.value = err.response?.data?.message || "Login failed.";
      throw err;
    }
  };

  // ---------------------------
  // Logout
  // ---------------------------
  const logout = () => {
    localStorage.removeItem("jwtToken");
    setAuthHeader(null);

    // Clear reactive user object
    Object.assign(user, {
      id: null,
      username: "",
      email: "",
      isSubscriber: false,
    });
  };

  // ---------------------------
  // Get Profile
  // ---------------------------
  const getProfile = async () => {
    error.value = null;
    try {
      const res = await axios.get(`${API_URL}/profile`);
      Object.assign(user, res.data);
    } catch (err) {
      console.error(err);
      error.value =
        err.response?.data?.message || "Failed to fetch profile.";
      throw err;
    }
  };

  // ---------------------------
  // Subscribe (Upgrade User)
  // ---------------------------
  const subscribe = async () => {
    error.value = null;
    try {
      const res = await axios.post(`${API_URL}/subscribe`);
      user.isSubscriber = res.data.isSubscriber;
    } catch (err) {
      console.error(err);
      error.value =
        err.response?.data?.message || "Subscription failed.";
      throw err;
    }
  };

  // ---------------------------
  // Update Username
  // ---------------------------
  const updateUsername = async (newUsername) => {
    error.value = null;
    try {
      const res = await axios.put(`${API_URL}/update-username`, {
        username: newUsername,
      });

      user.username = res.data.username;
      return res.data;
    } catch (err) {
      console.error(err);
      error.value =
        err.response?.data?.message || "Failed to update username.";
      throw err;
    }
  };

  // ---------------------------
  // Delete Account
  // ---------------------------
  const deleteAccount = async () => {
    error.value = null;
    try {
      await axios.delete(`${API_URL}/delete-account`);
      logout(); // full cleanup
    } catch (err) {
      console.error(err);
      error.value =
        err.response?.data?.message || "Failed to delete account.";
      throw err;
    }
  };

  // ---------------------------
  // Premium Content
  // ---------------------------
  const getPremiumContent = async () => {
    error.value = null;
    try {
      const res = await axios.get(`${API_URL}/premium-content`);
      return res.data;
    } catch (err) {
      console.error(err);
      error.value =
        err.response?.data?.message || "Failed to load premium content.";
      throw err;
    }
  };

  return {
    user,
    error,
    signup,
    login,
    logout,
    getProfile,
    subscribe,
    updateUsername,
    deleteAccount,
    getPremiumContent,
  };
}
