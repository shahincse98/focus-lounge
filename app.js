/**
 * Focus Lounge Application Logic
 * Pomodoro state machine, sound controls, UI reactive updates, and persistence.
 */

document.addEventListener('DOMContentLoaded', () => {
  // App State
  const state = {
    mode: 'focus', // 'focus', 'shortBreak', 'longBreak'
    durations: {
      focus: 25 * 60,
      shortBreak: 5 * 60,
      longBreak: 15 * 60
    },
    timeLeft: 25 * 60,
    isRunning: false,
    timerId: null,
    completedSessions: 0,
    currentTask: '',
    taskDone: false,
    zenMode: false,
    soundVolumes: {
      rain: 0,
      fire: 0,
      wind: 0,
      waves: 0,
      brown: 0,
      zen: 0
    }
  };

  // SVG Progress Ring calculations
  const radius = 140;
  const circumference = 2 * Math.PI * radius; // ~879.64

  // DOM Elements
  const timerDigits = document.getElementById('timer-digits');
  const timerStatus = document.getElementById('timer-status');
  const progressIndicator = document.getElementById('progress-indicator');
  const startPauseBtn = document.getElementById('start-pause-btn');
  const startBtnLabel = document.getElementById('start-btn-label');
  const playIcon = document.getElementById('play-icon');
  const pauseIcon = document.getElementById('pause-icon');
  const resetBtn = document.getElementById('reset-btn');
  const skipBtn = document.getElementById('skip-btn');
  const modeTabs = document.querySelectorAll('.mode-tab');
  const completedSessionsEl = document.getElementById('completed-sessions-count');
  const zenBtn = document.getElementById('zen-btn');
  const masterMuteBtn = document.getElementById('master-mute-btn');
  const muteIconOn = document.getElementById('mute-icon-on');
  const muteIconOff = document.getElementById('mute-icon-off');
  const muteBtnText = document.getElementById('mute-btn-text');
  const taskInput = document.getElementById('current-task-input');
  const taskDoneBtn = document.getElementById('task-done-toggle');
  const soundCards = document.querySelectorAll('.sound-card');
  const presetPills = document.querySelectorAll('.preset-pill');

  // Load Saved Data from LocalStorage
  function loadPersistedState() {
    try {
      const saved = localStorage.getItem('focus_lounge_data');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.completedSessions) state.completedSessions = parsed.completedSessions;
        if (parsed.currentTask) {
          state.currentTask = parsed.currentTask;
          taskInput.value = state.currentTask;
        }
        if (parsed.taskDone !== undefined) {
          state.taskDone = parsed.taskDone;
          updateTaskButtonUI();
        }
        if (parsed.soundVolumes) {
          Object.assign(state.soundVolumes, parsed.soundVolumes);
        }
      }
    } catch (e) {
      console.warn("Could not load local storage", e);
    }
  }

  function saveState() {
    try {
      const payload = {
        completedSessions: state.completedSessions,
        currentTask: state.currentTask,
        taskDone: state.taskDone,
        soundVolumes: state.soundVolumes
      };
      localStorage.setItem('focus_lounge_data', JSON.stringify(payload));
    } catch (e) {}
  }

  // Format MM:SS
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Convert English digits to Bengali digits for a clean local touch
  function toBengaliNumerals(n) {
    const bn = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(n).replace(/[0-9]/g, d => bn[d]);
  }

  // Update UI Elements
  function updateTimerDisplay() {
    const formatted = formatTime(state.timeLeft);
    timerDigits.textContent = formatted;

    // Calculate ring offset
    const totalTime = state.durations[state.mode];
    const fraction = state.timeLeft / totalTime;
    const offset = circumference * (1 - fraction);
    progressIndicator.style.strokeDashoffset = offset;

    // Document title
    const modeName = state.mode === 'focus' ? '🎯 ফোকাস' : '☕ বিরতি';
    document.title = `(${formatted}) ${modeName} - Focus Lounge`;

    // Session count
    completedSessionsEl.textContent = toBengaliNumerals(state.completedSessions);
  }

  function setMode(newMode) {
    state.mode = newMode;
    state.timeLeft = state.durations[newMode];
    pauseTimer();

    modeTabs.forEach(tab => {
      if (tab.dataset.mode === newMode) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // Theme color adjustments based on mode
    if (newMode === 'focus') {
      progressIndicator.style.stroke = 'var(--accent-focus)';
      timerStatus.textContent = 'কাজে মনোনিবেশ করুন';
    } else if (newMode === 'shortBreak') {
      progressIndicator.style.stroke = 'var(--accent-short-break)';
      timerStatus.textContent = 'হালকা স্ট্রেচ করুন বা জল খান';
    } else {
      progressIndicator.style.stroke = 'var(--accent-long-break)';
      timerStatus.textContent = 'মনকে শান্ত ও রিফ্রেশ করুন';
    }

    updateTimerDisplay();
  }

  function startTimer() {
    if (state.isRunning) return;

    window.audioEngine.ensureContext();
    state.isRunning = true;
    document.body.classList.add('timer-running');

    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
    startBtnLabel.textContent = 'পজ';

    state.timerId = setInterval(() => {
      if (state.timeLeft > 0) {
        state.timeLeft--;
        updateTimerDisplay();
      } else {
        handleTimerComplete();
      }
    }, 1000);
  }

  function pauseTimer() {
    if (!state.isRunning) return;

    state.isRunning = false;
    document.body.classList.remove('timer-running');
    clearInterval(state.timerId);
    state.timerId = null;

    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    startBtnLabel.textContent = 'শুরু করুন';
  }

  function toggleTimer() {
    if (state.isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  }

  function resetTimer() {
    pauseTimer();
    state.timeLeft = state.durations[state.mode];
    updateTimerDisplay();
  }

  function handleTimerComplete() {
    pauseTimer();

    // Play singing bowl chime alert
    window.audioEngine.playCompletionChime();

    if (state.mode === 'focus') {
      state.completedSessions++;
      saveState();

      // Automatically suggest break
      if (state.completedSessions % 4 === 0) {
        setMode('longBreak');
      } else {
        setMode('shortBreak');
      }
    } else {
      setMode('focus');
    }
  }

  function skipSession() {
    pauseTimer();
    if (state.mode === 'focus') {
      setMode('shortBreak');
    } else {
      setMode('focus');
    }
  }

  // Task Input and Status
  function updateTaskButtonUI() {
    if (state.taskDone) {
      taskDoneBtn.classList.add('done');
      taskDoneBtn.textContent = '✓ শেষ হয়েছে';
      taskInput.style.textDecoration = 'line-through';
      taskInput.style.opacity = '0.6';
    } else {
      taskDoneBtn.classList.remove('done');
      taskDoneBtn.textContent = '✓ সম্পন্ন';
      taskInput.style.textDecoration = 'none';
      taskInput.style.opacity = '1';
    }
  }

  taskInput.addEventListener('input', (e) => {
    state.currentTask = e.target.value;
    state.taskDone = false;
    updateTaskButtonUI();
    saveState();
  });

  taskDoneBtn.addEventListener('click', () => {
    if (!taskInput.value.trim()) return;
    state.taskDone = !state.taskDone;
    updateTaskButtonUI();
    saveState();
  });

  // Mode Switch Tabs
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      setMode(tab.dataset.mode);
    });
  });

  // Buttons
  startPauseBtn.addEventListener('click', toggleTimer);
  resetBtn.addEventListener('click', resetTimer);
  skipBtn.addEventListener('click', skipSession);

  // Zen Mode Toggle
  zenBtn.addEventListener('click', () => {
    state.zenMode = !state.zenMode;
    if (state.zenMode) {
      document.body.classList.add('zen-mode');
      zenBtn.querySelector('.btn-text').textContent = 'সাধারণ মোড';
    } else {
      document.body.classList.remove('zen-mode');
      zenBtn.querySelector('.btn-text').textContent = 'জেন মোড';
    }
  });

  // Master Mute Toggle
  masterMuteBtn.addEventListener('click', () => {
    const isMuted = window.audioEngine.toggleMasterMute();
    if (isMuted) {
      muteIconOn.classList.add('hidden');
      muteIconOff.classList.remove('hidden');
      muteBtnText.textContent = 'মিউট করা';
      masterMuteBtn.classList.add('muted');
    } else {
      muteIconOn.classList.remove('hidden');
      muteIconOff.classList.add('hidden');
      muteBtnText.textContent = 'সাউন্ড অন';
      masterMuteBtn.classList.remove('muted');
    }
  });

  // Sound Grid & Sliders Handler
  soundCards.forEach(card => {
    const soundKey = card.dataset.sound;
    const toggleBtn = card.querySelector('.sound-toggle-btn');
    const slider = card.querySelector('.volume-slider');
    const percentageEl = card.querySelector('.vol-percentage');
    const statusEl = card.querySelector('.sound-status');

    function syncSoundUI(vol) {
      slider.value = vol;
      percentageEl.textContent = toBengaliNumerals(vol) + '%';
      if (vol > 0) {
        card.classList.add('active');
        statusEl.textContent = 'চালু';
        window.audioEngine.startSound(soundKey, vol / 100);
      } else {
        card.classList.remove('active');
        statusEl.textContent = 'বন্ধ';
        window.audioEngine.stopSound(soundKey);
      }
    }

    // Toggle button on card
    toggleBtn.addEventListener('click', () => {
      window.audioEngine.ensureContext();
      let currentVal = parseInt(slider.value, 10);
      let targetVal = currentVal > 0 ? 0 : 50;
      state.soundVolumes[soundKey] = targetVal;
      syncSoundUI(targetVal);
      saveState();
    });

    // Slider change
    slider.addEventListener('input', (e) => {
      window.audioEngine.ensureContext();
      const val = parseInt(e.target.value, 10);
      state.soundVolumes[soundKey] = val;
      syncSoundUI(val);
      saveState();
    });
  });

  // Sound Presets
  function applySoundPreset(volumes) {
    window.audioEngine.ensureContext();
    soundCards.forEach(card => {
      const soundKey = card.dataset.sound;
      const targetVol = volumes[soundKey] !== undefined ? volumes[soundKey] : 0;
      state.soundVolumes[soundKey] = targetVol;
      const slider = card.querySelector('.volume-slider');
      const percentageEl = card.querySelector('.vol-percentage');
      const statusEl = card.querySelector('.sound-status');

      slider.value = targetVol;
      percentageEl.textContent = toBengaliNumerals(targetVol) + '%';
      if (targetVol > 0) {
        card.classList.add('active');
        statusEl.textContent = 'চালু';
        window.audioEngine.startSound(soundKey, targetVol / 100);
      } else {
        card.classList.remove('active');
        statusEl.textContent = 'বন্ধ';
        window.audioEngine.stopSound(soundKey);
      }
    });
    saveState();
  }

  presetPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const preset = pill.dataset.preset;
      switch (preset) {
        case 'rainy-cafe':
          applySoundPreset({ rain: 60, fire: 15, wind: 25, waves: 0, brown: 0, zen: 20 });
          break;
        case 'cozy-fireplace':
          applySoundPreset({ fire: 70, wind: 30, rain: 0, waves: 0, brown: 0, zen: 15 });
          break;
        case 'deep-focus':
          applySoundPreset({ brown: 65, rain: 30, fire: 0, wind: 0, waves: 0, zen: 35 });
          break;
        case 'reset-sounds':
          applySoundPreset({ rain: 0, fire: 0, wind: 0, waves: 0, brown: 0, zen: 0 });
          break;
      }
    });
  });

  // Quick Preset in header
  const quickPresetBtn = document.getElementById('quick-preset-btn');
  if (quickPresetBtn) {
    quickPresetBtn.addEventListener('click', () => {
      applySoundPreset({ rain: 65, wind: 20, zen: 25 });
    });
  }

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // Ignore when typing inside input
    if (e.target.tagName === 'INPUT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      toggleTimer();
    } else if (e.code === 'KeyR') {
      resetTimer();
    } else if (e.code === 'KeyZ') {
      zenBtn.click();
    } else if (e.code === 'KeyM') {
      masterMuteBtn.click();
    }
  });

  // Initialization
  loadPersistedState();
  updateTimerDisplay();
});
