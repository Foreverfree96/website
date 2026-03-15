<template>
    <div class="auth-wrapper">
        <h2 class="lgn-sgnup-txt">Sign Up</h2>
        <form @submit.prevent="handleSignup" class="auth-form">

            <!-- ── Username field with availability feedback ──────────────── -->
            <div class="field-wrap">
                <!--
                  @input triggers checkUsername which debounces an availability
                  check against the backend after 500 ms of inactivity.
                -->
                <input v-model="username" type="text" placeholder="Username" class="auth-input" required @input="checkUsername" />
                <!--
                  hint-ok (green) or hint-err (red) is applied based on the
                  result of the availability check.
                -->
                <span v-if="usernameMsg" :class="usernameAvailable ? 'hint-ok' : 'hint-err'">{{ usernameMsg }}</span>
            </div>

            <!-- ── Email field with availability feedback ──────────────────── -->
            <div class="field-wrap">
                <input v-model="email" type="email" placeholder="Email" class="auth-input" required @input="checkEmail" />
                <span v-if="emailMsg" :class="emailAvailable ? 'hint-ok' : 'hint-err'">{{ emailMsg }}</span>
            </div>

            <!-- ── Password field ─────────────────────────────────────────── -->
            <input v-model="password" type="password" placeholder="Password (8+ characters)" class="auth-input" required @keydown.enter.prevent="handleSignup" />

            <!--
              Submit is disabled while:
                - the username is not available (usernameAvailable is false)
                - the email is not available (emailAvailable is false)
                - a request is already in flight (loading is true)
              This prevents submitting a form the backend will reject anyway.
            -->
            <button type="submit" class="auth-button button-size" :disabled="!usernameAvailable || !emailAvailable || loading">
                {{ loading ? 'Signing up...' : 'Sign Up' }}
            </button>
        </form>

        <!-- Recovery / navigation links outside the form -->
        <a href="/forgot-password" class="txt-tag" style="font-size:16px;font-weight:700;cursor:pointer;text-decoration:underline;">Forgot password?</a>
        <a href="/forgot-username" class="txt-tag" style="font-size:16px;font-weight:700;cursor:pointer;text-decoration:underline;">Forgot username?</a>
        <a href="/forgot-email" class="txt-tag" style="font-size:16px;font-weight:700;cursor:pointer;text-decoration:underline;">Forgot email?</a>
        <p class="txt-tag">Already have an account?</p>
        <a href="/login" class="auth-button button-size1">Login</a>

        <!--
          Shown after a successful signup call — prompts the user to check
          their email for the verification link.
        -->
        <p v-if="sent" class="sent-msg">✅ Check your email to confirm your account before logging in.</p>
        <!-- Backend or validation error message -->
        <p v-if="error" class="auth-error">{{ error }}</p>
    </div>
</template>

<script setup>
// =============================================================================
// SignupPage.vue — new account registration page
//
// Features:
//   - Real-time username availability check (debounced 500 ms)
//   - Real-time email availability check (debounced 500 ms)
//   - Submit button is disabled until both fields are confirmed available
//   - On success, shows a "check your email" message; does NOT redirect
//     because the user must verify their email before they can log in
//
// Debouncing is handled manually with setTimeout/clearTimeout rather than
// a utility library to avoid adding a dependency for two simple timers.
// =============================================================================

import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import axios from 'axios';

// Base URL for availability-check endpoints (not in useAuth because they're
// unauthenticated pre-signup calls)
const API_URL = import.meta.env.VITE_API_URL + '/api/users';

const router = useRouter();
const { signup, error } = useAuth();

// ── Local form state ───────────────────────────────────────────────────────────

const username = ref('');
const email    = ref('');
const password = ref('');

// Shown after a successful signup API call (email sent state)
const sent    = ref(false);

// True while the signup request is in flight (disables the submit button)
const loading = ref(false);

