<template>
    <div class="dashboard-container" v-if="user">
        <!-- Welcome -->


        <!-- User Info Card -->
        <div class="dashboard-card">
            <h1 class="dashboard-title">Welcome, {{ user.username || 'User' }}!</h1>
            <div class="dashboard-section">
                <p class="txtsizer"><strong>Username:</strong> {{ user.username }}</p>
                <p class="txtsizer"><strong>Email:</strong> {{ user.email }}</p>
                <p>
                    <strong>Total Donations:</strong> ${{ donationsTotal.toFixed(2) }}
                </p>
                <!-- Logout -->
                <button class="btn-black logout-btn" @click="handleLogout">
                    Logout
                </button>
            </div>



            <!-- Update Username -->
            <div class="dashboard-section">
                <h2 class="sizetxt">Change Username</h2>
                <input v-model="newUsername" placeholder="New username"
                    :class="{ 'input-box': true, [sizingForum]: true }" />

                <button @click="handleUsernameUpdate" class="btn-black">
                    Update
                </button>
            </div>

            <!-- Delete Account -->
            <div class="dashboard-section delete-box">
                <button @click="confirmDelete" class="btn-black">
                    Delete Account
                </button>
            </div>

            <!-- Error Message -->
            <p v-if="errorMessage" class="err-text">{{ errorMessage }}</p>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAuth } from '../composables/useAuth.js';

const { user, getProfile, logout, updateUsername, deleteAccount, getDonationsTotal } = useAuth();

// Reactive refs
const newUsername = ref('');
const errorMessage = ref('');
const donationsTotal = ref(0);

// Load user profile and donations total
onMounted(async () => {
    try {
        await getProfile();
        donationsTotal.value = await getDonationsTotal();
    } catch (err) {
        errorMessage.value = 'Failed to load profile.';
    }
});

// Logout
const handleLogout = () => {
    logout();
    window.location.href = '/login';
};

// Update username
const handleUsernameUpdate = async () => {
    try {
        await updateUsername(newUsername.value);
        newUsername.value = '';
    } catch (err) {
        errorMessage.value = err.message;
    }
};

// Delete account
const confirmDelete = async () => {
    if (!confirm('Delete account permanently?')) return;
    await deleteAccount();
    window.location.href = '/signup';
};
</script>

<style scoped>
.dashboard-container {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
}


.dashboard-title {
    text-align: center;
    font-size: 35px;
    font-weight: bold;
    margin-bottom: 20px;
}

.dashboard-section {
    background-color: #fff0f6;
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 20px;
}
</style>