let focusSession = {
  active: false,
  endTime: null,
  allowedUrls: [],
  originalUrls: {},
  closedTabs: [],
  currentSound: null
};

let isRestoringTabs = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ focusSession });
  chrome.storage.local.set({ theme: 'dark' });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message in background:', request);
  if (request.action === "startFreezeSession") {
    console.log("Starting freeze session in background");
    startFocusSession(request.duration, request.selectedTabs, request.ambientSound)
      .then((result) => {
        console.log("Focus session result:", result);
        sendResponse(result);
      })
      .catch((error) => {
        console.error("Error in startFocusSession:", error);
        sendResponse({success: false, error: error.message});
      });
    return true;
  } else if (request.action === "endFocus" || request.action === "stopFreezeSession" || request.action === "endFreezeSession") {
    endFocusSession(request.stopSound)
      .then(() => {
        console.log("Focus session ended successfully");
        sendResponse({success: true});
      })
      .catch((error) => {
        console.error("Error in endFocusSession:", error);
        sendResponse({success: false, error: error.message});
      });
    return true;
  } else if (request.action === "getFocusStatus") {
    sendResponse({
      active: focusSession.active,
      endTime: focusSession.endTime,
      currentSound: focusSession.currentSound
    });
  } else if (request.action === 'playAmbientSound' || request.action === 'stopAmbientSound') {
    handleAudioRequest(request)
      .then(() => sendResponse({success: true}))
      .catch((error) => {
        console.error("Error handling audio request:", error);
        sendResponse({success: false, error: error.message});
      });
    return true;
  } else if (request.action === "popupClosed") {
    if (request.stopSound) {
      handleAudioRequest({ action: 'stopAmbientSound' })
        .then(() => console.log("Ambient sound stopped due to popup closure"))
        .catch(error => console.error("Error stopping ambient sound:", error));
    }
  } else {
    console.warn('Unknown action:', request.action);
    sendResponse({success: false, error: 'Unknown action'});
  }
});

async function handleAudioRequest(request) {
  console.log("Handling audio request in background:", request);
  await createOffscreen();
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, (response) => {
      console.log("Received response from offscreen:", response);
      if (chrome.runtime.lastError) {
        console.error("Error in handleAudioRequest:", chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        focusSession.currentSound = request.action === 'playAmbientSound' ? request.sound : null;
        resolve(response);
      }
    });
  });
}

async function createOffscreen() {
  console.log("Attempting to create offscreen document");
  if (await chrome.offscreen.hasDocument()) {
    console.log("Offscreen document already exists");
    return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Playing ambient sounds for focus sessions'
    });
    console.log("Offscreen document created successfully");
  } catch (error) {
    console.error("Error creating offscreen document:", error);
  }
}

