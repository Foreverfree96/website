<template>
  <div class="post-page" v-if="post">
    <button class="back-btn" @click="router.back()">← Back</button>

    <!-- ── Full post card ── -->
    <div class="post-full">
      <div class="post-full__meta">
        <!-- Clicking the author navigates to their creator profile -->
        <span class="post-full__author" @click="goToCreator(post.author.username)">
          @{{ post.author.username }}
        </span>
        <span v-if="post.category" class="post-full__category">{{ categoryEmoji[post.category] }} {{ post.category }}</span>
        <span class="post-full__date">{{ formatDate(post.createdAt) }}</span>
      </div>

      <!-- Private badge — only the post owner and admins can see private posts -->
      <span v-if="post.isPrivate" class="private-badge">🔒 Private</span>
      <h1 v-if="post.title" class="post-full__title">{{ post.title }}</h1>
      <!-- v-html is safe here because renderComment() HTML-escapes the body before injecting spans -->
      <p v-if="post.body" class="post-full__body" v-html="renderComment(post.body)" @click="handleCommentBodyClick" />
      <!-- Prefer static image; fall back to an embedded media player -->
      <img v-if="post.imageUrl" :src="post.imageUrl" class="post-image" alt="Post image" />
      <MediaEmbed v-else-if="post.mediaUrl" :mediaUrl="post.mediaUrl" :embedType="post.embedType" />

      <!-- ── Post actions bar ── -->
      <div class="post-full__actions">
        <!-- Like group: heart toggles; count opens the likes drawer -->
        <div class="like-group">
          <button class="action-btn like-heart" @click="handleLike" :title="liked ? 'Unlike' : 'Like'">
            {{ liked ? '❤️' : '🤍' }}
          </button>
          <button class="action-btn like-count" @click="openLikesModal" :disabled="likeCount === 0">
            {{ likeCount }}
          </button>
        </div>

        <!-- Owner-only controls: edit, privacy toggle, delete -->
        <template v-if="user.id && post.author._id === user.id">
          <button class="action-btn edit-btn" @click="startEdit">✏️ Edit</button>
          <button class="action-btn privacy-btn" :class="{ private: post.isPrivate }" @click="handleTogglePrivate">
            {{ post.isPrivate ? '🔒 Private' : '🌐 Public' }}
          </button>
          <button class="action-btn delete-btn" @click="handleDelete">🗑 Delete</button>
        </template>

        <!-- Report button — shown to logged-in users who are NOT the author -->
        <button v-if="user.id && post.author._id !== user.id" class="action-btn report-btn" :class="{ reported: postReported }" :disabled="postReported" @click="handleReport">
          {{ postReported ? '🚩 Reported' : '🚩 Report' }}
        </button>
      </div>

      <!-- ── Inline edit form (conditionally shown below actions) ── -->
      <div v-if="editing" class="edit-form">
        <div class="edit-form__title">Edit Post</div>

        <!-- Category badge selector — clicking a second time deselects -->
        <div class="edit-section-label">Category</div>
        <div class="edit-category-group">
          <button type="button" v-for="cat in allCategories" :key="cat"
            :class="['edit-badge', { active: editForm.category === cat }]"
            @click="editForm.category = editForm.category === cat ? '' : cat">
            {{ cat }}
          </button>
        </div>

        <input v-model="editForm.title" type="text" placeholder="Title" class="edit-input" maxlength="150" />
        <textarea v-model="editForm.body" placeholder="Body" class="edit-input edit-textarea" maxlength="5000" />

        <!-- Image URL only shown for Pictures category -->
        <template v-if="editForm.category === 'Pictures'">
          <input v-model="editForm.imageUrl" type="url" placeholder="Image URL" class="edit-input" />
        </template>
        <template v-else>
          <input v-model="editForm.mediaUrl" type="url" placeholder="Media URL (YouTube, Spotify...)" class="edit-input" />
        </template>

        <p v-if="editError" class="edit-error">{{ editError }}</p>
        <div class="edit-form__actions">
          <button class="action-btn" @click="handleSaveEdit" :disabled="editSaving">
            {{ editSaving ? 'Saving...' : '✓ Save' }}
          </button>
          <button class="action-btn delete-btn" @click="editing = false">✕ Cancel</button>
        </div>
      </div>
    </div>

    <!-- ── Comments section ── -->
    <div class="comments-section">
      <h2 class="comments-title">Comments ({{ post.comments.length }})</h2>

      <!-- Add comment — only for logged-in users -->
      <div v-if="user.id" class="comment-form">
        <div class="mention-wrapper">
          <textarea
            v-model="commentBody"
            placeholder="Write a comment... Use @ to mention mutual followers"
            class="comment-input"
            maxlength="1000"
            ref="commentTextareaRef"
            @input="handleCommentInput"
            @keydown="handleMentionKeydown"
            @blur="hideMentionDropdownDelayed"
          />
          <!-- @mention autocomplete dropdown -->
          <div v-if="mentionDropdown.show && mentionDropdown.results.length" class="mention-dropdown">
            <div
              v-for="(mu, idx) in mentionDropdown.results"
              :key="mu._id"
              class="mention-option"
              :class="{ active: idx === mentionDropdown.activeIndex }"
              <!-- mousedown.prevent keeps focus in the textarea during selection -->
              @mousedown.prevent="selectMention(mu.username)"
            >
              @{{ mu.username }}
            </div>
          </div>
        </div>
        <button class="auth-button comment-submit-btn" @click="handleComment" :disabled="!commentBody.trim()">
          Post Comment
        </button>
      </div>
      <p v-else class="login-prompt">
        <router-link to="/login" class="login-link">Log in</router-link> to comment.
      </p>

      <!-- ── Shared confirmation modal (delete / info) ── -->
      <div v-if="actionModal.show" class="confirm-overlay" @click.self="actionModal.show = false">
        <div class="confirm-box">
          <p class="confirm-msg">{{ actionModal.title }}</p>
          <p class="confirm-sub">{{ actionModal.sub }}</p>
          <div class="confirm-actions">
            <button v-if="actionModal.showCancel" class="confirm-cancel" @click="actionModal.show = false">Cancel</button>
            <button :class="actionModal.confirmClass" @click="actionModal.onConfirm">{{ actionModal.confirmLabel }}</button>
          </div>
        </div>
      </div>

      <!-- ── Report modal (separate because it includes a required reason textarea) ── -->
      <div v-if="reportModal.show" class="confirm-overlay" @click.self="reportModal.show = false">
        <div class="confirm-box report-modal-box">
          <p class="confirm-msg">{{ reportModal.title }}</p>
          <p class="confirm-sub">Describe why this content violates community guidelines. <strong>Required.</strong></p>
          <textarea
            v-model="reportModal.reason"
            class="report-reason-input"
            placeholder="e.g. Harassment, spam, hate speech, misinformation..."
            maxlength="500"
            rows="4"
            ref="reportReasonRef"
          />
          <p v-if="reportModal.error" class="report-reason-error">{{ reportModal.error }}</p>
          <div class="confirm-actions">
            <button class="confirm-cancel" @click="reportModal.show = false">Cancel</button>
            <button class="confirm-delete" @click="submitReport">Submit Report</button>
          </div>
        </div>
      </div>

      <!-- ── Comment list ── -->
      <div v-if="post.comments.length" class="comment-list">
        <div v-for="c in post.comments" :key="c._id" class="comment-card">
          <div class="comment-card__header">
            <span class="comment-card__author" @click="goToCreator(c.author.username)">
              @{{ c.author.username }}
            </span>
            <span class="comment-card__date">{{ formatDate(c.createdAt) }}</span>
            <!-- Delete button — only shown to the comment's own author -->
            <button v-if="user.id === c.author._id" class="comment-delete-btn" @click="handleDeleteComment(c._id)">✕</button>
            <!-- Report button — shown to all other logged-in users -->
            <button
              v-else-if="user.id && user.id !== c.author._id"
              class="comment-report-btn"
              :class="{ reported: reportedComments.has(c._id) }"
              :disabled="reportedComments.has(c._id)"
              @click="handleReportComment(c._id)"
            >{{ reportedComments.has(c._id) ? '🚩' : '🚩 Report' }}</button>
          </div>
          <!-- v-html is safe because renderComment() escapes the text before replacing @mentions -->
          <p class="comment-card__body" v-html="renderComment(c.body)" @click="handleCommentBodyClick" />
        </div>
      </div>
      <p v-else class="no-comments">No comments yet.</p>
    </div>
  </div>

  <p v-else-if="loading" class="feed-status">Loading...</p>
  <p v-else class="feed-status">Post not found.</p>

  <!-- ── Likes bottom-sheet drawer ── -->
  <Transition name="likes-modal">
    <div v-if="likesModal.show" class="likes-overlay" @click.self="likesModal.show = false">
      <div class="likes-drawer">
        <div class="likes-drawer__header">
          <h3 class="likes-drawer__title">❤️ {{ likeCount }} Like{{ likeCount !== 1 ? 's' : '' }}</h3>
          <button class="likes-drawer__close" @click="likesModal.show = false">✕</button>
        </div>
        <div v-if="likesModal.loading" class="likes-status">Loading...</div>
        <div v-else-if="!likesModal.users.length" class="likes-status">No likes yet.</div>
        <div v-else class="likes-list">
          <div
            v-for="u in likesModal.users"
            :key="u._id"
            class="likes-user"
            @click="goToCreator(u.username); likesModal.show = false"
          >
            <span class="likes-user__heart">❤️</span>
            @{{ u.username }}
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
/**
 * PostPage.vue — Single post detail view
 *
 * This page is responsible for rendering the full content of one post identified
 * by the :id route parameter.  It handles every user interaction available on
 * a post:
 *
 *  Post display
 *    - Renders title, body, category badge, author, date, image or embedded media.
 *    - @mention tokens inside post bodies are turned into clickable links via
 *      renderComment() / handleCommentBodyClick().
 *
 *  Like system
 *    - Heart button toggles the current user's like; count button opens a
 *      bottom-sheet drawer (likesModal) listing every user who liked the post.
 *    - likeCount is tracked as a local ref so it can be updated optimistically
 *      without waiting for a full post re-fetch.
 *
 *  Owner controls  (only visible when user.id === post.author._id)
 *    - Inline edit form: pre-populates editForm from the current post data,
 *      saves via PATCH, merges the API response back into the local post ref.
 *    - Privacy toggle: flips isPrivate with a single PATCH call.
 *    - Delete: confirms via actionModal then DELETEs and redirects to /feed.
 *
 *  Report flow  (only visible to non-owners)
 *    - Post report  : handleReport()   → openReportModal() → submitReport() → POST /api/posts/:id/report
 *    - Comment report: handleReportComment() → same flow   → POST /api/posts/:id/comments/:id/report
 *    - Both flows require a written reason (validated in submitReport).
 *    - After success the UI disables the report button for the session so the
 *      user cannot double-report.
 *
 *  Comments
 *    - Textarea with live @mention autocomplete backed by the mutual-followers
 *      API (lazy-loaded once on first @ keystroke).
 *    - Per-comment delete (owner) and report (non-owner) actions.
 *
 *  Modals
 *    - actionModal : generic confirm / info dialog reused across delete and
 *      post-report feedback flows.
 *    - reportModal : separate modal that owns the reason textarea, since the
 *      actionModal layout does not include a freeform input.
 */
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { usePosts } from '../composables/usePosts.js';
import { useAuth } from '../composables/useAuth.js';
import MediaEmbed from '../components/MediaEmbed.vue';

