import { wsTransport } from '../websocket/transport';
import { useAppStore } from '../state/store';

class AudioCapture {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;
  
  private silenceTimer: number | null = null;
  private volumeHistory: number[] = [];
  private readonly SILENCE_TIMEOUT_MS = 800; // 0.8 seconds as requested
  
  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm' });
      
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0 && wsTransport) {
          wsTransport.sendAudio(e.data);
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

      // Chunk every 500ms
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
    const isSpeaking = rms > noiseFloor + 12;

    if (isSpeaking) {
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
    } else {
      if (!this.silenceTimer && this.volumeHistory.length > 50) { // Wait for baseline
        this.silenceTimer = window.setTimeout(() => {
          console.log("Silence detected. Stopping recording.");
          this.stop();
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
