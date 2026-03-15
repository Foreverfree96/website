<template>
    <div class="auth-wrapper">
        <h2 class="lgn-sgnup-txt">Forgot Email</h2>
        <p class="lgn-sgnup-txt" style="font-size:18px;font-weight:700;margin-bottom:8px;">
            Enter your username and we'll send your registered email address to you.
        </p>

        <form @submit.prevent="handleSubmit" class="auth-form">
            <input v-model="username" type="text" placeholder="Username" class="auth-input" required @keydown.enter.prevent="handleSubmit" />
            <button type="submit" class="auth-button button-size" style="width:80%;white-space:normal;word-break:break-word;" :disabled="loading">
                {{ loading ? 'Sending...' : 'Send Email Address' }}
            </button>
        </form>

        <p v-if="success" class="auth-error" style="color:#4caf50;">{{ success }}</p>
        <p v-if="error" class="auth-error">{{ error }}</p>

        <a href="/forgot-password" class="txt-tag" style="font-size:16px;font-weight:700;cursor:pointer;text-decoration:underline;margin-top:8px;">Forgot password?</a>
        <a href="/forgot-username" class="txt-tag" style="font-size:16px;font-weight:700;cursor:pointer;text-decoration:underline;margin-top:4px;">Forgot username?</a>
        <a href="/login" class="auth-button button-size1" style="margin-top:12px;width:45%;">Back to Login</a>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL + '/api/users';

const username = ref('');
const loading  = ref(false);
const success  = ref('');
const error    = ref('');

const handleSubmit = async () => {
    loading.value = true;
    error.value   = '';
    success.value = '';
    try {
        const res = await axios.post(`${API_URL}/forgot-email`, { username: username.value });
        success.value = res.data.message;
        username.value = '';
    } catch (err) {
        error.value = err.response?.data?.message || 'Something went wrong. Try again.';
    } finally {
        loading.value = false;
    }
};
</script>
