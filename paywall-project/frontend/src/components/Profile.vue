<template>
    <!-- The entire page is gated behind v-if="user" so nothing renders until the
         auth composable has resolved the logged-in user object -->
    <div class="profile-page" v-if="user">
        <div class="profile-header">
            <div class="profile-header__left">
                <h1 class="profile-title">Welcome, {{ user.username || 'User' }}!</h1>
                <!-- Calls logout() from the auth composable then hard-redirects to /login -->
                <button class="btn-black logout-btn" @click="handleLogout">Logout</button>
            </div>
        </div>

        <!-- Shared error/success message banner; reused for all form operations on this page -->
        <p v-if="errorMessage" class="err-text">{{ errorMessage }}</p>

        <!-- Two-column grid: Creator Profile (wider left col) + Account Settings (right col).
             Collapses to a single column on tablet/mobile via responsive CSS. -->
        <div class="profile-grid">
            <!-- LEFT: Creator Profile (wide) -->
            <div class="profile-col left-col">
                <div class="dashboard-section">
                    <h2 class="section-title">Creator Profile</h2>
                    <p class="section-hint">Choose any categories — they appear as badges on your public profile.</p>

                    <!-- Category badge toggles — clicking a badge adds or removes it from
                         the selectedCategories array.  Active badges show an emoji prefix. -->
                    <div class="badge-group">
                        <button type="button" v-for="cat in allCategories" :key="cat"
                            :class="['cat-badge', { active: selectedCategories.includes(cat) }]"
                            @click="toggleCategory(cat)">
                            {{ selectedCategories.includes(cat) ? categoryEmoji[cat] + ' ' : '' }}{{ cat }}
                        </button>
                    </div>

                    <label class="field-label">Bio</label>
                    <!-- maxlength="300" matches the server-side validation limit -->
                    <textarea v-model="bio" placeholder="Tell people about yourself..." class="input-box bio-input" maxlength="300" />

                    <label class="field-label">Social Links</label>
                    <!-- One input per supported platform; placeholder text is generated
                         by the platformPlaceholder() helper -->
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
                    <!-- Three fields: current password for verification, new password, confirm new password -->
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
                    <!-- Show the current username as context so the user knows what they are changing -->
                    <p class="section-hint">Current: <strong>@{{ user.username }}</strong></p>
                    <input v-model="newUsername" placeholder="New username" class="input-box" />
                    <button @click="handleUsernameUpdate" class="btn-black">Update Username</button>
                </div>

                <!-- Change Email -->
                <div class="dashboard-section">
                    <h2 class="section-title">Change Email</h2>
                    <!-- Show the current email so the user can see what they are replacing -->
                    <p class="section-hint">Current: <strong>{{ user.email }}</strong></p>
                    <input v-model="newEmail" type="email" placeholder="New email address" class="input-box" />
                    <!-- Password confirmation is required by the backend to authorise the email change -->
                    <input v-model="emailPassword" type="password" placeholder="Current password" class="input-box" />
                    <button @click="handleChangeEmail" class="btn-black">Update Email</button>
                </div>

                <!-- Privacy -->
                <div class="dashboard-section">
                    <h2 class="section-title">Account Privacy</h2>
                    <p class="section-hint">When private, your profile and posts are hidden from other users. Mods can still see your account.</p>
                    <!-- Button label and border colour change dynamically to reflect the current state -->
                    <button @click="handleTogglePrivate" class="btn-black privacy-toggle-btn" :class="{ 'private-on': user.isPrivateAccount }">
                        {{ user.isPrivateAccount ? '🔒 Account is Private' : '🌐 Account is Public' }}
                    </button>
                </div>

                <!-- My Network: followers / following counts with clickable modal -->
                <div class="dashboard-section">
                    <h2 class="section-title">My Network</h2>
                    <div class="net-stats">
                        <button class="net-stat-btn" @click="openNetModal('followers')">
                            <span class="net-stat-count">{{ followersList.length }}</span>
                            <span class="net-stat-label">Followers</span>
                        </button>
                        <button class="net-stat-btn" @click="openNetModal('following')">
                            <span class="net-stat-count">{{ followingList.length }}</span>
                            <span class="net-stat-label">Following</span>
                        </button>
                    </div>
                </div>

                <!-- Spotify Account Link -->
                <div class="dashboard-section spotify-box">
                    <h2 class="section-title">Spotify</h2>
                    <div v-if="spotifyLoading" class="section-hint">Loading…</div>
                    <template v-else-if="spotifyStatus.connected">
                        <p class="section-hint">
                            Connected as <strong>{{ spotifyStatus.displayName || 'Spotify User' }}</strong>
                        </p>
                        <div class="spotify-badge" :class="{ premium: spotifyStatus.isPremium }">
                            {{ spotifyStatus.isPremium ? '✓ Spotify Premium' : 'Spotify Free' }}
                        </div>
                        <p v-if="spotifyStatus.tokenExpired" class="section-hint spotify-warn">
                            Token expired — reconnect to refresh.
                        </p>
                        <div class="spotify-actions">
                            <a :href="spotifyConnectUrl" class="btn-black spotify-reconnect-btn">Reconnect</a>
                            <button @click="handleSpotifyDisconnect" class="btn-black spotify-disconnect-btn">Disconnect</button>
                        </div>
                    </template>
                    <template v-else>
                        <p class="section-hint">Link your Spotify account to verify Premium status.</p>
                        <a :href="spotifyConnectUrl" class="btn-black spotify-connect-btn">Connect Spotify</a>
                    </template>
                </div>

                <!-- Delete Account — styled with danger colours to signal destructiveness -->
                <div class="dashboard-section delete-box">
                    <h2 class="section-title danger-title">Danger Zone</h2>
                    <p class="section-hint">Permanently deletes your account and all your posts. This cannot be undone.</p>
                    <!-- Opens a confirmation modal rather than deleting immediately -->
                    <button @click="confirmDelete" class="btn-black delete-btn">Delete Account</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Followers / Following Modal -->
    <div v-if="showNetModal" class="confirm-overlay" @click.self="showNetModal = false">
        <div class="confirm-box net-modal-box">
            <div class="net-modal-header">
                <h2 class="net-modal-title">{{ netModalType === 'followers' ? 'Followers' : 'Following' }}</h2>
                <button class="modal-close-btn" @click="showNetModal = false">✕</button>
            </div>
            <div v-if="!netModalList.length" class="net-modal-empty">No users yet.</div>
            <div v-else class="net-modal-list">
                <div v-for="u in netModalList" :key="u._id" class="net-modal-user" @click="goToUser(u.username)">
                    @{{ u.username }}
                </div>
            </div>
        </div>
    </div>

    <!-- Delete Account Confirmation Modal — rendered outside the profile-page div
         so it sits above all other content in the stacking context -->
    <div v-if="showDeleteModal" class="confirm-overlay" @click.self="showDeleteModal = false">
        <div class="confirm-box">
            <p class="confirm-msg">Delete your account?</p>
            <p class="confirm-sub">This permanently removes your account and all your posts. There's no going back.</p>
            <div class="confirm-actions">
                <button class="confirm-cancel" @click="showDeleteModal = false">Cancel</button>
                <!-- Triggers the actual account deletion API call -->
                <button class="confirm-delete" @click="doDeleteAccount">Delete</button>
            </div>
        </div>
    </div>
