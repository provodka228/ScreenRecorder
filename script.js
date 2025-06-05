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
let videoBitrate = 2500000; // Битрейт видео по умолчанию (2.5 Mbps)
let audioBitrate = 128000; // Битрейт аудио по умолчанию (128 Kbps)
let includeSystemAudio = false; // Включать ли системные звуки (изначально false, переопределится из HTML)
let showMouseClicks = true; // Показывать ли клики мыши (по умолчанию true)
let countdownDuration = 3; // Длительность обратного отсчета в секундах (по умолчанию 3)

// Переменные для индикатора уровня звука
let analyser;
let dataArray;
let audioLevelInterval;


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
    // Добавлены элементы индикатора уровня звука
    const audioLevelIndicator = document.getElementById('audioLevelIndicator');
    const audioLevelBar = document.getElementById('audioLevelBar');
    const timerDisplay = document.getElementById('timer');
    const statusDisplay = document.getElementById('status');
    const previewVideo = document.getElementById('preview');
    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');
    const btnSettings = document.getElementById('btnSettings');
    const btnHelp = document.getElementById('btnHelp');
    const regionOverlay = document.getElementById('regionSelectionOverlay');
    const selectionRectangle = document.getElementById('selectionRectangle');
    // Элемент для таймера обратного отсчета
    const countdownTimerDisplay = document.getElementById('countdownTimer');
    // Контейнер для визуализации кликов
    const clickVisualizationsContainer = document.getElementById('clickVisualizations');


    // Добавлены элементы для пользовательского разрешения
    const customResolutionDiv = document.getElementById('customResolutionDiv');
    const customWidthInput = document.getElementById('customWidth');
    const customHeightInput = document.getElementById('customHeight');

    // Элементы модального окна настроек
    const settingsModal = document.getElementById('settingsModal');
    const closeButton = settingsModal.querySelector('.close-button');
    const recordFormatSelect = document.getElementById('recordFormat');
    const videoBitrateSelect = document.getElementById('videoBitrate'); // Элемент для битрейта видео
    const audioBitrateSelect = document.getElementById('audioBitrate'); // Элемент для битрейта аудио
    const includeSystemAudioCheckbox = document.getElementById('includeSystemAudio');
    const showMouseClicksCheckbox = document.getElementById('showMouseClicks'); // Элемент для показа кликов
    const countdownDurationSelect = document.getElementById('countdownDuration'); // Элемент для длительности отсчета


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
    btnSettings.addEventListener('click', toggleSettingsModal); // Изменено на переключение модального окна
    btnHelp.addEventListener('click', showHelp);
    document.addEventListener('keydown', handleHotkeys);
    // Слушатель для визуализации кликов (добавляем на весь документ)
    document.addEventListener('click', handleMouseClick);


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
    function toggleSettingsModal() {
        if (settingsModal.style.display === 'block') {
            hideSettings();
        } else {
            showSettings();
        }
    }

    function showSettings() {
        // Загружаем текущие настройки в модальное окно
        recordFormatSelect.value = recordFormat;
        videoBitrateSelect.value = videoBitrate.toString(); // Загружаем выбранный битрейт видео
        audioBitrateSelect.value = audioBitrate.toString(); // Загружаем выбранный битрейт аудио
        // Синхронизируем состояние чекбокса системных звуков с выбором в аудиоисточнике
         includeSystemAudioCheckbox.checked = audioSourceSelect.value === 'system' || audioSourceSelect.value === 'both';
         showMouseClicksCheckbox.checked = showMouseClicks; // Загружаем состояние показа кликов
         countdownDurationSelect.value = countdownDuration.toString(); // Загружаем длительность отсчета


        settingsModal.style.display = 'block';
    }

    function hideSettings() {
        // Сохраняем настройки из модального окна
        recordFormat = recordFormatSelect.value;
         videoBitrate = parseInt(videoBitrateSelect.value); // Сохраняем выбранный битрейт видео
         audioBitrate = parseInt(audioBitrateSelect.value); // Сохраняем выбранный битрейт аудио
         showMouseClicks = showMouseClicksCheckbox.checked; // Сохраняем состояние показа кликов
         countdownDuration = parseInt(countdownDurationSelect.value); // Сохраняем длительность отсчета


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
            console.warn(`Выбранный формат записи: ${recordFormat} не поддерживается. Будет использован формат по умолчанию.`);
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
             // Логика обратного отсчета перенесена в startRecording
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
                     // Если пользователь отменил выбор или произошла ошибка до получения потока, возвращаемся в исходное состояние
                     statusDisplay.textContent = 'Отменено или ошибка при выборе источника';
                     statusDisplay.className = 'status ready';
                     updateUI();
                    throw err; // Перебрасываем ошибку для обработки в catch
                });

             // --- НАЧИНАЕМ ОБРАТНЫЙ ОТСЧЕТ ЗДЕСЬ, ПОСЛЕ УСПЕШНОГО ПОЛУЧЕНИЯ ПОТОКА ---
             if (countdownDuration > 0) {
                 startCountdown(screenStream, resolution, fps, videoSource, selectedRegion); // Передаем поток и другие параметры
                 return; // Останавливаем выполнение startRecording до завершения отсчета
             }
             // --- КОНЕЦ ЛОГИКИ ОБРАТНОГО ОТСЧЕТА ---


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

                    // Подключаем анализатор для визуализации уровня звука
                    analyser = audioContext.createAnalyser();
                    analyser.fftSize = 256; // Размер FFT
                    const bufferLength = analyser.frequencyBinCount;
                    dataArray = new Uint8Array(bufferLength);

                    micSource.connect(micGainNode);
                    micGainNode.connect(analyser); // Подключаем GainNode к AnalyserNode
                    analyser.connect(audioContext.destination); // Подключаем AnalyserNode к выходному узлу AudioContext

                    // Создаем пункт назначения для обработанного аудио для MediaRecorder
                    const dest = audioContext.createMediaStreamDestination();
                    micGainNode.connect(dest); // Подключаем GainNode к MediaStreamDestination

                    // Используем обработанный поток из MediaStreamDestination
                    micStream = dest.stream;


                    // Запускаем обновление индикатора уровня звука
                    startAudioLevelUpdate();


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
                 // Если не удалось получить ни видео, ни аудио, выдаем ошибку
                 if (!(audioSourceSelect.value === 'mic' || audioSourceSelect.value === 'both') || !micStream) { // Проверяем, был ли запрошен микрофон и получен ли поток
                      throw new Error("Нет активных дорожек для записи. Пожалуйста, выберите источник видео или аудио.");
                 }
                 // Если есть только аудиодорожка с микрофона, но нет видеодорожки, это тоже ошибка для записи экрана
                 if (micStream && combinedStream.getVideoTracks().length === 0) {
                     throw new Error("Не удалось получить видеодорожку. Запись только звука не поддерживается.");
                 }
                 // Если есть только системные звуки, но нет видеодорожки и микрофона
                 if (combinedStream.getAudioTracks().length > 0 && combinedStream.getVideoTracks().length === 0 && !micStream) {
                     throw new Error("Не удалось получить видеодорожку. Запись только системных звуков не поддерживается.");
                 }
            }


            console.log("Дорожки в объединенном потоке:");
            console.log("Видео:", combinedStream.getVideoTracks());
            console.log("Аудио:", combinedStream.getAudioTracks());


            // 4. Проверяем поддерживаемые форматы
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
                 // Битрейт видео берем из настроек, если не "Авто", иначе примерный расчет или значение по умолчанию
                videoBitsPerSecond: videoBitrate > 0 ? videoBitrate :
                                     (videoSource === 'region' && selectedRegion) ?
                                     (selectedRegion.width * selectedRegion.height * fps * 0.1) : // Примерный расчет для области
                                     (resolution === '3840x2160' ? 10000000 :
                                      resolution === '2560x1440' ? 5000000 :
                                      2500000),
                audioBitsPerSecond: audioBitrate // Битрейт аудио из настроек
            });

            mediaRecorder.ondataavailable = event => {
                if (event.data && event.data.size > 0) {
                    recordedChunks.push(event.data);
                    console.log(`Получен фрагмент данных (${event.data.size} байт)`);
                }
            };

            mediaRecorder.onstop = async () => {
                console.log("Запись остановлена. Всего фрагментов:", recordedChunks.length);
                 // Останавливаем обновление индикатора уровня звука
                stopAudioLevelUpdate();
                 // Скрываем контейнер для визуализации кликов
                clickVisualizationsContainer.style.display = 'none';


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
                         // Заново инициализируем AudioContext для будущих записей
                         audioContext = new (window.AudioContext || window.webkitAudioContext)();
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

             // Показываем контейнер для визуализации кликов при старте записи
            if (showMouseClicks) {
                 clickVisualizationsContainer.style.display = 'block';
            }


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
                 // Заново инициализируем AudioContext
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            currentStream = null;
            recordedChunks = [];
            selectedRegion = null; // Сбрасываем выбранную область при ошибке
             // Скрываем таймер обратного отсчета при ошибке
             countdownTimerDisplay.style.display = 'none';
             countdownTimerDisplay.textContent = '';
             // Скрываем контейнер для визуализации кликов
             clickVisualizationsContainer.style.display = 'none';
             // Останавливаем обновление индикатора уровня звука
             stopAudioLevelUpdate();


            updateUI();
        }
    }

    function pauseRecording() {
        if (!isRecording || isPaused) return;
        console.log("Приостановка записи...");
        isPaused = true;
        pauseStartTime = Date.now();
        clearInterval(timerInterval);
         // Останавливаем обновление индикатора уровня звука при паузе
        stopAudioLevelUpdate();


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
         // Возобновляем обновление индикатора уровня звука при возобновлении
        startAudioLevelUpdate();

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
         // Останавливаем обновление индикатора уровня звука
        stopAudioLevelUpdate();
         // Скрываем контейнер для визуализации кликов
        clickVisualizationsContainer.style.display = 'none';


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
             // Заново инициализируем AudioContext
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        currentStream = null;
        recordedChunks = [];
        selectedRegion = null; // Сбрасываем выбранную область
        timerDisplay.textContent = '00:00:00';
        statusDisplay.textContent = 'Готов к записи';
        statusDisplay.className = 'status ready';
        previewVideo.style.display = 'none';
         // Очищаем контейнер для визуализации кликов
        clickVisualizationsContainer.innerHTML = '';

         // Сбрасываем индикатор уровня звука
         if (audioLevelBar) {
             audioLevelBar.style.width = '0%';
         }
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

        // Скрываем индикатор уровня звука, если аудиоисточник не микрофон
        if (audioSourceSelect.value === 'mic' || audioSourceSelect.value === 'both') {
             audioLevelIndicator.style.display = 'inline-block';
        } else {
             audioLevelIndicator.style.display = 'none';
        }


        if (statusDisplay.className !== 'status pending' && statusDisplay.className !== 'status error' && statusDisplay.className !== 'status selecting-region' && countdownTimerDisplay.style.display !== 'block') {
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

    // Функции таймера обратного отсчета
    async function startCountdown(stream, resolution, fps, videoSource, selectedRegion) {
        // Показываем таймер и скрываем другие элементы управления, которые могут мешать
        countdownTimerDisplay.style.display = 'block';
        btnStart.disabled = true;
        btnStop.disabled = true;
        btnSettings.disabled = true;
        btnHelp.disabled = true;

        let timeLeft = countdownDuration;
        countdownTimerDisplay.textContent = timeLeft;

        const countdownInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft > 0) {
                countdownTimerDisplay.textContent = timeLeft;
            } else {
                clearInterval(countdownInterval);
                 // Возобновляем доступ к кнопкам (кроме btnStart)
                 btnStart.disabled = false; // Разблокируем кнопку старта для возможности паузы/продолжения
                 btnStop.disabled = false;
                 btnSettings.disabled = false;
                 btnHelp.disabled = false;

                // Начинаем запись после отсчета, используя полученный поток и параметры
                actuallyStartRecording(stream, resolution, fps, videoSource, selectedRegion);
            }
        }, 1000);
    }

    // Новая функция для фактического начала записи после отсчета
    async function actuallyStartRecording(screenStream, resolution, fps, videoSource, selectedRegion) {
        try {
            // Скрываем таймер обратного отсчета
            countdownTimerDisplay.style.display = 'none';
            countdownTimerDisplay.textContent = ''; // Очищаем текст

            console.log("Фактическое начало процесса записи...");
            statusDisplay.textContent = 'Идет запись...'; // Обновляем статус
            statusDisplay.className = 'status recording';

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

                    // Подключаем анализатор для визуализации уровня звука
                    analyser = audioContext.createAnalyser();
                    analyser.fftSize = 256; // Размер FFT
                    const bufferLength = analyser.frequencyBinCount;
                    dataArray = new Uint8Array(bufferLength);

                    micSource.connect(micGainNode);
                    micGainNode.connect(analyser); // Подключаем GainNode к AnalyserNode
                    analyser.connect(audioContext.destination); // Подключаем AnalyserNode к выходному узлу AudioContext

                    // Создаем пункт назначения для обработанного аудио для MediaRecorder
                    const dest = audioContext.createMediaStreamDestination();
                    micGainNode.connect(dest); // Подключаем GainNode к MediaStreamDestination

                    // Используем обработанный поток из MediaStreamDestination
                    micStream = dest.stream;


                    // Запускаем обновление индикатора уровня звука
                    startAudioLevelUpdate();


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
                 // Если не удалось получить ни видео, ни аудио, выдаем ошибку
                 if (!(audioSourceSelect.value === 'mic' || audioSourceSelect.value === 'both') || !micStream) { // Проверяем, был ли запрошен микрофон и получен ли поток
                      throw new Error("Нет активных дорожек для записи. Пожалуйста, выберите источник видео или аудио.");
                 }
                 // Если есть только аудиодорожка с микрофона, но нет видеодорожки, это тоже ошибка для записи экрана
                 if (micStream && combinedStream.getVideoTracks().length === 0) {
                     throw new Error("Не удалось получить видеодорожку. Запись только звука не поддерживается.");
                 }
                 // Если есть только системные звуки, но нет видеодорожки и микрофона
                 if (combinedStream.getAudioTracks().length > 0 && combinedStream.getVideoTracks().length === 0 && !micStream) {
                     throw new Error("Не удалось получить видеодорожку. Запись только системных звуков не поддерживается.");
                 }
            }


            console.log("Дорожки в объединенном потоке:");
            console.log("Видео:", combinedStream.getVideoTracks());
            console.log("Аудио:", combinedStream.getAudioTracks());


            // 4. Проверяем поддерживаемые форматы
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
                 // Битрейт видео берем из настроек, если не "Авто", иначе примерный расчет или значение по умолчанию
                videoBitsPerSecond: videoBitrate > 0 ? videoBitrate :
                                     (videoSource === 'region' && selectedRegion) ?
                                     (selectedRegion.width * selectedRegion.height * fps * 0.1) : // Примерный расчет для области
                                     (resolution === '3840x2160' ? 10000000 :
                                      resolution === '2560x1440' ? 5000000 :
                                      2500000),
                audioBitsPerSecond: audioBitrate // Битрейт аудио из настроек
            });

            mediaRecorder.ondataavailable = event => {
                if (event.data && event.data.size > 0) {
                    recordedChunks.push(event.data);
                    console.log(`Получен фрагмент данных (${event.data.size} байт)`);
                }
            };

            mediaRecorder.onstop = async () => {
                console.log("Запись остановлена. Всего фрагментов:", recordedChunks.length);
                 // Останавливаем обновление индикатора уровня звука
                stopAudioLevelUpdate();
                 // Скрываем контейнер для визуализации кликов
                clickVisualizationsContainer.style.display = 'none';


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
                         // Заново инициализируем AudioContext для будущих записей
                         audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
            // statusDisplay.textContent = 'Идет запись...'; // Статус уже обновлен выше
            // statusDisplay.className = 'status recording';
            console.log("Запись успешно начата");

             // Показываем контейнер для визуализации кликов при старте записи
            if (showMouseClicks) {
                 clickVisualizationsContainer.style.display = 'block';
            }


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
                 // Заново инициализируем AudioContext
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            currentStream = null;
            recordedChunks = [];
            selectedRegion = null; // Сбрасываем выбранную область при ошибке
             // Скрываем таймер обратного отсчета при ошибке
             countdownTimerDisplay.style.display = 'none';
             countdownTimerDisplay.textContent = '';
             // Скрываем контейнер для визуализации кликов
             clickVisualizationsContainer.style.display = 'none';
             // Останавливаем обновление индикатора уровня звука
             stopAudioLevelUpdate();


            updateUI();
        }
    }

    function pauseRecording() {
        if (!isRecording || isPaused) return;
        console.log("Приостановка записи...");
        isPaused = true;
        pauseStartTime = Date.now();
        clearInterval(timerInterval);
         // Останавливаем обновление индикатора уровня звука при паузе
        stopAudioLevelUpdate();


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
         // Возобновляем обновление индикатора уровня звука при возобновлении
        startAudioLevelUpdate();

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
         // Останавливаем обновление индикатора уровня звука
        stopAudioLevelUpdate();
         // Скрываем контейнер для визуализации кликов
        clickVisualizationsContainer.style.display = 'none';


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
             // Заново инициализируем AudioContext
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        currentStream = null;
        recordedChunks = [];
        selectedRegion = null; // Сбрасываем выбранную область
        timerDisplay.textContent = '00:00:00';
        statusDisplay.textContent = 'Готов к записи';
        statusDisplay.className = 'status ready';
        previewVideo.style.display = 'none';
         // Очищаем контейнер для визуализации кликов
        clickVisualizationsContainer.innerHTML = '';

         // Сбрасываем индикатор уровня звука
         if (audioLevelBar) {
             audioLevelBar.style.width = '0%';
         }
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

        // Скрываем индикатор уровня звука, если аудиоисточник не микрофон
        if (audioSourceSelect.value === 'mic' || audioSourceSelect.value === 'both') {
             audioLevelIndicator.style.display = 'inline-block';
        } else {
             audioLevelIndicator.style.display = 'none';
        }


        if (statusDisplay.className !== 'status pending' && statusDisplay.className !== 'status error' && statusDisplay.className !== 'status selecting-region' && countdownTimerDisplay.style.display !== 'block') {
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

    // Функции таймера обратного отсчета
    async function startCountdown(stream, resolution, fps, videoSource, selectedRegion) {
        // Показываем таймер и скрываем другие элементы управления, которые могут мешать
        countdownTimerDisplay.style.display = 'block';
         // Скрываем основной интерфейс, оставляя только таймер и возможно контейнер для кликов
         document.querySelector('.container').style.display = 'none';


        let timeLeft = countdownDuration;
        countdownTimerDisplay.textContent = timeLeft;

        const countdownInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft > 0) {
                countdownTimerDisplay.textContent = timeLeft;
            } else {
                clearInterval(countdownInterval);
                 // Показываем основной интерфейс обратно
                document.querySelector('.container').style.display = 'block';
                 // Скрываем таймер (будет скрыт в actuallyStartRecording)

                // Начинаем запись после отсчета, используя полученный поток и параметры
                actuallyStartRecording(stream, resolution, fps, videoSource, selectedRegion);
            }
        }, 1000);
    }

    // Новая функция для фактического начала записи после отсчета
    async function actuallyStartRecording(screenStream, resolution, fps, videoSource, selectedRegion) {
        try {
            // Скрываем таймер обратного отсчета
            countdownTimerDisplay.style.display = 'none';
            countdownTimerDisplay.textContent = ''; // Очищаем текст

            console.log("Фактическое начало процесса записи...");
            statusDisplay.textContent = 'Идет запись...'; // Обновляем статус
            statusDisplay.className = 'status recording';

             // Проверяем успешность получения видеодорожки (уже проверено в startRecording)
             const videoTracks = screenStream.getVideoTracks();
             if (videoTracks.length === 0) {
                 throw new Error("Не удалось получить видеодорожку.");
            }

            // Добавляем обработчик для отслеживания состояния видеодорожки
            videoTracks[0].addEventListener('ended', () => {
                console.log("Видеодорожка завершена");
                stopRecording();
            });


            // 2. Получаем аудиопоток с микрофона, если нужно (логика перенесена из startRecording)
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

                    // Подключаем анализатор для визуализации уровня звука
                    analyser = audioContext.createAnalyser();
                    analyser.fftSize = 256; // Размер FFT
                    const bufferLength = analyser.frequencyBinCount;
                    dataArray = new Uint8Array(bufferLength);

                    micSource.connect(micGainNode);
                    micGainNode.connect(analyser); // Подключаем GainNode к AnalyserNode
                    analyser.connect(audioContext.destination); // Подключаем AnalyserNode к выходному узлу AudioContext

                    // Создаем пункт назначения для обработанного аудио для MediaRecorder
                    const dest = audioContext.createMediaStreamDestination();
                    micGainNode.connect(dest); // Подключаем GainNode к MediaStreamDestination

                    // Используем обработанный поток из MediaStreamDestination
                    micStream = dest.stream;


                    // Запускаем обновление индикатора уровня звука
                    startAudioLevelUpdate();


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

            // 3. Создаем объединенный поток (логика перенесена из startRecording)
            const combinedStream = new MediaStream();
            // Добавляем видеодорожку
            combinedStream.addTrack(screenStream.getVideoTracks()[0]); // Используем полученную видеодорожку

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

            // Проверяем, что есть хотя бы одна активная дорожка (логика перенесена)
            if (combinedStream.getTracks().length === 0) {
                 // Если не удалось получить ни видео, ни аудио, выдаем ошибку
                 if (!(audioSourceSelect.value === 'mic' || audioSourceSelect.value === 'both') || !micStream) { // Проверяем, был ли запрошен микрофон и получен ли поток
                      throw new Error("Нет активных дорожек для записи. Пожалуйста, выберите источник видео или аудио.");
                 }
                 // Если есть только аудиодорожка с микрофона, но нет видеодорожки, это тоже ошибка для записи экрана
                 if (micStream && combinedStream.getVideoTracks().length === 0) {
                     throw new Error("Не удалось получить видеодорожку. Запись только звука не поддерживается.");
                 }
                 // Если есть только системные звуки, но нет видеодорожки и микрофона
                 if (combinedStream.getAudioTracks().length > 0 && combinedStream.getVideoTracks().length === 0 && !micStream) {
                     throw new Error("Не удалось получить видеодорожку. Запись только системных звуков не поддерживается.");
                 }
            }


            console.log("Дорожки в объединенном потоке:");
            console.log("Видео:", combinedStream.getVideoTracks());
            console.log("Аудио:", combinedStream.getAudioTracks());


            // 4. Проверяем поддерживаемые форматы (логика перенесена)
             // Используем формат, выбранный в настройках
            const mimeType = MediaRecorder.isTypeSupported(recordFormat) ? recordFormat : 'video/webm';
            if (mimeType !== recordFormat) {
                 console.warn(`Выбранный формат ${recordFormat} не поддерживается, используется ${mimeType}.`);
            }
            console.log(`Используем MIME type: ${mimeType}`);


            // 5. Создаем MediaRecorder (логика перенесена)
            recordedChunks = [];
            mediaRecorder = new MediaRecorder(combinedStream, {
                mimeType: mimeType,
                 // Битрейт видео берем из настроек, если не "Авто", иначе примерный расчет или значение по умолчанию
                videoBitsPerSecond: videoBitrate > 0 ? videoBitrate :
                                     (videoSource === 'region' && selectedRegion) ?
                                     (selectedRegion.width * selectedRegion.height * fps * 0.1) : // Примерный расчет для области
                                     (resolution === '3840x2160' ? 10000000 :
                                      resolution === '2560x1440' ? 5000000 :
                                      2500000),
                audioBitsPerSecond: audioBitrate // Битрейт аудио из настроек
            });

            mediaRecorder.ondataavailable = event => {
                if (event.data && event.data.size > 0) {
                    recordedChunks.push(event.data);
                    console.log(`Получен фрагмент данных (${event.data.size} байт)`);
                }
            };

            mediaRecorder.onstop = async () => {
                console.log("Запись остановлена. Всего фрагментов:", recordedChunks.length);
                 // Останавливаем обновление индикатора уровня звука
                stopAudioLevelUpdate();
                 // Скрываем контейнер для визуализации кликов
                clickVisualizationsContainer.style.display = 'none';


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
                         // Заново инициализируем AudioContext для будущих записей
                         audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
            // statusDisplay.textContent = 'Идет запись...'; // Статус уже обновлен выше
            // statusDisplay.className = 'status recording';
            console.log("Запись успешно начата");

             // Показываем контейнер для визуализации кликов при старте записи
            if (showMouseClicks) {
                 clickVisualizationsContainer.style.display = 'block';
            }


        } catch (error) {
            console.error('Ошибка при фактическом начале записи:', error);
            // Улучшенные сообщения об ошибках
            let errorMessage = 'Ошибка при фактическом начале записи';
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
                 // Заново инициализируем AudioContext
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            currentStream = null;
            recordedChunks = [];
            selectedRegion = null; // Сбрасываем выбранную область при ошибке
             // Скрываем таймер обратного отсчета при ошибке
             countdownTimerDisplay.style.display = 'none';
             countdownTimerDisplay.textContent = '';
             // Скрываем контейнер для визуализации кликов
             clickVisualizationsContainer.style.display = 'none';
             // Останавливаем обновление индикатора уровня звука
             stopAudioLevelUpdate();


            updateUI();
        }
    }


    function pauseRecording() {
        if (!isRecording || isPaused) return;
        console.log("Приостановка записи...");
        isPaused = true;
        pauseStartTime = Date.now();
        clearInterval(timerInterval);
         // Останавливаем обновление индикатора уровня звука при паузе
        stopAudioLevelUpdate();


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
         // Возобновляем обновление индикатора уровня звука при возобновлении
        startAudioLevelUpdate();

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
         // Останавливаем обновление индикатора уровня звука
        stopAudioLevelUpdate();
         // Скрываем контейнер для визуализации кликов
        clickVisualizationsContainer.style.display = 'none';


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
             // Заново инициализируем AudioContext
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        currentStream = null;
        recordedChunks = [];
        selectedRegion = null; // Сбрасываем выбранную область
        timerDisplay.textContent = '00:00:00';
        statusDisplay.textContent = 'Готов к записи';
        statusDisplay.className = 'status ready';
        previewVideo.style.display = 'none';
         // Очищаем контейнер для визуализации кликов
        clickVisualizationsContainer.innerHTML = '';

         // Сбрасываем индикатор уровня звука
         if (audioLevelBar) {
             audioLevelBar.style.width = '0%';
         }
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

        // Отключаем кнопку настроек во время записи или обратного отсчета
        btnSettings.disabled = isActivelyRecording || countdownTimerDisplay.style.display === 'block';

        // Скрываем индикатор уровня звука, если аудиоисточник не микрофон или идет обратный отсчет
        if ((audioSourceSelect.value === 'mic' || audioSourceSelect.value === 'both') && countdownTimerDisplay.style.display !== 'block') {
             audioLevelIndicator.style.display = 'inline-block';
        } else {
             audioLevelIndicator.style.display = 'none';
        }


        if (statusDisplay.className !== 'status pending' && statusDisplay.className !== 'status error' && statusDisplay.className !== 'status selecting-region' && countdownTimerDisplay.style.display !== 'block') {
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


     // Функции визуализации кликов мыши
    function handleMouseClick(e) {
         // Визуализируем клик только если включена настройка и идет запись
        if (showMouseClicks && isRecording && !isPaused) {
            const clickIndicator = document.createElement('div');
            clickIndicator.style.position = 'fixed';
            clickIndicator.style.left = `${e.clientX - 10}px`; // Центрируем кружок по клику
            clickIndicator.style.top = `${e.clientY - 10}px`;   // Центрируем кружок по клику
            clickIndicator.style.width = '20px';
            clickIndicator.style.height = '20px';
            clickIndicator.style.borderRadius = '50%';
            clickIndicator.style.backgroundColor = 'rgba(255, 0, 0, 0.7)'; // Красный полупрозрачный кружок
            clickIndicator.style.pointerEvents = 'none'; // Важно, чтобы не перехватывал клики
            clickIndicator.style.zIndex = '10'; // Поверх других элементов

             // Добавляем простую анимацию исчезновения и масштабирования
            clickIndicator.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
            clickIndicator.style.transform = 'scale(1)'; // Начальный размер
            requestAnimationFrame(() => { // Ждем следующего кадра для начала анимации
                 clickIndicator.style.opacity = '0';
                 clickIndicator.style.transform = 'scale(1.5)'; // Увеличиваем при исчезновении
            });


            clickVisualizationsContainer.appendChild(clickIndicator);

            // Удаляем индикатор после завершения анимации
            clickIndicator.addEventListener('transitionend', () => {
                 clickVisualizationsContainer.removeChild(clickIndicator);
            });

        }
    }

     // Функции индикатора уровня звука микрофона
     function startAudioLevelUpdate() {
         // Проверяем, есть ли анализатор (он создается при получении потока микрофона)
         if (analyser && dataArray) {
              // Очищаем предыдущий интервал, если он был
             if (audioLevelInterval) {
                 clearInterval(audioLevelInterval);
             }
             audioLevelInterval = setInterval(updateAudioLevel, 100); // Обновляем каждые 100 мс
         }
     }

     function stopAudioLevelUpdate() {
         if (audioLevelInterval) {
            clearInterval(audioLevelInterval);
         }
         if (audioLevelBar) {
             audioLevelBar.style.width = '0%'; // Сбрасываем полосу при остановке
         }
     }

     function updateAudioLevel() {
         if (analyser && dataArray) {
             analyser.getByteFrequencyData(dataArray);
             // Находим максимальное значение в данных частоты (простой способ получить примерный уровень)
             let max = 0;
             for (let i = 0; i < dataArray.length; i++) {
                 if (dataArray[i] > max) {
                     max = dataArray[i];
                 }
             }
             // Масштабируем значение от 0-255 до 0-100%
             const level = Math.min(100, Math.max(0, max * (100 / 255)));

             if (audioLevelBar) {
                 audioLevelBar.style.width = `${level}%`;
                 // Можно добавить изменение цвета в зависимости от уровня
                 if (level > 75) {
                    audioLevelBar.style.backgroundColor = 'red';
                 } else if (level > 40) {
                     audioLevelBar.style.backgroundColor = 'orange';
                 } else {
                     audioLevelBar.style.backgroundColor = 'green';
                 }
             }
         }
     }


    function showHelp() {
        alert("Справка по Веб-рекордеру экрана\n\n" +
            "1. Выберите источник видео (Весь экран, Окно приложения или Произвольная область).\n" +
            "   - Если выбрана Произвольная область, нарисуйте прямоугольник на экране для выбора области записи.\n" +
            "2. Выберите разрешение и частоту кадров (для режимов Весь экран и Окно приложения), либо выберите 'Пользовательское' и введите свои значения.\n" +
            "3. Выберите источник звука (микрофон или без звука). Перемещайте ползунок для настройки громкости микрофона. Рядом отображается визуальный индикатор уровня звука.\n" +
            "4. Нажмите 'Начать запись' или Alt+R. Если включен таймер обратного отсчета в настройках, начнется отсчет после выбора окна/экрана.\n" +
            "5. Для паузы нажмите 'Пауза записи' или Alt+S\n" +
            "6. Для остановки нажмите 'Остановить запись' или Alt+T. Файл будет автоматически скачан.\n" +
             "7. В 'Настройках' можно изменить формат записи, битрейт видео и аудио, включить/отключить системные звуки и визуализацию кликов мыши, а также настроить таймер обратного отсчета.\n\n" +
            "Примечание: Запись системных звуков через стандартные веб-API ненадежна и может не работать. Запись произвольной области может работать не идеально в некоторых браузерах из-за ограничений API.");
    }

    function handleHotkeys(e) {
        // Игнорируем горячие клавиши, если фокус находится на поле ввода или если оверлей выбора области или модальное окно настроек активны
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
        // Обработка Esc для закрытия оверлея выбора области и модального окна настроек
        if (e.key === 'Escape') {
            if (regionOverlay.style.display === 'block') {
                e.preventDefault();
                regionOverlay.style.display = 'none';
                selectionRectangle.style.display = 'none'; // Скрываем прямоугольник
                selectionStart = null;
                selectedRegion = null; // Сбрасываем выбранную область при отмене
                statusDisplay.textContent = 'Выбор области отменен';
                statusDisplay.className = 'status ready';
                videoSourceSelect.value = 'screen'; // Возвращаем источник на "Весь экран"
                updateUI(); // Обновляем UI после отмены
            } else if (settingsModal.style.display === 'block') {
                 e.preventDefault();
                 hideSettings();
            }
        }
    }


    // Изначально скрываем customResolutionDiv, если выбрано не 'custom'
     if (resolutionSelect.value !== 'custom') {
        customResolutionDiv.style.display = 'none';
    }

     // Изначально скрываем контейнер для визуализации кликов
    clickVisualizationsContainer.style.display = 'none';


});