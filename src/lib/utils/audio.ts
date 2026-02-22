import { get } from 'svelte/store';
import { soundEnabled } from '$lib/stores/sound';

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	if (!audioContext) {
		audioContext = new AudioContext();
	}
	return audioContext;
}

export async function resumeAudio() {
	const ctx = getContext();
	if (ctx && ctx.state === 'suspended') {
		await ctx.resume();
	}
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.1) {
	if (!get(soundEnabled)) return;
	const ctx = getContext();
	if (!ctx) return;

	const osc = ctx.createOscillator();
	const gain = ctx.createGain();

	osc.type = type;
	osc.frequency.setValueAtTime(frequency, ctx.currentTime);

	gain.gain.setValueAtTime(volume, ctx.currentTime);
	gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

	osc.connect(gain);
	gain.connect(ctx.destination);

	osc.start(ctx.currentTime);
	osc.stop(ctx.currentTime + duration);
}

function playNoise(duration: number, volume: number = 0.05) {
	if (!get(soundEnabled)) return;
	const ctx = getContext();
	if (!ctx) return;

	const bufferSize = ctx.sampleRate * duration;
	const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
	const data = buffer.getChannelData(0);

	for (let i = 0; i < bufferSize; i++) {
		data[i] = Math.random() * 2 - 1;
	}

	const source = ctx.createBufferSource();
	source.buffer = buffer;

	const filter = ctx.createBiquadFilter();
	filter.type = 'lowpass';
	filter.frequency.setValueAtTime(2000, ctx.currentTime);

	const gain = ctx.createGain();
	gain.gain.setValueAtTime(volume, ctx.currentTime);
	gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

	source.connect(filter);
	filter.connect(gain);
	gain.connect(ctx.destination);

	source.start(ctx.currentTime);
}

export function playWhoosh() {
	if (!get(soundEnabled)) return;
	const ctx = getContext();
	if (!ctx) return;

	const bufferSize = ctx.sampleRate * 0.3;
	const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < bufferSize; i++) {
		data[i] = Math.random() * 2 - 1;
	}

	const source = ctx.createBufferSource();
	source.buffer = buffer;

	const filter = ctx.createBiquadFilter();
	filter.type = 'bandpass';
	filter.frequency.setValueAtTime(500, ctx.currentTime);
	filter.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.15);
	filter.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.3);
	filter.Q.setValueAtTime(2, ctx.currentTime);

	const gain = ctx.createGain();
	gain.gain.setValueAtTime(0.08, ctx.currentTime);
	gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

	source.connect(filter);
	filter.connect(gain);
	gain.connect(ctx.destination);
	source.start(ctx.currentTime);
}

export function playTick() {
	playTone(800, 0.05, 'sine', 0.05);
}

export function playClick() {
	playNoise(0.03, 0.06);
}

export function playSectionEnter() {
	if (!get(soundEnabled)) return;
	const ctx = getContext();
	if (!ctx) return;

	[261.63, 329.63, 392.00].forEach((freq, i) => {
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(freq, ctx.currentTime);
		gain.gain.setValueAtTime(0, ctx.currentTime);
		gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.1 + i * 0.05);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start(ctx.currentTime + i * 0.05);
		osc.stop(ctx.currentTime + 0.6);
	});
}

export function playError() {
	playTone(100, 0.2, 'sawtooth', 0.06);
}

export function playBoom() {
	if (!get(soundEnabled)) return;
	const ctx = getContext();
	if (!ctx) return;

	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(60, ctx.currentTime);
	osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.4);
	gain.gain.setValueAtTime(0.15, ctx.currentTime);
	gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
	osc.connect(gain);
	gain.connect(ctx.destination);
	osc.start(ctx.currentTime);
	osc.stop(ctx.currentTime + 0.5);

	playNoise(0.15, 0.04);
}

export function playTypewriter() {
	playNoise(0.02, 0.08);
}

export function playDeploy() {
	if (!get(soundEnabled)) return;
	const ctx = getContext();
	if (!ctx) return;

	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(200, ctx.currentTime);
	osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);
	gain.gain.setValueAtTime(0.08, ctx.currentTime);
	gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
	osc.connect(gain);
	gain.connect(ctx.destination);
	osc.start(ctx.currentTime);
	osc.stop(ctx.currentTime + 0.35);
}

export function playBlip() {
	playTone(600, 0.08, 'sine', 0.04);
}

export function playPing() {
	playTone(1200, 0.1, 'sine', 0.03);
}

// --- New sounds for current site ---

// Loading gear: subtle hum that rises in pitch as spin speeds up
export function playGearHum(speed: number) {
	if (!get(soundEnabled)) return;
	const ctx = getContext();
	if (!ctx) return;

	const freq = 80 + speed * 400;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(freq, ctx.currentTime);
	gain.gain.setValueAtTime(0.03, ctx.currentTime);
	gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
	osc.connect(gain);
	gain.connect(ctx.destination);
	osc.start(ctx.currentTime);
	osc.stop(ctx.currentTime + 0.12);
}

// Loading gear: explosion burst
export function playGearExplode() {
	if (!get(soundEnabled)) return;
	const ctx = getContext();
	if (!ctx) return;

	// Sub impact
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(80, ctx.currentTime);
	osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.5);
	gain.gain.setValueAtTime(0.12, ctx.currentTime);
	gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
	osc.connect(gain);
	gain.connect(ctx.destination);
	osc.start(ctx.currentTime);
	osc.stop(ctx.currentTime + 0.6);

	// Scatter noise
	playNoise(0.25, 0.06);

	// High shimmer
	playTone(1400, 0.3, 'sine', 0.03);
	playTone(2100, 0.25, 'sine', 0.02);
}

