// Глобальные переменные
let mediaRecorder; // Этот объект больше не используется напрямую на странице, но оставлен для совместимости
let recordedChunks = []; // Эти данные больше не собираются на странице
let recordingStartTime;
let timerInterval;
let isRecording = false; // Отслеживает статус записи, инициированной через расширение
let isPaused = false; // Отслеживает статус паузы, инициированной через расширение

let selectedRegion = null; // Для выбора области (пока не реализовано через расширение)
let selectionStart = null; // Для выбора области (пока не реализовано через расширение)

let currentStream; // Этот объект больше не используется напрямую на странице

// Элементы DOM
const videoSourceSelect = document.getElementById('videoSource');
const resolutionSelect = document.getElementById('resolution');
const fpsSelect = document.getElementById('fps');
const audioSourceSelect = document.getElementById('audioSource');
const volumeSlider = document.getElementById('volume'); // Громкость будет обрабатываться отдельно или через библиотеки
const timerDisplay = document.getElementById('timer');
const statusDisplay = document.getElementById('status');
const previewVideo = document.getElementById('preview');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnSettings = document.getElementById('btnSettings');
const btnHelp = document.getElementById('btnHelp');
const regionOverlay = document.getElementById('regionSelectionOverlay'); // Для выбора области
const selectionRectangle = document.getElementById('selectionRectangle'); // Для выбора области

// Слушатели событий
btnStart.addEventListener('click', toggleRecording);
btnStop.addEventListener('click', stopRecording);
btnSettings.addEventListener('click', showSettings); // Заглушка для настроек
btnHelp.addEventListener('click', showHelp); // Заглушка для справки
document.addEventListener('keydown', handleHotkeys); // Обработка горячих клавиш

// Инициализация
updateUI();

// --- Взаимодействие с расширением браузера ---

// Слушатель сообщений от расширения
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        console.log("Сообщение получено на странице:", request);

        if (request.action === "recordingStarted") {
            // Расширение сообщило об успешном начале записи
            console.log("Запись успешно начата через расширение.");
            isRecording = true;
            isPaused = false; // Считаем, что запись началась без паузы
            recordingStartTime = Date.now();
            timerInterval = setInterval(updateTimer, 1000);
            updateTimer(); // Обновить таймер сразу
            updateUI();
            statusDisplay.textContent = 'Идет запись... (через расширение)';
            statusDisplay.className = 'status recording';

        } else if (request.action === "recordingStopped") {
            // Расширение сообщило об остановке записи
            console.log("Запись остановлена расширением. URL для скачивания:", request.downloadUrl);

            // Обработка файла для скачивания на стороне страницы
            const url = request.downloadUrl;
            if (url) {
                 previewVideo.src = url;
                 previewVideo.style.display = 'block'; // Показать предпросмотр

                 // Создать ссылку для скачивания и кликнуть по ней
                 const a = document.createElement('a');
                 a.style.display = 'none';
                 a.href = url;
                 a.download = `screen_record_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`; // Имя файла
                 document.body.appendChild(a);
                 a.click();

                 // Очистка после скачивания
                 setTimeout(() => {
                     document.body.removeChild(a);
                     window.URL.revokeObjectURL(url);
                 }, 100);
            }

            // Обновить UI страницы после остановки записи
            isRecording = false;
            isPaused = false;
            clearInterval(timerInterval);
            timerDisplay.textContent = '00:00:00';
            updateUI(); // Убедитесь, что updateUI правильно сбрасывает состояние
            statusDisplay.textContent = 'Запись завершена';
            statusDisplay.className = 'status ready'; // Или другой класс для завершения записи

        } else if (request.action === "recordingPaused") {
            // Расширение сообщило о паузе записи
            console.log("Запись приостановлена расширением.");
            isPaused = true;
            clearInterval(timerInterval);
            updateUI();
            statusDisplay.textContent = 'Запись приостановлена (через расширение)';
            statusDisplay.className = 'status paused';

        } else if (request.action === "recordingResumed") {
             // Расширение сообщило о возобновлении записи
             console.log("Запись возобновлена расширением.");
             isPaused = false;
             // Возможно, нужно скорректировать время начала записи для точного таймера,
             // но для простоты просто возобновим отсчет
             timerInterval = setInterval(updateTimer, 1000);
             updateUI();
             statusDisplay.textContent = 'Идет запись... (через расширение)';
             statusDisplay.className = 'status recording';

        } else if (request.action === "recordingError") {
            // Расширение сообщило об ошибке записи
            console.error("Ошибка записи получена от расширения:", request.error);
            alert(`Ошибка записи через расширение: ${request.error.message || request.error}`);

            // Обновить UI страницы для отображения ошибки
            isRecording = false;
            isPaused = false;
            clearInterval(timerInterval);
            timerDisplay.textContent = '00:00:00';
            updateUI();
            statusDisplay.textContent = 'Ошибка записи';
            statusDisplay.className = 'status error';
        } else if (request.action === "selectionCancelled") {
             // Расширение сообщило об отмене выбора источника
             console.log("Выбор источника записи отменен пользователем.");
             alert("Выбор источника записи отменен.");
             isRecording = false; // Сбрасываем состояние записи, если она не началась
             isPaused = false;
             clearInterval(timerInterval);
             timerDisplay.textContent = '00:00:00';
             updateUI();
             statusDisplay.textContent = 'Готов к записи'; // Сбрасываем статус
             statusDisplay.className = 'status ready';
        }
    });
} else {
    console.warn("API расширений Chrome не доступен. Убедитесь, что код выполняется в контексте веб-страницы, с которой может взаимодействовать расширение.");
    // Здесь можно добавить сообщение пользователю, что нужно установить расширение
     statusDisplay.textContent = 'Требуется расширение браузера';
     statusDisplay.className = 'status error';
     btnStart.disabled = true; // Отключаем кнопку старта без расширения
}


