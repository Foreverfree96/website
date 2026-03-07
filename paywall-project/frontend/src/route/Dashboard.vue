<template>
    <div class="profile-container" v-if="user">
        <div class="sectionggfix"><!-- Dashboard Title -->
            <h1> Welcome {{ user.username || 'User' }}!</h1>

            <!-- User Info Section -->
            <section>
                <p><strong>Username:</strong> {{ user.username }}</p>
                <p><strong>Email:</strong> {{ user.email }}</p>

                <!-- Logout -->
                <button class="btn-black logout-btn" @click="handleLogout">
                    Logout
                </button>
            </section>
        </div>
    </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useAuth } from '../composables/useAuth.js';

const { user, getProfile, logout } = useAuth();

onMounted(async () => {
    try {
        await getProfile();
    } catch (err) {
        console.error('Failed to load dashboard:', err);
    }
});

const handleLogout = () => {
    logout();
    window.location.href = '/login';
};
</script>

<style lang="scss" scoped>
/* Profile / Dashboard Container */
</style>
