// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const UI_SCRIPT = String.raw`
function createUi({ escapeHtml }) {
  function openModal(modal) {
    document.querySelectorAll('.modal-overlay.foreground').forEach(overlay => overlay.classList.remove('foreground'));
    modal.classList.add('open', 'foreground');
  }

  function closeModal(modal) {
    modal.classList.remove('open', 'foreground');
    const remaining = document.querySelectorAll('.modal-overlay.open');
    if (remaining.length) remaining[remaining.length - 1].classList.add('foreground');
  }

  function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>' + escapeHtml(message) + '</span>';
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('closing');
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  window.copyFromInput = function(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    navigator.clipboard.writeText(input.value).then(() => {
      showToast('Copied to clipboard!');
    });
  };

  return { closeModal, openModal, showToast };
}
`;