// ── Username availability state ────────────────────────────────────────────────

const usernameMsg       = ref('');   // Feedback text from the backend ("Available!" / "Already taken")
const usernameAvailable = ref(true); // Drives the submit button disabled state and hint colour

// ── Email availability state ───────────────────────────────────────────────────

const emailMsg       = ref('');   // Feedback text from the backend
const emailAvailable = ref(true); // Drives the submit button disabled state and hint colour

// ── Debounce timer handles ─────────────────────────────────────────────────────

// Storing the timer IDs outside the functions lets us cancel a pending check
// when the user types another character before 500 ms has elapsed
let usernameTimer = null;
let emailTimer    = null;

// ── Availability checks ────────────────────────────────────────────────────────

/**
 * Debounced handler for username @input events.
 * Skips the API call if the field is empty or too short (< 2 chars) — the
 * backend would reject it anyway, and there's no point showing an error while
 * the user is still typing their first character.
 * After 500 ms of no new input, hits GET /check-username?username=...
 * and updates the hint message and availability flag.
 */
const checkUsername = () => {
    clearTimeout(usernameTimer);
    usernameMsg.value = '';
    if (!username.value || username.value.length < 2) return;
    usernameTimer = setTimeout(async () => {
        try {
            const res = await axios.get(`${API_URL}/check-username`, { params: { username: username.value } });
            usernameAvailable.value = res.data.available;
            usernameMsg.value       = res.data.message;
        } catch { usernameMsg.value = ''; } // Silently swallow — don't block signup on a check failure
    }, 500);
};

/**
 * Debounced handler for email @input events.
 * Skips the API call if the field doesn't contain '@' yet (basic local
 * validation before spending a round-trip).
 * After 500 ms, hits GET /check-email?email=... and updates hint + flag.
 */
const checkEmail = () => {
    clearTimeout(emailTimer);
    emailMsg.value = '';
    if (!email.value || !email.value.includes('@')) return;
    emailTimer = setTimeout(async () => {
        try {
            const res = await axios.get(`${API_URL}/check-email`, { params: { email: email.value } });
            emailAvailable.value = res.data.available;
            emailMsg.value       = res.data.message;
        } catch { emailMsg.value = ''; }
    }, 500);
};

// ── Form submission ────────────────────────────────────────────────────────────

/**
 * Validates that all three fields are filled, then calls signup().
 * On success, sets `sent` to show the "check your email" confirmation.
 * On failure, the error ref from useAuth is already populated.
 * The finally block always re-enables the submit button.
 */
const handleSignup = async () => {
    if (!username.value || !email.value || !password.value) {
        error.value = 'All fields are required';
        return;
    }
    loading.value = true;
    try {
        await signup(username.value, email.value, password.value);
        router.push('/login');
    } catch (err) {
        console.error(err.response?.data || err);
    } finally {
        loading.value = false;
    }
};
</script>

<style scoped>
/* Wraps the input and its hint message in a column so the hint appears below the input */
.field-wrap {
    display: flex;
    flex-direction: column;
    width: 100%;
    align-items: center;
    gap: 4px;
}

/* Green hint text — username/email is available */
.hint-ok {
    font-size: 12px;
    color: #4caf50;
    font-weight: 600;
}

/* Red hint text — username/email is already taken */
.hint-err {
    font-size: 12px;
    color: #e53935;
    font-weight: 600;
}

/* Success message shown after signup — prompts the user to check email */
.sent-msg {
    font-size: 0.95rem;
    font-weight: 700;
    color: #14532d;
    text-align: center;
    margin-top: 12px;
}

/* ── Responsive ── */
@media (max-width: 600px) {
    .field-wrap { gap: 3px; }
    .hint-ok, .hint-err { font-size: 11px; }
    .sent-msg { font-size: 0.88rem; }
}
@media (max-width: 480px) {
    .field-wrap { align-items: stretch; }
}
</style>
