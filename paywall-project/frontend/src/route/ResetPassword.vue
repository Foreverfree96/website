<template>
    <div class="auth-wrapper">
        <h2 class="lgn-sgnup-txt">Reset Password</h2>
        <form @submit.prevent="handleSubmit" class="auth-form">
            <input v-model="newPassword" type="password" placeholder="New password (8+ chars)" class="auth-input" required />
            <input v-model="confirmPassword" type="password" placeholder="Confirm new password" class="auth-input" required />
            <button type="submit" class="auth-button button-size" :disabled="loading">
                {{ loading ? 'Resetting...' : 'Reset Password' }}
            </button>
        </form>
        <p v-if="success" class="auth-error" style="color:#4caf50;">{{ success }}</p>
        <p v-if="error" class="auth-error">{{ error }}</p>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL + '/api/users';
const route = useRoute();
const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const success = ref('');
const error = ref('');

const handleSubmit = async () => {
    error.value = '';
    if (newPassword.value !== confirmPassword.value) {
        error.value = 'Passwords do not match.';
        return;
    }
    if (newPassword.value.length < 8) {
        error.value = 'Password must be at least 8 characters.';
        return;
    }
    loading.value = true;
    try {
        const res = await axios.post(`${API_URL}/reset-password/${route.params.token}`, {
            newPassword: newPassword.value,
        });
        success.value = res.data.message + ' Redirecting to login...';
        setTimeout(() => { window.location.href = '/login'; }, 2000);
    } catch (err) {
        error.value = err.response?.data?.message || 'Invalid or expired link.';
    } finally {
        loading.value = false;
    }
};
</script>
