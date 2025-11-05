<template>
  <div>
    <!-- Navigation Bar -->
    <nav class="bg-white shadow-md p-4 flex justify-between items-center">
      <div class="flex space-x-4">
        <div class="text-manipulator">
          <router-link id="home-btn" to="/" class="nav-link">Home</router-link>
          <router-link id="signup-btn" to="/signup" class="nav-link">Sign Up</router-link>
          <router-link id="login-btn" to="/login" class="nav-link">Login</router-link>
          <router-link id="profile-btn" to="/profile" class="nav-link">Profile</router-link>
          <router-link id="dashboard-btn" to="/dashboard" class="nav-link">Dashboard</router-link>
        </div>
      </div>
    </nav>

    <!-- Page Content -->
    <router-view />
  </div>
</template>

<script setup>
// No JS logic needed for simple nav
</script>

<style>
/* Nav link shared styles */


/* Optional: make the nav bar sticky */
nav {
  position: sticky;
  top: 0;
  z-index: 50;
}
</style>
