<template>
  <Teleport to="body">
    <Transition name="pt-fade">
      <div v-if="pt.isOpen.value" class="pt-overlay" @click.self="pt.close()">
        <Transition name="pt-slide">
          <div v-if="pt.isOpen.value" class="pt-panel">

            <!-- Header -->
            <div class="pt-header">
              <div class="pt-tabs">
                <button
                  :class="['pt-tab', { active: pt.activeTab.value === 'generate' }]"
                  @click="pt.activeTab.value = 'generate'"
                >Generate</button>
                <button
                  :class="['pt-tab', { active: pt.activeTab.value === 'convert' }]"
                  @click="pt.activeTab.value = 'convert'"
                >Convert</button>
              </div>
              <button class="pt-close" @click="pt.close()" title="Close">&times;</button>
            </div>

            <!-- Error banner -->
            <div v-if="pt.error.value" class="pt-error">
              {{ pt.error.value }}
              <button class="pt-error-x" @click="pt.error.value = ''">&times;</button>
            </div>

            <!-- Save success banner -->
            <div v-if="pt.saveResult.value" class="pt-success">
              Playlist "<strong>{{ pt.saveResult.value.name }}</strong>" saved!
              <a :href="pt.saveResult.value.playlistUrl" target="_blank" rel="noopener">Open in Spotify</a>
            </div>

            <!-- ═══════════════════════ GENERATE TAB ═══════════════════════ -->
            <div v-if="pt.activeTab.value === 'generate'" class="pt-body">

              <!-- Seed track search -->
              <div class="pt-section">
                <label class="pt-label">Seed Tracks ({{ pt.seedTracks.value.length }}/5)</label>
                <div class="pt-search-wrap">
                  <input
                    class="pt-input"
                    :value="pt.searchQuery.value"
                    @input="pt.searchSeeds($event.target.value)"
                    placeholder="Search for a track..."
                    :disabled="pt.seedTracks.value.length >= 5"
                  />
                  <div v-if="pt.searchResults.value.length" class="pt-dropdown">
                    <div
                      v-for="t in pt.searchResults.value"
                      :key="t.id"
                      class="pt-dropdown-item"
                      @click="pt.addSeed(t)"
                    >
                      <img v-if="t.art" :src="t.art" class="pt-dropdown-art" alt="" />
                      <div class="pt-dropdown-info">
                        <span class="pt-dropdown-name">{{ t.name }}</span>
                        <span class="pt-dropdown-artist">{{ t.artist }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Selected seeds -->
                <div v-if="pt.seedTracks.value.length" class="pt-chips">
                  <div v-for="(t, i) in pt.seedTracks.value" :key="t.id" class="pt-chip">
                    <img v-if="t.art" :src="t.art" class="pt-chip-art" alt="" />
                    <span class="pt-chip-text">{{ t.name }} — {{ t.artist }}</span>
                    <button class="pt-chip-x" @click="pt.removeSeed(i)">&times;</button>
                  </div>
                </div>
              </div>

              <!-- Reference playlist -->
              <div class="pt-section">
                <label class="pt-label">Reference Playlist (optional)</label>
                <input
                  class="pt-input"
                  v-model="pt.seedPlaylistUrl.value"
                  placeholder="Paste a Spotify playlist URL..."
                />
              </div>

              <!-- Genre/mood tags -->
              <div class="pt-section">
                <label class="pt-label">Genres / Moods</label>
                <div class="pt-tags">
                  <button
                    v-for="g in pt.GENRES"
                    :key="g"
                    :class="['pt-tag', { selected: pt.selectedGenres.value.includes(g) }]"
                    @click="pt.toggleGenre(g)"
                  >{{ g }}</button>
                </div>
              </div>

              <!-- Track count -->
              <div class="pt-section pt-row">
                <label class="pt-label">Tracks: {{ pt.trackLimit.value }}</label>
                <input type="range" min="10" max="50" v-model.number="pt.trackLimit.value" class="pt-range" />
              </div>

              <!-- Generate button -->
              <button
                class="pt-btn pt-btn-primary"
                @click="pt.generate()"
                :disabled="pt.generateLoading.value || (!pt.seedTracks.value.length && !pt.selectedGenres.value.length)"
              >
                {{ pt.generateLoading.value ? 'Generating...' : 'Generate Playlist' }}
              </button>

              <!-- Results -->
              <div v-if="pt.generatedTracks.value.length" class="pt-results">
                <div class="pt-results-header">
                  <span>{{ pt.resultTracks.value.length }} tracks</span>
                </div>
                <div class="pt-track-list">
                  <div v-for="(t, i) in pt.resultTracks.value" :key="t.id || i" class="pt-track">
                    <img v-if="t.art" :src="t.art" class="pt-track-art" alt="" />
                    <div class="pt-track-info">
                      <span class="pt-track-name">{{ t.name }}</span>
                      <span class="pt-track-artist">{{ t.artist }}</span>
                    </div>
                    <button class="pt-track-remove" @click="pt.removeResult(i)" title="Remove">&times;</button>
                  </div>
                </div>
                <!-- Action bar -->
                <div class="pt-actions">
                  <button class="pt-btn pt-btn-play" @click="handlePlayNow" :disabled="!pt.resultTracks.value.length">
                    Play Now
                  </button>
                  <button class="pt-btn pt-btn-save" @click="showSaveDialog = true" :disabled="!pt.resultTracks.value.length">
                    Save to Spotify
                  </button>
                </div>
              </div>
            </div>

            <!-- ═══════════════════════ CONVERT TAB ═══════════════════════ -->
            <div v-if="pt.activeTab.value === 'convert'" class="pt-body">

              <div class="pt-section">
                <label class="pt-label">Paste Playlist URL</label>
                <div class="pt-url-row">
                  <input
                    class="pt-input pt-url-input"
                    v-model="pt.convertUrl.value"
                    placeholder="YouTube or Spotify playlist URL..."
                  />
                  <span v-if="detectedPlatform" class="pt-badge" :class="detectedPlatform">
                    {{ detectedPlatform === 'youtube' ? 'YouTube' : 'Spotify' }}
                  </span>
                </div>
              </div>

              <div class="pt-section pt-direction" v-if="pt.convertDirection.value">
                <span v-if="pt.convertDirection.value === 'yt-to-spotify'">YouTube &rarr; Spotify</span>
                <span v-else>Spotify &rarr; YouTube</span>
              </div>

              <button
                class="pt-btn pt-btn-primary"
                @click="pt.startConvert()"
                :disabled="pt.convertLoading.value || !pt.convertUrl.value.trim()"
              >
                {{ pt.convertLoading.value ? 'Converting...' : 'Convert' }}
              </button>

              <!-- Match results -->
              <div v-if="pt.matchedTracks.value.length" class="pt-results">
                <div class="pt-results-header">
                  <span>{{ matchStats.exact }} exact, {{ matchStats.close }} close, {{ matchStats.none }} unmatched</span>
                </div>
                <div class="pt-track-list">
                  <div v-for="(m, i) in pt.matchedTracks.value" :key="i" class="pt-match-row">
                    <!-- Source -->
                    <div class="pt-match-source">
                      <span class="pt-match-title">{{ m.source.title }}</span>
                      <span class="pt-match-sub">{{ m.source.artist || m.source.channelTitle }}</span>
                    </div>
                    <span class="pt-match-arrow">&rarr;</span>
                    <!-- Match -->
                    <div class="pt-match-target" v-if="m.bestMatch">
                      <img v-if="m.bestMatch.art || m.bestMatch.thumbnail" :src="m.bestMatch.art || m.bestMatch.thumbnail" class="pt-track-art" alt="" />
                      <div class="pt-track-info">
                        <span class="pt-track-name">{{ m.bestMatch.name || m.bestMatch.title }}</span>
                        <span class="pt-track-artist">{{ m.bestMatch.artist || m.bestMatch.channelTitle }}</span>
                      </div>
                    </div>
                    <div class="pt-match-target pt-no-match" v-else>
                      <span>No match found</span>
                    </div>
                    <span :class="['pt-confidence', m.confidence]">{{ m.confidence }}</span>

                    <!-- Alternatives dropdown -->
                    <div v-if="m.alternatives?.length" class="pt-alt-wrap">
                      <button class="pt-alt-btn" @click="toggleAlt(i)">Swap</button>
                      <div v-if="altOpen === i" class="pt-alt-dropdown">
                        <div
                          v-for="alt in m.alternatives"
                          :key="alt.id || alt.videoId"
                          class="pt-dropdown-item"
                          @click="pt.swapMatch(i, alt); altOpen = null"
                        >
                          <span class="pt-dropdown-name">{{ alt.name || alt.title }}</span>
                          <span class="pt-dropdown-artist">{{ alt.artist || alt.channelTitle }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Actions (only for yt-to-spotify direction since we can play/save Spotify tracks) -->
                <div class="pt-actions" v-if="pt.convertDirection.value === 'yt-to-spotify'">
                  <button class="pt-btn pt-btn-play" @click="handlePlayNow" :disabled="!pt.resultTracks.value.length">
                    Play Now
                  </button>
                  <button class="pt-btn pt-btn-save" @click="showSaveDialog = true" :disabled="!pt.resultTracks.value.length">
                    Save to Spotify
                  </button>
                </div>
                <div class="pt-actions" v-else-if="pt.convertDirection.value === 'spotify-to-yt'">
                  <p class="pt-hint">YouTube matches found — copy links or listen on YouTube.</p>
                </div>
              </div>
            </div>

            <!-- ═══════════════════════ SAVE DIALOG ═══════════════════════ -->
            <div v-if="showSaveDialog" class="pt-save-overlay" @click.self="showSaveDialog = false">
              <div class="pt-save-dialog">
                <h3>Save to Spotify</h3>
                <input
                  class="pt-input"
                  v-model="playlistName"
                  placeholder="Playlist name..."
                  @keydown.enter="handleSave"
                />
                <div class="pt-save-actions">
                  <button class="pt-btn pt-btn-save" @click="handleSave" :disabled="pt.saving.value || !playlistName.trim()">
                    {{ pt.saving.value ? 'Saving...' : 'Save' }}
                  </button>
                  <button class="pt-btn" @click="showSaveDialog = false">Cancel</button>
                </div>
              </div>
            </div>

          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue';
import { usePlaylistTools } from '../composables/usePlaylistTools.js';
import { useSpotifySDK } from '../composables/useSpotifySDK.js';

const pt  = usePlaylistTools();
const sdk = useSpotifySDK();

const showSaveDialog = ref(false);
const playlistName   = ref('');
const altOpen        = ref(null);

const detectedPlatform = computed(() => {
  const url = pt.convertUrl.value;
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/spotify\.com/i.test(url)) return 'spotify';
  return null;
});

const matchStats = computed(() => {
  const m = pt.matchedTracks.value;
  return {
    exact: m.filter((x) => x.confidence === 'exact').length,
    close: m.filter((x) => x.confidence === 'close' || x.confidence === 'manual').length,
    none:  m.filter((x) => x.confidence === 'none').length,
  };
});

const toggleAlt = (i) => {
  altOpen.value = altOpen.value === i ? null : i;
};

const handlePlayNow = () => {
  const tracks = pt.resultTracks.value.filter((t) => t.uri);
  if (!tracks.length) return;
  sdk.playUris(
    tracks.map((t) => t.uri),
    tracks,
  );
  pt.close();
};

const handleSave = () => {
  if (!playlistName.value.trim()) return;
  pt.saveToSpotify(playlistName.value.trim());
  showSaveDialog.value = false;
  playlistName.value = '';
};
</script>

<style scoped>
/* ─── Overlay ─────────────────────────────────────────────────────────────── */
.pt-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9000;
  display: flex;
  justify-content: flex-end;
}

