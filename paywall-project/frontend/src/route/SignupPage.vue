<template>
    <div class="auth-wrapper min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <h2 class="text-2xl font-bold mb-4">Sign Up</h2>

        <form @submit.prevent="handleSignup" class="auth-form bg-white p-6 rounded shadow-md w-80">
            <input v-model="username" type="text" placeholder="Username"
                class="auth-input mb-3 w-full p-2 border rounded" required />
            <input v-model="email" type="email" placeholder="Email" class="auth-input mb-3 w-full p-2 border rounded"
                required />
            <input v-model="password" type="password" placeholder="Password"
                class="auth-input mb-3 w-full p-2 border rounded" required />
            <button type="submit"
                class="auth-button w-full bg-charcoal text-white py-2 rounded border border-green-800 shadow-md hover:bg-black transition duration-300">
                Sign Up
            </button>
        </form>

        <p class="mt-4 text-sm text-gray-500">
            Already have an account?
            <button class="button-login">
                <router-link to="/login" class="auth-link text-green-700 hover:underline">Login</router-link></button>
        </p>

        <p v-if="error" class="auth-error mt-2 text-red-500">{{ error }}</p>
    </div>
</template>

<script setup>
import { ref } from "vue";
import { useAuth } from "../composables/useAuth.js";

const { signup, error } = useAuth();
const username = ref("");
const email = ref("");
const password = ref("");

const handleSignup = async () => {
    try {
        await signup(username.value, email.value, password.value);
        window.location.href = "/profile"; // redirect after signup
    } catch (err) {
        console.error(err);
    }
};
</script>