<template>
    <div class="p-6 max-w-lg mx-auto">
        <h1 class="text-2xl font-bold mb-4">Profile</h1>

        <!-- User Info -->
        <div class="mb-4">
            <p><strong>Username:</strong> {{ user.username }}</p>
            <p><strong>Email:</strong> {{ user.email }}</p>
            <p>
                <strong>Status:</strong>
                <span :class="user.isSubscriber ? 'text-green-600' : 'text-red-600'">
                    {{ user.isSubscriber ? 'Subscriber ✅' : 'Free User ❌' }}
                </span>
            </p>
        </div>

        <!-- Update Username -->
        <div class="mb-4 p-3 border rounded bg-gray-50">
            <h2 class="font-semibold mb-2">Change Username</h2>
            <form @submit.prevent="handleUsernameUpdate" class="flex space-x-2">
                <input v-model="newUsername" type="text" placeholder="Enter new username"
                    class="border p-2 rounded w-full" required />
                <button type="submit" class="bg-green-700 text-white px-4 py-2 rounded hover:bg-green-800">
                    Update
                </button>
            </form>
            <p v-if="usernameMessage" class="text-green-600 mt-2">{{ usernameMessage }}</p>
        </div>

        <!-- Premium Content -->
        <div v-if="user.isSubscriber" class="mb-4 p-3 border rounded bg-gray-100">
            <h2 class="font-semibold mb-2">Premium Content</h2>
            <div v-if="premiumContent">{{ premiumContent.message }}</div>
            <button @click="loadPremiumContent" class="mt-2 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700">
                Reload Premium Content
            </button>
        </div>

        <!-- PayPal Section -->
        <div v-else id="paypal-button-container" class="mb-4"></div>

        <!-- Delete Account -->
        <div class="mt-6 p-3 border rounded bg-red-50">
            <h2 class="font-semibold text-red-600 mb-2">Delete Account</h2>
            <p class="text-sm text-gray-600 mb-3">
                This will permanently remove your account and all data.
            </p>
            <button @click="confirmDelete" class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
                Delete My Account
            </button>
        </div>

        <p v-if="errorMessage" class="text-red-500 mt-4">{{ errorMessage }}</p>
    </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useAuth } from "../composables/useAuth.js";

const { user, getProfile, getPremiumContent, subscribe, deleteAccount, updateUsername } = useAuth();
const premiumContent = ref(null);
const errorMessage = ref("");
const newUsername = ref("");
const usernameMessage = ref("");

// Load profile
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
        errorMessage.value = "Failed to load profile.";
    }
});

// Reload premium content
const loadPremiumContent = async () => {
    try {
        premiumContent.value = await getPremiumContent();
    } catch (err) {
        console.error(err);
        errorMessage.value = "Failed to load premium content.";
    }
};

// PayPal Setup
const setupPayPalButton = () => {
    if (!window.paypal) return;

    window.paypal.Buttons({
        createOrder: (data, actions) => {
            return actions.order.create({ purchase_units: [{ amount: { value: "9.99" } }] });
        },
        onApprove: async (data, actions) => {
            try {
                await actions.order.capture();
                await subscribe();
                alert("Payment successful! Premium content unlocked.");
                premiumContent.value = await getPremiumContent();
            } catch (err) {
                console.error(err);
                alert("Subscription failed.");
            }
        },
        onError: (err) => {
            console.error(err);
            alert("Payment error. Try again.");
        }
    }).render("#paypal-button-container");
};

// Update username
const handleUsernameUpdate = async () => {
    try {
        const res = await updateUsername(newUsername.value);
        usernameMessage.value = "Username updated!";
        newUsername.value = "";
    } catch (err) {
        console.error(err);
        errorMessage.value = err.message;
    }
};

// Delete account
const confirmDelete = async () => {
    const confirmed = confirm("Are you sure you want to delete your account?");
    if (!confirmed) return;

    try {
        await deleteAccount();
        alert("Account deleted.");
        window.location.href = "/signup";
    } catch (err) {
        console.error(err);
        errorMessage.value = err.message;
    }
};
</script>

<style scoped>
button {
    transition: all 0.2s ease-in-out;
}

button:hover {
    transform: translateY(-2px);
}
</style>