const route = useRoute();
const router = useRouter();

// ─── COMPOSABLES ─────────────────────────────────────────────────────────────

// Full suite of post operations from the composable.
const { post, loading, fetchPost, deletePost, updatePost, toggleLike, addComment, deleteComment } = usePosts();

// Current logged-in user.
const { user } = useAuth();

// ─── CATEGORY / EMOJI CONFIG ─────────────────────────────────────────────────

// Ordered list used to render the category badge selector inside the edit form.
const allCategories = ['Music', 'Videos', 'Streamer', 'Pictures', 'Blogger / Writer'];

// Maps each category name to a decorative emoji shown in the post meta bar.
const categoryEmoji = { 'Music': '🎵', 'Videos': '🎬', 'Streamer': '🎮', 'Pictures': '📷', 'Blogger / Writer': '✍️' };

// ─── EDIT STATE ──────────────────────────────────────────────────────────────

// Whether the inline edit form is visible below the post actions bar.
const editing = ref(false);

// True while the PATCH save request is in-flight; disables the Save button to
// prevent double-submission.
const editSaving = ref(false);

// Validation / server error message displayed inside the edit form on failure.
const editError = ref('');

// Reactive copy of the post fields that the user is currently editing.
// Populated by startEdit() from the live post data; written back by handleSaveEdit().
const editForm = ref({ title: '', body: '', mediaUrl: '', imageUrl: '', category: '', isPrivate: false });

