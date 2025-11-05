<template>
    <div class="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <h1 class="text-3xl font-bold mb-4">
            Welcome
            <span v-if="user.name">, {{ user.name }}!</span>
            <span v-else> to our site!</span>
        </h1>
        <p class="mb-6 text-gray-700 text-center max-w-lg">
            Access premium content, manage your profile, and enjoy our paywall features. Get started by signing up or
            logging in.
        </p>

        <!-- Auth Buttons -->
        <div class="auth-buttons-container">
            <router-link v-if="!user.name" to="/signup" id="auth-space" class="auth-button">Sign Up</router-link>
            <router-link v-if="!user.name" to="/login" id="auth-space1" class="auth-button">Login</router-link>
            <router-link v-if="user.name" to="/profile" id="auth-space2" class="auth-button">Go to Profile</router-link>
        </div>
    </div>
</template>

<script setup>
import { onMounted } from "vue";
import { useAuth } from "../composables/useAuth.js";

const { user, getProfile } = useAuth();

// Load user data if logged in
onMounted(async () => {
    try {
        await getProfile();
    } catch (err) {
        console.error("No user logged in yet");
    }
});
</script>