<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { cursorState, cursorLabel } from '$lib/stores/cursor';
	import { playTypewriter, playClick, playTick } from '$lib/utils/audio';

	// --- Types ---
	interface Gear {
		x: number;
		y: number;
		radius: number;
		teeth: number;
		angle: number;
		speed: number;
		color: string;
		label: string;
		targetX: number;
		targetY: number;
		targetRadius: number;
	}

	interface FlyingLetter {
		char: string;
		x: number;
		y: number;
		targetX: number;
		targetY: number;
		phase: 'fly-in' | 'binary' | 'through-gears' | 'fly-out' | 'done';
		progress: number;
		binary: string;
		binaryBits: { char: string; x: number; y: number; vx: number; vy: number; alpha: number }[];
		outputChar: string;
		gearIndex: number;
		alpha: number;
	}

	interface Wire {
		x1: number;
		y1: number;
		x2: number;
		y2: number;
		pulseOffset: number;
		color: string;
	}

	interface Spark {
		x: number;
		y: number;
		vx: number;
		vy: number;
		life: number;
		maxLife: number;
		color: string;
	}

	type Algorithm = 'AES-256' | 'RSA' | 'SHA-256' | 'bcrypt';

	// --- State ---
	let canvas: HTMLCanvasElement;
	let animFrame: number;
	let mounted = false;

	let plaintext = '';
	let ciphertext = '';
	let selectedAlgorithm: Algorithm = 'AES-256';
	let isBruteForcing = false;
	let bruteForceCount = 0;
	let bruteForceProgress = 0;
	let bruteForceText = '';
	let bruteForceInterval: ReturnType<typeof setInterval> | null = null;

	let inputEl: HTMLTextAreaElement;
	let tooltipText = '';
	let tooltipX = 0;
	let tooltipY = 0;
	let tooltipVisible = false;

	let flyingLetters: FlyingLetter[] = [];
	let gears: Gear[] = [];
	let wires: Wire[] = [];
	let sparks: Spark[] = [];
	let time = 0;

	let canvasWidth = 900;
	let canvasHeight = 500;
	let morphProgress = 1;
	let prevAlgorithm: Algorithm = 'AES-256';

	// --- Algorithm configs ---
	const algorithmConfigs: Record<Algorithm, {
		gearCount: number;
		labels: string[];
		colors: string[];
		bruteForceYears: string;
		bruteForceRate: number;
	}> = {
		'AES-256': {
			gearCount: 5,
			labels: ['Key Schedule', 'SubBytes', 'ShiftRows', 'MixColumns', 'AddRoundKey'],
			colors: ['#00ff88', '#00d4ff', '#b44aff', '#ff44aa', '#00ff88'],
			bruteForceYears: '~2^256 years remaining',
			bruteForceRate: 0.0000001
		},
		'RSA': {
			gearCount: 4,
			labels: ['Prime Gen', 'Key Pair', 'Modular Exp', 'Padding (OAEP)'],
			colors: ['#b44aff', '#00d4ff', '#ff44aa', '#00ff88'],
			bruteForceYears: '~10^80 years remaining',
			bruteForceRate: 0.000001
		},
		'SHA-256': {
			gearCount: 6,
			labels: ['Padding', 'Parse', 'Ch/Maj', 'Sigma', 'Compress', 'Digest'],
			colors: ['#00d4ff', '#00ff88', '#b44aff', '#ff44aa', '#00d4ff', '#00ff88'],
			bruteForceYears: '~2^128 collisions',
			bruteForceRate: 0.00001
		},
		'bcrypt': {
			gearCount: 3,
			labels: ['Salt Gen', 'Blowfish', 'Cost Rounds'],
			colors: ['#ff44aa', '#b44aff', '#00d4ff'],
			bruteForceYears: '~centuries (cost=12)',
			bruteForceRate: 0.0001
		}
	};

	// --- Encryption simulation ---
	function simulateEncrypt(text: string, algo: Algorithm): string {
		if (!text) return '';
		let result = '';
		const seed = algo === 'AES-256' ? 47 : algo === 'RSA' ? 31 : algo === 'SHA-256' ? 53 : 37;
		for (let i = 0; i < text.length; i++) {
			const code = text.charCodeAt(i);
			const mixed = ((code * seed + i * 13 + 7) ^ (seed * (i + 1))) & 0xFF;
			result += mixed.toString(16).padStart(2, '0');
		}
		if (algo === 'SHA-256') {
			// SHA always returns fixed-length
			while (result.length < 64) result += ((result.charCodeAt(result.length % result.length) * 7 + result.length) & 0xF).toString(16);
			result = result.slice(0, 64);
		}
		if (algo === 'bcrypt') {
			result = '$2b$12$' + result.slice(0, 53);
		}
		return result;
	}

	// --- Gear layout ---
	function buildGears(algo: Algorithm): Gear[] {
		const config = algorithmConfigs[algo];
		const count = config.gearCount;
		const centerX = canvasWidth / 2;
		const centerY = canvasHeight / 2;
		const spread = Math.min(canvasWidth * 0.28, 200);
		const result: Gear[] = [];

		for (let i = 0; i < count; i++) {
			const angle = ((i / count) * Math.PI * 2) - Math.PI / 2;
			const r = count <= 3 ? spread * 0.6 : spread * (0.5 + (i % 2) * 0.3);
			const x = centerX + Math.cos(angle) * r;
			const y = centerY + Math.sin(angle) * r * 0.7;
			const radius = 18 + (i % 2) * 10;
			result.push({
				x, y, radius,
				teeth: 8 + (i % 3) * 4,
				angle: 0,
				speed: (0.5 + Math.random() * 0.5) * (i % 2 === 0 ? 1 : -1),
				color: config.colors[i],
				label: config.labels[i],
				targetX: x,
				targetY: y,
				targetRadius: radius
			});
		}
		return result;
	}

	function buildWires(gearList: Gear[]): Wire[] {
		const result: Wire[] = [];
		// Input to first gear
		result.push({
			x1: canvasWidth * 0.12, y1: canvasHeight / 2,
			x2: gearList[0]?.x ?? canvasWidth * 0.35, y2: gearList[0]?.y ?? canvasHeight / 2,
			pulseOffset: 0, color: '#00d4ff'
		});
		// Between gears
		for (let i = 0; i < gearList.length - 1; i++) {
			result.push({
				x1: gearList[i].x, y1: gearList[i].y,
				x2: gearList[i + 1].x, y2: gearList[i + 1].y,
				pulseOffset: i * 0.3, color: gearList[i].color
			});
		}
		// Last gear to output
		const last = gearList[gearList.length - 1];
		result.push({
			x1: last?.x ?? canvasWidth * 0.65, y1: last?.y ?? canvasHeight / 2,
			x2: canvasWidth * 0.88, y2: canvasHeight / 2,
			pulseOffset: gearList.length * 0.3, color: '#00ff88'
		});
		return result;
	}

	// --- Morph gears on algorithm switch ---
	function switchAlgorithm(algo: Algorithm) {
		if (algo === selectedAlgorithm) return;
		playClick();
		prevAlgorithm = selectedAlgorithm;
		selectedAlgorithm = algo;
		morphProgress = 0;

		const newGears = buildGears(algo);
		// Extend or shrink gear array
		while (gears.length < newGears.length) {
			const last = gears[gears.length - 1] || { x: canvasWidth / 2, y: canvasHeight / 2, radius: 20 };
			gears.push({ ...last, angle: 0, speed: 0.5, teeth: 10, label: '', color: '#333', targetX: last.x, targetY: last.y, targetRadius: last.radius });
		}
		gears = gears.slice(0, newGears.length);

		for (let i = 0; i < newGears.length; i++) {
			gears[i].targetX = newGears[i].x;
			gears[i].targetY = newGears[i].y;
			gears[i].targetRadius = newGears[i].radius;
			gears[i].color = newGears[i].color;
			gears[i].label = newGears[i].label;
			gears[i].teeth = newGears[i].teeth;
			gears[i].speed = newGears[i].speed;
		}

		// Re-encrypt existing text
		if (plaintext) {
			ciphertext = simulateEncrypt(plaintext, algo);
		}
	}

	// --- Letter fly animation ---
	function spawnFlyingLetter(char: string, index: number) {
		const startX = canvasWidth * 0.13;
		const startY = canvasHeight / 2 + (Math.random() - 0.5) * 30;
		const midX = canvasWidth / 2;
		const midY = canvasHeight / 2;
		const endX = canvasWidth * 0.87;
		const endY = canvasHeight / 2 + (Math.random() - 0.5) * 30;

		const binary = char.charCodeAt(0).toString(2).padStart(8, '0');
		const bits = binary.split('').map((b, i) => ({
			char: b,
			x: 0, y: 0,
			vx: (Math.random() - 0.5) * 3,
			vy: (Math.random() - 0.5) * 3,
			alpha: 1
		}));

		const hexResult = simulateEncrypt(char, selectedAlgorithm);

		flyingLetters.push({
			char,
			x: startX,
			y: startY,
			targetX: endX,
			targetY: endY,
			phase: 'fly-in',
			progress: 0,
			binary,
			binaryBits: bits,
			outputChar: hexResult.slice(0, 2),
			gearIndex: 0,
			alpha: 1
		});
	}

	// --- Input handler ---
	function handleInput(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		const newText = target.value;
		const addedChars = newText.slice(plaintext.length);

		plaintext = newText;
		ciphertext = simulateEncrypt(plaintext, selectedAlgorithm);

		for (let i = 0; i < addedChars.length; i++) {
			playTypewriter();
			setTimeout(() => {
				spawnFlyingLetter(addedChars[i], plaintext.length - addedChars.length + i);
			}, i * 80);
		}
	}

	// --- Brute force ---
	function startBruteForce() {
		if (isBruteForcing) {
			stopBruteForce();
			return;
		}
		playClick();
		isBruteForcing = true;
		bruteForceCount = 0;
		bruteForceProgress = 0;
		bruteForceText = algorithmConfigs[selectedAlgorithm].bruteForceYears;

		const rate = algorithmConfigs[selectedAlgorithm].bruteForceRate;
		bruteForceInterval = setInterval(() => {
			bruteForceCount += Math.floor(Math.random() * 999999) + 100000;
			bruteForceProgress = Math.min(bruteForceProgress + rate, 0.02);
			if (bruteForceCount % 3 === 0) {
				playTick();
				// Sparks on the lock
				for (let i = 0; i < 3; i++) {
					sparks.push({
						x: canvasWidth / 2,
						y: canvasHeight * 0.15,
						vx: (Math.random() - 0.5) * 6,
						vy: (Math.random() - 0.5) * 6,
						life: 1,
						maxLife: 1,
						color: ['#ff44aa', '#00ff88', '#00d4ff', '#b44aff'][Math.floor(Math.random() * 4)]
					});
				}
			}
		}, 50);
	}

	function stopBruteForce() {
		isBruteForcing = false;
		if (bruteForceInterval) {
			clearInterval(bruteForceInterval);
			bruteForceInterval = null;
		}
	}

	// --- Tooltip on gear hover ---
	function handleCanvasMouseMove(e: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		const mx = (e.clientX - rect.left) * (canvasWidth / rect.width);
		const my = (e.clientY - rect.top) * (canvasHeight / rect.height);

		let found = false;
		for (const gear of gears) {
			const dx = mx - gear.x;
			const dy = my - gear.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < gear.radius + 10) {
				tooltipText = gear.label;
				tooltipX = e.clientX;
				tooltipY = e.clientY - 30;
				tooltipVisible = true;
				cursorState.set('hover');
				cursorLabel.set(gear.label);
				found = true;
				break;
			}
		}
		if (!found) {
			tooltipVisible = false;
			cursorState.set('default');
			cursorLabel.set('');
		}
	}

	function handleCanvasMouseLeave() {
		tooltipVisible = false;
		cursorState.set('default');
		cursorLabel.set('');
	}

	// --- Drawing ---
	function drawGear(ctx: CanvasRenderingContext2D, gear: Gear) {
		const { x, y, radius, teeth, angle, color } = gear;
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(angle);

		// Outer ring with teeth
		ctx.beginPath();
		const toothDepth = radius * 0.25;
		const toothWidth = (Math.PI * 2) / (teeth * 2);
		for (let i = 0; i < teeth; i++) {
			const a1 = i * (Math.PI * 2) / teeth;
			const a2 = a1 + toothWidth;
			const a3 = a2 + toothWidth;

			ctx.lineTo(Math.cos(a1) * radius, Math.sin(a1) * radius);
			ctx.lineTo(Math.cos(a2) * (radius + toothDepth), Math.sin(a2) * (radius + toothDepth));
			ctx.lineTo(Math.cos(a3) * radius, Math.sin(a3) * radius);
		}
		ctx.closePath();

		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.shadowColor = color;
		ctx.shadowBlur = 12;
		ctx.stroke();

		// Inner circle
		ctx.beginPath();
		ctx.arc(0, 0, radius * 0.35, 0, Math.PI * 2);
		ctx.strokeStyle = color;
		ctx.lineWidth = 1.5;
		ctx.stroke();

		// Hub spokes
		for (let i = 0; i < 3; i++) {
			const a = (i / 3) * Math.PI * 2;
			ctx.beginPath();
			ctx.moveTo(Math.cos(a) * radius * 0.35, Math.sin(a) * radius * 0.35);
			ctx.lineTo(Math.cos(a) * radius * 0.7, Math.sin(a) * radius * 0.7);
			ctx.strokeStyle = color;
			ctx.lineWidth = 1;
			ctx.globalAlpha = 0.5;
			ctx.stroke();
			ctx.globalAlpha = 1;
		}

		// Center dot
		ctx.beginPath();
		ctx.arc(0, 0, 3, 0, Math.PI * 2);
		ctx.fillStyle = color;
		ctx.fill();

		ctx.shadowBlur = 0;
		ctx.restore();
	}

	function drawWire(ctx: CanvasRenderingContext2D, wire: Wire, t: number) {
		const { x1, y1, x2, y2, pulseOffset, color } = wire;

		ctx.save();

		// Base wire
		ctx.beginPath();
		const midX = (x1 + x2) / 2;
		const midY = (y1 + y2) / 2 + Math.sin(t * 2 + pulseOffset) * 8;
		ctx.moveTo(x1, y1);
		ctx.quadraticCurveTo(midX, midY, x2, y2);
		ctx.strokeStyle = color;
		ctx.globalAlpha = 0.15;
		ctx.lineWidth = 2;
		ctx.stroke();

		// Pulse traveling along wire
		const pulsePos = ((t * 0.5 + pulseOffset) % 1);
		const px = x1 + (x2 - x1) * pulsePos;
		const controlInfluence = 2 * pulsePos * (1 - pulsePos);
		const py = y1 + (y2 - y1) * pulsePos + (midY - (y1 + y2) / 2) * controlInfluence;

		ctx.beginPath();
		ctx.arc(px, py, 3, 0, Math.PI * 2);
		ctx.fillStyle = color;
		ctx.globalAlpha = 0.8;
		ctx.shadowColor = color;
		ctx.shadowBlur = 10;
		ctx.fill();

		ctx.globalAlpha = 1;
		ctx.shadowBlur = 0;
		ctx.restore();
	}

	function drawLock(ctx: CanvasRenderingContext2D, cx: number, cy: number, shaking: boolean) {
		ctx.save();
		if (shaking) {
			ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
		}

		// Lock body
		ctx.beginPath();
		ctx.roundRect(cx - 14, cy, 28, 22, 4);
		ctx.strokeStyle = isBruteForcing ? '#ff44aa' : '#00d4ff';
		ctx.lineWidth = 2;
		ctx.shadowColor = isBruteForcing ? '#ff44aa' : '#00d4ff';
		ctx.shadowBlur = isBruteForcing ? 15 : 8;
		ctx.stroke();

		// Shackle
		ctx.beginPath();
		ctx.arc(cx, cy, 12, Math.PI, 0);
		ctx.stroke();

		// Keyhole
		ctx.beginPath();
		ctx.arc(cx, cy + 8, 3, 0, Math.PI * 2);
		ctx.fillStyle = isBruteForcing ? '#ff44aa' : '#00d4ff';
		ctx.fill();
		ctx.beginPath();
		ctx.moveTo(cx - 1.5, cy + 10);
		ctx.lineTo(cx + 1.5, cy + 10);
		ctx.lineTo(cx + 1, cy + 16);
		ctx.lineTo(cx - 1, cy + 16);
		ctx.closePath();
		ctx.fill();

		ctx.shadowBlur = 0;
		ctx.restore();
	}

	function drawRotor(ctx: CanvasRenderingContext2D, cx: number, cy: number, width: number, height: number, offset: number, color: string) {
		ctx.save();
		ctx.translate(cx, cy);

		// Rotor casing
		ctx.strokeStyle = color;
		ctx.lineWidth = 1.5;
		ctx.globalAlpha = 0.3;
		ctx.strokeRect(-width / 2, -height / 2, width, height);
		ctx.globalAlpha = 1;

		// Scrolling letters inside rotor
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
		ctx.font = '10px "JetBrains Mono", monospace';
		ctx.fillStyle = color;
		ctx.textAlign = 'center';
		ctx.globalAlpha = 0.6;

		const visibleCount = Math.floor(height / 14);
		const scrollOffset = (offset * 14) % (chars.length * 14);

		ctx.beginPath();
		ctx.rect(-width / 2, -height / 2, width, height);
		ctx.clip();

		for (let i = -1; i <= visibleCount + 1; i++) {
			const charIdx = Math.floor((i + scrollOffset / 14) % chars.length + chars.length) % chars.length;
			const yy = -height / 2 + i * 14 - (scrollOffset % 14);
			const distFromCenter = Math.abs(yy) / (height / 2);
			ctx.globalAlpha = Math.max(0.1, 0.7 - distFromCenter * 0.7);
			ctx.fillText(chars[charIdx], 0, yy + 10);
		}

		ctx.globalAlpha = 1;
		ctx.restore();
	}

	function drawBackground(ctx: CanvasRenderingContext2D) {
		// Dark room gradient
		const grad = ctx.createRadialGradient(
			canvasWidth / 2, canvasHeight / 2, 0,
			canvasWidth / 2, canvasHeight / 2, canvasWidth * 0.6
		);
		grad.addColorStop(0, 'rgba(20, 25, 30, 1)');
		grad.addColorStop(0.5, 'rgba(12, 15, 18, 1)');
		grad.addColorStop(1, 'rgba(6, 8, 10, 1)');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, canvasWidth, canvasHeight);

		// Subtle grid
		ctx.strokeStyle = 'rgba(0, 212, 255, 0.03)';
		ctx.lineWidth = 0.5;
		for (let x = 0; x < canvasWidth; x += 30) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, canvasHeight);
			ctx.stroke();
		}
		for (let y = 0; y < canvasHeight; y += 30) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(canvasWidth, y);
			ctx.stroke();
		}

		// Machine outline (center box)
		const machineLeft = canvasWidth * 0.22;
		const machineRight = canvasWidth * 0.78;
		const machineTop = canvasHeight * 0.08;
		const machineBottom = canvasHeight * 0.92;

		ctx.strokeStyle = 'rgba(0, 212, 255, 0.08)';
		ctx.lineWidth = 1;
		ctx.setLineDash([6, 4]);
		ctx.strokeRect(machineLeft, machineTop, machineRight - machineLeft, machineBottom - machineTop);
		ctx.setLineDash([]);

		// "MACHINE" label
		ctx.font = '9px "JetBrains Mono", monospace';
		ctx.fillStyle = 'rgba(0, 212, 255, 0.15)';
		ctx.textAlign = 'center';
		ctx.fillText('ENCRYPTION ENGINE', canvasWidth / 2, machineTop - 4);
	}

	function drawFlyingLetter(ctx: CanvasRenderingContext2D, fl: FlyingLetter) {
		if (fl.phase === 'done') return;

		ctx.save();

		if (fl.phase === 'fly-in') {
			// Letter flying toward machine
			const p = fl.progress;
			const x = fl.x + (canvasWidth * 0.35 - fl.x) * p;
			const y = fl.y + (canvasHeight / 2 - fl.y) * p + Math.sin(p * Math.PI) * -20;
			ctx.font = 'bold 16px "JetBrains Mono", monospace';
			ctx.fillStyle = '#00d4ff';
			ctx.globalAlpha = fl.alpha;
			ctx.shadowColor = '#00d4ff';
			ctx.shadowBlur = 10;
			ctx.textAlign = 'center';
			ctx.fillText(fl.char, x, y);
		} else if (fl.phase === 'binary') {
			// Binary explosion
			for (const bit of fl.binaryBits) {
				ctx.font = '11px "JetBrains Mono", monospace';
				ctx.fillStyle = bit.char === '1' ? '#00ff88' : '#00d4ff';
				ctx.globalAlpha = bit.alpha;
				ctx.shadowColor = ctx.fillStyle;
				ctx.shadowBlur = 6;
				ctx.textAlign = 'center';
				ctx.fillText(bit.char, bit.x, bit.y);
			}
		} else if (fl.phase === 'through-gears') {
			// Bits converging through gear positions
			const gearIdx = Math.min(fl.gearIndex, gears.length - 1);
			const gear = gears[gearIdx];
			if (gear) {
				for (const bit of fl.binaryBits) {
					ctx.font = '10px "JetBrains Mono", monospace';
					ctx.fillStyle = gear.color;
					ctx.globalAlpha = bit.alpha * 0.8;
					ctx.shadowColor = gear.color;
					ctx.shadowBlur = 8;
					ctx.textAlign = 'center';
					ctx.fillText(bit.char, bit.x, bit.y);
				}
			}
		} else if (fl.phase === 'fly-out') {
			// Hex output flying to output area
			const p = fl.progress;
			const startX = gears.length > 0 ? gears[gears.length - 1].x : canvasWidth * 0.6;
			const x = startX + (fl.targetX - startX) * p;
			const y = canvasHeight / 2 + Math.sin(p * Math.PI) * -15;
			ctx.font = 'bold 14px "JetBrains Mono", monospace';
			ctx.fillStyle = '#00ff88';
			ctx.globalAlpha = fl.alpha;
			ctx.shadowColor = '#00ff88';
			ctx.shadowBlur = 10;
			ctx.textAlign = 'center';
			ctx.fillText(fl.outputChar, x, y);
		}

		ctx.shadowBlur = 0;
		ctx.globalAlpha = 1;
		ctx.restore();
	}

	function drawSparks(ctx: CanvasRenderingContext2D) {
		for (const spark of sparks) {
			ctx.save();
			ctx.beginPath();
			ctx.arc(spark.x, spark.y, 2 * spark.life, 0, Math.PI * 2);
			ctx.fillStyle = spark.color;
			ctx.globalAlpha = spark.life;
			ctx.shadowColor = spark.color;
			ctx.shadowBlur = 8;
			ctx.fill();
			ctx.shadowBlur = 0;
			ctx.globalAlpha = 1;
			ctx.restore();
		}
	}

	// --- Main animation loop ---
	function animate() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		time += 0.016;

		// Update morph
		if (morphProgress < 1) {
			morphProgress = Math.min(1, morphProgress + 0.03);
		}

		// Lerp gear positions
		for (const gear of gears) {
			gear.x += (gear.targetX - gear.x) * 0.08;
			gear.y += (gear.targetY - gear.y) * 0.08;
			gear.radius += (gear.targetRadius - gear.radius) * 0.08;
			gear.angle += gear.speed * 0.02;
		}

		// Update wires to follow gears
		wires = buildWires(gears);

		// Update flying letters
		for (const fl of flyingLetters) {
			if (fl.phase === 'fly-in') {
				fl.progress += 0.04;
				if (fl.progress >= 1) {
					fl.phase = 'binary';
					fl.progress = 0;
					// Initialize bit positions at the conversion point
					const cx = canvasWidth * 0.35;
					const cy = canvasHeight / 2;
					for (let i = 0; i < fl.binaryBits.length; i++) {
						fl.binaryBits[i].x = cx + (Math.random() - 0.5) * 10;
						fl.binaryBits[i].y = cy + (Math.random() - 0.5) * 10;
						fl.binaryBits[i].vx = (Math.random() - 0.5) * 4;
						fl.binaryBits[i].vy = (Math.random() - 0.5) * 4;
					}
				}
			} else if (fl.phase === 'binary') {
				fl.progress += 0.05;
				// Scatter bits briefly
				for (const bit of fl.binaryBits) {
					bit.x += bit.vx;
					bit.y += bit.vy;
					bit.vx *= 0.92;
					bit.vy *= 0.92;
				}
				if (fl.progress >= 1) {
					fl.phase = 'through-gears';
					fl.progress = 0;
					fl.gearIndex = 0;
				}
			} else if (fl.phase === 'through-gears') {
				fl.progress += 0.03;
				const gear = gears[fl.gearIndex];
				if (gear) {
					// Converge bits toward current gear
					for (const bit of fl.binaryBits) {
						bit.x += (gear.x + (Math.random() - 0.5) * gear.radius - bit.x) * 0.15;
						bit.y += (gear.y + (Math.random() - 0.5) * gear.radius - bit.y) * 0.15;
						bit.alpha = 0.5 + Math.sin(time * 10 + bit.x) * 0.3;
					}
				}
				if (fl.progress >= 1) {
					fl.gearIndex++;
					fl.progress = 0;
					if (fl.gearIndex >= gears.length) {
						fl.phase = 'fly-out';
						fl.progress = 0;
					}
				}
			} else if (fl.phase === 'fly-out') {
				fl.progress += 0.04;
				fl.alpha = 1 - fl.progress * 0.5;
				if (fl.progress >= 1) {
					fl.phase = 'done';
				}
			}
		}

		// Clean up done letters
		flyingLetters = flyingLetters.filter(fl => fl.phase !== 'done');

		// Update sparks
		for (const spark of sparks) {
			spark.x += spark.vx;
			spark.y += spark.vy;
			spark.vy += 0.1;
			spark.life -= 0.03;
		}
		sparks = sparks.filter(s => s.life > 0);

		// --- Draw ---
		ctx.clearRect(0, 0, canvasWidth, canvasHeight);
		drawBackground(ctx);

		// Draw wires
		for (const wire of wires) {
			drawWire(ctx, wire, time);
		}

		// Draw rotors (decorative, flanking the gears)
		const rotorColor1 = algorithmConfigs[selectedAlgorithm].colors[0];
		const rotorColor2 = algorithmConfigs[selectedAlgorithm].colors[algorithmConfigs[selectedAlgorithm].colors.length - 1];
		drawRotor(ctx, canvasWidth * 0.27, canvasHeight / 2, 30, 80, time * 2, rotorColor1);
		drawRotor(ctx, canvasWidth * 0.73, canvasHeight / 2, 30, 80, time * 1.7, rotorColor2);

		// Draw gears
		for (const gear of gears) {
			drawGear(ctx, gear);
		}

		// Draw flying letters
		for (const fl of flyingLetters) {
			drawFlyingLetter(ctx, fl);
		}

		// Draw lock (top center)
		if (isBruteForcing) {
			drawLock(ctx, canvasWidth / 2, canvasHeight * 0.1, true);
		} else {
			drawLock(ctx, canvasWidth / 2, canvasHeight * 0.1, false);
		}

		// Draw sparks
		drawSparks(ctx);

		// Input arrow indicator
		ctx.save();
		ctx.font = '10px "JetBrains Mono", monospace';
		ctx.fillStyle = 'rgba(0, 212, 255, 0.4)';
		ctx.textAlign = 'center';
		ctx.fillText('PLAINTEXT', canvasWidth * 0.08, canvasHeight * 0.18);
		ctx.beginPath();
		ctx.moveTo(canvasWidth * 0.08, canvasHeight * 0.22);
		ctx.lineTo(canvasWidth * 0.08, canvasHeight * 0.35);
		ctx.lineTo(canvasWidth * 0.11, canvasHeight * 0.32);
		ctx.moveTo(canvasWidth * 0.08, canvasHeight * 0.35);
		ctx.lineTo(canvasWidth * 0.05, canvasHeight * 0.32);
		ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
		ctx.lineWidth = 1;
		ctx.stroke();
		ctx.restore();

		// Output arrow indicator
		ctx.save();
		ctx.font = '10px "JetBrains Mono", monospace';
		ctx.fillStyle = 'rgba(0, 255, 136, 0.4)';
		ctx.textAlign = 'center';
		ctx.fillText('CIPHERTEXT', canvasWidth * 0.92, canvasHeight * 0.18);
		ctx.beginPath();
		ctx.moveTo(canvasWidth * 0.92, canvasHeight * 0.22);
		ctx.lineTo(canvasWidth * 0.92, canvasHeight * 0.35);
		ctx.lineTo(canvasWidth * 0.95, canvasHeight * 0.32);
		ctx.moveTo(canvasWidth * 0.92, canvasHeight * 0.35);
		ctx.lineTo(canvasWidth * 0.89, canvasHeight * 0.32);
		ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
		ctx.lineWidth = 1;
		ctx.stroke();
		ctx.restore();

		// Algorithm name on machine
		ctx.save();
		ctx.font = 'bold 13px "JetBrains Mono", monospace';
		ctx.fillStyle = algorithmConfigs[selectedAlgorithm].colors[0];
		ctx.globalAlpha = 0.6;
		ctx.textAlign = 'center';
		ctx.shadowColor = algorithmConfigs[selectedAlgorithm].colors[0];
		ctx.shadowBlur = 10;
		ctx.fillText(selectedAlgorithm, canvasWidth / 2, canvasHeight * 0.94);
		ctx.shadowBlur = 0;
		ctx.globalAlpha = 1;
		ctx.restore();

		animFrame = requestAnimationFrame(animate);
	}

	// --- Lifecycle ---
	onMount(() => {
		mounted = true;

		const resizeCanvas = () => {
			if (!canvas) return;
			const container = canvas.parentElement;
			if (!container) return;
			const rect = container.getBoundingClientRect();
			canvasWidth = rect.width;
			canvasHeight = rect.height;
			canvas.width = canvasWidth;
			canvas.height = canvasHeight;

			gears = buildGears(selectedAlgorithm);
			// Snap target positions
			for (const g of gears) {
				g.targetX = g.x;
				g.targetY = g.y;
				g.targetRadius = g.radius;
			}
			wires = buildWires(gears);
		};

		resizeCanvas();
		window.addEventListener('resize', resizeCanvas);
		animate();

		return () => {
			window.removeEventListener('resize', resizeCanvas);
			cancelAnimationFrame(animFrame);
			stopBruteForce();
		};
	});

	onDestroy(() => {
		mounted = false;
		if (animFrame) cancelAnimationFrame(animFrame);
		stopBruteForce();
	});

	// Reactive ciphertext
	$: if (mounted && plaintext !== undefined) {
		ciphertext = simulateEncrypt(plaintext, selectedAlgorithm);
	}

	const algorithms: Algorithm[] = ['AES-256', 'RSA', 'SHA-256', 'bcrypt'];

	const tags = ['Cryptography', 'AES', 'RSA', 'Hashing', 'Security', 'Python hashlib'];
