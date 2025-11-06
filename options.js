document.getElementById('save').addEventListener('click', () => {
  const city = document.getElementById('city').value;
  const country = document.getElementById('country').value;

  const calculationMethod = document.getElementById('calculation-method').value;

  chrome.storage.sync.set({ city, country, calculationMethod }, () => {
    console.log('City and country saved.');
  });
});

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['city', 'country', 'calculationMethod'], (result) => {
    if (result.city) {
      document.getElementById('city').value = result.city;
    }
    if (result.country) {
      document.getElementById('country').value = result.country;
    }
    if (result.calculationMethod) {
      document.getElementById('calculation-method').value = result.calculationMethod;
    }
  });
});