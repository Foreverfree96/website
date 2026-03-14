<template>
  <div class="auth-wrapper create-wrapper">
    <h2 class="lgn-sgnup-txt">Create Post</h2>

    <form @submit.prevent="handleSubmit" class="create-form">

      <!-- ── Category selection ── -->
      <div class="field-label">Category</div>
      <!--
        Badge group — each badge is a toggle button.
        Clicking an active badge a second time deselects it (sets form.category
        back to ''), so the user can clear their choice without picking another.
      -->
      <div class="badge-group">
        <button type="button" v-for="cat in allCategories" :key="cat"
          :class="['badge', { active: form.category === cat }]"
          @click="form.category = form.category === cat ? '' : cat">
          {{ cat }}
        </button>
      </div>

      <!-- ── Title ── -->
      <!-- Optional — a post can exist with body / media only -->
      <input v-model="form.title" type="text" placeholder="Title (optional)" class="create-input" maxlength="150" />

      <!-- ── Body with @mention autocomplete ── -->
      <div class="mention-wrapper">
        <textarea
          v-model="form.body"
          placeholder="What's on your mind? Use @ to mention mutual followers (optional)"
          class="create-input create-textarea"
          maxlength="5000"
          ref="bodyRef"
          @input="handleBodyInput"
          @keydown="handleMentionKeydown"
          @blur="hideMentionDropdownDelayed"
        />

        <!--
          Mention dropdown — floats below the textarea via absolute positioning.
          Only rendered while the user is actively typing an @-token AND there
          are matching mutuals to suggest.
        -->
        <div v-if="mentionDropdown.show && mentionDropdown.results.length" class="mention-dropdown">
          <!--
            mousedown.prevent is essential here: it prevents the textarea from
            losing focus (which would trigger the blur → hideMentionDropdownDelayed
            timeout) before the click event fires on this option.
          -->
          <div
            v-for="(mu, idx) in mentionDropdown.results"
            :key="mu._id"
            class="mention-option"
            :class="{ active: idx === mentionDropdown.activeIndex }"
            @mousedown.prevent="selectMention(mu.username)"
          >
            @{{ mu.username }}
          </div>
        </div>
      </div>

      <!-- ── Media input — branch on Pictures vs. all other categories ── -->

      <!--
        Pictures category: use a direct image URL instead of a platform embed.
        Shows a live preview and an error message if the URL cannot be loaded.
      -->
      <template v-if="form.category === 'Pictures'">
        <div class="field-label">Image URL</div>
        <input v-model="form.imageUrl" type="url" placeholder="Paste a direct image link (jpg, png, gif...)"
          class="create-input" />
        <!-- Preview the image while the user is typing — updates live with v-model -->
        <img v-if="form.imageUrl" :src="form.imageUrl" class="image-preview" alt="Preview"
          @error="imageError = true" @load="imageError = false" />
        <!-- Load-error feedback — shown when the browser cannot fetch the image URL -->
        <p v-if="imageError" class="auth-error" style="font-size:0.85rem;">Could not load image — check the URL.</p>
      </template>

      <!--
        All other categories: accept a platform media URL (YouTube, Twitch,
        Spotify, SoundCloud, Apple Music, Instagram, TikTok, etc.).
        detectEmbed runs on every input keystroke to identify the platform
        and show the human-readable badge + a live embed preview.
      -->
      <template v-else>
        <input v-model="form.mediaUrl" type="url"
          placeholder="Paste a YouTube, Twitch, Spotify, SoundCloud, Apple Music link... (optional)"
          class="create-input" @input="detectEmbed" />
        <!-- Platform detection badge — e.g. "▶ YouTube" or "🎵 Spotify" -->
        <div v-if="form.mediaUrl && detectedType" class="detected-badge">{{ embedLabel }}</div>
        <!-- Live embed preview rendered by the shared MediaEmbed component -->
        <MediaEmbed v-if="form.mediaUrl" :mediaUrl="form.mediaUrl" :embedType="detectedType" />
      </template>

      <!-- ── Private post toggle ── -->
      <label class="tos-label">
        <input type="checkbox" v-model="form.isPrivate" class="tos-checkbox" />
        <span>🔒 Make this post <strong>private</strong> (only visible to you)</span>
      </label>

      <!-- ── Community guidelines consent ── -->
      <!--
        The submit button is disabled until agreedToTos is true.
        This acts as a lightweight content-policy gate that reminds creators
        of the rules before they post.
      -->
      <label class="tos-label">
        <input type="checkbox" v-model="agreedToTos" class="tos-checkbox" />
        <span>I agree to the <strong>community guidelines</strong> — no nudity, violence, hate speech, or spam.</span>
      </label>

      <!-- Submit — disabled while a request is in-flight OR before ToS is ticked -->
      <button type="submit" class="auth-button button-size" :disabled="loading || !agreedToTos">
        {{ loading ? 'Posting...' : 'Post' }}
      </button>

    </form>

    <!-- API / validation error message shown below the form -->
    <p v-if="error" class="auth-error">{{ error }}</p>
  </div>
