// src/composables/useAuth.js
import { ref } from "vue";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL + "/api/users";

// --------------------------------------
// USER as a ref = FIXES NAVBAR REACTIVITY
// --------------------------------------
const user = ref({
  id: null,
  username: "",
  email: "",
  isSubscriber: false,
});

const error = ref(null);

export function useAuth() {
  // -----------------------------
  // JWT HEADER
  // -----------------------------
  const setAuthHeader = (token) => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  };

  // -----------------------------
  // AUTO-LOAD user if token exists
  // -----------------------------
  const token = localStorage.getItem("jwtToken");
  if (token) {
    setAuthHeader(token);

    axios
      .get(`${API_URL}/profile`)
      .then((res) => {
        user.value = { ...res.data };
      })
      .catch(() => logout());
  }

  // -----------------------------
  // SIGNUP
  // -----------------------------
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

      user.value = { ...res.data };
    } catch (err) {
      error.value = err.response?.data?.message || "Signup failed.";
      throw err;
    }
  };

  // -----------------------------
  // LOGIN
  // -----------------------------
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

      user.value = { ...res.data }; // KEY FIX
    } catch (err) {
      error.value = err.response?.data?.message || "Login failed.";
      throw err;
    }
  };

  // -----------------------------
  // LOGOUT
  // -----------------------------
  const logout = () => {
    localStorage.removeItem("jwtToken");
    setAuthHeader(null);

    user.value = {
      id: null,
      username: "",
      email: "",
      isSubscriber: false,
    };
  };

  // -----------------------------
  // GET PROFILE
  // -----------------------------
  const getProfile = async () => {
    error.value = null;
    try {
      const res = await axios.get(`${API_URL}/profile`);
      user.value = { ...res.data }; // update whole object
    } catch (err) {
      error.value = "Failed to fetch profile.";
      throw err;
    }
  };

  // -----------------------------
  // SUBSCRIBE
  // -----------------------------
  const subscribe = async () => {
    error.value = null;
    try {
      const res = await axios.put(`${API_URL}/subscribe`);
      user.value = {
        ...user.value,
        isSubscriber: res.data.isSubscriber,
      };
    } catch (err) {
      error.value = "Subscription failed.";
      throw err;
    }
  };

  // -----------------------------
  // UPDATE USERNAME
  // -----------------------------
  const updateUsername = async (newUsername) => {
    error.value = null;
    try {
      const res = await axios.put(`${API_URL}/update-username`, {
        username: newUsername,
      });

      user.value = {
        ...user.value,
        username: res.data.username,
      };

      return res.data;
    } catch (err) {
      error.value = err.response?.data?.message || "Failed to update username.";
      throw err;
    }
  };

  // -----------------------------
  // DELETE ACCOUNT
  // -----------------------------
  const deleteAccount = async () => {
    error.value = null;
    try {
      await axios.delete(`${API_URL}/delete-account`);
      logout();
    } catch (err) {
      error.value = err.response?.data?.message || "Failed to delete account.";
      throw err;
    }
  };

  // -----------------------------
  // DONATIONS TOTAL
  // -----------------------------
  const getDonationsTotal = async () => {
    try {
      const res = await axios.get(`${API_URL}/donations-total`);
      return res.data.donationsTotal;
    } catch {
      return 0;
    }
  };

  // -----------------------------
  // CHANGE PASSWORD
  // -----------------------------
  const changePassword = async (currentPassword, newPassword) => {
    error.value = null;
    try {
      const res = await axios.put(`${API_URL}/change-password`, { currentPassword, newPassword });
      return res.data;
    } catch (err) {
      error.value = err.response?.data?.message || "Failed to change password.";
      throw err;
    }
  };

  // -----------------------------
  // CHANGE EMAIL
  // -----------------------------
  const changeEmail = async (newEmail, password) => {
    error.value = null;
    try {
      const res = await axios.put(`${API_URL}/change-email`, { newEmail, password });
      user.value = { ...user.value, email: res.data.email };
      return res.data;
    } catch (err) {
      error.value = err.response?.data?.message || "Failed to change email.";
      throw err;
    }
  };

  // -----------------------------
  // FORGOT PASSWORD
  // -----------------------------
  const forgotPassword = async (email) => {
    error.value = null;
    try {
      const res = await axios.post(`${API_URL}/forgot-password`, { email });
      return res.data;
    } catch (err) {
      error.value = err.response?.data?.message || "Failed to send reset email.";
      throw err;
    }
  };

  // -----------------------------
  // RESET PASSWORD
  // -----------------------------
  const resetPassword = async (token, newPassword) => {
    error.value = null;
    try {
      const res = await axios.post(`${API_URL}/reset-password/${token}`, { newPassword });
      return res.data;
    } catch (err) {
      error.value = err.response?.data?.message || "Failed to reset password.";
      throw err;
    }
  };

  // -----------------------------
  // PREMIUM CONTENT
  // -----------------------------
  const getPremiumContent = async () => {
    error.value = null;
    try {
      const res = await axios.get(`${API_URL}/premium-content`);
      return res.data;
    } catch (err) {
      error.value = "Failed to load premium content.";
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
    getDonationsTotal,
    getPremiumContent,
    changePassword,
    changeEmail,
    forgotPassword,
    resetPassword,
  };
}