// ─── COMMENT STATE ───────────────────────────────────────────────────────────

// Current text in the comment compose textarea; cleared after a successful post.
const commentBody = ref('');

// ─── LIKE STATE ──────────────────────────────────────────────────────────────

// Local mirror of the like count.  Kept separate from post.value.likes.length
// so it can be updated synchronously after a toggleLike call without mutating
// the full likes array in every code path.
const likeCount = ref(0);

// True when the current user's ID appears in the post's likes array, driving
// the filled / empty heart icon in the template.
const liked = computed(() => post.value?.likes?.includes(user.value.id));

// ─── @MENTION AUTOCOMPLETE ───────────────────────────────────────────────────

// Template ref attached to the comment <textarea>; used by selectMention() to
// read/write the caret position after injecting a username.
const commentTextareaRef = ref(null);

// Lazy-loaded array of mutual-follower objects: { _id, username }.
// Initialised to null (not yet fetched) so ensureMutuals() can detect whether
// a network request is still needed.
const mutualFollowers = ref(null); // null = not fetched yet

/**
 * mentionDropdown — consolidated state for the @mention suggestion popup.
 *
 *   show         {boolean} — controls v-if visibility of the dropdown element.
 *   query        {string}  — the partial username the user has typed after @
 *                            (used to filter mutualFollowers).
 *   results      {Array}   — filtered subset of mutualFollowers (max 6 entries)
 *                            that start with `query`.
 *   activeIndex  {number}  — index of the keyboard-highlighted row; -1 = none.
 *   triggerStart {number}  — character offset of the @ symbol inside the
 *                            textarea value, needed to splice in the final
 *                            username at exactly the right position.
 */
const mentionDropdown = ref({ show: false, query: '', results: [], activeIndex: -1, triggerStart: -1 });

/**
 * ensureMutuals
 * Fetches the current user's mutual followers from the API and stores them in
 * mutualFollowers.  Subsequent calls are no-ops because of the null-guard on
 * the first line.  Falls back to an empty array on network error so the
 * autocomplete silently degrades rather than throwing.
 */
