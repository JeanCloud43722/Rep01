type SoundCue = 
  | 'order-ready'      // Customer: urgent buzzer for pickup
  | 'message'          // Customer: gentle chime for staff message
  | 'offer'            // Customer: playful arpeggio for special offer
  | 'status-update'    // Customer: subtle ping for status change
  | 'service-request'  // Staff: urgent alert when customer calls waiter
  | 'new-registration' // Staff: upbeat when customer registers
  | 'order-completed'; // Staff: satisfying completion sound

interface AudioCueConfig {
  play: (ctx: AudioContext, time: number) => void;
  duration: number;
}

type UnlockListener = (isUnlocked: boolean) => void;

class AudioManager {
  private static instance: AudioManager;
  private audioContext: AudioContext | null = null;
  private isWarmedUp = false;
  private _isUnlocked = false;
  private volume = 0.7;
  private silentAudio: HTMLAudioElement | null = null;
  private unlockListeners: Set<UnlockListener> = new Set();
  
  private constructor() {}
  
  onUnlockChange(listener: UnlockListener): () => void {
    this.unlockListeners.add(listener);
    listener(this._isUnlocked);
    return () => this.unlockListeners.delete(listener);
  }
  
  private notifyUnlockListeners(): void {
    this.unlockListeners.forEach(listener => listener(this._isUnlocked));
  }
  
  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }
  
  get isUnlocked(): boolean {
    return this._isUnlocked;
  }
  
  async unlock(): Promise<boolean> {
    if (this._isUnlocked) return true;
    
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.1);
      
      if (!this.silentAudio) {
        this.silentAudio = new Audio();
        this.silentAudio.setAttribute('playsinline', 'true');
        this.silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      }
      
      try {
        await this.silentAudio.play();
        this.silentAudio.pause();
        this.silentAudio.currentTime = 0;
      } catch (e) {
        console.log('Audio Manager: HTMLAudioElement fallback silent play', e);
      }
      
      this._isUnlocked = true;
      this.isWarmedUp = true;
      console.log('Audio Manager: iOS audio unlocked via user gesture');
      this.notifyUnlockListeners();
      return true;
    } catch (error) {
      console.error('Audio Manager: Failed to unlock audio', error);
      return false;
    }
  }
  
  warmUp(): void {
    if (this.isWarmedUp) return;
    
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      
      this.isWarmedUp = true;
      console.log('Audio Manager: Context warmed up');
    } catch (error) {
      console.error('Audio Manager: Failed to warm up context', error);
    }
  }
  
  private getContext(): AudioContext | null {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        return null;
      }
    }
    
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    return this.audioContext;
  }
  
  setVolume(level: number): void {
    this.volume = Math.max(0, Math.min(1, level));
  }
  
  getVolume(): number {
    return this.volume;
  }
  
  private createOscillator(
    ctx: AudioContext,
    type: OscillatorType,
    frequency: number,
    startTime: number,
    duration: number,
    gainEnvelope: { attack: number; sustain: number; release: number; peak: number }
  ): void {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    
    const { attack, sustain, release, peak } = gainEnvelope;
    const adjustedPeak = peak * this.volume;
    
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(adjustedPeak, startTime + attack);
    gainNode.gain.setValueAtTime(adjustedPeak, startTime + attack + sustain);
    gainNode.gain.linearRampToValueAtTime(0, startTime + attack + sustain + release);
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }
  
  private cues: Record<SoundCue, AudioCueConfig> = {
    'order-ready': {
      duration: 1.5,
      play: (ctx, now) => {
        // Clear, attention-grabbing "ding-dong" chime sound
        // First note: higher pitched "ding"
        const playChime = (startTime: number, freq1: number, freq2: number) => {
          // Primary tone
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.value = freq1;
          gain1.gain.setValueAtTime(0, startTime);
          gain1.gain.linearRampToValueAtTime(0.4 * this.volume, startTime + 0.01);
          gain1.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
          osc1.connect(gain1);
          gain1.connect(ctx.destination);
          osc1.start(startTime);
          osc1.stop(startTime + 0.5);
          
          // Harmonic overtone for richness
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.value = freq1 * 2;
          gain2.gain.setValueAtTime(0, startTime);
          gain2.gain.linearRampToValueAtTime(0.15 * this.volume, startTime + 0.01);
          gain2.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(startTime);
          osc2.stop(startTime + 0.3);
          
          // Second note after short delay
          const osc3 = ctx.createOscillator();
          const gain3 = ctx.createGain();
          osc3.type = 'sine';
          osc3.frequency.value = freq2;
          gain3.gain.setValueAtTime(0, startTime + 0.25);
          gain3.gain.linearRampToValueAtTime(0.35 * this.volume, startTime + 0.26);
          gain3.gain.exponentialRampToValueAtTime(0.001, startTime + 0.75);
          osc3.connect(gain3);
          gain3.connect(ctx.destination);
          osc3.start(startTime + 0.25);
          osc3.stop(startTime + 0.75);
        };
        
        // Play the chime twice for emphasis (ding-dong, ding-dong)
        playChime(now, 880, 659.25);       // A5 -> E5 (classic doorbell)
        playChime(now + 0.7, 880, 659.25); // Repeat for attention
      }
    },
    
    'message': {
      duration: 0.6,
      play: (ctx, now) => {
        const notes = [
          { freq: 523.25, start: 0 },      // C5
          { freq: 659.25, start: 0.15 },   // E5
          { freq: 783.99, start: 0.3 },    // G5
        ];
        
        notes.forEach(({ freq, start }) => {
          this.createOscillator(ctx, 'sine', freq, now + start, 0.25, {
            attack: 0.02,
            sustain: 0.1,
            release: 0.13,
            peak: 0.3
          });
        });
      }
    },
    
    'offer': {
      duration: 0.8,
      play: (ctx, now) => {
        const notes = [
          { freq: 392, start: 0 },        // G4
          { freq: 493.88, start: 0.1 },   // B4
          { freq: 587.33, start: 0.2 },   // D5
          { freq: 783.99, start: 0.3 },   // G5
          { freq: 880, start: 0.4 },      // A5
        ];
        
        notes.forEach(({ freq, start }) => {
          this.createOscillator(ctx, 'triangle', freq, now + start, 0.3, {
            attack: 0.02,
            sustain: 0.1,
            release: 0.18,
            peak: 0.25
          });
        });
      }
    },
    
    'status-update': {
      duration: 0.4,
      play: (ctx, now) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        
        osc.type = 'sine';
        osc.frequency.value = 1200;
        
        filter.type = 'highpass';
        filter.frequency.value = 800;
        filter.Q.value = 5;
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2 * this.volume, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.4);
      }
    },
    
    'service-request': {
      duration: 1.0,
      play: (ctx, now) => {
        const playSequence = (offset: number) => {
          const tones = [
            { freq: 880, start: 0 },        // A5
            { freq: 698.46, start: 0.12 },  // F5
            { freq: 523.25, start: 0.24 },  // C5
          ];
          
          tones.forEach(({ freq, start }) => {
            this.createOscillator(ctx, 'triangle', freq, now + offset + start, 0.15, {
              attack: 0.01,
              sustain: 0.08,
              release: 0.06,
              peak: 0.35
            });
          });
        };
        
        playSequence(0);
        playSequence(0.5);
      }
    },
    
    'new-registration': {
      duration: 0.5,
      play: (ctx, now) => {
        const notes = [
          { freq: 392, start: 0 },        // G4
          { freq: 493.88, start: 0.1 },   // B4
          { freq: 587.33, start: 0.2 },   // D5
        ];
        
        notes.forEach(({ freq, start }) => {
          this.createOscillator(ctx, 'sine', freq, now + start, 0.2, {
            attack: 0.02,
            sustain: 0.08,
            release: 0.1,
            peak: 0.25
          });
        });
      }
    },
    
    'order-completed': {
      duration: 0.5,
      play: (ctx, now) => {
        this.createOscillator(ctx, 'sine', 349.23, now, 0.2, {
          attack: 0.02,
          sustain: 0.1,
          release: 0.08,
          peak: 0.3
        });
        
        this.createOscillator(ctx, 'sine', 523.25, now + 0.2, 0.25, {
          attack: 0.02,
          sustain: 0.12,
          release: 0.11,
          peak: 0.3
        });
      }
    }
  };
  
  play(cue: SoundCue): boolean {
    const ctx = this.getContext();
    if (!ctx) {
      console.warn('Audio Manager: No audio context available');
      return false;
    }
    
    const cueConfig = this.cues[cue];
    if (!cueConfig) {
      console.warn(`Audio Manager: Unknown cue "${cue}"`);
      return false;
    }
    
    try {
      cueConfig.play(ctx, ctx.currentTime);
      return true;
    } catch (error) {
      console.error(`Audio Manager: Failed to play "${cue}"`, error);
      return false;
    }
  }
  
  playIfUnlocked(cue: SoundCue): boolean {
    if (!this._isUnlocked) {
      console.warn('Audio Manager: Cannot play - audio not unlocked. User gesture required.');
      return false;
    }
    return this.play(cue);
  }
  
  playWithDelay(cue: SoundCue, delayMs: number): void {
    setTimeout(() => this.play(cue), delayMs);
  }
  
  playIfUnlockedWithDelay(cue: SoundCue, delayMs: number): void {
    if (!this._isUnlocked) {
      console.warn('Audio Manager: Cannot play - audio not unlocked. User gesture required.');
      return;
    }
    setTimeout(() => this.play(cue), delayMs);
  }
}

export const audioManager = AudioManager.getInstance();

export function useAudioManager() {
  const warmUp = () => audioManager.warmUp();
  const unlock = () => audioManager.unlock();
  const isUnlocked = () => audioManager.isUnlocked;
  const play = (cue: SoundCue) => audioManager.play(cue);
  const playIfUnlocked = (cue: SoundCue) => audioManager.playIfUnlocked(cue);
  const playWithDelay = (cue: SoundCue, delayMs: number) => audioManager.playWithDelay(cue, delayMs);
  const playIfUnlockedWithDelay = (cue: SoundCue, delayMs: number) => audioManager.playIfUnlockedWithDelay(cue, delayMs);
  const setVolume = (level: number) => audioManager.setVolume(level);
  const getVolume = () => audioManager.getVolume();
  
  return { warmUp, unlock, isUnlocked, play, playIfUnlocked, playWithDelay, playIfUnlockedWithDelay, setVolume, getVolume };
}
