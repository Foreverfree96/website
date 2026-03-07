<template>
    <div class="profile-page" v-if="user">
        <div class="profile-header">
            <div class="profile-header__left">
                <h1 class="profile-title">Welcome, {{ user.username || 'User' }}!</h1>
                <button class="btn-black logout-btn" @click="handleLogout">Logout</button>
            </div>
        </div>

        <p v-if="errorMessage" class="err-text">{{ errorMessage }}</p>

        <div class="profile-grid">
            <!-- LEFT: Creator Profile (wide) -->
            <div class="profile-col left-col">
                <div class="dashboard-section">
                    <h2 class="section-title">Creator Profile</h2>
                    <p class="section-hint">Choose up to 4 categories — they appear as badges on your public profile.</p>
                    <div class="badge-group">
                        <button type="button" v-for="cat in allCategories" :key="cat"
                            :class="['cat-badge', { active: selectedCategories.includes(cat) }]"
                            @click="toggleCategory(cat)">
                            {{ cat }}
                        </button>
                    </div>
                    <label class="field-label">Bio</label>
                    <textarea v-model="bio" placeholder="Tell people about yourself..." class="input-box bio-input" maxlength="300" />
                    <label class="field-label">Social Links</label>
                    <div class="social-grid">
                        <input v-for="platform in socialPlatforms" :key="platform"
                            v-model="socialLinks[platform]" :placeholder="platformPlaceholder(platform)" class="input-box" />
                    </div>
                    <button @click="handleCreatorProfileUpdate" class="btn-black">Save Creator Profile</button>
                </div>

                <!-- Change Password -->
                <div class="dashboard-section">
                    <h2 class="section-title">Change Password</h2>
                    <p class="section-hint">Must be at least 8 characters.</p>
                    <input v-model="currentPassword" type="password" placeholder="Current password" class="input-box" />
                    <input v-model="newPassword" type="password" placeholder="New password" class="input-box" />
                    <input v-model="confirmPassword" type="password" placeholder="Confirm new password" class="input-box" />
                    <button @click="handleChangePassword" class="btn-black">Update Password</button>
                    <a href="/forgot-password" class="forgot-link">Forgot password?</a>
                </div>
            </div>

            <!-- RIGHT: Account Settings (stacked) -->
            <div class="profile-col right-col">
                <!-- Change Username -->
                <div class="dashboard-section">
                    <h2 class="section-title">Change Username</h2>
                    <p class="section-hint">Current: <strong>@{{ user.username }}</strong></p>
                    <input v-model="newUsername" placeholder="New username" class="input-box" />
                    <button @click="handleUsernameUpdate" class="btn-black">Update Username</button>
                </div>

                <!-- Change Email -->
                <div class="dashboard-section">
                    <h2 class="section-title">Change Email</h2>
                    <p class="section-hint">Current: <strong>{{ user.email }}</strong></p>
                    <input v-model="newEmail" type="email" placeholder="New email address" class="input-box" />
                    <input v-model="emailPassword" type="password" placeholder="Current password" class="input-box" />
                    <button @click="handleChangeEmail" class="btn-black">Update Email</button>
                </div>

                <!-- Delete Account -->
                <div class="dashboard-section delete-box">
                    <h2 class="section-title danger-title">Danger Zone</h2>
                    <p class="section-hint">Permanently deletes your account and all your posts. This cannot be undone.</p>
                    <button @click="confirmDelete" class="btn-black delete-btn">Delete Account</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAuth } from '../composables/useAuth.js';

const { user, getProfile, logout, updateUsername, deleteAccount, getDonationsTotal, changePassword, changeEmail, updateCreatorProfile } = useAuth();

// Reactive refs
const newUsername = ref('');
const errorMessage = ref('');
const donationsTotal = ref(0);
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const newEmail = ref('');
const emailPassword = ref('');
const allCategories = ['Music', 'Videos', 'Streamer', 'Pictures', 'Blogger / Writer'];
const socialPlatforms = ['youtube', 'instagram', 'twitch', 'tiktok', 'soundcloud', 'facebook'];
const selectedCategories = ref([]);
const bio = ref('');
const socialLinks = ref({ youtube: '', instagram: '', twitch: '', tiktok: '', soundcloud: '', facebook: '' });

