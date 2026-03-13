<template>
    <!--
      Minimal wrapper that provides the DOM node PayPal's JS SDK needs.
      The SDK injects its button UI into #paypal-button-container on mount.
    -->
    <div>
        <div id="paypal-button-container"></div>
    </div>
</template>

<script setup>
// =============================================================================
// PayPalButton.vue — standalone PayPal payment button component
//
// Renders the PayPal Smart Payment Button into #paypal-button-container using
// the PayPal JS SDK (loaded via a <script> tag in index.html).
//
// Flow:
//   1. User clicks the PayPal button → createOrder() builds a $9.99 order
//   2. PayPal redirects the user through their checkout flow
//   3. On approval, onApprove() captures the payment server-side via PayPal,
//      then calls subscribe() to mark the user as a subscriber in our backend
//   4. User sees an alert confirming the subscription is active
//
// Note: This is the simpler of two PayPal components. Paywall.vue has the
// same logic but also displays reactive status/error messages in the template
// rather than using alert(). Both exist for different placement contexts.
//
// Dependency: window.paypal must be available (i.e. the PayPal SDK script
// must have finished loading before this component mounts).
// =============================================================================

import { onMounted } from "vue";
import { useAuth } from "../composables/useAuth.js";

// We only need the subscribe() function to activate the backend subscription
const { subscribe } = useAuth();

// ── Mount: initialise PayPal button ───────────────────────────────────────────

/**
 * Waits for the component to mount before touching the DOM, then checks that
 * window.paypal is available before calling .Buttons(). If the SDK script
 * hasn't loaded yet (e.g. network delay) the button simply won't render —
 * the parent component is responsible for ensuring the SDK is ready.
 */
onMounted(() => {
    if (window.paypal) {
        window.paypal.Buttons({

            /**
             * Called when the user initiates a payment. Creates a PayPal order
             * for the fixed $9.99 subscription price.
             * `actions.order.create()` returns a Promise that resolves to the
             * PayPal order ID which the SDK uses internally.
             */
            createOrder: function (data, actions) {
                return actions.order.create({
                    purchase_units: [
                        {
                            amount: {
                                value: "9.99", // subscription price
                            },
                        },
                    ],
                });
            },

            /**
             * Called when the user approves the payment in the PayPal window.
             * Two steps:
             *   1. Capture the funds via PayPal (finalises the transaction)
             *   2. Call our backend's /subscribe endpoint to flip isSubscriber
             *      to true in the database and update the reactive user ref
             */
            onApprove: async function (data, actions) {
                // Capture the funds from the transaction
                const details = await actions.order.capture();
                console.log("Transaction completed by ", details.payer.name.given_name);

                // 🔑 Call backend to activate subscription
                try {
                    await subscribe();
                    alert("You are now a subscriber! Premium content unlocked.");
                } catch (err) {
                    console.error("Subscription activation failed:", err);
                    alert("Subscription failed. Try again.");
                }
            },

            /**
             * Called if an error occurs in the PayPal SDK or checkout flow
             * (e.g. network error, popup closed, declined card).
             */
            onError: function (err) {
                console.error("PayPal error:", err);
                alert("Payment failed. Please try again.");
            },

        }).render("#paypal-button-container");
    }
});
</script>
