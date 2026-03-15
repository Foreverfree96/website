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

        <!-- Error / block message -->
        <div v-if="error && !errorDismissed" class="login-error-block" :class="{ 'error-banned': isBanned, 'error-restricted': isRestricted }">
            <!-- Dismiss (X) button -->
            <button class="error-dismiss" @click="dismissError" title="Dismiss">✕</button>

            <p class="error-icon">{{ isBanned ? '🚫' : isRestricted ? '⏳' : '⚠️' }}</p>
            <p class="error-msg">{{ error }}</p>

            <!-- Appeal submitted state -->
            <template v-if="appealSubmittedBanner">
                <p class="appeal-submitted-notice">📋 Your appeal is under review by the mod team.</p>
                <button class="withdraw-btn" :disabled="withdrawLoading" @click="withdrawAppeal">
                    {{ withdrawLoading ? 'Withdrawing…' : 'Withdraw Appeal' }}
                </button>
                <p v-if="withdrawMsg" class="withdraw-msg">{{ withdrawMsg }}</p>
            </template>

            <!-- Appeal / resend buttons (shown before appeal is submitted) -->
            <template v-else>
                <button v-if="isBanned || isRestricted" class="appeal-trigger-btn" @click="showAppealModal = true">
                    Submit an Appeal
                </button>
                <button v-if="showResend" class="resend-btn" @click="handleResend" :disabled="resendSent">
                    {{ resendSent ? 'Email sent!' : 'Resend verification email' }}
                </button>
            </template>
        </div>

        <!-- Appeal Modal -->
        <div v-if="showAppealModal" class="appeal-overlay" @click.self="closeAppealModal">
            <div class="appeal-box">
                <div class="appeal-box__header">
                    <h3 class="appeal-box__title">{{ isBanned ? '🚫 Appeal Ban' : '⏳ Appeal Restriction' }}</h3>
                    <button class="appeal-box__close" @click="closeAppealModal">✕</button>
                </div>
                <p class="appeal-box__sub">
                    Explain why you believe this {{ isBanned ? 'ban' : 'restriction' }} should be lifted.
                    Your message will be sent directly to the mod panel for review.
                </p>
                <textarea
                    v-model="appealText"
                    class="appeal-box__input"
                    placeholder="Write your appeal here..."
                    maxlength="1000"
                    rows="5"
                    :disabled="appealSent"
                />
                <p class="appeal-box__chars">{{ appealText.length }}/1000</p>
                <template v-if="!appealSent && !appealAlreadyExists">
                  <div class="appeal-box__actions">
                      <button class="appeal-box__cancel" @click="closeAppealModal">Cancel</button>
                      <button
                          class="appeal-box__submit"
                          :disabled="appealLoading || !appealText.trim()"
                          @click="submitAppeal"
                      >
                          {{ appealLoading ? 'Submitting…' : 'Submit Appeal' }}
                      </button>
                  </div>
                  <p v-if="appealError" class="appeal-box__error">{{ appealError }}</p>
                </template>
                <div v-if="appealSent" class="appeal-box__success">
                    <p>✅ Appeal submitted successfully.</p>
                    <p>The mod team will review it and get back to you.</p>
                    <button class="appeal-box__cancel" @click="closeAppealModal">Close</button>
                </div>
                <div v-if="appealAlreadyExists" class="appeal-box__success">
                    <p>📋 You've already submitted an appeal.</p>
                    <p>Please wait while the mod team reviews your case. You'll only be able to resubmit if your appeal is dismissed.</p>
                    <button class="appeal-box__cancel" @click="closeAppealModal">Close</button>
                </div>
            </div>
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

const isBanned     = ref(false);
const isRestricted = ref(false);

// Dismiss state — hides the error banner when user clicks ✕
const errorDismissed = ref(false);

// Persists across modal close — shows "appeal under review" on the banner
const appealSubmittedBanner = ref(false);

// Appeal modal state
const showAppealModal     = ref(false);
const appealText          = ref("");
const appealLoading       = ref(false);
const appealError         = ref("");
const appealSent          = ref(false);
const appealAlreadyExists = ref(false);

// Withdraw state
const withdrawLoading = ref(false);
const withdrawMsg     = ref("");

const showResend = computed(() => error.value?.toLowerCase().includes("verify your email"));

const handleLogin = async () => {
    resendSent.value            = false;
    isBanned.value              = false;
    isRestricted.value          = false;
    errorDismissed.value        = false;
    appealSubmittedBanner.value = false;
    withdrawMsg.value           = "";
    try {
        await login(username.value, password.value);
        window.location.href = "/portfolio";
    } catch (err) {
        const data = err.response?.data;
        if (data?.type === "banned")     isBanned.value     = true;
        if (data?.type === "restricted") isRestricted.value = true;
    }
};

