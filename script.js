// Глобальные переменные
let mediaRecorder;
let recordedChunks = [];
let recordingStartTime;
let timerInterval;
let isRecording = false;
let isPaused = false;

let selectedRegion = null; // Для выбора области
let selectionStart = null; // Для выбора области

let currentStream; // Для хранения текущего медиапотока

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

// --- Основные функции записи (без расширения) ---

async function toggleRecording() {
    if (!isRecording) {
        await startRecording();
    } else if (isRecording && !isPaused) {
        pauseRecording();
    } else if (isRecording && isPaused) {
        resumeRecording();
    }
}

async function startRecording() {
    try {
        const videoSource = videoSourceSelect.value;
        const audioSource = audioSourceSelect.value; // Получаем выбранный источник аудио
        let screenStream; // Поток экрана
        let audioStream = null; // Поток аудио (микрофон)
        let combinedStream; // Объединенный поток

        console.log("Попытка начала записи...");
        statusDisplay.textContent = 'Запрашиваем доступ к медиа...';
        statusDisplay.className = 'status pending';

        // 1. Получаем видеопоток экрана/окна
        const videoConstraints = {};
         if (videoSource === 'screen') {
            videoConstraints.mediaSource = 'screen';
        } else if (videoSource === 'window') {
             videoConstraints.mediaSource = 'window';
        } else if (videoSource === 'region') {
            alert("Выбор произвольной области временно недоступен.");
            // Сбросить UI обратно в готовность
            updateUI();
            statusDisplay.textContent = 'Готов к записи';
            statusDisplay.className = 'status ready';
            return;
        }

         console.log("Запрос getDisplayMedia для видео с ограничениями:", videoConstraints);
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: videoConstraints,
            audio: false // Не запрашиваем аудио через getDisplayMedia, будем получать отдельно микрофон
        });

        const videoTracks = screenStream.getVideoTracks();
         if (videoTracks.length === 0) {
             console.error("Видеодорожка не получена!");
             alert("Не удалось получить видеодорожку для записи экрана. Возможно, вы отменили выбор.");
             if (screenStream) {
                screenStream.getTracks().forEach(track => track.stop());
             }
             // Сбросить UI обратно в готовность
             updateUI();
             statusDisplay.textContent = 'Готов к записи';
             statusDisplay.className = 'status ready';
             return; // Прекращаем запись, если нет видео
         } else {
              console.log("Видеодорожка получена:", videoTracks[0].label);
         }


        // 2. Получаем аудиопоток микрофона, если выбран соответствующий источник
        // Проверяем, что browser поддерживает getUserMedia и выбран не "Без звука"
        if (audioSource !== 'none' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                console.log("Запрос getUserMedia для микрофона.");
                audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                console.log("Аудиодорожка микрофона получена.");
                 if (audioStream.getAudioTracks().length === 0) {
                      console.warn("getUserMedia вернул поток, но аудиодорожек нет.");
                      audioStream = null; // Обнуляем, если нет дорожек
                      alert("Не удалось получить аудиодорожку микрофона."); // Сообщить пользователю
                 }
            } catch (audioError) {
                console.warn("Не удалось получить доступ к микрофону:", audioError);
                // Проверяем, была ли ошибка связана с разрешением
                 if (audioError.name === 'NotAllowedError' || audioError.name === 'PermissionDeniedError') {
                     alert("Необходимо разрешить доступ к микрофону для записи звука.");
                 } else if (audioError.name === 'NotFoundError') {
                     alert("Микрофон не найден.");
                 }
                else {
                    alert("Не удалось получить доступ к микрофону. Запись будет без звука.");
                }
                audioStream = null; // Сбрасываем аудиопоток в случае ошибки
            }
        } else if (audioSource !== 'none') {
             console.warn("getUserMedia не поддерживается или выбрано 'Без звука'.");
             if (! (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
                 alert("Ваш браузер не поддерживает захват микрофона.");
             }
        }


        // 3. Объединяем видео и аудио потоки
        combinedStream = new MediaStream();

        // Добавляем видеодорожки из screenStream
        screenStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));

        // Добавляем аудиодорожки из audioStream (если он успешно получен)
        if (audioStream) {
             audioStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));
             console.log("Аудиодорожка микрофона добавлена в объединенный поток.");
        } else {
             console.log("Аудиодорожка микрофона не будет добавлена (не выбрана, не получена или ошибка).");
        }

         // Важно остановить оригинальные потоки после копирования дорожек
         if (screenStream) {
             screenStream.getTracks().forEach(track => track.stop());
         }
         if (audioStream) {
             audioStream.getTracks().forEach(track => track.stop());
         }


        currentStream = combinedStream; // Сохраняем объединенный поток

        // Проверяем, что в объединенном потоке есть хотя бы одна дорожка
        if (combinedStream.getTracks().length === 0) {
             console.error("Объединенный поток не содержит дорожек!");
             alert("Не удалось создать медиапоток для записи. Убедитесь, что вы разрешили доступ к экрану.");
              // Сбросить UI обратно в готовность
             updateUI();
             statusDisplay.textContent = 'Готов к записи';
             statusDisplay.className = 'status ready';
             return;
        }


        // 4. Настройка MediaRecorder
        recordedChunks = [];
        // Попробуем mimeType с кодеком vp9, который хорошо поддерживается
        let options = { mimeType: 'video/webm; codecs=vp9' };

        // Проверяем, поддерживается ли выбранный mimeType
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
             console.warn(`${options.mimeType} не поддерживается, пробуем 'video/webm'`);
             options = { mimeType: 'video/webm' };
             if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                  console.error("'video/webm' также не поддерживается!");
                  alert("Ваш браузер не поддерживает запись видео в формате WebM.");
                  // Останавливаем все треки
                  if (currentStream) {
                    currentStream.getTracks().forEach(track => track.stop());
                  }
                  currentStream = null;
                  // Сбросить UI обратно в готовность
                  updateUI();
                  statusDisplay.textContent = 'Готов к записи';
                  statusDisplay.className = 'status ready';
                  return; // Прекращаем запись
             }
        }

        console.log("Создание MediaRecorder с mimeType:", options.mimeType);
        mediaRecorder = new MediaRecorder(combinedStream, options); // Используем объединенный поток

        mediaRecorder.ondataavailable = event => {
            console.log("ondataavailable", event.data.size, "bytes");
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            console.log("onstop. Total chunks:", recordedChunks.length);
            if (recordedChunks.length === 0) {
                 alert("Запись не содержит данных. Возможно, поток был прерван преждевременно.");
                 // Останавливаем все треки
                 if (currentStream) {
                    currentStream.getTracks().forEach(track => track.stop());
                 }
                 currentStream = null;
                 updateUI();
                 timerDisplay.textContent = '00:00:00'; // Сбросить таймер
                 statusDisplay.textContent = 'Готов к записи'; // Сбросить статус
                 statusDisplay.className = 'status ready';
                 return; // Прекращаем обработку, если нет данных
            }

            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            previewVideo.src = url;
            previewVideo.style.display = 'block';

            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `screen_record_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);

             // Останавливаем все треки в потоке после завершения записи
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }
             currentStream = null; // Обнулить поток

             timerDisplay.textContent = '00:00:00';
             updateUI();
             statusDisplay.textContent = 'Запись завершена'; // Обновить статус
             statusDisplay.className = 'status ready'; // Или другой класс для завершения записи
        };

        mediaRecorder.onerror = (event) => {
            console.error("MediaRecorder error:", event.error);
            alert(`Ошибка MediaRecorder: ${event.error.name} - ${event.error.message}`);
            stopRecording(); // Попытаться остановить запись при ошибке
        };

        // 5. Начать запись
        mediaRecorder.start(1000); // Собирать данные каждую секунду

        isRecording = true;
        isPaused = false;
        recordingStartTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
        updateTimer(); // Обновить таймер сразу
        updateUI();
        statusDisplay.textContent = 'Идет запись...';
        statusDisplay.className = 'status recording';


        // Добавляем слушатель для отслеживания завершения захвата экрана пользователем
        // Это полезно, если пользователь нажимает "Остановить" в нативном диалоге браузера
        combinedStream.getVideoTracks()[0].onended = function() {
            console.log("Захват экрана завершен (пользователь остановил или окно закрылось).");
             // Если пользователь остановил захват через системный диалог,
             // нужно остановить и MediaRecorder, если он еще записывает
             if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                 console.log("Останавливаем MediaRecorder после завершения захвата экрана.");
                 mediaRecorder.stop();
             }
             // stopRecording() будет вызвана через mediaRecorder.onstop
        };


    } catch (error) {
        console.error('Ошибка при начале записи:', error);
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
             alert("Необходимо разрешить доступ к экрану и/или микрофону для записи.");
        } else if (error.name === 'NotFoundError') {
             alert("Не найдены доступные источники для записи экрана или микрофона.");
        } else if (error.name === 'AbortError') {
             alert("Запрос на доступ к медиа был отклонен или захват был прекращен преждевременно.");
        }
        else {
             alert(`Ошибка при начале записи: ${error.message}`);
        }
        // В случае ошибки сбросить UI обратно в готовность
        updateUI();
        statusDisplay.textContent = 'Готов к записи';
        statusDisplay.className = 'status ready';
        // Не вызываем stopRecording здесь, чтобы не пытаться остановить несуществующие потоки/MediaRecorder
        // if (currentStream) {
        //     currentStream.getTracks().forEach(track => track.stop());
        // }
        // currentStream = null;
    }
}

function pauseRecording() {
    if (!isRecording || isPaused) return;
    isPaused = true;
    clearInterval(timerInterval);
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        console.log("Приостановка записи...");
        mediaRecorder.pause();
        statusDisplay.textContent = 'Запись приостановлена';
        statusDisplay.className = 'status paused';
    }
    updateUI();
}

function resumeRecording() {
    if (!isRecording || !isPaused) return;
    isPaused = false;
    // recordingStartTime = Date.now() - (Date.now() - recordingStartTime); // Некорректно
    timerInterval = setInterval(updateTimer, 1000);
    if (mediaRecorder && mediaRecorder.state === 'paused') {
        console.log("Возобновление записи...");
        mediaRecorder.resume();
        statusDisplay.textContent = 'Идет запись...';
        statusDisplay.className = 'status recording';
    }
    updateUI();
}

function stopRecording() {
    if (!isRecording) return;
    isRecording = false; // Сбрасываем состояние сразу для обновления UI
    isPaused = false;
    clearInterval(timerInterval); // Остановить таймер
    timerDisplay.textContent = '00:00:00'; // Сбросить таймер
    updateUI(); // Обновляем UI в состояние "Готов к записи"

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
         console.log("Остановка записи...");
        mediaRecorder.stop(); // Это вызовет mediaRecorder.onstop, где будет обработан файл
    } else {
         console.log("MediaRecorder не активен для остановки.");
        // Если MediaRecorder не активен, просто очищаем, если что-то осталось
        recordedChunks = [];
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        currentStream = null;
         statusDisplay.textContent = 'Готов к записи';
         statusDisplay.className = 'status ready';
         previewVideo.style.display = 'none';
    }
}

function updateTimer() {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const hours = Math.floor(elapsed / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    timerDisplay.textContent = `${hours}:${minutes}:${seconds}`;
}

function updateUI() {
    // Обновление UI зависит от локальных флагов isRecording и isPaused
    if (isRecording) {
        if (isPaused) {
            btnStart.textContent = 'Продолжить запись';
            // btnStop.disabled = false; // Управляется ниже
            // statusDisplay.textContent и className управляются в функциях pauseRecording/resumeRecording
        } else {
            btnStart.textContent = 'Пауза записи';
            // btnStop.disabled = false; // Управляется ниже
            // statusDisplay.textContent и className управляются в startRecording
        }
        btnStop.disabled = false; // Кнопка Стоп активна, когда идет запись или пауза
    } else {
        btnStart.textContent = 'Начать запись';
        btnStop.disabled = true; // Отключаем кнопку остановки, когда не записываем
        // statusDisplay.textContent и className управляются в stopRecording или catch block startRecording
        previewVideo.style.display = 'none'; // Скрыть предпросмотр, когда не записывается
    }

    // Отключение элементов управления во время активной записи (не паузы)
    const isActivelyRecording = isRecording && !isPaused;
    videoSourceSelect.disabled = isActivelyRecording;
    resolutionSelect.disabled = isActivelyRecording;
    fpsSelect.disabled = isActivelyRecording;
    // Отключаем аудио источник только во время активной записи
    audioSourceSelect.disabled = isActivelyRecording;
    volumeSlider.disabled = isActivelyRecording; // Слайдер громкости пока неактивен

    // Кнопка Start/Pause/Resume активна, если мы не в состоянии "Готов к записи" (т.е. идет запись или пауза)
    // или если запись не идет и не на паузе (для начала записи)
     btnStart.disabled = isActivelyRecording; // Кнопка Start неактивна, когда активно записываем
     // Кнопка Stop активна, только если запись идет или на паузе
     btnStop.disabled = !isRecording && !isPaused;
}


// Функции выбора области (заглушки)
function showRegionSelectionOverlay() {
    regionOverlay.style.display = 'block';
}

function startRegionSelection(e) {
    if (e.target !== regionOverlay) return;
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
    if (width > 10 && height > 10) {
        selectedRegion = {
            x: Math.min(e.clientX, selectionStart.x),
            y: Math.min(e.clientY, selectionStart.y),
            width: width,
            height: height
        };
        alert(`Выбрана область: ${width}x${height} at (${selectedRegion.x},${selectedRegion.y}).\n\nЗапись выбранной области пока не реализована.`);
    } else {
         alert("Выбранная область слишком мала.");
    }
    selectionStart = null;
    regionOverlay.style.display = 'none';
}

regionOverlay.addEventListener('mousedown', startRegionSelection);
regionOverlay.addEventListener('mousemove', updateRegionSelection);
regionOverlay.addEventListener('mouseup', endRegionSelection);

// Вспомогательные функции (заглушки)
function showSettings() {
    alert("Настройки пока не реализованы.");
}

function showHelp() {
    alert("Справка по Веб-рекордеру экрана\n\n" +
        "1. Выберите источник видео (экран или окно)\n" +
        "2. Выберите разрешение и частоту кадров\n" +
        "3. Выберите источник звука (микрофон или без звука).\n" +
        "4. Нажмите 'Начать запись' или Alt+R. Появится диалог выбора источника от браузера - выберите и подтвердите.\n" +
        "5. Для паузы нажмите 'Пауза записи' или Alt+S\n" +
        "6. Для остановки нажмите 'Остановить запись' или Alt+T. Файл будет автоматически скачан.\n\n" +
        "Примечание: Запись системных звуков через стандартные веб-API ненадежна и может не работать.");
}

function handleHotkeys(e) {
    if (e.altKey) {
        if (e.key === 'r') {
            e.preventDefault();
            toggleRecording();
        } else if (e.key === 's' && isRecording && !isPaused) {
            e.preventDefault();
            pauseRecording();
        } else if (e.key === 't' && isRecording) {
            e.preventDefault();
            stopRecording();
        }
    } else if (e.key === 'Escape' && regionOverlay.style.display === 'block') {
         e.preventDefault();
         regionOverlay.style.display = 'none';
         selectionStart = null;
    }
}

// Обработка выбора пользовательского разрешения (заглушка)
resolutionSelect.addEventListener('change', function() {
    if (resolutionSelect.value === 'custom') {
        alert("Пользовательское разрешение пока не реализовано.");
        resolutionSelect.value = '1920x1080'; // Сброс на стандартное
    }
});

// Обработка выбора произвольной области
videoSourceSelect.addEventListener('change', function() {
    if (videoSourceSelect.value === 'region') {
        alert("Выбор произвольной области пока не реализован.");
        showRegionSelectionOverlay();
        videoSourceSelect.value = 'screen'; // Сброс на Весь экран
    }
});