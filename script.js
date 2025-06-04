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
    const timerDisplay = document.getElementById('timer');
    const statusDisplay = document.getElementById('status');
    const previewVideo = document.getElementById('preview');
    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');
    const btnSettings = document.getElementById('btnSettings');
    const btnHelp = document.getElementById('btnHelp');
    const regionOverlay = document.getElementById('regionSelectionOverlay');
    const selectionRectangle = document.getElementById('selectionRectangle');

    // Инициализация AudioContext
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Обработчик изменения громкости
    volumeSlider.addEventListener('input', function() {
        micVolume = parseFloat(this.value);
        if (micGainNode) {
            micGainNode.gain.value = micVolume;
        }
        console.log("Громкость микрофона установлена на:", micVolume);
    });

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
                    const originalMicStream = await navigator.mediaDevices.getUserMedia({ 
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            sampleRate: 44100
                        }
                    });

                    // Создаем AudioContext если он еще не создан или закрыт
                    if (!audioContext || audioContext.state === 'closed') {
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
                // Закрываем AudioContext
                if (audioContext && audioContext.state !== 'closed') {
                    audioContext.close();
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
            totalPausedTime = 0; // Сбрасываем счетчик пауз
            timerInterval = setInterval(updateTimer, 1000);
            updateTimer();
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
            } else {
                alert(`Ошибка при начале записи: ${error.message}`);
            }
            updateUI();
            statusDisplay.textContent = 'Готов к записи';
            statusDisplay.className = 'status ready';
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }
            if (audioContext && audioContext.state !== 'closed') {
                audioContext.close();
            }
            currentStream = null;
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
                // Сохраняем последние данные перед паузой
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
        
        // Рассчитываем общее время паузы
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
            recordedChunks = [];
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }
            if (audioContext && audioContext.state !== 'closed') {
                audioContext.close();
            }
            currentStream = null;
            statusDisplay.textContent = 'Готов к записи';
            statusDisplay.className = 'status ready';
            previewVideo.style.display = 'none';
        }
    }

    function updateTimer() {
        if (isPaused) return; // Не обновляем таймер во время паузы
        
        const elapsed = Math.floor((Date.now() - recordingStartTime - totalPausedTime) / 1000);
        const hours = Math.floor(elapsed / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${hours}:${minutes}:${seconds}`;
    }

    function updateUI() {
        if (isRecording) {
            if (isPaused) {
                btnStart.textContent = 'Продолжить запись';
            } else {
                btnStart.textContent = 'Пауза записи';
            }
            btnStop.disabled = false;
        } else {
            btnStart.textContent = 'Начать запись';
            btnStop.disabled = true;
            previewVideo.style.display = 'none';
        }

        const isActivelyRecording = isRecording && !isPaused;
        videoSourceSelect.disabled = isActivelyRecording;
        resolutionSelect.disabled = isActivelyRecording;
        fpsSelect.disabled = isActivelyRecording;
        audioSourceSelect.disabled = isActivelyRecording;
        volumeSlider.disabled = isActivelyRecording;

        btnStart.disabled = false; // Всегда активна (меняется только текст)
        btnStop.disabled = !isRecording;

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
            "2. Выберите разрешение и частоту кадров\n" +
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

    resolutionSelect.addEventListener('change', function() {
        if (resolutionSelect.value === 'custom') {
            alert("Пользовательское разрешение пока не реализовано.");
            resolutionSelect.value = '1920x1080';
        }
    });

    videoSourceSelect.addEventListener('change', function() {
        if (videoSourceSelect.value === 'region') {
            alert("Выбор произвольной области пока не реализована.");
            showRegionSelectionOverlay();
            videoSourceSelect.value = 'screen';
        }
    });
});