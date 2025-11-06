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

  function getNextPrayer(dayData) {
    const now = new Date();
    for (let i = 0; i < dayData.length; i++) {
      const prayerTime = dayData[i];
      const [hours, minutes] = prayerTime.split(':');
      const prayerDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
      if (prayerDate > now) {
        const prayerNames = ['fajr', 'shuruaq', 'dhuhr', 'asr', 'maghrib', 'isha'];
        return { name: prayerNames[i], time: prayerDate };
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


  fetch('months_salat_time.json')
    .then(response => response.json())
    .then(data => {
      const now = new Date();
      const currentMonthIndex = now.getMonth(); // 0 for January, 1 for February, etc.
      const day = now.getDate().toString(); // Convert to string to match JSON keys

      // Assuming the JSON array is ordered by month (index 0 for January, etc.)
      const monthData = data[currentMonthIndex];

      if (monthData) {
        const dayData = monthData[day]; // Access day data directly using the day as key
        if (dayData) {
          const displayPrayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']; // Prayers to display

          displayPrayers.forEach((prayerName) => {
            // Adjust index for displayPrayers to match the full prayers array
            let prayerTimeIndex;
            if (prayerName === 'fajr') prayerTimeIndex = 0;
            else if (prayerName === 'dhuhr') prayerTimeIndex = 2;
            else if (prayerName === 'asr') prayerTimeIndex = 3;
            else if (prayerName === 'maghrib') prayerTimeIndex = 4;
            else if (prayerName === 'isha') prayerTimeIndex = 5;

            const prayerTime = dayData[prayerTimeIndex];

            const prayerNameDiv = document.createElement('div');
            prayerNameDiv.classList.add('prayer-name');
            prayerNameDiv.textContent = prayerTranslations[prayerName];

            const prayerTimeDiv = document.createElement('div');
            prayerTimeDiv.classList.add('prayer-time');
            prayerTimeDiv.textContent = prayerTime;

            prayerTimesDiv.appendChild(prayerNameDiv);
            prayerTimesDiv.appendChild(prayerTimeDiv);
          });

          const nextPrayer = getNextPrayer(dayData);
          updateCountdown(nextPrayer);
          setInterval(() => updateCountdown(nextPrayer), 1000);

        } else {
          prayerTimesDiv.textContent = 'لم يتم العثور على أوقات الصلاة لهذا اليوم.';
        }
      } else {
        prayerTimesDiv.textContent = 'لم يتم العثور على أوقات الصلاة لهذا الشهر.';
      }
    })
    .catch(error => {
      console.error('Error fetching prayer times:', error);
      prayerTimesDiv.textContent = 'خطأ في تحميل أوقات الصلاة.';
    });
});