// Основные функции
async function toggleRecording() {
    // Логика переключения состояния записи теперь отправляется в расширение
    if (!isRecording) {
        await startRecording();
    } else if (isRecording && !isPaused) {
        pauseRecording();
    } else if (isRecording && isPaused) {
        resumeRecording();
    }
}

async function startRecording() {
    // Проверяем, доступен ли API расширений перед отправкой сообщения
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
         alert("Расширение браузера недоступно. Пожалуйста, установите и включите расширение.");
         return;
    }

    console.log("Запрос на начало записи отправляется в расширение...");
    statusDisplay.textContent = 'Ожидание выбора источника...';
    statusDisplay.className = 'status pending';

    // Отправляем сообщение расширению для начала записи
    chrome.runtime.sendMessage({
        action: "startRecording",
        videoSource: videoSourceSelect.value,
        audioSource: audioSourceSelect.value
        // Можно добавить разрешение и FPS, если расширение будет их использовать
    }, function(response) {
        // Ответ от расширения будет обработан в слушателе chrome.runtime.onMessage
        // Этот колбэк может быть вызван сразу с базовым статусом или позже.
        // Основная логика обновления UI при успешном начале записи происходит в слушателе 'recordingStarted'.
         console.log("Ответ от расширения на запрос startRecording:", response);
         if (response && response.status === "error") {
             // Обработка ошибок, которые могут произойти до вызова chooseDesktopMedia или getUserMedia
             alert(`Ошибка при подготовке к записи: ${response.error.message || response.error}`);
             statusDisplay.textContent = 'Ошибка подготовки';
             statusDisplay.className = 'status error';
             // Сбросить UI, так как запись не началась
             isRecording = false;
             isPaused = false;
             clearInterval(timerInterval);
             timerDisplay.textContent = '00:00:00';
             updateUI();
         } else if (response && response.status === "cancelled") {
              // Отмена уже обработана в слушателе, но можно добавить дополнительную логику здесь, если нужно
         }
    });

    // Удалены все вызовы getDisplayMedia, MediaRecorder и связанные обработчики
    // Логика получения потока и записи перенесена в расширение.
}

function pauseRecording() {
    if (!isRecording || isPaused) return;

    // Проверяем, доступен ли API расширений
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        console.warn("Расширение недоступно для паузы.");
        return;
    }

    console.log("Запрос на паузу записи отправляется в расширение...");
    // Отправляем сообщение расширению для паузы записи
    chrome.runtime.sendMessage({ action: "pauseRecording" }, function(response) {
         console.log("Ответ от расширения на запрос pauseRecording:", response);
         // UI будет обновлен после получения сообщения 'recordingPaused' от расширения
    });
     // Оставляем обновление UI на странице только после подтверждения от расширения
}