</template>

<script setup>
/**
 * Profile.vue
 *
 * The logged-in user's personal settings dashboard.  Rendered inside the
 * authenticated area of the app (typically at /profile or /settings).
 *
 * Sections:
 *   LEFT COLUMN
 *     - Creator Profile: category badges, bio textarea, social link inputs.
 *     - Change Password: current + new + confirm fields with client-side match check.
 *
 *   RIGHT COLUMN
 *     - Change Username: single input; clears on success.
 *     - Change Email:    new email + current password; server sends a confirmation email.
 *     - Account Privacy: one-click toggle between public and private account.
 *     - Danger Zone:     account deletion behind a confirmation modal.
 *
 * All mutations share a single `errorMessage` ref for feedback so there is one
 * consistent banner at the top of the page for success and error messages.
 *
 * Data is loaded in onMounted by calling getProfile() (updates the reactive `user`
 * ref from the auth composable) and getDonationsTotal() (stored locally for display).
 */

import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';
import { useAuth } from '../composables/useAuth.js';

const API_USERS = import.meta.env.VITE_API_URL + '/api/users';
const router = useRouter();
const route  = useRoute();

// ─── AUTH COMPOSABLE ──────────────────────────────────────────────────────────

// Pull in the reactive user ref and all account-management methods from the
// centralised auth composable.  No direct axios calls are made in this component.
const {
  user,
  getProfile,
  logout,
  updateUsername,
  deleteAccount,
  getDonationsTotal,
  changePassword,
  changeEmail,
  updateCreatorProfile,
  togglePrivateAccount,
} = useAuth();

