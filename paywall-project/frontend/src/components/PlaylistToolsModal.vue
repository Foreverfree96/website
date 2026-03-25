<template>
  <!-- Floating pill when minimized -->
  <Teleport to="body">
    <Transition name="pt-fade">
      <div v-if="pt.isOpen.value && pt.isMinimized.value"
           :class="['pt-mini-pill', { done: pt.bgDone.value }]"
           @click="pt.open()">
        <span class="pt-mini-icon">♫</span>
        <span class="pt-mini-text">{{ pt.bgStatus.value || 'Playlist Tools' }}</span>
        <button class="pt-mini-close" @click.stop="pt.close()">&times;</button>
      </div>
    </Transition>
  </Teleport>

  <!-- Main panel -->
  <Teleport to="body">
    <Transition name="pt-fade">
      <div v-if="pt.isOpen.value && !pt.isMinimized.value" class="pt-overlay" @click.self="pt.minimize()">
        <Transition name="pt-slide">
          <div v-if="pt.isOpen.value && !pt.isMinimized.value" class="pt-panel">

            <!-- Header -->
            <div class="pt-header">
              <div class="pt-tabs">
                <button
                  :class="['pt-tab', { active: pt.activeTab.value === 'generate' }]"
                  @click="pt.setTab('generate')"
                >Generate</button>
                <button
                  :class="['pt-tab', { active: pt.activeTab.value === 'convert' }]"
                  @click="pt.setTab('convert')"
                >Convert</button>
                <button
                  :class="['pt-tab', { active: pt.activeTab.value === 'rename' }]"
                  @click="pt.setTab('rename'); loadRenamePlaylists()"
                >Rename</button>
              </div>
              <button class="pt-minimize" @click="pt.minimize()" title="Minimize">&#x2015;</button>
              <button class="pt-close" @click="pt.close()" title="Close">&times;</button>
            </div>

            <!-- Error banner -->
            <div v-if="pt.error.value" class="pt-error">
              {{ pt.error.value }}
              <a v-if="pt.scopeMissing.value" :href="spotifyReconnectUrl" class="pt-reconnect-link" @click="pt.saveState()">Reconnect Spotify</a>
              <a v-if="pt.ytScopeMissing.value" :href="youtubeReconnectUrl" class="pt-reconnect-link" style="color:#f87171">Connect YouTube</a>
              <button class="pt-error-x" @click="pt.error.value = ''; pt.scopeMissing.value = false; pt.ytScopeMissing.value = false">&times;</button>
            </div>

            <!-- Save success banner -->
            <div v-if="pt.saveResult.value" class="pt-success">
              <span>Playlist "<strong>{{ pt.saveResult.value.name }}</strong>" saved!
              <a :href="pt.saveResult.value.playlistUrl" target="_blank" rel="noopener">Open in Spotify</a></span>
              <button class="pt-success-dismiss" @click="pt.saveResult.value = null">&times;</button>
            </div>
            <div v-if="pt.ytSaveResult.value" class="pt-success pt-success-yt">
              <span>Playlist "<strong>{{ pt.ytSaveResult.value.name }}</strong>" saved — {{ pt.ytSaveResult.value.added }}/{{ pt.ytSaveResult.value.total }} videos added{{ pt.ytSaveResult.value.skipped ? `, ${pt.ytSaveResult.value.skipped} skipped` : '' }}!
              <a :href="pt.ytSaveResult.value.playlistUrl" target="_blank" rel="noopener">Open in YouTube</a></span>
              <button class="pt-success-dismiss" @click="pt.ytSaveResult.value = null">&times;</button>
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
                  <div v-if="pt.searchLoading.value && pt.searchQuery.value.trim()" class="pt-search-loading">Searching...</div>
                  <div v-if="pt.searchError.value" class="pt-search-error">{{ pt.searchError.value }}</div>
                </div>
                <!-- Search results (in normal flow so scrollable body doesn't clip them) -->
                <div v-if="pt.searchResults.value.length" class="pt-search-results">
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
                    <span :class="['pt-source-badge', t._source || 'spotify']">{{ t._source === 'youtube' ? 'YT' : 'SP' }}</span>
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

              <!-- Reference URLs (playlists or tracks) -->
              <div class="pt-section">
                <label class="pt-label">Reference Playlists/Tracks (optional)</label>
                <div class="pt-seed-urls-row">
                  <input
                    class="pt-input pt-seed-url-input"
                    v-model="refUrlInput"
                    placeholder="Paste a Spotify or YouTube link..."
                    @keydown.enter="addRefUrl"
                  />
                  <button class="pt-btn pt-btn-sm pt-btn-primary" @click="addRefUrl" :disabled="!refUrlInput.trim()">Add</button>
                </div>
                <!-- Added reference URLs -->
                <div v-if="pt.seedPlaylistUrls.value.length" class="pt-seed-urls-list">
                  <div v-for="(url, idx) in pt.seedPlaylistUrls.value" :key="idx" class="pt-seed-url-chip">
                    <span class="pt-seed-url-text">{{ url.length > 50 ? url.substring(0, 47) + '...' : url }}</span>
                    <button class="pt-seed-url-x" @click="pt.removeSeedPlaylistUrl(idx)" title="Remove">✕</button>
                  </div>
                </div>
              </div>

              <!-- Artist seeds -->
              <div class="pt-section">
                <label class="pt-label">Seed Artists (optional)</label>
                <div class="pt-seed-urls-row">
                  <input
                    class="pt-input pt-seed-url-input"
                    v-model="refArtistInput"
                    placeholder="Paste a Spotify artist link..."
                    @keydown.enter="addRefArtist"
                  />
                  <button class="pt-btn pt-btn-sm pt-btn-primary" @click="addRefArtist" :disabled="!refArtistInput.trim()">Add</button>
                </div>
                <!-- Added artist URLs -->
                <div v-if="pt.seedArtistUrls.value.length" class="pt-seed-urls-list">
                  <div v-for="(url, idx) in pt.seedArtistUrls.value" :key="'artist-'+idx" class="pt-seed-url-chip pt-seed-artist-chip">
                    <span class="pt-seed-url-text">🎤 {{ url.length > 45 ? url.substring(0, 42) + '...' : url }}</span>
                    <button class="pt-seed-url-x" @click="pt.removeSeedArtistUrl(idx)" title="Remove">✕</button>
                  </div>
                </div>
              </div>

              <!-- Album seeds -->
              <div class="pt-section">
                <label class="pt-label">Seed Albums (optional)</label>
                <div class="pt-seed-urls-row">
                  <input
                    class="pt-input pt-seed-url-input"
                    v-model="refAlbumInput"
                    placeholder="Paste a Spotify album link..."
                    @keydown.enter="addRefAlbum"
                  />
                  <button class="pt-btn pt-btn-sm pt-btn-primary" @click="addRefAlbum" :disabled="!refAlbumInput.trim()">Add</button>
                </div>
                <!-- Added album URLs -->
                <div v-if="pt.seedAlbumUrls.value.length" class="pt-seed-urls-list">
                  <div v-for="(url, idx) in pt.seedAlbumUrls.value" :key="'album-'+idx" class="pt-seed-url-chip pt-seed-album-chip">
                    <span class="pt-seed-url-text">💿 {{ url.length > 45 ? url.substring(0, 42) + '...' : url }}</span>
                    <button class="pt-seed-url-x" @click="pt.removeSeedAlbumUrl(idx)" title="Remove">✕</button>
                  </div>
                </div>
              </div>

              <!-- Genre/mood tags -->
              <div class="pt-section">
                <label class="pt-label">Genres / Moods</label>
                <div class="pt-genre-search-row">
                  <input
                    class="pt-input pt-genre-search"
                    v-model="pt.genreFilter.value"
                    placeholder="Search genres..."
                  />
                  <input
                    class="pt-input pt-genre-custom"
                    v-model="customGenreInput"
                    placeholder="Custom genre..."
                    @keydown.enter="addCustom"
                  />
                </div>
                <!-- Selected genres chips -->
                <div v-if="pt.selectedGenres.value.length" class="pt-chips" style="margin-bottom:6px">
                  <div v-for="(g, i) in pt.selectedGenres.value" :key="'sel-'+g" class="pt-chip">
                    <span class="pt-chip-text">{{ g }}</span>
                    <button class="pt-chip-x" @click="pt.toggleGenre(g)">&times;</button>
                  </div>
                </div>
                <!-- Categorized genre tags -->
                <div v-for="(genres, cat) in filteredCategories" :key="cat" class="pt-genre-category">
                  <div class="pt-genre-cat-header" @click="toggleCat(cat)">
                    <span>{{ cat }}</span>
                    <span class="pt-genre-cat-arrow">{{ openCats.has(cat) ? '▾' : '▸' }}</span>
                  </div>
                  <div v-if="openCats.has(cat)" class="pt-tags">
                    <button
                      v-for="g in genres"
                      :key="g"
                      :class="['pt-tag', { selected: pt.selectedGenres.value.includes(g) }]"
                      @click="pt.toggleGenre(g)"
                    >{{ g }}</button>
                  </div>
                </div>
              </div>

              <!-- Language selection -->
              <div class="pt-section">
                <label class="pt-label">Language</label>
                <div class="pt-tags">
                  <button
                    v-for="lang in pt.LANGUAGE_OPTIONS"
                    :key="lang.code"
                    :class="['pt-tag', { selected: pt.selectedLanguages.value.includes(lang.code) }]"
                    @click="pt.toggleLanguage(lang.code)"
                  >{{ lang.label }}</button>
                </div>
              </div>

              <!-- Track count -->
              <div class="pt-section pt-row">
                <label class="pt-label">Tracks: {{ pt.trackLimit.value }}</label>
                <input type="range" min="10" max="100" step="5" v-model.number="pt.trackLimit.value" class="pt-range" />
              </div>

              <!-- Progress pill + Cancel button -->
              <div v-if="pt.generateLoading.value" class="pt-progress-wrap">
                <div class="pt-progress-pill">
                  <div class="pt-progress-bar" :style="{ width: Math.round(pt.generateProgress.value) + '%' }"></div>
                  <span class="pt-progress-text">{{ Math.round(pt.generateProgress.value) }}%</span>
                </div>
                <button
                  class="pt-btn pt-btn-cancel pt-btn-full"
                  @click="pt.cancelGenerate()"
                >Cancel</button>
              </div>
              <button
                v-else
                class="pt-btn pt-btn-primary pt-btn-full"
                @click="pt.generate()"
                :disabled="!pt.seedTracks.value.length && !pt.selectedGenres.value.length && !pt.seedPlaylistUrl.value.trim()"
              >
                Generate Playlist
              </button>

              <!-- Results -->
              <div v-if="pt.generateSpotifyResults.value.length || pt.generateYoutubeResults.value.length" class="pt-results">
                <!-- Platform toggle (post-generation) -->
                <div class="pt-results-header">
                  <div class="pt-target-toggle">
                    <button
                      :class="['pt-target-btn', { active: pt.generateTarget.value === 'spotify' }]"
                      @click="pt.setGenerateTarget('spotify')"
                    >Spotify ({{ pt.generateSpotifyResults.value.length }})</button>
                    <button
                      :class="['pt-target-btn', { active: pt.generateTarget.value === 'youtube' }]"
                      @click="pt.setGenerateTarget('youtube')"
                    >YouTube ({{ pt.generateYoutubeResults.value.length }})</button>
                  </div>
                </div>

                <!-- YouTube quota message -->
                <div v-if="pt.generateTarget.value === 'youtube' && !pt.generateYoutubeResults.value.length" class="pt-empty-msg">
                  YouTube matching unavailable — API quota may be exhausted. Try again later.
                </div>

                <div v-else class="pt-track-list">
                  <div v-for="(t, i) in pt.resultTracks.value" :key="t.id || t.videoId || i" class="pt-track">
                    <img v-if="t.art || t.thumbnail" :src="t.art || t.thumbnail" class="pt-track-art" alt="" />
                    <div class="pt-track-info">
                      <span class="pt-track-name">{{ t.name || t.title }}</span>
                      <span class="pt-track-artist">{{ t.artist || t.channelTitle }}</span>
                    </div>
                    <button v-if="t.id && pt.generateTarget.value === 'spotify'" class="pt-like-btn" :class="{ liked: pt.likedIds.value.has(t.id) }" @click="pt.likeTrack(t.id)" title="Save to Liked Songs">♥</button>
                    <button class="pt-track-remove" @click="pt.removeResult(i)" title="Remove">&times;</button>
                  </div>
                </div>

                <!-- Unified action bar — all save/play options -->
                <div class="pt-actions" ref="actionsBarRef">
                  <button v-if="pt.generateTarget.value === 'spotify'" class="pt-btn pt-btn-play" @click="handlePlayNow" :disabled="!pt.generateSpotifyResults.value.length">
                    Play Now
                  </button>
                  <button v-if="pt.generateTarget.value === 'youtube'" class="pt-btn pt-btn-play" @click="handlePlayNowYoutube" :disabled="!pt.generateYoutubeResults.value.length">
                    Play Now
                  </button>
                  <button class="pt-btn pt-btn-save" @click="showSaveDialog = true" :disabled="!pt.generateSpotifyResults.value.length">
                    Save to Spotify
                  </button>
                  <button class="pt-btn pt-btn-yt-save" @click="openYtSaveDialog" :disabled="!pt.generateYoutubeResults.value.length">
                    Save to YouTube
                  </button>
                  <button class="pt-btn pt-btn-primary" @click="copyYoutubeLinks" :disabled="!pt.generateYoutubeResults.value.length">
                    {{ ytCopied ? 'Copied!' : 'Copy All Links' }}
                  </button>
                  <button class="pt-btn" @click="openYoutubePlaylist" :disabled="!pt.generateYoutubeResults.value.length">
                    Open Playlist
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
                  <span v-if="detectedPlatform" class="pt-badge" :class="detectedPlatform === 'youtube-music' ? 'youtube' : detectedPlatform">
                    {{ detectedPlatform === 'youtube' ? 'YouTube' : detectedPlatform === 'youtube-music' ? 'YT Music' : 'Spotify' }}
                  </span>
                </div>
              </div>

              <div class="pt-section pt-direction" v-if="pt.convertDirection.value">
                <span v-if="pt.convertDirection.value === 'yt-to-spotify'">YouTube &rarr; Spotify</span>
                <span v-else>Spotify &rarr; YouTube</span>
              </div>

              <div v-if="pt.convertLoading.value" class="pt-progress-wrap">
                <div class="pt-progress-pill">
                  <div class="pt-progress-bar" :style="{ width: Math.round(pt.convertProgress.value) + '%' }"></div>
                  <span class="pt-progress-text">{{ Math.round(pt.convertProgress.value) }}%</span>
                </div>
                <button
                  class="pt-btn pt-btn-cancel pt-btn-full"
                  @click="pt.cancelConvert()"
                >Cancel</button>
              </div>
              <button
                v-else
                class="pt-btn pt-btn-primary pt-btn-full"
                @click="pt.startConvert()"
                :disabled="!pt.convertUrl.value.trim()"
              >Convert</button>

              <!-- Match results -->
              <div v-if="pt.matchedTracks.value.length" class="pt-results">
                <div class="pt-results-header">
                  <span>{{ matchStats.total }} tracks: {{ matchStats.exact }} exact, {{ matchStats.close }} close{{ matchStats.similar ? `, ${matchStats.similar} similar` : '' }}{{ matchStats.autofill ? `, ${matchStats.autofill} autofilled` : '' }}, {{ matchStats.none }} unmatched</span>
                  <button
                    v-if="matchStats.none > 0"
                    class="pt-autofill-btn"
                    @click="pt.autofillUnmatched()"
                    :disabled="pt.autofillLoading.value"
                  >
                    {{ pt.autofillLoading.value ? `Autofilling ${pt.autofillProgress.value}` : `Autofill ${matchStats.none} unmatched` }}
                  </button>
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

                    <!-- Alternatives dropdown + custom search -->
                    <div class="pt-alt-wrap">
                      <button class="pt-alt-btn" :ref="el => { if (el) swapBtnRefs[i] = el }" @click="toggleAlt(i)">Swap</button>
                    </div>
                  </div>
                </div>

                <!-- Actions — all save/play options for both directions -->
                <div class="pt-actions" v-if="pt.convertDirection.value">
                  <button v-if="pt.convertDirection.value === 'yt-to-spotify'" class="pt-btn pt-btn-play" @click="handlePlayNow" :disabled="!pt.resultTracks.value.length">
                    Play Now
                  </button>
                  <button v-if="pt.convertDirection.value === 'spotify-to-yt'" class="pt-btn pt-btn-play" @click="handlePlayNowYoutube" :disabled="!pt.resultTracks.value.length">
                    Play Now
                  </button>
                  <button v-if="pt.convertDirection.value === 'yt-to-spotify'" class="pt-btn pt-btn-save" @click="showSaveDialog = true" :disabled="!pt.resultTracks.value.length">
                    Save to Spotify
                  </button>
                  <button class="pt-btn pt-btn-yt-save" @click="openYtSaveDialog" :disabled="!pt.resultTracks.value.filter(t => t.videoId).length">
                    Save to YouTube
                  </button>
                  <button v-if="pt.convertDirection.value === 'spotify-to-yt'" class="pt-btn pt-btn-save" @click="showSaveDialog = true" :disabled="!pt.resultTracks.value.filter(t => t.uri).length">
                    Save to Spotify
                  </button>
                  <button class="pt-btn pt-btn-primary" @click="copyYoutubeLinks" :disabled="!pt.resultTracks.value.filter(t => t.videoId || t.url).length">
                    {{ ytCopied ? 'Copied!' : 'Copy All Links' }}
                  </button>
                  <button class="pt-btn" @click="openYoutubePlaylist" :disabled="!pt.resultTracks.value.filter(t => t.videoId).length">
                    Open Playlist
                  </button>
                </div>
              </div>
            </div>

            <!-- ═══════════════════════ RENAME TAB ═══════════════════════ -->
            <div v-if="pt.activeTab.value === 'rename'" class="pt-body">
              <div class="pt-section">
                <label class="pt-label">Select a playlist to auto-rename based on its vibe</label>
              </div>

              <div v-if="pt.playlistsLoading.value" class="pt-hint">Loading playlists...</div>
              <div v-else-if="!pt.userPlaylists.value.length" class="pt-hint">No playlists found.</div>
              <div v-else class="pt-existing-list">
                <div
                  v-for="pl in pt.userPlaylists.value"
                  :key="pl.id"
                  class="pt-existing-item pt-rename-item"
                >
                  <img v-if="pl.image" :src="pl.image" class="pt-existing-art" alt="" />
                  <div class="pt-existing-info">
                    <span class="pt-existing-name">{{ renamingId === pl.id && renameNewName ? renameNewName : pl.name }}</span>
                    <span class="pt-existing-count">{{ pl.tracks }} tracks</span>
                  </div>
                  <div class="pt-rename-actions">
                    <button
                      v-if="renamingId !== pl.id"
                      class="pt-rename-btn"
                      @click.stop="startRename(pl)"
                      :disabled="pt.suggestingName.value"
                    >
                      {{ pt.suggestingName.value ? '...' : 'Rename' }}
                    </button>
                    <template v-else>
                      <input
                        class="pt-input pt-rename-input"
                        v-model="renameNewName"
                        @keydown.enter="confirmRename(pl)"
                        @click.stop
                        placeholder="New name..."
                      />
                      <button class="pt-rename-btn pt-rename-regen" @click.stop="regenerateRename(pl)" :disabled="pt.suggestingName.value" title="Regenerate">
                        {{ pt.suggestingName.value ? '...' : '🔄' }}
                      </button>
                      <button class="pt-rename-btn pt-rename-confirm" @click.stop="confirmRename(pl)" :disabled="pt.renamingPlaylist.value || !renameNewName.trim()">
                        {{ pt.renamingPlaylist.value ? '...' : '✓' }}
                      </button>
                      <button class="pt-rename-btn pt-rename-cancel" @click.stop="renamingId = null; renameNewName = ''">✕</button>
                    </template>
                  </div>
                </div>
              </div>

              <div v-if="renameSuccess" class="pt-success" style="margin-top:10px">
                <span>Renamed to "<strong>{{ renameSuccess }}</strong>"!</span>
                <button class="pt-success-dismiss" @click="renameSuccess = ''">&times;</button>
              </div>
            </div>

            <!-- ═══════════════════════ SAVE DIALOG ═══════════════════════ -->
            <div v-if="showSaveDialog" class="pt-save-overlay" @click.self="showSaveDialog = false">
              <div class="pt-save-dialog">
                <h3>Save to Spotify</h3>

                <!-- Toggle: new vs existing -->
                <div class="pt-save-toggle">
                  <button :class="['pt-save-toggle-btn', { active: saveMode === 'new' }]" @click="saveMode = 'new'">New Playlist</button>
                  <button :class="['pt-save-toggle-btn', { active: saveMode === 'existing' }]" @click="saveMode = 'existing'; loadPlaylists()">Add to Existing</button>
                </div>

                <!-- New playlist -->
                <template v-if="saveMode === 'new'">
                  <div class="pt-name-row">
                    <input
                      class="pt-input pt-name-input"
                      v-model="playlistName"
                      :placeholder="pt.suggestingName.value ? 'Generating name...' : 'Playlist name...'"
                      @keydown.enter="handleSave"
                    />
                    <button class="pt-name-regen" @click="regenerateName" :disabled="pt.suggestingName.value" title="Generate new name">
                      {{ pt.suggestingName.value ? '...' : '🔄' }}
                    </button>
                  </div>
                  <div class="pt-save-actions">
                    <button class="pt-btn pt-btn-save" @click="handleSave" :disabled="pt.saving.value || !playlistName.trim()">
                      {{ pt.saving.value ? 'Saving...' : 'Create & Save' }}
                    </button>
                    <button class="pt-btn" @click="showSaveDialog = false">Cancel</button>
                  </div>
                </template>

                <!-- Existing playlist -->
                <template v-else>
                  <div v-if="pt.playlistsLoading.value" class="pt-hint">Loading playlists...</div>
                  <div v-else-if="!pt.userPlaylists.value.length" class="pt-hint">No playlists found.</div>
                  <div v-else class="pt-existing-list">
                    <div
                      v-for="pl in pt.userPlaylists.value"
                      :key="pl.id"
                      class="pt-existing-item"
                      @click="handleAddToExisting(pl.id)"
                    >
                      <img v-if="pl.image" :src="pl.image" class="pt-existing-art" alt="" />
                      <div class="pt-existing-info">
                        <span class="pt-existing-name">{{ pl.name }}</span>
                        <span class="pt-existing-count">{{ pl.tracks }} tracks</span>
                      </div>
                    </div>
                  </div>
                  <div class="pt-save-actions">
                    <button class="pt-btn" @click="showSaveDialog = false">Cancel</button>
                  </div>
                </template>
              </div>
            </div>

            <!-- ═══════════════════════ YOUTUBE SAVE DIALOG ═══════════════════════ -->
            <div v-if="showYtSaveDialog" class="pt-save-overlay" @click.self="showYtSaveDialog = false">
              <div class="pt-save-dialog">
                <h3>Save to YouTube</h3>

                <!-- Not connected prompt -->
                <div v-if="pt.ytScopeMissing.value" class="pt-quota-warning" style="text-align:center">
                  <p style="margin:0 0 8px">YouTube account not connected.</p>
                  <a :href="youtubeReconnectUrl" class="pt-btn pt-btn-yt-save" style="display:inline-block;text-decoration:none">Connect YouTube</a>
                </div>
                <template v-else>

                <!-- Quota warning -->
                <div class="pt-quota-warning">
                  This will use ~{{ 50 + pt.resultTracks.value.length * 50 }} YouTube API quota units
                  ({{ pt.resultTracks.value.length }} videos)
                </div>

                <!-- Toggle: new vs existing -->
                <div class="pt-save-toggle">
                  <button :class="['pt-save-toggle-btn', { active: ytSaveMode === 'new' }]" @click="ytSaveMode = 'new'">New Playlist</button>
                  <button :class="['pt-save-toggle-btn', { active: ytSaveMode === 'existing' }]" @click="ytSaveMode = 'existing'; loadYtPlaylists()">Add to Existing</button>
                </div>

                <!-- New playlist -->
                <template v-if="ytSaveMode === 'new'">
                  <input
                    class="pt-input"
                    v-model="ytPlaylistName"
                    placeholder="Playlist name..."
                    @keydown.enter="handleYtSave"
                  />
                  <div class="pt-save-actions">
                    <button class="pt-btn pt-btn-yt-save" @click="handleYtSave" :disabled="pt.ytSaving.value || !ytPlaylistName.trim()">
                      {{ pt.ytSaving.value ? 'Saving...' : 'Create & Save' }}
                    </button>
                    <button class="pt-btn" @click="showYtSaveDialog = false">Cancel</button>
                  </div>
                </template>

                <!-- Existing playlist -->
                <template v-else>
                  <div v-if="pt.ytPlaylistsLoading.value" class="pt-hint">Loading playlists...</div>
                  <div v-else-if="!pt.ytUserPlaylists.value.length" class="pt-hint">No playlists found. Connect YouTube first.</div>
                  <div v-else class="pt-existing-list">
                    <div
                      v-for="pl in pt.ytUserPlaylists.value"
                      :key="pl.id"
                      class="pt-existing-item"
                      @click="handleAddToExistingYt(pl.id)"
                    >
                      <img v-if="pl.image" :src="pl.image" class="pt-existing-art" alt="" />
                      <div class="pt-existing-info">
                        <span class="pt-existing-name">{{ pl.name }}</span>
                        <span class="pt-existing-count">{{ pl.tracks }} videos</span>
                      </div>
                    </div>
                  </div>
                  <div class="pt-save-actions">
                    <button class="pt-btn" @click="showYtSaveDialog = false">Cancel</button>
                  </div>
                </template>
                </template><!-- /v-else connected -->
              </div>
            </div>

          </div>
        </Transition>
      </div>
    </Transition>

    <!-- Swap dropdown — teleported outside scroll containers to avoid clipping -->
    <div v-if="altOpen !== null" class="pt-swap-overlay" @click="altOpen = null; swapResults = []; swapQuery = ''">
      <div class="pt-alt-dropdown-fixed" :style="swapDropdownStyle" @click.stop>
        <div class="pt-alt-search">
          <input
            class="pt-input pt-alt-search-input"
            v-model="swapQuery"
            :placeholder="pt.convertDirection.value === 'yt-to-spotify' ? 'Search Spotify...' : 'Search YouTube...'"
            @input="debounceSwapSearch"
            @click.stop
            ref="swapSearchInput"
          />
        </div>
        <div v-if="swapSearchLoading" class="pt-alt-loading">Searching...</div>
        <div v-if="swapSearchError" class="pt-alt-loading" style="color: #f87171; font-size: 11px;">{{ swapSearchError }}</div>
        <template v-if="swapResults.length">
          <div class="pt-alt-divider">Search results</div>
          <div
            v-for="r in swapResults"
            :key="r.id || r.videoId"
            class="pt-dropdown-item"
            @click="pt.swapMatch(altOpen, r); altOpen = null; swapResults = []; swapQuery = ''"
          >
            <img v-if="r.art || r.thumbnail" :src="r.art || r.thumbnail" class="pt-dropdown-art" alt="" />
            <div class="pt-dropdown-info">
              <span class="pt-dropdown-name">{{ r.name || r.title }}</span>
              <span class="pt-dropdown-artist">{{ r.artist || r.channelTitle }}</span>
            </div>
          </div>
        </template>
        <template v-if="altOpen !== null && pt.matchedTracks.value[altOpen]?.alternatives?.length">
          <div class="pt-alt-divider">Suggestions</div>
          <div
            v-for="alt in pt.matchedTracks.value[altOpen].alternatives"
            :key="alt.id || alt.videoId"
            class="pt-dropdown-item"
            @click="pt.swapMatch(altOpen, alt); altOpen = null; swapResults = []; swapQuery = ''"
          >
            <span class="pt-dropdown-name">{{ alt.name || alt.title }}</span>
            <span class="pt-dropdown-artist">{{ alt.artist || alt.channelTitle }}</span>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { usePlaylistTools } from '../composables/usePlaylistTools.js';
import { useSpotifySDK } from '../composables/useSpotifySDK.js';
import { useNowPlaying } from '../composables/useNowPlaying.js';
import { useNotifications } from '../composables/useNotifications.js';

const pt  = usePlaylistTools();
const sdk = useSpotifySDK();
const { popOut: popOutMini } = useNowPlaying();
const { playNotifPing } = useNotifications();

// Restore saved state after Spotify reconnect redirect
onMounted(() => {
  const url = new URL(window.location.href);
  if (url.searchParams.get('spotify') === 'connected') {
    // Invalidate SDK token cache so it uses the new token
    if (window._sp) {
      window._sp.tokenCache = null;
      window._sp.tokenFetchPromise = null;
      window._sp.reconnectAttempted = true;
    }
    localStorage.setItem('sp_oauth_done', '1');
    pt.restoreState();
    // Clean up query params
    url.searchParams.delete('spotify');
    url.searchParams.delete('premium');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }
});

// Play sound when background operation completes
watch(() => pt.bgDone.value, (done) => {
  if (done && pt.isMinimized.value) {
    try { playNotifPing(); } catch { /* silent */ }
  }
});

// Auto-scroll to action buttons when results appear or modal opens with existing results
const actionsBarRef = ref(null);
const scrollToActions = () => {
  nextTick(() => {
    actionsBarRef.value?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  });
};
watch(() => pt.generateSpotifyResults.value.length, (len, oldLen) => {
  if (len > 0 && oldLen === 0) scrollToActions();
});
// Also scroll when modal opens/un-minimizes with existing results
watch([() => pt.isOpen.value, () => pt.isMinimized.value], ([open, mini]) => {
  if (open && !mini && (pt.generateSpotifyResults.value.length || pt.generateYoutubeResults.value.length)) {
    scrollToActions();
  }
});

const API = import.meta.env.VITE_API_URL;
const spotifyReconnectUrl = computed(() => {
  const token = localStorage.getItem('jwtToken') || '';
  // Use clean URL (strip any existing ?spotify= params) so returnTo is correct
  const url = new URL(window.location.href);
  url.searchParams.delete('spotify');
  url.searchParams.delete('premium');
  return `${API}/api/spotify/login?token=${token}&force=1&returnTo=${encodeURIComponent(url.toString())}`;
});

const showSaveDialog   = ref(false);
const playlistName     = ref('');
const saveMode         = ref('new'); // 'new' | 'existing'

// Auto-suggest playlist name when save dialog opens
watch(showSaveDialog, async (open) => {
  if (open && saveMode.value === 'new' && !playlistName.value) {
    const name = await pt.suggestName();
    if (name && !playlistName.value) playlistName.value = name;
  }
});

// YouTube save dialog
const showYtSaveDialog = ref(false);
const ytPlaylistName   = ref('');
const ytSaveMode       = ref('new');

const youtubeReconnectUrl = computed(() => {
  const token = localStorage.getItem('jwtToken') || '';
  const origin = window.location.origin;
  return `${API}/api/youtube/auth?token=${token}&returnTo=${encodeURIComponent(origin + '/profile')}`;
});
const altOpen          = ref(null);
const customGenreInput = ref('');
const refUrlInput      = ref(''); // for adding reference playlist URLs
const refArtistInput   = ref(''); // for adding reference artist URLs
const refAlbumInput    = ref(''); // for adding reference album URLs
const openCats         = ref(new Set(['Popular', 'Moods']));

const addRefUrl = () => {
  const url = refUrlInput.value.trim();
  if (!url) return;
  pt.addSeedPlaylistUrl(url);
  refUrlInput.value = '';
};

const addRefArtist = () => {
  const url = refArtistInput.value.trim();
  if (!url) return;
  pt.addSeedArtistUrl(url);
  refArtistInput.value = '';
};

const addRefAlbum = () => {
  const url = refAlbumInput.value.trim();
  if (!url) return;
  pt.addSeedAlbumUrl(url);
  refAlbumInput.value = '';
};

const toggleCat = (cat) => {
  const s = openCats.value;
  if (s.has(cat)) s.delete(cat); else s.add(cat);
  openCats.value = new Set(s); // trigger reactivity
};

const filteredCategories = computed(() => {
  const filter = pt.genreFilter.value.toLowerCase().trim();
  const result = {};
  for (const [cat, genres] of Object.entries(pt.GENRE_CATEGORIES)) {
    const filtered = filter ? genres.filter(g => g.includes(filter)) : genres;
    if (filtered.length) result[cat] = filtered;
  }
  return result;
});

const addCustom = () => {
  if (customGenreInput.value.trim()) {
    pt.addCustomGenre(customGenreInput.value);
    customGenreInput.value = '';
  }
};

const detectedPlatform = computed(() => {
  const url = pt.convertUrl.value;
  if (/music\.youtube\.com/i.test(url)) return 'youtube-music';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/spotify\.com/i.test(url)) return 'spotify';
  return null;
});