function resumeRecording() {
    if (!isRecording || !isPaused) return;

    // Проверяем, доступен ли API расширений
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
         console.warn("Расширение недоступно для возобновления.");
         return;
    }

    console.log("Запрос на возобновление записи отправляется в расширение...");
    // Отправляем сообщение расширению для возобновления записи
    chrome.runtime.sendMessage({ action: "resumeRecording" }, function(response) {
         console.log("Ответ от расширения на запрос resumeRecording:", response);
         // UI будет обновлен после получения сообщения 'recordingResumed' от расширения
    });
     // Оставляем обновление UI на странице только после подтверждения от расширения
}

function stopRecording() {
    if (!isRecording) return;

    // Проверяем, доступен ли API расширений
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        console.warn("Расширение недоступно для остановки.");
        // В случае, если расширение стало недоступно во время записи,
        // нужно как-то попытаться остановить поток, если он еще активен.
        // Но в этом сценарии мы предполагаем, что поток управляется расширением.
        // Поэтому просто сбросим UI на странице.
         isRecording = false;
         isPaused = false;
         clearInterval(timerInterval);
         timerDisplay.textContent = '00:00:00';
         updateUI();
         statusDisplay.textContent = 'Готов к записи (расширение недоступно)';
         statusDisplay.className = 'status error';
        return;
    }

    console.log("Запрос на остановку записи отправляется в расширение...");
    // Отправляем сообщение расширению для остановки записи
    chrome.runtime.sendMessage({ action: "stopRecording" }, function(response) {
         console.log("Ответ от расширения на запрос stopRecording:", response);
         // UI будет обновлен после получения сообщения 'recordingStopped' от расширения
    });
     // Оставляем обновление UI на странице только после подтверждения от расширения
}

