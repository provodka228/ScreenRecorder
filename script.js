
// Глобальные переменные
let mediaRecorder;
let recordedChunks = [];
let recordingStartTime;
let timerInterval;
let isRecording = false;
let isPaused = false;
let selectedRegion = null;
let selectionStart = null;
let currentStream;

// Ждем полной загрузки HTML документа
document.addEventListener('DOMContentLoaded', function() {
    // Элементы DOM
    const videoSourceSelect = document.getElementById('videoSource');
    const resolutionSelect = document.getElementById('resolution');
    const fpsSelect = document.getElementById('fps');
    const audioSourceSelect = document.getElementById('audioSource');
    const volumeSlider = document.getElementById('volume');
    const timerDisplay = document.getElementById('timer');
    const statusDisplay = document.getElementById('status');
    const previewVideo = document.getElementById('preview');
    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');
    const btnSettings = document.getElementById('btnSettings');
    const btnHelp = document.getElementById('btnHelp');
    const regionOverlay = document.getElementById('regionSelectionOverlay');
    const selectionRectangle = document.getElementById('selectionRectangle');

    // Проверка поддержки API
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert("Ваш браузер не поддерживает запись экрана");
        return;
    }

    // Слушатели событий
    btnStart.addEventListener('click', toggleRecording);
    btnStop.addEventListener('click', stopRecording);
    btnSettings.addEventListener('click', showSettings);
    btnHelp.addEventListener('click', showHelp);
    document.addEventListener('keydown', handleHotkeys);

    // Инициализация UI
    updateUI();

    // --- Основные функции записи ---

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
            const audioSource = audioSourceSelect.value;
            console.log("Начало процесса записи...");
            statusDisplay.textContent = 'Запрашиваем доступ к медиа...';
            statusDisplay.className = 'status pending';

            // 1. Получаем видеопоток с экрана
            const displayMediaConstraints = {
                video: {
                    mediaSource: videoSource === 'screen' ? 'screen' :
                               videoSource === 'window' ? 'window' : 'screen'
                },
                audio: audioSource === 'system' || audioSource === 'both'
            };

            console.log("Запрашиваем доступ к экрану...");
            const screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaConstraints)
                .catch(err => {
                    console.error("Ошибка getDisplayMedia:", err);
                    throw err;
                });

            if (screenStream.getVideoTracks().length === 0) {
                throw new Error("Не удалось получить видеодорожку");
            }

            // 2. Получаем аудиопоток с микрофона, если нужно
            let micStream = null;
            if ((audioSource === 'mic' || audioSource === 'both') && navigator.mediaDevices.getUserMedia) {
                try {
                    console.log("Запрашиваем доступ к микрофону...");
                    micStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            sampleRate: 44100
                        }
                    });
                } catch (audioError) {
                    console.warn("Не удалось получить доступ к микрофону:", audioError);
                    if (audioSource === 'mic') {
                        throw audioError;
                    }
                }
            }

            // 3. Создаем объединенный поток
            const combinedStream = new MediaStream();

            // Добавляем видеодорожку
            screenStream.getVideoTracks().forEach(track => {
                combinedStream.addTrack(track);
                track.onended = () => {
                    console.log("Видеодорожка завершена");
                    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                        mediaRecorder.stop();
                    }
                };
            });

            // Добавляем аудиодорожки микрофона (если есть)
            if (micStream) {
                micStream.getAudioTracks().forEach(track => {
                    combinedStream.addTrack(track);
                });
            }

            // Добавляем системные звуки (если есть и запрошены)
            if (audioSource === 'system' || audioSource === 'both') {
                screenStream.getAudioTracks().forEach(track => {
                    combinedStream.addTrack(track);
                });
            }

            console.log("Дорожки в объединенном потоке:");
            console.log("Видео:", combinedStream.getVideoTracks());
            console.log("Аудио:", combinedStream.getAudioTracks());

            // 4. Проверяем поддерживаемые форматы
            let mimeType = 'video/webm';
            const supportedTypes = [
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm'
            ].filter(type => MediaRecorder.isTypeSupported(type));

            if (supportedTypes.length > 0) {
                mimeType = supportedTypes[0];
            }
            console.log(`Используем MIME type: ${mimeType}`);


            // 5. Создаем MediaRecorder
            recordedChunks = [];
            mediaRecorder = new MediaRecorder(combinedStream, {
                mimeType: mimeType
            });

            mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                console.log("onstop. Total chunks:", recordedChunks.length);
                if (recordedChunks.length === 0) {
                    alert("Запись не содержит данных. Возможно, поток был прерван преждевременно.");
                    if (currentStream) {
                        currentStream.getTracks().forEach(track => track.stop());
                    }
                    currentStream = null;
                    updateUI();
                    timerDisplay.textContent = '00:00:00';
                    statusDisplay.textContent = 'Готов к записи';
                    statusDisplay.className = 'status ready';
                    return;
                }

                const blob = new Blob(recordedChunks, { type: mimeType });
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

                if (currentStream) {
                    currentStream.getTracks().forEach(track => track.stop());
                }
                currentStream = null;
                timerDisplay.textContent = '00:00:00';
                updateUI();
                statusDisplay.textContent = 'Запись завершена';
                statusDisplay.className = 'status ready';
            };

            mediaRecorder.onerror = (event) => {
                console.error("MediaRecorder error:", event.error);
                alert(`Ошибка MediaRecorder: ${event.error.name} - ${event.error.message}`);
                stopRecording();
            };


            currentStream = combinedStream;
            console.log("Запуск MediaRecorder...");
            mediaRecorder.start(1000); // Собираем данные каждую секунду

            isRecording = true;
            isPaused = false;
            recordingStartTime = Date.now();
            timerInterval = setInterval(updateTimer, 1000);
            updateTimer(); // Обновить таймер сразу при старте
            updateUI();
            statusDisplay.textContent = 'Идет запись...';
            statusDisplay.className = 'status recording';
            console.log("Запись успешно начата");

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
            updateUI();
            statusDisplay.textContent = 'Готов к записи';
            statusDisplay.className = 'status ready';
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }
            currentStream = null;
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
        isRecording = false;
        isPaused = false;
        clearInterval(timerInterval);
        timerDisplay.textContent = '00:00:00';
        updateUI();
         if (mediaRecorder && mediaRecorder.state !== 'inactive') {
             console.log("Остановка записи...");
            mediaRecorder.stop();
        } else {
            console.log("MediaRecorder не активен для остановки.");
            recordedChunks = []; // Сбросить чанки, если MediaRecorder неактивен
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
        const isActivelyRecording = isRecording && !isPaused;

        if (isRecording) {
            if (isPaused) {
                btnStart.textContent = 'Продолжить запись';
            } else {
                btnStart.textContent = 'Пауза записи';
            }
            btnStop.disabled = false; // Кнопка стоп активна только когда запись началась
        } else {
            btnStart.textContent = 'Начать запись';
            btnStop.disabled = true;
            previewVideo.style.display = 'none'; // Скрыть превью, когда не записывается
        }

        // Отключаем элементы управления во время активной записи
        videoSourceSelect.disabled = isActivelyRecording;
        resolutionSelect.disabled = isActivelyRecording;
        fpsSelect.disabled = isActivelyRecording;
        audioSourceSelect.disabled = isActivelyRecording;
        volumeSlider.disabled = isActivelyRecording;

        // Управление состоянием кнопки Start/Pause/Resume
        // Если идет активная запись, кнопка "Начать" становится "Пауза" и должна быть активна, чтобы нажать паузу
        // Если запись приостановлена, кнопка "Пауза" становится "Продолжить" и должна быть активна
        // Если запись остановлена, кнопка "Стоп" неактивна, а "Начать" активна
         btnStart.disabled = !isRecording && !isPaused ? false : false; // Всегда активна, текст меняется
         btnStop.disabled = !isRecording; // Неактивна, если не идет запись

        if (statusDisplay.className !== 'status pending' && statusDisplay.className !== 'status error') {
            if (isRecording) {
                statusDisplay.textContent = isPaused ? 'Запись приостановлена' : 'Идет запись...';
                statusDisplay.className = isPaused ? 'status paused' : 'status recording';
            } else {
                statusDisplay.textContent = 'Готов к записи';
                statusDisplay.className = 'status ready';
            }
        }
    }

    // Функции выбора области (заглушки)
    function showRegionSelectionOverlay() {
        regionOverlay.style.display = 'block';
        // Добавьте слушатели событий для мыши здесь, чтобы они работали только когда оверлей виден
    }

    function startRegionSelection(e) {
        if (e.target !== regionOverlay) return; // Убедиться, что клик был по оверлею, а не по элементам внутри
        selectionStart = { x: e.clientX, y: e.clientY };
        selectionRectangle.style.left = `${e.clientX}px`;
        selectionRectangle.style.top = `${e.clientY}px`;
        selectionRectangle.style.width = '0px';
        selectionRectangle.style.height = '0px';
        selectionRectangle.style.display = 'block'; // Показать прямоугольник при начале выделения
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

        selectionRectangle.style.display = 'none'; // Скрыть прямоугольник после выделения

        if (width > 10 && height > 10) { // Простая проверка на минимальный размер
            selectedRegion = {
                x: Math.min(e.clientX, selectionStart.x),
                y: Math.min(e.clientY, selectionStart.y),
                width: width,
                height: height
            };
            alert(`Выбрана область: ${width}x${height} at (${selectedRegion.x},${selectedRegion.y}).\n\nЗапись выбранной области пока не реализована.`);
             // Здесь можно было бы обновить UI или начать запись выбранной области
        } else {
            alert("Выбранная область слишком мала.");
            selectedRegion = null; // Сбросить выбранную область
        }

        selectionStart = null;
        regionOverlay.style.display = 'none'; // Скрыть оверлей
         // Удалите слушатели событий для мыши здесь, чтобы они не работали, когда оверлей скрыт
    }

    // Слушатели событий для выделения области (только когда оверлей виден)
    // Лучше добавлять и удалять их динамически при показе/скрытии оверлея
     regionOverlay.addEventListener('mousedown', startRegionSelection);
     regionOverlay.addEventListener('mousemove', updateRegionSelection);
     regionOverlay.addEventListener('mouseup', endRegionSelection);


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
        // Игнорируем горячие клавиши, если фокус находится на поле ввода
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        if (e.altKey) {
            if (e.code === 'KeyR') { // Alt + R (Старт/Продолжить)
                e.preventDefault(); // Предотвратить действие браузера по умолчанию
                toggleRecording();
            } else if (e.code === 'KeyS' && isRecording && !isPaused) { // Alt + S (Пауза)
                e.preventDefault();
                pauseRecording();
            } else if (e.code === 'KeyT' && isRecording) { // Alt + T (Стоп)
                e.preventDefault();
                stopRecording();
            }
        } else if (e.key === 'Escape' && regionOverlay.style.display === 'block') {
            e.preventDefault();
            regionOverlay.style.display = 'none';
            selectionStart = null;
             selectionRectangle.style.width = '0px';
             selectionRectangle.style.height = '0px';
             selectionRectangle.style.display = 'none'; // Скрыть прямоугольник
        }
    }

    resolutionSelect.addEventListener('change', function() {
        if (resolutionSelect.value === 'custom') {
            alert("Пользовательское разрешение пока не реализовано.");
            resolutionSelect.value = '1920x1080'; // Возвращаем к стандартному значению
        }
    });

    videoSourceSelect.addEventListener('change', function() {
        if (videoSourceSelect.value === 'region') {
            alert("Выбор произвольной области пока не реализована.");
            showRegionSelectionOverlay();
            videoSourceSelect.value = 'screen'; // Возвращаем к стандартному значению
        }
    });

});