const matchStats = computed(() => {
  const m = pt.matchedTracks.value;
  return {
    total:    m.length,
    exact:    m.filter((x) => x.confidence === 'exact').length,
    close:    m.filter((x) => x.confidence === 'close' || x.confidence === 'manual').length,
    similar:  m.filter((x) => x.confidence === 'similar').length,
    autofill: m.filter((x) => x.confidence === 'autofill').length,
    none:     m.filter((x) => x.confidence === 'none').length,
  };
});

const swapQuery = ref('');
const swapResults = ref([]);
const swapSearchLoading = ref(false);
const swapBtnRefs = ref({});
const swapSearchInput = ref(null);
let _swapDebounce = null;

const swapDropdownStyle = computed(() => {
  const idx = altOpen.value;
  if (idx === null || !swapBtnRefs.value[idx]) return {};
  const btn = swapBtnRefs.value[idx];
  const rect = btn.getBoundingClientRect();
  const maxW = Math.min(320, window.innerWidth - 16);
  // Position below the button, right-aligned
  let left = rect.right - maxW;
  if (left < 8) left = 8;
  let top = rect.bottom + 4;
  // If dropdown would overflow bottom, show above
  if (top + 320 > window.innerHeight) top = Math.max(8, rect.top - 324);
  return { position: 'fixed', top: top + 'px', left: left + 'px', width: maxW + 'px' };
});

