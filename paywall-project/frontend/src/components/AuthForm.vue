<template>
    <!--
      Shared auth form used for both Sign Up and Login modes.
      The `mode` prop drives which fields are shown and which composable
      function is called on submit.
    -->
    <div class="bg-white p-6 rounded shadow-md w-80">
        <h2 class="text-xl font-bold mb-4">{{ props.mode === 'signup' ? 'Sign Up' : 'Login' }}</h2>

        <form @submit.prevent="handleSubmit" class="flex flex-col gap-3">
            <!-- Name field is only shown in signup mode -->
            <input v-if="props.mode === 'signup'" v-model="name" type="text" placeholder="Name"
                class="border p-2 rounded" required />
            <input v-model="email" type="email" placeholder="Email" class="border p-2 rounded" required />
            <input v-model="password" type="password" placeholder="Password" class="border p-2 rounded" required />
            <button type="submit" class="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700">
                {{ props.mode === 'signup' ? 'Sign Up' : 'Login' }}
            </button>
        </form>

        <!-- Link to the opposite auth page -->
        <p class="mt-4 text-sm text-gray-500">
            <router-link v-if="props.mode === 'signup'" to="/login" class="text-blue-500 hover:underline">Already have
                an account? Login</router-link>
            <router-link v-else to="/signup" class="text-blue-500 hover:underline">Don't have an account? Sign
                Up</router-link>
        </p>

        <!-- Error message from the auth composable -->
        <p v-if="error" class="mt-2 text-red-500">{{ error }}</p>
    </div>
</template>

<script setup>
// =============================================================================
// AuthForm.vue — reusable login / signup form component
//
// This is an older generic form component. The dedicated LoginPage.vue and
// SignupPage.vue are the primary auth forms used in production; this component
// exists as a shared fallback / embeddable variant.
//
// Props:
//   mode — 'login' (default) | 'signup'
//          Controls the heading, which fields are shown, and which composable
//          function is called on submit.
//
// On successful submit, redirects the user to /profile via a hard navigation.
// =============================================================================

import { ref } from "vue";
import { useAuth } from "../composables/useAuth.js";

// ── Props ──────────────────────────────────────────────────────────────────────

const props = defineProps({
    mode: { type: String, default: "login" } // login or signup
});

// ── Composable ─────────────────────────────────────────────────────────────────

// Destructure only what this component needs from the auth composable
const { signup, login, error } = useAuth();

// ── Local form state ───────────────────────────────────────────────────────────

const name = ref("");      // Only used in signup mode
const email = ref("");
const password = ref("");

// ── Form submission ────────────────────────────────────────────────────────────

/**
 * Calls either signup() or login() depending on the current mode.
 * On success, performs a hard redirect to /profile so the page fully
 * reloads and picks up the newly stored JWT.
 * Errors are surfaced through the `error` ref from useAuth.
 */
const handleSubmit = async () => {
    try {
        if (props.mode === "signup") {
            await signup(name.value, email.value, password.value);
        } else {
            await login(email.value, password.value);
        }
        // Redirect to profile page after success
        window.location.href = "/profile";
    } catch (err) {
        console.error(err);
    }
};
</script>
