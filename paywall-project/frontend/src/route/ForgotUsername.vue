<template>
    <div class="auth-wrapper">
        <h2 class="lgn-sgnup-txt">Forgot Username</h2>
        <p class="lgn-sgnup-txt" style="font-size:18px;font-weight:700;margin-bottom:8px;">
            Enter your email and we'll send you your username.
        </p>
        <form @submit.prevent="handleSubmit" class="auth-form">
            <input v-model="email" type="email" placeholder="Email" class="auth-input" required />
            <button type="submit" class="auth-button button-size" style="white-space:nowrap;width:80%;" :disabled="loading">
                {{ loading ? 'Sending...' : 'Send Username' }}
            </button>
        </form>
        <p v-if="success" class="auth-error" style="color:#4caf50;">{{ success }}</p>
        <p v-if="error" class="auth-error">{{ error }}</p>
        <a href="/login" class="auth-button button-size1" style="margin-top:12px;width:45%;">Back to Login</a>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL + '/api/users';
const email = ref('');
const loading = ref(false);
const success = ref('');
const error = ref('');

const handleSubmit = async () => {
    loading.value = true;
    error.value = '';
    success.value = '';
    try {
        const res = await axios.post(`${API_URL}/forgot-username`, { email: email.value });
        success.value = res.data.message;
        email.value = '';
    } catch (err) {
        error.value = err.response?.data?.message || 'Something went wrong. Try again.';
    } finally {
        loading.value = false;
    }
};
</script>
