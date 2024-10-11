const quotes = [
    "Focus on the journey, not the destination.",
    "Small steps lead to big changes.",
    "Stay focused, go after your dreams.",
    "Believe you can and you're halfway there.",
    "Your limitation—it's only your imagination.",
    "Push yourself, because no one else is going to do it for you.",
    "Great things never come from comfort zones.",
    "Success doesn't just find you. You have to go out and get it.",
    "The harder you work for something, the greater you'll feel when you achieve it.",
    "Dream it. Wish it. Do it."
];
let selectedAmbientSound = 'no-sound';

// Add these variables at the top of your file
let settings = {
  darkTheme: true,
  showAchieved: true
};

function setRandomQuote() {
    const quoteElement = document.getElementById('motivationalQuote');
    const randomIndex = Math.floor(Math.random() * quotes.length);
    quoteElement.textContent = quotes[randomIndex];
}

// Theme toggle functionality
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDarkTheme = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light');
    updateThemeIcon(isDarkTheme);
}

function applySavedTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark'; // Changed 'light' to 'dark'
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
    updateThemeIcon(savedTheme === 'dark');
}

function updateThemeIcon(isDarkTheme) {
    const themeIcon = document.querySelector('#themeToggle i');
    themeIcon.className = isDarkTheme ? 'fas fa-sun' : 'fas fa-moon';
}

let popupOpen = true;

// Add this function
function stopAmbientSound() {
    chrome.runtime.sendMessage({
        action: 'stopAmbientSound'
    });
    ambientSoundButtons.forEach(btn => btn.classList.remove('selected'));
    selectedAmbientSound = 'no-sound';
}

// Add these functions to handle settings
function loadSettings() {
  chrome.storage.sync.get(['settings'], (result) => {
    if (result.settings) {
      settings = result.settings;
      updateUIBasedOnSettings();
    }
  });
}

// Update the updateUIBasedOnSettings function
function updateUIBasedOnSettings() {
  document.body.classList.toggle('dark-theme', settings.darkTheme);
  
  const stopSessionButton = document.getElementById('stopSessionButton');
  if (stopSessionButton) {
    stopSessionButton.style.display = settings.showAchieved ? 'block' : 'none';
  }
  
  document.getElementById('darkThemeSwitch').checked = settings.darkTheme;
  document.getElementById('showAchievedSwitch').checked = settings.showAchieved;
}

function showSettingsScreen() {
    console.log("Showing settings screen");
    document.getElementById('settingsScreen').style.display = 'flex';
    document.querySelector('.container').style.height = 'auto';
    document.getElementById('setupSession').style.display = 'none';
    document.getElementById('sessionInfo').style.display = 'none';
}

