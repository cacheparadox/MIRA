import { wsTransport } from '../websocket/transport';
import { useAppStore } from '../state/store';

class AudioCapture {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;
  
  private silenceTimer: number | null = null;
  private volumeHistory: number[] = [];
  private hasSpokenInTurn: boolean = false;
  private consecutiveSpeechFrames: number = 0;
  private pendingEvent: 'SPEECH_END' | 'INTERRUPT' | null = null;
  private readonly SILENCE_TIMEOUT_MS = 800; // 0.8 seconds as requested
  
  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm' });
      
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        if (this.audioChunks.length > 0 && wsTransport) {
          const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
          wsTransport.sendAudio(blob);
          
          if (this.pendingEvent) {
            wsTransport.sendEvent(this.pendingEvent, {});
            this.pendingEvent = null;
          }
        }
        this.audioChunks = [];
        // Immediately restart if still listening
        if (useAppStore.getState().isListening && this.stream) {
          this.mediaRecorder?.start(500);
        }
      };

      // Set up VAD & Volume Analyzer
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
      
      this.volumeHistory = [];
      this.monitorAudio();

      // Start recording
      this.mediaRecorder.start(500);
      useAppStore.getState().setListening(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  }

  private monitorAudio = () => {
    if (!this.analyser) return;
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    
    // Calculate RMS volume (0-255)
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    
    // Update global state for visualizer
    useAppStore.getState().setCurrentVolume(rms);

    // Dynamic noise floor (10th percentile of last 100 frames)
    this.volumeHistory.push(rms);
    if (this.volumeHistory.length > 100) this.volumeHistory.shift();
    
    let noiseFloor = 5;
    if (this.volumeHistory.length >= 50) {
      const sorted = [...this.volumeHistory].sort((a, b) => a - b);
      noiseFloor = sorted[Math.floor(sorted.length * 0.1)];
    }

    // Speech threshold
    const isMiraSpeaking = useAppStore.getState().isSpeaking;
    const threshold = isMiraSpeaking ? noiseFloor + 40 : noiseFloor + 12; // Harder to trigger if MIRA is speaking
    const isLoud = rms > threshold;

    if (isLoud) {
      this.consecutiveSpeechFrames++;
    } else {
      this.consecutiveSpeechFrames = 0;
    }

    // Require ~80ms normally, but ~400ms (25 frames) of sustained loud volume to barge-in over MIRA
    const framesRequired = isMiraSpeaking ? 25 : 5; 
    const isSpeaking = this.consecutiveSpeechFrames > framesRequired;

    if (isSpeaking) {
      this.hasSpokenInTurn = true;
      if (isMiraSpeaking) {
        // Barge-in! User is speaking while MIRA is speaking.
        console.log("Interrupting MIRA!");
        useAppStore.getState().setSpeaking(false);
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          this.pendingEvent = 'INTERRUPT';
          this.mediaRecorder.stop(); // Triggers onstop, sends audio, sends INTERRUPT, restarts
        } else if (wsTransport) {
          wsTransport.sendEvent('INTERRUPT', {});
        }
        // Reset so we don't spam INTERRUPT
        this.consecutiveSpeechFrames = 0;
      }
      
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
    } else {
      if (!this.silenceTimer && this.hasSpokenInTurn) { // Wait for baseline and ensure user actually spoke
        this.silenceTimer = window.setTimeout(() => {
          console.log("Silence detected. Sending audio to process.");
          if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.pendingEvent = 'SPEECH_END';
            this.mediaRecorder.stop(); // Triggers onstop, sends audio, sends SPEECH_END, restarts
          } else if (wsTransport) {
            wsTransport.sendEvent('SPEECH_END', {});
          }
          this.hasSpokenInTurn = false;
          this.silenceTimer = null;
        }, this.SILENCE_TIMEOUT_MS);
      }
    }

    this.animationFrameId = requestAnimationFrame(this.monitorAudio);
  };

  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    useAppStore.getState().setCurrentVolume(0);

    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }
    } catch (e) {
      console.error("Error stopping audio capture:", e);
    } finally {
      useAppStore.getState().setListening(false);
      
      // Notify backend that speech ended to trigger response
      if (wsTransport) {
        wsTransport.sendEvent('SPEECH_END', {});
      }
    }
  }
}

export const audioCapture = typeof window !== 'undefined' ? new AudioCapture() : null;
