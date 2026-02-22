<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { cursorState, cursorLabel } from '$lib/stores/cursor';
	import { playBoom, playClick, playPing, playBlip } from '$lib/utils/audio';
	import { lerp, clamp, random, distance, easeOutCubic, easeInOutCubic } from '$lib/utils/math';

	// ─── Types ──────────────────────────────────────────────────────────
	interface Transaction {
		id: string;
		from: string;
		to: string;
		amount: number;
		gas: number;
		x: number;
		y: number;
		vx: number;
		vy: number;
		radius: number;
		color: string;
		alpha: number;
		createdAt: number;
		included: boolean;
		splashTime: number;
		scanProgress: number;
		scanColor: string;
	}

	interface Block {
		index: number;
		hash: string;
		prevHash: string;
		timestamp: number;
		transactions: Transaction[];
		nonce: number;
		x: number;
		y: number;
		width: number;
		height: number;
		crystallizeProgress: number;
		crystallizeParticles: CrystalParticle[];
		glowIntensity: number;
		alpha: number;
	}

	interface CrystalParticle {
		x: number;
		y: number;
		targetX: number;
		targetY: number;
		size: number;
		color: string;
		progress: number;
		speed: number;
	}

	interface GridPulse {
		x: number;
		y: number;
		radius: number;
		maxRadius: number;
		alpha: number;
	}

	interface AttackBlock {
		index: number;
		x: number;
		y: number;
		width: number;
		height: number;
		alpha: number;
	}

	type NetworkType = 'bitcoin' | 'ethereum' | 'solana';

	interface NetworkConfig {
		name: string;
		blockTime: number;
		blockWidth: number;
		blockHeight: number;
		maxTxPerBlock: number;
		color: string;
		accentColor: string;
		particleColor: string;
	}

	// ─── Constants ──────────────────────────────────────────────────────
	const NETWORKS: Record<NetworkType, NetworkConfig> = {
		bitcoin: {
			name: 'Bitcoin',
			blockTime: 6000,
			blockWidth: 140,
			blockHeight: 100,
			maxTxPerBlock: 4,
			color: '#f7931a',
			accentColor: '#ffb74d',
			particleColor: '#f7931a'
		},
		ethereum: {
			name: 'Ethereum',
			blockTime: 4000,
			blockWidth: 120,
			blockHeight: 90,
			maxTxPerBlock: 6,
			color: '#00ff88',
			accentColor: '#00d4ff',
			particleColor: '#627eea'
		},
		solana: {
			name: 'Solana',
			blockTime: 1800,
			blockWidth: 100,
			blockHeight: 75,
			maxTxPerBlock: 10,
			color: '#b44aff',
			accentColor: '#ff44aa',
			particleColor: '#9945ff'
		}
	};

	const MEMPOOL_REGION = { x: 40, y: 60, width: 220, height: 0 };
	const CHAIN_Y_CENTER = 0;
	const CHAIN_START_X = 320;
	const BLOCK_GAP = 60;
	const SCAN_BEAM_INTERVAL = 2000;

	// ─── State ──────────────────────────────────────────────────────────
	let canvas: HTMLCanvasElement;
	let container: HTMLDivElement;
	let animFrame: number;
	let canvasWidth = 900;
	let canvasHeight = 550;

	let network: NetworkType = 'ethereum';
	let gasPrice: number = 50;
	let blocks: Block[] = [];
	let mempool: Transaction[] = [];
	let gridPulses: GridPulse[] = [];
	let lastBlockTime = 0;
	let lastScanTime = 0;
	let viewOffsetX = 0;
	let targetViewOffsetX = 0;
	let time = 0;
	let hoveredBlock: Block | null = null;
	let hoverTooltipX = 0;
	let hoverTooltipY = 0;
	let showTooltip = false;

	// Transaction form
	let txFrom = '';
	let txTo = '';
	let txAmount = '';
	let formVisible = true;

	// Attack state
	let attackActive = false;
	let attackBlocks: AttackBlock[] = [];
	let attackProgress = 0;
	let attackPhase: 'growing' | 'overtaking' | 'reset' = 'growing';
	let attackStartTime = 0;
	let showAttackButton = false;
	let attackClickCount = 0;

	// Splash particles
	interface SplashParticle {
		x: number;
		y: number;
		vx: number;
		vy: number;
		alpha: number;
		size: number;
		color: string;
	}
	let splashParticles: SplashParticle[] = [];

	// Validator beams
	interface ScanBeam {
		x: number;
		y: number;
		targetTx: Transaction | null;
		progress: number;
		active: boolean;
	}
	let scanBeams: ScanBeam[] = [];

	// ─── Helpers ─────────────────────────────────────────────────────────
	function getConfig(): NetworkConfig {
		return NETWORKS[network];
	}

	function generateHash(): string {
		const chars = '0123456789abcdef';
		let hash = '0x';
		for (let i = 0; i < 8; i++) hash += chars[Math.floor(Math.random() * chars.length)];
		return hash;
	}

	function generateNonce(): number {
		return Math.floor(Math.random() * 999999);
	}

	function hexToRgba(hex: string, alpha: number): string {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	function getMempoolHeight(): number {
		return canvasHeight - 140;
	}

	function createTransaction(from: string, to: string, amount: number, gasOverride?: number): Transaction {
		const gas = gasOverride ?? (gasPrice + random(-20, 20));
		const clampedGas = clamp(gas, 5, 100);
		const radius = 6 + (clampedGas / 100) * 14;
		const cfg = getConfig();
		const mpH = getMempoolHeight();
		return {
			id: generateHash(),
			from: from || '0x' + Math.random().toString(16).slice(2, 8),
			to: to || '0x' + Math.random().toString(16).slice(2, 8),
			amount: amount || parseFloat((Math.random() * 10).toFixed(4)),
			gas: clampedGas,
			x: MEMPOOL_REGION.x + MEMPOOL_REGION.width / 2 + random(-60, 60),
			y: MEMPOOL_REGION.y + mpH / 2 + random(-mpH / 3, mpH / 3),
			vx: random(-0.5, 0.5),
			vy: random(-0.5, 0.5),
			radius,
			color: cfg.color,
			alpha: 0,
			createdAt: Date.now(),
			included: false,
			splashTime: 0,
			scanProgress: 0,
			scanColor: cfg.accentColor
		};
	}

	function spawnSplash(x: number, y: number, color: string) {
		for (let i = 0; i < 12; i++) {
			const angle = (Math.PI * 2 * i) / 12 + random(-0.3, 0.3);
			splashParticles.push({
				x,
				y,
				vx: Math.cos(angle) * random(1.5, 4),
				vy: Math.sin(angle) * random(1.5, 4),
				alpha: 1,
				size: random(2, 5),
				color
			});
		}
	}

	function addTransaction(from: string, to: string, amount: number) {
		const tx = createTransaction(from, to, amount);
		mempool.push(tx);
		tx.splashTime = Date.now();
		spawnSplash(tx.x, tx.y, tx.color);
		playPing();
	}

	function handleSubmitTransaction() {
		const amt = parseFloat(txAmount) || random(0.01, 10);
		addTransaction(txFrom || '', txTo || '', amt);
		txFrom = '';
		txTo = '';
		txAmount = '';
		playClick();
	}

	function createGenesisBlock() {
		const cfg = getConfig();
		blocks = [{
			index: 0,
			hash: generateHash(),
			prevHash: '0x00000000',
			timestamp: Date.now(),
			transactions: [],
			nonce: 0,
			x: CHAIN_START_X,
			y: CHAIN_Y_CENTER,
			width: cfg.blockWidth,
			height: cfg.blockHeight,
			crystallizeProgress: 1,
			crystallizeParticles: [],
			glowIntensity: 0,
			alpha: 1
		}];
	}

	function createBlock() {
		const cfg = getConfig();
		const prevBlock = blocks[blocks.length - 1];
		if (!prevBlock) return;

		// Sort mempool by gas (highest first) and pick top transactions
		const sorted = [...mempool]
			.filter(tx => !tx.included)
			.sort((a, b) => b.gas - a.gas);

		const selected = sorted.slice(0, cfg.maxTxPerBlock);
		selected.forEach(tx => { tx.included = true; });

		const newX = prevBlock.x + prevBlock.width + BLOCK_GAP;
		const newBlock: Block = {
			index: prevBlock.index + 1,
			hash: generateHash(),
			prevHash: prevBlock.hash,
			timestamp: Date.now(),
			transactions: selected,
			nonce: generateNonce(),
			x: newX,
			y: CHAIN_Y_CENTER,
			width: cfg.blockWidth,
			height: cfg.blockHeight,
			crystallizeProgress: 0,
			crystallizeParticles: [],
			glowIntensity: 1.5,
			alpha: 0
		};

		// Create crystallize particles
		const particleCount = 30;
		for (let i = 0; i < particleCount; i++) {
			const angle = random(0, Math.PI * 2);
			const dist = random(60, 160);
			newBlock.crystallizeParticles.push({
				x: newX + cfg.blockWidth / 2 + Math.cos(angle) * dist,
				y: canvasHeight / 2 + Math.sin(angle) * dist,
				targetX: newX + random(4, cfg.blockWidth - 4),
				targetY: canvasHeight / 2 - cfg.blockHeight / 2 + random(4, cfg.blockHeight - 4),
				size: random(2, 5),
				color: cfg.color,
				progress: 0,
				speed: random(0.01, 0.03)
			});
		}

		blocks.push(newBlock);

		// Remove included transactions from mempool
		mempool = mempool.filter(tx => !tx.included);

		// Scroll view to show new block
		const rightEdge = newX + cfg.blockWidth + 80;
		if (rightEdge > canvasWidth + targetViewOffsetX - 40) {
			targetViewOffsetX = rightEdge - canvasWidth + 100;
		}

		// Grid pulse from new block
		gridPulses.push({
			x: newX + cfg.blockWidth / 2,
			y: canvasHeight / 2,
			radius: 0,
			maxRadius: 300,
			alpha: 0.4
		});

		playBoom();
		lastBlockTime = Date.now();
	}

	function switchNetwork(n: NetworkType) {
		if (n === network) return;
		network = n;
		blocks = [];
		mempool = [];
		attackActive = false;
		attackBlocks = [];
		viewOffsetX = 0;
		targetViewOffsetX = 0;
		createGenesisBlock();
		lastBlockTime = Date.now();
		playBlip();
	}

	function triggerAttack() {
		if (attackActive) return;
		attackActive = true;
		attackPhase = 'growing';
		attackStartTime = Date.now();
		attackProgress = 0;
		attackBlocks = [];
		playBoom();

		// Build attack chain from a forked point
		const forkPoint = Math.max(0, blocks.length - 3);
		const forkBlock = blocks[forkPoint];
		if (!forkBlock) return;

		for (let i = 0; i < 8; i++) {
			attackBlocks.push({
				index: forkPoint + i + 1,
				x: forkBlock.x + forkBlock.width + BLOCK_GAP + i * (80 + BLOCK_GAP),
				y: CHAIN_Y_CENTER + 130,
				width: 80,
				height: 60,
				alpha: 0
			});
		}
	}

	// ─── Canvas Drawing ─────────────────────────────────────────────────
	function drawGrid(ctx: CanvasRenderingContext2D, t: number) {
		const spacing = 40;
		const heartbeat = Math.sin(t * 3) * 0.3 + 0.7;
		const baseAlpha = 0.04 * heartbeat;

		ctx.strokeStyle = `rgba(0, 212, 255, ${baseAlpha})`;
		ctx.lineWidth = 0.5;

		// Vertical lines
		const offsetXMod = viewOffsetX % spacing;
		for (let x = -offsetXMod; x < canvasWidth; x += spacing) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, canvasHeight);
			ctx.stroke();
		}
		// Horizontal lines
		for (let y = 0; y < canvasHeight; y += spacing) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(canvasWidth, y);
			ctx.stroke();
		}

		// Heartbeat center line
		const centerY = canvasHeight / 2;
		ctx.strokeStyle = `rgba(0, 212, 255, ${0.08 * heartbeat})`;
		ctx.lineWidth = 1;
		ctx.beginPath();
		for (let x = 0; x < canvasWidth; x += 2) {
			const wx = x + viewOffsetX;
			const pulse = Math.sin(wx * 0.02 + t * 4) * 8 * heartbeat;
			const diff = (wx % 200) - 100;
			const spike = Math.exp(-(diff * diff) / 200) * 25 * heartbeat;
			if (x === 0) ctx.moveTo(x, centerY + pulse + spike);
			else ctx.lineTo(x, centerY + pulse + spike);
		}
		ctx.stroke();
	}

	function drawGridPulses(ctx: CanvasRenderingContext2D) {
		for (const pulse of gridPulses) {
			const drawX = pulse.x - viewOffsetX;
			ctx.strokeStyle = hexToRgba(getConfig().color, pulse.alpha);
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(drawX, pulse.y, pulse.radius, 0, Math.PI * 2);
			ctx.stroke();
		}
	}

	function drawMempoolRegion(ctx: CanvasRenderingContext2D, t: number) {
		const mpH = getMempoolHeight();
		const x = MEMPOOL_REGION.x;
		const y = MEMPOOL_REGION.y;
		const w = MEMPOOL_REGION.width;
		const h = mpH;

		// Background
		const grad = ctx.createLinearGradient(x, y, x, y + h);
		grad.addColorStop(0, 'rgba(0, 20, 40, 0.4)');
		grad.addColorStop(1, 'rgba(0, 10, 30, 0.6)');
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.roundRect(x, y, w, h, 8);
		ctx.fill();

		// Border with pulse
		const borderAlpha = 0.2 + Math.sin(t * 2) * 0.1;
		ctx.strokeStyle = hexToRgba(getConfig().color, borderAlpha);
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.roundRect(x, y, w, h, 8);
		ctx.stroke();

		// Label
		ctx.fillStyle = `rgba(255, 255, 255, 0.5)`;
		ctx.font = '10px "JetBrains Mono", monospace';
		ctx.textAlign = 'center';
		ctx.fillText('MEMPOOL', x + w / 2, y + 14);
		ctx.fillText(`${mempool.length} pending`, x + w / 2, y + 26);
	}

	function drawTransactions(ctx: CanvasRenderingContext2D, t: number) {
		const mpH = getMempoolHeight();
		for (const tx of mempool) {
			// Fade in
			tx.alpha = Math.min(tx.alpha + 0.04, 1);

			// Chaotic floating
			tx.vx += random(-0.08, 0.08);
			tx.vy += random(-0.08, 0.08);
			tx.vx *= 0.96;
			tx.vy *= 0.96;

			// Gas priority: higher gas floats toward top
			const targetY = MEMPOOL_REGION.y + 30 + (1 - tx.gas / 100) * (mpH - 60);
			tx.vy += (targetY - tx.y) * 0.002;

			tx.x += tx.vx;
			tx.y += tx.vy;

			// Contain within mempool
			const minX = MEMPOOL_REGION.x + tx.radius + 5;
			const maxX = MEMPOOL_REGION.x + MEMPOOL_REGION.width - tx.radius - 5;
			const minY = MEMPOOL_REGION.y + tx.radius + 30;
			const maxY = MEMPOOL_REGION.y + mpH - tx.radius - 5;

			if (tx.x < minX) { tx.x = minX; tx.vx *= -0.5; }
			if (tx.x > maxX) { tx.x = maxX; tx.vx *= -0.5; }
			if (tx.y < minY) { tx.y = minY; tx.vy *= -0.5; }
			if (tx.y > maxY) { tx.y = maxY; tx.vy *= -0.5; }

			// Draw glow
			const glowRadius = tx.radius + 8 + Math.sin(t * 4 + tx.gas) * 3;
			const glow = ctx.createRadialGradient(tx.x, tx.y, 0, tx.x, tx.y, glowRadius);
			glow.addColorStop(0, hexToRgba(tx.color, 0.3 * tx.alpha));
			glow.addColorStop(1, hexToRgba(tx.color, 0));
			ctx.fillStyle = glow;
			ctx.beginPath();
			ctx.arc(tx.x, tx.y, glowRadius, 0, Math.PI * 2);
			ctx.fill();

			// Draw sphere
			const sphereGrad = ctx.createRadialGradient(
				tx.x - tx.radius * 0.3, tx.y - tx.radius * 0.3, 0,
				tx.x, tx.y, tx.radius
			);
			sphereGrad.addColorStop(0, hexToRgba(tx.color, 0.9 * tx.alpha));
			sphereGrad.addColorStop(0.7, hexToRgba(tx.color, 0.5 * tx.alpha));
			sphereGrad.addColorStop(1, hexToRgba(tx.color, 0.15 * tx.alpha));
			ctx.fillStyle = sphereGrad;
			ctx.beginPath();
			ctx.arc(tx.x, tx.y, tx.radius, 0, Math.PI * 2);
			ctx.fill();

			// Gas label
			ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * tx.alpha})`;
			ctx.font = '8px "JetBrains Mono", monospace';
			ctx.textAlign = 'center';
			ctx.fillText(`${tx.gas.toFixed(0)}g`, tx.x, tx.y + 3);
		}
	}

	function drawSplashParticles(ctx: CanvasRenderingContext2D) {
		for (const p of splashParticles) {
			ctx.fillStyle = hexToRgba(p.color, p.alpha);
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	function drawScanBeams(ctx: CanvasRenderingContext2D, t: number) {
		for (const beam of scanBeams) {
			if (!beam.active || !beam.targetTx) continue;

			const cfg = getConfig();
			const startX = MEMPOOL_REGION.x + MEMPOOL_REGION.width / 2;
			const startY = MEMPOOL_REGION.y - 5;
			const endX = beam.targetTx.x;
			const endY = beam.targetTx.y;

			const currentX = lerp(startX, endX, beam.progress);
			const currentY = lerp(startY, endY, beam.progress);

			// Beam line
			ctx.strokeStyle = hexToRgba(cfg.accentColor, 0.5 * (1 - beam.progress));
			ctx.lineWidth = 1.5;
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(startX, startY);
			ctx.lineTo(currentX, currentY);
			ctx.stroke();
			ctx.setLineDash([]);

			// Beam tip glow
			const tipGlow = ctx.createRadialGradient(currentX, currentY, 0, currentX, currentY, 12);
			tipGlow.addColorStop(0, hexToRgba(cfg.accentColor, 0.6));
			tipGlow.addColorStop(1, hexToRgba(cfg.accentColor, 0));
			ctx.fillStyle = tipGlow;
			ctx.beginPath();
			ctx.arc(currentX, currentY, 12, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	function drawBlock(ctx: CanvasRenderingContext2D, block: Block, t: number) {
		const cfg = getConfig();
		const drawX = block.x - viewOffsetX;
		const drawY = canvasHeight / 2 - block.height / 2;
		const w = block.width;
		const h = block.height;

		// Skip if off screen
		if (drawX + w < -50 || drawX > canvasWidth + 50) return;

		// Crystallize animation
		if (block.crystallizeProgress < 1) {
			block.crystallizeProgress = Math.min(block.crystallizeProgress + 0.015, 1);
			block.alpha = easeOutCubic(block.crystallizeProgress);

			// Draw crystallize particles
			for (const p of block.crystallizeParticles) {
				p.progress = Math.min(p.progress + p.speed, 1);
				const ep = easeInOutCubic(p.progress);
				const px = lerp(p.x, p.targetX, ep) - viewOffsetX;
				const py = lerp(p.y, p.targetY, ep);

				ctx.fillStyle = hexToRgba(p.color, 1 - p.progress * 0.6);
				ctx.beginPath();
				ctx.arc(px, py, p.size * (1 - p.progress * 0.5), 0, Math.PI * 2);
				ctx.fill();
			}
		}

		// Glow decay
		block.glowIntensity = Math.max(block.glowIntensity - 0.008, 0);

		// Block glow
		if (block.glowIntensity > 0) {
			const glowSize = 20 + block.glowIntensity * 30;
			const glow = ctx.createRadialGradient(
				drawX + w / 2, drawY + h / 2, 0,
				drawX + w / 2, drawY + h / 2, glowSize + w / 2
			);
			glow.addColorStop(0, hexToRgba(cfg.color, 0.3 * block.glowIntensity * block.alpha));
			glow.addColorStop(1, hexToRgba(cfg.color, 0));
			ctx.fillStyle = glow;
			ctx.fillRect(drawX - glowSize, drawY - glowSize, w + glowSize * 2, h + glowSize * 2);
		}

		// Block body
		const bodyGrad = ctx.createLinearGradient(drawX, drawY, drawX + w, drawY + h);
		bodyGrad.addColorStop(0, `rgba(15, 25, 40, ${0.85 * block.alpha})`);
		bodyGrad.addColorStop(1, `rgba(10, 15, 30, ${0.9 * block.alpha})`);
		ctx.fillStyle = bodyGrad;
		ctx.beginPath();
		ctx.roundRect(drawX, drawY, w, h, 6);
		ctx.fill();

		// Block border
		const borderPulse = 0.5 + Math.sin(t * 2 + block.index) * 0.15;
		ctx.strokeStyle = hexToRgba(cfg.color, borderPulse * block.alpha);
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.roundRect(drawX, drawY, w, h, 6);
		ctx.stroke();

		// Block interior content
		if (block.alpha > 0.5) {
			const textAlpha = (block.alpha - 0.5) * 2;

			// Block number
			ctx.fillStyle = hexToRgba(cfg.color, 0.9 * textAlpha);
			ctx.font = 'bold 11px "JetBrains Mono", monospace';
			ctx.textAlign = 'left';
			ctx.fillText(`#${block.index}`, drawX + 8, drawY + 16);

			// Hash
			ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * textAlpha})`;
			ctx.font = '8px "JetBrains Mono", monospace';
			ctx.fillText(block.hash, drawX + 8, drawY + 30);

			// Nonce
			ctx.fillStyle = `rgba(255, 255, 255, ${0.3 * textAlpha})`;
			ctx.fillText(`n:${block.nonce}`, drawX + 8, drawY + 42);

			// Transaction threads (glowing lines)
			const txStartY = drawY + 50;
			for (let i = 0; i < block.transactions.length && i < 4; i++) {
				const ty = txStartY + i * 10;
				const lineAlpha = 0.4 + Math.sin(t * 3 + i * 0.7) * 0.2;

				// Glowing thread
				ctx.strokeStyle = hexToRgba(cfg.accentColor, lineAlpha * textAlpha);
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.moveTo(drawX + 8, ty);
				const lineLen = w - 16;
				// Wavy line
				for (let lx = 0; lx <= lineLen; lx += 3) {
					const wave = Math.sin(lx * 0.15 + t * 5 + i) * 1.5;
					ctx.lineTo(drawX + 8 + lx, ty + wave);
				}
				ctx.stroke();

				// Thread glow
				ctx.strokeStyle = hexToRgba(cfg.accentColor, lineAlpha * 0.15 * textAlpha);
				ctx.lineWidth = 4;
				ctx.beginPath();
				ctx.moveTo(drawX + 8, ty);
				for (let lx = 0; lx <= lineLen; lx += 3) {
					const wave = Math.sin(lx * 0.15 + t * 5 + i) * 1.5;
					ctx.lineTo(drawX + 8 + lx, ty + wave);
				}
				ctx.stroke();
			}

			// Tx count
			if (block.transactions.length > 0) {
				ctx.fillStyle = `rgba(255, 255, 255, ${0.3 * textAlpha})`;
				ctx.font = '8px "JetBrains Mono", monospace';
				ctx.textAlign = 'right';
				ctx.fillText(`${block.transactions.length} tx`, drawX + w - 8, drawY + h - 8);
				ctx.textAlign = 'left';
			}
		}
	}

	function drawChainLinks(ctx: CanvasRenderingContext2D, t: number) {
		const cfg = getConfig();

		for (let i = 1; i < blocks.length; i++) {
			const prev = blocks[i - 1];
			const curr = blocks[i];
			if (curr.alpha < 0.1) continue;

			const x1 = prev.x + prev.width - viewOffsetX;
			const x2 = curr.x - viewOffsetX;
			const y = canvasHeight / 2;

			if (x1 > canvasWidth + 50 || x2 < -50) continue;

			const midX = (x1 + x2) / 2;

			// Main bridge line
			const linkAlpha = Math.min(prev.alpha, curr.alpha) * (0.4 + Math.sin(t * 2 + i) * 0.1);
			ctx.strokeStyle = hexToRgba(cfg.color, linkAlpha);
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(x1, y);
			ctx.lineTo(x2, y);
			ctx.stroke();

			// Traveling light dot
			const dotPhase = (t * 2 + i) % 1;
			const dotX = lerp(x1, x2, dotPhase);
			const dotGlow = ctx.createRadialGradient(dotX, y, 0, dotX, y, 6);
			dotGlow.addColorStop(0, hexToRgba(cfg.accentColor, 0.8 * linkAlpha));
			dotGlow.addColorStop(1, hexToRgba(cfg.accentColor, 0));
			ctx.fillStyle = dotGlow;
			ctx.beginPath();
			ctx.arc(dotX, y, 6, 0, Math.PI * 2);
			ctx.fill();

			// Connection nodes at endpoints
			ctx.fillStyle = hexToRgba(cfg.color, linkAlpha * 1.5);
			ctx.beginPath();
			ctx.arc(x1, y, 3, 0, Math.PI * 2);
			ctx.fill();
			ctx.beginPath();
			ctx.arc(x2, y, 3, 0, Math.PI * 2);
			ctx.fill();

			// Hash reference text
			ctx.fillStyle = `rgba(255, 255, 255, ${0.15 * linkAlpha})`;
			ctx.font = '7px "JetBrains Mono", monospace';
			ctx.textAlign = 'center';
			ctx.fillText(prev.hash.slice(0, 6), midX, y - 8);
		}
	}

	function drawAttack(ctx: CanvasRenderingContext2D, t: number) {
		if (!attackActive) return;

		const elapsed = (Date.now() - attackStartTime) / 1000;
		const cfg = getConfig();

		if (attackPhase === 'growing') {
			// Reveal attack blocks one by one
			const revealRate = 0.5;
			const revealed = Math.min(Math.floor(elapsed / revealRate), attackBlocks.length);

			for (let i = 0; i < revealed; i++) {
				const ab = attackBlocks[i];
				ab.alpha = Math.min(ab.alpha + 0.05, 1);
				const drawX = ab.x - viewOffsetX;
				const drawY = canvasHeight / 2 - ab.height / 2 + 130;

				// Red glow
				const glow = ctx.createRadialGradient(
					drawX + ab.width / 2, drawY + ab.height / 2, 0,
					drawX + ab.width / 2, drawY + ab.height / 2, ab.width
				);
				glow.addColorStop(0, `rgba(255, 30, 30, ${0.3 * ab.alpha})`);
				glow.addColorStop(1, `rgba(255, 30, 30, 0)`);
				ctx.fillStyle = glow;
				ctx.fillRect(drawX - 30, drawY - 30, ab.width + 60, ab.height + 60);

				// Block body
				ctx.fillStyle = `rgba(40, 10, 10, ${0.9 * ab.alpha})`;
				ctx.beginPath();
				ctx.roundRect(drawX, drawY, ab.width, ab.height, 4);
				ctx.fill();

				// Red border
				ctx.strokeStyle = `rgba(255, 50, 50, ${(0.6 + Math.sin(t * 4 + i) * 0.2) * ab.alpha})`;
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.roundRect(drawX, drawY, ab.width, ab.height, 4);
				ctx.stroke();

				// Block number
				ctx.fillStyle = `rgba(255, 80, 80, ${0.8 * ab.alpha})`;
				ctx.font = 'bold 10px "JetBrains Mono", monospace';
				ctx.textAlign = 'center';
				ctx.fillText(`#${ab.index}`, drawX + ab.width / 2, drawY + ab.height / 2 + 4);

				// Links between attack blocks
				if (i > 0) {
					const pab = attackBlocks[i - 1];
					const px = pab.x + pab.width - viewOffsetX;
					const cx = drawX;
					const ly = drawY + ab.height / 2;
					ctx.strokeStyle = `rgba(255, 50, 50, ${0.4 * Math.min(ab.alpha, pab.alpha)})`;
					ctx.lineWidth = 2;
					ctx.beginPath();
					ctx.moveTo(px, ly);
					ctx.lineTo(cx, ly);
					ctx.stroke();
				}
			}

			// "ATTACK" label
			if (revealed > 0) {
				const labelAlpha = 0.5 + Math.sin(t * 6) * 0.3;
				ctx.fillStyle = `rgba(255, 50, 50, ${labelAlpha})`;
				ctx.font = 'bold 14px "JetBrains Mono", monospace';
				ctx.textAlign = 'center';
				const labelX = attackBlocks[Math.floor(revealed / 2)]?.x ?? attackBlocks[0].x;
				ctx.fillText('51% ATTACK', labelX + 40 - viewOffsetX, canvasHeight / 2 + 130 - 50);
			}

			if (elapsed > 5) {
				attackPhase = 'overtaking';
			}
		} else if (attackPhase === 'overtaking') {
			// Flash effect
			const flashAlpha = Math.max(0, 0.3 - (elapsed - 5) * 0.1);
			if (flashAlpha > 0) {
				ctx.fillStyle = `rgba(255, 30, 30, ${flashAlpha})`;
				ctx.fillRect(0, 0, canvasWidth, canvasHeight);
			}

			// Draw attack blocks moving up
			for (const ab of attackBlocks) {
				const drawX = ab.x - viewOffsetX;
				const targetDrawY = canvasHeight / 2 - ab.height / 2;
				const currentDrawY = lerp(canvasHeight / 2 - ab.height / 2 + 130, targetDrawY, Math.min((elapsed - 5) * 0.5, 1));

				ctx.fillStyle = `rgba(40, 10, 10, ${0.9 * ab.alpha})`;
				ctx.beginPath();
				ctx.roundRect(drawX, currentDrawY, ab.width, ab.height, 4);
				ctx.fill();

				ctx.strokeStyle = `rgba(255, 50, 50, ${0.7 * ab.alpha})`;
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.roundRect(drawX, currentDrawY, ab.width, ab.height, 4);
				ctx.stroke();
			}

			// Victory text
			const victoryAlpha = Math.min((elapsed - 5.5) * 0.5, 1);
			if (victoryAlpha > 0) {
				ctx.fillStyle = `rgba(255, 50, 50, ${victoryAlpha * (0.5 + Math.sin(t * 8) * 0.3)})`;
				ctx.font = 'bold 24px "JetBrains Mono", monospace';
				ctx.textAlign = 'center';
				ctx.fillText('CHAIN REORGANIZED', canvasWidth / 2, canvasHeight / 2 - 80);

				ctx.fillStyle = `rgba(255, 255, 255, ${victoryAlpha * 0.4})`;
				ctx.font = '12px "JetBrains Mono", monospace';
				ctx.fillText('longest chain wins...', canvasWidth / 2, canvasHeight / 2 - 58);
			}

			if (elapsed > 8) {
				attackPhase = 'reset';
			}
		} else if (attackPhase === 'reset') {
			// Fade out and reset
			const fadeAlpha = Math.max(0, 1 - (elapsed - 8) * 0.5);
			if (fadeAlpha <= 0) {
				attackActive = false;
				attackBlocks = [];
				// Rebuild chain
				blocks = [];
				mempool = [];
				viewOffsetX = 0;
				targetViewOffsetX = 0;
				createGenesisBlock();
				lastBlockTime = Date.now();
			}
		}
	}

	function drawTooltip(ctx: CanvasRenderingContext2D) {
		if (!showTooltip || !hoveredBlock) return;

		const block = hoveredBlock;
		const x = hoverTooltipX;
		const y = hoverTooltipY;
		const cfg = getConfig();
		const padding = 12;
		const lineHeight = 16;
		const lines = [
			`Block #${block.index}`,
			`Hash: ${block.hash}`,
			`Prev: ${block.prevHash}`,
			`Time: ${new Date(block.timestamp).toLocaleTimeString()}`,
			`Nonce: ${block.nonce}`,
			`Transactions: ${block.transactions.length}`
		];

		// Add transaction details
		for (let i = 0; i < block.transactions.length && i < 4; i++) {
			const tx = block.transactions[i];
			lines.push(`  ${tx.from.slice(0, 6)}.. -> ${tx.to.slice(0, 6)}.. (${tx.amount.toFixed(2)})`);
		}

		const tooltipWidth = 260;
		const tooltipHeight = lines.length * lineHeight + padding * 2;

		// Position tooltip to avoid going off screen
		let tx = x + 15;
		let ty = y - tooltipHeight / 2;
		if (tx + tooltipWidth > canvasWidth) tx = x - tooltipWidth - 15;
		if (ty < 10) ty = 10;
		if (ty + tooltipHeight > canvasHeight - 10) ty = canvasHeight - tooltipHeight - 10;

		// Background
		ctx.fillStyle = 'rgba(5, 10, 20, 0.95)';
		ctx.beginPath();
		ctx.roundRect(tx, ty, tooltipWidth, tooltipHeight, 6);
		ctx.fill();

		// Border
		ctx.strokeStyle = hexToRgba(cfg.color, 0.6);
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.roundRect(tx, ty, tooltipWidth, tooltipHeight, 6);
		ctx.stroke();

		// Text
		ctx.textAlign = 'left';
		for (let i = 0; i < lines.length; i++) {
			if (i === 0) {
				ctx.fillStyle = hexToRgba(cfg.color, 0.9);
				ctx.font = 'bold 11px "JetBrains Mono", monospace';
			} else if (lines[i].startsWith('  ')) {
				ctx.fillStyle = hexToRgba(cfg.accentColor, 0.6);
				ctx.font = '9px "JetBrains Mono", monospace';
			} else {
				ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
				ctx.font = '9px "JetBrains Mono", monospace';
			}
			ctx.fillText(lines[i], tx + padding, ty + padding + 10 + i * lineHeight);
		}
	}

	// ─── Main Loop ──────────────────────────────────────────────────────
	function update(ctx: CanvasRenderingContext2D) {
		time += 0.016;
		const now = Date.now();
		const cfg = getConfig();

		// Auto-create blocks
		if (!attackActive && now - lastBlockTime >= cfg.blockTime) {
			createBlock();
		}

		// Auto-spawn random transactions
		if (mempool.length < 12 && Math.random() < 0.02) {
			const tx = createTransaction('', '', 0);
			mempool.push(tx);
			tx.splashTime = now;
			spawnSplash(tx.x, tx.y, tx.color);
		}

		// Smooth scroll
		viewOffsetX = lerp(viewOffsetX, targetViewOffsetX, 0.06);

		// Update splash particles
		for (const p of splashParticles) {
			p.x += p.vx;
			p.y += p.vy;
			p.vx *= 0.95;
			p.vy *= 0.95;
			p.alpha -= 0.025;
			p.size *= 0.98;
		}
		splashParticles = splashParticles.filter(p => p.alpha > 0.01);

		// Update scan beams
		for (const beam of scanBeams) {
			if (!beam.active) continue;
			beam.progress += 0.03;
			if (beam.progress >= 1) {
				beam.active = false;
				if (beam.targetTx) {
					beam.targetTx.scanProgress = 1;
				}
			}
		}
		scanBeams = scanBeams.filter(b => b.active);

		// Launch scan beams periodically
		if (now - lastScanTime > SCAN_BEAM_INTERVAL && mempool.length > 0) {
			const unscanned = mempool.filter(tx => tx.scanProgress === 0);
			if (unscanned.length > 0) {
				const target = unscanned[Math.floor(Math.random() * unscanned.length)];
				scanBeams.push({
					x: MEMPOOL_REGION.x + MEMPOOL_REGION.width / 2,
					y: MEMPOOL_REGION.y,
					targetTx: target,
					progress: 0,
					active: true
				});
				lastScanTime = now;
			}
		}

		// Update grid pulses
		for (const pulse of gridPulses) {
			pulse.radius += 3;
			pulse.alpha = Math.max(0, pulse.alpha - 0.004);
		}
		gridPulses = gridPulses.filter(p => p.alpha > 0.01);

		// ─── Draw ─────────────────────────────────────────────────
		ctx.clearRect(0, 0, canvasWidth, canvasHeight);

		// Background
		const bgGrad = ctx.createRadialGradient(
			canvasWidth / 2, canvasHeight / 2, 0,
			canvasWidth / 2, canvasHeight / 2, canvasWidth * 0.7
		);
		bgGrad.addColorStop(0, 'rgba(8, 14, 28, 1)');
		bgGrad.addColorStop(1, 'rgba(3, 6, 15, 1)');
		ctx.fillStyle = bgGrad;
		ctx.fillRect(0, 0, canvasWidth, canvasHeight);

		drawGrid(ctx, time);
		drawGridPulses(ctx);
		drawMempoolRegion(ctx, time);
		drawTransactions(ctx, time);
		drawSplashParticles(ctx);
		drawScanBeams(ctx, time);
		drawChainLinks(ctx, time);

		for (const block of blocks) {
			drawBlock(ctx, block, time);
		}

		drawAttack(ctx, time);
		drawTooltip(ctx);

		animFrame = requestAnimationFrame(() => update(ctx));
	}

	// ─── Mouse Interaction ──────────────────────────────────────────────
	function handleCanvasMouseMove(e: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;

		// Check block hover
		let found = false;
		for (const block of blocks) {
			const bx = block.x - viewOffsetX;
			const by = canvasHeight / 2 - block.height / 2;

			if (mx >= bx && mx <= bx + block.width && my >= by && my <= by + block.height) {
				hoveredBlock = block;
				hoverTooltipX = mx;
				hoverTooltipY = my;
				showTooltip = true;
				found = true;
				cursorState.set('hover');
				cursorLabel.set(`Block #${block.index}`);
				break;
			}
		}

		if (!found) {
			showTooltip = false;
			hoveredBlock = null;
			cursorState.set('default');
			cursorLabel.set('');
		}
	}

	function handleCanvasMouseLeave() {
		showTooltip = false;
		hoveredBlock = null;
		cursorState.set('default');
		cursorLabel.set('');
	}

	// ─── Easter egg: triple-click corner ────────────────────────────────
	let cornerClickTimer: ReturnType<typeof setTimeout>;
	function handleCornerClick() {
		attackClickCount++;
		clearTimeout(cornerClickTimer);
		cornerClickTimer = setTimeout(() => { attackClickCount = 0; }, 800);
		if (attackClickCount >= 3) {
			showAttackButton = true;
			attackClickCount = 0;
		}
	}

	// ─── Lifecycle ──────────────────────────────────────────────────────
	onMount(() => {
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				canvasWidth = entry.contentRect.width;
				canvasHeight = entry.contentRect.height;
				if (canvas) {
					canvas.width = canvasWidth;
					canvas.height = canvasHeight;
				}
			}
		});

		if (container) {
			resizeObserver.observe(container);
		}

		if (canvas) {
			canvas.width = canvasWidth;
			canvas.height = canvasHeight;
		}

		createGenesisBlock();
		lastBlockTime = Date.now();
		lastScanTime = Date.now();

		const ctx = canvas?.getContext('2d');
		if (ctx) {
			update(ctx);
		}

		return () => {
			resizeObserver.disconnect();
			if (animFrame) cancelAnimationFrame(animFrame);
		};
	});

	onDestroy(() => {
		if (animFrame) cancelAnimationFrame(animFrame);
		cursorState.set('default');
		cursorLabel.set('');
	});
