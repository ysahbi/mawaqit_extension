chrome.runtime.onInstalled.addListener(() => {
  console.log("Mawaqit extension installed.");
  scheduleNotifications();
});

function scheduleNotifications() {
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
        const notificationPrayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']; // Prayers to schedule notifications for

        notificationPrayers.forEach((prayerName) => {
          const prayerTime = prayerTimings[prayerName].split(' ')[0];
          const [hours, minutes] = prayerTime.split(':');
          const alarmTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

          if (alarmTime > now) {
            chrome.alarms.create(prayerName.toLowerCase(), { when: alarmTime.getTime() });
          }
        });
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
