// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const INSTALL_SCRIPT = String.raw`
function initializeInstall({ showToast }) {
  // Service Worker & PWA Install
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  let deferredInstallPrompt = null;
  const installButton = document.getElementById('btn-install-app');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installButton) {
      installButton.classList.remove('is-hidden');
    }
  });

  const isIosDevice = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
  const isStandaloneApp =
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean(window.navigator.standalone);

  if (isIosDevice && !isStandaloneApp && installButton) {
    installButton.classList.remove('is-hidden');
  }

  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          installButton.classList.add('is-hidden');
          showToast('TorrGate installed successfully!');
        }
        deferredInstallPrompt = null;
      } else if (isIosDevice) {
        showToast('To install: tap Share in Safari, then "Add to Home Screen"');
      }
    });
  }

  window.addEventListener('appinstalled', () => {
    if (installButton) {
      installButton.classList.add('is-hidden');
    }
    showToast('TorrGate installed as an application!');
  });
}
`;