const dismissError = () => {
    errorDismissed.value = true;
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

const closeAppealModal = () => {
    // Reset modal-internal state but preserve appealSubmittedBanner
    // so the banner shows "under review" after the modal is closed
    if (appealSent.value) appealSubmittedBanner.value = true;
    if (appealAlreadyExists.value) appealSubmittedBanner.value = true;
    appealText.value          = "";
    appealError.value         = "";
    appealSent.value          = false;
    appealAlreadyExists.value = false;
    showAppealModal.value     = false;
};

const submitAppeal = async () => {
    appealError.value   = "";
    appealLoading.value = true;
    try {
        await axios.post(`${API}/appeal`, {
            identifier: username.value,
            appealText: appealText.value,
            type: isBanned.value ? "ban" : "restriction",
        });
        appealSent.value = true;
    } catch (err) {
        const data = err.response?.data;
        if (data?.alreadySubmitted) {
            appealAlreadyExists.value = true;
            appealSubmittedBanner.value = true;
        } else {
            appealError.value = data?.message || "Failed to submit. Please try again.";
        }
    } finally {
        appealLoading.value = false;
    }
};

const withdrawAppeal = async () => {
    withdrawMsg.value     = "";
    withdrawLoading.value = true;
    try {
        await axios.delete(`${API}/appeal`, {
            data: {
                identifier: username.value,
                type: isBanned.value ? "ban" : "restriction",
            },
        });
        appealSubmittedBanner.value = false;
        withdrawMsg.value = "";
        // Re-show the Submit an Appeal button
    } catch (err) {
        withdrawMsg.value = err.response?.data?.message || "Failed to withdraw. Try again.";
    } finally {
        withdrawLoading.value = false;
    }
};
</script>

<style scoped>
/* Error / block message */
.login-error-block {
    position: relative;
    margin-top: 16px;
    border: 3px solid #b91c1c;
    border-radius: 12px;
    padding: 16px 20px;
    background: #fff1f2;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    max-width: 360px;
    width: 100%;
    text-align: center;
}
.login-error-block.error-restricted {
    border-color: #d97706;
    background: #fffbeb;
}
.error-dismiss {
    position: absolute;
    top: 8px;
    right: 10px;
    background: none;
    border: none;
    font-size: 1rem;
    font-weight: 700;
    color: #7f1d1d;
    cursor: pointer;
    line-height: 1;
    padding: 0;
}
.error-dismiss:hover { color: #000; }
.error-icon { font-size: 1.8rem; margin: 0; }
.error-msg  { font-size: 0.9rem; font-weight: 600; color: #333; margin: 0; line-height: 1.5; }

/* Appeal submitted notice on the banner */
.appeal-submitted-notice {
    font-size: 0.85rem;
    font-weight: 700;
    color: #14532d;
    margin: 0;
}
.withdraw-btn {
    background: none;
    border: 2px solid #7f1d1d;
    border-radius: 8px;
    color: #7f1d1d;
    font-size: 0.82rem;
    font-weight: 700;
    padding: 5px 14px;
    cursor: pointer;
}
.withdraw-btn:hover:not(:disabled) { background: #fff1f2; }
.withdraw-btn:disabled { opacity: 0.5; cursor: default; }
.withdraw-msg { font-size: 0.8rem; color: #b91c1c; font-weight: 600; margin: 0; }

/* Appeal trigger button */
.appeal-trigger-btn {
    background: #1e3a5f;
    color: #fff;
    border: 2px solid #000;
    border-radius: 8px;
    padding: 8px 20px;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    margin-top: 4px;
}
.appeal-trigger-btn:hover { background: #1e40af; }

/* Resend button */
.resend-btn {
    background: none;
    border: none;
    color: #003087;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
}
.resend-btn:disabled { color: #555; cursor: default; text-decoration: none; }

/* Appeal modal overlay */
.appeal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
    padding: 16px;
}

/* Appeal modal box */
.appeal-box {
    background: pink;
    border: 3px solid #000;
    border-radius: 14px;
    padding: 28px;
    width: 100%;
    max-width: 440px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.appeal-box__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.appeal-box__title {
    font-size: 1.15rem;
    font-weight: 800;
    color: #000;
    margin: 0;
}
.appeal-box__close {
    background: none;
    border: none;
    font-size: 1.1rem;
    font-weight: 700;
    cursor: pointer;
    color: #7f1d1d;
}
.appeal-box__sub {
    font-size: 0.88rem;
    color: #333;
    margin: 0;
    line-height: 1.5;
}
.appeal-box__input {
    width: 100%;
    border: 2px solid #000;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 16px;
    font-family: inherit;
    resize: vertical;
    box-sizing: border-box;
    background: #fff;
}
.appeal-box__input:focus { outline: none; border-color: #14532d; }
.appeal-box__chars { font-size: 0.75rem; color: #666; text-align: right; margin: -8px 0 0; }
.appeal-box__actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
}
.appeal-box__cancel {
    background: #fff;
    border: 2px solid #000;
    border-radius: 8px;
    padding: 8px 18px;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
}
.appeal-box__cancel:hover { background: #f3f4f6; }
.appeal-box__submit {
    background: #14532d;
    color: #fff;
    border: 2px solid #000;
    border-radius: 8px;
    padding: 8px 20px;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
}
.appeal-box__submit:disabled { opacity: 0.5; cursor: default; }
.appeal-box__submit:not(:disabled):hover { background: #166534; }
.appeal-box__error {
    font-size: 0.82rem;
    font-weight: 700;
    color: #b91c1c;
    margin: 0;
    text-align: center;
}
.appeal-box__success {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
    font-size: 0.9rem;
    font-weight: 600;
    color: #14532d;
}
</style>
