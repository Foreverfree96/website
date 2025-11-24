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

        <!-- Logout -->
        <button @click="handleLogout" class="mb-6 bg-black text-white px-4 py-2 rounded hover:bg-gray-800">
            Logout
        </button>

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

        <!-- PayPal -->
        <div v-else id="paypal-button-container" class="mb-4"></div>

        <!-- Delete -->
        <div class="mt-6 p-3 border rounded bg-red-50">
            <h2 class="font-semibold text-red-600 mb-2">Delete Account</h2>
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

const { user, getProfile, getPremiumContent, subscribe, deleteAccount, updateUsername, logout } = useAuth();

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
        errorMessage.value = "Failed to load profile.";
    }
});

// Logout
const handleLogout = () => {
    logout();
    window.location.href = "/login";
};

// Premium reload
const loadPremiumContent = async () => {
    premiumContent.value = await getPremiumContent();
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

// Username update
const handleUsernameUpdate = async () => {
    try {
        await updateUsername(newUsername.value);
        usernameMessage.value = "Username updated!";
        newUsername.value = "";
    } catch (err) {
        errorMessage.value = err.message;
    }
};

// Delete
const confirmDelete = async () => {
    if (!confirm("Delete account permanently?")) return;
    await deleteAccount();
    window.location.href = "/signup";
};
</script>
