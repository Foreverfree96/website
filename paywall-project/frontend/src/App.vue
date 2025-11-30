<template>
  <div>
    <!-- Navigation Bar -->
    <nav class="bg-white shadow-md p-4 flex justify-between items-center">
      <div class="flex space-x-4 items-center">
        <div class="text-manipulator flex items-center">

          <!-- Always visible -->
          <router-link id="home-btn" to="/" class="nav-link">Home</router-link>

          <!-- When NOT logged in -->
          <template v-if="!isLoggedIn">
            <router-link id="login-btn" to="/login" class="nav-link">Login</router-link>
            <router-link id="signup-btn" to="/signup" class="nav-link">Sign Up</router-link>
          </template>

          <!-- When logged in -->
          <template v-else>
            <router-link id="logout-btn" to="/login" class="nav-link" @click.prevent="handleLogout">
              Logout
            </router-link>

            <router-link id="profile-btn" to="/profile" class="nav-link">Profile</router-link>
            <router-link id="dashboard-btn" to="/dashboard" class="nav-link">Dashboard</router-link>
            <router-link id="donate-btn" to="/donations" class="nav-link">Donate</router-link>
          </template>

        </div>
      </div>
    </nav>

    <router-view />
  </div>
</template>

<script setup>
import { computed, unref, onMounted } from "vue";
import { useAuth } from "./composables/useAuth.js";

const { user, logout } = useAuth();

// Extract user id
const getUserId = () => {
  const u = unref(user);
  return u?.id ?? u?._id ?? null;
};

const isLoggedIn = computed(() => !!getUserId());

onMounted(() => {
  console.log("[App.vue] mounted:", unref(user));
});

// Logout handler
const handleLogout = async () => {
  await logout();
  window.location.href = "/login";
};
</script>

<style scoped>
nav {
  position: sticky;
  top: 0;
  z-index: 50;
}

/* Ensure consistent button size */
.nav-link {
  padding: 0.6rem 1.2rem !important;
  display: inline-flex !important;
  align-items: center;
  border-radius: 6px;
  font-weight: 500;
}

/* Fix height differences */
#logout-btn {
  line-height: normal !important;
}
</style>