// ─── FORM STATE: SHARED ───────────────────────────────────────────────────────

// Single banner used for both error messages and success confirmations throughout
// the page.  Each handler resets it to '' at the start of the operation.
const errorMessage = ref('');

// ─── FORM STATE: USERNAME ─────────────────────────────────────────────────────

// Bound to the "new username" input; cleared on successful update
const newUsername = ref('');

// ─── FORM STATE: PASSWORD ─────────────────────────────────────────────────────

// Existing password required by the backend to authorise the change
const currentPassword = ref('');
// The desired new password
const newPassword = ref('');
// Confirmation field; must match newPassword before the request is sent
const confirmPassword = ref('');

// ─── FORM STATE: EMAIL ────────────────────────────────────────────────────────

// The new email address to switch to
const newEmail = ref('');
// The user's current password, required to authorise an email change
const emailPassword = ref('');

// ─── CREATOR PROFILE STATE ───────────────────────────────────────────────────

// Static list of all available content categories shown as toggleable badges
const allCategories = ['Music', 'Videos', 'Streamer', 'Pictures', 'Blogger / Writer'];

// Map from category name to its display emoji; prepended to active badge labels
const categoryEmoji = { 'Music': '🎵', 'Videos': '🎬', 'Streamer': '🎮', 'Pictures': '📷', 'Blogger / Writer': '✍️' };

// Static list of supported social platforms; drives both the input loop and the
// socialLinks object keys
const socialPlatforms = ['youtube', 'instagram', 'twitch', 'tiktok', 'soundcloud', 'facebook'];

// Array of currently selected category names; populated from user.categories in onMounted
const selectedCategories = ref([]);

// Bound to the bio textarea; populated from user.bio in onMounted
const bio = ref('');

// Object keyed by platform name, each value being the URL the user has entered.
// Initialised to empty strings so the inputs are always controlled.
const socialLinks = ref({ youtube: '', instagram: '', twitch: '', tiktok: '', soundcloud: '', facebook: '' });

// ─── DONATIONS TOTAL ─────────────────────────────────────────────────────────

// Lifetime donations received by this creator; fetched in onMounted
const donationsTotal = ref(0);

// ─── NETWORK STATE (followers / following) ───────────────────────────────────

const followersList  = ref([]);
const followingList  = ref([]);
const showNetModal   = ref(false);
const netModalType   = ref('followers'); // 'followers' | 'following'

const netModalList = computed(() =>
  netModalType.value === 'followers' ? followersList.value : followingList.value
);

const openNetModal = (type) => { netModalType.value = type; showNetModal.value = true; };
const goToUser = (username) => { showNetModal.value = false; router.push(`/creator/${username}`); };

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * platformPlaceholder
 * Returns the placeholder text for a given social platform input.
 * Kept as a function (rather than inlined) so the template stays readable.
 *
 * @param {string} p - Platform key (e.g. 'youtube').
 * @returns {string} Human-readable placeholder string.
 */
const platformPlaceholder = (p) => ({ youtube: 'YouTube URL', instagram: 'Instagram URL', twitch: 'Twitch URL', tiktok: 'TikTok URL', soundcloud: 'SoundCloud URL', facebook: 'Facebook URL' }[p]);

/**
 * toggleCategory
 * Adds a category to selectedCategories if it is not already present, or
 * removes it if it is.  This drives the active/inactive visual state of the
 * badge buttons.
 *
 * @param {string} cat - Category name from the allCategories array.
 */
const toggleCategory = (cat) => {
    const idx = selectedCategories.value.indexOf(cat);
    if (idx === -1) selectedCategories.value.push(cat);
    else selectedCategories.value.splice(idx, 1);
};

// ─── LIFECYCLE: MOUNT ─────────────────────────────────────────────────────────

/**
 * onMounted
 * Fetches the full user profile and donations total from the server, then
 * seeds the form fields with the existing values so the user sees their
 * current data when they arrive at the settings page.
 */
