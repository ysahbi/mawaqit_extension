function getTodayLocalIsoDate() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function row(label, value) {
  return `<div class="row"><div class="label">${label}</div><div>${value || '-'}</div></div>`;
}

function renderTimes(container, times) {
  const order = ["Fajr","Dhuhr","Asr","Maghrib","Isha"];
  container.innerHTML = order.map(p => row(p, times?.[p] || '-')).join('');
}

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['settings'], (res) => resolve(res.settings));
  });
}

async function getCachedTimes(dateIso) {
  return new Promise((resolve) => {
    chrome.storage.local.get([`times:${dateIso}`], (res) => resolve(res[`times:${dateIso}`]));
  });
}

async function requestRefresh() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'popupRefreshTimes' }, (resp) => resolve(resp));
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const content = document.getElementById('content');
  const error = document.getElementById('error');
  const source = document.getElementById('source');
  const dateIso = getTodayLocalIsoDate();

  try {
    // Always try to refresh first to avoid stale partial cache
    let times;
    const resp = await requestRefresh();
    if (resp && resp.ok && resp.times) {
      times = resp.times;
    } else {
      // Fallback to cached if refresh failed
      times = await getCachedTimes(dateIso);
    }
    if (!times) throw new Error('No times available');
    renderTimes(content, times);

    const settings = await getSettings();
    if (settings?.mosqueUrl) {
      source.innerHTML = `Source: <a href="${settings.mosqueUrl}" target="_blank">Mawaqit</a>`;
    }
  } catch (e) {
    error.textContent = `Failed to load times: ${e.message}`;
  }
});


