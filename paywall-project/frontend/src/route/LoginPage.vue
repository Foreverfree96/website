<template>
    <div class="auth-wrapper">
        <h2 class="lgn-sgnup-txt">Login</h2>
        <form @submit.prevent="handleLogin" class="auth-form">
            <input v-model="username" type="text" placeholder="Username/Email" class="auth-input" required @keydown.enter.prevent="handleLogin" />
            <input v-model="password" type="password" placeholder="Password" class="auth-input" required @keydown.enter.prevent="handleLogin" />
            <button type="submit" class="auth-button button-size">Login</button>

            <a href="/forgot-password" class="txt-tag" style="font-size:16px;font-weight:700;cursor:pointer;text-decoration:underline;">Forgot password?</a>
            <a href="/forgot-username" class="txt-tag" style="font-size:16px;font-weight:700;cursor:pointer;text-decoration:underline;">Forgot username?</a>
            <a href="/forgot-email" class="txt-tag" style="font-size:16px;font-weight:700;cursor:pointer;text-decoration:underline;">Forgot email?</a>
            <p class="txt-tag">Don't have an account?</p>
            <a href="/signup" class="auth-button button-size">Sign Up</a>
        </form>

        <!-- Generic error -->
        <p v-if="error && !isBanned && !isRestricted" class="auth-error">
            {{ error }}
            <span v-if="showResend">
                &nbsp;—&nbsp;
                <button class="resend-btn" @click="handleResend" :disabled="resendSent">
                    {{ resendSent ? "Email sent!" : "Resend verification email" }}
                </button>
            </span>
        </p>

        <!-- ── BANNED block ── -->
        <div v-if="isBanned" class="block-card banned-card">
            <p class="block-title">🚫 Account Banned</p>
            <p class="block-msg">{{ error }}</p>
            <div v-if="!appealSent" class="appeal-form">
                <p class="appeal-label">Submit an appeal:</p>
                <textarea v-model="appealText" class="appeal-input" placeholder="Explain why you believe this ban should be lifted..." maxlength="1000" rows="4" />
                <p class="appeal-chars">{{ appealText.length }}/1000</p>
                <button class="appeal-btn" :disabled="appealLoading || !appealText.trim()" @click="submitAppeal('ban')">
                    {{ appealLoading ? 'Submitting…' : 'Submit Appeal' }}
                </button>
                <p v-if="appealError" class="appeal-error">{{ appealError }}</p>
            </div>
            <p v-else class="appeal-sent">✅ Appeal submitted. We'll review it shortly.</p>
        </div>

        <!-- ── RESTRICTED block ── -->
        <div v-if="isRestricted" class="block-card restricted-card">
            <p class="block-title">⏳ Account Restricted</p>
            <p class="block-msg">{{ error }}</p>
            <div v-if="!appealSent" class="appeal-form">
                <p class="appeal-label">Think this is unfair? Submit an appeal:</p>
                <textarea v-model="appealText" class="appeal-input" placeholder="Explain why you believe this restriction should be lifted..." maxlength="1000" rows="4" />
                <p class="appeal-chars">{{ appealText.length }}/1000</p>
                <button class="appeal-btn" :disabled="appealLoading || !appealText.trim()" @click="submitAppeal('restriction')">
                    {{ appealLoading ? 'Submitting…' : 'Submit Appeal' }}
                </button>
                <p v-if="appealError" class="appeal-error">{{ appealError }}</p>
            </div>
            <p v-else class="appeal-sent">✅ Appeal submitted. We'll review it shortly.</p>
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useAuth } from "../composables/useAuth.js";
import axios from "axios";

const API = import.meta.env.VITE_API_URL + "/api/users";

const { login, error } = useAuth();

const username   = ref("");
const password   = ref("");
const resendSent = ref(false);

// Block type detection
const isBanned     = ref(false);
const isRestricted = ref(false);

// Appeal state
const appealText    = ref("");
const appealLoading = ref(false);
const appealError   = ref("");
const appealSent    = ref(false);

const showResend = computed(() => error.value?.toLowerCase().includes("verify your email"));

const handleLogin = async () => {
    resendSent.value  = false;
    isBanned.value    = false;
    isRestricted.value = false;
    appealSent.value  = false;
    appealText.value  = "";
    appealError.value = "";
    try {
        await login(username.value, password.value);
        window.location.href = "/portfolio";
    } catch (err) {
        const data = err.response?.data;
        if (data?.type === "banned")      isBanned.value     = true;
        if (data?.type === "restricted")  isRestricted.value = true;
    }
};

const handleResend = async () => {
    try {
        await axios.post(`${API}/resend-verification`, { email: username.value });
        resendSent.value = true;
        setTimeout(() => { resendSent.value = false; }, 5000);
    } catch {
        resendSent.value = false;
    }
};

const submitAppeal = async (type) => {
    appealError.value   = "";
    appealLoading.value = true;
    try {
        await axios.post(`${API}/appeal`, {
            identifier: username.value,
            appealText: appealText.value,
            type,
        });
        appealSent.value = true;
    } catch (err) {
        appealError.value = err.response?.data?.message || "Failed to submit appeal.";
    } finally {
        appealLoading.value = false;
    }
};
</script>

<style scoped>
.resend-btn {
    background: none;
    border: none;
    color: #003087;
    font-weight: 700;
    font-size: inherit;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
}
.resend-btn:disabled {
    color: #555;
    cursor: default;
    text-decoration: none;
}

/* Ban / restriction cards */
.block-card {
    margin-top: 18px;
    border: 3px solid #000;
    border-radius: 14px;
    padding: 20px;
    width: 100%;
    box-sizing: border-box;
    max-width: 420px;
}
.banned-card     { background: #fff1f2; border-color: #b91c1c; }
.restricted-card { background: #fffbeb; border-color: #d97706; }

.block-title {
    font-size: 1.1rem;
    font-weight: 800;
    margin: 0 0 8px;
    color: #000;
}
.block-msg {
    font-size: 0.92rem;
    font-weight: 600;
    color: #333;
    margin: 0 0 16px;
    line-height: 1.5;
}

/* Appeal form */
.appeal-form   { display: flex; flex-direction: column; gap: 8px; }
.appeal-label  { font-size: 0.88rem; font-weight: 700; color: #000; margin: 0; }
.appeal-input  {
    width: 100%;
    border: 2px solid #000;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 16px;
    font-family: inherit;
    resize: vertical;
    box-sizing: border-box;
}
.appeal-chars  { font-size: 0.75rem; color: #888; text-align: right; margin: -4px 0 0; }
.appeal-btn {
    background: #1e3a5f;
    color: #fff;
    border: 2px solid #000;
    border-radius: 8px;
    padding: 9px 20px;
    font-size: 0.92rem;
    font-weight: 700;
    cursor: pointer;
    align-self: flex-start;
}
.appeal-btn:disabled { opacity: 0.5; cursor: default; }
.appeal-btn:not(:disabled):hover { background: #1e40af; }
.appeal-error { font-size: 0.82rem; font-weight: 700; color: #b91c1c; margin: 0; }
.appeal-sent  { font-size: 0.9rem; font-weight: 700; color: #14532d; margin: 8px 0 0; }
</style>
