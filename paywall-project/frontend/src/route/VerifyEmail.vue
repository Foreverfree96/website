<template>
  <div class="auth-wrapper">
    <p v-if="loading" class="status-msg">Verifying your email...</p>
    <template v-else-if="success">
      <h2 class="lgn-sgnup-txt">Email Verified!</h2>
      <p class="status-msg">Your account is active. You can now log in.</p>
      <router-link to="/login" class="auth-button button-size" style="margin-top:16px;">Go to Login</router-link>
    </template>
    <template v-else>
      <h2 class="lgn-sgnup-txt">Verification Failed</h2>
      <p class="auth-error">{{ errorMsg }}</p>
      <router-link to="/signup" class="auth-button button-size" style="margin-top:16px;">Back to Sign Up</router-link>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const loading = ref(true);
const success = ref(false);
const errorMsg = ref('');

onMounted(async () => {
  try {
    await axios.get(`${import.meta.env.VITE_API_URL}/api/users/verify-email/${route.params.token}`);
    success.value = true;
  } catch (err) {
    errorMsg.value = err.response?.data?.message || 'Verification link is invalid or has expired.';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.status-msg {
  font-size: 1rem;
  font-weight: 600;
  color: #000;
  text-align: center;
  margin: 8px 0;
}
</style>