const toggleAlt = (i) => {
  altOpen.value = altOpen.value === i ? null : i;
  swapQuery.value = '';
  swapResults.value = [];
  swapSearchError.value = '';
  if (altOpen.value !== null) {
    setTimeout(() => swapSearchInput.value?.focus(), 50);
  }
};

const swapSearchError = ref('');

const debounceSwapSearch = () => {
  clearTimeout(_swapDebounce);
  swapSearchError.value = '';
  const q = swapQuery.value.trim();
  if (!q) { swapResults.value = []; swapSearchLoading.value = false; return; }
  swapSearchLoading.value = true;
  _swapDebounce = setTimeout(async () => {
    try {
      const isYt = pt.convertDirection.value === 'spotify-to-yt';
      const endpoint = isYt
        ? `${API}/api/youtube/search?q=${encodeURIComponent(q)}&limit=10`
        : `${API}/api/spotify/search?q=${encodeURIComponent(q)}&limit=10`;
      const res = await fetch(endpoint, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('jwtToken')}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 429) {
          const secs = errData.retryAfter || parseInt(res.headers.get('retry-after') || '5', 10);
          swapSearchError.value = `Rate limited — wait ${secs}s and try again`;
        } else {
          swapSearchError.value = errData.message || `Search failed (${res.status})`;
        }
        swapResults.value = [];
        swapSearchLoading.value = false;
        return;
      }
      const data = await res.json();
      if (isYt) {
        swapResults.value = (data.items || []).map(t => ({
          ...t,
          url: `https://www.youtube.com/watch?v=${t.videoId}`,
        }));
      } else {
        swapResults.value = data.tracks || [];
      }
      if (!swapResults.value.length) swapSearchError.value = 'No results found';
    } catch (e) {
      swapSearchError.value = 'Search failed — check connection';
      swapResults.value = [];
    }
    swapSearchLoading.value = false;
  }, 350);
};