function hideSettingsScreen() {
    console.log("Hiding settings screen");
    document.getElementById('settingsScreen').style.display = 'none';
    document.querySelector('.container').style.height = '';
    
    // Show the appropriate screen based on whether a session is active
    if (focusSessionActive) {
        document.getElementById('sessionInfo').style.display = 'block';
        document.getElementById('setupSession').style.display = 'none';
    } else {
        document.getElementById('setupSession').style.display = 'block';
        document.getElementById('sessionInfo').style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM fully loaded");

    applySavedTheme();

    const themeToggle = document.getElementById('themeToggle');
    const quoteElement = document.getElementById('motivationalQuote');
    themeToggle.addEventListener('click', toggleTheme);

    const startSessionButton = document.getElementById('startSessionButton');
    const timerInput = document.getElementById('timerInput');
    const tabList = document.getElementById('tabList');
    const sessionInfo = document.getElementById('sessionInfo');
    const setupSession = document.getElementById('setupSession');
    const timeRemainingSeconds = document.getElementById('timeRemainingSeconds');

    startSessionButton.addEventListener('click', startFreezeSession);
    showTabList();

    let timer;
    let remainingTime;

    function showTabList() {
        chrome.tabs.query({}, function(tabs) {
            tabList.innerHTML = '';
            tabs.forEach(function(tab) {
                const tabItem = document.createElement('div');
                tabItem.className = 'tab-item';
                tabItem.innerHTML = `
                    <input type="checkbox" id="tab-${tab.id}" value="${tab.id}">
                    <label for="tab-${tab.id}">${tab.title}</label>
                `;
                tabList.appendChild(tabItem);
            });
        });
    }

    const ambientSoundButtons = document.querySelectorAll('.ambient-sound-button');

    ambientSoundButtons.forEach(button => {
        button.addEventListener('click', function() {
            const spinner = this.querySelector('.loading-spinner');
            ambientSoundButtons.forEach(btn => {
                btn.classList.remove('selected');
                btn.querySelector('.loading-spinner').style.display = 'none';
            });
            this.classList.add('selected');
            selectedAmbientSound = this.dataset.sound;
            
            if (selectedAmbientSound !== 'no-sound') {
                spinner.style.display = 'block';
            }
            
            console.log(`Attempting to play sound: ${selectedAmbientSound}`);
            // Send message to background script to play the selected sound
            chrome.runtime.sendMessage({
                action: 'playAmbientSound',
                sound: selectedAmbientSound
            }, response => {
                spinner.style.display = 'none';
                if (chrome.runtime.lastError) {
                    console.error('Error playing sound:', chrome.runtime.lastError);
                } else if (response && response.success) {
                    console.log(`Sound ${selectedAmbientSound} played successfully`);
                } else {
                    console.error('Failed to play sound:', response);
                    this.classList.remove('selected');
                }
            });
        });

        // Add double-click event listener to stop the sound
        button.addEventListener('dblclick', function(e) {
            e.preventDefault(); // Prevent default double-click behavior
            chrome.runtime.sendMessage({
                action: 'stopAmbientSound'
            });
            ambientSoundButtons.forEach(btn => btn.classList.remove('selected'));
            selectedAmbientSound = 'no-sound';
        });
    });

    function startFreezeSession() {
        console.log("Starting freeze session...");
        const duration = parseFloat(timerInput.value);
        if (isNaN(duration) || duration <= 0) {
            console.error("Invalid duration:", duration);
            alert('Please enter a valid duration.');
            return;
        }

        const selectedTabs = Array.from(document.querySelectorAll('#tabList input[type="checkbox"]:checked'))
            .map(checkbox => parseInt(checkbox.value));

        if (selectedTabs.length === 0) {
            console.error("No tabs selected");
            alert('Please select at least one tab to keep open.');
            return;
        }

        console.log("Sending startFreezeSession message", {
            duration: duration,
            selectedTabs: selectedTabs,
            ambientSound: selectedAmbientSound
        });

        chrome.runtime.sendMessage({
            action: 'startFreezeSession',
            duration: duration,
            selectedTabs: selectedTabs,
            ambientSound: selectedAmbientSound
        }, function(response) {
            console.log("Received response:", response);
            if (chrome.runtime.lastError) {
                console.error('Error starting freeze session:', chrome.runtime.lastError);
                alert('Failed to start freeze session. Error: ' + chrome.runtime.lastError.message);
            } else if (response && response.success) {
                console.log("Freeze session started successfully");
                setupSession.style.display = 'none';
                sessionInfo.style.display = 'block';
                startSession(duration * 60); // Convert minutes to seconds
                focusSessionActive = true;
                updateSettingsIconVisibility(true); // Add this line
            } else {
                console.error('Failed to start freeze session:', response);
                alert('Failed to start freeze session. ' + (response.error || 'Please try again.'));
            }
        });
    }

    function startSession(durationInSeconds) {
        remainingTime = durationInSeconds;
        updateTimerDisplay();
        setRandomQuote(); // Show quote when session starts
        quoteElement.style.display = 'block'; // Make quote visible
        timer = setInterval(updateTimer, 1000);
    }

    function updateTimer() {
        remainingTime--;
        updateTimerDisplay();

        if (remainingTime <= 0) {
            endSession();
        }
    }

    function updateTimerDisplay() {
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        timeRemainingSeconds.innerHTML = `<span class="time-label">Time left:</span> <span class="time-value">${minutes}m ${seconds}s</span>`;
    }

    function endSession() {
        clearInterval(timer);
        chrome.runtime.sendMessage({ 
            action: 'endFreezeSession',
            stopSound: true,
            rollbackTabs: true
        }, function(response) {
            if (chrome.runtime.lastError) {
                console.error("Error ending session:", chrome.runtime.lastError);
                alert("There was an issue ending the session. Please try refreshing the extension.");
            } else if (response && response.success) {
                console.log("Session ended and sound stopped successfully");
                resetUI();
            } else {
                console.error("Failed to end session or stop sound:", response ? response.error : "Unknown error");
                alert("There was an issue ending the session. Your tabs should be restored, but you may need to refresh the extension.");
                resetUI();
            }
        });
    }

    function resetUI() {
        setupSession.style.display = 'block';
        sessionInfo.style.display = 'none';
        quoteElement.style.display = 'none';
        showTabList();
        focusSessionActive = false;
        updateSettingsIconVisibility(false);
        
        // Deselect all ambient sound buttons
        ambientSoundButtons.forEach(btn => btn.classList.remove('selected'));
        selectedAmbientSound = 'no-sound';
        
        clearInterval(timer);
        remainingTime = 0;
        updateTimerDisplay();
    }

    // Check if a session is already active when popup opens
    chrome.runtime.sendMessage({action: 'getFocusStatus'}, function(response) {
        if (response.active) {
            setupSession.style.display = 'none';
            sessionInfo.style.display = 'block';
            remainingTime = Math.max(0, Math.floor((response.endTime - Date.now()) / 1000));
            updateTimerDisplay();
            setRandomQuote(); // Show quote if session is active
            quoteElement.style.display = 'block'; // Make quote visible
            timer = setInterval(updateTimer, 1000);
            focusSessionActive = true;
            updateSettingsIconVisibility(true); // Add this line
        } else {
            setupSession.style.display = 'block';
            sessionInfo.style.display = 'none';
            quoteElement.style.display = 'none'; // Hide quote when no session is active
            showTabList();
            updateSettingsIconVisibility(false); // Add this line
        }
    });

    // Modify this part
    window.addEventListener('unload', function() {
        chrome.runtime.sendMessage({ 
            action: 'popupClosed', 
            focusSessionActive: focusSessionActive,
            stopSound: !focusSessionActive  // Stop sound if no active session
        });
    });

    // Remove this event listener
    // window.addEventListener('unload', function() {
    //     popupOpen = false;
    //     if (!focusSessionActive) {
    //         stopAmbientSound();
    //     }
    // });

    // Remove this line
    // chrome.runtime.sendMessage({action: 'popupOpened'});

    const stopSessionButton = document.getElementById('stopSessionButton');
    stopSessionButton.addEventListener('click', stopSession);

    function stopSession() {
        if (confirm('Are you sure you want to stop the current session?')) {
            endSession();
        }
    }

    loadSettings();
    
    const settingsButton = document.getElementById('settingsButton');

    console.log("Settings button:", settingsButton);

    if (settingsButton) {
        settingsButton.addEventListener('click', function(event) {
            event.preventDefault();
            console.log("Settings button clicked");
            showSettingsScreen();
        });
    } else {
        console.error("Settings button not found");
    }

    // Add event listeners for the switches
    document.getElementById('darkThemeSwitch').addEventListener('change', function() {
      settings.darkTheme = this.checked;
      chrome.storage.sync.set({ settings }, () => {
        updateUIBasedOnSettings();
      });
    });

    document.getElementById('showAchievedSwitch').addEventListener('change', function() {
      settings.showAchieved = this.checked;
      chrome.storage.sync.set({ settings }, () => {
        updateUIBasedOnSettings();
      });
    });

    // Modify your existing theme toggle logic
    document.getElementById('themeToggle').addEventListener('click', () => {
      settings.darkTheme = !settings.darkTheme;
      chrome.storage.sync.set({ settings }, () => {
        updateUIBasedOnSettings();
      });
    });

    const closeSettingsButton = document.getElementById('closeSettings');
    if (closeSettingsButton) {
        closeSettingsButton.addEventListener('click', function(event) {
            event.preventDefault();
            console.log("Close settings button clicked");
            hideSettingsScreen();
        });
    } else {
        console.error("Close settings button not found");
    }

    function updateSettingsIconVisibility(isSessionActive) {
        const settingsButton = document.getElementById('settingsButton');
        if (settingsButton) {
            settingsButton.style.display = isSessionActive ? 'none' : 'block';
        }
    }
});