const ensureMutuals = async () => {
  if (mutualFollowers.value !== null) return;
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/users/mutual-followers`);
    mutualFollowers.value = res.data.mutuals;
  } catch {
    mutualFollowers.value = [];
  }
};

/**
 * handleCommentInput
 * Fires on every `input` event from the comment textarea.
 * Reads the text immediately before the cursor and checks whether it matches
 * the pattern /@([a-zA-Z0-9_]*)$/ (i.e. an @ token at or near the caret).
 *
 * If a match is found:
 *   1. Ensures mutual followers are loaded (lazy fetch on first trigger).
 *   2. Filters the list to usernames that start with the typed query.
 *   3. Opens the dropdown with up to 6 results and resets keyboard selection.
 *
 * If no match is found (cursor moved away from @, token deleted, etc.) the
 * dropdown is hidden while preserving the other state fields.
 */
const handleCommentInput = async (e) => {
  if (!user.value.id) return;
  const val = e.target.value;
  const cursor = e.target.selectionStart;
  const textBeforeCursor = val.slice(0, cursor);
  // Match an @ token immediately before the cursor.
  const match = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);
  if (match) {
    await ensureMutuals();
    const query = match[1].toLowerCase();
    const filtered = (mutualFollowers.value || []).filter(u => u.username.toLowerCase().startsWith(query));
    mentionDropdown.value = { show: filtered.length > 0, query, results: filtered.slice(0, 6), activeIndex: -1, triggerStart: cursor - match[0].length };
  } else {
    mentionDropdown.value = { ...mentionDropdown.value, show: false };
  }
};

/**
 * handleMentionKeydown
 * Keyboard handler attached to the comment textarea that drives navigation
 * inside the @mention dropdown without stealing focus from the textarea.
 *
 *   ArrowDown — moves the highlighted row down (clamped at last result).
 *   ArrowUp   — moves the highlighted row up (clamped at index 0).
 *   Enter/Tab — accepts the currently highlighted suggestion (if any).
 *               preventDefault() stops Enter from submitting the form and
 *               Tab from moving browser focus away.
 *   Escape    — closes the dropdown without selecting anything.
 *
 * The handler returns early if the dropdown is not open, so normal textarea
 * keyboard behaviour is unaffected when the popup is hidden.
 */
const handleMentionKeydown = (e) => {
  const dd = mentionDropdown.value;
  if (!dd.show) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); mentionDropdown.value.activeIndex = Math.min(dd.activeIndex + 1, dd.results.length - 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); mentionDropdown.value.activeIndex = Math.max(dd.activeIndex - 1, 0); }
  else if (e.key === 'Enter' || e.key === 'Tab') { if (dd.activeIndex >= 0 && dd.results[dd.activeIndex]) { e.preventDefault(); selectMention(dd.results[dd.activeIndex].username); } }
  else if (e.key === 'Escape') { mentionDropdown.value.show = false; }
};

/**
 * selectMention
 * Splices the chosen username into the textarea value, replacing everything
 * from the @ symbol (triggerStart) up to the current caret position with
 * "@username " (note the trailing space so the user can continue typing).
 *
 * After updating the v-model value, nextTick is used to wait for Vue's DOM
 * patch before programmatically repositioning the textarea caret immediately
 * after the inserted text.
 *
 * @param {string} username — the username to insert (without the leading @).
 */
const selectMention = (username) => {
  const dd = mentionDropdown.value;
  const textarea = commentTextareaRef.value;
  const cursor = textarea.selectionStart;
  const before = commentBody.value.slice(0, dd.triggerStart);
  const after = commentBody.value.slice(cursor);
  commentBody.value = `${before}@${username} ${after}`;
  mentionDropdown.value.show = false;
  nextTick(() => {
    const newCursor = dd.triggerStart + username.length + 2; // +2 for "@" and " "
    textarea.focus();
    textarea.setSelectionRange(newCursor, newCursor);
  });
};

/**
 * hideMentionDropdownDelayed
 * Called on the textarea's `blur` event.  Delays hiding by 150 ms so that a
 * mousedown click on a dropdown option has time to fire (and call selectMention)
 * before the blur handler closes the list.  Without the delay the dropdown
 * would disappear the instant focus leaves the textarea, making mouse-click
 * selection impossible.
 */
const hideMentionDropdownDelayed = () => {
  setTimeout(() => { mentionDropdown.value.show = false; }, 150);
};

// ─── MENTION RENDERING ───────────────────────────────────────────────────────

/**
 * renderComment
 * Converts a plain-text string (post body or comment body) into safe HTML
 * suitable for use with Vue's v-html directive.
 *
 * The two-step approach is critical for security:
 *   Step 1 — HTML-escape all special characters (&, <, >, ") so that any
 *             HTML already present in the stored text is rendered as literal
 *             characters rather than interpreted as markup.  This prevents
 *             stored XSS attacks.
 *   Step 2 — After escaping, replace @username patterns with styled <span>
 *             elements that carry a data-username attribute.  Clicks on these
 *             spans are handled by handleCommentBodyClick() via event delegation.
 *
 * @param  {string} body — raw text from the database.
 * @returns {string}      — HTML string safe to bind with v-html.
 */
const renderComment = (body) => {
  // Step 1: escape HTML special characters first — critical for XSS safety.
  const escaped = body
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Step 2: wrap @username tokens in styled spans with a data attribute.
  return escaped.replace(/@([a-zA-Z0-9_]+)/g, (_, uname) =>
    `<span class="mention-link" data-username="${uname}">@${uname}</span>`
  );
};

/**
 * handleCommentBodyClick
 * Event-delegation handler placed on the post body paragraph and each comment
 * body paragraph.  Because the @mention spans are injected via v-html at
 * runtime, individual @click bindings cannot be added to them in the template.
 * Instead this handler inspects e.target: if the clicked element has the
 * "mention-link" class, it reads the data-username attribute and navigates to
 * that user's creator profile page.
 *
 * @param {MouseEvent} e — the click event that bubbled up from inside the paragraph.
 */
const handleCommentBodyClick = (e) => {
  const target = e.target;
  if (target.classList.contains('mention-link')) {
    const username = target.dataset.username;
    if (username) router.push(`/creator/${username}`);
  }
};

// ─── LIFECYCLE ───────────────────────────────────────────────────────────────

/**
 * onMounted
 * Fetches the full post document (title, body, author, comments, likes, etc.)
 * using the :id from the current route.  Once the data arrives, initialises
 * the local likeCount ref from the loaded likes array length so the like
 * counter is correct immediately on render without a separate API call.
 */
onMounted(async () => {
  await fetchPost(route.params.id);
  if (post.value) likeCount.value = post.value.likes.length;
});

// ─── LIKE HANDLER ────────────────────────────────────────────────────────────

/**
 * handleLike
 * Toggles the current user's like on this post.
 *
 * - Guests are redirected to /login rather than shown an error.
 * - The composable's toggleLike() returns { liked, likes } where `likes` is
 *   the new total count.  The local likeCount ref is updated from that value.
 * - The likes array on the post object is mutated in-place so the `liked`
 *   computed property (which drives the heart icon) stays reactive without
 *   re-fetching the post.
 */
const handleLike = async () => {
  if (!user.value.id) { router.push('/login'); return; }
  const res = await toggleLike(route.params.id);
  likeCount.value = res.likes;
  if (res.liked) post.value.likes.push(user.value.id);
  else post.value.likes = post.value.likes.filter(id => id !== user.value.id);
};

// ─── COMMENT HANDLER ─────────────────────────────────────────────────────────

/**
 * handleComment
 * Submits the composed comment text to the API via the usePosts composable.
 * The returned comment object (with _id, author, createdAt) is pushed directly
 * onto the local comments array so the new comment appears instantly without
 * a full post re-fetch.  The textarea is cleared after submission.
 */
const handleComment = async () => {
  if (!commentBody.value.trim()) return;
  const comment = await addComment(route.params.id, commentBody.value);
  post.value.comments.push(comment);
  commentBody.value = '';
};

// ─── ACTION MODAL ────────────────────────────────────────────────────────────

/**
 * actionModal — shared reactive state for the generic confirm / info dialog.
 *
 *   show         {boolean}  — controls the v-if that renders the overlay.
 *   title        {string}   — large bold heading at the top of the box.
 *   sub          {string}   — smaller grey descriptive text below the heading.
 *   confirmLabel {string}   — label on the primary action button.
 *   confirmClass {string}   — CSS class applied to the primary button;
 *                             "confirm-delete" = red destructive style,
 *                             "confirm-cancel" = neutral style for info-only dialogs.
 *   showCancel   {boolean}  — whether to render a Cancel button; false for
 *                             info-only modals where Cancel is meaningless.
 *   onConfirm    {Function} — async callback invoked when the primary button
 *                             is clicked; the modal is closed before the
 *                             callback runs so async work doesn't block the UI.
 */
const actionModal = ref({ show: false, title: '', sub: '', confirmLabel: '', confirmClass: 'confirm-delete', showCancel: true, onConfirm: () => {} });

/**
 * openModal
 * Convenience helper that configures and opens a destructive-action confirm
 * dialog (red primary button, Cancel + Confirm pair).
 *
 * The onConfirm wrapper closes the modal before awaiting the caller's callback
 * so the dialog disappears immediately when the user clicks Confirm.
 *
 * @param {string}   title        — heading text (e.g. "Delete this post?").
 * @param {string}   sub          — subtext (e.g. "This can't be undone.").
 * @param {string}   confirmLabel — primary button label (e.g. "Delete").
 * @param {Function} onConfirm    — async action to run after the modal closes.
 */
const openModal = (title, sub, confirmLabel, onConfirm) => {
  actionModal.value = { show: true, title, sub, confirmLabel, confirmClass: 'confirm-delete', showCancel: true, onConfirm: async () => {
    actionModal.value.show = false;
    await onConfirm();
  }};
};

/**
 * openInfoModal
 * Convenience helper that opens a feedback-only dialog with a single OK button
 * and no Cancel.  Used after a report submission to acknowledge the action to
 * the user without requiring any further decision.
 *
 * @param {string} title — heading text (e.g. "Thanks for the report!").
 * @param {string} sub   — subtext explaining what will happen next.
 */
const openInfoModal = (title, sub) => {
  actionModal.value = { show: true, title, sub, confirmLabel: 'OK', confirmClass: 'confirm-cancel', showCancel: false, onConfirm: () => { actionModal.value.show = false; } };
};

// ─── REPORT STATE ────────────────────────────────────────────────────────────

// True once the current post has been successfully reported by this user in the
// current session.  Used to disable the post Report button and change its label.
const postReported = ref(false);

// Reactive Set of comment _id strings that this user has already reported.
// Stored as a Set for O(1) lookup in the v-for loop that renders comment cards.
// Note: Vue cannot track mutations to a Set directly — the Set is replaced with
// a new instance (new Set([...old, id])) to trigger reactivity.
const reportedComments = ref(new Set());

// Template ref for the reason <textarea> inside the report modal so it can
// be focused programmatically when the modal opens (via openReportModal).
const reportReasonRef = ref(null);

/**
 * reportModal — separate state object for the report flow modal.
 * A distinct modal is used instead of reusing actionModal because the report
 * flow requires a freeform reason textarea that the generic actionModal layout
 * does not accommodate.
 *
 *   show     {boolean}       — controls the v-if on the report modal overlay.
 *   title    {string}        — heading shown in the modal (varies by target type).
 *   reason   {string}        — v-model value bound to the reason textarea.
 *   error    {string}        — inline validation error shown when reason is empty.
 *   onSubmit {Function|null} — async callback that receives the trimmed reason
 *                              string; set by openReportModal().
 */
const reportModal = ref({ show: false, title: '', reason: '', error: '', onSubmit: null });

/**
 * openReportModal
 * Configures and opens the report modal, then uses nextTick to focus the reason
 * textarea once the DOM has been updated so the user can start typing
 * immediately without an extra click.
 *
 * @param {string}   title    — heading for the specific report target.
 * @param {Function} onSubmit — async callback(reason) called by submitReport().
 */
const openReportModal = (title, onSubmit) => {
  reportModal.value = { show: true, title, reason: '', error: '', onSubmit };
  nextTick(() => reportReasonRef.value?.focus());
};

/**
 * submitReport
 * Called when the user clicks "Submit Report" inside the report modal.
 * Validates that a non-empty reason was provided; if not, sets an error message
 * and returns early to keep the modal open.
 * On success: closes the modal and invokes the onSubmit callback with the
 * trimmed reason text so the caller (handleReport / handleReportComment) can
 * send the API request.
 */
const submitReport = async () => {
  if (!reportModal.value.reason.trim()) {
    reportModal.value.error = 'Please provide a reason before submitting.';
    return;
  }
  reportModal.value.error = '';
  const reason = reportModal.value.reason.trim();
  reportModal.value.show = false;
  await reportModal.value.onSubmit(reason);
};

// ─── LIKES MODAL ─────────────────────────────────────────────────────────────

/**
 * likesModal — state for the bottom-sheet drawer listing who liked the post.
 *
 *   show    {boolean} — controls the <Transition> / v-if on the overlay.
 *   loading {boolean} — true while the GET /likes request is in-flight;
 *                       shows a "Loading..." placeholder in the drawer.
 *   users   {Array}   — array of { _id, username } objects returned by the API.
 */
const likesModal = ref({ show: false, loading: false, users: [] });

/**
 * openLikesModal
 * Opens the likes bottom-sheet and fetches the full list of users who liked
 * the post.  Returns early without showing the drawer if there are no likes,
 * since the like-count button is disabled at 0 and this function should never
 * be called in that state anyway (defensive guard).
 * On network failure, users falls back to an empty array so the drawer shows
 * "No likes yet." rather than staying in a loading state indefinitely.
 */
const openLikesModal = async () => {
  if (likeCount.value === 0) return;
  likesModal.value = { show: true, loading: true, users: [] };
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/posts/${route.params.id}/likes`);
    likesModal.value.users = res.data.likes;
  } catch {
    likesModal.value.users = [];
  } finally {
    likesModal.value.loading = false;
  }
};