</template>

<script setup>
/**
 * CreatePost.vue — New post creation form
 *
 * Allows authenticated users to compose a post consisting of:
 *   - An optional category (selected via toggle badges)
 *   - An optional title (max 150 chars)
 *   - An optional body (max 5000 chars) with @mention autocomplete
 *   - Either a direct image URL (for Pictures) or a platform media URL (all others)
 *   - Community guidelines consent checkbox (required before submitting)
 *
 * @mention autocomplete:
 *   Detects when the user types @ inside the body textarea and lazily fetches
 *   the user's mutual followers (people they both follow and follow them back).
 *   Shows up to 6 suggestions in a dropdown below the textarea.  Supports
 *   keyboard navigation (↑/↓/Enter/Tab/Escape) and mouse selection.
 *   On selection, the @query token is replaced with @username in the textarea
 *   body and the cursor is placed right after the inserted mention.
 *
 * Embed detection:
 *   Tests the media URL against known hostname patterns to determine the
 *   platform (YouTube, Twitch, Spotify, etc.) and shows a labelled badge
 *   plus a live embed preview inside the form.
 *
 * On successful submission the user is redirected to the newly created post's
 * detail page via router.push.
 */
import { ref, onMounted, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';
import { usePosts } from '../composables/usePosts.js';
import { useAuth } from '../composables/useAuth.js';
import MediaEmbed from '../components/MediaEmbed.vue';

const router = useRouter();
const route  = useRoute();

// ─── COMPOSABLES ──────────────────────────────────────────────────────────────

/**
 * usePosts composable:
 *   createPost — async function(postData) → post; sends POST /api/posts.
 *   loading    — true while the create request is in-flight; disables the submit button.
 *   error      — reactive string; set by the composable on API errors.
 */
const { createPost, loading, error } = usePosts();

/**
 * useAuth composable:
 *   user — reactive user object.
 *          user.value.id    — used to gate the mention autocomplete (guests skip it).
 *          user.value.categories — array of the creator's own categories; if only
 *                                  one exists it is pre-selected on mount.
 */
const { user } = useAuth();

// ─── @MENTION AUTOCOMPLETE ────────────────────────────────────────────────────

/**
 * bodyRef
 * Template ref bound to the body <textarea>.
 * Needed to read selectionStart (cursor position) and to call
 * setSelectionRange after inserting a mention.
 */
const bodyRef = ref(null);

/**
 * mutualFollowers
 * Lazy-loaded list of mutual followers for the current user.
 *   null  — not yet fetched (initial state).
 *   []    — fetched but empty (user has no mutuals) or fetch failed.
 *   [...] — populated after the first successful API call.
 *
 * Stored here so ensureMutuals is a true one-time fetch — subsequent @
 * triggers re-use the cached list without another network request.
 */
const mutualFollowers = ref(null);

/**
 * mentionDropdown
 * Single reactive object that tracks all dropdown state:
 *
 *   show         — whether the suggestion list is currently visible.
 *   query        — the partial username typed after @ (used to filter mutuals).
 *   results      — filtered subset of mutualFollowers matching the query (max 6).
 *   activeIndex  — index of the keyboard-highlighted row; -1 when none.
 *   triggerStart — character index in the textarea body where the @ character
 *                  sits.  Used by selectMention to know how much text to replace.
 */
const mentionDropdown = ref({
  show: false,
  query: '',
  results: [],
  activeIndex: -1,
  triggerStart: -1,
});

/**
 * ensureMutuals
 *
 * Fetches the mutual-followers list from the API exactly once.
 * Subsequent calls are no-ops (guarded by the `!== null` check).
 *
 * Mutual followers are people who both follow the current user AND whom the
 * current user follows — the set of people who can be @mentioned.
 *
 * On network / auth error the list is set to [] so autocomplete gracefully
 * degrades to showing nothing rather than throwing.
 */
const ensureMutuals = async () => {
  if (mutualFollowers.value !== null) return; // already fetched — skip
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/users/mutual-followers`);
    mutualFollowers.value = res.data.mutuals;
  } catch {
    mutualFollowers.value = []; // degrade gracefully — autocomplete just won't show
  }
};

/**
 * handleBodyInput
 *
 * Fires on every keystroke / paste in the body textarea (via @input).
 *
 * Algorithm:
 *   1. Bail early if the user is not logged in (guests can't mention anyone).
 *   2. Extract the text before the cursor position.
 *   3. Test whether it ends with an @-token: /@([a-zA-Z0-9_]*)$/.
 *      - If yes: lazily fetch mutuals, filter by the partial query, and open
 *                the dropdown with the matching results.
 *      - If no:  close the dropdown (cursor moved away from the @-token).
 */
const handleBodyInput = async (e) => {
  if (!user.value.id) return; // not authenticated — skip mention logic

  const val = e.target.value;
  const cursor = e.target.selectionStart;

  // Only the text up to the cursor matters for detecting an @-token.
  const textBeforeCursor = val.slice(0, cursor);

  // Regex: look for @ followed by zero or more word characters right at the end.
  // Example matches: "@", "@j", "@jane", "@jane_doe"
  const match = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);

  if (match) {
    await ensureMutuals();

    const query = match[1].toLowerCase(); // the partial name typed after @

    // Case-insensitive prefix match against the mutuals list.
    const filtered = (mutualFollowers.value || [])
      .filter(u => u.username.toLowerCase().startsWith(query));

    mentionDropdown.value = {
      show: filtered.length > 0,
      query,
      results: filtered.slice(0, 6), // cap at 6 to keep the dropdown compact
      activeIndex: -1,               // reset keyboard highlight on new query
      // triggerStart is the index of the @ character itself.
      // match[0] includes the @ plus the typed partial name.
      triggerStart: cursor - match[0].length,
    };
  } else {
    // Cursor is no longer inside an @-token — close the dropdown.
    mentionDropdown.value = { ...mentionDropdown.value, show: false };
  }
};

/**
 * handleMentionKeydown
 *
 * Handles keyboard navigation within the mention dropdown.
 * Only acts when the dropdown is currently visible.
 *
 *   ArrowDown — move highlight one row down (clamped to last row).
 *   ArrowUp   — move highlight one row up (clamped to first row).
 *   Enter / Tab — accept the highlighted suggestion (if one is highlighted).
 *                 Tab is included so the user can quickly tab-complete.
 *   Escape    — dismiss the dropdown without selecting anything.
 *
 * e.preventDefault() on navigation keys stops the textarea cursor from
 * jumping / the page from scrolling while the dropdown is open.
 */
const handleMentionKeydown = (e) => {
  const dd = mentionDropdown.value;
  if (!dd.show) return; // dropdown is not open — let the event pass through normally

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    // Clamp to the last result index to avoid going out of bounds.
    mentionDropdown.value.activeIndex = Math.min(dd.activeIndex + 1, dd.results.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    // Clamp to 0 — can't go above the first row.
    mentionDropdown.value.activeIndex = Math.max(dd.activeIndex - 1, 0);
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    // Only intercept if a row is currently highlighted.
    if (dd.activeIndex >= 0 && dd.results[dd.activeIndex]) {
      e.preventDefault();
      selectMention(dd.results[dd.activeIndex].username);
    }
  } else if (e.key === 'Escape') {
    mentionDropdown.value.show = false;
  }
};

/**
 * selectMention
 *
 * Replaces the @query token in the textarea body with @username + a trailing
 * space, then moves the cursor to just after the inserted text.
 *
 * Steps:
 *   1. Slice `before` — everything in the body up to (but not including) the @.
 *   2. Slice `after`  — everything after the current cursor position (any text
 *                       the user typed after the mention token stays intact).
 *   3. Reconstruct the body: before + @username<space> + after.
 *   4. Hide the dropdown.
 *   5. After the DOM updates (nextTick), refocus the textarea and place the
 *      cursor at triggerStart + length of "@username ".
 *
 * @param {string} username — the chosen username (without the @ prefix)
 */
const selectMention = (username) => {
  const dd = mentionDropdown.value;
  const textarea = bodyRef.value;
  const cursor = textarea.selectionStart;

  // Everything before the @ character that started the token.
  const before = form.value.body.slice(0, dd.triggerStart);
  // Everything after the cursor (preserves text typed after the mention).
  const after = form.value.body.slice(cursor);

  // Replace the @query with the full @username followed by a space.
  form.value.body = `${before}@${username} ${after}`;

  mentionDropdown.value.show = false;

  // Move cursor to right after "@username " once Vue has updated the DOM.
  nextTick(() => {
    // +1 for the "@" character, +1 for the trailing space.
    const newCursor = dd.triggerStart + username.length + 2;
    textarea.focus();
    textarea.setSelectionRange(newCursor, newCursor);
  });
};

/**
 * hideMentionDropdownDelayed
 *
 * Hides the dropdown 150 ms after the textarea loses focus (blur event).
 *
 * The delay is necessary because a mouse click on a dropdown option fires
 * the blur event on the textarea BEFORE the click event on the option.
 * Without the delay the dropdown would be hidden before mousedown.prevent
 * on the option can register the click, making mouse selection impossible.
 */
const hideMentionDropdownDelayed = () => {
  setTimeout(() => {
    mentionDropdown.value.show = false;
  }, 150);
};

// ─── FORM STATE ───────────────────────────────────────────────────────────────

/**
 * allCategories
 * Complete list of selectable post categories shown as toggle badges.
 * Must stay in sync with the category list used on FeedPage and the backend.
 */
const allCategories = ['Music', 'Videos', 'Streamer', 'Pictures', 'Blogger / Writer'];

/**
 * form
 * Reactive model bound to every input field via v-model.
 *   title    — optional post heading (max 150 chars).
 *   body     — optional post body / description (max 5000 chars).
 *   mediaUrl — optional platform embed URL (YouTube, Twitch, Spotify, etc.).
 *   imageUrl — optional direct image URL; used when category === 'Pictures'.
 *   category — the selected category slug; empty string = no category.
 */
const form = ref({ title: '', body: '', mediaUrl: '', imageUrl: '', category: '', isPrivate: false });

/**
 * detectedType
 * The platform type string derived from the mediaUrl by detectEmbed.
 * Possible values: 'youtube', 'twitch', 'spotify', 'applemusic', 'soundcloud',
 * 'instagram', 'facebook', 'twitter', 'tiktok', 'other', or '' (empty/unset).
 * Passed to <MediaEmbed> so it knows how to render the embed.
 */
const detectedType = ref('');

/**
 * embedLabel
 * Human-readable platform label displayed in the detected-badge element.
 * Set by detectEmbed using the embedLabels lookup map.
 * Example: "▶ YouTube", "🎵 Spotify".
 */
const embedLabel = ref('');

/**
 * agreedToTos
 * Whether the user has ticked the community guidelines checkbox.
 * The submit button remains disabled until this is true.
 */
const agreedToTos = ref(false);

/**
 * imageError
 * Flips to true when the browser fires an @error event on the image preview
 * element (i.e. the URL is unreachable or not a valid image).
 * Resets to false on a successful @load event.
 * Used to conditionally render the "Could not load image" error message.
 */
const imageError = ref(false);

// ─── LIFECYCLE ────────────────────────────────────────────────────────────────

/**
 * onMounted — auto-select category for single-category creators.
 *
 * If the logged-in creator's profile lists exactly one content category
 * (e.g. they signed up as a musician), pre-select it in the form.  This
 * saves a click for the common case where every post belongs to the same
 * category.
 *
 * Multi-category creators (or creators with no category set) get an empty
 * selection and must choose manually.
 */
onMounted(() => {
  const userCats = user.value?.categories || [];
  if (userCats.length === 1) form.value.category = userCats[0];
  // Auto-check Private when navigated from Dashboard's "🔒 Private Post" button
  if (route.query.private === 'true') form.value.isPrivate = true;
});

// ─── EMBED DETECTION ──────────────────────────────────────────────────────────

/**
 * embedLabels
 * Maps internal embed type keys to the display string shown in the badge.
 * Mirrors the types detected by detectEmbed below.
 */
const embedLabels = {
  youtube:    '▶ YouTube',
  twitch:     '🎮 Twitch',
  soundcloud: '🎵 SoundCloud',
  spotify:    '🎵 Spotify',
  applemusic: '🎵 Apple Music',
  instagram:  '📷 Instagram',
  tiktok:     '🎵 TikTok',
  facebook:   '📘 Facebook',
  twitter:    '🐦 Twitter/X',
  other:      '🔗 Link',
};

/**
 * detectEmbed
 *
 * Runs on every @input event in the media URL field.
 * Tests the current URL against known hostname patterns to determine which
 * platform it belongs to, then updates detectedType (used by <MediaEmbed>)
 * and embedLabel (displayed in the badge).
 *
 * The order of checks matters: more-specific patterns (e.g. open.spotify.com)
 * are checked before generic ones to avoid false matches.
 *
 * Falls back to 'other' for any URL that doesn't match a known platform,
 * which renders a generic link badge but still passes the URL to MediaEmbed.
 */
const detectEmbed = () => {
  const url = form.value.mediaUrl;

  // Clear state when the field is empty.
  if (!url) { detectedType.value = ''; embedLabel.value = ''; return; }

  // Test each platform in order of specificity.
  if      (/youtube\.com|youtu\.be/.test(url))   detectedType.value = 'youtube';
  else if (/twitch\.tv/.test(url))               detectedType.value = 'twitch';
  else if (/open\.spotify\.com/.test(url))       detectedType.value = 'spotify';
  else if (/music\.apple\.com/.test(url))        detectedType.value = 'applemusic';
  else if (/soundcloud\.com/.test(url))          detectedType.value = 'soundcloud';
  else if (/instagram\.com/.test(url))           detectedType.value = 'instagram';
  else if (/facebook\.com/.test(url))            detectedType.value = 'facebook';
  else if (/twitter\.com|x\.com/.test(url))      detectedType.value = 'twitter';
  else if (/tiktok\.com/.test(url))              detectedType.value = 'tiktok';
  else                                           detectedType.value = 'other';

  // Update the badge label using the lookup map; fall back to generic link.
  embedLabel.value = embedLabels[detectedType.value] || '🔗 Link';
};

// ─── FORM SUBMISSION ──────────────────────────────────────────────────────────

/**
 * handleSubmit
 *
 * Called when the form is submitted (either via the Post button or pressing
 * Enter inside a single-line input, because @submit.prevent is on the <form>).
 *
 * Steps:
 *   1. Clear any previous error message.
 *   2. Client-side validation — at least one content field must be filled in.
 *      A post with only a category and a ticked checkbox is not meaningful.
 *   3. Call createPost with the current form values and the ToS flag.
 *   4. On success, redirect to the new post's page so the user can see
 *      their creation and share the URL.
 *   5. On failure, surface the API error message (or a generic fallback).
 */
const handleSubmit = async () => {
  error.value = '';

  // Require at least one of: title, body, media URL, or image URL.
  if (!form.value.title && !form.value.body && !form.value.mediaUrl && !form.value.imageUrl) {
    error.value = 'Add a title, text, media link, or image.';
    return;
  }

  try {
    // Spread the form fields and include the ToS consent flag for the backend.
    const post = await createPost({ ...form.value, agreedToTos: agreedToTos.value });
    // Navigate to the new post on success.
    router.push(`/post/${post._id}`);
  } catch (err) {
    // Prefer the server's error message; fall back to a generic string.
    error.value = err.response?.data?.message || 'Failed to create post.';
  }
};
</script>

<style scoped>
.create-wrapper { max-width: 600px; }

.create-form { display: flex; flex-direction: column; gap: 14px; width: 100%; }

/* Small-caps field label used above the category badges and the image URL input */
.field-label {
  color: pink;
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: -6px; /* pulls the following element closer without reducing gap */
}

/* Horizontal row of category toggle badges */
.badge-group { display: flex; flex-wrap: wrap; gap: 8px; }

.badge {
  padding: 7px 16px;
  border-radius: 20px;
  border: 3px solid #14532d;
  background: #000;
  color: pink;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}
/* Active and hovered badges share the filled green style */
.badge:hover, .badge.active { background: #14532d; color: #fff; }

/* Shared input / textarea styles */
.create-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 10px;
  border: 3.5px solid #7f1d1d;
  font-size: 1rem;
  font-weight: 600;
  outline: none;
  color: #000;
  background: #fff;
  box-sizing: border-box;
  transition: border-color 0.2s ease, transform 0.2s ease;
}
/* Focused inputs lift slightly and switch to green border */
.create-input:focus { border-color: #14532d; transform: translateY(-2px); }
.create-input::placeholder { color: #aaa; font-weight: 600; }
/* Textarea starts taller and can be resized vertically by the user */
.create-textarea { min-height: 120px; resize: vertical; }

/* Image preview inside the form — full width, capped height */
.image-preview {
  width: 100%;
  max-height: 320px;
  object-fit: cover;
  border-radius: 10px;
  border: 3px solid #14532d;
}

/* Platform detection badge — e.g. "▶ YouTube" */
.detected-badge {
  display: inline-block;
  background: #14532d;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 20px;
}

/* Wrapper gives the mention dropdown a positioned ancestor */
.mention-wrapper {
  position: relative;
  width: 100%;
}

/* Floating dropdown rendered just below the textarea */
.mention-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: 100%;
  background: #fff;
  border: 3px solid #000;
  border-radius: 10px;
  z-index: 50; /* above other form elements but below the sticky nav */
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Individual suggestion row */
.mention-option {
  padding: 10px 14px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  color: #000;
  transition: background 0.15s;
}
/* Hover and keyboard-active rows share the same highlight */
.mention-option:hover,
.mention-option.active { background: pink; }

/* Community guidelines checkbox + label row */
.tos-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: pink;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  line-height: 1.4;
}
.tos-checkbox {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 2px; /* visually aligns the box with the first line of text */
  cursor: pointer;
  accent-color: #14532d; /* native checkbox tick colour in supporting browsers */
}

/* ── Responsive ── */

/* Tablet portrait */
@media (max-width: 768px) {
  .create-wrapper { max-width: 100%; margin: 1.5rem 16px; padding: 1.5rem; }
  .create-form { gap: 12px; }
}

/* Large phone */
@media (max-width: 600px) {
  .create-wrapper { margin: 1rem 10px; padding: 1.2rem; border-radius: 10px; }
  /* Badges scroll horizontally rather than wrapping on narrow screens */
  .badge-group { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 4px; gap: 6px; }
  .badge { flex-shrink: 0; padding: 6px 13px; font-size: 0.82rem; }
  .create-input { padding: 10px 12px; font-size: 0.95rem; }
  .create-textarea { min-height: 100px; }
  .image-preview { max-height: 240px; }
  .tos-label { font-size: 0.85rem; gap: 8px; }
}

/* Phone */
@media (max-width: 480px) {
  .create-wrapper { margin: 0.75rem 8px; padding: 1rem; }
  .create-form { gap: 10px; }
  .badge { padding: 5px 11px; font-size: 0.78rem; }
  .create-input { padding: 9px 11px; font-size: 0.9rem; }
  .create-textarea { min-height: 90px; }
  .detected-badge { font-size: 0.8rem; padding: 3px 10px; }
  .image-preview { max-height: 200px; }
}

/* Small phone (360px) */
@media (max-width: 360px) {
  .create-wrapper { margin: 0.5rem 4px; padding: 0.875rem; }
  .create-form { gap: 8px; }
  .badge { padding: 4px 9px; font-size: 0.74rem; }
  .create-input { font-size: 0.875rem; padding: 8px 10px; }
  .field-label { font-size: 0.74rem; }
}

/* Very small phone (320px) */
@media (max-width: 320px) {
  .create-wrapper { margin: 0.25rem 2px; padding: 0.75rem; }
  .create-input { font-size: 0.85rem; }
}

/* Landscape phone — shorter textarea so more of the form is visible */
@media (max-height: 500px) and (orientation: landscape) {
  .create-wrapper { margin: 0.5rem auto; padding: 1rem 1.5rem; }
  .create-textarea { min-height: 70px; }
}
</style>
