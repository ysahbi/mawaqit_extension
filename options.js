document.getElementById('save').addEventListener('click', () => {
  const city = document.getElementById('city').value;
  const country = document.getElementById('country').value;

  chrome.storage.sync.set({ city, country }, () => {
    console.log('City and country saved.');
  });
});

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['city', 'country'], (result) => {
    if (result.city) {
      document.getElementById('city').value = result.city;
    }
    if (result.country) {
      document.getElementById('country').value = result.country;
    }
  });
});