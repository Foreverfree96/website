<template>
    <div class="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <h1 class="text-3xl font-bold mb-4">
            Welcome
            <span v-if="user.name">, {{ user.name }}!</span>
            <span v-else> to our site!</span>
        </h1>
        <p class="mb-6 text-gray-700  max-w-lg">
            Get started by signing up or logging in. Or you can continue as a guest.
        </p>

        <!-- Auth Buttons -->

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