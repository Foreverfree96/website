<template>
  <div class="auth-wrapper">
    <!--
      Three mutually exclusive states are shown depending on where the async
      verification request is in its lifecycle:
        1. loading — request in flight; show a "Verifying..." message
        2. success — verification succeeded; show a success screen with a
                     link to the login page
        3. failure — verification failed; show the error and a link back to
                     sign up (in case they need a new verification email)
    -->

    <!-- State 1: Request in flight -->
    <p v-if="loading" class="status-msg">Verifying your email...</p>

    <!-- State 2: Verification succeeded -->
    <template v-else-if="success">
      <h2 class="lgn-sgnup-txt">Email Verified!</h2>
      <p class="status-msg">Your account is active. You can now log in.</p>
      <router-link to="/login" class="auth-button button-size" style="margin-top:16px;">Go to Login</router-link>
    </template>

    <!-- State 3: Verification failed (invalid/expired token) -->
    <template v-else>
      <h2 class="lgn-sgnup-txt">Verification Failed</h2>
      <p class="auth-error">{{ errorMsg }}</p>

      <!-- Resend form -->
      <div class="resend-wrap">
        <p class="resend-label">Enter your email to get a new verification link:</p>
        <input v-model="resendEmail" type="email" placeholder="Your email" class="auth-input" :disabled="resendSent" />
        <button
          class="auth-button button-size"
          style="margin-top:8px;"
          :disabled="!resendEmail || resendLoading || resendSent"
          @click="handleResend"
        >
          {{ resendLoading ? 'Sending…' : resendSent ? '✅ Email sent!' : 'Resend verification email' }}
        </button>
        <p v-if="resendSent" class="resend-success">Check your inbox (and spam folder).</p>
      </div>

      <router-link to="/signup" class="txt-tag" style="font-size:14px;font-weight:600;margin-top:12px;text-decoration:underline;">Back to Sign Up</router-link>
    </template>
  </div>
</template>

<script setup>
// =============================================================================
// VerifyEmail.vue — email verification landing page
//
// Users land here by clicking the verification link in their signup email.
// The URL looks like: /verify-email/:token
//
// On mount, the component immediately fires a GET request to the backend with
// the token from the route parameter. There is no user input — the token
// itself is the credential. Three outcomes are possible:
//
//   Success: The backend marks the user's emailVerified flag as true.
//            The component shows a success screen with a link to /login.
//
//   Failure: The token is invalid, already used, or expired.
//            An error message is shown with a link back to /signup so the
//            user can re-register or request a new verification email.
//
//   Loading: While the request is in flight, a "Verifying..." message is
//            shown so the user knows something is happening.
//
// Uses <router-link> (not <a href>) for the navigation buttons so Vue Router
// handles the transition without a full page reload.
// =============================================================================

import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL + '/api/users';

// useRoute provides access to the :token dynamic segment of /verify-email/:token
const route = useRoute();

// ── Local state ────────────────────────────────────────────────────────────────

// True while the verification request is in flight; initialised to true so
// the loading message is shown immediately before the request completes
const loading  = ref(true);

// Set to true when the backend confirms the token is valid
const success  = ref(false);

// Error message from the backend (or a generic fallback)
const errorMsg = ref('');

// Resend state
const resendEmail   = ref('');
const resendSent    = ref(false);
const resendLoading = ref(false);

const handleResend = async () => {
  resendLoading.value = true;
  try {
    await axios.post(`${API}/resend-verification`, { email: resendEmail.value });
    resendSent.value = true;
  } catch {
    resendSent.value = true; // same generic message regardless
  } finally {
    resendLoading.value = false;
  }
};

// ── Lifecycle: verify on mount ─────────────────────────────────────────────────

/**
 * Fires immediately when the component mounts — there is no form to fill in,
 * so verification happens automatically as soon as the user lands on the page.
 * The token is taken directly from the URL route parameter.
 */
onMounted(async () => {
  try {
    await axios.get(`${import.meta.env.VITE_API_URL}/api/users/verify-email/${route.params.token}`);
    // Backend returned 2xx — the account is now verified
    success.value = true;
  } catch (err) {
    // Token was invalid, already used, or expired
    errorMsg.value = err.response?.data?.message || 'Verification link is invalid or has expired.';
  } finally {
    // Always hide the loading state once the request settles
    loading.value = false;
  }
});
</script>

<style scoped>
/* Centred body text used for both the loading and success states */
.status-msg {
  font-size: 1rem;
  font-weight: 600;
  color: #000;
  text-align: center;
  margin: 8px 0;
}

.resend-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-top: 20px;
  width: 100%;
  max-width: 360px;
}
.resend-label {
  font-size: 0.88rem;
  font-weight: 600;
  color: #333;
  margin: 0;
  text-align: center;
}
.resend-success {
  font-size: 0.85rem;
  font-weight: 600;
  color: #14532d;
  margin: 0;
  text-align: center;
}
</style>
