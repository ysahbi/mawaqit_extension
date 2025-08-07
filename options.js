const DEFAULTS = {
  latitude: 48.5734,
  longitude: 7.7521,
  calcMethod: 'auto',
  notifyFor: { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true },
  minutesBefore: 0,
  refreshHourLocal: 3
};

function getEl(id) { return document.getElementById(id); }

function load() {
  chrome.storage.local.get({ settings: DEFAULTS }, (res) => {
    const s = res.settings || DEFAULTS;
    if (getEl('latitude')) getEl('latitude').value = String(s.latitude ?? DEFAULTS.latitude);
    if (getEl('longitude')) getEl('longitude').value = String(s.longitude ?? DEFAULTS.longitude);
    if (getEl('calcMethod')) getEl('calcMethod').value = String(s.calcMethod ?? 'auto');
    for (const p of ["Fajr","Dhuhr","Asr","Maghrib","Isha"]) {
      getEl(p).checked = !!(s.notifyFor && s.notifyFor[p]);
    }
    getEl('minutesBefore').value = String(s.minutesBefore ?? 0);
    getEl('refreshHourLocal').value = String(s.refreshHourLocal ?? 3);
  });
}

function save() {
  const settings = {
    latitude: parseFloat(getEl('latitude').value || DEFAULTS.latitude),
    longitude: parseFloat(getEl('longitude').value || DEFAULTS.longitude),
    calcMethod: getEl('calcMethod').value || 'auto',
    notifyFor: {
      Fajr: getEl('Fajr').checked,
      Dhuhr: getEl('Dhuhr').checked,
      Asr: getEl('Asr').checked,
      Maghrib: getEl('Maghrib').checked,
      Isha: getEl('Isha').checked,
    },
    minutesBefore: Math.max(0, parseInt(getEl('minutesBefore').value || '0', 10)),
    refreshHourLocal: Math.min(23, Math.max(0, parseInt(getEl('refreshHourLocal').value || '3', 10)))
  };

  chrome.storage.local.set({ settings }, () => {
    getEl('status').textContent = 'Saved';
    setTimeout(() => getEl('status').textContent = '', 1200);
    chrome.runtime.sendMessage({ type: 'settingsUpdated' });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  getEl('saveBtn').addEventListener('click', save);
});