// ─── DELETE COMMENT ──────────────────────────────────────────────────────────

/**
 * handleDeleteComment
 * Asks for confirmation via actionModal, then calls the deleteComment composable
 * method.  On success, removes the deleted comment from the local comments
 * array by filtering out its _id so the list updates without a re-fetch.
 *
 * @param {string} commentId — the _id of the comment to delete.
 */
const handleDeleteComment = (commentId) => {
  openModal('Delete this comment?', "This can't be undone.", 'Delete', async () => {
    await deleteComment(route.params.id, commentId);
    post.value.comments = post.value.comments.filter(c => c._id !== commentId);
  });
};

// ─── REPORT POST ─────────────────────────────────────────────────────────────

/**
 * handleReport
 * Entry point for reporting the post.  Opens the reason-required report modal;
 * the onSubmit callback POSTs the reason to the API, marks the post as reported
 * locally (postReported = true), and shows an acknowledgement info modal.
 * On API error an info modal is shown with the server's error message or a
 * generic fallback.
 */
const handleReport = () => {
  openReportModal('Report this post?', async (reason) => {
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/posts/${route.params.id}/report`, { reason });
      postReported.value = true;
      openInfoModal('Thanks for the report!', 'Our team will review this post. If it violates community guidelines it will be removed.');
    } catch (err) {
      openInfoModal('Could not report', err.response?.data?.message || 'Something went wrong. Please try again.');
    }
  });
};

// ─── REPORT COMMENT ──────────────────────────────────────────────────────────

/**
 * handleReportComment
 * Entry point for reporting a specific comment.  Opens the reason-required
 * report modal; the onSubmit callback POSTs the reason to the nested comment
 * report endpoint.
 *
 * On success the comment's _id is added to the reportedComments Set.  Because
 * Vue cannot observe Set.add() mutations, the Set is replaced with a new
 * instance spread from the old one plus the new id — this triggers reactivity
 * so the report button in the comment card switches to its disabled state.
 *
 * @param {string} commentId — the _id of the comment to report.
 */
const handleReportComment = (commentId) => {
  openReportModal('Report this comment?', async (reason) => {
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/posts/${route.params.id}/comments/${commentId}/report`, { reason });
      // Immutably update the Set so Vue's reactivity picks up the change.
      reportedComments.value = new Set([...reportedComments.value, commentId]);
      openInfoModal('Thanks for the report!', 'Our team will review this comment.');
    } catch (err) {
      openInfoModal('Could not report', err.response?.data?.message || 'Something went wrong.');
    }
  });
};

