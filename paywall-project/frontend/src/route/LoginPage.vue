<template>
    <div class="auth-wrapper">
        <h2 class="lgn-sgnup-txt">Login</h2>
        <form @submit.prevent="handleLogin" class="auth-form">
            <input v-model="username" type="text" placeholder="Username/Email" class="auth-input" required />
            <input v-model="password" type="password" placeholder="Password" class="auth-input" required />

            <button type="submit" class="auth-button button-size">Login</button>

            <a href="/forgot-password" class="txt-tag" style="font-size:16px;font-weight:700;cursor:pointer;text-decoration:underline;">Forgot password?</a>
            <a href="/forgot-username" class="txt-tag" style="font-size:16px;font-weight:700;cursor:pointer;text-decoration:underline;">Forgot username?</a>
            <p class="txt-tag">Don't have an account?</p>
            <a href="/signup" class="auth-button button-size">Sign Up</a>
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
        window.location.href = "/portfolio";
    } catch (err) {
        console.error(err);
    }
};
</script>