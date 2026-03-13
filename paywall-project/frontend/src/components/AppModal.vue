<template>
  <!--
    Teleport renders the modal directly inside <body> so it is never clipped
    by an ancestor's overflow:hidden or z-index stacking context.
  -->
  <Teleport to="body">
    <!--
      Transition adds a fade + slight scale animation when the modal appears
      or disappears. The CSS class names (am-fade-*) are defined in <style>.
    -->
    <Transition name="am-fade">
      <!--
        The overlay fills the viewport with a semi-transparent backdrop.
        Clicking directly on the overlay (not the modal box) fires 'cancel'
        via the .self modifier — clicks on child elements are ignored.
        The @keydown listener lets keyboard users confirm/cancel.
      -->
      <div v-if="show" class="am-overlay" @click.self="$emit('cancel')" @keydown="onKey">
        <!--
          am-box--danger applies a red border variant for destructive actions
          (e.g. "Delete account?" confirmations).
        -->
        <div class="am-box" :class="{ 'am-box--danger': danger }">
          <!-- Optional bold title above the message -->
          <p v-if="title" class="am-title">{{ title }}</p>
          <p class="am-msg">{{ message }}</p>

          <div class="am-actions">
            <!--
              The Cancel button is hidden for 'alert' type modals that only
              need a single acknowledgement button.
            -->
            <button v-if="type !== 'alert'" class="am-btn am-cancel" @click="$emit('cancel')">
              {{ cancelLabel || 'Cancel' }}
            </button>
            <!--
              The OK button is ref'd so it can be programmatically focused
              when the modal opens (see the watcher below), enabling
              immediate keyboard confirmation without a mouse click.
              The class binding switches between the normal style and the
              danger (red) style based on the `danger` prop.
            -->
            <button
              ref="okBtn"
              class="am-btn"
              :class="danger ? 'am-danger' : 'am-ok'"
              @click="$emit('ok')"
            >
              {{ okLabel || 'OK' }}
            </button>
          </div>

          <!-- Keyboard hint rendered below the buttons -->
          <p class="am-hint">Press <kbd>Enter</kbd> or <kbd>Space</kbd> to confirm · <kbd>Esc</kbd> to cancel</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
// =============================================================================
// AppModal.vue — reusable confirm / alert dialog component
//
// Supports two visual modes:
//   - 'confirm' (default): shows both Cancel and OK buttons
//   - 'alert':             shows only the OK button (no Cancel)
//
// Supports a 'danger' prop that applies a red colour scheme when the action
// being confirmed is destructive (e.g. account deletion).
//
// Emits:
//   'ok'     — user confirmed (clicked OK, pressed Enter, or pressed Space)
//   'cancel' — user dismissed (clicked Cancel, clicked overlay, pressed Esc)
//
// Accessibility:
//   - The OK button is auto-focused on open so keyboard users can confirm
//     immediately without tabbing.
//   - @keydown on the overlay intercepts Enter/Space (confirm) and Esc (cancel)
//     wherever focus is within the modal.
// =============================================================================

import { ref, watch, nextTick } from 'vue';

// ── Props ──────────────────────────────────────────────────────────────────────

const props = defineProps({
  // Controls visibility — parent toggles this to open/close the modal
  show: Boolean,

  // Optional bold heading rendered above the message text
  title: String,

  // Main body text of the modal (required for meaningful content)
  message: String,

  // 'confirm' shows Cancel + OK; 'alert' shows only OK
  type: { type: String, default: 'confirm' },

  // When true, applies the red danger colour scheme
  danger: Boolean,

  // Override the default button labels if needed
  okLabel: String,
  cancelLabel: String,
});

const emit = defineEmits(['ok', 'cancel']);

// ── Refs ───────────────────────────────────────────────────────────────────────

// Template ref for the OK button element — used to programmatically focus it
const okBtn = ref(null);

// ── Watchers ───────────────────────────────────────────────────────────────────

/**
 * Auto-focus the OK button when the modal opens.
 * nextTick is required because Vue hasn't rendered the button into the DOM
 * yet at the moment `show` becomes true — we need to wait one tick.
 */
watch(() => props.show, async (val) => {
  if (val) {
    await nextTick();
    okBtn.value?.focus();
  }
});

// ── Keyboard handler ───────────────────────────────────────────────────────────

/**
 * Handles keyboard events bubbled up to the overlay element.
 * Enter and Space emit 'ok' (confirm), Escape emits 'cancel' (dismiss).
 * preventDefault stops Space from scrolling the page and Enter from
 * re-triggering the last focused button.
 */
const onKey = (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    emit('ok');
  } else if (e.key === 'Escape') {
    e.preventDefault();
    emit('cancel');
  }
};
</script>

<style scoped>
/* Full-viewport backdrop with centered flex layout */
.am-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  padding: 20px;
  outline: none;
}

/* Modal box */
.am-box {
  background: pink;
  border: 3px solid #000;
  border-radius: 16px;
  padding: 26px 24px 18px;
  max-width: 360px;
  width: 100%;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
}

/* Red border variant for destructive-action confirmations */
.am-box--danger {
  border-color: #7f1d1d;
}

.am-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #000;
  margin: 0 0 8px;
}

.am-msg {
  font-size: 0.95rem;
  font-weight: 500;
  color: #1f2937;
  margin: 0 0 22px;
  line-height: 1.5;
}

.am-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-bottom: 14px;
}

.am-btn {
  padding: 9px 22px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s, box-shadow 0.15s;
  border: 3px solid transparent;
  outline: none;
}
.am-btn:hover { transform: translateY(-1px); }
.am-btn:focus-visible {
  box-shadow: 0 0 0 3px rgba(20, 83, 45, 0.5);
  transform: translateY(-1px);
}

/* Cancel button — neutral white style */
.am-cancel {
  background: #fff;
  color: #333;
  border-color: #ccc;
}
.am-cancel:hover { border-color: #000; color: #000; }

/* OK button — default black/pink brand style */
.am-ok {
  background: #000;
  color: pink;
  border-color: #14532d;
}
.am-ok:hover { color: rgb(125, 190, 157); }

/* OK button — danger/destructive red style */
.am-danger {
  background: #7f1d1d;
  color: #fff;
  border-color: #450a0a;
}
.am-danger:hover { background: #991b1b; }
.am-danger:focus-visible { box-shadow: 0 0 0 3px rgba(127, 29, 29, 0.5); }

/* Small keyboard hint below the action buttons */
.am-hint {
  font-size: 0.72rem;
  color: #777;
  text-align: center;
  margin: 0;
}
.am-hint kbd {
  background: #000;
  color: pink;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 0.68rem;
  font-family: inherit;
  font-weight: 700;
}

/* ── Enter/leave transition ── */
.am-fade-enter-active,
.am-fade-leave-active {
  transition: opacity 0.18s ease;
}
.am-fade-enter-from,
.am-fade-leave-to {
  opacity: 0;
}
/* The box itself scales up/down alongside the overlay fade */
.am-fade-enter-active .am-box,
.am-fade-leave-active .am-box {
  transition: transform 0.18s ease;
}
.am-fade-enter-from .am-box,
.am-fade-leave-to .am-box {
  transform: scale(0.94) translateY(8px);
}
</style>