</script>

<section class="cipher-room" aria-label="Cipher Room - Encryption & Security">
	<!-- Header -->
	<div class="scene-header">
		<h2 class="scene-title">Cipher Room</h2>
		<p class="scene-subtitle">Encryption & Security</p>
	</div>

	<!-- Canvas + overlays container -->
	<div class="machine-viewport">
		<canvas
			bind:this={canvas}
			class="machine-canvas"
			on:mousemove={handleCanvasMouseMove}
			on:mouseleave={handleCanvasMouseLeave}
		></canvas>

		<!-- Input panel (left) -->
		<div class="input-panel">
			<label class="panel-label" for="plaintext-input">
				<span class="label-icon">&#9654;</span> Input
			</label>
			<textarea
				id="plaintext-input"
				bind:this={inputEl}
				class="terminal-input"
				placeholder="Type plaintext..."
				spellcheck="false"
				autocomplete="off"
				on:input={handleInput}
				on:focus={() => { cursorState.set('text'); cursorLabel.set('type to encrypt'); }}
				on:blur={() => { cursorState.set('default'); cursorLabel.set(''); }}
				bind:value={plaintext}
			></textarea>
		</div>

		<!-- Output panel (right) -->
		<div class="output-panel">
			<!-- svelte-ignore a11y_label_has_associated_control -->
			<label class="panel-label output-label">
				<span class="label-icon">&#9664;</span> Output
			</label>
			<div class="terminal-output" class:has-text={ciphertext.length > 0}>
				{#if ciphertext}
					<span class="cipher-text">{ciphertext}</span>
				{:else}
					<span class="cipher-placeholder">encrypted output...</span>
				{/if}
			</div>
		</div>

		<!-- Brute force overlay -->
		{#if isBruteForcing}
			<div class="brute-force-overlay">
				<div class="bf-counter">{bruteForceCount.toLocaleString()} attempts</div>
				<div class="bf-progress-bar">
					<div class="bf-progress-fill" style="width: {bruteForceProgress * 100}%"></div>
				</div>
				<div class="bf-remaining">{bruteForceText}</div>
			</div>
		{/if}

		<!-- Tooltip -->
		{#if tooltipVisible}
			<div class="gear-tooltip" style="left: {tooltipX}px; top: {tooltipY}px;">
				{tooltipText}
			</div>
		{/if}
	</div>

	<!-- Controls bar -->
	<div class="controls-bar">
		<!-- Algorithm selector -->
		<div class="algo-selector">
			{#each algorithms as algo}
				<button
					class="algo-btn"
					class:active={selectedAlgorithm === algo}
					on:click={() => switchAlgorithm(algo)}
					on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set(algo); }}
					on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
				>
					{algo}
				</button>
			{/each}
		</div>

		<!-- Brute force button -->
		<button
			class="brute-btn"
			class:active={isBruteForcing}
			on:click={startBruteForce}
			on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set('brute force'); }}
			on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
		>
			{#if isBruteForcing}
				<span class="bf-icon spinning">&#x2699;</span> Stop Attack
			{:else}
				<span class="bf-icon">&#x1F5DD;</span> Brute Force
			{/if}
		</button>
	</div>

	<!-- Tags -->
	<div class="scene-tags">
		{#each tags as tag, i}
			{#if i > 0}<span class="tag-sep">&middot;</span>{/if}
			<span class="tag">{tag}</span>
		{/each}
	</div>

	<!-- Hint -->
	<p class="scene-hint">type text to encrypt &bull; switch algorithms &bull; try brute force</p>
</section>

<style>
	.cipher-room {
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 20px;
		box-sizing: border-box;
		overflow: hidden;
		font-family: var(--font-sans, 'Inter', sans-serif);
	}

	/* --- Header --- */
	.scene-header {
		text-align: center;
		margin-bottom: 12px;
		z-index: 2;
		position: relative;
	}

	.scene-title {
		font-size: clamp(20px, 3vw, 32px);
		font-weight: 800;
		color: var(--text-primary, #e8eaed);
		margin: 0;
		letter-spacing: 0.04em;
	}

	.scene-subtitle {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: clamp(11px, 1.4vw, 14px);
		color: var(--text-muted, #5a6270);
		margin: 4px 0 0 0;
		letter-spacing: 0.08em;
	}

	/* --- Machine viewport --- */
	.machine-viewport {
		position: relative;
		flex: 1;
		width: 100%;
		max-width: 1000px;
		min-height: 300px;
		border: 1px solid rgba(0, 212, 255, 0.08);
		border-radius: 12px;
		overflow: hidden;
		background: var(--bg-primary, #0a0c10);
	}

	.machine-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 0;
	}

	/* --- Input panel --- */
	.input-panel {
		position: absolute;
		left: 12px;
		top: 50%;
		transform: translateY(-50%);
		width: clamp(120px, 16%, 170px);
		z-index: 3;
	}

	.panel-label {
		display: block;
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		color: var(--aurora-cyan, #00d4ff);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		margin-bottom: 6px;
		opacity: 0.7;
	}

	.label-icon {
		font-size: 8px;
		margin-right: 4px;
	}

	.terminal-input {
		width: 100%;
		min-height: 80px;
		max-height: 140px;
		padding: 10px;
		background: rgba(0, 0, 0, 0.6);
		border: 1px solid rgba(0, 212, 255, 0.2);
		border-radius: 6px;
		color: var(--aurora-cyan, #00d4ff);
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 13px;
		line-height: 1.5;
		resize: none;
		outline: none;
		transition: border-color 0.3s ease, box-shadow 0.3s ease;
		box-sizing: border-box;
	}

	.terminal-input::placeholder {
		color: rgba(0, 212, 255, 0.25);
	}

	.terminal-input:focus {
		border-color: rgba(0, 212, 255, 0.5);
		box-shadow: 0 0 20px rgba(0, 212, 255, 0.1), inset 0 0 20px rgba(0, 212, 255, 0.03);
	}

	/* --- Output panel --- */
	.output-panel {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		width: clamp(120px, 16%, 170px);
		z-index: 3;
	}

	.output-label {
		text-align: right;
		color: var(--aurora-green, #00ff88);
	}

	.terminal-output {
		width: 100%;
		min-height: 80px;
		max-height: 140px;
		padding: 10px;
		background: rgba(0, 0, 0, 0.6);
		border: 1px solid rgba(0, 255, 136, 0.15);
		border-radius: 6px;
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 12px;
		line-height: 1.5;
		overflow-y: auto;
		word-break: break-all;
		box-sizing: border-box;
		transition: border-color 0.3s ease, box-shadow 0.3s ease;
	}

	.terminal-output.has-text {
		border-color: rgba(0, 255, 136, 0.3);
		box-shadow: 0 0 20px rgba(0, 255, 136, 0.08), inset 0 0 20px rgba(0, 255, 136, 0.02);
	}

	.cipher-text {
		color: var(--aurora-green, #00ff88);
		text-shadow: 0 0 8px rgba(0, 255, 136, 0.4);
	}

	.cipher-placeholder {
		color: rgba(0, 255, 136, 0.2);
	}

	/* --- Brute force overlay --- */
	.brute-force-overlay {
		position: absolute;
		top: 8px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 5;
		text-align: center;
		background: rgba(0, 0, 0, 0.7);
		border: 1px solid rgba(255, 68, 170, 0.3);
		border-radius: 8px;
		padding: 8px 18px;
		backdrop-filter: blur(4px);
	}

	.bf-counter {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 14px;
		color: var(--aurora-pink, #ff44aa);
		text-shadow: 0 0 10px rgba(255, 68, 170, 0.5);
		margin-bottom: 6px;
	}

	.bf-progress-bar {
		width: 200px;
		height: 4px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 2px;
		overflow: hidden;
		margin: 0 auto 6px;
	}

	.bf-progress-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--aurora-pink, #ff44aa), var(--aurora-purple, #b44aff));
		border-radius: 2px;
		transition: width 0.1s linear;
		box-shadow: 0 0 8px var(--aurora-pink, #ff44aa);
	}

	.bf-remaining {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		color: var(--text-muted, #5a6270);
		letter-spacing: 0.05em;
	}

	/* --- Gear tooltip --- */
	.gear-tooltip {
		position: fixed;
		z-index: 100;
		padding: 5px 10px;
		background: rgba(0, 0, 0, 0.85);
		border: 1px solid rgba(0, 212, 255, 0.3);
		border-radius: 4px;
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 11px;
		color: var(--aurora-cyan, #00d4ff);
		pointer-events: none;
		white-space: nowrap;
		transform: translateX(-50%);
		text-shadow: 0 0 6px rgba(0, 212, 255, 0.3);
	}

	/* --- Controls bar --- */
	.controls-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		margin-top: 12px;
		flex-wrap: wrap;
		z-index: 2;
		position: relative;
	}

	.algo-selector {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		justify-content: center;
	}

	.algo-btn {
		padding: 6px 14px;
		background: rgba(0, 0, 0, 0.4);
		border: 1px solid rgba(0, 212, 255, 0.15);
		border-radius: 6px;
		color: var(--text-secondary, #9ca3af);
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 11px;
		letter-spacing: 0.05em;
		cursor: pointer;
		transition: all 0.25s ease;
	}

	.algo-btn:hover {
		border-color: rgba(0, 212, 255, 0.4);
		color: var(--aurora-cyan, #00d4ff);
		background: rgba(0, 212, 255, 0.05);
	}

	.algo-btn.active {
		border-color: var(--aurora-cyan, #00d4ff);
		color: var(--aurora-cyan, #00d4ff);
		background: rgba(0, 212, 255, 0.1);
		box-shadow: 0 0 12px rgba(0, 212, 255, 0.15), inset 0 0 12px rgba(0, 212, 255, 0.05);
	}

	.brute-btn {
		padding: 6px 16px;
		background: rgba(255, 68, 170, 0.05);
		border: 1px solid rgba(255, 68, 170, 0.2);
		border-radius: 6px;
		color: var(--aurora-pink, #ff44aa);
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 11px;
		letter-spacing: 0.05em;
		cursor: pointer;
		transition: all 0.25s ease;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.brute-btn:hover {
		border-color: rgba(255, 68, 170, 0.5);
		background: rgba(255, 68, 170, 0.1);
		box-shadow: 0 0 15px rgba(255, 68, 170, 0.15);
	}

	.brute-btn.active {
		border-color: var(--aurora-pink, #ff44aa);
		background: rgba(255, 68, 170, 0.15);
		box-shadow: 0 0 20px rgba(255, 68, 170, 0.2);
		animation: pulse-pink 1s ease-in-out infinite;
	}

	.bf-icon {
		font-size: 14px;
	}

	.bf-icon.spinning {
		display: inline-block;
		animation: spin 1s linear infinite;
	}

	/* --- Tags --- */
	.scene-tags {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin-top: 12px;
		flex-wrap: wrap;
		z-index: 2;
		position: relative;
	}

	.tag {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: clamp(9px, 1.2vw, 11px);
		color: var(--text-muted, #5a6270);
		letter-spacing: 0.05em;
	}

	.tag-sep {
		color: var(--text-muted, #5a6270);
		opacity: 0.4;
		font-size: 10px;
	}

	/* --- Hint --- */
	.scene-hint {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: clamp(9px, 1.1vw, 11px);
		color: var(--text-muted, #5a6270);
		opacity: 0.5;
		text-align: center;
		margin-top: 8px;
		letter-spacing: 0.06em;
		z-index: 2;
		position: relative;
	}

	/* --- Animations --- */
	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	@keyframes pulse-pink {
		0%, 100% { box-shadow: 0 0 20px rgba(255, 68, 170, 0.2); }
		50% { box-shadow: 0 0 30px rgba(255, 68, 170, 0.35); }
	}

	/* --- Scrollbar for output --- */
	.terminal-output::-webkit-scrollbar {
		width: 4px;
	}

	.terminal-output::-webkit-scrollbar-track {
		background: transparent;
	}

	.terminal-output::-webkit-scrollbar-thumb {
		background: rgba(0, 255, 136, 0.2);
		border-radius: 2px;
	}

	/* --- Responsive --- */
	@media (max-width: 640px) {
		.cipher-room {
			padding: 12px;
		}

		.input-panel,
		.output-panel {
			width: clamp(90px, 20%, 130px);
		}

		.terminal-input,
		.terminal-output {
			min-height: 60px;
			font-size: 11px;
			padding: 8px;
		}

		.algo-btn {
			padding: 4px 10px;
			font-size: 10px;
		}

		.brute-btn {
			padding: 4px 12px;
			font-size: 10px;
		}
	}
</style>
