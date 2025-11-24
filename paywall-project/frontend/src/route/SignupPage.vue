<template>
    <div class="auth-wrapper">
        <h2 class="lgn-sgnup-txt">Sign Up</h2>
        <form @submit.prevent="handleSignup" class="auth-form">
            <input v-model="username" type="text" placeholder="Username" class="auth-input" required />
            <input v-model="email" type="email" placeholder="Email" class="auth-input" required />
            <input v-model="password" type="password" placeholder="Password" class="auth-input" required />

            <button type="submit" class="auth-button">Sign Up</button>
        </form>

        <p class="txt-tag">Already have an account?</p>
        <a href="/login" class="auth-button">Login</a>

        <p v-if="error" class="auth-error">{{ error }}</p>
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
    if (!username.value || !email.value || !password.value) {
        error.value = "All fields are required";
        return;
    }

    try {
        await signup(username.value, email.value, password.value);
        window.location.href = "/profile";
    } catch (err) {
        console.error(err.response?.data || err);
    }
};
</script>