<template>
    <div class="auth-wrapper">
        <h2 class="lgn-sgnup-txt">Forgot Password</h2>
        <p class="lgn-sgnup-txt" style="font-size:18px;font-weight:700;margin-bottom:8px;">
            Enter your email and we'll send you a reset link.
        </p>

        <form @submit.prevent="handleSubmit" class="auth-form">
            <input v-model="email" type="email" placeholder="Email" class="auth-input" required @keydown.enter.prevent="handleSubmit" />
            <!-- Button is disabled while the request is in flight to prevent double-submits -->
            <button type="submit" class="auth-button button-size" style="white-space:nowrap;width:80%;" :disabled="loading">
                {{ loading ? 'Sending...' : 'Send Reset Link' }}
            </button>
        </form>

        <!-- Success message (green) shown after the email is sent -->
        <p v-if="success" class="auth-error" style="color:#4caf50;">{{ success }}</p>
        <!-- Error message shown if the request fails (e.g. email not found) -->
        <p v-if="error" class="auth-error">{{ error }}</p>

        <a href="/login" class="auth-button button-size1" style="margin-top:12px;width:45%;">Back to Login</a>
    </div>
</template>

<script setup>
// =============================================================================
// ForgotPassword.vue — password reset request page
//
// The first step of the two-page password reset flow:
//   1. User enters their email here → POST /forgot-password → backend sends
//      an email containing a single-use reset link (/reset-password/:token)
//   2. User clicks the link → ResetPassword.vue completes the flow
//
// This page does NOT use useAuth because no JWT is involved — the user is
// unauthenticated by definition (they can't log in). The axios call is made
// directly.
//
// After a successful request the email field is cleared and the server's
// success message is displayed. The page intentionally does NOT redirect
// so the user can see the confirmation before navigating away.
// =============================================================================

import { ref } from 'vue';
import axios from 'axios';

// Base URL for user API endpoints
const API_URL = import.meta.env.VITE_API_URL + '/api/users';

// ── Local state ────────────────────────────────────────────────────────────────

const email   = ref('');  // Bound to the email input
const loading = ref(false); // Disables the submit button while the request is in flight
const success = ref('');  // Server success message (displayed in green)
const error   = ref('');  // Error message if the request fails

// ── Form submission ────────────────────────────────────────────────────────────

/**
 * POSTs the email address to the forgot-password endpoint.
 * On success: shows the server's message and clears the email field.
 * On failure: shows the error message from the server (e.g. "No account with
 *             that email address found.").
 */
const handleSubmit = async () => {
    loading.value = true;
    error.value   = '';
    success.value = '';
    try {
        const res = await axios.post(`${API_URL}/forgot-password`, { email: email.value });
        success.value = res.data.message;
        // Clear the field so the user can't accidentally resubmit the same email
        email.value = '';
    } catch (err) {
        error.value = err.response?.data?.message || 'Something went wrong. Try again.';
    } finally {
        loading.value = false;
    }
};
</script>