// ─── DELETE POST ─────────────────────────────────────────────────────────────

/**
 * handleDelete
 * Prompts the user to confirm deletion via actionModal, then calls the
 * deletePost composable method.  On success navigates back to the main feed
 * (/feed) since the post no longer exists.
 */
const handleDelete = () => {
  openModal('Delete this post?', "This can't be undone.", 'Delete', async () => {
    await deletePost(route.params.id);
    router.push('/feed');
  });
};

// ─── EDIT POST ───────────────────────────────────────────────────────────────

/**
 * startEdit
 * Copies the current post field values into the editForm ref and opens the
 * inline edit form.  Using a separate editForm object (rather than editing
 * post.value directly) means the user can cancel without leaving partially
 * mutated post data.  Nullish-coalescing / empty-string defaults ensure the
 * inputs have a defined value even for optional fields that may be undefined
 * on older posts.
 */
const startEdit = () => {
  editForm.value = {
    title: post.value.title || '',
    body: post.value.body || '',
    mediaUrl: post.value.mediaUrl || '',
    imageUrl: post.value.imageUrl || '',
    category: post.value.category || '',
    isPrivate: post.value.isPrivate ?? false,
  };
  editError.value = '';
  editing.value = true;
};

/**
 * handleSaveEdit
 * Submits the editForm data to the API via the updatePost composable method.
 * On success: merges the returned (server-authoritative) post data into the
 * local post ref using Object.assign so every bound property updates
 * simultaneously, then hides the edit form.
 * On failure: stores the error message in editError so it is displayed inline
 * without closing the form, allowing the user to correct the input.
 * editSaving guards the Save button from double-submission during the request.
 */
const handleSaveEdit = async () => {
  editError.value = '';
  editSaving.value = true;
  try {
    const updated = await updatePost(route.params.id, editForm.value);
    Object.assign(post.value, updated);
    editing.value = false;
  } catch (err) {
    editError.value = err.response?.data?.message || 'Failed to save changes.';
  } finally {
    editSaving.value = false;
  }
};

// ─── PRIVACY TOGGLE ──────────────────────────────────────────────────────────

/**
 * handleTogglePrivate
 * Flips the post's isPrivate flag by sending a PATCH with the inverted value.
 * On success updates only post.value.isPrivate from the API response so the
 * privacy button label and style update without re-rendering the whole post.
 * On failure falls back to a browser alert because the action modal may not be
 * open, and this is the simplest way to surface a non-critical error reliably.
 */
const handleTogglePrivate = async () => {
  try {
    const updated = await updatePost(route.params.id, { isPrivate: !post.value.isPrivate });
    post.value.isPrivate = updated.isPrivate;
  } catch (err) {
    alert(err.response?.data?.message || 'Failed to update privacy.');
  }
};

// ─── NAVIGATION & DISPLAY HELPERS ────────────────────────────────────────────

// Navigate to a creator's public profile page.
// Used by author spans in the post header, comment headers, and the likes drawer.
const goToCreator = (username) => router.push(`/creator/${username}`);

// Format an ISO 8601 date string into the browser's locale short date format
// (e.g. "3/13/2026" in en-US).  Used for post and comment timestamps.
const formatDate = (d) => new Date(d).toLocaleDateString();
</script>

<style scoped>
.post-page {
  max-width: 800px;
  margin: 30px auto;
  padding: 0 16px 60px;
}

.feed-status {
  text-align: center;
  font-size: 1.1rem;
  font-weight: 600;
  color: #000;
  margin-top: 60px;
}

.post-full {
  background: pink;
  border: 3px solid #000;
  border-radius: 14px;
  padding: 24px;
  margin-bottom: 24px;
}

.post-full__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.post-full__author {
  font-weight: 700;
  color: #000;
  cursor: pointer;
  text-decoration: underline;
}

