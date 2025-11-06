chrome.runtime.onInstalled.addListener(() => {
  console.log("Mawaqit extension installed.");
  scheduleNotifications();
});

function scheduleNotifications() {
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
          const notificationPrayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']; // Prayers to schedule notifications for

          notificationPrayers.forEach((prayerName) => {
            let prayerTimeIndex;
            if (prayerName === 'fajr') prayerTimeIndex = 0;
            else if (prayerName === 'dhuhr') prayerTimeIndex = 2;
            else if (prayerName === 'asr') prayerTimeIndex = 3;
            else if (prayerName === 'maghrib') prayerTimeIndex = 4;
            else if (prayerName === 'isha') prayerTimeIndex = 5;

            const prayerTime = dayData[prayerTimeIndex];
            const [hours, minutes] = prayerTime.split(':');
            const alarmTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

            if (alarmTime > now) {
              chrome.alarms.create(prayerName, { when: alarmTime.getTime() });
            }
          });
        }
      }
    });
}

chrome.alarms.onAlarm.addListener(alarm => {
  const prayerTranslations = {
    fajr: 'الفجر',
    dhuhr: 'الظهر',
    asr: 'العصر',
    maghrib: 'المغرب',
    isha: 'العشاء'
  };

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.svg',
    title: 'وقت الصلاة',
    message: `حان الآن وقت صلاة ${prayerTranslations[alarm.name]}.`,
    priority: 2
  });

  const audio = new Audio('sounds/adhan.mp3');
  audio.play();
});