</script>

<section class="chain-pulse" bind:this={container}>
	<canvas
		bind:this={canvas}
		class="chain-canvas"
		on:mousemove={handleCanvasMouseMove}
		on:mouseleave={handleCanvasMouseLeave}
	></canvas>

	<!-- Header Overlay -->
	<div class="header-overlay">
		<div class="title-group">
			<h2 class="scene-title">Chain Pulse</h2>
			<span class="scene-subtitle">Crypto & Blockchain</span>
		</div>
		<p class="scene-hint">create transactions &bull; switch networks &bull; adjust gas</p>
	</div>

	<!-- Network Switcher -->
	<div class="network-switcher">
		<span class="switcher-label">NETWORK</span>
		<div class="switcher-buttons">
			<button
				class="net-btn"
				class:active={network === 'bitcoin'}
				style="--net-color: #f7931a"
				on:click={() => switchNetwork('bitcoin')}
				on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set('Bitcoin'); }}
				on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
			>
				BTC
			</button>
			<button
				class="net-btn"
				class:active={network === 'ethereum'}
				style="--net-color: #627eea"
				on:click={() => switchNetwork('ethereum')}
				on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set('Ethereum'); }}
				on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
			>
				ETH
			</button>
			<button
				class="net-btn"
				class:active={network === 'solana'}
				style="--net-color: #9945ff"
				on:click={() => switchNetwork('solana')}
				on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set('Solana'); }}
				on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
			>
				SOL
			</button>
		</div>
	</div>

	<!-- Gas Visualizer -->
	<div class="gas-visualizer">
		<span class="gas-label">GAS PRICE</span>
		<input
			type="range"
			min="5"
			max="100"
			bind:value={gasPrice}
			class="gas-slider"
			on:mouseenter={() => { cursorState.set('drag'); cursorLabel.set('Gas'); }}
			on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
		/>
		<span class="gas-value">{gasPrice} gwei</span>
	</div>

	<!-- Transaction Form -->
	{#if formVisible}
		<div class="tx-form">
			<span class="form-title">CREATE TRANSACTION</span>
			<div class="form-fields">
				<input
					type="text"
					placeholder="from (0x...)"
					bind:value={txFrom}
					class="tx-input"
					on:mouseenter={() => { cursorState.set('text'); }}
					on:mouseleave={() => { cursorState.set('default'); }}
				/>
				<input
					type="text"
					placeholder="to (0x...)"
					bind:value={txTo}
					class="tx-input"
					on:mouseenter={() => { cursorState.set('text'); }}
					on:mouseleave={() => { cursorState.set('default'); }}
				/>
				<input
					type="text"
					placeholder="amount"
					bind:value={txAmount}
					class="tx-input tx-input-amount"
					on:mouseenter={() => { cursorState.set('text'); }}
					on:mouseleave={() => { cursorState.set('default'); }}
				/>
			</div>
			<button
				class="tx-submit"
				on:click={handleSubmitTransaction}
				on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set('Send'); }}
				on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
			>
				SEND TX
			</button>
		</div>
	{/if}

	<!-- Tags -->
	<div class="tags-row">
		{#each ['Web3.py', 'Ethereum', 'Smart Contracts', 'Blockchain', 'Solana', 'Cryptography'] as tag}
			<span class="tag">{tag}</span>
		{/each}
	</div>

	<!-- Stats Bar -->
	<div class="stats-bar">
		<span class="stat">Blocks: {blocks.length}</span>
		<span class="stat-sep">|</span>
		<span class="stat">Mempool: {mempool.length}</span>
		<span class="stat-sep">|</span>
		<span class="stat">Network: {NETWORKS[network].name}</span>
		<span class="stat-sep">|</span>
		<span class="stat">Block Time: {(NETWORKS[network].blockTime / 1000).toFixed(1)}s</span>
	</div>

	<!-- Easter Egg Corner (hidden trigger) -->
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<div
		class="easter-egg-corner"
		on:click={handleCornerClick}
		role="button"
		tabindex="-1"
		aria-hidden="true"
	></div>

	<!-- Attack Button (revealed after easter egg) -->
	{#if showAttackButton && !attackActive}
		<button
			class="attack-btn"
			on:click={triggerAttack}
			on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set('51% Attack'); }}
			on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
		>
			51% ATTACK
		</button>
	{/if}