const handlePlayNow = () => {
  // Always play Spotify results regardless of which view is active
  const tracks = pt.generateSpotifyResults.value.length
    ? pt.generateSpotifyResults.value.filter((t) => t.uri)
    : pt.resultTracks.value.filter((t) => t.uri);
  if (!tracks.length) return;
  sdk.playUris(
    tracks.map((t) => t.uri),
    tracks,
  );
  // Use the currentMediaUrl that playUris just set (synchronously) so
  // SpotifyPlayer's isActive check matches and shows the player UI
  popOutMini({
    url: sdk.currentMediaUrl.value,
    type: 'spotify',
    isPlaylist: tracks.length > 1,
    position: 0,
    playlistIndex: 0,
    resumeOnLoad: true,
    trackUri: tracks[0]?.uri || '',
    // Persist URIs so refresh can resume via playUris
    trackUris: tracks.map(t => t.uri),
    trackMeta: tracks.map(t => ({ name: t.name, uri: t.uri, artist: t.artist, duration: t.duration_ms || t.duration || 0, art: t.art || '' })),
  });
  pt.minimize();
};

const handlePlayNowYoutube = () => {
  const ytTracks = pt.generateYoutubeResults.value.length
    ? pt.generateYoutubeResults.value.filter(t => t.videoId)
    : pt.resultTracks.value.filter(t => t.videoId);
  if (!ytTracks.length) return;
  const ids = ytTracks.map(t => t.videoId);
  // Build URL: first video + remaining as playlist parameter for full queue
  const url = `https://www.youtube.com/watch?v=${ids[0]}${ids.length > 1 ? '&list=' + ids.join(',') : ''}`;
  popOutMini({
    url,
    type: 'youtube',
    isPlaylist: ids.length > 1,
    position: 0,
    playlistIndex: 0,
    resumeOnLoad: true,
    // Store video IDs so MiniPlayer can build the embed with full queue
    videoIds: ids,
  });
  pt.minimize();
};

