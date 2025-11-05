<template>
    <div>
        <div id="paypal-button-container"></div>
    </div>
</template>

<script setup>
import { onMounted } from "vue";
import { useAuth } from "../composables/useAuth.js";

const { subscribe } = useAuth();

onMounted(() => {
    if (window.paypal) {
        window.paypal.Buttons({
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
            onError: function (err) {
                console.error("PayPal error:", err);
                alert("Payment failed. Please try again.");
            },
        }).render("#paypal-button-container");
    }
});
</script>