onMounted(async () => {
    try {
        // Refreshes the reactive user ref with the latest server data
        await getProfile();
        // Lifetime donations total (informational; fetched for potential display use)
        donationsTotal.value = await getDonationsTotal();
        // Pre-populate creator profile fields from the fetched user object
        selectedCategories.value = user.value.categories || [];
        bio.value = user.value.bio || '';
        // Populate social link inputs; fall back to empty string for any missing platform
        const sl = user.value.socialLinks || {};
        for (const k of socialPlatforms) socialLinks.value[k] = sl[k] || '';

        // Fetch followers / following lists using the public creator profile endpoint
        if (user.value.username) {
            try {
                const netRes = await axios.get(`${API_USERS}/creator/${user.value.username}`);
                followersList.value  = netRes.data.followers  || [];
                followingList.value  = netRes.data.following  || [];
            } catch { /* non-critical — silently ignore */ }
        }

        // Handle redirect back from Spotify OAuth
        const sp = route.query.spotify;
        if (sp === 'connected') {
            errorMessage.value = `Spotify connected${route.query.premium === 'true' ? ' — Premium verified!' : '.'}`;
            router.replace({ query: {} }); // clean up the URL
        } else if (sp === 'error') {
            errorMessage.value = 'Spotify connection failed. Please try again.';
            router.replace({ query: {} });
        }
    } catch (err) {
        errorMessage.value = 'Failed to load profile.';
    }

    // Load Spotify status independently so it never blocks the rest of the page
    fetchSpotifyStatus();
});

// ─── HANDLERS ────────────────────────────────────────────────────────────────

/**
 * handleLogout
 * Clears the auth state via the composable then performs a hard navigation to
 * /login.  A hard redirect (window.location) is used rather than router.push()
 * so the entire app state is reset, preventing stale reactive data from persisting.
 */
// Logout
const handleLogout = () => {
    logout();
    window.location.href = '/login';
};

// ─── USERNAME ─────────────────────────────────────────────────────────────────

/**
 * handleUsernameUpdate
 * Validates that the input is non-empty, then calls the auth composable's
 * updateUsername method.  Clears the input field and shows a success message
 * on success; shows the server error message on failure.
 */
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

// ─── CREATOR PROFILE ─────────────────────────────────────────────────────────

/**
 * handleCreatorProfileUpdate
 * Saves the creator profile fields (categories, bio, social links) in a single
 * PATCH/PUT call via the auth composable.
 */
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

// ─── EMAIL ───────────────────────────────────────────────────────────────────

/**
 * handleChangeEmail
 * Requires both the new email and the current password before calling the API.
 * On success, clears both fields and instructs the user to check their inbox
 * for the confirmation link (the email change is not immediate — it requires a
 * server-side verification step).
 */
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

// ─── PASSWORD ────────────────────────────────────────────────────────────────

/**
 * handleChangePassword
 * Validates that all three fields are filled and that the two new-password
 * fields match before sending the change request.  Clears all three fields
 * on success to avoid accidental re-submission.
 */
// Change password
const handleChangePassword = async () => {
    errorMessage.value = '';
    if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
        errorMessage.value = 'All password fields are required.';
        return;
    }
    // Client-side match check — the server also validates but this gives faster feedback
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

// ─── PRIVACY ──────────────────────────────────────────────────────────────────

/**
 * handleTogglePrivate
 * Toggles the account between public and private by calling the auth composable.
 * The composable updates user.isPrivateAccount so the button label and styling
 * reflect the new state without a page reload.
 * The feedback message is read AFTER the toggle so it reflects the updated value.
 */
// Toggle private account
const handleTogglePrivate = async () => {
    errorMessage.value = '';
    try {
        await togglePrivateAccount();
        // Read the updated value from user ref (set by the composable after the API call)
        errorMessage.value = user.value.isPrivateAccount ? 'Account set to private.' : 'Account set to public.';
    } catch {
        errorMessage.value = 'Failed to update privacy.';
    }
};

// ─── SPOTIFY ──────────────────────────────────────────────────────────────────

const API_SPOTIFY = import.meta.env.VITE_API_URL + '/api/spotify';

const spotifyLoading = ref(true);
const spotifyStatus  = ref({ connected: false, displayName: null, isPremium: false, tokenExpired: true });

// URL that initiates the OAuth flow — passes JWT so backend can identify the user
const spotifyConnectUrl = computed(() => {
    const token = localStorage.getItem('token');
    return `${API_SPOTIFY}/login?token=${token}`;
});

