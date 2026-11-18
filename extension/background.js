// FindMyAIDA Bridge – Service Worker
// Verbindet sich mit der lokalen Terminal-App FindMyAIDA (ws://127.0.0.1:47831) und führt deren Anfragen
// in einem normalen aida.de-Tab aus, genau so, wie es das AIDA-Buchungs-SPA selbst tut.
// Es werden ausschließlich die unten erlaubten, lesenden Endpunkte abgefragt.

const PORT = 47831;
const ORIGIN = 'https://aida.de';
const ALLOWLIST = [
  { method: 'GET', pattern: /^\/content\/aida-search-and-booking\/requests\/search\.filter\.json$/ },
  { method: 'GET', pattern: /^\/content\/aida-search-and-booking\/requests\/search\.cruise\.json\/[^?#]*\.json$/ },
  { method: 'GET', pattern: /^\/content\/aida-search-and-booking\/requests\/detail\.cruise\.json\/[^?#]*\.json$/ },
  { method: 'POST', pattern: /^\/content\/aida-search-and-booking\/requests\/player\.proxy\.json\?[A-Za-z0-9=,_-]*$/ },
];
const MAX_BODY = 20_000;

let ws = null;
let backoff = 1000;
let reconnectTimer = null;

function isAllowed(method, path) {
  return ALLOWLIST.some((a) => a.method === method && a.pattern.test(path));
}

function setBadge(connected) {
  chrome.action.setBadgeText({ text: connected ? 'ON' : '' }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: '#1a7f37' }).catch(() => {});
}

let probing = false;

async function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
  if (probing) return;
  clearTimeout(reconnectTimer);
  // Erst leise prüfen, ob FindMyAIDA läuft. Ein fehlgeschlagener WebSocket-Aufbau würde sonst bei
  // jedem Versuch einen Fehler in chrome://extensions protokollieren.
  probing = true;
  try {
    await fetch(`http://127.0.0.1:${PORT}/`, { mode: 'no-cors', cache: 'no-store' });
  } catch {
    probing = false;
    scheduleReconnect();
    return;
  } finally {
    probing = false;
  }
  let socket;
  try {
    socket = new WebSocket(`ws://127.0.0.1:${PORT}`);
  } catch {
    scheduleReconnect();
    return;
  }
  ws = socket;
  socket.onopen = () => {
    backoff = 1000;
    setBadge(true);
    send({ type: 'hello', version: chrome.runtime.getManifest().version });
  };
  socket.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === 'ping') send({ type: 'pong' });
    else if (msg.type === 'request') handleRequest(msg);
  };
  socket.onclose = () => {
    if (ws === socket) ws = null;
    setBadge(false);
    scheduleReconnect();
  };
  socket.onerror = () => {};
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, backoff);
  backoff = Math.min(backoff * 2, 30_000);
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

let preferredTabId = null;

function waitForLoad(tabId, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') done();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Einen vorhandenen aida.de-Tab sofort nutzen (auch wenn er noch Bilder o. Ä. nachlädt).
// Nur wenn keiner existiert, wird ein Tab geöffnet und einmalig auf das Laden gewartet.
async function findOrOpenAidaTab() {
  if (preferredTabId !== null) {
    try {
      const t = await chrome.tabs.get(preferredTabId);
      if (t && !t.discarded && t.url && t.url.startsWith(ORIGIN)) return t.id;
    } catch {
      /* Tab wurde geschlossen */
    }
    preferredTabId = null;
  }
  const tabs = await chrome.tabs.query({ url: `${ORIGIN}/*` });
  const live = tabs.filter((t) => !t.discarded);
  const best = live.find((t) => t.status === 'complete') || live[0];
  if (best) return (preferredTabId = best.id);
  let tab = tabs[0];
  if (tab) await chrome.tabs.reload(tab.id);
  else tab = await chrome.tabs.create({ url: `${ORIGIN}/finden`, active: false, pinned: true });
  await waitForLoad(tab.id, 15_000);
  return (preferredTabId = tab.id);
}

// Läuft im aida.de-Tab (Same-Origin wie das AIDA-SPA, credentials: 'omit' wie dort).
async function pageFetch(path, method, body) {
  const res = await fetch(path, {
    method,
    headers: method === 'POST' ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
    body: method === 'POST' ? body : undefined,
    credentials: 'omit',
  });
  return { status: res.status, text: await res.text() };
}

async function handleRequest(msg) {
  const { id, method, path, body } = msg;
  try {
    if (!isAllowed(method, path)) throw new Error(`Pfad nicht erlaubt: ${path}`);
    if (body && body.length > MAX_BODY) throw new Error('Anfrage zu groß');
    const tabId = await findOrOpenAidaTab();
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      injectImmediately: true,
      func: pageFetch,
      args: [path, method, body ?? null],
    });
    if (!result || !result.result) throw new Error('Keine Antwort aus dem aida.de-Tab');
    send({ type: 'response', id, status: result.result.status, text: result.result.text });
  } catch (e) {
    send({ type: 'error', id, message: String(e && e.message ? e.message : e) });
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'wake') connect();
});
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
chrome.alarms.create('findmyaida-reconnect', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'findmyaida-reconnect') connect();
});
connect();
