<template>
    <div class="home-page">
        <!-- ── Hero section ── -->
        <div class="hero">
            <!--
              Personalised greeting when logged in.
              Falls back to the generic tagline when the visitor is a guest,
              because user.username will be an empty string / undefined.
            -->
            <h1 class="hero-title">
                Welcome<span v-if="user.username">, {{ user.username }}!</span><span v-else> to Creator Hub!</span>
            </h1>
            <p class="hero-sub">
                Share your music, videos, streams, and more. Follow creators you love.
            </p>

            <!-- CTA button row — different actions for guests vs. authenticated users -->
            <div class="hero-actions">
                <!-- Guest CTAs: encourage sign-up and login -->
                <router-link v-if="!user.username" to="/signup" class="auth-button hero-btn primary-btn">Get Started</router-link>
                <router-link v-if="!user.username" to="/login" class="auth-button hero-btn">Login</router-link>

                <!-- Authenticated CTAs: go straight to content or creation -->
                <router-link v-if="user.username" to="/feed" class="auth-button hero-btn primary-btn">Browse Feed</router-link>
                <router-link v-if="user.username" to="/create-post" class="auth-button hero-btn">Create Post</router-link>
            </div>
        </div>

        <!-- ── Category explorer ── -->

        <!-- Section label styled as a small-caps eyebrow above the grid -->
        <div class="section-label">Explore by Category</div>

        <!--
          Category cards grid.
          Each card is a <router-link> that navigates to /feed with a
          pre-selected category filter (?category=<slug>).
          The --accent CSS custom property is injected per-card so the hover
          border and "Explore →" CTA can each use a unique brand colour without
          needing separate CSS classes for every category.
        -->
        <div class="features-grid">
            <router-link
                v-for="cat in categoryCards" :key="cat.slug"
                :to="`/feed?category=${encodeURIComponent(cat.slug)}`"
                class="feature-card"
                :style="{ '--accent': cat.accent }"
            >
                <!-- Large emoji acts as the card's visual icon -->
                <span class="feature-icon">{{ cat.icon }}</span>
                <h3>{{ cat.label }}</h3>
                <p>{{ cat.desc }}</p>
                <!-- "Explore →" fades in on hover via CSS transition -->
                <span class="card-cta">Explore →</span>
            </router-link>
        </div>
    </div>
</template>

<script setup>
/**
 * HomePage.vue — Landing / home page
 *
 * This is the first page most visitors see. It serves two purposes:
 *
 *  1. Hero section — shows a context-aware greeting (personalised for logged-in
 *     users, generic for guests) and CTA buttons that differ depending on whether
 *     the visitor has an account.
 *
 *  2. Category explorer grid — five clickable cards, one per content category,
 *     that deep-link into the Feed with that category pre-selected.  Each card
 *     has its own accent colour injected as a CSS custom property so the hover
 *     state feels unique without a long chain of modifier classes.
 *
 * There is no complex data-fetching logic here — the only async work is a
 * best-effort profile refresh on mount to ensure the hero greeting shows the
 * correct username after a hard page reload.
 */
import { onMounted } from "vue";
import { useAuth } from "../composables/useAuth.js";

// ─── AUTH ─────────────────────────────────────────────────────────────────────

/**
 * useAuth composable:
 *   user       — reactive object; `user.username` is used to personalise the
 *                hero heading and to conditionally render the correct CTA buttons.
 *   getProfile — async function that fetches the current user's profile from
 *                the API and updates the reactive `user` object in place.
 */
const { user, getProfile } = useAuth();

// ─── LIFECYCLE ────────────────────────────────────────────────────────────────

/**
 * onMounted — refresh the user profile from the API on every visit.
 *
 * This guards against a stale username in the hero heading after a token
 * refresh or profile update in another tab.  Errors are silently swallowed
 * because a failed refresh should not break the page for guests (who have
 * no token) or when the API is temporarily unavailable.
 */
onMounted(async () => {
    try { await getProfile(); } catch {}
});

// ─── CATEGORY CARDS ───────────────────────────────────────────────────────────

/**
 * categoryCards — static configuration array for the Explore grid.
 *
 * Each entry describes one category card:
 *   slug   — the exact string passed as ?category= in the feed URL.
 *            Must match the values stored in posts on the backend.
 *   icon   — emoji displayed prominently at the top of the card.
 *   label  — human-readable name shown as the card heading.
 *   accent — CSS colour hex used for the hover border and the "Explore →"
 *            call-to-action text.  Injected via the --accent custom property.
 *   desc   — one-line description of the category shown in smaller text.
 */
const categoryCards = [
    { slug: 'Music',            icon: '🎵', label: 'Music',          accent: '#14532d', desc: 'Tracks, playlists, and audio creations.' },
    { slug: 'Videos',           icon: '🎬', label: 'Videos',         accent: '#7f1d1d', desc: 'YouTube embeds and video content.' },
    { slug: 'Streamer',         icon: '🎮', label: 'Streaming',      accent: '#3b0764', desc: 'Twitch streams and live content.' },
    { slug: 'Pictures',         icon: '📷', label: 'Pictures',       accent: '#78350f', desc: 'Photography and visual art.' },
    { slug: 'Blogger / Writer', icon: '✍️', label: 'Blog & Writing', accent: '#0c4a6e', desc: 'Stories, essays, and written works.' },
];
</script>

<style scoped>
.home-page {
    max-width: 960px;
    margin: 0 auto;
    padding: 40px 24px 80px;
}

