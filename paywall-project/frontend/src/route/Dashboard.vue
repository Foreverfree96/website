<template>
    <div class="p-6 max-w-2xl mx-auto">
        <h1 class="text-3xl font-bold mb-6">Dashboard</h1>

        <!-- User Info -->
        <div class="mb-6 p-4 border rounded bg-gray-50">
            <h3 class="text-xl font-semibold mb-2">User Info</h3>
            <p><strong>Username:</strong> {{ user.username }}</p>
            <p><strong>Email:</strong> {{ user.email }}</p>
            <p>
                <strong>Status:</strong>
                <span :class="user.isSubscriber ? 'text-green-600' : 'text-red-600'">
                    {{ user.isSubscriber ? 'Subscriber ✅' : 'Free User ❌' }}
                </span>
            </p>
        </div>

        <!-- Premium Content Section -->
        <div v-if="user.isSubscriber" class="mb-6 p-4 border rounded bg-gray-100">
            <h2 class="text-xl font-semibold mb-2">Premium Content</h2>
            <div v-if="premiumContent">{{ premiumContent.message }}</div>
            <button v-if="premiumContent" @click="loadPremiumContent"
                class="mt-3 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700">
                Reload Premium Content
            </button>
        </div>

        <!-- PayPal Subscription -->
        <div v-else id="paypal-button-container" class="mb-6"></div>

        <!-- Error message -->
        <p v-if="error" class="text-red-500">{{ error }}</p>
    </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useAuth } from "../composables/useAuth.js";

const { user, getProfile, getPremiumContent, subscribe, error } = useAuth();
const premiumContent = ref(null);

// Load user info on mount
onMounted(async () => {
    try {
        await getProfile();

        if (user.isSubscriber) {
            premiumContent.value = await getPremiumContent();
        } else {
            setupPayPalButton();
        }
    } catch (err) {
        console.error(err);
    }
});

// Load premium content manually
const loadPremiumContent = async () => {
    try {
        premiumContent.value = await getPremiumContent();
    } catch (err) {
        console.error(err);
    }
};

// Setup PayPal button for subscription
const setupPayPalButton = () => {
    if (window.paypal) {
        window.paypal.Buttons({
            createOrder: (data, actions) => {
                return actions.order.create({
                    purchase_units: [{ amount: { value: "9.99" } }],
                });
            },
            onApprove: async (data, actions) => {
                try {
                    await actions.order.capture();
                    await subscribe();
                    alert("Payment successful! Premium content unlocked.");
                    premiumContent.value = await getPremiumContent();
                } catch (err) {
                    console.error("Subscription failed:", err);
                    alert("Subscription failed. Try again.");
                }
            },
            onError: (err) => {
                console.error("PayPal error:", err);
                alert("Payment failed. Please try again.");
            },
        }).render("#paypal-button-container");
    }
};
</script>

<style scoped>
/* Optional styling for dashboard */
</style>
