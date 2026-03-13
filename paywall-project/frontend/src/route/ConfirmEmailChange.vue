<template>
    <div class="auth-wrapper">
        <!--
          Three mutually exclusive states driven by the loading/success refs:
            1. loading   — request in flight
            2. success   — token accepted, email updated in the database
            3. failure   — invalid or expired confirmation link
        -->

        <!-- State 1: Request in flight -->
        <template v-if="loading">
            <p class="lgn-sgnup-txt">Confirming your new email...</p>
        </template>

        <!-- State 2: Email change confirmed successfully -->
        <template v-else-if="success">
            <h2 class="lgn-sgnup-txt">Email Updated!</h2>
            <p class="lgn-sgnup-txt" style="font-size:18px;font-weight:700;">Your email address has been updated successfully.</p>
            <!-- Navigate back to profile so the user can see their new email -->
            <a href="/profile" class="auth-button button-size" style="margin-top:16px;width:50%;">Go to Profile</a>
        </template>

        <!-- State 3: Token invalid or expired -->
        <template v-else>
            <h2 class="lgn-sgnup-txt">Link Invalid</h2>
            <p class="auth-error">{{ error }}</p>
            <a href="/profile" class="auth-button button-size1" style="margin-top:12px;width:50%;">Back to Profile</a>
        </template>
    </div>
</template>

<script setup>
// =============================================================================
// ConfirmEmailChange.vue — email change confirmation landing page
//
// Users land here by clicking the confirmation link that is emailed to their
// NEW email address when they request an email change from the profile page.
// The URL looks like: /confirm-email-change/:token
//
// The two-step flow prevents someone from hijacking an account by changing
// the email to one they control — the change only takes effect once the owner
// of the new address clicks the link.
//
// On mount, this component fires a GET request with the token. Three outcomes:
//
//   Success: The backend updates the user's email in the database. Shows a
//            success screen with a link to /profile to see the new email.
//
//   Failure: Token is invalid, expired, or already used. Shows an error
//            message with a link back to /profile.
//
//   Loading: "Confirming..." message while the request is in flight.
//
// Uses plain <a href> (not <router-link>) for navigation because the user's
// auth state may have changed during the email confirmation flow and a hard
// navigation ensures App.vue re-initialises with fresh state.
// =============================================================================

import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

// Base URL for user API endpoints
const API_URL = import.meta.env.VITE_API_URL + '/api/users';

// useRoute provides access to the :token dynamic segment of the URL
const route = useRoute();

// ── Local state ────────────────────────────────────────────────────────────────

// True while the request is in flight; initialised true so the loading message
// appears immediately rather than briefly flashing the failure state
const loading = ref(true);

// Set to true when the backend confirms the token and updates the email
const success = ref(false);

// Error message if the token is invalid or the request fails
const error   = ref('');

// ── Lifecycle: confirm on mount ────────────────────────────────────────────────

/**
 * Automatically fires the confirmation request as soon as the component mounts.
 * There is no form — the token in the URL is the only input needed.
 * The token is validated server-side; on success the database record is updated.
 */
onMounted(async () => {
    try {
        await axios.get(`${API_URL}/confirm-email-change/${route.params.token}`);
        // Backend returned 2xx — email has been updated in the database
        success.value = true;
    } catch (err) {
        // Token was invalid, expired, or already consumed
        error.value = err.response?.data?.message || 'Invalid or expired confirmation link.';
    } finally {
        // Always hide the loading state once the request settles
        loading.value = false;
    }
});
</script>
