<template>
    <div class="p-6 max-w-2xl mx-auto">
        <h1 class="text-3xl font-bold mb-6">Dashboard</h1>

        <div class="mb-6 p-4 border rounded bg-gray-50">
            <h3 class="text-xl font-semibold mb-2">User Info</h3>
            <p><strong>Username:</strong> {{ user.username }}</p>
            <p><strong>Email:</strong> {{ user.email }}</p>
            <p>
                <strong>Status:</strong>
                <span :class="user.isSubscriber ? 'text-green-600' : 'text-red-600'">
                    {{ user.isSubscriber ? "Subscriber ✅" : "Free User ❌" }}
                </span>
            </p>
        </div>

        <div v-if="user.isSubscriber" class="mb-6 p-4 border rounded bg-gray-100">
            <h2 class="text-xl font-semibold mb-2">Premium Content</h2>
            <div v-if="premiumContent">{{ premiumContent.message }}</div>

            <button @click="loadPremiumContent" class="mt-3 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700">
                Reload Premium Content
            </button>
        </div>

        <div v-else id="paypal-button-container" class="mb-6"></div>

        <p v-if="error" class="text-red-500 mt-4">{{ error }}</p>

        <button @click="handleLogout" class="mt-6 bg-black text-white px-4 py-2 rounded hover:bg-gray-800">
            Logout
        </button>
    </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useAuth } from "../composables/useAuth.js";

const { user, getProfile, getPremiumContent, subscribe, error, logout } = useAuth();

const premiumContent = ref(null);

// On mount
onMounted(async () => {
    await getProfile();

    if (user.isSubscriber) {
        premiumContent.value = await getPremiumContent();
    } else {
        setupPayPalButton();
    }
});

// Reload premium
const loadPremiumContent = async () => {
    premiumContent.value = await getPremiumContent();
};

// Logout
const handleLogout = () => {
    logout();
    window.location.href = "/login";
};

// PayPal
const setupPayPalButton = () => {
    if (!window.paypal) return;

    window.paypal.Buttons({
        createOrder: (_, actions) =>
            actions.order.create({
                purchase_units: [{ amount: { value: "9.99" } }],
            }),
        onApprove: async (_, actions) => {
            await actions.order.capture();
            await subscribe();
            premiumContent.value = await getPremiumContent();
        },
    }).render("#paypal-button-container");
};
</script>
