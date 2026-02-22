<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { cursorState, cursorLabel } from '$lib/stores/cursor';
	import { playClick, playPing, playTick } from '$lib/utils/audio';

	/* ---------- types ---------- */
	interface Particle {
		x: number;
		y: number;
		vx: number;
		vy: number;
		radius: number;
		color: string;
		shape: 'circle' | 'square' | 'triangle' | 'diamond';
		alpha: number;
		valid: boolean;
		stage: number; // 0=source, 1=validate, 2=transform, 3=normalize, 4=index, 5=stored
		symbol: string;
		targetX: number;
		targetY: number;
		deflecting: boolean;
		deflectX: number;
		storeCol: number;
		storeRow: number;
		indexed: boolean;
		highlighted: boolean;
		highlightAlpha: number;
		jumpOffset: number;
		originalColor: string;
		normalizedRadius: number;
	}

	interface LatticeCell {
		x: number;
		y: number;
		col: number;
		row: number;
		particle: Particle | null;
		glow: number;
		targetGlow: number;
	}

	interface BTreeNode {
		x: number;
		y: number;
		label: string;
		children: BTreeNode[];
		alpha: number;
		targetAlpha: number;
	}

	/* ---------- constants ---------- */
	const COLORS = {
		green: '#00ff88',
		cyan: '#00d4ff',
		purple: '#b44aff',
		pink: '#ff44aa',
		red: '#ff4444',
		yellow: '#ffcc00',
		orange: '#ff8844',
		white: '#ffffff',
	};

	const CHAOTIC_COLORS = [COLORS.green, COLORS.cyan, COLORS.purple, COLORS.pink, COLORS.red, COLORS.yellow, COLORS.orange, COLORS.white];
	const SYMBOLS = ['{ }', '0x', 'NaN', '##', '???', 'nil', '<>', '...', '404', 'ERR', 'raw', 'blob', '\\0', '~~~', '$$$', 'buf', 'EOF'];
	const SHAPES: Particle['shape'][] = ['circle', 'square', 'triangle', 'diamond'];

	const TAGS = ['PostgreSQL', 'Redis', 'MongoDB', 'SQLAlchemy', 'ETL', 'Indexing'];

	/* ---------- state ---------- */
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	let animFrame: number;
	let W = 0;
	let H = 0;

	let particles: Particle[] = [];
	let lattice: LatticeCell[][] = [];
	let bTreeRoot: BTreeNode | null = null;
	let bTreeVisible = false;

	let sqlInput = '';
	let queryRunning = false;
	let queryBeamY = 0;
	let queryFilter: { field: string; value: string } | null = null;
	let queryResults: Particle[] = [];
	let querySpeed = 1;
	let indexCreated = false;

	let dragCol: number | null = null;
	let dragOverCol: number | null = null;
	let isDragging = false;
	let recrystallizing = false;
	let recrystallizeProgress = 0;

	let spawnTimer = 0;
	let time = 0;

	/* ---------- layout zones (recomputed on resize) ---------- */
	let sourceY = 0;
	let validateY = 0;
	let transformY = 0;
	let normalizeY = 0;
	let indexY = 0;
	let databaseY = 0;
	let latticeStartX = 0;
	let latticeCols = 8;
	let latticeRows = 5;
	let cellW = 0;
	let cellH = 0;
	let pipeX = 0;
	let pipeW = 0;

	const stageLabels = [
		{ icon: '\u2713', name: 'VALIDATE', color: '#00ff88' },
		{ icon: '\u21C4', name: 'TRANSFORM', color: '#00d4ff' },
		{ icon: '\u2261', name: 'NORMALIZE', color: '#b44aff' },
		{ icon: '\u2630', name: 'INDEX', color: '#ff44aa' },
	];

	/* ---------- lifecycle ---------- */
	onMount(() => {
		ctx = canvas.getContext('2d')!;
		handleResize();
		initLattice();
		window.addEventListener('resize', handleResize);
		animFrame = requestAnimationFrame(loop);
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('resize', handleResize);
			cancelAnimationFrame(animFrame);
		}
	});

	/* ---------- resize ---------- */
	function handleResize() {
		const rect = canvas.parentElement!.getBoundingClientRect();
		W = rect.width;
		H = rect.height;
		canvas.width = W * devicePixelRatio;
		canvas.height = H * devicePixelRatio;
		canvas.style.width = W + 'px';
		canvas.style.height = H + 'px';
		ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

		pipeX = W * 0.5;
		pipeW = Math.min(W * 0.4, 320);

		sourceY = H * 0.04;
		validateY = H * 0.17;
		transformY = H * 0.28;
		normalizeY = H * 0.39;
		indexY = H * 0.50;
		databaseY = H * 0.60;

		cellW = Math.min(36, (pipeW - 20) / latticeCols);
		cellH = cellW;
		latticeStartX = pipeX - (latticeCols * cellW) / 2;

		initLattice();
	}

	/* ---------- lattice init ---------- */
	function initLattice() {
		lattice = [];
		for (let r = 0; r < latticeRows; r++) {
			const row: LatticeCell[] = [];
			for (let c = 0; c < latticeCols; c++) {
				row.push({
					x: latticeStartX + c * cellW + cellW / 2,
					y: databaseY + r * cellH + cellH / 2,
					col: c,
					row: r,
					particle: null,
					glow: 0,
					targetGlow: 0,
				});
			}
			lattice.push(row);
		}
	}

	/* ---------- particle spawning ---------- */
	function spawnParticle() {
		const valid = Math.random() > 0.25;
		const color = CHAOTIC_COLORS[Math.floor(Math.random() * CHAOTIC_COLORS.length)];
		const p: Particle = {
			x: pipeX + (Math.random() - 0.5) * pipeW * 0.6,
			y: sourceY - 10,
			vx: (Math.random() - 0.5) * 2,
			vy: 0.6 + Math.random() * 0.8,
			radius: 3 + Math.random() * 5,
			color: color,
			originalColor: color,
			shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
			alpha: 0.9,
			valid,
			stage: 0,
			symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
			targetX: 0,
			targetY: 0,
			deflecting: false,
			deflectX: 0,
			storeCol: -1,
			storeRow: -1,
			indexed: false,
			highlighted: false,
			highlightAlpha: 0,
			jumpOffset: 0,
			normalizedRadius: 4,
		};
		particles.push(p);
	}

	/* ---------- find open lattice cell ---------- */
	function findOpenCell(): { col: number; row: number } | null {
		for (let r = 0; r < latticeRows; r++) {
			for (let c = 0; c < latticeCols; c++) {
				if (!lattice[r][c].particle) return { col: c, row: r };
			}
		}
		return null;
	}

	/* ---------- update particle through pipeline stages ---------- */
	function updateParticle(p: Particle, dt: number) {
		// deflecting particles just fade out
		if (p.deflecting) {
			p.x += p.deflectX * dt * 60;
			p.y += p.vy * dt * 60 * 0.3;
			p.alpha -= 0.015 * dt * 60;
			return;
		}

		// stage progression by Y position
		if (p.stage === 0 && p.y >= validateY) {
			p.stage = 1;
			if (!p.valid) {
				p.deflecting = true;
				p.deflectX = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 2);
				p.color = COLORS.red;
				return;
			}
			p.color = COLORS.green;
		}

		if (p.stage === 1 && p.y >= transformY) {
			p.stage = 2;
			// transform: change shape and color
			p.shape = 'square';
			p.color = COLORS.cyan;
		}

		if (p.stage === 2 && p.y >= normalizeY) {
			p.stage = 3;
			// normalize: same size
			p.radius = p.normalizedRadius;
			p.color = COLORS.purple;
		}

		if (p.stage === 3 && p.y >= indexY) {
			p.stage = 4;
			// try to assign to lattice
			const cell = findOpenCell();
			if (cell) {
				p.storeCol = cell.col;
				p.storeRow = cell.row;
				p.targetX = lattice[cell.row][cell.col].x;
				p.targetY = lattice[cell.row][cell.col].y;
				p.indexed = true;
			} else {
				p.stage = 5;
				p.alpha = 0; // lattice full, remove
			}
		}

		if (p.stage === 4) {
			// guide towards lattice position
			const dx = p.targetX - p.x;
			const dy = p.targetY - p.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < 2) {
				p.x = p.targetX;
				p.y = p.targetY;
				p.stage = 5;
				p.vx = 0;
				p.vy = 0;
				p.color = COLORS.cyan;
				p.alpha = 0.95;
				p.shape = 'square';
				// store in lattice
				if (p.storeRow >= 0 && p.storeCol >= 0 && lattice[p.storeRow] && lattice[p.storeRow][p.storeCol]) {
					lattice[p.storeRow][p.storeCol].particle = p;
					lattice[p.storeRow][p.storeCol].targetGlow = 1;
				}
				return;
			}
			p.vx += dx * 0.04;
			p.vy += dy * 0.04;
			p.vx *= 0.92;
			p.vy *= 0.92;
		}

		if (p.stage < 4) {
			// small chaotic movement in source zone
			if (p.stage === 0) {
				p.vx += (Math.random() - 0.5) * 0.3;
			}
			// clamp to pipe
			const halfPipe = pipeW * 0.3;
			if (p.x < pipeX - halfPipe) p.vx += 0.1;
			if (p.x > pipeX + halfPipe) p.vx -= 0.1;
			p.vx *= 0.96;
		}

		p.x += p.vx * dt * 60;
		p.y += p.vy * dt * 60;
	}

	/* ---------- draw helpers ---------- */
	function drawParticleShape(p: Particle) {
		ctx.globalAlpha = p.alpha;
		ctx.fillStyle = p.highlighted ? '#ffffff' : p.color;

		if (p.highlighted) {
			ctx.shadowColor = p.originalColor;
			ctx.shadowBlur = 12;
		}

		const r = p.radius;
		const jy = p.jumpOffset;

		ctx.save();
		ctx.translate(p.x, p.y + jy);

		switch (p.shape) {
			case 'circle':
				ctx.beginPath();
				ctx.arc(0, 0, r, 0, Math.PI * 2);
				ctx.fill();
				break;
			case 'square':
				ctx.fillRect(-r, -r, r * 2, r * 2);
				break;
			case 'triangle':
				ctx.beginPath();
				ctx.moveTo(0, -r);
				ctx.lineTo(r, r);
				ctx.lineTo(-r, r);
				ctx.closePath();
				ctx.fill();
				break;
			case 'diamond':
				ctx.beginPath();
				ctx.moveTo(0, -r);
				ctx.lineTo(r, 0);
				ctx.lineTo(0, r);
				ctx.lineTo(-r, 0);
				ctx.closePath();
				ctx.fill();
				break;
		}

		ctx.restore();
		ctx.shadowBlur = 0;
		ctx.globalAlpha = 1;
	}

	function drawSymbol(p: Particle) {
		if (p.stage > 0 || p.radius < 5) return;
		ctx.globalAlpha = p.alpha * 0.7;
		ctx.fillStyle = '#000000';
		ctx.font = `bold ${Math.max(6, p.radius * 0.8)}px var(--font-mono, monospace)`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(p.symbol, p.x, p.y);
		ctx.globalAlpha = 1;
	}

	/* ---------- draw pipe outline ---------- */
	function drawPipe() {
		const half = pipeW * 0.35;

		// pipe walls
		ctx.strokeStyle = 'rgba(0, 212, 255, 0.12)';
		ctx.lineWidth = 1.5;
		ctx.setLineDash([6, 4]);
		ctx.beginPath();
		ctx.moveTo(pipeX - half, sourceY);
		ctx.lineTo(pipeX - half, databaseY - 10);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(pipeX + half, sourceY);
		ctx.lineTo(pipeX + half, databaseY - 10);
		ctx.stroke();
		ctx.setLineDash([]);

		// Source label
		ctx.fillStyle = 'rgba(0, 212, 255, 0.5)';
		ctx.font = `bold 11px var(--font-mono, monospace)`;
		ctx.textAlign = 'center';
		ctx.fillText('RAW DATA SOURCE', pipeX, sourceY - 2);

		// source pipe opening — glow
		const grad = ctx.createRadialGradient(pipeX, sourceY + 10, 0, pipeX, sourceY + 10, half);
		grad.addColorStop(0, 'rgba(0, 212, 255, 0.08)');
		grad.addColorStop(1, 'rgba(0, 212, 255, 0)');
		ctx.fillStyle = grad;
		ctx.fillRect(pipeX - half, sourceY, half * 2, 30);
	}

	/* ---------- draw filter bands ---------- */
	function drawFilterBands() {
		const bands = [
			{ y: validateY, label: stageLabels[0], left: COLORS.red, right: COLORS.green },
			{ y: transformY, label: stageLabels[1], left: COLORS.cyan, right: COLORS.cyan },
			{ y: normalizeY, label: stageLabels[2], left: COLORS.purple, right: COLORS.purple },
			{ y: indexY, label: stageLabels[3], left: COLORS.pink, right: COLORS.pink },
		];

		const half = pipeW * 0.45;
		const bandH = 18;

		for (const band of bands) {
			// band background
			const grad = ctx.createLinearGradient(pipeX - half, 0, pipeX + half, 0);
			grad.addColorStop(0, hexToRgba(band.left, 0.06));
			grad.addColorStop(0.5, hexToRgba(band.label.color, 0.12));
			grad.addColorStop(1, hexToRgba(band.right, 0.06));

			ctx.fillStyle = grad;
			ctx.fillRect(pipeX - half, band.y - bandH / 2, half * 2, bandH);

			// band border
			ctx.strokeStyle = hexToRgba(band.label.color, 0.35);
			ctx.lineWidth = 1;
			ctx.strokeRect(pipeX - half, band.y - bandH / 2, half * 2, bandH);

			// icon + label
			ctx.fillStyle = band.label.color;
			ctx.font = `bold 12px var(--font-mono, monospace)`;
			ctx.textAlign = 'left';
			ctx.fillText(`${band.label.icon} ${band.label.name}`, pipeX - half + 6, band.y + 4);

			// pulsing dots along band
			const pulseAlpha = 0.3 + Math.sin(time * 3 + bands.indexOf(band)) * 0.2;
			ctx.fillStyle = hexToRgba(band.label.color, pulseAlpha);
			for (let i = 0; i < 5; i++) {
				const dotX = pipeX + half - 10 - i * 12;
				ctx.beginPath();
				ctx.arc(dotX, band.y, 2, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}

	/* ---------- draw lattice / database ---------- */
	function drawLattice() {
		// database background
		const dbW = latticeCols * cellW + 20;
		const dbH = latticeRows * cellH + 20;
		const dbX = latticeStartX - 10;
		const dbY = databaseY - 10;

		const grad = ctx.createLinearGradient(dbX, dbY, dbX, dbY + dbH);
		grad.addColorStop(0, 'rgba(0, 212, 255, 0.04)');
		grad.addColorStop(1, 'rgba(180, 74, 255, 0.04)');
		ctx.fillStyle = grad;

		// rounded rect background
		roundRect(ctx, dbX, dbY, dbW, dbH, 6);
		ctx.fill();

		// border
		ctx.strokeStyle = 'rgba(0, 212, 255, 0.2)';
		ctx.lineWidth = 1;
		roundRect(ctx, dbX, dbY, dbW, dbH, 6);
		ctx.stroke();

		// label
		ctx.fillStyle = 'rgba(0, 212, 255, 0.4)';
		ctx.font = `bold 10px var(--font-mono, monospace)`;
		ctx.textAlign = 'center';
		ctx.fillText('DATABASE', pipeX, dbY - 3);

		// column headers (draggable)
		const colNames = ['id', 'name', 'type', 'val', 'ts', 'src', 'idx', 'ref'];
		for (let c = 0; c < latticeCols; c++) {
			const hx = latticeStartX + c * cellW + cellW / 2;
			const hy = databaseY - 2;
			const isOverCol = dragOverCol === c;
			const isDragCol = dragCol === c;

			ctx.fillStyle = isDragCol ? COLORS.cyan : isOverCol ? 'rgba(0, 212, 255, 0.7)' : 'rgba(0, 212, 255, 0.35)';
			ctx.font = `bold 8px var(--font-mono, monospace)`;
			ctx.textAlign = 'center';
			ctx.fillText(colNames[c % colNames.length], hx, hy);
		}

		// cells
		for (let r = 0; r < latticeRows; r++) {
			for (let c = 0; c < latticeCols; c++) {
				const cell = lattice[r][c];

				// glow animation
				cell.glow += (cell.targetGlow - cell.glow) * 0.05;
				if (cell.targetGlow > 0) cell.targetGlow *= 0.995;

				// cell outline
				ctx.strokeStyle = hexToRgba(COLORS.cyan, 0.08 + cell.glow * 0.15);
				ctx.lineWidth = 0.5;
				ctx.strokeRect(cell.x - cellW / 2 + 1, cell.y - cellH / 2 + 1, cellW - 2, cellH - 2);

				// glow effect
				if (cell.glow > 0.1) {
					ctx.fillStyle = hexToRgba(COLORS.cyan, cell.glow * 0.08);
					ctx.fillRect(cell.x - cellW / 2 + 1, cell.y - cellH / 2 + 1, cellW - 2, cellH - 2);
				}

				// stored particle
				if (cell.particle) {
					drawParticleShape(cell.particle);
				}
			}
		}
	}

	/* ---------- draw B-tree ---------- */
	function buildBTree(): BTreeNode {
		const root: BTreeNode = {
			x: pipeX,
			y: databaseY + latticeRows * cellH + 30,
			label: 'root',
			alpha: 0,
			targetAlpha: 1,
			children: [],
		};

		const childCount = 3;
		const spread = Math.min(pipeW * 0.7, 200);
		for (let i = 0; i < childCount; i++) {
			const child: BTreeNode = {
				x: root.x - spread / 2 + (spread / (childCount - 1)) * i,
				y: root.y + 30,
				label: String.fromCharCode(65 + i),
				alpha: 0,
				targetAlpha: 1,
				children: [],
			};
			// leaf nodes
			for (let j = 0; j < 2; j++) {
				child.children.push({
					x: child.x + (j === 0 ? -18 : 18),
					y: child.y + 25,
					label: `${String.fromCharCode(65 + i)}${j}`,
					alpha: 0,
					targetAlpha: 1,
					children: [],
				});
			}
			root.children.push(child);
		}
		return root;
	}

	function drawBTreeNode(node: BTreeNode) {
		node.alpha += (node.targetAlpha - node.alpha) * 0.04;
		if (node.alpha < 0.01) return;

		ctx.globalAlpha = node.alpha;

		// lines to children
		for (const child of node.children) {
			ctx.strokeStyle = hexToRgba(COLORS.pink, 0.4);
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(node.x, node.y + 6);
			ctx.lineTo(child.x, child.y - 6);
			ctx.stroke();
			drawBTreeNode(child);
		}

		// node circle
		ctx.fillStyle = hexToRgba(COLORS.pink, 0.15);
		ctx.strokeStyle = hexToRgba(COLORS.pink, 0.5);
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();

		// label
		ctx.fillStyle = COLORS.pink;
		ctx.font = `bold 7px var(--font-mono, monospace)`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(node.label, node.x, node.y);

		ctx.globalAlpha = 1;
	}

	/* ---------- draw query beam ---------- */
	function drawQueryBeam() {
		if (!queryRunning) return;

		const dbStartY = databaseY - 10;
		const dbEndY = databaseY + latticeRows * cellH + 10;
		const dbW = latticeCols * cellW + 20;
		const dbX = latticeStartX - 10;

		// scanning beam line
		const beamWorldY = dbStartY + (queryBeamY / 100) * (dbEndY - dbStartY);

		ctx.strokeStyle = hexToRgba(COLORS.green, 0.8);
		ctx.lineWidth = 2;
		ctx.shadowColor = COLORS.green;
		ctx.shadowBlur = 10;
		ctx.beginPath();
		ctx.moveTo(dbX, beamWorldY);
		ctx.lineTo(dbX + dbW, beamWorldY);
		ctx.stroke();
		ctx.shadowBlur = 0;

		// sweep glow
		const glowGrad = ctx.createLinearGradient(0, beamWorldY - 15, 0, beamWorldY + 5);
		glowGrad.addColorStop(0, 'rgba(0, 255, 136, 0)');
		glowGrad.addColorStop(0.5, 'rgba(0, 255, 136, 0.06)');
		glowGrad.addColorStop(1, 'rgba(0, 255, 136, 0)');
		ctx.fillStyle = glowGrad;
		ctx.fillRect(dbX, beamWorldY - 15, dbW, 20);
	}

	/* ---------- query execution ---------- */
	function executeQuery(sql: string) {
		if (queryRunning) return;

		const normalized = sql.trim().toUpperCase();
		if (!normalized.startsWith('SELECT')) {
			playTick();
			return;
		}

		playPing();
		queryRunning = true;
		queryBeamY = 0;
		queryResults = [];
		querySpeed = indexCreated ? 3 : 1;

		// parse simple WHERE clause
		const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*'?(\w+)'?/i);
		if (whereMatch) {
			queryFilter = { field: whereMatch[1].toLowerCase(), value: whereMatch[2].toLowerCase() };
		} else {
			queryFilter = { field: '*', value: '*' };
		}

		// clear previous highlights
		for (const row of lattice) {
			for (const cell of row) {
				if (cell.particle) {
					cell.particle.highlighted = false;
					cell.particle.highlightAlpha = 0;
					cell.particle.jumpOffset = 0;
				}
			}
		}
	}

	function killQuery() {
		queryRunning = false;
		queryBeamY = 0;
		queryFilter = null;
		queryResults = [];
		playClick();

		// un-highlight all
		for (const row of lattice) {
			for (const cell of row) {
				if (cell.particle) {
					cell.particle.highlighted = false;
					cell.particle.jumpOffset = 0;
				}
			}
		}
	}

	function updateQuery(dt: number) {
		if (!queryRunning) return;

		queryBeamY += dt * 60 * querySpeed * 0.8;

		// check which row the beam is at
		const dbStartY = databaseY - 10;
		const dbEndY = databaseY + latticeRows * cellH + 10;
		const beamWorldY = dbStartY + (queryBeamY / 100) * (dbEndY - dbStartY);

		for (const row of lattice) {
			for (const cell of row) {
				if (!cell.particle) continue;
				if (Math.abs(cell.y - beamWorldY) < cellH / 2) {
					// beam is touching this row
					if (matchesQuery(cell.particle)) {
						cell.particle.highlighted = true;
						cell.particle.highlightAlpha = 1;
						cell.particle.jumpOffset = -8;
						cell.targetGlow = 1;
						if (!queryResults.includes(cell.particle)) {
							queryResults.push(cell.particle);
							playTick();
						}
					}
				}
			}
		}

		// animate jump offset recovery
		for (const row of lattice) {
			for (const cell of row) {
				if (cell.particle && cell.particle.jumpOffset < 0) {
					cell.particle.jumpOffset += 0.15 * dt * 60;
					if (cell.particle.jumpOffset > 0) cell.particle.jumpOffset = 0;
				}
			}
		}

		if (queryBeamY >= 100) {
			queryRunning = false;
		}
	}

	function matchesQuery(p: Particle): boolean {
		if (!queryFilter) return false;
		if (queryFilter.field === '*') return true;

		if (queryFilter.field === 'color') {
			return p.originalColor.toLowerCase().includes(queryFilter.value) ||
				(queryFilter.value === 'green' && p.originalColor === COLORS.green) ||
				(queryFilter.value === 'cyan' && p.originalColor === COLORS.cyan) ||
				(queryFilter.value === 'purple' && p.originalColor === COLORS.purple) ||
				(queryFilter.value === 'pink' && p.originalColor === COLORS.pink) ||
				(queryFilter.value === 'red' && p.originalColor === COLORS.red) ||
				(queryFilter.value === 'yellow' && p.originalColor === COLORS.yellow) ||
				(queryFilter.value === 'orange' && p.originalColor === COLORS.orange) ||
				(queryFilter.value === 'white' && p.originalColor === COLORS.white);
		}

		if (queryFilter.field === 'shape') {
			return p.shape === queryFilter.value;
		}

		if (queryFilter.field === 'valid') {
			return String(p.valid) === queryFilter.value;
		}

		// default: match all for unrecognized fields
		return true;
	}

	/* ---------- create index ---------- */
	function createIndex() {
		if (indexCreated) return;
		indexCreated = true;
		bTreeVisible = true;
		bTreeRoot = buildBTree();
		playPing();
	}

	/* ---------- column drag-and-drop ---------- */
	function handleDragStart(col: number) {
		dragCol = col;
		isDragging = true;
		cursorState.set('drag');
		cursorLabel.set('restructure');
		playClick();
	}

	function handleDragOver(col: number) {
		if (!isDragging || dragCol === null) return;
		dragOverCol = col;
	}

	function handleDragEnd(col: number) {
		if (dragCol === null || dragCol === col) {
			isDragging = false;
			dragCol = null;
			dragOverCol = null;
			cursorState.set('default');
			cursorLabel.set('');
			return;
		}

		// swap columns
		for (let r = 0; r < latticeRows; r++) {
			const temp = lattice[r][dragCol].particle;
			lattice[r][dragCol].particle = lattice[r][col].particle;
			lattice[r][col].particle = temp;

			// update particle positions
			if (lattice[r][dragCol].particle) {
				lattice[r][dragCol].particle!.targetX = lattice[r][dragCol].x;
				lattice[r][dragCol].particle!.targetY = lattice[r][dragCol].y;
				lattice[r][dragCol].particle!.x = lattice[r][dragCol].x;
				lattice[r][dragCol].particle!.y = lattice[r][dragCol].y;
			}
			if (lattice[r][col].particle) {
				lattice[r][col].particle!.targetX = lattice[r][col].x;
				lattice[r][col].particle!.targetY = lattice[r][col].y;
				lattice[r][col].particle!.x = lattice[r][col].x;
				lattice[r][col].particle!.y = lattice[r][col].y;
			}

			// trigger glow
			lattice[r][dragCol].targetGlow = 1;
			lattice[r][col].targetGlow = 1;
		}

		// recrystallize animation
		recrystallizing = true;
		recrystallizeProgress = 0;

		isDragging = false;
		dragCol = null;
		dragOverCol = null;
		cursorState.set('default');
		cursorLabel.set('');
		playPing();
	}

	/* ---------- recrystallize animation ---------- */
	function updateRecrystallize(dt: number) {
		if (!recrystallizing) return;
		recrystallizeProgress += dt * 2;
		if (recrystallizeProgress >= 1) {
			recrystallizing = false;
			recrystallizeProgress = 0;
		}
	}

	/* ---------- main loop ---------- */
	let lastTime = 0;

	function loop(timestamp: number) {
		const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0.016;
		lastTime = timestamp;
		time += dt;

		ctx.clearRect(0, 0, W, H);

		// spawn particles
		spawnTimer += dt;
		if (spawnTimer > 0.12) {
			spawnTimer = 0;
			if (particles.length < 200) {
				spawnParticle();
			}
		}

		// update particles
		for (const p of particles) {
			if (p.stage < 5) {
				updateParticle(p, dt);
			}
		}

		// prune dead particles
		particles = particles.filter(p => p.alpha > 0.01 && p.y < H + 50 && p.x > -100 && p.x < W + 100);

		// update query
		updateQuery(dt);

		// update recrystallize
		updateRecrystallize(dt);

		// --- DRAW ---

		// ambient background particles (subtle)
		drawAmbientParticles();

		// pipe structure
		drawPipe();

		// filter bands
		drawFilterBands();

		// flowing particles
		for (const p of particles) {
			if (p.stage < 5) {
				drawParticleShape(p);
				drawSymbol(p);
			}
		}

		// lattice / database
		drawLattice();

		// recrystallize flash
		if (recrystallizing) {
			const flash = Math.sin(recrystallizeProgress * Math.PI);
			ctx.fillStyle = hexToRgba(COLORS.cyan, flash * 0.05);
			const dbW = latticeCols * cellW + 20;
			ctx.fillRect(latticeStartX - 10, databaseY - 10, dbW, latticeRows * cellH + 20);
		}

		// query beam
		drawQueryBeam();

		// B-tree
		if (bTreeVisible && bTreeRoot) {
			drawBTreeNode(bTreeRoot);
		}

		animFrame = requestAnimationFrame(loop);
	}

	/* ---------- ambient background particles ---------- */
	let ambientParticles: { x: number; y: number; vx: number; vy: number; r: number; color: string; alpha: number }[] = [];

	function initAmbient() {
		for (let i = 0; i < 30; i++) {
			ambientParticles.push({
				x: Math.random() * (W || 800),
				y: Math.random() * (H || 600),
				vx: (Math.random() - 0.5) * 0.3,
				vy: (Math.random() - 0.5) * 0.3,
				r: 1 + Math.random() * 2,
				color: CHAOTIC_COLORS[Math.floor(Math.random() * CHAOTIC_COLORS.length)],
				alpha: 0.05 + Math.random() * 0.1,
			});
		}
	}

	function drawAmbientParticles() {
		if (ambientParticles.length === 0) initAmbient();
		for (const ap of ambientParticles) {
			ap.x += ap.vx;
			ap.y += ap.vy;
			if (ap.x < 0) ap.x = W;
			if (ap.x > W) ap.x = 0;
			if (ap.y < 0) ap.y = H;
			if (ap.y > H) ap.y = 0;

			ctx.globalAlpha = ap.alpha;
			ctx.fillStyle = ap.color;
			ctx.beginPath();
			ctx.arc(ap.x, ap.y, ap.r, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}

	/* ---------- utility ---------- */
	function hexToRgba(hex: string, alpha: number): string {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
		c.beginPath();
		c.moveTo(x + radius, y);
		c.lineTo(x + w - radius, y);
		c.quadraticCurveTo(x + w, y, x + w, y + radius);
		c.lineTo(x + w, y + h - radius);
		c.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
		c.lineTo(x + radius, y + h);
		c.quadraticCurveTo(x, y + h, x, y + h - radius);
		c.lineTo(x, y + radius);
		c.quadraticCurveTo(x, y, x + radius, y);
		c.closePath();
	}

	/* ---------- SQL input handling ---------- */
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			executeQuery(sqlInput);
		}
	}

	function handleInputFocus() {
		cursorState.set('text');
		cursorLabel.set('query');
	}

	function handleInputBlur() {
		cursorState.set('default');
		cursorLabel.set('');
	}
</script>

<section class="dataflow-scene" aria-label="Data Flow visualization">
	<div class="scene-canvas-wrap">
		<canvas bind:this={canvas} class="scene-canvas"></canvas>
	</div>

	<!-- Header overlay -->
	<div class="scene-header">
		<h2 class="scene-title">Data Flow</h2>
		<p class="scene-subtitle">Databases & Pipelines</p>
	</div>

	<!-- Hint text -->
	<div class="scene-hint">
		enter SQL queries below &bull; create indexes &bull; drag to restructure
	</div>

	<!-- Column drag handles (overlaid on canvas) -->
	<div class="column-handles" style="left: {latticeStartX}px; top: {databaseY - 14}px;">
		{#each Array(latticeCols) as _, c}
			<button
				class="col-handle"
				class:dragging={dragCol === c}
				class:drag-over={dragOverCol === c}
				style="width: {cellW}px; height: {cellH + 14}px;"
				draggable="true"
				on:dragstart={() => handleDragStart(c)}
				on:dragover|preventDefault={() => handleDragOver(c)}
				on:drop|preventDefault={() => handleDragEnd(c)}
				on:dragend={() => { isDragging = false; dragCol = null; dragOverCol = null; cursorState.set('default'); cursorLabel.set(''); }}
				on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set('drag column'); }}
				on:mouseleave={() => { if (!isDragging) { cursorState.set('default'); cursorLabel.set(''); } }}
				aria-label="Drag column {c} to restructure"
			></button>
		{/each}
	</div>

	<!-- Query results badge -->
	{#if queryResults.length > 0}
		<div class="query-results-badge" class:running={queryRunning}>
			<span class="results-count">{queryResults.length}</span>
			<span class="results-label">{queryRunning ? 'scanning...' : 'rows matched'}</span>
			{#if indexCreated}
				<span class="index-badge">IDX</span>
			{/if}
		</div>
	{/if}

	<!-- SQL Console -->
	<div class="sql-console">
		<div class="console-top-bar">
			<span class="console-prompt">SQL&gt;</span>
			<input
				class="sql-input"
				type="text"
				bind:value={sqlInput}
				on:keydown={handleKeydown}
				on:focus={handleInputFocus}
				on:blur={handleInputBlur}
				placeholder="SELECT * WHERE color = 'green'"
				spellcheck="false"
				autocomplete="off"
			/>
			<button
				class="console-btn run-btn"
				on:click={() => executeQuery(sqlInput)}
				on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set('run'); }}
				on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
				disabled={queryRunning}
				aria-label="Run query"
			>
				RUN
			</button>
			{#if queryRunning}
				<button
					class="console-btn kill-btn"
					on:click={killQuery}
					on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set('kill'); }}
					on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
					aria-label="Kill query"
				>
					KILL
				</button>
			{/if}
			<button
				class="console-btn index-btn"
				class:active={indexCreated}
				on:click={createIndex}
				on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set('index'); }}
				on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
				disabled={indexCreated}
				aria-label="Create index"
			>
				{indexCreated ? 'INDEXED' : 'CREATE INDEX'}
			</button>
		</div>
	</div>

	<!-- Tags -->
	<div class="scene-tags">
		{#each TAGS as tag, i}
			{#if i > 0}
				<span class="tag-dot">&middot;</span>
			{/if}
			<span class="tag">{tag}</span>
		{/each}
	</div>
</section>

<style>
	.dataflow-scene {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		overflow: hidden;
		user-select: none;
	}

	.scene-canvas-wrap {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.scene-canvas {
		width: 100%;
		height: 100%;
		display: block;
	}

	/* -- header -- */
	.scene-header {
		position: relative;
		z-index: 2;
		text-align: center;
		pointer-events: none;
		padding-top: clamp(8px, 2vh, 16px);
	}

	.scene-title {
		font-family: var(--font-sans, 'Inter', sans-serif);
		font-size: clamp(22px, 3.5vw, 36px);
		font-weight: 800;
		letter-spacing: 0.04em;
		color: var(--text-primary, #ffffff);
		margin: 0;
		line-height: 1.1;
		text-shadow: 0 0 40px rgba(0, 212, 255, 0.15);
	}

	.scene-subtitle {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: clamp(10px, 1.4vw, 13px);
		color: var(--text-muted, #888888);
		letter-spacing: 0.15em;
		text-transform: uppercase;
		margin: 4px 0 0 0;
	}

	/* -- hint -- */
	.scene-hint {
		position: absolute;
		bottom: 100px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 2;
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		color: var(--text-muted, #888888);
		letter-spacing: 0.08em;
		opacity: 0.6;
		pointer-events: none;
		white-space: nowrap;
	}

	/* -- column drag handles -- */
	.column-handles {
		position: absolute;
		z-index: 3;
		display: flex;
		flex-direction: row;
	}

	.col-handle {
		background: transparent;
		border: 1px solid transparent;
		cursor: grab;
		transition: border-color 0.2s, background 0.2s;
		padding: 0;
		border-radius: 2px;
	}

	.col-handle:hover {
		border-color: rgba(0, 212, 255, 0.25);
		background: rgba(0, 212, 255, 0.03);
	}

	.col-handle.dragging {
		border-color: var(--aurora-cyan, #00d4ff);
		background: rgba(0, 212, 255, 0.08);
		cursor: grabbing;
	}

	.col-handle.drag-over {
		border-color: var(--aurora-green, #00ff88);
		background: rgba(0, 255, 136, 0.06);
	}

	/* -- query results badge -- */
	.query-results-badge {
		position: absolute;
		right: 16px;
		top: 50%;
		transform: translateY(-50%);
		z-index: 3;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		background: rgba(0, 255, 136, 0.06);
		border: 1px solid rgba(0, 255, 136, 0.2);
		border-radius: 4px;
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
	}

	.query-results-badge.running {
		border-color: rgba(0, 212, 255, 0.3);
		animation: badgePulse 0.8s ease-in-out infinite;
	}

	.results-count {
		font-size: 18px;
		font-weight: 700;
		color: var(--aurora-green, #00ff88);
	}

	.results-label {
		font-size: 10px;
		color: var(--text-muted, #888888);
		letter-spacing: 0.05em;
	}

	.index-badge {
		font-size: 8px;
		font-weight: 700;
		color: var(--aurora-pink, #ff44aa);
		background: rgba(255, 68, 170, 0.1);
		border: 1px solid rgba(255, 68, 170, 0.3);
		border-radius: 2px;
		padding: 1px 4px;
		letter-spacing: 0.08em;
	}

	@keyframes badgePulse {
		0%, 100% { opacity: 0.8; }
		50% { opacity: 1; }
	}

	/* -- SQL console -- */
	.sql-console {
		position: absolute;
		bottom: 40px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 4;
		width: min(90%, 600px);
	}

	.console-top-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--bg-secondary, rgba(20, 20, 30, 0.9));
		border: 1px solid rgba(0, 212, 255, 0.15);
		border-radius: 6px;
		padding: 4px 8px;
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}

	.console-prompt {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 12px;
		font-weight: 700;
		color: var(--aurora-cyan, #00d4ff);
		flex-shrink: 0;
		letter-spacing: 0.05em;
	}

	.sql-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 12px;
		color: var(--text-primary, #ffffff);
		padding: 6px 4px;
		letter-spacing: 0.02em;
		caret-color: var(--aurora-green, #00ff88);
	}

	.sql-input::placeholder {
		color: var(--text-muted, #888888);
		opacity: 0.5;
	}

	.console-btn {
		flex-shrink: 0;
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		border: 1px solid;
		border-radius: 3px;
		padding: 4px 10px;
		cursor: pointer;
		transition: all 0.2s ease;
		background: transparent;
	}

	.run-btn {
		color: var(--aurora-green, #00ff88);
		border-color: rgba(0, 255, 136, 0.3);
	}

	.run-btn:hover:not(:disabled) {
		background: rgba(0, 255, 136, 0.1);
		border-color: rgba(0, 255, 136, 0.5);
	}

	.run-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.kill-btn {
		color: var(--aurora-pink, #ff44aa);
		border-color: rgba(255, 68, 170, 0.3);
		animation: killPulse 0.6s ease-in-out infinite;
	}

	.kill-btn:hover {
		background: rgba(255, 68, 170, 0.15);
		border-color: rgba(255, 68, 170, 0.6);
	}

	@keyframes killPulse {
		0%, 100% { opacity: 0.7; }
		50% { opacity: 1; }
	}

	.index-btn {
		color: var(--aurora-purple, #b44aff);
		border-color: rgba(180, 74, 255, 0.3);
	}

	.index-btn:hover:not(:disabled) {
		background: rgba(180, 74, 255, 0.1);
		border-color: rgba(180, 74, 255, 0.5);
	}

	.index-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.index-btn.active {
		color: var(--aurora-pink, #ff44aa);
		border-color: rgba(255, 68, 170, 0.4);
		background: rgba(255, 68, 170, 0.08);
	}

	/* -- tags -- */
	.scene-tags {
		position: absolute;
		bottom: 14px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
	}

	.tag {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: clamp(9px, 1.1vw, 11px);
		color: var(--text-muted, #888888);
		letter-spacing: 0.05em;
		opacity: 0.7;
	}

	.tag-dot {
		color: var(--text-muted, #888888);
		opacity: 0.3;
		font-size: 10px;
	}
</style>