.post-full__author:hover { color: #14532d; }

.post-full__category {
  background: #000;
  color: pink;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
}

.post-full__date {
  margin-left: auto;
  font-size: 0.85rem;
  color: #555;
}

.back-btn {
  background: #000;
  color: pink;
  border: 3px solid #14532d;
  border-radius: 8px;
  padding: 8px 18px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  margin-bottom: 16px;
  transition: transform 0.2s ease;
}
.back-btn:hover { transform: translateY(-2px); color: rgb(125,190,157); }

.post-image {
  width: 100%;
  max-height: 500px;
  object-fit: contain;
  border-radius: 10px;
  margin-top: 10px;
}

.report-btn { border-color: #7f1d1d; margin-left: auto; }
.report-btn.reported { opacity: 0.5; cursor: default; }
.report-btn.reported:hover { transform: none; color: pink; }
.private-badge {
  display: inline-block;
  background: #555;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  margin-bottom: 8px;
}

.edit-btn { border-color: #1e3a5f; }
.privacy-btn { border-color: #14532d; }
.privacy-btn.private { border-color: #7f1d1d; color: #ff4444; }

.post-full__title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #000;
  margin: 0 0 12px;
}

.post-full__body {
  color: #1f2937;
  font-size: 1rem;
  line-height: 1.6;
  text-align: left;
  white-space: pre-wrap;
  margin: 0 0 12px;
}

.post-full__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.action-btn {
  background: #000;
  color: pink;
  border: 3px solid #14532d;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.action-btn:hover { transform: translateY(-2px); color: rgb(125,190,157); }

.delete-btn { border-color: #7f1d1d; }

/* Comments */
.comments-section {
  background: pink;
  border: 3px solid #000;
  border-radius: 14px;
  padding: 24px;
}

.comments-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #000;
  margin: 0 0 16px;
}

.comment-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.mention-wrapper {
  position: relative;
  width: 100%;
}

.mention-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: 100%;
  background: #fff;
  border: 3px solid #000;
  border-radius: 10px;
  z-index: 50;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.mention-option {
  padding: 10px 14px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  color: #000;
  transition: background 0.15s;
}
.mention-option:hover,
.mention-option.active { background: pink; }

.comment-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 10px;
  border: 3.5px solid #7f1d1d;
  font-size: 0.95rem;
  font-weight: 600;
  outline: none;
  resize: vertical;
  min-height: 80px;
  box-sizing: border-box;
  transition: border-color 0.2s ease;
}

.comment-input:focus { border-color: #14532d; }
.comment-input::placeholder { color: #aaa; }

.comment-submit-btn {
  width: auto;
  height: auto;
  padding: 10px 24px;
  font-size: 0.95rem;
  margin: 0;
  align-self: flex-end;
}

.login-prompt {
  font-size: 0.95rem;
  font-weight: 600;
  color: #000;
  margin-bottom: 16px;
}

.login-link {
  color: #14532d;
  font-weight: 700;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.comment-card {
  background: #fff0f6;
  border: 2px solid #000;
  border-radius: 10px;
  padding: 14px;
}

.comment-card__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.comment-card__author {
  font-weight: 700;
  color: #000;
  cursor: pointer;
  font-size: 0.9rem;
  text-decoration: underline;
}

.comment-card__author:hover { color: #14532d; }

.comment-card__date {
  font-size: 0.8rem;
  color: #777;
}

.comment-delete-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: #7f1d1d;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.9rem;
}

.report-modal-box { min-width: 320px; max-width: 480px; text-align: left; }
.report-reason-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 3px solid #7f1d1d;
  font-size: 0.93rem;
  font-weight: 500;
  outline: none;
  resize: vertical;
  box-sizing: border-box;
  margin-bottom: 8px;
  font-family: inherit;
  transition: border-color 0.2s;
}
.report-reason-input:focus { border-color: #000; }
.report-reason-input::placeholder { color: #aaa; font-weight: 400; }
.report-reason-error { color: #7f1d1d; font-size: 0.85rem; font-weight: 700; margin: 0 0 10px; }

.comment-report-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: #7f1d1d;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.78rem;
  opacity: 0.45;
  transition: opacity 0.15s;
  padding: 2px 4px;
}
.comment-report-btn:hover { opacity: 1; }
.comment-report-btn.reported { opacity: 0.3; cursor: default; }

.comment-card__body {
  color: #1f2937;
  font-size: 0.95rem;
  line-height: 1.5;
  text-align: left;
  white-space: pre-wrap;
  margin: 0;
}

:deep(.mention-link) {
  color: #14532d;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
}
:deep(.mention-link:hover) { color: #000; }

.no-comments {
  color: #555;
  font-size: 0.95rem;
  text-align: center;
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.confirm-box {
  background: pink;
  border: 3px solid #000;
  border-radius: 14px;
  padding: 28px 32px;
  text-align: center;
  min-width: 280px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  animation: pop-in 0.15s ease;
}

@keyframes pop-in {
  from { transform: scale(0.9); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}

.confirm-msg {
  font-size: 1.15rem;
  font-weight: 700;
  color: #000;
  margin: 0 0 6px;
}

.confirm-sub {
  font-size: 0.875rem;
  color: #555;
  margin: 0 0 22px;
}

.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.confirm-cancel {
  background: #000;
  color: pink;
  border: 3px solid #14532d;
  border-radius: 8px;
  padding: 8px 22px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s;
}
.confirm-cancel:hover { transform: translateY(-2px); color: rgb(125, 190, 157); }

.confirm-delete {
  background: #7f1d1d;
  color: #fff;
  border: 3px solid #000;
  border-radius: 8px;
  padding: 8px 22px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s;
}
.confirm-delete:hover { transform: translateY(-2px); background: #991b1b; }

/* Edit form */
.edit-section-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #000;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: -4px;
}

.edit-form {
  margin-top: 20px;
  border-top: 2px solid #000;
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.edit-form__title {
  font-size: 1rem;
  font-weight: 700;
  color: #000;
}

.edit-category-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.edit-badge {
  padding: 6px 14px;
  border-radius: 20px;
  border: 3px solid #14532d;
  background: #000;
  color: pink;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.2s ease;
}
.edit-badge:hover, .edit-badge.active { background: #14532d; color: #fff; }

.edit-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 3px solid #7f1d1d;
  font-size: 0.95rem;
  font-weight: 600;
  outline: none;
  color: #000;
  background: #fff;
  box-sizing: border-box;
  transition: border-color 0.2s ease;
}
.edit-input:focus { border-color: #14532d; }
.edit-textarea { min-height: 100px; resize: vertical; }

.edit-error {
  color: #7f1d1d;
  font-size: 0.9rem;
  font-weight: 600;
  margin: 0;
}

.edit-form__actions {
  display: flex;
  gap: 10px;
}

/* ── Like group ── */
.like-group {
  display: inline-flex;
  align-items: stretch;
  border-radius: 8px;
  overflow: hidden;
  border: 3px solid #14532d;
}

.like-heart,
.like-count {
  background: #000;
  color: pink;
  border: none;
  cursor: pointer;
  font-weight: 700;
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
  border-radius: 0 !important;
  padding: 8px 12px;
}

.like-heart { font-size: 1rem; border-right: 2px solid #14532d; }
.like-count { font-size: 0.9rem; min-width: 28px; text-align: center; }
.like-count:disabled { opacity: 0.5; cursor: default; }
.like-heart:hover  { background: #14532d; color: #fff; }
.like-count:not(:disabled):hover { background: #14532d; color: #fff; }

/* ── Likes modal ── */
.likes-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 200;
  padding: 0 0 env(safe-area-inset-bottom);
}

.likes-drawer {
  background: pink;
  border: 3px solid #000;
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-width: 500px;
  max-height: 65vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.likes-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 2px solid #000;
  flex-shrink: 0;
}

.likes-drawer__title {
  font-size: 1rem;
  font-weight: 700;
  color: #000;
  margin: 0;
}

.likes-drawer__close {
  background: none;
  border: none;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  color: #7f1d1d;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.15s;
}
.likes-drawer__close:hover { background: rgba(0,0,0,0.1); }

.likes-status {
  padding: 24px;
  text-align: center;
  font-size: 0.95rem;
  font-weight: 600;
  color: #555;
}

.likes-list {
  overflow-y: auto;
  padding: 8px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.likes-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  background: #000;
  color: pink;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  transition: transform 0.15s ease, color 0.15s ease;
}
.likes-user:hover { transform: translateX(4px); color: rgb(125, 190, 157); }
.likes-user__heart { font-size: 0.85rem; flex-shrink: 0; }

/* Transition */
.likes-modal-enter-active,
.likes-modal-leave-active { transition: opacity 0.22s ease; }
.likes-modal-enter-active .likes-drawer,
.likes-modal-leave-active .likes-drawer { transition: transform 0.26s cubic-bezier(0.32, 0.72, 0, 1); }
.likes-modal-enter-from,
.likes-modal-leave-to { opacity: 0; }
.likes-modal-enter-from .likes-drawer,
.likes-modal-leave-to .likes-drawer { transform: translateY(100%); }

/* ── Responsive ── */

/* Large tablet landscape */
@media (max-width: 1024px) {
  .post-page { max-width: 700px; }
}

/* Tablet portrait */
@media (max-width: 768px) {
  .post-page { max-width: 100%; padding: 0 14px 50px; margin: 20px auto; }
  .post-full { padding: 18px; border-radius: 10px; }
  .post-full__title { font-size: 1.5rem; }
  .comment-card { padding: 14px 16px; border-radius: 10px; }
  .modal-info, .modal-confirm { padding: 22px 24px; max-width: calc(100% - 32px); }
}

/* Large phone */
@media (max-width: 600px) {
  .post-page { padding: 0 10px 44px; margin: 14px auto; }
  .post-full { padding: 14px; }
  .post-full__meta { flex-wrap: wrap; gap: 6px; }
  .post-full__title { font-size: 1.3rem; }
  .post-full__body { font-size: 0.92rem; }
  .post-full__actions { flex-wrap: wrap; gap: 6px; }
  .action-btn { padding: 7px 14px; font-size: 0.85rem; }
  .post-image { max-height: 280px; }
  .comments-section { margin-top: 20px; padding-top: 16px; }
  .comments-title { font-size: 1.05rem; }
  .comment-card { padding: 12px 14px; }
  .comment-author { font-size: 0.88rem; }
  .comment-body-text { font-size: 0.88rem; }
  .comment-input { font-size: 0.9rem; padding: 10px 12px; }
  .edit-badge { padding: 5px 12px; font-size: 0.78rem; }
  .modal-info, .modal-confirm { padding: 20px 16px; min-width: 240px; }
}

/* Phone */
@media (max-width: 480px) {
  .post-page { padding: 0 8px 40px; }
  .post-full { padding: 12px; border-radius: 8px; }
  .post-full__title { font-size: 1.2rem; }
  .post-full__body { font-size: 0.88rem; }
  .action-btn { padding: 6px 11px; font-size: 0.8rem; }
  .comment-card { padding: 10px 12px; }
  .comment-author { font-size: 0.85rem; }
  .comment-body-text { font-size: 0.85rem; }
  .mention-dropdown { font-size: 0.88rem; }
  .edit-input { font-size: 0.9rem; }
  .edit-form__actions { flex-wrap: wrap; }
  .post-image { max-height: 240px; }
}

/* Small phone (360px) */
@media (max-width: 360px) {
  .post-full__title { font-size: 1.1rem; }
  .post-full__meta { font-size: 0.82rem; }
  .action-btn { padding: 5px 10px; font-size: 0.76rem; }
  .comment-card { padding: 8px 10px; }
  .modal-info, .modal-confirm { min-width: 200px; padding: 16px 12px; }
  .modal-actions { flex-direction: column; gap: 8px; }
  .modal-ok, .modal-confirm-btn, .modal-cancel { width: 100%; justify-content: center; }
  .back-btn { padding: 6px 14px; font-size: 0.88rem; }
}

/* Very small phone (320px) */
@media (max-width: 320px) {
  .post-page { padding: 0 6px 36px; }
  .post-full { padding: 10px; }
  .action-btn { font-size: 0.72rem; padding: 4px 8px; }
}

/* Landscape phone */
@media (max-height: 500px) and (orientation: landscape) {
  .post-page { margin: 8px auto; }
  .comment-input { min-height: 56px; }
}
</style>
