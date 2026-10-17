// ========== Audio System (WebAudio Synthesis) ==========
const AudioSystem = (() => {
  let audioContext = null;
  let masterGain = null;
  let isMuted = localStorage.getItem('nt_audio_muted') === '1';
  let activeSounds = [];
  const MAX_CONCURRENT_SOUNDS = 4;

  // Lazy initialization on first user gesture
  function initAudio() {
    if (audioContext) return;
    
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioContext.createGain();
      masterGain.gain.value = isMuted ? 0 : 0.25;
      masterGain.connect(audioContext.destination);
    } catch (e) {
      console.warn('WebAudio not supported:', e);
    }
  }

  // Initialize on first user interaction
  ['click', 'touchstart', 'keydown'].forEach(event => {
    document.addEventListener(event, initAudio, { once: true, passive: true });
  });

  // Sound limiter
  function addSound(sound) {
    if (activeSounds.length >= MAX_CONCURRENT_SOUNDS) {
      const oldest = activeSounds.shift();
      try {
        oldest.stop();
        oldest.disconnect();
      } catch (e) {}
    }
    activeSounds.push(sound);
    
    sound.onended = () => {
      const idx = activeSounds.indexOf(sound);
      if (idx > -1) activeSounds.splice(idx, 1);
    };
  }

  // Create oscillator with envelope
  function createTone(frequency, duration, type = 'sine', gainValue = 0.15) {
    if (!audioContext || isMuted) return null;

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.type = type;
    osc.frequency.value = frequency;
    
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(gainValue, audioContext.currentTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start();
    osc.stop(audioContext.currentTime + duration);
    
    addSound(osc);
    return osc;
  }

  // Create frequency sweep
  function createSweep(startFreq, endFreq, duration, type = 'sawtooth', gainValue = 0.15) {
    if (!audioContext || isMuted) return null;

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, audioContext.currentTime);
    osc.frequency.linearRampToValueAtTime(endFreq, audioContext.currentTime + duration);
    
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(gainValue, audioContext.currentTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start();
    osc.stop(audioContext.currentTime + duration);
    
    addSound(osc);
    return osc;
  }

  // Create filtered noise
  function createNoise(duration, filterType = 'highpass', filterFreq = 2000, gainValue = 0.1) {
    if (!audioContext || isMuted) return null;

    const bufferSize = audioContext.sampleRate * duration;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioContext.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(gainValue, audioContext.currentTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    
    noise.start();
    noise.stop(audioContext.currentTime + duration);
    
    addSound(noise);
    return noise;
  }

  // ========== Sound Effects ==========

  // Purchase: two ascending tones
  function playPurchase() {
    if (!audioContext || isMuted) return;
    createTone(660, 0.04, 'sine', 0.15);
    setTimeout(() => createTone(880, 0.04, 'sine', 0.15), 40);
  }

  // Upgrade: three ascending tones
  function playUpgrade() {
    if (!audioContext || isMuted) return;
    createTone(440, 0.06, 'triangle', 0.15);
    setTimeout(() => createTone(660, 0.06, 'triangle', 0.15), 60);
    setTimeout(() => createTone(880, 0.06, 'triangle', 0.15), 120);
  }

  // Quest complete: melodic chord
  function playQuest() {
    if (!audioContext || isMuted) return;
    createTone(440, 0.12, 'sine', 0.12);
    setTimeout(() => createTone(554, 0.12, 'sine', 0.12), 20); // +5 semitones
    setTimeout(() => createTone(660, 0.12, 'sine', 0.12), 40);
  }

  // Contract accept: descending bass
  function playContractAccept() {
    if (!audioContext || isMuted) return;
    createSweep(220, 110, 0.1, 'sawtooth', 0.15);
  }

  // Contract success: ascending melody
  function playContractSuccess() {
    if (!audioContext || isMuted) return;
    createTone(440, 0.08, 'sine', 0.15);
    setTimeout(() => createTone(554, 0.08, 'sine', 0.15), 80);
    setTimeout(() => createTone(660, 0.08, 'sine', 0.15), 160);
    setTimeout(() => createTone(880, 0.08, 'sine', 0.15), 240);
  }

  // Gateway blocked: dull thud + beep
  function playGatewayBlocked() {
    if (!audioContext || isMuted) return;
    
    // Dull thud
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    const filter1 = audioContext.createBiquadFilter();
    
    osc1.type = 'sine';
    osc1.frequency.value = 110;
    
    filter1.type = 'lowpass';
    filter1.frequency.value = 500;
    
    gain1.gain.setValueAtTime(0, audioContext.currentTime);
    gain1.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.01);
    gain1.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.05);
    
    osc1.connect(filter1);
    filter1.connect(gain1);
    gain1.connect(masterGain);
    
    osc1.start();
    osc1.stop(audioContext.currentTime + 0.05);
    addSound(osc1);
    
    // Checkmark beep
    setTimeout(() => createTone(880, 0.03, 'sine', 0.1), 60);
  }

  // Gateway hit: hissing noise
  function playGatewayHit() {
    if (!audioContext || isMuted) return;
    createNoise(0.4, 'highpass', 2000, 0.1);
  }

  // Prestige: low rumble + ascending sweep
  function playPrestige() {
    if (!audioContext || isMuted) return;
    
    // Low rumble
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    
    osc1.type = 'sawtooth';
    osc1.frequency.value = 55;
    
    gain1.gain.setValueAtTime(0, audioContext.currentTime);
    gain1.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.1);
    gain1.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.8);
    
    osc1.connect(gain1);
    gain1.connect(masterGain);
    
    osc1.start();
    osc1.stop(audioContext.currentTime + 0.8);
    addSound(osc1);
    
    // Ascending sweep
    setTimeout(() => createSweep(55, 880, 0.7, 'sawtooth', 0.12), 100);
  }

  // UI click: minimal blip
  function playClickUI() {
    if (!audioContext || isMuted) return;
    createTone(1200, 0.02, 'sine', 0.05);
  }

  // Mute/unmute
  function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem('nt_audio_muted', isMuted ? '1' : '0');
    
    if (masterGain) {
      masterGain.gain.value = isMuted ? 0 : 0.25;
    }
    
    return isMuted;
  }

  function isAudioMuted() {
    return isMuted;
  }

  // Visibility change handler
  document.addEventListener('visibilitychange', () => {
    if (masterGain) {
      if (document.hidden) {
        masterGain.gain.value = isMuted ? 0 : 0.1; // Attenuate
      } else {
        masterGain.gain.value = isMuted ? 0 : 0.25; // Restore
      }
    }
  });

  return {
    playPurchase,
    playUpgrade,
    playQuest,
    playContractAccept,
    playContractSuccess,
    playGatewayBlocked,
    playGatewayHit,
    playPrestige,
    playClickUI,
    toggleMute,
    isAudioMuted
  };
})();

// Export to global scope
window.AudioSystem = AudioSystem;
