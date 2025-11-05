<template>
    <div class="p-4 max-w-lg mx-auto">
        <h2 class="text-xl font-bold mb-2">Premium Content</h2>

        <!-- Subscription Status -->
        <p v-if="user.isSubscriber" class="mb-2 text-green-600 font-semibold">
            You are a subscriber! 🎉
        </p>
        <p v-else class="mb-2 text-red-600 font-semibold">
            You are not subscribed yet.
        </p>

        <!-- Load premium content button -->
        <button @click="loadContent" class="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 mb-4">
            Load Premium Content
        </button>

        <!-- Premium content display -->
        <div v-if="content" class="p-2 border rounded bg-gray-100 mb-4">
            {{ content.message }}
        </div>

        <!-- PayPal subscription button -->
        <div v-if="!user.isSubscriber" id="paypal-button-container" class="mb-4"></div>

        <!-- Error message -->
        <p v-if="error" class="text-red-500">{{ error }}</p>
    </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useAuth } from "../composables/useAuth.js";

const { user, subscribe, getPremiumContent } = useAuth();
const content = ref(null);
const error = ref(null);

// Load premium content
const loadContent = async () => {
    try {
        content.value = await getPremiumContent();
    } catch (err) {
        error.value = err.message;
    }
};

// Setup PayPal button for subscription
onMounted(() => {
    if (!user.isSubscriber && window.paypal) {
        window.paypal.Buttons({
            createOrder: (data, actions) => {
                return actions.order.create({
                    purchase_units: [{ amount: { value: "9.99" } }],
                });
            },
            onApprove: async (data, actions) => {
                try {
                    await actions.order.capture();
                    await subscribe(); // Call backend to mark user as subscriber
                    alert("Payment successful! Premium content unlocked.");
                } catch (err) {
                    console.error("Subscription activation failed:", err);
                    alert("Subscription failed. Try again.");
                }
            },
            onError: (err) => {
                console.error("PayPal error:", err);
                alert("Payment failed. Please try again.");
            },
        }).render("#paypal-button-container");
    }
});
</script>

<style scoped>
/* Optional: add some spacing or styling tweaks if needed */
</style>