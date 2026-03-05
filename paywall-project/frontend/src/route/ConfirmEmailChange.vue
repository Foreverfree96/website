<template>
    <div class="auth-wrapper">
        <template v-if="loading">
            <p class="lgn-sgnup-txt">Confirming your new email...</p>
        </template>
        <template v-else-if="success">
            <h2 class="lgn-sgnup-txt">Email Updated!</h2>
            <p class="lgn-sgnup-txt" style="font-size:18px;font-weight:700;">Your email address has been updated successfully.</p>
            <a href="/profile" class="auth-button button-size" style="margin-top:16px;width:50%;">Go to Profile</a>
        </template>
        <template v-else>
            <h2 class="lgn-sgnup-txt">Link Invalid</h2>
            <p class="auth-error">{{ error }}</p>
            <a href="/profile" class="auth-button button-size1" style="margin-top:12px;width:50%;">Back to Profile</a>
        </template>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL + '/api/users';
const route = useRoute();
const loading = ref(true);
const success = ref(false);
const error = ref('');

onMounted(async () => {
    try {
        await axios.get(`${API_URL}/confirm-email-change/${route.params.token}`);
        success.value = true;
    } catch (err) {
        error.value = err.response?.data?.message || 'Invalid or expired confirmation link.';
    } finally {
        loading.value = false;
    }
});
</script>
