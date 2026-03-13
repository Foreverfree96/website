<template>
    <div class="auth-wrapper">
        <h2 class="lgn-sgnup-txt">Login</h2>
        <form @submit.prevent="handleLogin" class="auth-form">
            <!--
              The field accepts both a username and an email address.
              The composable sends the same value under both the `username`
              and `email` keys so the backend can match either one.
            -->
            <input v-model="username" type="text" placeholder="Username/Email" class="auth-input" required @keydown.enter.prevent="handleLogin" />
            <input v-model="password" type="password" placeholder="Password" class="auth-input" required @keydown.enter.prevent="handleLogin" />

            <button type="submit" class="auth-button button-size">Login</button>

            <!-- Recovery links — plain <a> tags for hard navigation -->
            <a href="/forgot-password" class="txt-tag" style="font-size:16px;font-weight:700;cursor:pointer;text-decoration:underline;">Forgot password?</a>
            <a href="/forgot-username" class="txt-tag" style="font-size:16px;font-weight:700;cursor:pointer;text-decoration:underline;">Forgot username?</a>
            <p class="txt-tag">Don't have an account?</p>
            <a href="/signup" class="auth-button button-size">Sign Up</a>
        </form>

        <!--
          Error block — shown when useAuth sets error.value.
          When the error message contains "verify your email", showResend
          becomes true and an inline button lets the user re-trigger the
          verification email without leaving the page.
        -->
        <p v-if="error" class="auth-error">
            {{ error }}
            <span v-if="showResend">
                &nbsp;—&nbsp;
                <!--
                  Disabled after sending to prevent spam; re-enables after
                  5 seconds via the setTimeout in handleResend.
                -->
                <button class="resend-btn" @click="handleResend" :disabled="resendSent">
                    {{ resendSent ? "Email sent!" : "Resend verification email" }}
                </button>
            </span>
        </p>
    </div>
</template>

<script setup>
// =============================================================================
// LoginPage.vue — login page
//
// Handles user authentication via username or email + password.
// On success, performs a hard redirect to /portfolio (the main app entry point
// for authenticated users) so the JWT stored in localStorage is picked up by
// the auto-load logic in useAuth.
//
// Extra feature — resend verification email:
//   If login fails because the user hasn't verified their email yet, the
//   backend returns a message containing "verify your email". The `showResend`
//   computed detects this and reveals an inline "Resend verification email"
//   button that calls the /resend-verification endpoint directly.
// =============================================================================

import { ref, computed } from "vue";
import { useAuth } from "../composables/useAuth.js";
import axios from "axios";

// ── Composable ─────────────────────────────────────────────────────────────────

const { login, error } = useAuth();

// ── Local form state ───────────────────────────────────────────────────────────

// Holds the username or email the user typed (sent as both fields to the backend)
const username = ref("");
const password = ref("");

// Tracks whether the resend verification email request has already been sent,
// used to disable the button and show a confirmation label temporarily
const resendSent = ref(false);

// ── Computed ───────────────────────────────────────────────────────────────────

/**
 * Returns true when the current error message indicates the user needs to
 * verify their email. Case-insensitive check so it matches any server wording.
 * Drives the conditional rendering of the "Resend verification email" button.
 */
const showResend = computed(() => error.value?.toLowerCase().includes("verify your email"));

// ── Handlers ───────────────────────────────────────────────────────────────────

/**
 * Submits the login form. Resets the resendSent flag first so the button
 * state is clean if the user previously tried to resend. On success, hard-
 * redirects to /portfolio. Errors are surfaced via the `error` ref.
 */
const handleLogin = async () => {
    resendSent.value = false;
    try {
        await login(username.value, password.value);
        window.location.href = "/portfolio";
    } catch (err) {
        console.error(err);
    }
};

/**
 * Sends a new verification email to the address the user typed in the
 * username/email field. Sets resendSent to true to disable the button and
 * show "Email sent!" feedback. Resets after 5 seconds so the user could
 * retry if the first email didn't arrive.
 */
const handleResend = async () => {
    try {
        await axios.post(`${import.meta.env.VITE_API_URL}/api/users/resend-verification`, {
            email: username.value,
        });
        resendSent.value = true;
        // Re-enable the button after 5 seconds in case the user needs to retry
        setTimeout(() => { resendSent.value = false; }, 5000);
    } catch {
        // Silently reset — the error ref from useAuth already shows a message
        resendSent.value = false;
    }
};
</script>

<style scoped>
/* Inline text button that blends into the error message paragraph */
.resend-btn {
    background: none;
    border: none;
    color: #003087;
    font-weight: 700;
    font-size: inherit;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
}
/* Disabled state after the email has been sent */
.resend-btn:disabled {
    color: #555;
    cursor: default;
    text-decoration: none;
}
</style>
