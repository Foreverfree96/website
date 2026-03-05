<template>
    <div class="profile-container" v-if="user">
        <div class="sectionggfix"><!-- Dashboard Title -->
            <h1> Welcome {{ user.username || 'User' }}!</h1>

            <!-- User Info Section -->
            <section>
                <p><strong>Username:</strong> {{ user.username }}</p>
                <p><strong>Email:</strong> {{ user.email }}</p>

                <p>
                    <strong>Total Donations:</strong> ${{ donationsTotal.toFixed(2) }}
                </p>

                <!-- Logout -->
                <button class="btn-black logout-btn" @click="handleLogout">
                    Logout
                </button>
            </section>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAuth } from '../composables/useAuth.js';

const { user, getProfile, logout, getDonationsTotal } = useAuth();
const donationsTotal = ref(0);

onMounted(async () => {
    try {
        await getProfile();
        donationsTotal.value = await getDonationsTotal();
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
