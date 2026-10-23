// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const KEYBOARD_SCRIPT = String.raw`
function createKeyboard({ closeModal, copyItemMagnet, getMagnetEndpoint, modalIntegration, modalShortcuts, modalTrackers, openModal, queryInput, showToast, state, viewDetails }) {
  function highlightResult(index) {
    const cards = document.querySelectorAll('.torrent-card');
    if (cards.length === 0) {
      state.activeResultIndex = -1;
      return;
    }

    if (index < 0) {
      if (state.activeResultIndex >= 0 && cards[state.activeResultIndex]) {
        cards[state.activeResultIndex].classList.remove('active-card');
      }
      state.activeResultIndex = -1;
      queryInput.focus();
      return;
    }

    if (index >= cards.length) {
      index = cards.length - 1;
    }

    cards.forEach((card, cardIndex) => {
      if (cardIndex === index) {
        card.classList.add('active-card');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        card.classList.remove('active-card');
      }
    });

    state.activeResultIndex = index;
  }

  document.addEventListener('keydown', function(e) {
    if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;

    const activeElement = document.activeElement;
    const isInteractive = activeElement && (activeElement.isContentEditable || activeElement.closest(
      'input, textarea, select, button, a[href], [role="textbox"], [contenteditable]:not([contenteditable="false"])'
    ));
    const isAnyModalOpen = Boolean(document.querySelector('.modal-overlay.open'));

    // Escape key handling
    if (e.key === 'Escape') {
      if (isAnyModalOpen) {
        document.querySelectorAll('.modal-overlay.open').forEach(closeModal);
        return;
      }
      if (document.activeElement === queryInput) {
        if (queryInput.value) {
          queryInput.value = '';
        } else {
          queryInput.blur();
        }
        return;
      }
      if (state.activeResultIndex >= 0) {
        highlightResult(-1);
        return;
      }
      return;
    }

    if (isInteractive || isAnyModalOpen) {
      return;
    }

    // Show shortcuts modal with '?'
    if (e.key === '?') {
      e.preventDefault();
      openModal(modalShortcuts);
      return;
    }

    // Focus search with '/'
    if (e.key === '/') {
      e.preventDefault();
      queryInput.focus();
      queryInput.select();
      return;
    }

    // Open Trackers with 't'
    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      openModal(modalTrackers);
      return;
    }

    // Open Integration with 'i' or 'c'
    if (e.key === 'i' || e.key === 'I' || e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      openModal(modalIntegration);
      return;
    }

    // Results navigation and actions
    if (state.currentResults.length > 0) {
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        highlightResult(state.activeResultIndex + 1);
        return;
      }

      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        highlightResult(state.activeResultIndex - 1);
        return;
      }

      if (state.activeResultIndex >= 0 && state.activeResultIndex < state.currentResults.length) {
        const item = state.currentResults[state.activeResultIndex];

        if (e.key === 'Enter') {
          e.preventDefault();
          viewDetails(state.activeResultIndex);
          return;
        }

        if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          if (item.MagnetUri || getMagnetEndpoint(item)) {
            copyItemMagnet(item);
          } else {
            showToast('No magnet link available for this release');
          }
          return;
        }

        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          if (item.Link) {
            const a = document.createElement('a');
            a.href = item.Link;
            a.download = '';
            document.body.appendChild(a);
            a.click();
            a.remove();
            showToast('Downloading .torrent file...');
          } else {
            showToast('No download link available for this release');
          }
        }
      }
    }
  });

  return { highlightResult };
}
`;
