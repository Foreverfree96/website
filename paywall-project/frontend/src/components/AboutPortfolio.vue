<!-- src/pages/Portfolio.vue -->
<template>
    <section class="about-portfolio">
        <!-- ABOUT — profile photo + bio text side-by-side -->
        <div class="about about-flex">
            <!-- Profile image container: blurred duplicate behind the sharp image creates a depth effect -->
            <div class="profile-container">
                <!-- Blurred, colour-popped background layer (purely decorative) -->
                <img :src="profileImage" alt="Austin Carter" class="profile-bg" />
                <!-- Sharp foreground profile photo -->
                <img :src="profileImage" alt="Austin Carter" class="profile-img" />
            </div>

            <!-- Bio text column -->
            <div class="about-text">
                <h1>Hi, I'm Austin 👋</h1>
                <p>
                    I'm a software & web developer focused on building clean, functional applications using modern
                    tools.
                    After years as a professional dancer, I've channeled the same creativity, discipline, and attention
                    to detail
                    into coding — turning ideas into real, interactive, and beautiful products.
                </p>
                <p>
                    I work primarily with Vue 3, JavaScript, Node.js, and MongoDB. What excites me most about software
                    development
                    is the endless opportunity to experiment, learn, and create — it's as fun and rewarding to me as
                    performing
                    on stage once was.
                </p>
                <p>
                    Every project is a new challenge, a new rhythm to master, and I approach coding with the same
                    passion,
                    energy, and precision that guided my dancing career.
                </p>
            </div>
        </div>
        <!-- PORTFOLIO -->


        <!-- RESUME — download button + inline preview iframe -->
        <div class="resume">

            <!-- Direct download link for the PDF asset -->
            <a :href="resumeFile" target="_blank" download class="btn-download">
                Download Resume
            </a>

            <!-- iframe preview: uses Google Docs viewer on mobile because
                 iOS/Android browsers cannot natively render PDFs inside iframes -->
            <iframe :src="previewSrc" class="resume-preview"></iframe>

        </div>
    </section>
</template>

<script setup>
/**
 * AboutPortfolio.vue — Developer portfolio / about page
 *
 * Displays a personal bio with a stylised profile photo and an inline
 * resume preview.  On mobile devices the PDF is proxied through Google
 * Docs Viewer because native PDF iframe rendering is unreliable on iOS
 * and Android.
 */

// ─── ASSET IMPORTS ───────────────────────────────────────────────────────────

// Vite resolves these at build time and returns cache-busted URLs.
import profileImg from '../assets/Austin_Carter_Profile.png'
import resumePdf from '../assets/Austin_Carter_Resume1.pdf'

// ─── TEMPLATE BINDINGS ───────────────────────────────────────────────────────

// Bind the resolved asset URLs to template variables for :src / :href.
const profileImage = profileImg
const resumeFile = resumePdf

// ─── MOBILE PDF PREVIEW ──────────────────────────────────────────────────────

/**
 * isMobile
 * Simple UA-string sniff to detect iOS / Android devices.
 * navigator.userAgent is synchronous and available in all target browsers.
 */
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

/**
 * previewSrc
 * On mobile: wrap the PDF URL in Google Docs Viewer so it renders inside
 * the iframe without requiring a native PDF plugin.
 * On desktop: point directly at the PDF asset.
 */
const previewSrc = isMobile
  ? `https://docs.google.com/viewer?url=${encodeURIComponent(window.location.origin + resumePdf)}&embedded=true`
  : resumePdf

// ─── PROJECTS DATA ───────────────────────────────────────────────────────────

/**
 * projects — static portfolio project entries.
 * Not currently rendered in the template (the portfolio section is a
 * placeholder), but kept here for future use.
 */
const projects = [
    {
        title: "Personal Portfolio",
        description: "My personal website built with Vue 3.",
        tech: ["Vue 3", "Vite", "CSS"],
        demo: "#",
        github: "#"
    },
    {
        title: "Full Stack App",
        description: "A full stack app with authentication and CRUD features.",
        tech: ["Node", "Express", "MongoDB"],
        demo: "",
        github: "#"
    }
]
</script>

<style scoped lang="scss">
@use '../assets/variables' as *;

.about-portfolio {
    max-width: 1100px;
    margin: auto;
    padding: 4rem 2rem;
}

/* Flex layout for image + text */
.about-flex {
    display: flex;
    align-items: center;
    gap: 2rem;
    flex-wrap: wrap;
}

/* Profile image with blurred background */
.profile-container {
    position: relative;
    width: 180px;
    height: 180px;
    border-radius: 50%;
    overflow: hidden;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
    /* subtle shadow for depth */
}

.profile-bg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: blur(200px) brightness(0.6) saturate(1.2);
    /* stronger blur + color pop */
    transform: scale(1.3);
    /* expand to hide edges */
    transition: transform 0.3s ease;
}

.profile-img {
    position: relative;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 45%;
    /* slightly thicker, professional color */
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    /* subtle shadow on the image */
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

/* Optional: hover effect for a professional touch */
/* Hover effect without moving the image */
.profile-container:hover .profile-img {
    /* Instead of scaling, add subtle shadow glow */
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3),
        0 0 15px rgba(39, 36, 100, 0.5);
    /* subtle blue glow */
    transition: box-shadow 0.3s ease, filter 0.3s ease;
}

.profile-container:hover .profile-bg {
    /* Slightly brighten the background instead of scaling */
    filter: blur(25px) brightness(0.7) saturate(1.3);
    transition: filter 0.3s ease;
}


/* About text */
.about-text h1 {
    font-size: 2.6rem;
    margin-bottom: 1rem;
}

.about-text p {
    max-width: 650px;
    line-height: 1.4;
    font-size: 18px;
    font-weight: 500;
}

.about-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

/* Portfolio section */
.portfolio h2,
.resume h2 {
    font-size: 2rem;
    margin-bottom: 1.5rem;
}

.grid {
    display: grid;
    gap: 1.5rem;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.card {
    background: white;
    padding: 1.5rem;
    border-radius: 14px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
    transition: transform 0.2s ease;
}

.card:hover {
    transform: translateY(-6px);
}

.tech {
    margin: 0.75rem 0;
}

.tech span {
    display: inline-block;
    margin-right: 0.5rem;
    font-size: 0.85rem;
    opacity: 0.75;
}

.links a {
    margin-right: 1rem;
    font-weight: 600;
}

/* Resume section */
.resume {
    margin-top: 4rem;
}

.resume-highlights {
    list-style: disc;
    margin-bottom: 1rem;
    margin-left: 1.5rem;
    color: #555;
    font-weight: 500;
}

.btn-download {
    display: inline-block;
    padding: 0.6rem 1.2rem;
    background-color: $color-pink;
    /* Tailwind pink-500 */
    color: black;
    border-radius: 6px;
    font-weight: 600;
    font-size: 22px;
    text-decoration: none;
    margin-top: 1rem;
    transition: all 0.3s ease;
    /* smooth hover effect */
}

.btn-download:hover {
    background-color: #000000;
    /* black background */
    color: $color-pink;
    /* text turns pink */
}

.resume-preview {
    width: 100%;
    height: 100vh;
    /* fills parent minus some padding */
    border: 1px solid #ccc;
    border-radius: 8px;
    margin-top: 1rem;
}
</style>
