<template>
    <div class="p-6 max-w-lg mx-auto">
        <h1 class="text-2xl font-bold mb-4">Profile</h1>

        <!-- User Info -->
        <div class="mb-4 mb-29">
            <p class="textSadjust"><strong>Username:</strong> {{ user.username }}</p>
            <p class="textSadjust"><strong>Email:</strong> {{ user.email }}</p>
            <p class="textSadjust">
                <strong>Status:</strong>
                <span :class="user.hasDonated ? 'text-green-600' : 'text-red-600'">
                    {{ user.hasDonated ? 'Supporter ❤️' : 'No Donations Yet' }}
                </span>
            </p>
        </div>

        <!-- Logout -->
        <button @click="handleLogout" class="mb-6 bg-black text-white px-4 py-2 rounded hover:bg-gray-800">
            Logout
        </button>

        <!-- Update Username -->
        <div class="mb-4 p-3 border rounded bg-gray-50">
            <h2 class="font-semibold mb-22 mb-2">Change Username</h2>
            <form @submit.prevent="handleUsernameUpdate" class="flex space-x-2">
                <input v-model="newUsername" type="text" placeholder="Enter new username"
                    class="border p-2 rounded w-full" required />
                <button type="submit" class="bg-green-700 text-white px-4 py-2 rounded hover:bg-green-800">
                    Update
                </button>
            </form>
            <p v-if="usernameMessage" class="text-green-600 mt-2">{{ usernameMessage }}</p>
        </div>

        <!-- Donation Acknowledgment -->
        <div v-if="user.hasDonated" class="mb-4 p-3 border rounded bg-green-50">
            <h2 class="font-semibold mb-2">Thank You! ❤️</h2>
            <p>Your support helps keep this project alive.</p>
            <button @click="refreshDonationThanks"
                class="mt-2 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700">
                Refresh Message
            </button>
        </div>

        <!-- Donate Button -->
        <div v-else id="paypal-button-container" class="mb-4"></div>

        <!-- Delete -->
        <div class="mt-6 p-3 border rounded bg-red-50">
            <h2 class="font-semibold text-red-600 mb-2">Delete Account</h2>
            <button @click="confirmDelete" class="bg-red-600 text-white px-4 fixmargin py-2 rounded hover:bg-red-700">
                Delete My Account
            </button>
        </div>

        <p v-if="errorMessage" class="text-red-500 mt-4">{{ errorMessage }}</p>
    </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useAuth } from "../composables/useAuth.js";

const {
    user,
    getProfile,
    markDonation,
    deleteAccount,
    updateUsername,
    logout
} = useAuth();

const errorMessage = ref("");
const newUsername = ref("");
const usernameMessage = ref("");
const donationThanks = ref("Thank you for your support! ❤️");

// Load profile
onMounted(async () => {
    try {
        await getProfile();

        if (!user.hasDonated) {
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

// Refresh donation message (just a visual example)
const refreshDonationThanks = () => {
    donationThanks.value = "Your kindness is truly appreciated! 🙏";
};

// PayPal Donation Button
const setupPayPalButton = () => {
    if (!window.paypal) return;

    window.paypal.Buttons({
        createOrder: (_, actions) =>
            actions.order.create({
                purchase_units: [
                    { amount: { value: "5.00" } }  // donation amount
                ],
            }),

        onApprove: async (_, actions) => {
            await actions.order.capture();
            await markDonation(); // backend: set user.hasDonated = true
            donationThanks.value = "Thank you for donating! ❤️";
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
