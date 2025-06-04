// Глобальные переменные

let mediaRecorder;

let recordedChunks = [];

let recordingStartTime;

let pauseStartTime; // Для отслеживания начала паузы

let totalPausedTime = 0; // Для накопления общего времени паузы

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

    // !!! Элемент для переключения темы !!!
    const themeToggle = document.getElementById('theme-toggle');

    // Проверка поддержки API

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {

        alert("Ваш браузер не поддерживает запись экрана");

        // Отключаем кнопки, если API не поддерживается
        btnStart.disabled = true;
        btnStop.disabled = true; // На всякий случай, хотя старт невозможен
        // Можно также отключить другие элементы управления, если хотите
        videoSourceSelect.disabled = true;
        resolutionSelect.disabled = true;
        fpsSelect.disabled = true;
        audioSourceSelect.disabled = true;
        volumeSlider.disabled = true;
        themeToggle.disabled = true; // Также отключаем переключатель темы, если сайт не будет работать

        statusDisplay.textContent = 'Браузер не поддерживается';
        statusDisplay.className = 'status error';

        return; // Прекращаем выполнение скрипта, если API не поддерживается

    }

    // Слушатели событий

    btnStart.addEventListener('click', toggleRecording);

    btnStop.addEventListener('click', stopRecording);

    btnSettings.addEventListener('click', showSettings);

    btnHelp.addEventListener('click', showHelp);

    document.addEventListener('keydown', handleHotkeys);

    // !!! Слушатель для кнопки переключения темы !!!
    themeToggle.addEventListener('click', toggleTheme);

    // Инициализация UI

    updateUI();

    // !!! Функции для темы оформления !!!

    // Функция для установки темы (применяет класс к body)
    function setTheme(themeName) {
        if (themeName === 'dark') {
            document.body.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark'); // Сохраняем в localStorage
            console.log("Тема установлена: темная");
        } else {
            document.body.classList.remove('dark-theme');
            localStorage.setItem('theme', 'light'); // Сохраняем в localStorage
            console.log("Тема установлена: светлая");
        }
    }

    // Функция для переключения темы
    function toggleTheme() {
        if (document.body.classList.contains('dark-theme')) {
            setTheme('light');
        } else {
            setTheme('dark');
        }
    }

    // Загружаем тему при загрузке страницы из localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        // Если тема не сохранена, используем светлую по умолчанию
        setTheme('light');
    }


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

            // !!! Получаем выбранные разрешение и FPS !!!
            const selectedResolution = resolutionSelect.value;
            const selectedFps = parseInt(fpsSelect.value, 10); // Преобразуем FPS в число


            console.log("Начало процесса записи...");

            statusDisplay.textContent = 'Запрашиваем доступ к медиа...';

            statusDisplay.className = 'status pending';

            // 1. Получаем видеопоток с экрана с учетом разрешения и FPS

            const videoConstraints = {

                mediaSource: videoSource === 'screen' ? 'screen' :

                              videoSource === 'window' ? 'window' : 'screen'

                // !!! Добавляем желаемое разрешение и FPS !!!
            };

            if (selectedResolution !== 'custom') {
                const [width, height] = selectedResolution.split('x').map(num => parseInt(num, 10));
                videoConstraints.width = { ideal: width }; // Используем ideal, чтобы браузер мог подстроиться
                videoConstraints.height = { ideal: height };
            }

            // Добавляем желаемый FPS
            videoConstraints.frameRate = { ideal: selectedFps };


            // Ограничения для getDisplayMedia с учетом видео и аудио
            const displayMediaConstraints = {

                 video: videoConstraints,

                 audio: audioSource === 'system' || audioSource === 'both'

            };

             console.log("Запрашиваем доступ к экрану с ограничениями:", displayMediaConstraints);

            const screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaConstraints)

                .catch(err => {

                    console.error("Ошибка getDisplayMedia:", err);

                    throw err;

                });

            if (screenStream.getVideoTracks().length === 0) {

                throw new Error("Не удалось получить видеодорожку");

            }

            // 2. Получаем аудиопоток с микрофона, если нужно (!!! с настройкой громкости !!!)

            let micStream = null;
            let processedAudioStream = null; // Поток после обработки громкости (Web Audio API)


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

                    // !!! Настройка громкости микрофона через Web Audio API !!!
                     if (micStream.getAudioTracks().length > 0) {
                         console.log("Аудиодорожка микрофона получена. Настройка громкости...");

                         const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                         const micSource = audioContext.createMediaStreamSource(micStream);
                         const gainNode = audioContext.createGain();

                         // Устанавливаем начальную громкость и привязываем слушатель к слайдеру
                         const volume = volumeSlider.value / 100; // Значение от 0 до 1
                         gainNode.gain.value = volume;
                         volumeSlider.oninput = function() {
                             gainNode.gain.value = this.value / 100;
                         };

                         const destinationNode = audioContext.createMediaStreamDestination();

                         // Подключаем SourceNode -> GainNode -> DestinationNode
                         micSource.connect(gainNode).connect(destinationNode);

                         // Получаем обработанный аудиопоток
                         processedAudioStream = destinationNode.stream;
                         console.log("Аудиодорожка микрофона обработана Web Audio API.");

                     } else {
                         console.warn("getUserMedia вернул поток, но аудиодорожек нет.");
                         if (audioSource === 'mic') {
                             throw new Error("Не удалось получить аудиодорожку микрофона.");
                         }
                     }


                } catch (audioError) {

                    console.warn("Не удалось получить доступ к микрофону:", audioError);

                    if (audioSource === 'mic') {

                         if (audioError.name === 'NotAllowedError' || audioError.name === 'PermissionDeniedError') {

                             alert("Необходимо разрешить доступ к микрофону для записи звука.");

                         } else if (audioError.name === 'NotFoundError') {

                             alert("Микрофон не найден.");

                         } else {

                              alert(`Ошибка получения микрофона: ${audioError.message}`);

                         }

                        throw audioError; // Пробрасываем ошибку, если нужен только микрофон

                    } else {

                         // Если выбран "Микрофон + Системные звуки", продолжаем без микрофона

                         alert("Не удалось получить доступ к микрофону. Запись будет без микрофона.");

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

            // !!! Добавляем обработанные аудиодорожки микрофона (если есть) !!!
            if (processedAudioStream) {
                processedAudioStream.getAudioTracks().forEach(track => {
                    combinedStream.addTrack(track);
                });
                 // Важно остановить оригинальный micStream после создания SourceNode
                 if (micStream) {
                      micStream.getTracks().forEach(track => track.stop());
                 }
            }


            // Добавляем системные звуки (если есть и запрошены)

            if (audioSource === 'system' || audioSource === 'both') {

                 const screenAudioTracks = screenStream.getAudioTracks(); // Получаем системные аудиодорожки
                 screenAudioTracks.forEach(track => {

                    combinedStream.addTrack(track);

                 });
                  // Важно остановить оригинальные системные аудиодорожки после добавления
                 screenAudioTracks.forEach(track => track.stop());

            } else {
                 // Если системные звуки не выбраны, останавливаем их дорожки, если они были получены
                 screenStream.getAudioTracks().forEach(track => track.stop());
            }


            console.log("Дорожки в объединенном потоке:");

            console.log("Видео:", combinedStream.getVideoTracks());

            console.log("Аудио:", combinedStream.getAudioTracks());

            // Проверяем, что в объединенном потоке есть хотя бы одна дорожка перед началом записи
             if (combinedStream.getTracks().length === 0) {
                  console.error("Объединенный поток не содержит дорожек!");
                  alert("Не удалось создать медиапоток для записи. Убедитесь, что вы разрешили доступ к экрану и/или микрофону.");
                  updateUI();
                  statusDisplay.textContent = 'Готов к записи';
                  statusDisplay.className = 'status ready';
                  return;
             }


            // 4. Проверяем поддерживаемые форматы

            let mimeType = 'video/webm';

            const supportedTypes = [

                'video/webm;codecs=vp9,opus',

                'video/webm;codecs=vp8,opus',

                'video/webm'

            ].filter(type => MediaRecorder.isTypeSupported(type));

            if (supportedTypes.length > 0) {

                mimeType = supportedTypes[0];

            } else {
                 console.warn("Не найдено поддерживаемых MIME типов. Попытка использовать 'video/webm'.");
                 if (!MediaRecorder.isTypeSupported('video/webm')) {
                      console.error("Браузер не поддерживает 'video/webm'!");
                      alert("Ваш браузер не поддерживает запись видео в формате WebM.");
                       if (currentStream) {
                           currentStream.getTracks().forEach(track => track.stop());
                       }
                       currentStream = null;
                       updateUI();
                       statusDisplay.textContent = 'Готов к записи';
                       statusDisplay.className = 'status ready';
                       return;
                 }
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

            currentStream = combinedStream; // Сохраняем объединенный поток

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

            currentStream = null;

        }

    }

    function pauseRecording() {

        if (!isRecording || isPaused) return;

        console.log("Приостановка записи...");

        isPaused = true;

        pauseStartTime = Date.now(); // Запоминаем время начала паузы

        clearInterval(timerInterval); // Останавливаем таймер

        try {

            if (mediaRecorder && mediaRecorder.state === 'recording') {

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

        // Рассчитываем общее время паузы и добавляем его к счетчику

        totalPausedTime += Date.now() - pauseStartTime;

        try {

            if (mediaRecorder && mediaRecorder.state === 'paused') {

                mediaRecorder.resume();

                console.log("MediaRecorder успешно возобновлен");

            }

        } catch (e) {

            console.error("Ошибка при возобновлении MediaRecorder:", e);

        }

        timerInterval = setInterval(updateTimer, 1000); // Возобновляем таймер

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

        // Сбрасываем счетчики времени для следующей записи
        recordingStartTime = null;
        pauseStartTime = null;
        totalPausedTime = 0;

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

            currentStream = null;

            statusDisplay.textContent = 'Готов к записи';

            statusDisplay.className = 'status ready';

            previewVideo.style.display = 'none';

        }

    }

    function updateTimer() {

        // Учитываем время паузы при расчете продолжительности записи

        // Если запись на паузе, добавляем текущее время паузы к общему времени паузы для корректного отображения
        const currentElapsed = Date.now() - recordingStartTime - totalPausedTime;
        const elapsed = isPaused ? Date.now() - recordingStartTime - totalPausedTime : currentElapsed;


        const hours = Math.floor(elapsed / 3600000).toString().padStart(2, '0'); // Переведено в миллисекунды для точности
        const minutes = Math.floor((elapsed % 3600000) / 60000).toString().padStart(2, '0');
        const seconds = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');


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

        btnStart.disabled = isActivelyRecording;

        btnStop.disabled = !isRecording && !isPaused;

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
теперь добавь свои изменения связанные с темой сюда