.hero {
    text-align: center;
    padding: 60px 20px 48px;
    border-bottom: 3px solid #000;
    margin-bottom: 40px;
}

.hero-title {
    font-size: 2.8rem;
    font-weight: 700;
    color: #000;
    margin: 0 0 16px;
    line-height: 1.2;
}

.hero-sub {
    font-size: 1.15rem;
    color: #333;
    max-width: 480px;
    margin: 0 auto 32px;
    line-height: 1.5;
}

.hero-actions {
    display: flex;
    gap: 14px;
    justify-content: center;
    flex-wrap: wrap;
}

/* Override generic .auth-button sizing for the larger hero context */
.hero-btn {
    width: auto !important;
    height: auto !important;
    padding: 12px 28px !important;
    font-size: 1rem !important;
    margin: 0 !important;
}

/* Primary (filled green) CTA — used for the most important action */
.primary-btn {
    border-color: #14532d !important;
    background: #14532d !important;
    color: #fff !important;
}
.primary-btn:hover { background: #166534 !important; }

/* Small-caps eyebrow label above the category grid */
.section-label {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #555;
    margin-bottom: 14px;
}

/* 5-column equal grid; collapses at smaller breakpoints below */
.features-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 14px;
}

.feature-card {
    background: pink;
    border: 3px solid #000;
    border-radius: 14px;
    padding: 24px 14px 18px;
    text-align: center;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    position: relative;
    overflow: hidden;
    transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
    cursor: pointer;
}
/* On hover: lift the card, cast a shadow, and use the card's own accent colour */
.feature-card:hover {
    transform: translateY(-6px);
    box-shadow: 0 10px 24px rgba(0,0,0,0.22);
    border-color: var(--accent, #14532d);
}

.feature-icon {
    font-size: 2.2rem;
    display: block;
    margin-bottom: 4px;
    transition: transform 0.22s ease;
}
/* Emoji scales up slightly when the card is hovered */
.feature-card:hover .feature-icon { transform: scale(1.15); }

.feature-card h3 {
    font-size: 0.95rem;
    font-weight: 700;
    color: #000;
    margin: 0;
}

.feature-card p {
    font-size: 0.8rem;
    color: #444;
    margin: 0;
    line-height: 1.4;
}

/* "Explore →" CTA is invisible at rest, slides up and fades in on hover */
.card-cta {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--accent, #14532d);
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 0.2s ease, transform 0.2s ease;
    margin-top: 4px;
}
.feature-card:hover .card-cta {
    opacity: 1;
    transform: translateY(0);
}

/* ── Responsive ── */

/* Large tablet: shrink container, collapse to 3 columns */
@media (max-width: 1024px) {
    .home-page { max-width: 800px; padding: 30px 20px 60px; }
    .hero-title { font-size: 2.4rem; }
    .features-grid { grid-template-columns: repeat(3, 1fr); }
}

/* Tablet portrait */
@media (max-width: 768px) {
    .home-page { padding: 24px 16px 50px; }
    .hero { padding: 44px 16px 36px; margin-bottom: 30px; }
    .hero-title { font-size: 2.1rem; }
    .hero-sub { font-size: 1.05rem; }
    .features-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
}

/* Large phone */
@media (max-width: 600px) {
    .home-page { padding: 18px 10px 44px; }
    .hero { padding: 36px 12px 28px; margin-bottom: 24px; }
    .hero-title { font-size: 1.8rem; }
    .hero-sub { font-size: 1rem; margin-bottom: 24px; }
    .hero-btn { padding: 10px 22px !important; font-size: 0.95rem !important; }
    .features-grid { gap: 10px; }
    .feature-card { padding: 18px 10px 14px; border-radius: 10px; }
    .feature-icon { font-size: 1.8rem; }
    .feature-card h3 { font-size: 0.88rem; }
    .feature-card p { font-size: 0.75rem; }
}

/* Phone */
@media (max-width: 480px) {
    .home-page { padding: 14px 8px 40px; }
    .hero { padding: 28px 8px 22px; }
    .hero-title { font-size: 1.5rem; }
    .hero-sub { font-size: 0.92rem; }
    .hero-actions { gap: 10px; }
    .hero-btn { padding: 9px 18px !important; font-size: 0.9rem !important; }
    .features-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .feature-card { padding: 14px 8px 12px; }
    .feature-icon { font-size: 1.55rem; margin-bottom: 2px; }
}

/* Small phone (360px) — stack CTA buttons vertically when space is very tight */
@media (max-width: 360px) {
    .hero-title { font-size: 1.35rem; }
    .hero-sub { font-size: 0.88rem; }
    .hero-actions { flex-direction: column; align-items: center; }
    .hero-btn { width: 80% !important; text-align: center; justify-content: center; }
    .features-grid { grid-template-columns: 1fr 1fr; gap: 6px; }
    .feature-card { padding: 12px 6px 10px; border-radius: 8px; }
    .feature-icon { font-size: 1.3rem; }
}

/* Very small phone (320px) — single column grid */
@media (max-width: 320px) {
    .home-page { padding: 10px 6px 36px; }
    .hero-title { font-size: 1.2rem; }
    .features-grid { grid-template-columns: 1fr; }
}

/* Landscape phone — tighten vertical rhythm when height is limited */
@media (max-height: 500px) and (orientation: landscape) {
    .hero { padding: 20px 20px; margin-bottom: 20px; }
    .hero-title { font-size: 1.6rem; }
    /* Restore 5 columns in landscape where horizontal space is sufficient */
    .features-grid { grid-template-columns: repeat(5, 1fr); }
}
</style>
