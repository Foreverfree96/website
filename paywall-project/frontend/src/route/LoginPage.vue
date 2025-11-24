<template>
    <div class="auth-wrapper">
        <h2 class="lgn-sgnup-txt">Login</h2>
        <form @submit.prevent="handleLogin" class="auth-form">
            <input v-model="username" type="text" placeholder="Username" class="auth-input" required />
            <input v-model="password" type="password" placeholder="Password" class="auth-input" required />

            <button type="submit" class="auth-button">Login</button>

            <p class="txt-tag">Don't have an account?</p>
            <a href="/signup" class="auth-button">Sign Up</a>
        </form>
        <p v-if="error" class="auth-error">{{ error }}</p>
    </div>
</template>

<script setup>
import { ref } from "vue";
import { useAuth } from "../composables/useAuth.js";

const { login, error } = useAuth();
const username = ref("");
const password = ref("");

const handleLogin = async () => {
    try {
        await login(username.value, password.value);
        window.location.href = "/profile";
    } catch (err) {
        console.error(err);
    }
};
</script>