// Add this variable at the top of your file
let focusSessionActive = false;

// Add this function
function stopAmbientSound() {
    chrome.runtime.sendMessage({
        action: 'stopAmbientSound'
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'sessionEnded') {
        resetUI();
    } else if (request.action === 'sessionEndedWithError') {
        console.error("Session ended with error:", request.error);
        alert("There was an issue ending the session: " + request.error + "\nYour tabs should be restored, but you may need to refresh the extension.");
        resetUI();
    }
});

function resetUI() {
    setupSession.style.display = 'block';
    sessionInfo.style.display = 'none';
    quoteElement.style.display = 'none';
    showTabList();
    focusSessionActive = false;
    updateSettingsIconVisibility(false);
    
    // Deselect all ambient sound buttons
    ambientSoundButtons.forEach(btn => btn.classList.remove('selected'));
    selectedAmbientSound = 'no-sound';
    
    clearInterval(timer);
    remainingTime = 0;
    updateTimerDisplay();
}

function stopSession() {
    if (confirm('Are you sure you want to stop the current session?')) {
        endSession();
    }
}

// Modify the window unload event listener
window.addEventListener('unload', function() {
    chrome.runtime.sendMessage({ 
        action: 'popupClosed', 
        focusSessionActive: focusSessionActive,
        stopSound: !focusSessionActive
    });
});