/* ─── Panel (drawer from right) ───────────────────────────────────────────── */
.pt-panel {
  width: min(520px, 100vw);
  height: 100vh;
  background: #0f0f0f;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* ─── Transitions ─────────────────────────────────────────────────────────── */
.pt-fade-enter-active, .pt-fade-leave-active { transition: opacity 0.25s ease; }
.pt-fade-enter-from, .pt-fade-leave-to { opacity: 0; }

.pt-slide-enter-active, .pt-slide-leave-active { transition: transform 0.3s ease; }
.pt-slide-enter-from, .pt-slide-leave-to { transform: translateX(100%); }

/* ─── Header ──────────────────────────────────────────────────────────────── */
.pt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #222;
  flex-shrink: 0;
}

.pt-tabs { display: flex; gap: 4px; }

.pt-tab {
  background: none;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 8px 18px;
  color: #888;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.pt-tab.active {
  background: #7c3aed;
  border-color: #7c3aed;
  color: #fff;
}
.pt-tab:hover:not(.active) { border-color: #555; color: #ccc; }

.pt-close {
  background: none;
  border: none;
  color: #888;
  font-size: 28px;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}
.pt-close:hover { color: #fff; }

/* ─── Body (scrollable area) ──────────────────────────────────────────────── */
.pt-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ─── Section + Labels ────────────────────────────────────────────────────── */
.pt-section { display: flex; flex-direction: column; gap: 8px; }
.pt-label { font-size: 13px; font-weight: 600; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; }

/* ─── Input ───────────────────────────────────────────────────────────────── */
.pt-input {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 10px 14px;
  color: #eee;
  font-size: 14px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.pt-input:focus { border-color: #7c3aed; }
.pt-input::placeholder { color: #555; }

/* ─── Search dropdown ─────────────────────────────────────────────────────── */
.pt-search-wrap { position: relative; }

.pt-dropdown {
  position: absolute;
  top: 100%;
  left: 0; right: 0;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 0 0 8px 8px;
  max-height: 260px;
  overflow-y: auto;
  z-index: 10;
}

.pt-dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.1s;
}
.pt-dropdown-item:hover { background: #252525; }

.pt-dropdown-art { width: 36px; height: 36px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
.pt-dropdown-info { display: flex; flex-direction: column; overflow: hidden; }
.pt-dropdown-name { font-size: 13px; color: #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pt-dropdown-artist { font-size: 11px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ─── Chips (selected seeds) ──────────────────────────────────────────────── */
.pt-chips { display: flex; flex-wrap: wrap; gap: 6px; }

.pt-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #1f1f2e;
  border: 1px solid #7c3aed44;
  border-radius: 20px;
  padding: 4px 10px 4px 4px;
}
.pt-chip-art { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }
.pt-chip-text { font-size: 12px; color: #ccc; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-chip-x { background: none; border: none; color: #888; font-size: 16px; cursor: pointer; padding: 0 2px; line-height: 1; }
.pt-chip-x:hover { color: #f44; }

/* ─── Genre tags ──────────────────────────────────────────────────────────── */
.pt-tags { display: flex; flex-wrap: wrap; gap: 6px; }

.pt-tag {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 16px;
  padding: 5px 14px;
  font-size: 12px;
  color: #aaa;
  cursor: pointer;
  transition: all 0.15s;
}
.pt-tag.selected {
  background: #7c3aed;
  border-color: #7c3aed;
  color: #fff;
}
.pt-tag:hover:not(.selected) { border-color: #555; color: #ddd; }

/* ─── Range slider ────────────────────────────────────────────────────────── */
.pt-row { flex-direction: row; align-items: center; gap: 12px; }
.pt-range { flex: 1; accent-color: #7c3aed; }

/* ─── Buttons ─────────────────────────────────────────────────────────────── */
.pt-btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid #333;
  background: #1a1a1a;
  color: #ccc;
  transition: all 0.15s;
}
.pt-btn:hover:not(:disabled) { border-color: #555; color: #fff; }
.pt-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.pt-btn-primary { background: #7c3aed; border-color: #7c3aed; color: #fff; }
.pt-btn-primary:hover:not(:disabled) { background: #6d28d9; }

.pt-btn-play { background: #1db954; border-color: #1db954; color: #fff; }
.pt-btn-play:hover:not(:disabled) { background: #1aa34a; }

.pt-btn-save { background: #7c3aed; border-color: #7c3aed; color: #fff; }

/* ─── Results ─────────────────────────────────────────────────────────────── */
.pt-results { display: flex; flex-direction: column; gap: 8px; }

.pt-results-header {
  font-size: 13px;
  color: #888;
  padding: 4px 0;
  border-bottom: 1px solid #222;
}

.pt-track-list {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.pt-track {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px solid #1a1a1a;
}

.pt-track-art { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
.pt-track-info { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.pt-track-name { font-size: 13px; color: #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pt-track-artist { font-size: 11px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.pt-track-remove {
  background: none; border: none; color: #555; font-size: 18px; cursor: pointer; padding: 2px 6px; line-height: 1;
}
.pt-track-remove:hover { color: #f44; }

/* ─── Actions bar ─────────────────────────────────────────────────────────── */
.pt-actions {
  display: flex;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid #222;
}

/* ─── Error / Success banners ─────────────────────────────────────────────── */
.pt-error {
  background: #3b1111;
  border: 1px solid #7f1d1d;
  color: #fca5a5;
  padding: 10px 16px;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.pt-error-x { background: none; border: none; color: #fca5a5; font-size: 18px; cursor: pointer; }

.pt-success {
  background: #0b3d1a;
  border: 1px solid #166534;
  color: #86efac;
  padding: 10px 16px;
  font-size: 13px;
  flex-shrink: 0;
}
.pt-success a { color: #4ade80; text-decoration: underline; margin-left: 8px; }

/* ─── Convert: URL row + badge ────────────────────────────────────────────── */
.pt-url-row { display: flex; gap: 8px; align-items: center; }
.pt-url-input { flex: 1; }

.pt-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}
.pt-badge.youtube { background: #dc2626; color: #fff; }
.pt-badge.spotify { background: #1db954; color: #fff; }

.pt-direction { font-size: 14px; color: #aaa; font-weight: 600; text-align: center; }

/* ─── Match rows ──────────────────────────────────────────────────────────── */
.pt-match-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  border-bottom: 1px solid #1a1a1a;
  flex-wrap: wrap;
}

.pt-match-source {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.pt-match-title { font-size: 12px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pt-match-sub { font-size: 10px; color: #666; }

.pt-match-arrow { color: #555; font-size: 16px; flex-shrink: 0; }

.pt-match-target {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pt-no-match { color: #666; font-style: italic; font-size: 12px; }

.pt-confidence {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
  flex-shrink: 0;
}
.pt-confidence.exact { background: #166534; color: #86efac; }
.pt-confidence.close, .pt-confidence.manual { background: #713f12; color: #fde047; }
.pt-confidence.none { background: #7f1d1d; color: #fca5a5; }

/* ─── Alternatives ────────────────────────────────────────────────────────── */
.pt-alt-wrap { position: relative; flex-shrink: 0; }
.pt-alt-btn {
  background: none; border: 1px solid #333; border-radius: 6px;
  padding: 3px 10px; font-size: 11px; color: #888; cursor: pointer;
}
.pt-alt-btn:hover { border-color: #555; color: #ccc; }

.pt-alt-dropdown {
  position: absolute;
  right: 0; top: 100%;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  min-width: 220px;
  z-index: 20;
  overflow: hidden;
}

.pt-hint { font-size: 12px; color: #888; margin: 0; }

/* ─── Save dialog overlay ─────────────────────────────────────────────────── */
.pt-save-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
}

.pt-save-dialog {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 24px;
  width: min(360px, 90%);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.pt-save-dialog h3 { margin: 0; color: #eee; font-size: 16px; }

.pt-save-actions { display: flex; gap: 10px; justify-content: flex-end; }

/* ─── Mobile ──────────────────────────────────────────────────────────────── */
@media (max-width: 600px) {
  .pt-panel { width: 100vw; }
  .pt-match-row { font-size: 11px; }
}
</style>