async function startFocusSession(duration, selectedTabs, ambientSound) {
  console.log("Starting focus session", duration, selectedTabs, ambientSound);
  try {
    focusSession.active = true;
    focusSession.endTime = Date.now() + duration * 60000;
    focusSession.allowedUrls = [];
    focusSession.originalUrls = {}; // Reset original URLs
    focusSession.closedTabs = [];

    // Close all incognito windows
    await closeIncognitoWindows();

    const allTabs = await chrome.tabs.query({});
    
    for (const tab of allTabs) {
      if (selectedTabs.includes(tab.id)) {
        focusSession.allowedUrls.push(tab.url);
        focusSession.originalUrls[tab.id] = tab.url; // Store original URL for each allowed tab
      } else {
        focusSession.closedTabs.push({url: tab.url, pinned: tab.pinned});
      }
    }

    const tabsToClose = allTabs.filter(tab => !selectedTabs.includes(tab.id)).map(tab => tab.id);

    if (tabsToClose.length > 0) {
      await chrome.tabs.remove(tabsToClose);
    }

    await chrome.storage.local.set({ focusSession });
    applyRestrictions();

    chrome.alarms.create('focusSessionEnd', { delayInMinutes: duration });

    if (ambientSound && ambientSound !== 'no-sound') {
      handleAudioRequest({ action: 'playAmbientSound', sound: ambientSound }).catch(error => {
        console.error("Error playing ambient sound:", error);
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error in startFocusSession:', error);
    return { success: false, error: error.message };
  }
}

async function endFocusSession(stopSound = true) {
  console.log("Starting endFocusSession");
  try {
    if (!focusSession.active) {
      console.log("No active session to end");
      return;
    }

    focusSession.active = false;
    focusSession.endTime = null;

    // Clear the alarm
    await chrome.alarms.clear('focusSessionEnd');

    // Close all incognito windows
    await closeIncognitoWindows();

    console.log("Calling rollbackTabs");
    await rollbackTabs();

    focusSession.closedTabs = [];
    focusSession.currentSound = null;
    focusSession.allowedUrls = [];
    focusSession.originalUrls = {};
    await chrome.storage.local.set({ focusSession });
    removeRestrictions();
    if (stopSound) {
      await handleAudioRequest({ action: 'stopAmbientSound' });
    }
    chrome.runtime.sendMessage({ action: 'sessionEnded' });
    console.log("endFocusSession completed successfully");
  } catch (error) {
    console.error("Error in endFocusSession:", error);
    chrome.runtime.sendMessage({ 
      action: 'sessionEndedWithError', 
      error: error.message 
    });
  }
}

async function rollbackTabs() {
  console.log("Starting tab rollback");
  isRestoringTabs = true;
  
  try {
    const currentTabs = await chrome.tabs.query({});
    console.log("Current tabs:", currentTabs);
    
    // Reopen tabs that were closed during the session
    for (const tab of focusSession.closedTabs) {
      console.log("Reopening tab:", tab.url);
      try {
        await chrome.tabs.create({
          url: tab.url,
          pinned: tab.pinned
        });
      } catch (error) {
        console.error("Error reopening tab:", error);
      }
    }

    // Only close tabs if we successfully reopened the closed ones
    if (focusSession.closedTabs.length > 0) {
      // Close tabs that weren't open when the session started
      for (const tab of currentTabs) {
        if (!focusSession.originalUrls.hasOwnProperty(tab.id)) {
          console.log("Closing tab:", tab.id, tab.url);
          try {
            await chrome.tabs.remove(tab.id);
          } catch (error) {
            console.error("Error closing tab:", error);
          }
        }
      }
    } else {
      console.log("No tabs to reopen, skipping tab closure");
    }

    console.log("Tab rollback completed");
  } catch (error) {
    console.error("Error in rollbackTabs:", error);
  } finally {
    isRestoringTabs = false;
    // Ensure at least one tab is open
    const allTabs = await chrome.tabs.query({});
    if (allTabs.length === 0) {
      await chrome.tabs.create({ url: 'chrome://newtab' });
    }
  }
}

function applyRestrictions() {
  chrome.tabs.onCreated.addListener(onTabCreated);
  chrome.tabs.onUpdated.addListener(onTabUpdated);
}

function removeRestrictions() {
  chrome.tabs.onCreated.removeListener(onTabCreated);
  chrome.tabs.onUpdated.removeListener(onTabUpdated);
}

function onTabCreated(tab) {
  if (focusSession.active && !isRestoringTabs) {
    chrome.tabs.remove(tab.id);
  }
}

function onTabUpdated(tabId, changeInfo, tab) {
  if (focusSession.active && changeInfo.url) {
    const originalUrl = focusSession.originalUrls[tabId];
    if (originalUrl) {
      const originalDomain = new URL(originalUrl).hostname;
      const newDomain = new URL(changeInfo.url).hostname;
      
      if (originalDomain !== newDomain) {
        chrome.tabs.update(tabId, { url: originalUrl });
      }
    }
  }

  // Check if all allowed tabs are closed
  if (focusSession.active) {
    chrome.tabs.query({}, (tabs) => {
      const allowedTabsOpen = tabs.some(tab => focusSession.originalUrls.hasOwnProperty(tab.id));
      if (!allowedTabsOpen) {
        endFocusSession(true);
      }
    });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'focusSessionEnd') {
    endFocusSession(true);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get(['focusSession']);
  if (data.focusSession && data.focusSession.active) {
    focusSession = data.focusSession;
    const remainingTime = (focusSession.endTime - Date.now()) / 60000;
    if (remainingTime > 0) {
      applyRestrictions();
      chrome.alarms.create('focusSessionEnd', { delayInMinutes: remainingTime });
      if (focusSession.currentSound) {
        await handleAudioRequest({ action: 'playAmbientSound', sound: focusSession.currentSound });
      }
    } else {
      await endFocusSession();
    }
  }
});

// Apply restrictions immediately when the background script loads
chrome.storage.local.get(['focusSession'], (data) => {
  if (data.focusSession && data.focusSession.active) {
    focusSession = data.focusSession;
    applyRestrictions();
  }
});

async function closeIncognitoWindows() {
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    for (const window of windows) {
      if (window.incognito) {
        await chrome.windows.remove(window.id);
      }
    }
  } catch (error) {
    console.error('Error closing incognito windows:', error);
  }
}