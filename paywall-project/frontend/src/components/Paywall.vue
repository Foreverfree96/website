<template>
    <div class="p-4 border rounded bg-gray-100 max-w-md mx-auto">
        <h2 class="text-xl font-bold mb-4">Subscribe to access premium content</h2>

        <!-- PayPal Button Container -->
        <div id="paypal-button-container"></div>

        <!-- Status / Error Messages -->
        <p v-if="status" class="mt-2 text-green-600">{{ status }}</p>
        <p v-if="error" class="mt-2 text-red-600">{{ error }}</p>
    </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useAuth } from "../composables/useAuth.js";

const { user, subscribe } = useAuth();
const status = ref("");
const error = ref("");

// Setup PayPal button
onMounted(() => {
    if (window.paypal && !user.isSubscriber) {
        window.paypal.Buttons({
            createOrder: (data, actions) => {
                // Create order for $9.99 subscription
                return actions.order.create({
                    purchase_units: [{ amount: { value: "9.99" } }],
                });
            },
            onApprove: async (data, actions) => {
                try {
                    await actions.order.capture(); // Capture payment
                    await subscribe(); // Call backend to mark user as subscriber
                    status.value = "Payment successful! You are now a subscriber.";
                } catch (err) {
                    console.error(err);
                    error.value = "Subscription failed. Please try again.";
                }
            },
            onError: (err) => {
                console.error(err);
                error.value = "PayPal error occurred. Please try again.";
            },
        }).render("#paypal-button-container");
    }
});
</script>