const platformPlaceholder = (p) => ({ youtube: 'YouTube URL', instagram: 'Instagram URL', twitch: 'Twitch URL', tiktok: 'TikTok URL', soundcloud: 'SoundCloud URL', facebook: 'Facebook URL' }[p]);
const toggleCategory = (cat) => {
    const idx = selectedCategories.value.indexOf(cat);
    if (idx === -1) selectedCategories.value.push(cat);
    else selectedCategories.value.splice(idx, 1);
};

// Load user profile and donations total
onMounted(async () => {
    try {
        await getProfile();
        donationsTotal.value = await getDonationsTotal();
        selectedCategories.value = user.value.categories || [];
        bio.value = user.value.bio || '';
        const sl = user.value.socialLinks || {};
        for (const k of socialPlatforms) socialLinks.value[k] = sl[k] || '';
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

// Update creator profile
const handleCreatorProfileUpdate = async () => {
    errorMessage.value = '';
    try {
        await updateCreatorProfile({ categories: selectedCategories.value, bio: bio.value, socialLinks: socialLinks.value });
        errorMessage.value = 'Creator profile saved!';
    } catch (err) {
        errorMessage.value = err.response?.data?.message || 'Failed to save creator profile.';
    }
};

// Change email
const handleChangeEmail = async () => {
    errorMessage.value = '';
    if (!newEmail.value.trim() || !emailPassword.value) {
        errorMessage.value = 'All fields are required.';
        return;
    }
    try {
        await changeEmail(newEmail.value.trim(), emailPassword.value);
        newEmail.value = '';
        emailPassword.value = '';
        errorMessage.value = 'Check your new email to confirm the change.';
    } catch (err) {
        errorMessage.value = err.response?.data?.message || 'Failed to change email.';
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
.profile-page {
    max-width: 1400px;
    margin: 30px auto;
    padding: 0 32px 60px;
}

.profile-header {
    display: flex;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
    margin-bottom: 28px;
    padding-bottom: 20px;
    border-bottom: 3px solid #000;
}

.profile-title {
    font-size: 2rem;
    font-weight: 700;
    color: #000;
    margin: 0;
}

.profile-header__left {
    display: inline-flex;
    flex-direction: column;
    gap: 8px;
}

.logout-btn {
    width: 100%;
}

.profile-sub {
    font-size: 0.95rem;
    color: #555;
    margin: 0;
}

.profile-grid {
    display: grid;
    grid-template-columns: 1.6fr 1fr;
    gap: 32px;
    align-items: start;
}

@media (max-width: 700px) {
    .profile-grid { grid-template-columns: 1fr; }
}

.profile-col {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.dashboard-section {
    background-color: #fff0f6;
    border: 3px solid #000;
    border-radius: 14px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.section-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: #000;
    margin: 0;
}

.danger-title {
    color: #7f1d1d;
}

.section-hint {
    font-size: 0.85rem;
    color: #555;
    margin: 0;
    line-height: 1.4;
}

.field-label {
    font-size: 0.8rem;
    font-weight: 700;
    color: #000;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.input-box {
    width: 100%;
    padding: 10px 14px;
    border-radius: 10px;
    border: 3px solid #7f1d1d;
    font-size: 0.95rem;
    font-weight: 600;
    outline: none;
    color: #000;
    background: #fff;
    box-sizing: border-box;
    transition: border-color 0.2s ease;
}
.input-box:focus { border-color: #14532d; }
.input-box::placeholder { color: #aaa; font-weight: 500; }

.btn-black {
    background: #000;
    color: pink;
    border: 3px solid #14532d;
    border-radius: 8px;
    padding: 10px 20px;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.2s ease;
    align-self: flex-start;
}
.btn-black:hover { transform: translateY(-2px); color: rgb(125,190,157); }

.err-text {
    background: #fff0f6;
    border: 2px solid #14532d;
    border-radius: 10px;
    padding: 10px 16px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #14532d;
    margin-bottom: 16px;
    text-align: center;
}

.badge-group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.cat-badge {
    padding: 7px 16px;
    border-radius: 20px;
    border: 3px solid #14532d;
    background: #000;
    color: pink;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s ease;
}

.cat-badge:hover, .cat-badge.active {
    background: #14532d;
    color: #fff;
}

.social-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.bio-input {
    min-height: 80px;
    resize: vertical;
    width: 100% !important;
}

.delete-box {
    border-color: #7f1d1d;
    background: #fff5f5;
}

.delete-btn {
    border-color: #7f1d1d !important;
}

.forgot-link {
    display: inline-block;
    font-size: 14px;
    font-weight: 700;
    color: #000;
    text-decoration: underline;
    cursor: pointer;
}
</style>