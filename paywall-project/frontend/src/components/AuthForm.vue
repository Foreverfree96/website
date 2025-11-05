<template>
    <div class="bg-white p-6 rounded shadow-md w-80">
        <h2 class="text-xl font-bold mb-4">{{ props.mode === 'signup' ? 'Sign Up' : 'Login' }}</h2>

        <form @submit.prevent="handleSubmit" class="flex flex-col gap-3">
            <input v-if="props.mode === 'signup'" v-model="name" type="text" placeholder="Name"
                class="border p-2 rounded" required />
            <input v-model="email" type="email" placeholder="Email" class="border p-2 rounded" required />
            <input v-model="password" type="password" placeholder="Password" class="border p-2 rounded" required />
            <button type="submit" class="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700">
                {{ props.mode === 'signup' ? 'Sign Up' : 'Login' }}
            </button>
        </form>

        <p class="mt-4 text-sm text-gray-500">
            <router-link v-if="props.mode === 'signup'" to="/login" class="text-blue-500 hover:underline">Already have
                an account? Login</router-link>
            <router-link v-else to="/signup" class="text-blue-500 hover:underline">Don't have an account? Sign
                Up</router-link>
        </p>

        <p v-if="error" class="mt-2 text-red-500">{{ error }}</p>
    </div>
</template>

<script setup>
import { ref } from "vue";
import { useAuth } from "../composables/useAuth.js";

const props = defineProps({
    mode: { type: String, default: "login" } // login or signup
});

const { signup, login, error } = useAuth();
const name = ref("");
const email = ref("");
const password = ref("");

const handleSubmit = async () => {
    try {
        if (props.mode === "signup") {
            await signup(name.value, email.value, password.value);
        } else {
            await login(email.value, password.value);
        }
        // Redirect to profile page after success
        window.location.href = "/profile";
    } catch (err) {
        console.error(err);
    }
};
</script>