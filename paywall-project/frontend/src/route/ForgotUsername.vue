<template>
    <div class="auth-wrapper">
        <h2 class="lgn-sgnup-txt">Forgot Username</h2>
        <p class="lgn-sgnup-txt" style="font-size:18px;font-weight:700;margin-bottom:8px;">
            Enter your email and we'll send you your username.
        </p>

        <form @submit.prevent="handleSubmit" class="auth-form">
            <input v-model="email" type="email" placeholder="Email" class="auth-input" required @keydown.enter.prevent="handleSubmit" />
            <!-- Button disabled while request is in flight to prevent double-submits -->
            <button type="submit" class="auth-button button-size" style="white-space:nowrap;width:80%;" :disabled="loading">
                {{ loading ? 'Sending...' : 'Send Username' }}
            </button>
        </form>

        <!-- Success message (green) after the backend sends the email -->
        <p v-if="success" class="auth-error" style="color:#4caf50;">{{ success }}</p>
        <!-- Error message if the request fails (e.g. no account with that email) -->
        <p v-if="error" class="auth-error">{{ error }}</p>

        <!-- Cross-link to forgot-password in case the user needs that too -->
        <a href="/forgot-password" class="txt-tag" style="font-size:16px;font-weight:700;cursor:pointer;text-decoration:underline;margin-top:8px;">Forgot password?</a>
        <a href="/login" class="auth-button button-size1" style="margin-top:12px;width:45%;">Back to Login</a>
    </div>
</template>

<script setup>
// =============================================================================
// ForgotUsername.vue — username recovery page
//
// Allows a user who has forgotten their username to have it emailed to them.
// The user provides their registered email address, and the backend looks up
// the associated account and sends the username in an email.
//
// Structurally identical to ForgotPassword.vue — both are unauthenticated
// single-field forms that POST to a recovery endpoint and display the server's
// response message.
//
// Does NOT use useAuth because no JWT is needed for this unauthenticated flow.
// =============================================================================

import { ref } from 'vue';
import axios from 'axios';

// Base URL for user API endpoints
const API_URL = import.meta.env.VITE_API_URL + '/api/users';

// ── Local state ────────────────────────────────────────────────────────────────

const email   = ref('');   // Bound to the email input
const loading = ref(false); // Disables submit button while request is in flight
const success = ref('');   // Server success message (displayed in green)
const error   = ref('');   // Error message if the request fails

// ── Form submission ────────────────────────────────────────────────────────────

/**
 * POSTs the email address to the forgot-username endpoint.
 * On success: shows the server's confirmation message and clears the email field.
 * On failure: shows the error message returned by the server.
 */
const handleSubmit = async () => {
    loading.value = true;
    error.value   = '';
    success.value = '';
    try {
        const res = await axios.post(`${API_URL}/forgot-username`, { email: email.value });
        success.value = res.data.message;
        // Clear the field after success so it's obvious the form was submitted
        email.value = '';
    } catch (err) {
        error.value = err.response?.data?.message || 'Something went wrong. Try again.';
    } finally {
        loading.value = false;
    }
};
</script>
