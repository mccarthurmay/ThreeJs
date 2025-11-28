// ===================================
// UI (Loading screens, menus, controls, Spotify)
// ===================================

import { setTimeControlEnabled, setManualTimeValue, setDayNightAngle } from './lighting.js';

// Input state
export const keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    space: false,
    shift: false
};

// Intro screen state
export let introActive = true;

export function setIntroActive(value) {
    introActive = value;
}

// Spotify player toggle
export function setupSpotifyPlayer() {
    window.toggleSpotify = function(event) {
        event.stopPropagation();
        event.preventDefault();

        const player = document.getElementById('spotify-player');
        const toggle = document.getElementById('spotify-toggle');

        if (player.classList.contains('minimized')) {
            player.classList.remove('minimized');
            toggle.textContent = '−';
        } else {
            player.classList.add('minimized');
            toggle.textContent = '+';
        }
    };
}

// Time slider handlers
export function setupTimeControls() {
    const timeSlider = document.getElementById('time-slider');
    let manualTimeValue = 50;

    timeSlider.addEventListener('input', (e) => {
        manualTimeValue = parseInt(e.target.value);
        setTimeControlEnabled(true);
        setManualTimeValue(manualTimeValue);
        // Convert 0-100 to radians (0-2π for full cycle)
        const dayNightAngle = (manualTimeValue / 100) * Math.PI * 2;
        setDayNightAngle(dayNightAngle);
        updateTimeButtonText();
    });

    // Time auto/manual toggle
    document.getElementById('time-auto-btn').addEventListener('click', () => {
        const currentEnabled = document.getElementById('time-mode-text').textContent === 'Manual';
        setTimeControlEnabled(!currentEnabled);
        updateTimeButtonText();
        if (!currentEnabled) {
            // Set slider to current angle
            const currentAngle = 0; // Would need to import this
            manualTimeValue = Math.round((currentAngle / (Math.PI * 2)) * 100);
            timeSlider.value = manualTimeValue;
        }
    });
}

function updateTimeButtonText() {
    const btnText = document.getElementById('time-mode-text');
    const isManual = btnText.textContent === 'Manual';

    if (!isManual) {
        btnText.textContent = 'Manual';
        btnText.parentElement.style.background = 'rgba(139, 195, 74, 0.6)';
    } else {
        btnText.textContent = 'Auto Cycle';
        btnText.parentElement.style.background = 'rgba(139, 195, 74, 0.8)';
    }
}

// Escape menu handlers
export function setupEscapeMenu(performanceManager, profiler) {
    document.getElementById('quality-cycle-btn').addEventListener('click', () => {
        performanceManager.cycleQuality();
    });

    // Profiler toggle
    document.getElementById('profiler-toggle-btn').addEventListener('click', () => {
        profiler.toggle();
        updateProfilerButtonText(profiler);
    });

    // Initialize profiler button text
    updateProfilerButtonText(profiler);

    // Close menu when clicking overlay
    document.getElementById('menu-overlay').addEventListener('click', () => {
        document.getElementById('escape-menu').classList.remove('visible');
        document.getElementById('menu-overlay').classList.remove('visible');
    });
}

function updateProfilerButtonText(profiler) {
    const statusText = document.getElementById('profiler-status-text');
    const button = document.getElementById('profiler-toggle-btn');

    if (profiler.enabled) {
        statusText.textContent = 'On';
        button.style.background = 'rgba(139, 195, 74, 0.8)';
    } else {
        statusText.textContent = 'Off';
        button.style.background = '';
    }
}

// Loading progress update
export function updateLoadingProgress(xhr) {
    const loadingBar = document.getElementById('loading-bar');
    const loadingText = document.getElementById('loading-text');

    if (xhr.lengthComputable) {
        const percentComplete = (xhr.loaded / xhr.total) * 100;
        loadingBar.style.width = percentComplete + '%';
        loadingText.textContent = `Loading... ${Math.round(percentComplete)}%`;
        console.log(`Loading: ${Math.round(percentComplete)}% (${xhr.loaded}/${xhr.total} bytes)`);
    } else {
        // If not computable, show a loading animation instead
        const mb = (xhr.loaded / 1024 / 1024).toFixed(2);
        loadingText.textContent = `Loading... ${mb} MB`;
        console.log(`Loading: ${mb} MB (total size unknown)`);
        // Animate bar in indeterminate mode
        loadingBar.style.width = '50%';
    }
}

// Show loading error
export function showLoadingError(error) {
    console.error('Error loading world model:', error);
    const loadingText = document.getElementById('loading-text');
    loadingText.textContent = 'Error loading world. Please refresh.';
    loadingText.style.color = '#ff5555';
}

// Hide loading screen and show intro
export function showIntroScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    const introScreen = document.getElementById('intro-screen');

    // Show intro screen immediately, then fade out loading screen
    introScreen.classList.add('visible');
    loadingScreen.classList.add('fade-out');
    setTimeout(() => {
        loadingScreen.style.display = 'none';
    }, 1000);
}

// Hide intro screen
export function hideIntroScreen() {
    introActive = false;
    document.getElementById('intro-screen').classList.add('fade-out');
    setTimeout(() => {
        document.getElementById('intro-screen').style.display = 'none';
    }, 1000);
}

// Update coordinates display
export function updateCoordinatesDisplay(position) {
    document.getElementById('coordinates').textContent =
        `Position: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`;
}