function updateTimer() {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const hours = Math.floor(elapsed / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    timerDisplay.textContent = `${hours}:${minutes}:${seconds}`;
}

function updateUI() {
    // Обновление UI зависит от локальных флагов isRecording и isPaused,
    // которые меняются на основе сообщений от расширения
    if (isRecording) {
        if (isPaused) {
            btnStart.textContent = 'Продолжить запись';
            btnStop.disabled = false;
            // statusDisplay.textContent обновляется по сообщениям от расширения
            // statusDisplay.className = 'status paused';
        } else {
            btnStart.textContent = 'Пауза записи';
            btnStop.disabled = false;
            // statusDisplay.textContent обновляется по сообщениям от расширения
            // statusDisplay.className = 'status recording';
        }
    } else {
        btnStart.textContent = 'Начать запись';
        btnStop.disabled = true; // Отключаем кнопку остановки, когда не записываем
        // statusDisplay.textContent обновляется по сообщениям от расширения
        // statusDisplay.className = 'status ready';
        previewVideo.style.display = 'none'; // Скрыть предпросмотр, когда не записывается
    }

    // Отключение элементов управления во время активной записи (не паузы)
     const isActivelyRecording = isRecording && !isPaused;
    videoSourceSelect.disabled = isActivelyRecording;
    resolutionSelect.disabled = isActivelyRecording;
    fpsSelect.disabled = isActivelyRecording;
    audioSourceSelect.disabled = isActivelyRecording;
    volumeSlider.disabled = isActivelyRecording; // Слайдер громкости пока неактивен
    btnStart.disabled = isActivelyRecording; // Отключаем кнопку старта, когда активно записываем
}


// Функции выбора области (заглушки, требуют доработки через расширение)
// Логика выбора области остается на странице, но сама запись выбранной области
// должна будет быть реализована в расширении (это сложная задача).
function showRegionSelectionOverlay() {
    regionOverlay.style.display = 'block';
}

function startRegionSelection(e) {
    if (e.target !== regionOverlay) return; // Начинаем только при клике по оверлею
    selectionStart = { x: e.clientX, y: e.clientY };
    selectionRectangle.style.left = `${e.clientX}px`;
    selectionRectangle.style.top = `${e.clientY}px`;
    selectionRectangle.style.width = '0px';
    selectionRectangle.style.height = '0px';
}

function updateRegionSelection(e) {
    if (!selectionStart) return;
    const width = Math.abs(e.clientX - selectionStart.x);
    const height = Math.abs(e.clientY - selectionStart.y);
    const left = Math.min(e.clientX, selectionStart.x);
    const top = Math.min(e.clientY, selectionStart.y);
    selectionRectangle.style.left = `${left}px`;
    selectionRectangle.style.top = `${top}px`;
    selectionRectangle.style.width = `${width}px`;
    selectionRectangle.style.height = `${height}px`;
}

function endRegionSelection(e) {
    if (!selectionStart) return;
    const width = Math.abs(e.clientX - selectionStart.x);
    const height = Math.abs(e.clientY - selectionStart.y);
    if (width > 10 && height > 10) { // Минимальный размер области
        selectedRegion = {
            x: Math.min(e.clientX, selectionStart.x),
            y: Math.min(e.clientY, selectionStart.y),
            width: width,
            height: height
        };
        alert(`Выбрана область: ${width}x${height} at (${selectedRegion.x},${selectedRegion.y}).\n\nЗапись выбранной области пока не реализована через расширение.`);
        // Здесь нужно будет отправить сообщение расширению о выбранной области,
        // и расширение должно будет реализовать логику захвата именно этой области.
        // Это потребует использования Canvas Capture или других сложных техник в расширении.

    } else {
         alert("Выбранная область слишком мала.");
    }
    selectionStart = null;
    regionOverlay.style.display = 'none'; // Скрываем оверлей
}

// Привязываем слушатели событий к оверлею выбора области
regionOverlay.addEventListener('mousedown', startRegionSelection);
regionOverlay.addEventListener('mousemove', updateRegionSelection);
regionOverlay.addEventListener('mouseup', endRegionSelection);

// Вспомогательные функции (заглушки)
function showSettings() {
    alert("Настройки пока не реализованы в этой веб-версии. Большая часть настроек кодирования будет зависеть от реализации в расширении.");
}

function showHelp() {
    alert("Справка по Веб-рекордеру экрана\n\n" +
        "Это веб-приложение работает совместно с расширением браузера.\n\n" +
        "1. Установите и включите расширение 'Screen Recorder with Audio'.\n" + // Укажите точное имя вашего расширения
        "2. Выберите источник видео (экран или окно)\n" +
        "3. Выберите источник звука (микрофон, системные звуки или без звука).\n" +
        "4. Нажмите 'Начать запись' или Alt+R. Появится диалог выбора источника от браузера - выберите и подтвердите.\n" +
        "5. Для паузы нажмите 'Пауза записи' или Alt+S\n" +
        "6. Для остановки нажмите 'Остановить запись' или Alt+T. Файл будет автоматически скачан.\n\n" +
        "Примечание: Функциональность зависит от возможностей расширения и браузера.");
}

function handleHotkeys(e) {
    // Проверяем, что нажата клавиша Alt
    if (e.altKey) {
        if (e.key === 'r') {
            e.preventDefault(); // Предотвратить действие браузера по умолчанию
            toggleRecording(); // Вызовет startRecording, которая отправит сообщение расширению
        } else if (e.key === 's' && isRecording && !isPaused) {
            e.preventDefault();
            pauseRecording(); // Отправит сообщение расширению
        } else if (e.key === 't' && isRecording) {
            e.preventDefault();
            stopRecording(); // Отправит сообщение расширению
        }
    }
    // Оставляем обработку клавиши Escape для закрытия оверлея выбора области
    else if (e.key === 'Escape' && regionOverlay.style.display === 'block') {
         e.preventDefault();
         regionOverlay.style.display = 'none';
         selectionStart = null; // Сбросить выбор области
    }
}

// Обработка выбора пользовательского разрешения (заглушка)
resolutionSelect.addEventListener('change', function() {
    if (resolutionSelect.value === 'custom') {
        alert("Пользовательское разрешение пока не реализовано в связке с расширением.");
        // В реальной реализации здесь можно было бы показать модальное окно для ввода разрешения
        // и отправить эти параметры в расширение для учета при захвате.
        // Для простоты пока сбросим на стандартное разрешение
        resolutionSelect.value = '1920x1080'; // Сброс на стандартное
    }
});

// Обработка выбора произвольной области
videoSourceSelect.addEventListener('change', function() {
    if (videoSourceSelect.value === 'region') {
        alert("Выбор произвольной области пока требует реализации в расширении.");
        // Показываем оверлей при выборе "Произвольная область"
        showRegionSelectionOverlay();
        // Сбрасываем на "Весь экран", пока выбор области не завершен и запись не началась
        // В более продвинутой версии можно было бы запускать запись после выбора области
        videoSourceSelect.value = 'screen'; // Сброс на Весь экран
    }
});