const handleSave = () => {
  if (!playlistName.value.trim()) return;
  pt.saveToSpotify(playlistName.value.trim());
  showSaveDialog.value = false;
  playlistName.value = '';
};

const regenerateName = async () => {
  const name = await pt.suggestName();
  if (name) playlistName.value = name;
};

const loadPlaylists = () => {
  if (!pt.userPlaylists.value.length) pt.fetchUserPlaylists();
};

// ── Rename tab logic ──────────────────────────────────────────────────────
const renamingId      = ref(null);
const renameNewName   = ref('');
const renameSuccess   = ref('');

const loadRenamePlaylists = () => {
  if (!pt.userPlaylists.value.length) pt.fetchUserPlaylists();
};

const startRename = async (pl) => {
  renamingId.value = pl.id;
  renameNewName.value = '';
  renameSuccess.value = '';
  const name = await pt.suggestNameForPlaylist(pl.id);
  if (name) renameNewName.value = name;
};

const regenerateRename = async (pl) => {
  const name = await pt.suggestNameForPlaylist(pl.id);
  if (name) renameNewName.value = name;
};

const confirmRename = async (pl) => {
  if (!renameNewName.value.trim()) return;
  const ok = await pt.renamePlaylist(pl.id, renameNewName.value.trim());
  if (ok) {
    renameSuccess.value = renameNewName.value.trim();
    // Update the local list
    const idx = pt.userPlaylists.value.findIndex(p => p.id === pl.id);
    if (idx >= 0) pt.userPlaylists.value[idx].name = renameNewName.value.trim();
    renamingId.value = null;
    renameNewName.value = '';
  }
};