// Grid pulse: soft high-pitched ping, barely audible
export function playGridPulse() {
	if (!get(soundEnabled)) return;
	const ctx = getContext();
	if (!ctx) return;

	const freq = 1800 + Math.random() * 600;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(freq, ctx.currentTime);
	osc.frequency.exponentialRampToValueAtTime(freq * 0.7, ctx.currentTime + 0.15);
	gain.gain.setValueAtTime(0.012, ctx.currentTime);
	gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
	osc.connect(gain);
	gain.connect(ctx.destination);
	osc.start(ctx.currentTime);
	osc.stop(ctx.currentTime + 0.18);
}

// Scroll transition: whoosh that changes pitch based on direction
export function playScrollWhoosh(progress: number) {
	if (!get(soundEnabled)) return;
	const ctx = getContext();
	if (!ctx) return;

	const bufferSize = ctx.sampleRate * 0.15;
	const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < bufferSize; i++) {
		data[i] = Math.random() * 2 - 1;
	}

	const source = ctx.createBufferSource();
	source.buffer = buffer;

	const filter = ctx.createBiquadFilter();
	filter.type = 'bandpass';
	const baseFreq = 300 + progress * 1500;
	filter.frequency.setValueAtTime(baseFreq, ctx.currentTime);
	filter.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, ctx.currentTime + 0.15);
	filter.Q.setValueAtTime(3, ctx.currentTime);

	const gain = ctx.createGain();
	gain.gain.setValueAtTime(0.03, ctx.currentTime);
	gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

	source.connect(filter);
	filter.connect(gain);
	gain.connect(ctx.destination);
	source.start(ctx.currentTime);
}

// Form: soft focus sound
export function playFocus() {
	playTone(660, 0.08, 'sine', 0.025);
}

// Form: send success — ascending chord
export function playSendSuccess() {
	if (!get(soundEnabled)) return;
	const ctx = getContext();
	if (!ctx) return;

	[523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(freq, ctx.currentTime);
		gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.08);
		gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + i * 0.08 + 0.05);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.4);
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start(ctx.currentTime + i * 0.08);
		osc.stop(ctx.currentTime + i * 0.08 + 0.5);
	});
}

// Form: send error — descending minor
export function playSendError() {
	if (!get(soundEnabled)) return;
	playTone(400, 0.15, 'sawtooth', 0.04);
	setTimeout(() => playTone(300, 0.2, 'sawtooth', 0.04), 150);
}

// --- Continuous particle rustle system ---
// Persistent filtered noise whose volume + filter respond to cursor speed

let rustleSource: AudioBufferSourceNode | null = null;
let rustleGain: GainNode | null = null;
let rustleFilter: BiquadFilterNode | null = null;
let rustleHighFilter: BiquadFilterNode | null = null;
let rustleRunning = false;

export function startParticleRustle() {
	if (rustleRunning) return;
	const ctx = getContext();
	if (!ctx) return;

	// Create a long looping noise buffer (2 seconds)
	const len = ctx.sampleRate * 2;
	const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < len; i++) {
		data[i] = Math.random() * 2 - 1;
	}

	rustleSource = ctx.createBufferSource();
	rustleSource.buffer = buffer;
	rustleSource.loop = true;

	// Bandpass: gives it a "rustle/shimmer" quality
	rustleFilter = ctx.createBiquadFilter();
	rustleFilter.type = 'bandpass';
	rustleFilter.frequency.setValueAtTime(800, ctx.currentTime);
	rustleFilter.Q.setValueAtTime(1.5, ctx.currentTime);

	// High shelf for extra sparkle when pushing fast
	rustleHighFilter = ctx.createBiquadFilter();
	rustleHighFilter.type = 'highshelf';
	rustleHighFilter.frequency.setValueAtTime(3000, ctx.currentTime);
	rustleHighFilter.gain.setValueAtTime(-12, ctx.currentTime);

	rustleGain = ctx.createGain();
	rustleGain.gain.setValueAtTime(0, ctx.currentTime);

	rustleSource.connect(rustleFilter);
	rustleFilter.connect(rustleHighFilter);
	rustleHighFilter.connect(rustleGain);
	rustleGain.connect(ctx.destination);

	rustleSource.start(ctx.currentTime);
	rustleRunning = true;
}

export function stopParticleRustle() {
	if (rustleSource) {
		try { rustleSource.stop(); } catch {}
		rustleSource = null;
	}
	rustleGain = null;
	rustleFilter = null;
	rustleHighFilter = null;
	rustleRunning = false;
}

// Call this every frame from the particle animate loop
// hitForce: sum of cursor-particle collision forces this frame (0 = no contact)
export function updateParticleRustle(hitForce: number) {
	if (!get(soundEnabled) || !rustleGain || !rustleFilter || !rustleHighFilter) return;
	const ctx = getContext();
	if (!ctx) return;

	const t = ctx.currentTime;

	// Hard cutoff: no contact = absolute silence
	if (hitForce < 0.001) {
		rustleGain.gain.setTargetAtTime(0, t, 0.03);
		return;
	}

	const e = Math.min(hitForce, 1);

	rustleGain.gain.setTargetAtTime(e * 0.07, t, 0.02);
	rustleFilter.frequency.setTargetAtTime(600 + e * 3000, t, 0.05);
	rustleHighFilter.gain.setTargetAtTime(-14 + e * 16, t, 0.08);
}
