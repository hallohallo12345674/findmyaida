// Weckt den Service Worker, sobald aida.de geöffnet wird, damit er sich sofort mit FindMyAIDA verbindet.
chrome.runtime.sendMessage({ type: 'wake' }).catch(() => {});
