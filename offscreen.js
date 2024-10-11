let audioContext = null;
let audioBuffers = {};
let sourceNode = null;
let audioContextInitialized = false;

async function initAudioContext() {
  if (audioContextInitialized) return;
  
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await loadSounds();
    audioContextInitialized = true;
  } catch (error) {
    // Error handling can be done here if needed
  }
}

async function loadSounds() {
  const sounds = ['fire', 'rainy', 'waves', 'coffee', 'nature'];
  for (const sound of sounds) {
    try {
      const url = chrome.runtime.getURL(`sounds/${sound}.mp3`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      audioBuffers[sound] = audioBuffer;
    } catch (error) {
      // Error handling can be done here if needed
    }
  }
}

async function playAmbientSound(sound) {
  await initAudioContext();
  
  await stopAmbientSound();
  
  if (sound !== 'no-sound') {
    if (audioBuffers[sound]) {
      try {
        sourceNode = audioContext.createBufferSource();
        sourceNode.buffer = audioBuffers[sound];
        sourceNode.loop = true;
        sourceNode.connect(audioContext.destination);
        await audioContext.resume();
        sourceNode.start();
      } catch (error) {
        throw error;
      }
    } else {
      throw new Error("Sound not loaded");
    }
  }
}

async function stopAmbientSound() {
  if (sourceNode) {
    try {
      sourceNode.stop();
      sourceNode.disconnect();
    } catch (error) {
      // Error handling can be done here if needed
    }
    sourceNode = null;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'playAmbientSound') {
    playAmbientSound(request.sound)
      .then(() => {
        sendResponse({success: true});
      })
      .catch((error) => {
        sendResponse({success: false, error: error.message});
      });
    return true;
  } else if (request.action === 'stopAmbientSound') {
    stopAmbientSound()
      .then(() => {
        sendResponse({success: true});
      })
      .catch((error) => {
        sendResponse({success: false, error: error.message});
      });
    return true;
  }
});

initAudioContext();