const fetchSpotifyStatus = async () => {
    spotifyLoading.value = true;
    try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_SPOTIFY}/status`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        spotifyStatus.value = res.data;
    } catch {
        spotifyStatus.value = { connected: false, displayName: null, isPremium: false, tokenExpired: true };
    } finally {
        spotifyLoading.value = false;
    }
};

const handleSpotifyDisconnect = async () => {
    try {
        const token = localStorage.getItem('token');
        await axios.delete(`${API_SPOTIFY}/disconnect`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        spotifyStatus.value = { connected: false, displayName: null, isPremium: false, tokenExpired: true };
        errorMessage.value = 'Spotify disconnected.';
    } catch {
        errorMessage.value = 'Failed to disconnect Spotify.';
    }
};

// ─── DELETE ACCOUNT ───────────────────────────────────────────────────────────

// Controls visibility of the delete-account confirmation modal
// Delete account
const showDeleteModal = ref(false);

/**
 * confirmDelete
 * Opens the confirmation modal.  Actual deletion is not triggered until the
 * user explicitly clicks "Delete" inside the modal.
 */
const confirmDelete = () => { showDeleteModal.value = true; };

/**
 * doDeleteAccount
 * Performs the irreversible account deletion after the user confirms.
 * Hard-redirects to /signup on success so all app state is cleared.
 */
const doDeleteAccount = async () => {
    showDeleteModal.value = false;
    try {
        await deleteAccount();
        // Hard redirect clears all app state since the account no longer exists
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
    word-break: break-word;
    overflow-wrap: anywhere;
    max-width: 100%;
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

/* ── Responsive ── */

/* Large desktop */
@media (min-width: 1440px) {
  .profile-page { max-width: 1500px; }
}

/* Large tablet landscape */
@media (max-width: 1024px) {
  .profile-page { max-width: 1100px; padding: 0 20px 50px; }
  .profile-title { font-size: 1.8rem; }
}

/* Tablet portrait + stack grid */
@media (max-width: 900px) {
  .profile-page { max-width: 100%; padding: 0 16px 50px; margin: 20px auto; }
  .profile-grid { grid-template-columns: 1fr; gap: 20px; }
  .profile-title { font-size: 1.7rem; }
  .social-grid { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 700px) {
  .profile-grid { grid-template-columns: 1fr; }
}

/* Large phone */
@media (max-width: 600px) {
  .profile-page { padding: 0 10px 44px; margin: 14px auto; }
  .profile-header { margin-bottom: 18px; padding-bottom: 14px; }
  .profile-title { font-size: 1.4rem; }
  .dashboard-section { padding: 16px; border-radius: 10px; gap: 8px; }
  .section-title { font-size: 1rem; }
  .badge-group { gap: 6px; }
  .cat-badge { padding: 6px 13px; font-size: 0.8rem; }
  .social-grid { grid-template-columns: 1fr; gap: 0; }
  .btn-black { padding: 8px 16px; font-size: 0.9rem; }
  .confirm-box { padding: 22px 20px; min-width: 240px; max-width: calc(100% - 32px); }
  .net-modal-box { max-width: calc(100% - 32px); padding: 18px; }
  .net-stat-count { font-size: 1.2rem; }
}

/* Phone */
@media (max-width: 480px) {
  .profile-page { padding: 0 8px 40px; }
  .profile-title { font-size: 1.3rem; }
  .dashboard-section { padding: 14px; }
  .cat-badge { padding: 5px 11px; font-size: 0.78rem; }
  .confirm-box { padding: 18px 16px; min-width: 220px; }
  .net-stat-btn { padding: 10px 6px; }
  .net-stat-count { font-size: 1.1rem; }
  .net-stat-label { font-size: 0.74rem; }
  .net-modal-box { padding: 16px; border-radius: 10px; }
  .net-modal-user { padding: 9px 12px; font-size: 0.9rem; }
}

/* Small phone (360px) */
@media (max-width: 360px) {
  .profile-title { font-size: 1.2rem; }
  .badge-group { gap: 4px; }
  .cat-badge { padding: 4px 9px; font-size: 0.74rem; }
  .section-hint { font-size: 0.8rem; }
  .confirm-box { padding: 16px 12px; min-width: 200px; }
  .confirm-actions { flex-direction: column; gap: 8px; }
  .confirm-cancel, .confirm-delete { width: 100%; justify-content: center; }
  .net-stats { gap: 10px; }
  .net-stat-btn { padding: 9px 4px; }
  .net-stat-count { font-size: 1rem; }
  .net-modal-user { padding: 8px 11px; font-size: 0.85rem; }
}

/* Very small phone (320px) */
@media (max-width: 320px) {
  .profile-page { padding: 0 6px 36px; }
  .dashboard-section { padding: 12px; }
  .profile-title { font-size: 1.1rem; }
  .net-stats { gap: 8px; }
  .net-stat-btn { padding: 8px 4px; border-radius: 8px; }
  .net-stat-count { font-size: 0.95rem; }
  .net-stat-label { font-size: 0.7rem; }
}

/* Landscape phone */
@media (max-height: 500px) and (orientation: landscape) {
  .profile-page { margin: 8px auto; }
  .profile-header { margin-bottom: 14px; padding-bottom: 10px; }
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

.privacy-toggle-btn {
    border-color: #14532d !important;
}
.privacy-toggle-btn.private-on {
    border-color: #7f1d1d !important;
    color: #ff9999 !important;
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

/* ── My Network section ── */

.net-stats {
    display: flex;
    gap: 16px;
}

.net-stat-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: #000;
    color: pink;
    border: 3px solid #14532d;
    border-radius: 10px;
    padding: 12px 8px;
    cursor: pointer;
    transition: transform 0.2s ease;
}
.net-stat-btn:hover { transform: translateY(-2px); color: rgb(125, 190, 157); }

.net-stat-count {
    font-size: 1.4rem;
    font-weight: 700;
    line-height: 1;
}

.net-stat-label {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

/* ── Network modal overrides ── */

.net-modal-box {
    max-width: 360px;
    width: 100%;
    max-height: 70vh;
    overflow-y: auto;
    text-align: left;
}

.net-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
}

.net-modal-title {
    font-size: 1.2rem;
    font-weight: 700;
    color: #000;
    margin: 0;
}

.modal-close-btn {
    background: none;
    border: none;
    font-size: 1.2rem;
    font-weight: 700;
    cursor: pointer;
    color: #7f1d1d;
}

.net-modal-empty {
    color: #555;
    font-size: 0.95rem;
    text-align: center;
    padding: 16px 0;
}

.net-modal-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.net-modal-user {
    background: #000;
    color: pink;
    border-radius: 8px;
    padding: 10px 14px;
    font-weight: 700;
    cursor: pointer;
    font-size: 0.95rem;
    transition: transform 0.15s;
}
.net-modal-user:hover { transform: translateX(4px); color: rgb(125, 190, 157); }

/* ── Spotify section ── */

.spotify-box {
    border-color: #1db954;
}

.spotify-badge {
    display: inline-block;
    padding: 5px 14px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 700;
    background: #000;
    color: #aaa;
    border: 2px solid #555;
}
.spotify-badge.premium {
    background: #1db954;
    color: #fff;
    border-color: #1db954;
}

.spotify-warn { color: #b45309; }

.spotify-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.spotify-connect-btn,
.spotify-reconnect-btn {
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    border-color: #1db954 !important;
}
.spotify-connect-btn:hover,
.spotify-reconnect-btn:hover {
    background: #1db954 !important;
    color: #fff !important;
    transform: translateY(-2px);
}

.spotify-disconnect-btn {
    border-color: #7f1d1d !important;
}
.spotify-disconnect-btn:hover {
    background: #7f1d1d !important;
    color: #fff !important;
    transform: translateY(-2px);
}

.confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
}

.confirm-box {
    background: pink;
    border: 3px solid #000;
    border-radius: 14px;
    padding: 28px 32px;
    text-align: center;
    min-width: 280px;
    max-width: 360px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    animation: pop-in 0.15s ease;
}

@keyframes pop-in {
    from { transform: scale(0.9); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
}

.confirm-msg {
    font-size: 1.15rem;
    font-weight: 700;
    color: #000;
    margin: 0 0 6px;
}

.confirm-sub {
    font-size: 0.875rem;
    color: #555;
    margin: 0 0 22px;
}

.confirm-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
}

.confirm-cancel {
    background: #000;
    color: pink;
    border: 3px solid #14532d;
    border-radius: 8px;
    padding: 8px 22px;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s;
}
.confirm-cancel:hover { transform: translateY(-2px); color: rgb(125, 190, 157); }

.confirm-delete {
    background: #7f1d1d;
    color: #fff;
    border: 3px solid #000;
    border-radius: 8px;
    padding: 8px 22px;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s;
}
.confirm-delete:hover { transform: translateY(-2px); background: #991b1b; }
</style>
