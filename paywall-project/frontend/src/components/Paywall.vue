<template>
    <div class="p-4 border rounded bg-gray-100 max-w-md mx-auto">
        <h2 class="text-xl font-bold mb-4">Subscribe to access premium content</h2>

        <!-- PayPal mounts its button UI into this container on mount -->
        <div id="paypal-button-container"></div>

        <!-- Status / Error Messages -->
        <!-- success is shown in green after a completed payment -->
        <p v-if="status" class="mt-2 text-green-600">{{ status }}</p>
        <!-- error is shown in red if capture or subscription activation fails -->
        <p v-if="error" class="mt-2 text-red-600">{{ error }}</p>
    </div>
</template>

<script setup>
// =============================================================================
// Paywall.vue — subscription paywall component with inline PayPal button
//
// Shown to non-subscriber users when they try to access premium content.
// Renders the PayPal Smart Payment Button and handles the full payment +
// subscription activation flow.
//
// Differences from PayPalButton.vue:
//   - Uses reactive `status` and `error` refs for in-template feedback
//     (no alert() calls)
//   - Checks user.isSubscriber before rendering the button — if the user
//     is already subscribed there is no point showing the payment button
//
// Flow:
//   1. onMounted checks window.paypal is available AND user is not already
//      a subscriber, then renders the PayPal button
//   2. createOrder() creates a $9.99 order via the PayPal SDK
//   3. onApprove() captures the payment, then calls subscribe() to activate
//      the subscription in our backend
//   4. status/error refs update the template with feedback
//
// Dependency: window.paypal must be available (PayPal SDK script in index.html)
// =============================================================================

import { onMounted, ref } from "vue";
import { useAuth } from "../composables/useAuth.js";

// ── Composable ─────────────────────────────────────────────────────────────────

const { user, subscribe } = useAuth();

// ── Local reactive state ───────────────────────────────────────────────────────

// Displayed in green after a successful payment + subscription activation
const status = ref("");

// Displayed in red if the payment capture or backend call fails
const error = ref("");

// ── Mount: initialise PayPal button ───────────────────────────────────────────

/**
 * Sets up the PayPal button after the component mounts.
 * Guard conditions:
 *   - window.paypal must exist (SDK loaded)
 *   - user.isSubscriber must be falsy (don't show the button if already subscribed)
 */
onMounted(() => {
    if (window.paypal && !user.isSubscriber) {
        window.paypal.Buttons({

            /**
             * Creates a PayPal order for the $9.99 subscription price.
             * Returns a Promise that resolves to the order ID used internally
             * by the PayPal SDK to track the payment session.
             */
            createOrder: (data, actions) => {
                // Create order for $9.99 subscription
                return actions.order.create({
                    purchase_units: [{ amount: { value: "9.99" } }],
                });
            },

            /**
             * Called when the user approves the payment in PayPal's popup.
             * Two sequential steps:
             *   1. Capture the funds — finalises the transaction with PayPal
             *   2. Call our /subscribe backend endpoint — marks the user as a
             *      subscriber in MongoDB and updates the reactive user ref
             * On success, sets status to a confirmation message.
             * On failure, sets error so the template shows feedback.
             */
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

            /**
             * Called if the PayPal SDK encounters an error (e.g. popup blocked,
             * network failure, card declined at PayPal's end).
             */
            onError: (err) => {
                console.error(err);
                error.value = "PayPal error occurred. Please try again.";
            },

        }).render("#paypal-button-container");
    }
});
</script>