const ytCopied = ref(false);

const copyYoutubeLinks = async () => {
  // Use YouTube results directly (not resultTracks which may show Spotify view)
  const ytTracks = pt.generateYoutubeResults.value.length
    ? pt.generateYoutubeResults.value
    : pt.resultTracks.value;
  const urls = ytTracks
    .filter(t => t.videoId || t.url)
    .map(t => t.url || `https://www.youtube.com/watch?v=${t.videoId}`);
  if (!urls.length) {
    pt.error.value = 'No matched tracks with YouTube links to copy';
    return;
  }
  const text = urls.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    ytCopied.value = true;
    setTimeout(() => { ytCopied.value = false; }, 2000);
  } catch {
    // Fallback: create a temporary textarea and exec copy
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    ytCopied.value = true;
    setTimeout(() => { ytCopied.value = false; }, 2000);
  }
};

const openYoutubePlaylist = () => {
  const ytTracks = pt.generateYoutubeResults.value.length
    ? pt.generateYoutubeResults.value
    : pt.resultTracks.value;
  const ids = ytTracks
    .map(t => t.videoId)
    .filter(Boolean);
  if (!ids.length) return;
  // YouTube watch_videos URL plays multiple videos in sequence
  const url = `https://www.youtube.com/watch_videos?video_ids=${ids.join(',')}`;
  window.open(url, '_blank');
};

const handleAddToExisting = (playlistId) => {
  pt.addToExistingPlaylist(playlistId);
  showSaveDialog.value = false;
};

// YouTube save handlers
const openYtSaveDialog = async () => {
  showYtSaveDialog.value = true;
  // Quick connection check
  try {
    const res = await fetch(`${API}/api/youtube/status`, { headers: { Authorization: `Bearer ${localStorage.getItem('jwtToken')}` } });
    if (!res.ok) { pt.ytScopeMissing.value = true; return; }
    const d = await res.json();
    pt.ytScopeMissing.value = !d.connected;
  } catch { pt.ytScopeMissing.value = true; }
};

const handleYtSave = () => {
  if (!ytPlaylistName.value.trim()) return;
  pt.saveToYouTube(ytPlaylistName.value.trim());
  showYtSaveDialog.value = false;
  ytPlaylistName.value = '';
};

const loadYtPlaylists = () => {
  if (!pt.ytUserPlaylists.value.length) pt.fetchUserYouTubePlaylists();
};

