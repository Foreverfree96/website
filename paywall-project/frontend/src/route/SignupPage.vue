<template>
    <div class="auth-wrapper">
        <h2 class="lgn-sgnup-txt">Sign Up</h2>
        <form @submit.prevent="handleSignup" class="auth-form">
            <!-- Username -->
            <div class="field-wrap">
                <input v-model="username" type="text" placeholder="Username" class="auth-input" required @input="checkUsername" />
                <span v-if="usernameMsg" :class="usernameAvailable ? 'hint-ok' : 'hint-err'">{{ usernameMsg }}</span>
            </div>

            <!-- Email -->
            <div class="field-wrap">
                <input v-model="email" type="email" placeholder="Email" class="auth-input" required @input="checkEmail" />
                <span v-if="emailMsg" :class="emailAvailable ? 'hint-ok' : 'hint-err'">{{ emailMsg }}</span>
            </div>

            <!-- Password -->
            <input v-model="password" type="password" placeholder="Password (8+ characters)" class="auth-input" required />

            <button type="submit" class="auth-button button-size" :disabled="!usernameAvailable || !emailAvailable">
                Sign Up
            </button>
        </form>

        <p class="txt-tag">Already have an account?</p>
        <a href="/login" class="auth-button button-size1">Login</a>

        <p v-if="error" class="auth-error">{{ error }}</p>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAuth } from '../composables/useAuth.js';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL + '/api/users';
const { signup, error } = useAuth();

const username = ref('');
const email = ref('');
const password = ref('');

const usernameMsg = ref('');
const usernameAvailable = ref(true);
const emailMsg = ref('');
const emailAvailable = ref(true);

let usernameTimer = null;
let emailTimer = null;

const checkUsername = () => {
    clearTimeout(usernameTimer);
    usernameMsg.value = '';
    if (!username.value || username.value.length < 2) return;
    usernameTimer = setTimeout(async () => {
        try {
            const res = await axios.get(`${API_URL}/check-username`, { params: { username: username.value } });
            usernameAvailable.value = res.data.available;
            usernameMsg.value = res.data.message;
        } catch { usernameMsg.value = ''; }
    }, 500);
};

const checkEmail = () => {
    clearTimeout(emailTimer);
    emailMsg.value = '';
    if (!email.value || !email.value.includes('@')) return;
    emailTimer = setTimeout(async () => {
        try {
            const res = await axios.get(`${API_URL}/check-email`, { params: { email: email.value } });
            emailAvailable.value = res.data.available;
            emailMsg.value = res.data.message;
        } catch { emailMsg.value = ''; }
    }, 500);
};

const handleSignup = async () => {
    if (!username.value || !email.value || !password.value) {
        error.value = 'All fields are required';
        return;
    }
    try {
        await signup(username.value, email.value, password.value);
        window.location.href = '/portfolio';
    } catch (err) {
        console.error(err.response?.data || err);
    }
};
</script>

<style scoped>
.field-wrap {
    display: flex;
    flex-direction: column;
    width: 100%;
    align-items: center;
    gap: 4px;
}
.hint-ok {
    font-size: 12px;
    color: #4caf50;
    font-weight: 600;
}
.hint-err {
    font-size: 12px;
    color: #e53935;
    font-weight: 600;
}
</style>
