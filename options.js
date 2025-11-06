document.getElementById('save').addEventListener('click', () => {
  const city = document.getElementById('city').value;
  const country = document.getElementById('country').value;

  const calculationMethod = document.getElementById('calculation-method').value;

  chrome.storage.sync.set({ city, country, adhanSound, calculationMethod }, () => {
    console.log('City and country saved.');
  });
});

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['city', 'country', 'adhanSound', 'calculationMethod'], (result) => {
    if (result.city) {
      document.getElementById('city').value = result.city;
    }
    if (result.country) {
      document.getElementById('country').value = result.country;
    }
    if (result.adhanSound) {
      document.getElementById('adhan-sound').value = result.adhanSound;
    }
    if (result.calculationMethod) {
      document.getElementById('calculation-method').value = result.calculationMethod;
    }
  });
});