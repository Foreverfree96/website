<template>
    <div class="donations-page">
        <div class="card">
            <!-- Header -->
            <div class="card-header">
                <span class="paypal-logo">PayPal</span>
                <h1>Support My Work</h1>
                <p>Your donation helps keep things going. Every contribution matters!</p>
            </div>

            <!-- Body -->
            <div class="card-body">
                <template v-if="!success">
                    <!-- Preset amounts -->
                    <label class="section-label">Choose an amount</label>
                    <div class="amount-grid">
                        <button v-for="preset in presets" :key="preset" class="amount-btn"
                            :class="{ active: selectedAmount === preset && !customMode }"
                            @click="selectPreset(preset)">
                            ${{ preset }}
                        </button>
                    </div>

                    <!-- Custom amount -->
                    <div class="custom-amount">
                        <label class="section-label">Or enter a custom amount</label>
                        <div class="input-wrapper">
                            <span class="currency-symbol">$</span>
                            <input v-model="customAmount" type="number" min="1" placeholder="0.00"
                                @focus="customMode = true" @input="customMode = true" />
                        </div>
                    </div>

                    <div class="final-amount" v-if="donationAmount > 0">
                        Donating <strong>${{ donationAmount.toFixed(2) }}</strong>
                    </div>

                    <a :href="paypalUrl" target="_blank" rel="noopener noreferrer"
                        class="donate-btn" @click="onDonateClick">
                        <svg viewBox="0 0 24 24" fill="currentColor" class="paypal-icon">
                            <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.59 3.025-2.566 6.243-8.558 6.243H9.828l-1.52 9.63h4.172c.524 0 .968-.382 1.05-.9l.948-6.006h2.392c4.298 0 6.855-2.107 7.68-6.38.34-1.733.129-3.044-.328-4.3z"/>
                        </svg>
                        Donate with PayPal
                    </a>

                    <p class="secure-note">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lock-icon">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        Secured by PayPal
                    </p>
                </template>

                <!-- Success state -->
                <template v-else>
                    <div class="status-msg success">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M20 6L9 17l-5-5" />
                        </svg>
                        Thank you for your donation!
                    </div>
                    <button class="btn-again" @click="success = false">Donate Again</button>
                </template>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const PAYPAL_LINK = 'https://www.paypal.com/ncp/payment/P752GPNN5PVYS';

const presets = [5, 10, 25, 50];
const selectedAmount = ref(10);
const customAmount = ref('');
const customMode = ref(false);
const success = ref(false);

const donationAmount = computed(() => {
    if (customMode.value && customAmount.value) {
        return parseFloat(customAmount.value) || 0;
    }
    return selectedAmount.value;
});

const paypalUrl = computed(() => {
    if (donationAmount.value > 0) {
        return `${PAYPAL_LINK}?amount=${donationAmount.value.toFixed(2)}`;
    }
    return PAYPAL_LINK;
});

function selectPreset(amount) {
    selectedAmount.value = amount;
    customMode.value = false;
    customAmount.value = '';
}

function onDonateClick() {
    // Show thank you after a short delay (PayPal opens in new tab)
    setTimeout(() => { success.value = true; }, 1500);
}
</script>

<style scoped>
.donations-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 80vh;
    padding: 24px;
}

.card {
    background: #fff;
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
    width: 100%;
    max-width: 460px;
}

.card-header {
    background: linear-gradient(135deg, #003087, #009cde);
    border-radius: 20px 20px 0 0;
    color: #fff;
    padding: 36px 32px 28px;
    text-align: center;
}

.paypal-logo {
    display: block;
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 12px;
    letter-spacing: -0.5px;
}

.card-header h1 {
    font-size: 1.7rem;
    font-weight: 700;
    margin-bottom: 8px;
}

.card-header p {
    font-size: 1.1rem;
    font-weight: 700;
    color: #fff;
    opacity: 1;
    line-height: 1.6;
    margin: 0;
}

.card-body {
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.section-label {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #555;
    margin-bottom: 10px;
}

.amount-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
}

.amount-btn {
    padding: 12px 0;
    border: 2px solid #e0e0e0;
    border-radius: 10px;
    background: #fff;
    font-size: 1rem;
    font-weight: 600;
    color: #333;
    cursor: pointer;
    transition: all 0.2s;
}

.amount-btn:hover {
    border-color: #009cde;
    color: #009cde;
}

.amount-btn.active {
    border-color: #003087;
    background: #003087;
    color: #fff;
}

.custom-amount {
    margin: 0;
    width: 100%;
    box-sizing: border-box;
}

.input-wrapper {
    display: flex;
    align-items: center;
    border: 2px solid #e0e0e0;
    border-radius: 10px;
    overflow: hidden;
    transition: border-color 0.2s;
    width: 100%;
    box-sizing: border-box;
}

.input-wrapper:focus-within {
    border-color: #009cde;
}

.currency-symbol {
    padding: 12px 14px;
    background: #f5f5f5;
    font-size: 1rem;
    font-weight: 600;
    color: #555;
    border-right: 2px solid #e0e0e0;
}

input {
    flex: 1;
    padding: 14px;
    border: none;
    outline: none;
    font-size: 1rem;
    color: #333;
    min-width: 0;
}

input::-webkit-inner-spin-button,
input::-webkit-outer-spin-button {
    -webkit-appearance: none;
}

.final-amount {
    text-align: center;
    font-size: 0.95rem;
    color: #555;
    margin-bottom: 16px;
}

.final-amount strong {
    color: #003087;
    font-size: 1.1rem;
}

.donate-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
    padding: 14px;
    background: #003087;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    border-radius: 10px;
    text-decoration: none;
    transition: background 0.2s;
    border: 2px solid transparent;
}

.donate-btn:hover {
    background: #009cde;
}

.paypal-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
}

.status-msg {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 0.9rem;
    font-weight: 600;
    margin-bottom: 14px;
}

.status-msg svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
}

.status-msg.success {
    background: #e8f5e9;
    color: #2e7d32;
}

.btn-again {
    display: block;
    width: 100%;
    padding: 12px;
    font-size: 1rem;
    font-weight: 600;
    background: #003087;
    color: #fff;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.2s;
}

.btn-again:hover {
    background: #009cde;
}

.secure-note {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 14px;
    font-size: 0.78rem;
    color: #888;
}

.lock-icon {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
}
</style>
