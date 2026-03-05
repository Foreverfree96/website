<template>
    <div class="dashboard-container" v-if="user">
        <!-- Welcome -->


        <!-- User Info Card -->
        <div class="dashboard-card">
            <h1 class="dashboard-title">Welcome, {{ user.username || 'User' }}!</h1>
            <div class="dashboard-section">
                <p class="txtsizer"><strong>Username:</strong> {{ user.username }}</p>
                <p class="txtsizer"><strong>Email:</strong> {{ user.email }}</p>
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

            <!-- Change Password -->
            <div class="dashboard-section">
                <h2 class="sizetxt">Change Password</h2>
                <input v-model="currentPassword" type="password" placeholder="Current password" :class="{ 'input-box': true }" />
                <input v-model="newPassword" type="password" placeholder="New password (8+ chars)" :class="{ 'input-box': true }" />
                <input v-model="confirmPassword" type="password" placeholder="Confirm new password" :class="{ 'input-box': true }" />
                <button @click="handleChangePassword" class="btn-black">Update Password</button>
                <a href="/forgot-password" class="forgot-link">Forgot password?</a>
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

const { user, getProfile, logout, updateUsername, deleteAccount, getDonationsTotal, changePassword } = useAuth();

// Reactive refs
const newUsername = ref('');
const errorMessage = ref('');
const donationsTotal = ref(0);
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');

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
    errorMessage.value = '';
    if (!newUsername.value.trim()) {
        errorMessage.value = 'Please enter a new username.';
        return;
    }
    try {
        await updateUsername(newUsername.value.trim());
        newUsername.value = '';
        errorMessage.value = 'Username updated successfully!';
    } catch (err) {
        errorMessage.value = err.response?.data?.message || 'Failed to update username.';
    }
};

// Change password
const handleChangePassword = async () => {
    errorMessage.value = '';
    if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
        errorMessage.value = 'All password fields are required.';
        return;
    }
    if (newPassword.value !== confirmPassword.value) {
        errorMessage.value = 'New passwords do not match.';
        return;
    }
    try {
        await changePassword(currentPassword.value, newPassword.value);
        currentPassword.value = '';
        newPassword.value = '';
        confirmPassword.value = '';
        errorMessage.value = 'Password changed successfully!';
    } catch (err) {
        errorMessage.value = err.response?.data?.message || 'Failed to change password.';
    }
};

// Delete account
const confirmDelete = async () => {
    if (!confirm('Delete account permanently?')) return;
    try {
        await deleteAccount();
        window.location.href = '/signup';
    } catch (err) {
        errorMessage.value = err.response?.data?.message || 'Failed to delete account.';
    }
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

.forgot-link {
    display: inline-block;
    margin-top: 8px;
    font-size: 16px;
    font-weight: 700;
    color: #000000;
    text-decoration: underline;
    cursor: pointer;
}
</style>