const handleAddToExistingYt = (playlistId) => {
  pt.addToExistingYouTubePlaylist(playlistId);
  showYtSaveDialog.value = false;
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
  width: min(520px, 100dvw);
  height: 100dvh;
  background: #0f0f0f;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  overflow-x: hidden;
  position: relative;
  box-sizing: border-box;
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

.pt-minimize {
  background: none;
  border: none;
  color: #888;
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
  padding: 0 6px;
}
.pt-minimize:hover { color: #fff; }

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

/* ─── Minimized floating pill ────────────────────────────────────────────── */
.pt-mini-pill {
  position: fixed;
  bottom: 24px;
  right: 86px; /* next to ChatWidget (54px toggle + 20px right + 12px gap) */
  z-index: 9001;
  background: #181820;
  border: 1px solid #333;
  border-radius: 24px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #fff;
  font-size: 0.85rem;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  transition: transform 0.2s, box-shadow 0.2s;
  user-select: none;
}
.pt-mini-pill:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.5); }
.pt-mini-pill.done { border-color: #22c55e; animation: pt-pulse 1.5s infinite; }
.pt-mini-icon { font-size: 1.1rem; }
.pt-mini-text { white-space: nowrap; }
.pt-mini-close {
  background: none;
  border: none;
  color: #888;
  font-size: 18px;
  cursor: pointer;
  padding: 0 0 0 4px;
  line-height: 1;
}
.pt-mini-close:hover { color: #fff; }
@keyframes pt-pulse {
  0%, 100% { box-shadow: 0 4px 16px rgba(0,0,0,0.4); }
  50% { box-shadow: 0 4px 20px rgba(34,197,94,0.4); }
}

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

.pt-name-row { display: flex; gap: 8px; align-items: center; }
.pt-name-input { flex: 1; }
.pt-name-regen {
  background: #2a2a2a; border: 1px solid #333; border-radius: 8px;
  padding: 8px 12px; cursor: pointer; font-size: 14px; color: #aaa;
  transition: background 0.15s, color 0.15s; flex-shrink: 0;
}
.pt-name-regen:hover { background: #3a3a3a; color: #fff; }
.pt-name-regen:disabled { opacity: 0.4; cursor: default; }

/* ─── Search dropdown ─────────────────────────────────────────────────────── */
.pt-search-wrap { position: relative; }

.pt-search-loading {
  font-size: 12px; color: #888; padding: 6px 2px;
}
.pt-search-error {
  font-size: 12px; color: #f59e0b; padding: 4px 2px;
}

/* Search results in normal flow (not absolute) so scrollable body doesn't clip */
.pt-search-results {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  max-height: 260px;
  overflow-y: auto;
}

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
.pt-chip-x { background: none; border: none; color: #888; font-size: 16px; cursor: pointer; padding: 4px 6px; line-height: 1; }
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

/* ─── Reference URLs ──────────────────────────────────────────────────────── */
.pt-seed-urls-row { display: flex; gap: 8px; margin-bottom: 8px; }
.pt-seed-url-input { flex: 1; }
.pt-seed-urls-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; max-height: 120px; overflow-y: auto; }
.pt-seed-url-chip {
  display: flex; align-items: center; gap: 6px; padding: 6px 10px;
  background: #1a1a1a; border-radius: 6px; border: 1px solid #333;
}
.pt-seed-url-text { font-size: 11px; color: #aaa; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pt-seed-url-x {
  background: none; border: none; color: #888; cursor: pointer; font-size: 14px;
  padding: 0; min-width: auto; transition: color 0.15s;
}
.pt-seed-url-x:hover { color: #f87171; }
.pt-seed-artist-chip { border-color: #6366f1; background: rgba(99, 102, 241, 0.05); }
.pt-seed-album-chip { border-color: #8b5cf6; background: rgba(139, 92, 246, 0.05); }

/* ─── Genre search + categories ──────────────────────────────────────────── */
.pt-genre-search-row { display: flex; gap: 8px; margin-bottom: 8px; }
.pt-genre-search { flex: 1; }
.pt-genre-custom { flex: 1; }

.pt-genre-category { margin-bottom: 4px; }

.pt-genre-cat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 4px;
  font-size: 12px;
  font-weight: 700;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  user-select: none;
}
.pt-genre-cat-header:hover { color: #ccc; }
.pt-genre-cat-arrow { font-size: 11px; }

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

.pt-btn-sm { padding: 6px 12px; font-size: 12px; min-height: auto; white-space: nowrap; }

.pt-btn-full { width: 100%; text-align: center; }

.pt-btn-play { background: #1db954; border-color: #1db954; color: #fff; flex: 1; text-align: center; }
.pt-btn-play:hover:not(:disabled) { background: #1aa34a; }

.pt-btn-save { background: #7c3aed; border-color: #7c3aed; color: #fff; flex: 1; text-align: center; }

.pt-btn-yt-save { background: #c00; border-color: #c00; color: #fff; flex: 1; text-align: center; }
.pt-btn-yt-save:hover:not(:disabled) { background: #a00; }

.pt-quota-warning {
  background: #2a1a00;
  border: 1px solid #78350f;
  color: #fbbf24;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
}

.pt-success-yt { border-color: #c00; background: #1a0505; }
.pt-success-yt a { color: #f87171; }

/* ─── Results ─────────────────────────────────────────────────────────────── */
.pt-results { display: flex; flex-direction: column; gap: 8px; }

.pt-results-header {
  font-size: 13px;
  color: #888;
  padding: 4px 0;
  border-bottom: 1px solid #222;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.pt-autofill-btn {
  background: #1e3a5f;
  border: 1px solid #2563eb;
  border-radius: 16px;
  padding: 4px 14px;
  font-size: 11px;
  font-weight: 700;
  color: #93c5fd;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, transform 0.1s;
}
.pt-autofill-btn:hover:not(:disabled) { background: #1d4ed8; color: #fff; transform: scale(1.03); }
.pt-autofill-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* Target toggle (Spotify / YouTube) */
.pt-target-toggle {
  display: flex;
  gap: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #333;
}
.pt-target-btn {
  flex: 1;
  padding: 8px 12px;
  background: #111;
  color: #888;
  border: none;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.pt-target-btn.active {
  background: #1db954;
  color: #fff;
  font-weight: 600;
}
.pt-target-btn:last-child.active {
  background: #c00;
}
.pt-target-btn:hover:not(.active) { background: #1a1a1a; color: #ccc; }

/* Progress pill */
.pt-progress-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pt-progress-pill {
  position: relative;
  height: 26px;
  background: #1a1a2e;
  border-radius: 13px;
  overflow: hidden;
  border: 1px solid #2a2a4a;
}
.pt-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa);
  border-radius: 13px;
  transition: width 0.15s linear;
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);
}
.pt-progress-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  letter-spacing: 0.5px;
}

/* Cancel button — glowing pulse */
.pt-btn-cancel {
  background: #991b1b;
  color: #fca5a5;
  border: 1px solid #dc2626;
  animation: cancelGlow 1.5s ease-in-out infinite;
}
.pt-btn-cancel:hover {
  background: #dc2626;
  color: #fff;
  animation: none;
  box-shadow: 0 0 14px rgba(239, 68, 68, 0.6);
}
@keyframes cancelGlow {
  0%, 100% { box-shadow: 0 0 6px rgba(239, 68, 68, 0.3); }
  50% { box-shadow: 0 0 16px rgba(239, 68, 68, 0.7), 0 0 30px rgba(239, 68, 68, 0.3); }
}

/* Source badge on search results */
.pt-source-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  flex-shrink: 0;
  letter-spacing: 0.5px;
}
.pt-source-badge.spotify { background: #1db95433; color: #1db954; }
.pt-source-badge.youtube { background: #ff000033; color: #f44; }

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

.pt-like-btn {
  background: none; border: none; color: #555; font-size: 16px; cursor: pointer; padding: 6px 8px; line-height: 1;
  transition: color 0.15s;
}
.pt-like-btn:hover { color: #e74c8b; }
.pt-like-btn.liked { color: #1db954; }

.pt-track-remove {
  background: none; border: none; color: #555; font-size: 18px; cursor: pointer; padding: 6px 8px; line-height: 1;
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
.pt-empty-msg {
  padding: 20px 16px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}
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
.pt-reconnect-link { color: #93c5fd; text-decoration: underline; font-weight: 600; margin-left: 6px; }

.pt-success {
  background: #0b3d1a;
  border: 1px solid #166534;
  color: #86efac;
  padding: 10px 16px;
  font-size: 13px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.pt-success a { color: #4ade80; text-decoration: underline; margin-left: 8px; }
.pt-success-dismiss {
  background: none;
  border: none;
  color: #86efac;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
  opacity: 0.7;
  flex-shrink: 0;
}
.pt-success-dismiss:hover { opacity: 1; }

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
.pt-confidence.similar { background: #4a3728; color: #f5c78e; }
.pt-confidence.autofill { background: #1e3a5f; color: #93c5fd; }
.pt-confidence.none { background: #7f1d1d; color: #fca5a5; }

/* ─── Alternatives ────────────────────────────────────────────────────────── */
.pt-alt-wrap { position: relative; flex-shrink: 0; }
.pt-alt-btn {
  background: none; border: 1px solid #333; border-radius: 6px;
  padding: 6px 12px; font-size: 12px; color: #888; cursor: pointer;
}
.pt-alt-btn:hover { border-color: #555; color: #ccc; }

/* Fixed swap dropdown (teleported outside scroll containers) */
.pt-swap-overlay {
  position: fixed;
  inset: 0;
  z-index: 9500;
  background: rgba(0,0,0,0.3);
}
.pt-alt-dropdown-fixed {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  max-height: 320px;
  overflow-y: auto;
  z-index: 9501;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

.pt-alt-search { padding: 8px; border-bottom: 1px solid #2a2a2a; }
.pt-alt-search-input { font-size: 12px; padding: 7px 10px; }
.pt-alt-loading { padding: 8px 12px; font-size: 11px; color: #666; }
.pt-alt-divider {
  padding: 4px 12px;
  font-size: 10px;
  font-weight: 700;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-top: 1px solid #2a2a2a;
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

.pt-save-toggle { display: flex; gap: 4px; margin-bottom: 4px; }
.pt-save-toggle-btn {
  flex: 1; padding: 7px; border-radius: 6px; border: 1px solid #333;
  background: #1a1a1a; color: #888; font-size: 12px; font-weight: 600; cursor: pointer;
}
.pt-save-toggle-btn.active { background: #7c3aed; border-color: #7c3aed; color: #fff; }

.pt-existing-list { max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.pt-existing-item {
  display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 6px;
  cursor: pointer; transition: background 0.1s;
}
.pt-existing-item:hover { background: #252525; }
.pt-existing-art { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
.pt-existing-info { display: flex; flex-direction: column; overflow: hidden; }
.pt-existing-name { font-size: 13px; color: #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pt-existing-count { font-size: 11px; color: #666; }

/* ─── Rename tab ──────────────────────────────────────────────────────────── */
.pt-rename-item { cursor: default; }
.pt-rename-item .pt-existing-info { flex: 1; min-width: 0; }
.pt-rename-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; margin-left: auto; }
.pt-rename-btn {
  background: #2a2a2a; border: 1px solid #333; color: #ccc; border-radius: 6px;
  padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer;
  transition: background 0.15s, color 0.15s; white-space: nowrap;
}
.pt-rename-btn:hover { background: #3a3a3a; color: #fff; }
.pt-rename-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pt-rename-confirm { background: #1db954; color: #000; border-color: #1db954; }
.pt-rename-confirm:hover { background: #1ed760; }
.pt-rename-cancel { background: #e11d48; color: #fff; border-color: #e11d48; }
.pt-rename-cancel:hover { background: #f43f5e; }
.pt-rename-regen { font-size: 13px; padding: 3px 6px; }
.pt-rename-input {
  width: 120px; min-width: 80px; padding: 4px 8px; font-size: 12px;
  background: #1a1a1a; border: 1px solid #444; border-radius: 6px; color: #eee;
}

/* ─── Mobile ──────────────────────────────────────────────────────────────── */
@media (max-width: 600px) {
  .pt-panel { width: 100%; max-width: 100dvw; }
  .pt-overlay { justify-content: stretch; }
  .pt-header { padding: 12px 14px; }
  .pt-tab { padding: 6px 12px; font-size: 13px; }
  .pt-body { padding: 14px; gap: 12px; }
  .pt-input { font-size: 16px; padding: 9px 12px; } /* 16px prevents iOS zoom */
  .pt-label { font-size: 11px; }
  .pt-btn { padding: 10px 14px; font-size: 13px; }
  .pt-track { gap: 8px; padding: 6px 2px; }
  .pt-track-art { width: 34px; height: 34px; }
  .pt-track-name { font-size: 12px; }
  .pt-track-artist { font-size: 10px; }
  .pt-track-list { max-height: 260px; }
  /* Stack match rows vertically on mobile */
  .pt-match-row { flex-direction: column; align-items: flex-start; gap: 4px; padding: 8px 4px; }
  .pt-match-source { width: 100%; }
  .pt-match-arrow { display: none; }
  .pt-match-target { width: 100%; padding-left: 12px; }
  .pt-match-title { font-size: 11px; white-space: normal; }
  .pt-match-sub { font-size: 9px; }
  .pt-confidence { align-self: flex-start; margin-left: 12px; }
  .pt-alt-wrap { align-self: flex-end; margin-top: -24px; }
  .pt-chip { padding: 3px 8px 3px 3px; }
  .pt-chip-art { width: 20px; height: 20px; }
  .pt-chip-text { font-size: 11px; max-width: 120px; }
  .pt-tag { padding: 4px 10px; font-size: 11px; }
  .pt-actions { flex-direction: column; gap: 8px; }
  .pt-actions .pt-btn { width: 100%; text-align: center; padding: 12px 14px; font-size: 14px; }
  .pt-genre-search-row { flex-direction: column; gap: 6px; }
  .pt-url-row { flex-direction: column; gap: 6px; }
  .pt-url-input { width: 100%; }
  .pt-save-dialog { padding: 16px; width: min(320px, 92%); }
  .pt-existing-list { max-height: 180px; }
  .pt-dropdown-art { width: 30px; height: 30px; }
  .pt-dropdown-item { padding: 8px 10px; gap: 8px; }
  .pt-search-results { max-height: 200px; }
  .pt-btn-full { padding: 12px; font-size: 14px; }
  .pt-results-header { font-size: 12px; flex-direction: column; align-items: flex-start; gap: 6px; }
  .pt-autofill-btn { align-self: flex-start; }
  .pt-error { flex-wrap: wrap; font-size: 12px; padding: 8px 12px; }
  .pt-success { flex-wrap: wrap; font-size: 12px; padding: 8px 12px; }
  .pt-success a { margin-left: 0; }
}

@media (max-width: 480px) {
  .pt-header { padding: 10px 12px; }
  .pt-tab { padding: 6px 10px; font-size: 12px; }
  .pt-body { padding: 10px; gap: 10px; }
  .pt-track-list { max-height: 220px; }
  .pt-save-dialog { width: min(280px, 94%); padding: 14px; }
  .pt-existing-list { max-height: 150px; }
  .pt-success a { display: block; margin-top: 4px; }
  .pt-chip-text { max-width: 100px; }
  .pt-match-target { padding-left: 8px; }
  .pt-confidence { margin-left: 8px; }
  .pt-target-btn { padding: 8px 8px; font-size: 12px; }
}

@media (max-width: 380px) {
  .pt-body { padding: 8px; gap: 8px; }
  .pt-header { padding: 8px 10px; }
  .pt-tab { padding: 5px 8px; font-size: 11px; }
  .pt-track-art { width: 28px; height: 28px; }
  .pt-chip-text { max-width: 70px; }
  .pt-btn-full { padding: 11px; font-size: 13px; }
  .pt-search-results { max-height: 160px; }
  .pt-save-dialog { width: calc(100% - 16px); padding: 12px; }
  .pt-dropdown-item { padding: 6px 8px; gap: 6px; }
  .pt-alt-wrap { margin-top: -20px; }
  .pt-alt-btn { padding: 4px 8px; font-size: 11px; }
  .pt-existing-art { width: 32px; height: 32px; }
  .pt-existing-name { font-size: 12px; }
}
</style>
