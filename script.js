// Глобальные переменные
let mediaRecorder;
let recordedChunks = [];
let recordingStartTime;
let pauseStartTime;
let totalPausedTime = 0;
let timerInterval;
let isRecording = false;
let isPaused = false;
let selectedRegion = null; // Здесь будет храниться выбранная область {x, y, width, height}
let selectionStart = null;
let currentStream;
let audioContext;
let micGainNode;
let micVolume = 1.0; // По умолчанию громкость 100%

// Переменные для настроек
let recordFormat = 'video/webm;codecs=vp9,opus'; // Формат записи по умолчанию
let includeSystemAudio = false; // Включать ли системные звуки (изначально false, переопределится из HTML)


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

    // Элементы модального окна настроек
    const settingsModal = document.getElementById('settingsModal');
    const closeButton = settingsModal.querySelector('.close-button');
    const recordFormatSelect = document.getElementById('recordFormat');
    const includeSystemAudioCheckbox = document.getElementById('includeSystemAudio');


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
    });

    // Обработчик изменения источника видео для выбора области
    videoSourceSelect.addEventListener('change', function() {
        if (this.value === 'region') {
            // Скрываем выбор разрешения и FPS при выборе области
            resolutionSelect.disabled = true;
            fpsSelect.disabled = true;
            customResolutionDiv.style.display = 'none'; // Скрываем пользовательское разрешение
            showRegionSelectionOverlay(); // Показываем оверлей для выбора области
        } else {
             // Включаем выбор разрешения и FPS, если выбрано не "region"
            resolutionSelect.disabled = false;
            fpsSelect.disabled = false;
             if (resolutionSelect.value === 'custom') {
                customResolutionDiv.style.display = 'block';
            }
             // Сбрасываем выбранную область при смене источника видео
            selectedRegion = null;
        }
    });


    // Логика модального окна настроек
    function showSettings() {
        // Загружаем текущие настройки в модальное окно
        recordFormatSelect.value = recordFormat;
        // Синхронизируем состояние чекбокса системных звуков с выбором в аудиоисточнике
         includeSystemAudioCheckbox.checked = audioSourceSelect.value === 'system' || audioSourceSelect.value === 'both';

        settingsModal.style.display = 'block';
    }

    function hideSettings() {
        // Сохраняем настройки из модального окна
        recordFormat = recordFormatSelect.value;
        // Обновляем выбор аудиоисточника в зависимости от состояния чекбокса системных звуков
        if (includeSystemAudioCheckbox.checked) {
            if (audioSourceSelect.value === 'mic') {
                 audioSourceSelect.value = 'both'; // Если был выбран только микрофон, переключаем на микрофон + системные
            } else if (audioSourceSelect.value === 'none') {
                audioSourceSelect.value = 'system'; // Если звука не было, переключаем на системные
            }
             includeSystemAudio = true;
        } else {
             if (audioSourceSelect.value === 'system') {
                 audioSourceSelect.value = 'none'; // Если были выбраны только системные, отключаем звук
             } else if (audioSourceSelect.value === 'both') {
                audioSourceSelect.value = 'mic'; // Если были микрофон + системные, оставляем только микрофон
             }
             includeSystemAudio = false;
        }
        // Проверяем, поддерживается ли выбранный формат
        if (!MediaRecorder.isTypeSupported(recordFormat)) {
            alert(`Ваш браузер не поддерживает формат записи: ${recordFormat}. Будет использован формат по умолчанию.`);
             recordFormat = 'video/webm'; // Устанавливаем формат по умолчанию, который должен поддерживаться
             recordFormatSelect.value = recordFormat; // Обновляем выпадающий список в модальном окне
        }


        settingsModal.style.display = 'none';
    }

    // Закрытие модального окна при клике на крестик
    closeButton.addEventListener('click', hideSettings);

    // Закрытие модального окна при клике вне его
    window.addEventListener('click', function(event) {
        if (event.target === settingsModal) {
            hideSettings();
        }
    });

     // Синхронизируем состояние чекбокса системных звуков в настройках с выбором в аудиоисточнике при загрузке
     includeSystemAudioCheckbox.checked = audioSourceSelect.value === 'system' || audioSourceSelect.value === 'both';
     // Обработчик изменения чекбокса системных звуков
     includeSystemAudioCheckbox.addEventListener('change', function() {
         if (this.checked) {
             if (audioSourceSelect.value === 'mic') {
                 audioSourceSelect.value = 'both';
            } else if (audioSourceSelect.value === 'none') {
                audioSourceSelect.value = 'system';
            }
         } else {
             if (audioSourceSelect.value === 'system') {
                 audioSourceSelect.value = 'none';
             } else if (audioSourceSelect.value === 'both') {
                audioSourceSelect.value = 'mic';
             }
         }
          // Также обновляем флаг в глобальной переменной
          includeSystemAudio = this.checked;
     });


    // Инициализация UI
    updateUI();

    // --- Основные функции записи ---
    async function toggleRecording() {
        if (!isRecording) {
             if (videoSourceSelect.value === 'region' && selectedRegion === null) {
                alert("Пожалуйста, сначала выберите область для записи.");
                return;
            }
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
            // const audioSource = audioSourceSelect.value; // Теперь используем includeSystemAudio и audioSourceSelect
            const resolution = resolutionSelect.value;
            const fps = parseInt(fpsSelect.value);

            console.log("Начало процесса записи...");
            statusDisplay.textContent = 'Запрашиваем доступ к медиа...';
            statusDisplay.className = 'status pending';

            // Определяем параметры видеопотока
            let videoConstraints = {
                mediaSource: videoSource === 'screen' ? 'screen' :
                          videoSource === 'window' ? 'window' : 'window', // Для "region" также используем "window" или "screen"
                 frameRate: { ideal: fps, max: 60 }
            };

            // Определяем параметры разрешения в зависимости от выбора
            if (videoSource === 'region' && selectedRegion) {
                 // Для записи области используем выбранные размеры
                 videoConstraints.width = { ideal: selectedRegion.width };
                 videoConstraints.height = { ideal: selectedRegion.height };
                 // Экспериментальная опция cropTo (может не поддерживаться)
                  videoConstraints.cropTo = {
                     x: selectedRegion.x,
                     y: selectedRegion.y,
                     width: selectedRegion.width,
                     height: selectedRegion.height
                  };

            } else if (resolution === 'custom') {
                const customWidth = parseInt(customWidthInput.value);
                const customHeight = parseInt(customHeightInput.value);
                if (isNaN(customWidth) || isNaN(customHeight) || customWidth <= 0 || customHeight <= 0) {
                    alert('Пожалуйста, введите корректные значения для пользовательского разрешения.');
                    statusDisplay.textContent = 'Ошибка: некорректное пользовательское разрешение';
                    statusDisplay.className = 'status error';
                    updateUI();
                    return;
                }
                videoConstraints.width = { ideal: customWidth };
                videoConstraints.height = { ideal: customHeight };
            } else {
                switch(resolution) {
                    case '3840x2160': // 4K
                        videoConstraints.width = { ideal: 3840 };
                        videoConstraints.height = { ideal: 2160 };
                        break;
                    case '2560x1440': // 2K
                        videoConstraints.width = { ideal: 2560 };
                        videoConstraints.height = { ideal: 1440 };
                        break;
                    case '1920x1080': // Full HD
                        videoConstraints.width = { ideal: 1920 };
                        videoConstraints.height = { ideal: 1080 };
                        break;
                    case '1280x720': // HD
                        videoConstraints.width = { ideal: 1280 };
                        videoConstraints.height = { ideal: 720 };
                        break;
                    default: // По умолчанию Full HD
                        videoConstraints.width = { ideal: 1920 };
                        videoConstraints.height = { ideal: 1080 };
                }
            }

             // Определяем аудио констрейнты в зависимости от выбранного аудио источника
             let audioConstraints = false;
             if (audioSourceSelect.value === 'system' || audioSourceSelect.value === 'both') {
                audioConstraints = true; // Запрашиваем системные звуки
             }


            const displayMediaConstraints = {
                video: videoConstraints,
                 audio: audioConstraints // Используем определенные аудио констрейнты
            };


            console.log("Запрашиваем доступ к медиа с параметрами:", displayMediaConstraints);
            const screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaConstraints)
                .catch(err => {
                    console.error("Ошибка getDisplayMedia:", err);
                    throw err;
                });

             // Проверяем успешность получения видеодорожки
             const videoTracks = screenStream.getVideoTracks();
             if (videoTracks.length === 0) {
                 throw new Error("Не удалось получить видеодорожку.");
            }

            // Добавляем обработчик для отслеживания состояния видеодорожки
            videoTracks[0].addEventListener('ended', () => {
                console.log("Видеодорожка завершена");
                stopRecording();
            });


            // 2. Получаем аудиопоток с микрофона, если нужно
            let micStream = null;
            if ((audioSourceSelect.value === 'mic' || audioSourceSelect.value === 'both') && navigator.mediaDevices.getUserMedia) {
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
                         // Если системные звуки не включены, останавливаем запись
                        if (audioSourceSelect.value === 'mic') {
                            stopRecording();
                        }
                    });
                } catch (audioError) {
                    console.warn("Не удалось получить доступ к микрофону:", audioError);
                     // Если был выбран только микрофон, выбрасываем ошибку
                    if (audioSourceSelect.value === 'mic') {
                        throw audioError;
                    }
                }
            }

            // 3. Создаем объединенный поток
            const combinedStream = new MediaStream();
            // Добавляем видеодорожку
            combinedStream.addTrack(videoTracks[0]); // Используем полученную видеодорожку

            // Добавляем аудиодорожки микрофона (если есть)
            if (micStream) {
                micStream.getAudioTracks().forEach(track => {
                    combinedStream.addTrack(track);
                });
            }

            // Добавляем системные звуки (если есть и запрошены)
            if ((audioSourceSelect.value === 'system' || audioSourceSelect.value === 'both') && screenStream.getAudioTracks().length > 0) {
                screenStream.getAudioTracks().forEach(track => {
                    combinedStream.addTrack(track);
                    track.addEventListener('ended', () => {
                        console.log("Аудиодорожка системных звуков завершена");
                        // Если включены только системные звуки, останавливаем запись
                        if (audioSourceSelect.value === 'system') {
                            stopRecording();
                        }
                    });
                });
            } else if ((audioSourceSelect.value === 'system' || audioSourceSelect.value === 'both') && screenStream.getAudioTracks().length === 0) {
                 console.warn("Системные звуки запрошены, но не получены.");
                 // Если системные звуки запрошены, но не получены, и нет микрофона, выдаем предупреждение или ошибку
                 if (audioSourceSelect.value === 'system' || (audioSourceSelect.value === 'both' && !micStream)) {
                     alert("Не удалось получить доступ к системным звукам. Запись будет без звука или только с микрофона.");
                     // Можно обновить статус или аудиоисточник в UI
                 }
            }


            // Проверяем, что есть хотя бы одна активная дорожка
            if (combinedStream.getTracks().length === 0) {
                throw new Error("Нет активных дорожек для записи");
            }

            console.log("Дорожки в объединенном потоке:");
            console.log("Видео:", combinedStream.getVideoTracks());
            console.log("Аудио:", combinedStream.getAudioTracks());


            // 4. Проверяем поддерживаемые форматы
            // const mimeType = [
            //     'video/webm;codecs=vp9,opus',
            //     'video/webm;codecs=vp8,opus',
            //     'video/webm'
            // ].find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
             // Используем формат, выбранный в настройках
            const mimeType = MediaRecorder.isTypeSupported(recordFormat) ? recordFormat : 'video/webm';
            if (mimeType !== recordFormat) {
                 console.warn(`Выбранный формат ${recordFormat} не поддерживается, используется ${mimeType}.`);
            }
            console.log(`Используем MIME type: ${mimeType}`);


            // 5. Создаем MediaRecorder
            recordedChunks = [];
            mediaRecorder = new MediaRecorder(combinedStream, {
                mimeType: mimeType,
                 // Битрейт видео может зависеть от выбранной области или разрешения
                videoBitsPerSecond: (videoSource === 'region' && selectedRegion) ?
                                     (selectedRegion.width * selectedRegion.height * fps / 10) : // Примерный расчет битрейта для области
                                     (resolution === '3840x2160' ? 10000000 :
                                      resolution === '2560x1440' ? 5000000 :
                                      2500000),
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
                    selectedRegion = null; // Сбрасываем выбранную область
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
            selectedRegion = null; // Сбрасываем выбранную область при ошибке
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
        selectedRegion = null; // Сбрасываем выбранную область
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

        videoSourceSelect.disabled = isActivelyRecording;
        // Отключаем разрешение и FPS только при активной записи или когда выбран режим "region"
        resolutionSelect.disabled = isActivelyRecording || videoSourceSelect.value === 'region';
        fpsSelect.disabled = isActivelyRecording || videoSourceSelect.value === 'region';
        audioSourceSelect.disabled = isActivelyRecording;
        volumeSlider.disabled = isActivelyRecording;
        // Отключаем поля пользовательского разрешения
        customWidthInput.disabled = isActivelyRecording || resolutionSelect.value !== 'custom' || videoSourceSelect.value === 'region';
        customHeightInput.disabled = isActivelyRecording || resolutionSelect.value !== 'custom' || videoSourceSelect.value === 'region';

        // Отключаем кнопку настроек во время записи
        btnSettings.disabled = isActivelyRecording;


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
        statusDisplay.textContent = 'Выберите область для записи...';
        statusDisplay.className = 'status selecting-region';
    }

    function startRegionSelection(e) {
        if (e.target !== regionOverlay) return;
        selectionStart = { x: e.clientX, y: e.clientY };
        selectionRectangle.style.left = `${e.clientX}px`;
        selectionRectangle.style.top = `${e.clientY}px`;
        selectionRectangle.style.width = '0px';
        selectionRectangle.style.height = '0px';
        selectionRectangle.style.display = 'block'; // Показываем прямоугольник
    }

    function updateRegionSelection(e) {
        if (!selectionStart) return;
        const width = Math.abs(e.clientX - selectionStart.x);
        const height = Math.abs(e.clientY - selectionStart.y);
        const left = Math.min(e.clientX, selectionStart.x);
        const top = Math.min(e.clientY, selectionStart.y);

        // Ограничиваем размеры прямоугольника пределами оверлея (экрана)
        const maxLeft = window.innerWidth - width;
        const maxTop = window.innerHeight - height;

        selectionRectangle.style.left = `${Math.max(0, Math.min(left, maxLeft))}px`;
        selectionRectangle.style.top = `${Math.max(0, Math.min(top, maxTop))}px`;
        selectionRectangle.style.width = `${width}px`;
        selectionRectangle.style.height = `${height}px`;
    }

    function endRegionSelection(e) {
        if (!selectionStart) return;

        const finalX = Math.min(e.clientX, selectionStart.x);
        const finalY = Math.min(e.clientY, selectionStart.y);
        const finalWidth = Math.abs(e.clientX - selectionStart.x);
        const finalHeight = Math.abs(e.clientY - selectionStart.y);

        if (finalWidth > 10 && finalHeight > 10) { // Проверяем, что область достаточно большая
            selectedRegion = {
                x: finalX,
                y: finalY,
                width: finalWidth,
                height: finalHeight
            };
            console.log(`Выбрана область: ${finalWidth}x${finalHeight} at (${selectedRegion.x},${selectedRegion.y}).`);
            statusDisplay.textContent = `Выбрана область: ${finalWidth}x${finalHeight}`;
            statusDisplay.className = 'status ready';

        } else {
            alert("Выбранная область слишком мала.");
            selectedRegion = null; // Сбрасываем выбранную область
            statusDisplay.textContent = 'Выбор области отменен';
            statusDisplay.className = 'status ready';
        }

        selectionStart = null;
        regionOverlay.style.display = 'none';
        selectionRectangle.style.display = 'none'; // Скрываем прямоугольник после выбора
        selectionRectangle.style.width = '0px'; // Сбрасываем размеры прямоугольника
        selectionRectangle.style.height = '0px';
         updateUI(); // Обновляем UI после выбора области
    }


    regionOverlay.addEventListener('mousedown', startRegionSelection);
    regionOverlay.addEventListener('mousemove', updateRegionSelection);
    regionOverlay.addEventListener('mouseup', endRegionSelection);

    // Добавляем обработчик для отмены выбора области по клавише Esc
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && regionOverlay.style.display === 'block') {
            e.preventDefault();
            regionOverlay.style.display = 'none';
            selectionRectangle.style.display = 'none'; // Скрываем прямоугольник
            selectionStart = null;
            selectedRegion = null; // Сбрасываем выбранную область при отмене
            statusDisplay.textContent = 'Выбор области отменен';
            statusDisplay.className = 'status ready';
            videoSourceSelect.value = 'screen'; // Возвращаем источник на "Весь экран"
             updateUI(); // Обновляем UI после отмены
        }
    });


    // function showSettings() {
    //     alert("Настройки пока не реализованы.");
    // } // Эта функция теперь реализована выше

    function showHelp() {
        alert("Справка по Веб-рекордеру экрана\n\n" +
            "1. Выберите источник видео (Весь экран, Окно приложения или Произвольная область).\n" +
            "   - Если выбрана Произвольная область, нарисуйте прямоугольник на экране для выбора области записи.\n" +
            "2. Выберите разрешение и частоту кадров (для режимов Весь экран и Окно приложения), либо выберите 'Пользовательское' и введите свои значения.\n" +
            "3. Выберите источник звука (микрофон или без звука). Перемещайте ползунок для настройки громкости микрофона.\n" +
            "4. Нажмите 'Начать запись' или Alt+R. Появится диалог выбора источника от браузера - выберите и подтвердите.\n" +
            "5. Для паузы нажмите 'Пауза записи' или Alt+S\n" +
            "6. Для остановки нажмите 'Остановить запись' или Alt+T. Файл будет автоматически скачан.\n\n" +
            "Примечание: Запись системных звуков через стандартные веб-API ненадежна и может не работать. Запись произвольной области может работать не идеально в некоторых браузерах из-за ограничений API.");
    }

    function handleHotkeys(e) {
        // Игнорируем горячие клавиши, если фокус находится на поле ввода или если оверлей выбора области активен
        const activeElement = document.activeElement;
        if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'SELECT' || activeElement.tagName === 'TEXTAREA' || regionOverlay.style.display === 'block' || settingsModal.style.display === 'block') {
            return;
        }

        if (e.altKey) {
            e.preventDefault(); // Предотвращаем стандартное поведение браузера
            switch(e.code) {
                case 'KeyR': // Alt+R - Начать/Продолжить запись
                     // Проверяем выбран ли режим "region" и выбрана ли область
                     if (videoSourceSelect.value === 'region' && selectedRegion === null) {
                        alert("Пожалуйста, сначала выберите область для записи.");
                        return;
                     }
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
        }
        // Обработка Esc для закрытия оверлея выбора области уже добавлена отдельно
         // Добавляем обработку Esc для закрытия модального окна настроек
         if (e.key === 'Escape' && settingsModal.style.display === 'block') {
             e.preventDefault();
             hideSettings();
         }
    }


    // Изначально скрываем customResolutionDiv, если выбрано не 'custom'
     if (resolutionSelect.value !== 'custom') {
        customResolutionDiv.style.display = 'none';
    }

});