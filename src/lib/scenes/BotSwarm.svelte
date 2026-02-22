<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { cursorState, cursorLabel } from '$lib/stores/cursor';
	import { playClick, playDeploy, playBlip, playTick, playPing } from '$lib/utils/audio';
	import { lerp, distance, random, clamp } from '$lib/utils/math';

	// ── Types ──────────────────────────────────────────────
	type BotProfession = 'parser' | 'messenger' | 'monitor' | 'scheduler' | 'database';

	interface Bot {
		id: number;
		x: number;
		y: number;
		homeX: number;
		homeY: number;
		vx: number;
		vy: number;
		size: number;
		color: string;
		glowColor: string;
		profession: BotProfession;
		name: string;
		eyeOffset: number;
		eyeBlink: number;
		blinkTimer: number;
		actionTimer: number;
		actionCooldown: number;
		log: string[];
		angle: number;
		wobble: number;
		wobbleSpeed: number;
		spawning: boolean;
		spawnProgress: number;
		spawnParticles: SpawnParticle[];
		radarAngle: number;
		radarFlash: number;
		timerValue: number;
		timerMax: number;
		dataBlocks: DataBlock[];
		envelopes: Envelope[];
		textLines: TextLine[];
	}

	interface SpawnParticle {
		x: number;
		y: number;
		targetX: number;
		targetY: number;
		angle: number;
		speed: number;
		life: number;
		maxLife: number;
		color: string;
	}

	interface DataBlock {
		y: number;
		width: number;
		height: number;
		color: string;
		alpha: number;
	}

	interface Envelope {
		x: number;
		y: number;
		vx: number;
		vy: number;
		life: number;
		sent: boolean;
		sentTimer: number;
	}

	interface TextLine {
		x: number;
		y: number;
		text: string;
		speed: number;
		alpha: number;
		eaten: boolean;
	}

	interface Notification {
		x: number;
		y: number;
		text: string;
		life: number;
		maxLife: number;
		color: string;
	}

	// ── Constants ──────────────────────────────────────────
	const AURORA = {
		green: '#00ff88',
		cyan: '#00d4ff',
		purple: '#b44aff',
		pink: '#ff44aa',
		yellow: '#ffcc00'
	};

	const PROFESSION_CONFIG: Record<BotProfession, { color: string; glow: string; label: string }> = {
		parser: { color: AURORA.green, glow: 'rgba(0,255,136,0.3)', label: 'Parser Bot' },
		messenger: { color: AURORA.cyan, glow: 'rgba(0,212,255,0.3)', label: 'Messenger Bot' },
		monitor: { color: AURORA.purple, glow: 'rgba(180,74,255,0.3)', label: 'Monitor Bot' },
		scheduler: { color: AURORA.pink, glow: 'rgba(255,68,170,0.3)', label: 'Scheduler Bot' },
		database: { color: AURORA.yellow, glow: 'rgba(255,204,0,0.3)', label: 'Database Bot' }
	};

	const TAGS = ['Python', 'asyncio', 'Telegram API', 'Celery', 'Redis', 'Cron'];

	const LOG_MESSAGES: Record<BotProfession, string[]> = {
		parser: [
			'> parsing input stream...',
			'> tokenizing line 42...',
			'> AST node created [ExprStmt]',
			'> consumed token: STRING',
			'> syntax valid. next line.',
			'> regex match found at col 8',
			'> buffer flushed (128 bytes)',
			'> parse tree depth: 4'
		],
		messenger: [
			'> connecting to smtp...',
			'> envelope sealed. sending...',
			'> TLS handshake OK',
			'> message queued [id:7f3a]',
			'> delivery confirmed: 200 OK',
			'> webhook dispatched',
			'> retry #2 -> success',
			'> notification broadcast sent'
		],
		monitor: [
			'> scanning port 443...',
			'> CPU: 23% | MEM: 41%',
			'> heartbeat OK (12ms)',
			'> anomaly score: 0.02',
			'> ALERT: latency spike!',
			'> rotating log files...',
			'> health check: all green',
			'> uptime: 99.97%'
		],
		scheduler: [
			'> cron: */5 * * * * triggered',
			'> spawning worker #3...',
			'> task queued: ETL pipeline',
			'> next run: T+30s',
			'> celery beat: tick',
			'> dispatching job batch',
			'> worker pool: 4/8 active',
			'> rate limit: 100 req/min'
		],
		database: [
			'> INSERT INTO logs VALUES...',
			'> index rebuilt (0.3s)',
			'> transaction committed',
			'> rows affected: 847',
			'> cache hit ratio: 94%',
			'> WAL checkpoint complete',
			'> SELECT * ... 12 rows',
			'> connection pool: 5/20'
		]
	};

	const TEXT_SNIPPETS = [
		'{"status":"ok"}',
		'import asyncio',
		'def parse(data):',
		'await bot.send()',
		'for line in f:',
		'try: parse(row)',
		'class Bot:',
		'yield chunk'
	];

	// ── State ──────────────────────────────────────────────
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	let animFrame: number;
	let width = 0;
	let height = 0;
	let dpr = 1;
	let time = 0;

	let bots: Bot[] = [];
	let notifications: Notification[] = [];
	let nextBotId = 0;

	let mouseX = -1000;
	let mouseY = -1000;
	let mouseDown = false;
	let dragBot: Bot | null = null;
	let dragOffsetX = 0;
	let dragOffsetY = 0;
	let hoveredBot: Bot | null = null;
	let selectedBot: Bot | null = null;
	let terminalLines: string[] = [];
	let terminalTyping = '';
	let terminalTypeIndex = 0;
	let terminalTypeTimer = 0;
	let terminalPendingLines: string[] = [];

	let deployAnimating = false;
	let deployButtonHover = false;

	// ── Bot Creation ───────────────────────────────────────
	function createBot(profession: BotProfession, x?: number, y?: number, spawning = false): Bot {
		const cfg = PROFESSION_CONFIG[profession];
		const bx = x ?? random(100, width - 100);
		const by = y ?? random(120, height - 120);
		const bot: Bot = {
			id: nextBotId++,
			x: bx,
			y: by,
			homeX: bx,
			homeY: by,
			vx: 0,
			vy: 0,
			size: random(22, 30),
			color: cfg.color,
			glowColor: cfg.glow,
			profession,
			name: cfg.label,
			eyeOffset: 0,
			eyeBlink: 1,
			blinkTimer: random(2, 6),
			actionTimer: random(0.5, 3),
			actionCooldown: profession === 'scheduler' ? 4 : random(1.5, 4),
			log: [`[${cfg.label} online]`, '> ready.'],
			angle: 0,
			wobble: 0,
			wobbleSpeed: random(1.5, 3),
			spawning,
			spawnProgress: spawning ? 0 : 1,
			spawnParticles: [],
			radarAngle: 0,
			radarFlash: 0,
			timerValue: 0,
			timerMax: random(3, 6),
			dataBlocks: [],
			envelopes: [],
			textLines: []
		};

		if (spawning) {
			for (let i = 0; i < 20; i++) {
				const angle = random(0, Math.PI * 2);
				const dist = random(60, 140);
				bot.spawnParticles.push({
					x: bx + Math.cos(angle) * dist,
					y: by + Math.sin(angle) * dist,
					targetX: bx + random(-bot.size * 0.5, bot.size * 0.5),
					targetY: by + random(-bot.size * 0.5, bot.size * 0.5),
					angle,
					speed: random(1, 3),
					life: 1,
					maxLife: 1,
					color: cfg.color
				});
			}
		}

		return bot;
	}

	function spawnInitialBots() {
		const professions: BotProfession[] = ['parser', 'messenger', 'monitor', 'scheduler', 'database'];
		const margin = 80;
		const usableW = width - margin * 2;
		const usableH = height - margin * 2 - 100;
		const cols = 4;
		const rows = 3;

		for (let i = 0; i < 10; i++) {
			const prof = professions[i % professions.length];
			const col = i % cols;
			const row = Math.floor(i / cols);
			const cellW = usableW / cols;
			const cellH = usableH / rows;
			const bx = margin + col * cellW + cellW * 0.5 + random(-30, 30);
			const by = margin + 80 + row * cellH + cellH * 0.5 + random(-30, 30);
			bots.push(createBot(prof, bx, by));
		}
	}

	function deployNewBot() {
		if (deployAnimating) return;
		deployAnimating = true;
		playDeploy();

		const professions: BotProfession[] = ['parser', 'messenger', 'monitor', 'scheduler', 'database'];
		const prof = professions[Math.floor(random(0, professions.length))];
		const bx = random(120, width - 120);
		const by = random(160, height - 160);
		const newBot = createBot(prof, bx, by, true);
		bots.push(newBot);
		bots = bots;

		addNotification(bx, by - 40, `+ ${PROFESSION_CONFIG[prof].label} deployed`, PROFESSION_CONFIG[prof].color);

		setTimeout(() => {
			deployAnimating = false;
		}, 1200);
	}

	// ── Notifications ──────────────────────────────────────
	function addNotification(x: number, y: number, text: string, color: string) {
		notifications.push({ x, y, text, life: 2, maxLife: 2, color });
	}

	// ── Terminal ───────────────────────────────────────────
	function openTerminal(bot: Bot) {
		if (selectedBot?.id === bot.id) {
			selectedBot = null;
			return;
		}
		selectedBot = bot;
		terminalLines = [...bot.log];
		terminalPendingLines = [];
		terminalTyping = '';
		terminalTypeIndex = 0;
		playClick();
	}

	function addTerminalLine(text: string) {
		if (!selectedBot) return;
		selectedBot.log.push(text);
		if (selectedBot.log.length > 50) selectedBot.log.shift();

		if (terminalTyping === '') {
			terminalTyping = text;
			terminalTypeIndex = 0;
			terminalTypeTimer = 0;
		} else {
			terminalPendingLines.push(text);
		}
	}

	// ── Drawing Helpers ────────────────────────────────────
	function drawGrid(ctx: CanvasRenderingContext2D) {
		const gridSize = 40;
		ctx.strokeStyle = 'rgba(255,255,255,0.03)';
		ctx.lineWidth = 1;

		for (let x = 0; x < width; x += gridSize) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
			ctx.stroke();
		}
		for (let y = 0; y < height; y += gridSize) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(width, y);
			ctx.stroke();
		}

		// Subtle dot intersections
		ctx.fillStyle = 'rgba(255,255,255,0.05)';
		for (let x = 0; x < width; x += gridSize) {
			for (let y = 0; y < height; y += gridSize) {
				ctx.beginPath();
				ctx.arc(x, y, 1, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}

	function drawBot(ctx: CanvasRenderingContext2D, bot: Bot, dt: number) {
		const { x, y, size, color, glowColor } = bot;

		if (bot.spawning) {
			drawSpawnAnimation(ctx, bot, dt);
			return;
		}

		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(Math.sin(bot.wobble) * 0.05);

		// Glow
		const gradient = ctx.createRadialGradient(0, 0, size * 0.5, 0, 0, size * 2);
		gradient.addColorStop(0, glowColor);
		gradient.addColorStop(1, 'transparent');
		ctx.fillStyle = gradient;
		ctx.fillRect(-size * 2, -size * 2, size * 4, size * 4);

		// Hover dashed outline
		if (hoveredBot?.id === bot.id || selectedBot?.id === bot.id) {
			ctx.strokeStyle = color;
			ctx.lineWidth = 1.5;
			ctx.setLineDash([4, 4]);
			ctx.globalAlpha = 0.6 + Math.sin(time * 4) * 0.2;
			const pad = 8;
			ctx.strokeRect(-size - pad, -size - pad, (size + pad) * 2, (size + pad) * 2);
			ctx.setLineDash([]);
			ctx.globalAlpha = 1;
		}

		// Body - hexagonal shape
		ctx.beginPath();
		for (let i = 0; i < 6; i++) {
			const a = (Math.PI / 3) * i - Math.PI / 6;
			const px = Math.cos(a) * size;
			const py = Math.sin(a) * size;
			if (i === 0) ctx.moveTo(px, py);
			else ctx.lineTo(px, py);
		}
		ctx.closePath();

		ctx.fillStyle = 'rgba(10,12,18,0.85)';
		ctx.fill();
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.stroke();

		// Inner face plate
		ctx.beginPath();
		for (let i = 0; i < 6; i++) {
			const a = (Math.PI / 3) * i - Math.PI / 6;
			const px = Math.cos(a) * size * 0.7;
			const py = Math.sin(a) * size * 0.7;
			if (i === 0) ctx.moveTo(px, py);
			else ctx.lineTo(px, py);
		}
		ctx.closePath();
		ctx.fillStyle = `rgba(${hexToRgb(color)},0.08)`;
		ctx.fill();

		// Eyes
		const eyeSpacing = size * 0.35;
		const eyeY = -size * 0.1;
		const eyeSize = size * 0.18;
		const lookX = bot.eyeOffset * 2;
		const lookY = 0;

		for (const side of [-1, 1]) {
			const ex = side * eyeSpacing + lookX;
			const ey = eyeY + lookY;

			// Eye glow
			const eyeGlow = ctx.createRadialGradient(ex, ey, 0, ex, ey, eyeSize * 3);
			eyeGlow.addColorStop(0, `rgba(${hexToRgb(color)},0.4)`);
			eyeGlow.addColorStop(1, 'transparent');
			ctx.fillStyle = eyeGlow;
			ctx.fillRect(ex - eyeSize * 3, ey - eyeSize * 3, eyeSize * 6, eyeSize * 6);

			// Eye circle
			ctx.beginPath();
			ctx.arc(ex, ey, eyeSize, 0, Math.PI * 2);
			ctx.fillStyle = color;
			ctx.globalAlpha = bot.eyeBlink;
			ctx.fill();
			ctx.globalAlpha = 1;

			// Pupil
			ctx.beginPath();
			ctx.arc(ex + lookX * 0.3, ey, eyeSize * 0.4, 0, Math.PI * 2);
			ctx.fillStyle = 'rgba(0,0,0,0.7)';
			ctx.globalAlpha = bot.eyeBlink;
			ctx.fill();
			ctx.globalAlpha = 1;
		}

		// Mouth (small line)
		ctx.beginPath();
		ctx.moveTo(-size * 0.2, size * 0.25);
		ctx.lineTo(size * 0.2, size * 0.25);
		ctx.strokeStyle = color;
		ctx.lineWidth = 1.5;
		ctx.globalAlpha = 0.5;
		ctx.stroke();
		ctx.globalAlpha = 1;

		// Profession-specific decorations
		drawBotDecoration(ctx, bot);

		ctx.restore();

		// Hover label (drawn in world space, not rotated)
		if (hoveredBot?.id === bot.id && selectedBot?.id !== bot.id) {
			ctx.save();
			ctx.font = '11px "JetBrains Mono", monospace';
			ctx.fillStyle = color;
			ctx.textAlign = 'center';
			ctx.globalAlpha = 0.9;
			ctx.fillText(bot.name, x, y - size - 14);
			ctx.globalAlpha = 1;
			ctx.restore();
		}
	}

	function drawBotDecoration(ctx: CanvasRenderingContext2D, bot: Bot) {
		const { size, color, profession } = bot;

		switch (profession) {
			case 'parser': {
				// Small "teeth" marks at bottom
				ctx.strokeStyle = color;
				ctx.lineWidth = 1;
				ctx.globalAlpha = 0.6;
				for (let i = -2; i <= 2; i++) {
					const tx = i * size * 0.15;
					ctx.beginPath();
					ctx.moveTo(tx, size * 0.4);
					ctx.lineTo(tx, size * 0.55);
					ctx.stroke();
				}
				ctx.globalAlpha = 1;
				break;
			}
			case 'messenger': {
				// Small antenna
				ctx.strokeStyle = color;
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.moveTo(0, -size);
				ctx.lineTo(0, -size - 10);
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(0, -size - 12, 2.5, 0, Math.PI * 2);
				ctx.fillStyle = color;
				ctx.globalAlpha = 0.5 + Math.sin(time * 6) * 0.5;
				ctx.fill();
				ctx.globalAlpha = 1;
				break;
			}
			case 'monitor': {
				// Radar sweep
				ctx.beginPath();
				ctx.moveTo(0, 0);
				const radarLen = size * 0.9;
				const rx = Math.cos(bot.radarAngle) * radarLen;
				const ry = Math.sin(bot.radarAngle) * radarLen;
				ctx.lineTo(rx, ry);
				ctx.strokeStyle = color;
				ctx.lineWidth = 1.5;
				ctx.globalAlpha = 0.7;
				ctx.stroke();

				// Radar trail
				for (let i = 1; i <= 8; i++) {
					const trailAngle = bot.radarAngle - i * 0.1;
					const trailX = Math.cos(trailAngle) * radarLen;
					const trailY = Math.sin(trailAngle) * radarLen;
					ctx.beginPath();
					ctx.moveTo(0, 0);
					ctx.lineTo(trailX, trailY);
					ctx.globalAlpha = 0.5 * (1 - i / 8);
					ctx.stroke();
				}

				// Flash on anomaly
				if (bot.radarFlash > 0) {
					ctx.beginPath();
					ctx.arc(0, 0, size * 1.2, 0, Math.PI * 2);
					ctx.fillStyle = `rgba(255,60,60,${bot.radarFlash * 0.3})`;
					ctx.fill();
				}

				ctx.globalAlpha = 1;
				break;
			}
			case 'scheduler': {
				// Timer arc above bot
				const timerRadius = size * 0.4;
				const timerY = -size - 16;
				const progress = bot.timerValue / bot.timerMax;

				ctx.beginPath();
				ctx.arc(0, timerY, timerRadius, 0, Math.PI * 2);
				ctx.strokeStyle = `rgba(${hexToRgb(color)},0.3)`;
				ctx.lineWidth = 2;
				ctx.stroke();

				ctx.beginPath();
				ctx.arc(0, timerY, timerRadius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
				ctx.strokeStyle = color;
				ctx.lineWidth = 2;
				ctx.stroke();

				// Timer text
				ctx.font = '8px "JetBrains Mono", monospace';
				ctx.fillStyle = color;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.globalAlpha = 0.8;
				ctx.fillText(`${Math.ceil(bot.timerMax - bot.timerValue)}s`, 0, timerY);
				ctx.globalAlpha = 1;
				break;
			}
			case 'database': {
				// Stack of data blocks below bot
				let blockY = size * 0.6;
				for (const block of bot.dataBlocks) {
					ctx.fillStyle = block.color;
					ctx.globalAlpha = block.alpha * 0.7;
					ctx.fillRect(-block.width / 2, blockY - block.height, block.width, block.height);
					ctx.strokeStyle = color;
					ctx.lineWidth = 0.5;
					ctx.globalAlpha = block.alpha * 0.4;
					ctx.strokeRect(-block.width / 2, blockY - block.height, block.width, block.height);
					blockY -= block.height + 1;
				}
				ctx.globalAlpha = 1;
				break;
			}
		}
	}

	function drawSpawnAnimation(ctx: CanvasRenderingContext2D, bot: Bot, dt: number) {
		// Draw converging particles
		for (const p of bot.spawnParticles) {
			ctx.beginPath();
			ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
			ctx.fillStyle = p.color;
			ctx.globalAlpha = p.life * 0.8;
			ctx.fill();

			// Trail
			const trailX = p.x - (p.targetX - p.x) * 0.3;
			const trailY = p.y - (p.targetY - p.y) * 0.3;
			ctx.beginPath();
			ctx.moveTo(p.x, p.y);
			ctx.lineTo(trailX, trailY);
			ctx.strokeStyle = p.color;
			ctx.lineWidth = 1;
			ctx.globalAlpha = p.life * 0.4;
			ctx.stroke();
		}
		ctx.globalAlpha = 1;

		// Semi-assembled body at center
		if (bot.spawnProgress > 0.5) {
			const alpha = (bot.spawnProgress - 0.5) * 2;
			ctx.save();
			ctx.translate(bot.x, bot.y);
			ctx.globalAlpha = alpha;

			ctx.beginPath();
			for (let i = 0; i < 6; i++) {
				const a = (Math.PI / 3) * i - Math.PI / 6;
				const px = Math.cos(a) * bot.size * bot.spawnProgress;
				const py = Math.sin(a) * bot.size * bot.spawnProgress;
				if (i === 0) ctx.moveTo(px, py);
				else ctx.lineTo(px, py);
			}
			ctx.closePath();
			ctx.fillStyle = 'rgba(10,12,18,0.85)';
			ctx.fill();
			ctx.strokeStyle = bot.color;
			ctx.lineWidth = 2;
			ctx.stroke();

			ctx.restore();
		}
	}

	function drawEnvelopes(ctx: CanvasRenderingContext2D, bot: Bot) {
		for (const env of bot.envelopes) {
			ctx.save();
			ctx.translate(env.x, env.y);

			if (env.sent && env.sentTimer > 0) {
				// Show check mark
				ctx.font = '10px "JetBrains Mono", monospace';
				ctx.fillStyle = AURORA.cyan;
				ctx.globalAlpha = env.sentTimer;
				ctx.textAlign = 'center';
				ctx.fillText('Sent', 0, -8);
				ctx.globalAlpha = 1;
			}

			// Envelope shape
			const sz = 6;
			ctx.beginPath();
			ctx.moveTo(-sz, -sz * 0.6);
			ctx.lineTo(sz, -sz * 0.6);
			ctx.lineTo(sz, sz * 0.6);
			ctx.lineTo(-sz, sz * 0.6);
			ctx.closePath();
			ctx.fillStyle = `rgba(${hexToRgb(AURORA.cyan)},0.3)`;
			ctx.strokeStyle = AURORA.cyan;
			ctx.lineWidth = 1;
			ctx.globalAlpha = Math.min(1, env.life * 2);
			ctx.fill();
			ctx.stroke();

			// Flap
			ctx.beginPath();
			ctx.moveTo(-sz, -sz * 0.6);
			ctx.lineTo(0, sz * 0.1);
			ctx.lineTo(sz, -sz * 0.6);
			ctx.strokeStyle = AURORA.cyan;
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.globalAlpha = 1;

			ctx.restore();
		}
	}

	function drawTextLines(ctx: CanvasRenderingContext2D, bot: Bot) {
		for (const line of bot.textLines) {
			ctx.font = '9px "JetBrains Mono", monospace';
			ctx.fillStyle = AURORA.green;
			ctx.globalAlpha = line.alpha * (line.eaten ? 0.3 : 0.7);
			ctx.textAlign = 'center';
			ctx.fillText(line.text, line.x, line.y);
			ctx.globalAlpha = 1;
		}
	}

	function drawNotifications(ctx: CanvasRenderingContext2D) {
		for (const n of notifications) {
			const progress = 1 - n.life / n.maxLife;
			const y = n.y - progress * 30;
			const alpha = n.life / n.maxLife;

			ctx.save();
			ctx.font = '10px "JetBrains Mono", monospace';
			ctx.fillStyle = n.color;
			ctx.globalAlpha = alpha;
			ctx.textAlign = 'center';
			ctx.fillText(n.text, n.x, y);
			ctx.restore();
		}
	}

	function drawConnectionLines(ctx: CanvasRenderingContext2D) {
		ctx.save();
		for (let i = 0; i < bots.length; i++) {
			if (bots[i].spawning) continue;
			for (let j = i + 1; j < bots.length; j++) {
				if (bots[j].spawning) continue;
				const d = distance(bots[i].x, bots[i].y, bots[j].x, bots[j].y);
				if (d < 200) {
					const alpha = (1 - d / 200) * 0.08;
					ctx.beginPath();
					ctx.moveTo(bots[i].x, bots[i].y);
					ctx.lineTo(bots[j].x, bots[j].y);
					ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
					ctx.lineWidth = 0.5;
					ctx.stroke();
				}
			}
		}
		ctx.restore();
	}

	// ── Update Logic ───────────────────────────────────────
	function updateBot(bot: Bot, dt: number) {
		// Spawn animation
		if (bot.spawning) {
			bot.spawnProgress += dt * 0.8;
			for (const p of bot.spawnParticles) {
				p.x = lerp(p.x, p.targetX, dt * 3);
				p.y = lerp(p.y, p.targetY, dt * 3);
				p.life -= dt * 0.6;
			}
			bot.spawnParticles = bot.spawnParticles.filter(p => p.life > 0);
			if (bot.spawnProgress >= 1) {
				bot.spawning = false;
				bot.spawnProgress = 1;
				bot.spawnParticles = [];
			}
			return;
		}

		// Wobble
		bot.wobble += bot.wobbleSpeed * dt;

		// Autonomous movement (drift around home)
		const driftX = Math.sin(time * 0.3 + bot.id * 1.7) * 0.15;
		const driftY = Math.cos(time * 0.4 + bot.id * 2.3) * 0.12;

		// Spring back to home
		if (dragBot?.id !== bot.id) {
			const toHomeX = (bot.homeX - bot.x) * 0.01;
			const toHomeY = (bot.homeY - bot.y) * 0.01;
			bot.vx += toHomeX + driftX;
			bot.vy += toHomeY + driftY;
			bot.vx *= 0.95;
			bot.vy *= 0.95;
			bot.x += bot.vx;
			bot.y += bot.vy;
		}

		// Eye look toward mouse
		const toMouseX = mouseX - bot.x;
		const toMouseY = mouseY - bot.y;
		const toMouseDist = Math.sqrt(toMouseX * toMouseX + toMouseY * toMouseY);
		if (toMouseDist > 0) {
			bot.eyeOffset = lerp(bot.eyeOffset, clamp(toMouseX / toMouseDist, -1, 1) * 2, 0.1);
		}

		// Blink
		bot.blinkTimer -= dt;
		if (bot.blinkTimer <= 0) {
			bot.eyeBlink = 0;
			setTimeout(() => { bot.eyeBlink = 1; }, 120);
			bot.blinkTimer = random(2, 6);
		}

		// Angle
		bot.angle = Math.atan2(bot.vy, bot.vx);

		// Profession actions
		bot.actionTimer -= dt;
		if (bot.actionTimer <= 0) {
			performAction(bot);
			bot.actionTimer = bot.actionCooldown + random(-0.5, 0.5);
		}

		// Update profession-specific state
		updateProfessionState(bot, dt);
	}

	function performAction(bot: Bot) {
		const msgs = LOG_MESSAGES[bot.profession];
		const msg = msgs[Math.floor(random(0, msgs.length))];

		if (selectedBot?.id === bot.id) {
			addTerminalLine(msg);
		}
		bot.log.push(msg);
		if (bot.log.length > 50) bot.log.shift();

		switch (bot.profession) {
			case 'parser': {
				// Spawn a text line above the bot
				const snippet = TEXT_SNIPPETS[Math.floor(random(0, TEXT_SNIPPETS.length))];
				bot.textLines.push({
					x: bot.x + random(-40, 40),
					y: bot.y - bot.size - random(60, 120),
					text: snippet,
					speed: random(30, 60),
					alpha: 1,
					eaten: false
				});
				playTick();
				break;
			}
			case 'messenger': {
				// Send an envelope
				const angle = random(0, Math.PI * 2);
				const speed = random(60, 120);
				bot.envelopes.push({
					x: bot.x,
					y: bot.y,
					vx: Math.cos(angle) * speed,
					vy: Math.sin(angle) * speed,
					life: 2,
					sent: false,
					sentTimer: 0
				});
				playBlip();
				break;
			}
			case 'monitor': {
				// Chance of anomaly flash
				if (Math.random() < 0.25) {
					bot.radarFlash = 1;
					addNotification(bot.x, bot.y - bot.size - 20, '! ANOMALY', '#ff4444');
					if (selectedBot?.id === bot.id) {
						addTerminalLine('> !! ANOMALY DETECTED at sector ' + Math.floor(random(1, 9)));
					}
					playPing();
				}
				break;
			}
			case 'scheduler': {
				// "Launch" a random nearby bot
				const others = bots.filter(b => b.id !== bot.id && !b.spawning);
				if (others.length > 0) {
					const target = others[Math.floor(random(0, others.length))];
					target.vx += random(-3, 3);
					target.vy += random(-3, 3);
					addNotification(bot.x, bot.y - bot.size - 20, `> dispatch ${target.name.split(' ')[0]}`, AURORA.pink);
				}
				playTick();
				break;
			}
			case 'database': {
				// Add data block
				const blockWidth = random(8, 20);
				const blockHeight = random(3, 6);
				const blockColor = `rgba(${hexToRgb(AURORA.yellow)},0.5)`;
				bot.dataBlocks.push({ y: 0, width: blockWidth, height: blockHeight, color: blockColor, alpha: 1 });
				if (bot.dataBlocks.length > 6) bot.dataBlocks.shift();
				playTick();
				break;
			}
		}
	}

	function updateProfessionState(bot: Bot, dt: number) {
		switch (bot.profession) {
			case 'parser': {
				// Animate falling text lines
				for (const line of bot.textLines) {
					if (!line.eaten) {
						line.y += line.speed * dt;
						// Check if line reached bot
						if (line.y >= bot.y - bot.size * 0.5) {
							line.eaten = true;
							line.alpha = 0.5;
						}
					} else {
						line.alpha -= dt * 2;
					}
				}
				bot.textLines = bot.textLines.filter(l => l.alpha > 0);
				break;
			}
			case 'messenger': {
				for (const env of bot.envelopes) {
					env.x += env.vx * dt;
					env.y += env.vy * dt;
					env.life -= dt;
					// "Sent" notification when halfway
					if (env.life < 1 && !env.sent) {
						env.sent = true;
						env.sentTimer = 1;
						addNotification(env.x, env.y - 14, 'Sent', AURORA.cyan);
					}
					if (env.sent) {
						env.sentTimer -= dt;
					}
				}
				bot.envelopes = bot.envelopes.filter(e => e.life > 0);
				break;
			}
			case 'monitor': {
				bot.radarAngle += dt * 2.5;
				if (bot.radarFlash > 0) {
					bot.radarFlash -= dt * 2;
					if (bot.radarFlash < 0) bot.radarFlash = 0;
				}
				break;
			}
			case 'scheduler': {
				bot.timerValue += dt;
				if (bot.timerValue >= bot.timerMax) {
					bot.timerValue = 0;
					bot.timerMax = random(3, 6);
				}
				break;
			}
			case 'database': {
				// Fade old blocks
				for (const block of bot.dataBlocks) {
					if (bot.dataBlocks.indexOf(block) < bot.dataBlocks.length - 4) {
						block.alpha = Math.max(0.2, block.alpha - dt * 0.1);
					}
				}
				break;
			}
		}
	}

	// ── Terminal Typing Update ─────────────────────────────
	function updateTerminalTyping(dt: number) {
		if (terminalTyping === '') {
			if (terminalPendingLines.length > 0) {
				terminalTyping = terminalPendingLines.shift()!;
				terminalTypeIndex = 0;
				terminalTypeTimer = 0;
			}
			return;
		}

		terminalTypeTimer += dt;
		const typeSpeed = 0.025;
		while (terminalTypeTimer >= typeSpeed && terminalTypeIndex < terminalTyping.length) {
			terminalTypeIndex++;
			terminalTypeTimer -= typeSpeed;
		}

		if (terminalTypeIndex >= terminalTyping.length) {
			terminalLines.push(terminalTyping);
			if (terminalLines.length > 20) terminalLines.shift();
			terminalTyping = '';
			terminalTypeIndex = 0;
		}
	}

	// ── Main Loop ──────────────────────────────────────────
	let lastTime = 0;

	function animate(timestamp: number) {
		const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
		lastTime = timestamp;
		time += dt;

		if (!ctx) {
			animFrame = requestAnimationFrame(animate);
			return;
		}

		ctx.clearRect(0, 0, width, height);

		// Background
		ctx.fillStyle = '#0a0c12';
		ctx.fillRect(0, 0, width, height);

		// Grid
		drawGrid(ctx);

		// Connection lines between bots
		drawConnectionLines(ctx);

		// Update and draw bots
		for (const bot of bots) {
			updateBot(bot, dt);

			// Draw text lines (parser)
			if (bot.profession === 'parser') {
				drawTextLines(ctx, bot);
			}

			// Draw envelopes (messenger)
			if (bot.profession === 'messenger') {
				drawEnvelopes(ctx, bot);
			}

			drawBot(ctx, bot, dt);
		}

		// Notifications
		for (const n of notifications) {
			n.life -= dt;
		}
		notifications = notifications.filter(n => n.life > 0);
		drawNotifications(ctx);

		// Terminal typing
		updateTerminalTyping(dt);

		// Re-trigger terminal render by assignment (Svelte reactivity via the vars)
		if (terminalTyping !== '') {
			terminalLines = terminalLines;
		}

		animFrame = requestAnimationFrame(animate);
	}

	// ── Utility ────────────────────────────────────────────
	function hexToRgb(hex: string): string {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return `${r},${g},${b}`;
	}

	function getBotAtPos(x: number, y: number): Bot | null {
		for (let i = bots.length - 1; i >= 0; i--) {
			const bot = bots[i];
			if (bot.spawning) continue;
			const d = distance(x, y, bot.x, bot.y);
			if (d < bot.size + 10) return bot;
		}
		return null;
	}

	// ── Event Handlers ─────────────────────────────────────
	function onMouseMove(e: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		mouseX = (e.clientX - rect.left) * dpr;
		mouseY = (e.clientY - rect.top) * dpr;

		if (dragBot) {
			dragBot.x = mouseX - dragOffsetX;
			dragBot.y = mouseY - dragOffsetY;
			return;
		}

		const bot = getBotAtPos(mouseX, mouseY);
		if (bot && !bot.spawning) {
			hoveredBot = bot;
			cursorState.set('hover');
			cursorLabel.set(bot.name);
		} else {
			if (hoveredBot) {
				hoveredBot = null;
				cursorState.set('default');
				cursorLabel.set('');
			}
		}
	}

	function onMouseDown(e: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		const mx = (e.clientX - rect.left) * dpr;
		const my = (e.clientY - rect.top) * dpr;
		mouseDown = true;

		const bot = getBotAtPos(mx, my);
		if (bot && !bot.spawning) {
			dragBot = bot;
			dragOffsetX = mx - bot.x;
			dragOffsetY = my - bot.y;
			cursorState.set('drag');
			cursorLabel.set('');
			playClick();
		}
	}

	function onMouseUp(e: MouseEvent) {
		if (dragBot) {
			const movedDist = distance(dragBot.x, dragBot.y, dragBot.x + dragOffsetX, dragBot.y + dragOffsetY);
			// If barely moved, treat as click
			if (movedDist < 5) {
				openTerminal(dragBot);
			} else {
				// Spring physics: bot wants to return but we let it keep the new position somewhat
				// Apply a velocity back toward home
				dragBot.vx = (dragBot.homeX - dragBot.x) * 0.05;
				dragBot.vy = (dragBot.homeY - dragBot.y) * 0.05;
			}
			dragBot = null;
			cursorState.set('default');
			cursorLabel.set('');
		}
		mouseDown = false;
	}

	function onMouseLeave() {
		mouseX = -1000;
		mouseY = -1000;
		if (hoveredBot) {
			hoveredBot = null;
			cursorState.set('default');
			cursorLabel.set('');
		}
	}

	function onDeployEnter() {
		deployButtonHover = true;
		cursorState.set('hover');
		cursorLabel.set('deploy');
	}

	function onDeployLeave() {
		deployButtonHover = false;
		cursorState.set('default');
		cursorLabel.set('');
	}

	// ── Lifecycle ──────────────────────────────────────────
	onMount(() => {
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		const context = canvas.getContext('2d');
		if (!context) return;
		ctx = context;

		function resize() {
			const rect = canvas.parentElement!.getBoundingClientRect();
			width = rect.width * dpr;
			height = rect.height * dpr;
			canvas.width = width;
			canvas.height = height;
			canvas.style.width = rect.width + 'px';
			canvas.style.height = rect.height + 'px';
			ctx.setTransform(1, 0, 0, 1, 0, 0);
		}

		resize();
		spawnInitialBots();

		window.addEventListener('resize', resize);

		lastTime = performance.now();
		animFrame = requestAnimationFrame(animate);

		return () => {
			window.removeEventListener('resize', resize);
			cancelAnimationFrame(animFrame);
		};
	});

	onDestroy(() => {
		if (animFrame) cancelAnimationFrame(animFrame);
		cursorState.set('default');
		cursorLabel.set('');
	});

	// ── Terminal position computation ──────────────────────
	$: terminalX = selectedBot ? Math.min(Math.max(selectedBot.x / dpr, 180), (width / dpr) - 180) : 0;
	$: terminalY = selectedBot ? Math.min(selectedBot.y / dpr + selectedBot.size + 20, (height / dpr) - 260) : 0;
	$: terminalDisplayLines = [...terminalLines, ...(terminalTyping ? [terminalTyping.slice(0, terminalTypeIndex) + (terminalTypeIndex < terminalTyping.length ? '_' : '')] : [])].slice(-14);
</script>

<section class="bot-swarm" aria-label="Bot Swarm project scene">
	<!-- Title overlay -->
	<div class="scene-header">
		<h2 class="scene-title">Bot Swarm</h2>
		<p class="scene-subtitle">Automation & Bots</p>
	</div>

	<!-- Tags -->
	<div class="scene-tags">
		{#each TAGS as tag}
			<span class="tag">{tag}</span>
		{/each}
	</div>

	<!-- Canvas -->
	<canvas
		bind:this={canvas}
		class="swarm-canvas"
		on:mousemove={onMouseMove}
		on:mousedown={onMouseDown}
		on:mouseup={onMouseUp}
		on:mouseleave={onMouseLeave}
	></canvas>

	<!-- Deploy button -->
	<button
		class="deploy-btn"
		class:animating={deployAnimating}
		on:click={deployNewBot}
		on:mouseenter={onDeployEnter}
		on:mouseleave={onDeployLeave}
	>
		<span class="deploy-icon">+</span>
		<span class="deploy-text">Deploy New Bot</span>
	</button>

	<!-- Mini terminal popup -->
	{#if selectedBot}
		<div
			class="terminal-popup"
			style="left: {terminalX}px; top: {terminalY}px;"
		>
			<div class="terminal-header">
				<span class="terminal-dot" style="background: {selectedBot.color};"></span>
				<span class="terminal-title">{selectedBot.name}</span>
				<button class="terminal-close" on:click={() => { selectedBot = null; }}>x</button>
			</div>
			<div class="terminal-body">
				{#each terminalDisplayLines as line}
					<div class="terminal-line" style="color: {line.startsWith('>') ? selectedBot.color : 'var(--text-muted)'};">
						{line}
					</div>
				{/each}
				<div class="terminal-cursor">_</div>
			</div>
		</div>
	{/if}

	<!-- Interaction hint -->
	<div class="scene-hint">
		<span>click on bots to inspect</span>
		<span class="hint-sep">&bull;</span>
		<span>drag to move</span>
	</div>
</section>

<style>
	.bot-swarm {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: #0a0c12;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.swarm-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 0;
		cursor: none;
	}

	/* ── Header ─────────────────────────────────────── */
	.scene-header {
		position: relative;
		z-index: 2;
		text-align: center;
		padding-top: 32px;
		pointer-events: none;
	}

	.scene-title {
		font-family: var(--font-sans, 'Inter', sans-serif);
		font-size: clamp(28px, 4vw, 48px);
		font-weight: 800;
		letter-spacing: 0.04em;
		color: var(--text-primary, #e8eaf0);
		margin: 0 0 4px 0;
		text-shadow: 0 0 40px rgba(0, 212, 255, 0.15);
	}

	.scene-subtitle {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: clamp(12px, 1.5vw, 16px);
		color: var(--text-muted, #555a6e);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		margin: 0;
	}

	/* ── Tags ───────────────────────────────────────── */
	.scene-tags {
		position: relative;
		z-index: 2;
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
		margin-top: 12px;
		pointer-events: none;
	}

	.tag {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 11px;
		color: var(--text-muted, #555a6e);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		padding: 3px 8px;
		letter-spacing: 0.04em;
	}

	/* ── Deploy Button ──────────────────────────────── */
	.deploy-btn {
		position: absolute;
		bottom: 60px;
		right: 32px;
		z-index: 3;
		display: flex;
		align-items: center;
		gap: 8px;
		background: rgba(10, 12, 18, 0.8);
		border: 1px solid rgba(0, 212, 255, 0.3);
		border-radius: 8px;
		padding: 10px 18px;
		color: var(--aurora-cyan, #00d4ff);
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 12px;
		cursor: none;
		transition: all 0.3s ease;
		backdrop-filter: blur(8px);
	}

	.deploy-btn:hover {
		border-color: rgba(0, 212, 255, 0.6);
		background: rgba(0, 212, 255, 0.08);
		box-shadow: 0 0 20px rgba(0, 212, 255, 0.15);
	}

	.deploy-btn.animating {
		border-color: rgba(0, 255, 136, 0.6);
		color: var(--aurora-green, #00ff88);
	}

	.deploy-icon {
		font-size: 18px;
		font-weight: 700;
		line-height: 1;
	}

	.deploy-text {
		letter-spacing: 0.04em;
	}

	/* ── Terminal Popup ─────────────────────────────── */
	.terminal-popup {
		position: absolute;
		z-index: 4;
		width: 320px;
		max-height: 280px;
		background: rgba(10, 12, 18, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		overflow: hidden;
		transform: translateX(-50%);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(12px);
		animation: terminalIn 0.2s ease-out;
		pointer-events: auto;
	}

	@keyframes terminalIn {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(8px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0) scale(1);
		}
	}

	.terminal-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.03);
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.terminal-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		box-shadow: 0 0 6px currentColor;
	}

	.terminal-title {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 11px;
		color: var(--text-secondary, #a0a4b8);
		letter-spacing: 0.04em;
		flex: 1;
	}

	.terminal-close {
		background: none;
		border: none;
		color: var(--text-muted, #555a6e);
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 12px;
		cursor: pointer;
		padding: 0 4px;
		line-height: 1;
		transition: color 0.2s;
	}

	.terminal-close:hover {
		color: var(--text-primary, #e8eaf0);
	}

	.terminal-body {
		padding: 8px 12px;
		max-height: 220px;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
	}

	.terminal-body::-webkit-scrollbar {
		width: 4px;
	}

	.terminal-body::-webkit-scrollbar-track {
		background: transparent;
	}

	.terminal-body::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
	}

	.terminal-line {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		line-height: 1.6;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.terminal-cursor {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		color: var(--text-muted, #555a6e);
		animation: blink 1s step-end infinite;
		display: inline;
	}

	@keyframes blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0; }
	}

	/* ── Hint ───────────────────────────────────────── */
	.scene-hint {
		position: absolute;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 10px;
		pointer-events: none;
	}

	.scene-hint span {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 11px;
		color: var(--text-muted, #555a6e);
		letter-spacing: 0.06em;
		opacity: 0.6;
	}

	.hint-sep {
		opacity: 0.3 !important;
	}

	/* ── Responsive ─────────────────────────────────── */
	@media (max-width: 768px) {
		.deploy-btn {
			bottom: 56px;
			right: 16px;
			padding: 8px 14px;
			font-size: 11px;
		}

		.terminal-popup {
			width: 260px;
		}
	}
</style>
