<template>
    <div class="auth-wrapper min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <h2 class="text-2xl font-bold mb-4">Login</h2>

        <form @submit.prevent="handleLogin" class="auth-form bg-white p-6 rounded shadow-md w-80">
            <input v-model="username" type="text" placeholder="Username"
                class="auth-input mb-3 w-full p-2 border rounded" required />
            <input v-model="password" type="password" placeholder="Password"
                class="auth-input mb-3 w-full p-2 border rounded" required />
            <button type="submit"
                class="auth-button w-full bg-charcoal text-white py-2 rounded border border-green-800 shadow-md hover:bg-black transition duration-300">
                Login
            </button>
        </form>

        <p class="mt-4 text-sm text-gray-500">
            Don't have an account?
            <button class="signup-button1"><router-link to="/signup"
                    class="auth-link t1-size text-green-700 hover:underline">Sign Up</router-link></button>
        </p>

        <p v-if="error" class="auth-error mt-2 text-red-500">{{ error }}</p>
    </div>
</template>

<script setup>
import { ref } from "vue";
import { useAuth } from "../composables/useAuth.js";

const { login, error } = useAuth();
const username = ref("");
const password = ref("");

const handleLogin = async () => {
    try {
        await login(username.value, password.value);
        window.location.href = "/profile"; // redirect after login
    } catch (err) {
        console.error(err);
    }
};
</script>
<style lang="scss" scoped>
@use '../assets/_variables.scss' as *;

.auth-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.auth-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.auth-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border-radius: $radius-md;
    border: 2px solid $color-gray-border;
    outline: none;
    transition: box-shadow $transition-medium, border-color $transition-medium;

    &:focus {
        border-color: $color-pink;
        box-shadow: 0 0 0 3px rgba(255, 182, 193, 0.3);
    }

    &.border-red-500 {
        border-color: $color-red-error;
    }
}

.auth-button {
    font-size: $font-size-md;
    font-weight: 600;
    padding: $space-sm $space-lg;
    margin-top: $space-sm;
    border-radius: $radius-sm;
    background-color: $color-black;
    color: $color-pink;
    border: $border-bold solid $color-green-dark;
    cursor: pointer;
    transition: box-shadow $transition-medium ease, transform $transition-fast ease-in;

    &:hover {
        color: $color-green-hover;
        box-shadow: $shadow-heavy;
        transform: translateY(-2px);
    }

    &:active {
        transform: translateY(0);
    }
}

.auth-error {
    font-weight: 300;
    color: $color-red-error;
    font-size: $font-size-md;
    text-align: center;
}
</style>