</section>

<style>
	.chain-pulse {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: var(--bg-primary, #050a14);
		font-family: var(--font-sans, 'Inter', sans-serif);
	}

	.chain-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 0;
	}

	/* ─── Header ─────────────────────────────────────────────────── */
	.header-overlay {
		position: absolute;
		top: 16px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		text-align: center;
		pointer-events: none;
	}

	.title-group {
		display: flex;
		align-items: baseline;
		gap: 12px;
		justify-content: center;
	}

	.scene-title {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 20px;
		font-weight: 700;
		color: var(--text-primary, #e8ecf4);
		letter-spacing: 0.08em;
		margin: 0;
		text-shadow: 0 0 20px rgba(0, 255, 136, 0.15);
	}

	.scene-subtitle {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 11px;
		color: var(--text-muted, #4a5568);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.scene-hint {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		color: var(--text-muted, #4a5568);
		margin-top: 4px;
		letter-spacing: 0.06em;
		opacity: 0.7;
	}

	/* ─── Network Switcher ───────────────────────────────────────── */
	.network-switcher {
		position: absolute;
		top: 16px;
		right: 16px;
		z-index: 10;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 6px;
	}

	.switcher-label {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 9px;
		color: var(--text-muted, #4a5568);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	.switcher-buttons {
		display: flex;
		gap: 4px;
	}

	.net-btn {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		padding: 5px 10px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.03);
		color: var(--text-secondary, #a0aec0);
		cursor: pointer;
		transition: all 0.25s ease;
		letter-spacing: 0.05em;
	}

	.net-btn:hover {
		background: rgba(255, 255, 255, 0.06);
		border-color: var(--net-color, rgba(255, 255, 255, 0.2));
		color: var(--text-primary, #e8ecf4);
	}

	.net-btn.active {
		background: rgba(255, 255, 255, 0.08);
		border-color: var(--net-color, var(--aurora-green, #00ff88));
		color: var(--text-primary, #e8ecf4);
		box-shadow: 0 0 12px rgba(0, 255, 136, 0.1), inset 0 0 8px rgba(0, 255, 136, 0.05);
	}

	/* ─── Gas Visualizer ─────────────────────────────────────────── */
	.gas-visualizer {
		position: absolute;
		top: 80px;
		right: 16px;
		z-index: 10;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}

	.gas-label {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 9px;
		color: var(--text-muted, #4a5568);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	.gas-slider {
		width: 120px;
		height: 4px;
		-webkit-appearance: none;
		appearance: none;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 2px;
		outline: none;
		cursor: pointer;
	}

	.gas-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--aurora-green, #00ff88);
		box-shadow: 0 0 8px rgba(0, 255, 136, 0.4);
		cursor: pointer;
		transition: box-shadow 0.2s;
	}

	.gas-slider::-webkit-slider-thumb:hover {
		box-shadow: 0 0 16px rgba(0, 255, 136, 0.6);
	}

	.gas-slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--aurora-green, #00ff88);
		box-shadow: 0 0 8px rgba(0, 255, 136, 0.4);
		cursor: pointer;
		border: none;
	}

	.gas-value {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		color: var(--aurora-green, #00ff88);
		opacity: 0.8;
	}

	/* ─── Transaction Form ───────────────────────────────────────── */
	.tx-form {
		position: absolute;
		bottom: 60px;
		right: 16px;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 6px;
		background: rgba(5, 10, 20, 0.8);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		padding: 12px;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		min-width: 180px;
	}

	.form-title {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 9px;
		color: var(--text-muted, #4a5568);
		letter-spacing: 0.15em;
		text-transform: uppercase;
		margin-bottom: 2px;
	}

	.form-fields {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.tx-input {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		padding: 5px 8px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.03);
		color: var(--text-primary, #e8ecf4);
		outline: none;
		transition: border-color 0.2s;
		width: 100%;
		box-sizing: border-box;
	}

	.tx-input::placeholder {
		color: var(--text-muted, #4a5568);
		opacity: 0.6;
	}

	.tx-input:focus {
		border-color: var(--aurora-green, #00ff88);
		box-shadow: 0 0 8px rgba(0, 255, 136, 0.1);
	}

	.tx-input-amount {
		width: 80px;
	}

	.tx-submit {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		padding: 6px 12px;
		border: 1px solid var(--aurora-green, #00ff88);
		border-radius: 4px;
		background: rgba(0, 255, 136, 0.08);
		color: var(--aurora-green, #00ff88);
		cursor: pointer;
		transition: all 0.25s ease;
		letter-spacing: 0.1em;
		margin-top: 2px;
	}

	.tx-submit:hover {
		background: rgba(0, 255, 136, 0.15);
		box-shadow: 0 0 16px rgba(0, 255, 136, 0.2);
	}

	.tx-submit:active {
		transform: scale(0.97);
	}

	/* ─── Tags ───────────────────────────────────────────────────── */
	.tags-row {
		position: absolute;
		bottom: 36px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
		pointer-events: none;
	}

	.tag {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 9px;
		color: var(--text-muted, #4a5568);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 3px;
		padding: 2px 7px;
		letter-spacing: 0.04em;
	}

	/* ─── Stats Bar ──────────────────────────────────────────────── */
	.stats-bar {
		position: absolute;
		bottom: 10px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		display: flex;
		gap: 8px;
		align-items: center;
		pointer-events: none;
	}

	.stat {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 9px;
		color: var(--text-muted, #4a5568);
		letter-spacing: 0.04em;
	}

	.stat-sep {
		color: var(--text-muted, #4a5568);
		opacity: 0.3;
		font-size: 9px;
	}

	/* ─── Easter Egg ─────────────────────────────────────────────── */
	.easter-egg-corner {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 30px;
		height: 30px;
		z-index: 20;
		cursor: default;
	}

	.attack-btn {
		position: absolute;
		bottom: 70px;
		left: 16px;
		z-index: 20;
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 9px;
		padding: 5px 10px;
		border: 1px solid rgba(255, 50, 50, 0.4);
		border-radius: 4px;
		background: rgba(255, 30, 30, 0.08);
		color: rgba(255, 80, 80, 0.8);
		cursor: pointer;
		letter-spacing: 0.1em;
		transition: all 0.25s ease;
		animation: attack-pulse 2s ease-in-out infinite;
	}

	.attack-btn:hover {
		background: rgba(255, 30, 30, 0.15);
		border-color: rgba(255, 50, 50, 0.6);
		box-shadow: 0 0 20px rgba(255, 30, 30, 0.2);
		color: rgba(255, 100, 100, 1);
	}

	@keyframes attack-pulse {
		0%, 100% { opacity: 0.6; }
		50% { opacity: 1; }
	}
</style>
