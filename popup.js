document.addEventListener('DOMContentLoaded', () => {
  const prayerTimesDiv = document.getElementById('prayer-times');
  const nextPrayerCountdownDiv = document.getElementById('next-prayer-countdown');

  const prayerTranslations = {
    fajr: 'الفجر',
    dhuhr: 'الظهر',
    asr: 'العصر',
    maghrib: 'المغرب',
    isha: 'العشاء'
  };

  function getNextPrayer(prayerTimings) {
    const now = new Date();
    const prayerNames = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    for (let i = 0; i < prayerNames.length; i++) {
      const prayerName = prayerNames[i];
      const prayerTime = prayerTimings[prayerName].split(' ')[0];
      const [hours, minutes] = prayerTime.split(':');
      const prayerDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
      if (prayerDate > now) {
        return { name: prayerName.toLowerCase(), time: prayerDate };
      }
    }
    return null; // No more prayers for today
  }

  function updateCountdown(nextPrayer) {
    if (!nextPrayer) {
      nextPrayerCountdownDiv.textContent = 'انتهت صلوات اليوم';
      return;
    }

    const now = new Date();
    const timeDiff = nextPrayer.time - now;

    if (timeDiff <= 0) {
      nextPrayerCountdownDiv.textContent = 'حان الآن وقت صلاة ' + prayerTranslations[nextPrayer.name];
      return;
    }

    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

    nextPrayerCountdownDiv.textContent = `الوقت المتبقي لصلاة ${prayerTranslations[nextPrayer.name]}: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }


  chrome.storage.sync.get(['city', 'country', 'calculationMethod'], (result) => {
    const city = result.city || 'Paris';
    const country = result.country || 'France';
    const calculationMethod = result.calculationMethod || '2'; // Default to ISNA
    const now = new Date();
    fetch('http://api.aladhan.com/v1/calendarByCity?city=' + city + '&country=' + country + '&method=' + calculationMethod + '&month=' + (now.getMonth() + 1) + '&year=' + now.getFullYear())
    .then(response => response.json())
    .then(data => {
      const dayData = data.data[now.getDate() - 1];

      if (dayData) {
        const prayerTimings = dayData.timings;
        const displayPrayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']; // Prayers to display

        displayPrayers.forEach((prayerName) => {
          const capitalizedPrayerName = prayerName.charAt(0).toUpperCase() + prayerName.slice(1);
          const prayerTime = prayerTimings[capitalizedPrayerName].split(' ')[0];

          const prayerNameDiv = document.createElement('div');
          prayerNameDiv.classList.add('prayer-name');
          prayerNameDiv.textContent = prayerTranslations[prayerName.toLowerCase()];

          const prayerTimeDiv = document.createElement('div');
          prayerTimeDiv.classList.add('prayer-time');
          prayerTimeDiv.textContent = prayerTime;

          prayerTimesDiv.appendChild(prayerNameDiv);
          prayerTimesDiv.appendChild(prayerTimeDiv);
        });

        const nextPrayer = getNextPrayer(prayerTimings);
        updateCountdown(nextPrayer);
        setInterval(() => {
          const nextPrayer = getNextPrayer(prayerTimings);
          updateCountdown(nextPrayer);
        }, 1000);

      } else {
        prayerTimesDiv.textContent = 'لم يتم العثور على أوقات الصلاة لهذا اليوم.';
      }
    })
    .catch(error => {
      console.error('Error fetching prayer times:', error);
      prayerTimesDiv.textContent = 'خطأ في تحميل أوقات الصلاة.';
    });
});