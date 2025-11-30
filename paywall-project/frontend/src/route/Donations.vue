<template>
    <div class="donations-wrapper max-w-lg mx-auto p-6">
        <h2 class="text-3xl font-bold mb-4 text-center">Support Us</h2>

        <p class="text-gray-700 mb-6 text-center ">
            If you enjoy our content, you can support the project by making a donation.
        </p>

        <!-- Thank You Message Button -->
        <button @click="showThankYou" class="bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 mb-6 w-full">
            View Supporter Message
        </button>

        <!-- Thank You Message -->
        <div v-if="message" class="bg-green-100 border border-green-400 p-4 rounded mb-6 text-center">
            {{ message }}
        </div>

        <!-- PayPal Donate Button -->
        <h3 class="text-xl font-semibold mb-2 text-center txtsize22">Donate via PayPal</h3>
        <div id="paypal-donate-btn" class="flex justify-center"></div>

        <!-- Error -->
        <p v-if="error" class="text-red-500 text-center mt-4">{{ error }}</p>
    </div>
</template>

<script setup>
import { ref, onMounted } from "vue";

const message = ref(null);
const error = ref(null);

// Show a simple thank-you message
const showThankYou = () => {
    message.value = "Thank you for supporting the project! Your donation keeps this site running ❤️";
};

// Dynamically load PayPal SDK
const loadPayPalScript = () => {
    return new Promise((resolve, reject) => {
        if (document.getElementById("paypal-sdk")) {
            resolve();
            return;
        }

        const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
        if (!clientId) {
            reject(new Error("PayPal client ID is missing. Check your frontend .env file!"));
            return;
        }

        const script = document.createElement("script");
        script.id = "paypal-sdk";
        script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error("Failed to load PayPal SDK"));
        document.body.appendChild(script);
    });
};

// Setup PayPal buttons
const setupPayPal = async () => {
    try {
        await loadPayPalScript();

        if (!window.paypal) throw new Error("PayPal SDK did not load");

        window.paypal.Buttons({
            style: {
                layout: "vertical",
                color: "black",
                shape: "rect",
                label: "donate",
                height: 45,
            },
            createOrder: (data, actions) => {
                return actions.order.create({
                    purchase_units: [
                        {
                            amount: { value: "5.00" },
                            description: "Support Donation",
                        },
                    ],
                });
            },
            onApprove: async (data, actions) => {
                try {
                    await actions.order.capture();
                    alert("Thank you for your donation! ❤️");
                } catch (err) {
                    console.error("Donation failed:", err);
                    error.value = "Payment failed. Please try again.";
                }
            },
            onError: (err) => {
                console.error("PayPal error:", err);
                error.value = "Payment error. Please try again.";
            },
        }).render("#paypal-donate-btn");

    } catch (err) {
        console.error(err);
        error.value = err.message || "Unable to load PayPal. Please try again later.";
    }
};

onMounted(() => {
    setupPayPal();
});
</script>

<style scoped>
.donations-wrapper {
    border-radius: 12px;
    padding: 2rem;

}

button {
    font-weight: 600;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}
</style>