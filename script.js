// Глобальные переменные
let mediaRecorder;
let recordedChunks = [];
let recordingStartTime;
let pauseStartTime;
let totalPausedTime = 0;
let timerInterval;
let isRecording = false;
let isPaused = false;
let selectedRegion = null;
let selectionStart = null;
let currentStream;
let audioContext;
let micGainNode;
let micVolume = 1.0; // По умолчанию громкость 100%

// Ждем полной загрузки HTML документа
document.addEventListener('DOMContentLoaded', function() {
    // Элементы DOM
    const videoSourceSelect = document.getElementById('videoSource');
    const resolutionSelect = document.getElementById('resolution');
    const fpsSelect = document.getElementById('fps');
    const audioSourceSelect = document.getElementById('audioSource');
    const volumeSlider = document.getElementById('volume');
    // Добавлен элемент для отображения процентов громкости
    const volumePercentDisplay = document.getElementById('volumePercent');
    const timerDisplay = document.getElementById('timer');
    const statusDisplay = document.getElementById('status');
    const previewVideo = document.getElementById('preview');
    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');
    const btnSettings = document.getElementById('btnSettings');
    const btnHelp = document.getElementById('btnHelp');
    const regionOverlay = document.getElementById('regionSelectionOverlay');
    const selectionRectangle = document.getElementById('selectionRectangle');

    // Добавлены элементы для пользовательского разрешения
    const customResolutionDiv = document.getElementById('customResolutionDiv');
    const customWidthInput = document.getElementById('customWidth');
    const customHeightInput = document.getElementById('customHeight');

    // Инициализация AudioContext
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Обработчик изменения громкости
    volumeSlider.addEventListener('input', function() {
        micVolume = parseFloat(this.value);
        if (micGainNode) {
            micGainNode.gain.value = micVolume;
        }
        // Обновляем отображение процентов громкости
        volumePercentDisplay.textContent = `${Math.round(micVolume * 100)}%`;
        console.log("Громкость микрофона установлена на:", micVolume);
    });

    // Устанавливаем начальное значение процентов при загрузке
    volumePercentDisplay.textContent = `${Math.round(micVolume * 100)}%`;


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

    // Добавлен обработчик для изменения разрешения
    resolutionSelect.addEventListener('change', function() {
        if (this.value === 'custom') {
            customResolutionDiv.style.display = 'block';
        } else {
            customResolutionDiv.style.display = 'none';
        }
        if (this.value === 'custom') {
             // Не выводим alert, так как функциональность уже реализована
        }
    });


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
            const resolution = resolutionSelect.value;
            const fps = parseInt(fpsSelect.value);

            console.log("Начало процесса записи...");
            statusDisplay.textContent = 'Запрашиваем доступ к медиа...';
            statusDisplay.className = 'status pending';

            // Определяем параметры разрешения в зависимости от выбора
            let width, height;
            if (resolution === 'custom') {
                const customWidth = parseInt(customWidthInput.value);
                const customHeight = parseInt(customHeightInput.value);
                if (isNaN(customWidth) || isNaN(customHeight) || customWidth <= 0 || customHeight <= 0) {
                    alert('Пожалуйста, введите корректные значения для пользовательского разрешения.');
                    statusDisplay.textContent = 'Ошибка: некорректное пользовательское разрешение';
                    statusDisplay.className = 'status error';
                    updateUI();
                    return;
                }
                width = { ideal: customWidth };
                height = { ideal: customHeight };
            } else {
                switch(resolution) {
                    case '3840x2160': // 4K
                        width = { ideal: 3840 };
                        height = { ideal: 2160 };
                        break;
                    case '2560x1440': // 2K
                        width = { ideal: 2560 };
                        height = { ideal: 1440 };
                        break;
                    case '1920x1080': // Full HD
                        width = { ideal: 1920 };
                        height = { ideal: 1080 };
                        break;
                    case '1280x720': // HD
                        width = { ideal: 1280 };
                        height = { ideal: 720 };
                        break;
                    default: // По умолчанию Full HD
                        width = { ideal: 1920 };
                        height = { ideal: 1080 };
                }
            }


            // 1. Получаем видеопоток с экрана
            const displayMediaConstraints = {
                video: {
                    mediaSource: videoSource === 'screen' ? 'screen' :
                              videoSource === 'window' ? 'window' : 'screen',
                    width: width,
                    height: height,
                    frameRate: { ideal: fps, max: 60 }
                },
                audio: audioSource === 'system' || audioSource === 'both'
            };

            console.log("Запрашиваем доступ к экрану с параметрами:", displayMediaConstraints);
            const screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaConstraints)
                .catch(err => {
                    console.error("Ошибка getDisplayMedia:", err);
                    throw err;
                });

            // Проверка видеодорожки
            const videoTracks = screenStream.getVideoTracks();
            if (videoTracks.length === 0) {
                throw new Error("Не удалось получить видеодорожку");
            }

            // Добавляем обработчик для отслеживания состояния видеодорожки
            videoTracks[0].addEventListener('ended', () => {
                console.log("Видеодорожка завершена");
                stopRecording();
            });

            // 2. Получаем аудиопоток с микрофона, если нужно
            let micStream = null;
            if ((audioSource === 'mic' || audioSource === 'both') && navigator.mediaDevices.getUserMedia) {
                try {
                    console.log("Запрашиваем доступ к микрофону...");
                    const originalMicStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            sampleRate: 44100
                        },
                        video: false
                    });

                    // Проверка аудиодорожки
                    if (originalMicStream.getAudioTracks().length === 0) {
                        throw new Error("Не удалось получить аудиодорожку микрофона");
                    }

                    // Восстанавливаем AudioContext если нужно
                    if (audioContext.state === 'suspended') {
                        await audioContext.resume();
                    } else if (audioContext.state === 'closed') {
                        audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    }

                    // Создаем источник из микрофона и узел громкости
                    const micSource = audioContext.createMediaStreamSource(originalMicStream);
                    micGainNode = audioContext.createGain();
                    micGainNode.gain.value = micVolume;

                    // Создаем пункт назначения для обработанного аудио
                    const dest = audioContext.createMediaStreamDestination();

                    // Подключаем микрофон -> GainNode -> пункт назначения
                    micSource.connect(micGainNode);
                    micGainNode.connect(dest);

                    // Используем обработанный поток
                    micStream = dest.stream;

                    // Добавляем обработчик для отслеживания состояния аудиодорожки
                    originalMicStream.getAudioTracks()[0].addEventListener('ended', () => {
                        console.log("Аудиодорожка микрофона завершена");
                        if (audioSource === 'mic') {
                            stopRecording();
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
            videoTracks.forEach(track => {
                combinedStream.addTrack(track);
            });

            // Добавляем аудиодорожки микрофона (если есть)
            if (micStream) {
                micStream.getAudioTracks().forEach(track => {
                    combinedStream.addTrack(track);
                });
            }

            // Добавляем системные звуки (если есть и запрошены)
            if ((audioSource === 'system' || audioSource === 'both') && screenStream.getAudioTracks().length > 0) {
                screenStream.getAudioTracks().forEach(track => {
                    combinedStream.addTrack(track);
                    track.addEventListener('ended', () => {
                        console.log("Аудиодорожка системных звуков завершена");
                        if (audioSource === 'system') {
                            stopRecording();
                        }
                    });
                });
            }

            // Проверяем, что есть хотя бы одна активная дорожка
            if (combinedStream.getTracks().length === 0) {
                throw new Error("Нет активных дорожек для записи");
            }

            console.log("Дорожки в объединенном потоке:");
            console.log("Видео:", combinedStream.getVideoTracks());
            console.log("Аудио:", combinedStream.getAudioTracks());

            // 4. Проверяем поддерживаемые форматы
            const mimeType = [
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm'
            ].find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
            console.log(`Используем MIME type: ${mimeType}`);

            // 5. Создаем MediaRecorder
            recordedChunks = [];
            mediaRecorder = new MediaRecorder(combinedStream, {
                mimeType: mimeType,
                videoBitsPerSecond: resolution === '3840x2160' ? 10000000 : // 10 Mbps для 4K
                                    resolution === '2560x1440' ? 5000000 :  // 5 Mbps для 2K
                                    2500000, // 2.5 Mbps для остальных
                audioBitsPerSecond: 128000   // 128 Kbps
            });

            mediaRecorder.ondataavailable = event => {
                if (event.data && event.data.size > 0) {
                    recordedChunks.push(event.data);
                    console.log(`Получен фрагмент данных (${event.data.size} байт)`);
                }
            };

            mediaRecorder.onstop = async () => {
                console.log("Запись остановлена. Всего фрагментов:", recordedChunks.length);
                try {
                    if (recordedChunks.length === 0) {
                        throw new Error("Запись не содержит данных");
                    }

                    const blob = new Blob(recordedChunks, { type: mimeType });
                    const url = URL.createObjectURL(blob);

                    // Показываем превью
                    previewVideo.src = url;
                    previewVideo.style.display = 'block';

                    // Автоматическое скачивание
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = `screen_record_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
                    document.body.appendChild(a);
                    a.click();

                    // Очистка
                    setTimeout(() => {
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                    }, 100);

                    statusDisplay.textContent = 'Запись успешно сохранена';
                    statusDisplay.className = 'status ready';
                } catch (error) {
                    console.error("Ошибка при сохранении записи:", error);
                    statusDisplay.textContent = 'Ошибка: ' + (error.message || 'неизвестная ошибка');
                    statusDisplay.className = 'status error';
                    if (error.message.includes("не содержит данных")) {
                        alert("Запись не содержит данных. Возможно, поток был прерван преждевременно.");
                    }
                } finally {
                    // Очистка ресурсов
                    if (currentStream) {
                        currentStream.getTracks().forEach(track => track.stop());
                    }
                    if (audioContext && audioContext.state !== 'closed') {
                        await audioContext.close();
                    }
                    currentStream = null;
                    recordedChunks = [];
                    timerDisplay.textContent = '00:00:00';
                    updateUI();
                }
            };

            mediaRecorder.onerror = (event) => {
                console.error("Ошибка MediaRecorder:", event.error);
                statusDisplay.textContent = `Ошибка: ${event.error.name}`;
                statusDisplay.className = 'status error';
                stopRecording();
            };

            currentStream = combinedStream;
            console.log("Запуск MediaRecorder...");
            mediaRecorder.start(1000); // Собираем данные каждую секунду

            isRecording = true;
            isPaused = false;
            recordingStartTime = Date.now();
            totalPausedTime = 0;
            timerInterval = setInterval(updateTimer, 1000);
            updateTimer();
            updateUI();
            statusDisplay.textContent = 'Идет запись...';
            statusDisplay.className = 'status recording';
            console.log("Запись успешно начата");
        } catch (error) {
            console.error('Ошибка при начале записи:', error);
            // Улучшенные сообщения об ошибках
            let errorMessage = 'Ошибка при начале записи';
            if (error.name === 'NotAllowedError') {
                errorMessage = "Доступ к устройствам запрещен. Разрешите доступ к экрану и микрофону.";
            } else if (error.name === 'NotFoundError') {
                errorMessage = "Не найдены доступные устройства для записи.";
            } else if (error.name === 'OverconstrainedError') {
                errorMessage = "Запрошенные параметры записи не поддерживаются.";
            } else {
                errorMessage = error.message || error.toString();
            }
            alert(errorMessage);
            statusDisplay.textContent = 'Ошибка: ' + errorMessage;
            statusDisplay.className = 'status error';

            // Очистка ресурсов при ошибке
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }
             // Проверяем состояние audioContext перед закрытием
            if (audioContext && audioContext.state !== 'closed') {
                audioContext.close().catch(e => console.error("Ошибка при закрытии AudioContext:", e));
            }
            currentStream = null;
            recordedChunks = [];
            updateUI();
        }
    }

    function pauseRecording() {
        if (!isRecording || isPaused) return;
        console.log("Приостановка записи...");
        isPaused = true;
        pauseStartTime = Date.now();
        clearInterval(timerInterval);
        try {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.requestData();
                mediaRecorder.pause();
                console.log("MediaRecorder успешно приостановлен");
            }
        } catch (e) {
            console.error("Ошибка при приостановке MediaRecorder:", e);
        }
        statusDisplay.textContent = 'Запись приостановлена';
        statusDisplay.className = 'status paused';
        updateUI();
    }

    function resumeRecording() {
        if (!isRecording || !isPaused) return;
        console.log("Возобновление записи...");
        isPaused = false;
        totalPausedTime += Date.now() - pauseStartTime;
        try {
            if (mediaRecorder && mediaRecorder.state === 'paused') {
                mediaRecorder.resume();
                console.log("MediaRecorder успешно возобновлен");
            }
        } catch (e) {
            console.error("Ошибка при возобновлении MediaRecorder:", e);
        }
        timerInterval = setInterval(updateTimer, 1000);
        statusDisplay.textContent = 'Идет запись...';
        statusDisplay.className = 'status recording';
        updateUI();
    }

    function stopRecording() {
        if (!isRecording) return;
        console.log("Остановка записи...");
        isRecording = false;
        isPaused = false;
        clearInterval(timerInterval);
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            try {
                mediaRecorder.stop();
            } catch (e) {
                console.error("Ошибка при остановке MediaRecorder:", e);
                cleanupAfterRecording();
            }
        } else {
            console.log("MediaRecorder не активен, выполняется очистка");
            cleanupAfterRecording();
        }
        updateUI();
    }

    function cleanupAfterRecording() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        if (audioContext && audioContext.state !== 'closed') {
             audioContext.close().catch(e => console.error("Ошибка при закрытии AudioContext:", e));
        }
        currentStream = null;
        recordedChunks = [];
        timerDisplay.textContent = '00:00:00';
        statusDisplay.textContent = 'Готов к записи';
        statusDisplay.className = 'status ready';
        previewVideo.style.display = 'none';
    }

    function updateTimer() {
        if (isPaused) return;
        const elapsed = Math.floor((Date.now() - recordingStartTime - totalPausedTime) / 1000);
        const hours = Math.floor(elapsed / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${hours}:${minutes}:${seconds}`;
    }

    function updateUI() {
        if (isRecording) {
            btnStart.textContent = isPaused ? 'Продолжить запись' : 'Пауза записи';
            btnStop.disabled = false;
        } else {
            btnStart.textContent = 'Начать запись';
            btnStop.disabled = true;
        }

        const isActivelyRecording = isRecording && !isPaused;

        // Теперь отключаем customResolutionDiv только при активной записи
        videoSourceSelect.disabled = isActivelyRecording;
        resolutionSelect.disabled = isActivelyRecording;
        fpsSelect.disabled = isActivelyRecording;
        audioSourceSelect.disabled = isActivelyRecording;
        volumeSlider.disabled = isActivelyRecording;
        customWidthInput.disabled = isActivelyRecording || resolutionSelect.value !== 'custom';
        customHeightInput.disabled = isActivelyRecording || resolutionSelect.value !== 'custom';


        if (!isRecording) {
            previewVideo.style.display = 'none';
        }

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

    // Функции выбора области
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

    function showSettings() {
        alert("Настройки пока не реализованы.");
    }

    function showHelp() {
        alert("Справка по Веб-рекордеру экрана\n\n" +
            "1. Выберите источник видео (экран или окно)\n" +
            "2. Выберите разрешение (включая 4K для больших экранов) и частоту кадров, либо выберите 'Пользовательское' и введите свои значения.\n" +
            "3. Выберите источник звука (микрофон или без звука).\n" +
            "4. Нажмите 'Начать запись' или Alt+R. Появится диалог выбора источника от браузера - выберите и подтвердите.\n" +
            "5. Для паузы нажмите 'Пауза записи' или Alt+S\n" +
            "6. Для остановки нажмите 'Остановить запись' или Alt+T. Файл будет автоматически скачан.\n\n" +
            "Примечание: Запись системных звуков через стандартные веб-API ненадежна и может не работать.");
    }

    function handleHotkeys(e) {
        // Игнорируем горячие клавиши, если фокус находится на поле ввода
        const activeElement = document.activeElement;
        if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'SELECT' || activeElement.tagName === 'TEXTAREA') {
            return;
        }

        if (e.altKey) {
            e.preventDefault(); // Предотвращаем стандартное поведение браузера
            switch(e.code) {
                case 'KeyR': // Alt+R - Начать/Продолжить запись
                    toggleRecording();
                    break;
                case 'KeyS': // Alt+S - Пауза записи
                    if (isRecording && !isPaused) {
                        pauseRecording();
                    }
                    break;
                case 'KeyT': // Alt+T - Остановить запись
                    if (isRecording) {
                        stopRecording();
                    }
                    break;
            }
        } else if (e.key === 'Escape' && regionOverlay.style.display === 'block') {
            e.preventDefault();
            regionOverlay.style.display = 'none';
            selectionStart = null;
        }
    }

    // Удален старый обработчик, который выводил alert для custom
    // resolutionSelect.addEventListener('change', function() {
    //     if (resolutionSelect.value === 'custom') {
    //         alert("Пользовательское разрешение пока не реализовано.");
    //         resolutionSelect.value = '1920x1080';
    //     }
    // });


    videoSourceSelect.addEventListener('change', function() {
        if (videoSourceSelect.value === 'region') {
            alert("Выбор произвольной области пока не реализована.");
            showRegionSelectionOverlay();
            videoSourceSelect.value = 'screen';
        }
    });

    // Изначально скрываем customResolutionDiv, если выбрано не 'custom'
     if (resolutionSelect.value !== 'custom') {
        customResolutionDiv.style.display = 'none';
    }

});