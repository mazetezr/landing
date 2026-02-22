<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { cursorState, cursorLabel } from '$lib/stores/cursor';
	import { playClick, playPing, playError, playBlip } from '$lib/utils/audio';
	import { lerp, distance } from '$lib/utils/math';

	// ─── Types ───────────────────────────────────────────────────────────
	interface ServiceNode {
		id: string;
		label: string;
		icon: string;
		x: number;
		y: number;
		targetX: number;
		targetY: number;
		vx: number;
		vy: number;
		radius: number;
		color: string;
		glowColor: string;
		endpoints: string[];
		middleware: string[];
		protocol: string;
		broken: boolean;
		pulsePhase: number;
		hovered: boolean;
		dragging: boolean;
	}

	interface Connection {
		from: string;
		to: string;
		strength: number;
	}

	interface DataPacket {
		id: number;
		fromId: string;
		toId: string;
		progress: number;
		speed: number;
		color: string;
		payload: Record<string, unknown>;
		size: number;
		hovered: boolean;
	}

	interface PipelineStage {
		label: string;
		nodeId: string;
		color: string;
	}

	interface RequestAnimation {
		active: boolean;
		stageIndex: number;
		progress: number;
		color: string;
		stages: PipelineStage[];
		packet: { x: number; y: number };
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

	interface RetryArrow {
		nodeId: string;
		angle: number;
		progress: number;
		active: boolean;
	}

	// ─── Configuration ───────────────────────────────────────────────────
	const ISOMETRIC_SKEW = 0.15;
	const NODE_RADIUS = 42;
	const HEX_SIDES = 6;
	const PACKET_INTERVAL_MIN = 2000;
	const PACKET_INTERVAL_MAX = 5000;

	const SERVICE_DEFS = [
		{
			id: 'telegram', label: 'Telegram', icon: 'TG',
			color: '#0088cc', glowColor: '#0088cc',
			endpoints: ['POST /webhook', 'GET /updates'],
			middleware: ['Rate Limiter', 'Signature Verify'],
			protocol: 'WebSocket'
		},
		{
			id: 'stripe', label: 'Stripe', icon: 'ST',
			color: '#635bff', glowColor: '#635bff',
			endpoints: ['POST /charges', 'POST /refunds'],
			middleware: ['Webhook Verify', 'Idempotency'],
			protocol: 'REST'
		},
		{
			id: 'openai', label: 'OpenAI', icon: 'AI',
			color: '#00ff88', glowColor: '#00ff88',
			endpoints: ['POST /completions', 'POST /embeddings'],
			middleware: ['Token Counter', 'Retry Queue'],
			protocol: 'REST'
		},
		{
			id: 'github', label: 'GitHub', icon: 'GH',
			color: '#f0f0f0', glowColor: '#c9d1d9',
			endpoints: ['GET /repos', 'POST /hooks'],
			middleware: ['OAuth Guard', 'Cache Layer'],
			protocol: 'GraphQL'
		},
		{
			id: 'aws-s3', label: 'AWS S3', icon: 'S3',
			color: '#ff9900', glowColor: '#ff9900',
			endpoints: ['PUT /objects', 'GET /objects'],
			middleware: ['Presign URL', 'Size Validator'],
			protocol: 'REST'
		},
		{
			id: 'postgres', label: 'PostgreSQL', icon: 'PG',
			color: '#336791', glowColor: '#5b9bd5',
			endpoints: ['Query Pool', 'Migrations'],
			middleware: ['Connection Pool', 'Query Logger'],
			protocol: 'TCP'
		},
		{
			id: 'redis', label: 'Redis', icon: 'RD',
			color: '#dc382d', glowColor: '#ff6b6b',
			endpoints: ['GET/SET', 'PUB/SUB'],
			middleware: ['Serializer', 'TTL Manager'],
			protocol: 'TCP'
		},
		{
			id: 'twilio', label: 'Twilio', icon: 'TW',
			color: '#f22f46', glowColor: '#f22f46',
			endpoints: ['POST /messages', 'POST /calls'],
			middleware: ['Auth Token', 'Callback Queue'],
			protocol: 'REST'
		}
	];

	const CONNECTIONS: Connection[] = [
		{ from: 'telegram', to: 'openai', strength: 0.9 },
		{ from: 'telegram', to: 'redis', strength: 0.7 },
		{ from: 'stripe', to: 'postgres', strength: 0.95 },
		{ from: 'stripe', to: 'twilio', strength: 0.5 },
		{ from: 'openai', to: 'redis', strength: 0.8 },
		{ from: 'openai', to: 'postgres', strength: 0.6 },
		{ from: 'github', to: 'aws-s3', strength: 0.7 },
		{ from: 'github', to: 'postgres', strength: 0.5 },
		{ from: 'aws-s3', to: 'postgres', strength: 0.6 },
		{ from: 'redis', to: 'postgres', strength: 0.85 },
		{ from: 'twilio', to: 'redis', strength: 0.4 },
		{ from: 'telegram', to: 'stripe', strength: 0.3 },
	];

	const PIPELINE_STAGES: PipelineStage[] = [
		{ label: 'User Input', nodeId: 'telegram', color: '#00d4ff' },
		{ label: 'Auth Gateway', nodeId: 'github', color: '#b44aff' },
		{ label: 'API Endpoint', nodeId: 'openai', color: '#00ff88' },
		{ label: 'Transform', nodeId: 'redis', color: '#ff9900' },
		{ label: 'Database', nodeId: 'postgres', color: '#5b9bd5' },
		{ label: 'Response', nodeId: 'telegram', color: '#00ff88' },
	];

	const SAMPLE_PAYLOADS: Record<string, unknown>[] = [
		{ type: 'message', text: 'Hello bot!', user_id: 42 },
		{ action: 'charge', amount: 29.99, currency: 'USD' },
		{ model: 'gpt-4', tokens: 150, stream: true },
		{ repo: 'api-nexus', event: 'push', ref: 'main' },
		{ bucket: 'uploads', key: 'img/photo.jpg', size: '2.4MB' },
		{ query: 'SELECT * FROM users', rows: 128 },
		{ command: 'SET', key: 'session:abc', ttl: 3600 },
		{ to: '+1234567890', body: 'Your code: 4829' },
	];

	const TAGS = ['REST', 'WebSocket', 'GraphQL', 'OAuth', 'Rate Limiting', 'Retry Logic'];

	// ─── State ───────────────────────────────────────────────────────────
	let canvas: HTMLCanvasElement;
	let container: HTMLDivElement;
	let animFrame: number;
	let mounted = false;
	let canvasWidth = 900;
	let canvasHeight = 600;

	let nodes: ServiceNode[] = [];
	let packets: DataPacket[] = [];
	let sparks: Spark[] = [];
	let retryArrows: RetryArrow[] = [];
	let packetIdCounter = 0;
	let nextPacketTime = 0;

	let selectedNode: ServiceNode | null = null;
	let hoveredPacket: DataPacket | null = null;
	let dragNode: ServiceNode | null = null;
	let dragOffsetX = 0;
	let dragOffsetY = 0;

	let requestAnim: RequestAnimation = {
		active: false,
		stageIndex: 0,
		progress: 0,
		color: '#00d4ff',
		stages: PIPELINE_STAGES,
		packet: { x: 0, y: 0 }
	};

	let breakMode = false;
	let brokenNodeId: string | null = null;
	let errorLogLines: string[] = [];
	let fallbackRoute: { from: string; to: string } | null = null;

	let time = 0;
	let mouseX = 0;
	let mouseY = 0;

	// ─── Helpers ─────────────────────────────────────────────────────────
	function toIso(x: number, y: number): { x: number; y: number } {
		return {
			x: x + y * ISOMETRIC_SKEW * 0.5,
			y: y + x * ISOMETRIC_SKEW
		};
	}

	function fromIso(sx: number, sy: number): { x: number; y: number } {
		const denom = 1 - ISOMETRIC_SKEW * ISOMETRIC_SKEW * 0.5;
		const x = (sx - sy * ISOMETRIC_SKEW * 0.5) / denom;
		const y = (sy - sx * ISOMETRIC_SKEW) / denom;
		return { x, y };
	}

	function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
		ctx.beginPath();
		for (let i = 0; i < HEX_SIDES; i++) {
			const angle = (Math.PI / 3) * i - Math.PI / 6;
			const hx = cx + r * Math.cos(angle);
			const hy = cy + r * Math.sin(angle);
			if (i === 0) ctx.moveTo(hx, hy);
			else ctx.lineTo(hx, hy);
		}
		ctx.closePath();
	}

	function getNodeById(id: string): ServiceNode | undefined {
		return nodes.find(n => n.id === id);
	}

	function getNodeScreenPos(node: ServiceNode): { x: number; y: number } {
		return toIso(node.x, node.y);
	}

	function initNodes() {
		const cx = canvasWidth / 2;
		const cy = canvasHeight / 2;
		const ringRadius = Math.min(canvasWidth, canvasHeight) * 0.3;

		nodes = SERVICE_DEFS.map((def, i) => {
			const angle = (Math.PI * 2 * i) / SERVICE_DEFS.length - Math.PI / 2;
			const jitterX = (Math.random() - 0.5) * 30;
			const jitterY = (Math.random() - 0.5) * 30;
			const nx = cx + Math.cos(angle) * ringRadius + jitterX;
			const ny = cy + Math.sin(angle) * ringRadius + jitterY;
			return {
				...def,
				x: nx,
				y: ny,
				targetX: nx,
				targetY: ny,
				vx: 0,
				vy: 0,
				radius: NODE_RADIUS,
				broken: false,
				pulsePhase: Math.random() * Math.PI * 2,
				hovered: false,
				dragging: false
			};
		});
	}

	function spawnPacket() {
		const conn = CONNECTIONS[Math.floor(Math.random() * CONNECTIONS.length)];
		const fromNode = getNodeById(conn.from);
		const toNode = getNodeById(conn.to);
		if (!fromNode || !toNode) return;
		if (fromNode.broken || toNode.broken) return;

		const payload = SAMPLE_PAYLOADS[Math.floor(Math.random() * SAMPLE_PAYLOADS.length)];
		packets.push({
			id: packetIdCounter++,
			fromId: conn.from,
			toId: conn.to,
			progress: 0,
			speed: 0.003 + Math.random() * 0.004,
			color: fromNode.glowColor,
			payload,
			size: 4 + Math.random() * 3,
			hovered: false
		});
	}

	function spawnSpark(x: number, y: number, color: string, count: number = 8) {
		for (let i = 0; i < count; i++) {
			const angle = Math.random() * Math.PI * 2;
			const speed = 1 + Math.random() * 3;
			sparks.push({
				x,
				y,
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed,
				life: 1.0,
				maxLife: 0.5 + Math.random() * 0.5,
				color
			});
		}
	}

	// ─── Drawing ─────────────────────────────────────────────────────────
	function drawConnection(ctx: CanvasRenderingContext2D, fromNode: ServiceNode, toNode: ServiceNode, conn: Connection) {
		const fp = getNodeScreenPos(fromNode);
		const tp = getNodeScreenPos(toNode);
		const isBrokenPath = fromNode.broken || toNode.broken;
		const isFallback = fallbackRoute && (
			(fallbackRoute.from === fromNode.id && fallbackRoute.to === toNode.id) ||
			(fallbackRoute.from === toNode.id && fallbackRoute.to === fromNode.id)
		);

		ctx.save();

		if (isBrokenPath) {
			ctx.strokeStyle = 'rgba(255, 60, 60, 0.3)';
			ctx.setLineDash([6, 8]);
		} else if (isFallback) {
			ctx.strokeStyle = '#ff990088';
			ctx.setLineDash([4, 4]);
			ctx.shadowColor = '#ff9900';
			ctx.shadowBlur = 8;
		} else {
			const glow = 0.15 + Math.sin(time * 2 + conn.strength * 5) * 0.08;
			ctx.strokeStyle = `rgba(0, 212, 255, ${glow * conn.strength})`;
			ctx.shadowColor = '#00d4ff';
			ctx.shadowBlur = 6;
		}

		ctx.lineWidth = isFallback ? 2.5 : 1.5;
		ctx.beginPath();

		const mx = (fp.x + tp.x) / 2;
		const my = (fp.y + tp.y) / 2 - 20 * conn.strength;
		ctx.moveTo(fp.x, fp.y);
		ctx.quadraticCurveTo(mx, my, tp.x, tp.y);
		ctx.stroke();
		ctx.restore();
	}

	function drawNode(ctx: CanvasRenderingContext2D, node: ServiceNode) {
		const pos = getNodeScreenPos(node);
		const pulse = Math.sin(time * 3 + node.pulsePhase) * 0.08;
		const r = node.radius * (1 + pulse);
		const isSelected = selectedNode?.id === node.id;
		const isHighlighted = requestAnim.active &&
			requestAnim.stages[requestAnim.stageIndex]?.nodeId === node.id;

		ctx.save();

		// Outer glow
		if (node.broken) {
			ctx.shadowColor = '#ff3333';
			ctx.shadowBlur = 20 + Math.sin(time * 8) * 10;
		} else if (isHighlighted) {
			ctx.shadowColor = requestAnim.color;
			ctx.shadowBlur = 30;
		} else if (node.hovered || isSelected) {
			ctx.shadowColor = node.glowColor;
			ctx.shadowBlur = 20;
		} else {
			ctx.shadowColor = node.glowColor;
			ctx.shadowBlur = 8;
		}

		// Hex background
		hexPath(ctx, pos.x, pos.y, r);
		const bgGrad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r);
		if (node.broken) {
			bgGrad.addColorStop(0, 'rgba(120, 20, 20, 0.95)');
			bgGrad.addColorStop(1, 'rgba(60, 10, 10, 0.9)');
		} else if (isHighlighted) {
			bgGrad.addColorStop(0, 'rgba(30, 40, 60, 0.98)');
			bgGrad.addColorStop(1, 'rgba(15, 20, 35, 0.95)');
		} else {
			bgGrad.addColorStop(0, 'rgba(20, 25, 40, 0.95)');
			bgGrad.addColorStop(1, 'rgba(10, 12, 25, 0.9)');
		}
		ctx.fillStyle = bgGrad;
		ctx.fill();

		// Hex border
		hexPath(ctx, pos.x, pos.y, r);
		if (node.broken) {
			ctx.strokeStyle = `rgba(255, 50, 50, ${0.8 + Math.sin(time * 6) * 0.2})`;
			ctx.lineWidth = 2.5;
		} else if (isHighlighted) {
			ctx.strokeStyle = requestAnim.color;
			ctx.lineWidth = 3;
		} else if (isSelected) {
			ctx.strokeStyle = node.glowColor;
			ctx.lineWidth = 2.5;
		} else if (node.hovered) {
			ctx.strokeStyle = node.color;
			ctx.lineWidth = 2;
		} else {
			ctx.strokeStyle = `${node.color}66`;
			ctx.lineWidth = 1.5;
		}
		ctx.stroke();

		ctx.shadowBlur = 0;

		// Icon text
		ctx.fillStyle = node.broken ? '#ff6666' : node.color;
		ctx.font = `bold 16px var(--font-mono, 'JetBrains Mono', monospace)`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(node.icon, pos.x, pos.y - 6);

		// Label
		ctx.fillStyle = node.broken ? '#ff9999' : 'rgba(255, 255, 255, 0.7)';
		ctx.font = `10px var(--font-sans, 'Inter', sans-serif)`;
		ctx.fillText(node.label, pos.x, pos.y + 14);

		// Broken indicator
		if (node.broken) {
			ctx.fillStyle = '#ff3333';
			ctx.font = `bold 10px var(--font-mono, monospace)`;
			ctx.fillText('ERROR', pos.x, pos.y + 28);
		}

		// Protocol badge
		if (node.hovered || isSelected) {
			const badgeY = pos.y - r - 10;
			ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
			const proto = node.protocol;
			const tw = ctx.measureText(proto).width + 10;
			ctx.beginPath();
			ctx.roundRect(pos.x - tw / 2, badgeY - 8, tw, 16, 4);
			ctx.fill();
			ctx.fillStyle = node.glowColor;
			ctx.font = `9px var(--font-mono, monospace)`;
			ctx.fillText(proto, pos.x, badgeY);
		}

		ctx.restore();
	}

	function drawPacket(ctx: CanvasRenderingContext2D, pkt: DataPacket) {
		const fromNode = getNodeById(pkt.fromId);
		const toNode = getNodeById(pkt.toId);
		if (!fromNode || !toNode) return;

		const fp = getNodeScreenPos(fromNode);
		const tp = getNodeScreenPos(toNode);
		const conn = CONNECTIONS.find(c =>
			(c.from === pkt.fromId && c.to === pkt.toId) ||
			(c.from === pkt.toId && c.to === pkt.fromId)
		);
		const strength = conn?.strength ?? 0.5;
		const mx = (fp.x + tp.x) / 2;
		const my = (fp.y + tp.y) / 2 - 20 * strength;

		const t = pkt.progress;
		const it = 1 - t;
		const px = it * it * fp.x + 2 * it * t * mx + t * t * tp.x;
		const py = it * it * fp.y + 2 * it * t * my + t * t * tp.y;

		ctx.save();
		ctx.shadowColor = pkt.color;
		ctx.shadowBlur = pkt.hovered ? 16 : 10;

		// Cube shape for packets
		const s = pkt.size * (pkt.hovered ? 1.5 : 1);
		ctx.fillStyle = pkt.color;
		ctx.globalAlpha = 0.9;

		// Draw as a diamond/rhombus for isometric feel
		ctx.beginPath();
		ctx.moveTo(px, py - s);
		ctx.lineTo(px + s, py);
		ctx.lineTo(px, py + s);
		ctx.lineTo(px - s, py);
		ctx.closePath();
		ctx.fill();

		// Inner highlight
		ctx.fillStyle = 'rgba(255,255,255,0.4)';
		ctx.beginPath();
		ctx.moveTo(px, py - s * 0.5);
		ctx.lineTo(px + s * 0.5, py);
		ctx.lineTo(px, py + s * 0.5);
		ctx.lineTo(px - s * 0.5, py);
		ctx.closePath();
		ctx.fill();

		ctx.restore();

		// Store screen position for hover detection
		(pkt as any)._screenX = px;
		(pkt as any)._screenY = py;
	}

	function drawSparks(ctx: CanvasRenderingContext2D) {
		for (const spark of sparks) {
			ctx.save();
			ctx.globalAlpha = spark.life;
			ctx.fillStyle = spark.color;
			ctx.shadowColor = spark.color;
			ctx.shadowBlur = 6;
			ctx.fillRect(spark.x - 1.5, spark.y - 1.5, 3, 3);
			ctx.restore();
		}
	}

	function drawRetryArrows(ctx: CanvasRenderingContext2D) {
		for (const arrow of retryArrows) {
			if (!arrow.active) continue;
			const node = getNodeById(arrow.nodeId);
			if (!node) continue;
			const pos = getNodeScreenPos(node);
			const arrowR = node.radius + 15;

			ctx.save();
			ctx.translate(pos.x, pos.y);
			ctx.rotate(arrow.angle + arrow.progress * Math.PI * 2);
			ctx.strokeStyle = `rgba(255, 153, 0, ${0.6 + Math.sin(arrow.progress * 10) * 0.3})`;
			ctx.lineWidth = 2;
			ctx.shadowColor = '#ff9900';
			ctx.shadowBlur = 4;

			// Arc
			ctx.beginPath();
			ctx.arc(0, 0, arrowR, -0.3, Math.PI * 0.8);
			ctx.stroke();

			// Arrowhead
			const tipAngle = Math.PI * 0.8;
			const tx = Math.cos(tipAngle) * arrowR;
			const ty = Math.sin(tipAngle) * arrowR;
			ctx.beginPath();
			ctx.moveTo(tx, ty);
			ctx.lineTo(tx - 6, ty - 8);
			ctx.moveTo(tx, ty);
			ctx.lineTo(tx + 8, ty - 4);
			ctx.stroke();

			ctx.restore();
		}
	}

	function drawRequestPacket(ctx: CanvasRenderingContext2D) {
		if (!requestAnim.active) return;

		const pos = requestAnim.packet;
		const s = 8;
		const col = requestAnim.color;

		ctx.save();
		ctx.shadowColor = col;
		ctx.shadowBlur = 20;
		ctx.fillStyle = col;

		// Larger diamond for the request packet
		ctx.beginPath();
		ctx.moveTo(pos.x, pos.y - s);
		ctx.lineTo(pos.x + s, pos.y);
		ctx.lineTo(pos.x, pos.y + s);
		ctx.lineTo(pos.x - s, pos.y);
		ctx.closePath();
		ctx.fill();

		// White core
		ctx.fillStyle = 'rgba(255,255,255,0.6)';
		ctx.beginPath();
		ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
		ctx.fill();

		// Trail
		ctx.globalAlpha = 0.3;
		ctx.fillStyle = col;
		for (let i = 1; i <= 5; i++) {
			const trailS = s * (1 - i * 0.15);
			ctx.globalAlpha = 0.3 - i * 0.05;
			ctx.beginPath();
			ctx.arc(pos.x - i * 3, pos.y, trailS * 0.4, 0, Math.PI * 2);
			ctx.fill();
		}

		ctx.restore();
	}

	function drawPipelineHUD(ctx: CanvasRenderingContext2D) {
		if (!requestAnim.active) return;

		const hudX = 20;
		const hudY = canvasHeight - 30;
		const stageW = 100;
		const stageH = 20;
		const gap = 8;

		ctx.save();
		ctx.font = `10px var(--font-mono, monospace)`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';

		for (let i = 0; i < requestAnim.stages.length; i++) {
			const stage = requestAnim.stages[i];
			const sx = hudX + i * (stageW + gap);
			const sy = hudY;
			const isCurrent = i === requestAnim.stageIndex;
			const isDone = i < requestAnim.stageIndex;

			// Background
			ctx.fillStyle = isCurrent
				? `${stage.color}33`
				: isDone
					? `${stage.color}22`
					: 'rgba(255,255,255,0.05)';
			ctx.beginPath();
			ctx.roundRect(sx, sy, stageW, stageH, 4);
			ctx.fill();

			// Border
			ctx.strokeStyle = isCurrent ? stage.color : isDone ? `${stage.color}88` : 'rgba(255,255,255,0.1)';
			ctx.lineWidth = isCurrent ? 2 : 1;
			if (isCurrent) {
				ctx.shadowColor = stage.color;
				ctx.shadowBlur = 8;
			} else {
				ctx.shadowBlur = 0;
			}
			ctx.beginPath();
			ctx.roundRect(sx, sy, stageW, stageH, 4);
			ctx.stroke();
			ctx.shadowBlur = 0;

			// Label
			ctx.fillStyle = isCurrent ? stage.color : isDone ? `${stage.color}cc` : 'rgba(255,255,255,0.3)';
			ctx.fillText(stage.label, sx + stageW / 2, sy + stageH / 2);

			// Arrow between stages
			if (i < requestAnim.stages.length - 1) {
				ctx.fillStyle = 'rgba(255,255,255,0.2)';
				const ax = sx + stageW + gap / 2;
				const ay = sy + stageH / 2;
				ctx.beginPath();
				ctx.moveTo(ax - 3, ay - 3);
				ctx.lineTo(ax + 3, ay);
				ctx.lineTo(ax - 3, ay + 3);
				ctx.fill();
			}
		}

		ctx.restore();
	}

	function drawGrid(ctx: CanvasRenderingContext2D) {
		ctx.save();
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
		ctx.lineWidth = 1;
		const gridSize = 40;

		for (let x = 0; x < canvasWidth; x += gridSize) {
			const start = toIso(x, 0);
			const end = toIso(x, canvasHeight);
			ctx.beginPath();
			ctx.moveTo(start.x, start.y);
			ctx.lineTo(end.x, end.y);
			ctx.stroke();
		}
		for (let y = 0; y < canvasHeight; y += gridSize) {
			const start = toIso(0, y);
			const end = toIso(canvasWidth, y);
			ctx.beginPath();
			ctx.moveTo(start.x, start.y);
			ctx.lineTo(end.x, end.y);
			ctx.stroke();
		}
		ctx.restore();
	}

	// ─── Update loop ─────────────────────────────────────────────────────
	function update(dt: number, now: number) {
		time += dt * 0.001;

		// Spawn packets periodically
		if (now > nextPacketTime) {
			spawnPacket();
			nextPacketTime = now + PACKET_INTERVAL_MIN + Math.random() * (PACKET_INTERVAL_MAX - PACKET_INTERVAL_MIN);
		}

		// Update packets
		for (let i = packets.length - 1; i >= 0; i--) {
			const pkt = packets[i];
			pkt.progress += pkt.speed * dt;
			if (pkt.progress >= 1) {
				packets.splice(i, 1);
			}
		}

		// Update sparks
		for (let i = sparks.length - 1; i >= 0; i--) {
			const spark = sparks[i];
			spark.x += spark.vx;
			spark.y += spark.vy;
			spark.vy += 0.05; // gravity
			spark.life -= dt * 0.001 / spark.maxLife;
			if (spark.life <= 0) {
				sparks.splice(i, 1);
			}
		}

		// Broken node sparks
		if (brokenNodeId) {
			const bNode = getNodeById(brokenNodeId);
			if (bNode && Math.random() < 0.15) {
				const pos = getNodeScreenPos(bNode);
				const angle = Math.random() * Math.PI * 2;
				const dist = bNode.radius * 0.8;
				spawnSpark(
					pos.x + Math.cos(angle) * dist,
					pos.y + Math.sin(angle) * dist,
					'#ff4444',
					2
				);
			}
		}

		// Update retry arrows
		for (const arrow of retryArrows) {
			if (arrow.active) {
				arrow.progress += dt * 0.0005;
				if (arrow.progress > 1) arrow.progress = 0;
			}
		}

		// Request animation
		if (requestAnim.active) {
			requestAnim.progress += dt * 0.0012;
			if (requestAnim.progress >= 1) {
				requestAnim.stageIndex++;
				requestAnim.progress = 0;
				if (requestAnim.stageIndex >= requestAnim.stages.length) {
					requestAnim.active = false;
					playPing();
				} else {
					requestAnim.color = requestAnim.stages[requestAnim.stageIndex].color;
					playBlip();
				}
			}

			if (requestAnim.active) {
				const stage = requestAnim.stages[requestAnim.stageIndex];
				const currentNode = getNodeById(stage.nodeId);
				const nextStageIdx = Math.min(requestAnim.stageIndex + 1, requestAnim.stages.length - 1);
				const nextNode = getNodeById(requestAnim.stages[nextStageIdx].nodeId);

				if (currentNode && nextNode) {
					const cp = getNodeScreenPos(currentNode);
					const np = getNodeScreenPos(nextNode);
					const t = requestAnim.progress;
					requestAnim.packet.x = lerp(cp.x, np.x, t);
					requestAnim.packet.y = lerp(cp.y, np.y, t);
				}
			}
		}

		// Spring physics for dragged nodes
		for (const node of nodes) {
			if (!node.dragging) {
				const springK = 0.02;
				const damping = 0.85;
				const dx = node.targetX - node.x;
				const dy = node.targetY - node.y;
				node.vx += dx * springK;
				node.vy += dy * springK;
				node.vx *= damping;
				node.vy *= damping;
				node.x += node.vx;
				node.y += node.vy;
			}
		}
	}

	function render(ctx: CanvasRenderingContext2D) {
		ctx.clearRect(0, 0, canvasWidth, canvasHeight);

		drawGrid(ctx);

		// Draw connections
		for (const conn of CONNECTIONS) {
			const fromNode = getNodeById(conn.from);
			const toNode = getNodeById(conn.to);
			if (fromNode && toNode) {
				drawConnection(ctx, fromNode, toNode, conn);
			}
		}

		// Draw packets
		for (const pkt of packets) {
			drawPacket(ctx, pkt);
		}

		// Draw request packet
		drawRequestPacket(ctx);

		// Draw nodes
		for (const node of nodes) {
			drawNode(ctx, node);
		}

		// Draw sparks
		drawSparks(ctx);

		// Draw retry arrows
		drawRetryArrows(ctx);

		// Draw pipeline HUD
		drawPipelineHUD(ctx);
	}

	// ─── Interaction handlers ────────────────────────────────────────────
	function getCanvasCoords(e: MouseEvent): { x: number; y: number } {
		const rect = canvas.getBoundingClientRect();
		return {
			x: (e.clientX - rect.left) * (canvasWidth / rect.width),
			y: (e.clientY - rect.top) * (canvasHeight / rect.height)
		};
	}

	function hitTestNode(cx: number, cy: number): ServiceNode | null {
		for (let i = nodes.length - 1; i >= 0; i--) {
			const node = nodes[i];
			const pos = getNodeScreenPos(node);
			const d = distance(cx, cy, pos.x, pos.y);
			if (d < node.radius) return node;
		}
		return null;
	}

	function hitTestPacket(cx: number, cy: number): DataPacket | null {
		for (const pkt of packets) {
			const px = (pkt as any)._screenX;
			const py = (pkt as any)._screenY;
			if (px !== undefined && py !== undefined) {
				const d = distance(cx, cy, px, py);
				if (d < 15) return pkt;
			}
		}
		return null;
	}

	function handleMouseMove(e: MouseEvent) {
		const coords = getCanvasCoords(e);
		mouseX = coords.x;
		mouseY = coords.y;

		if (dragNode) {
			dragNode.x = coords.x - dragOffsetX;
			dragNode.y = coords.y - dragOffsetY;
			dragNode.targetX = dragNode.x;
			dragNode.targetY = dragNode.y;
			return;
		}

		// Hover test nodes
		let anyHovered = false;
		for (const node of nodes) {
			const pos = getNodeScreenPos(node);
			const d = distance(coords.x, coords.y, pos.x, pos.y);
			node.hovered = d < node.radius;
			if (node.hovered) anyHovered = true;
		}

		// Hover test packets
		const hitPkt = hitTestPacket(coords.x, coords.y);
		for (const pkt of packets) {
			pkt.hovered = pkt === hitPkt;
		}
		hoveredPacket = hitPkt;

		if (anyHovered) {
			cursorState.set('hover');
			cursorLabel.set('inspect');
		} else if (hitPkt) {
			cursorState.set('hover');
			cursorLabel.set('');
		} else {
			cursorState.set('default');
			cursorLabel.set('');
		}
	}

	function handleMouseDown(e: MouseEvent) {
		const coords = getCanvasCoords(e);
		const hitNode = hitTestNode(coords.x, coords.y);

		if (hitNode) {
			dragNode = hitNode;
			hitNode.dragging = true;
			const pos = getNodeScreenPos(hitNode);
			dragOffsetX = coords.x - hitNode.x;
			dragOffsetY = coords.y - hitNode.y;
			cursorState.set('drag');
			cursorLabel.set('');
		}
	}

	function handleMouseUp(e: MouseEvent) {
		if (dragNode) {
			const wasDragged = Math.abs(dragNode.x - dragNode.targetX) > 5 ||
				Math.abs(dragNode.y - dragNode.targetY) > 5;
			dragNode.targetX = dragNode.x;
			dragNode.targetY = dragNode.y;
			dragNode.dragging = false;

			if (!wasDragged) {
				handleNodeClick(dragNode);
			}

			dragNode = null;
			cursorState.set('default');
			return;
		}

		const coords = getCanvasCoords(e);
		const hitNode = hitTestNode(coords.x, coords.y);
		if (hitNode) {
			handleNodeClick(hitNode);
		}
	}

	function handleNodeClick(node: ServiceNode) {
		playClick();
		if (selectedNode?.id === node.id) {
			selectedNode = null;
		} else {
			selectedNode = node;
		}
	}

	function handleSendRequest() {
		if (requestAnim.active) return;
		playBlip();
		requestAnim = {
			active: true,
			stageIndex: 0,
			progress: 0,
			color: PIPELINE_STAGES[0].color,
			stages: PIPELINE_STAGES,
			packet: { ...getNodeScreenPos(getNodeById(PIPELINE_STAGES[0].nodeId)!) }
		};
	}

	function handleBreak() {
		playError();

		if (breakMode) {
			// Restore
			if (brokenNodeId) {
				const bNode = getNodeById(brokenNodeId);
				if (bNode) bNode.broken = false;
			}
			brokenNodeId = null;
			breakMode = false;
			errorLogLines = [];
			retryArrows = [];
			fallbackRoute = null;
			return;
		}

		// Pick a random non-critical node to break
		const breakable = nodes.filter(n => n.id !== 'postgres' && n.id !== 'redis');
		const target = breakable[Math.floor(Math.random() * breakable.length)];
		target.broken = true;
		brokenNodeId = target.id;
		breakMode = true;

		const pos = getNodeScreenPos(target);
		spawnSpark(pos.x, pos.y, '#ff4444', 20);

		// Generate error log
		errorLogLines = [
			`[${new Date().toISOString().slice(11, 19)}] ERR  Connection to ${target.label} failed`,
			`[${new Date().toISOString().slice(11, 19)}] WARN Retry 1/3 in 1000ms...`,
			`[${new Date().toISOString().slice(11, 19)}] ERR  Retry 1 failed: ETIMEDOUT`,
			`[${new Date().toISOString().slice(11, 19)}] WARN Retry 2/3 in 2000ms...`,
			`[${new Date().toISOString().slice(11, 19)}] ERR  Retry 2 failed: ECONNREFUSED`,
			`[${new Date().toISOString().slice(11, 19)}] WARN Activating fallback route...`,
			`[${new Date().toISOString().slice(11, 19)}] INFO Fallback: ${target.label} -> Redis cache`,
			`[${new Date().toISOString().slice(11, 19)}] OK   Fallback route active`,
		];

		// Set fallback route
		fallbackRoute = { from: target.id, to: 'redis' };

		// Retry arrows
		retryArrows = [
			{ nodeId: target.id, angle: 0, progress: 0, active: true },
			{ nodeId: target.id, angle: Math.PI * 0.66, progress: 0.33, active: true },
			{ nodeId: target.id, angle: Math.PI * 1.33, progress: 0.66, active: true },
		];
	}

	function closeOverlay() {
		selectedNode = null;
		cursorState.set('default');
		cursorLabel.set('');
	}

	// ─── Lifecycle ───────────────────────────────────────────────────────
	onMount(() => {
		mounted = true;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		function resize() {
			const rect = container.getBoundingClientRect();
			canvasWidth = rect.width;
			canvasHeight = rect.height;
			canvas.width = canvasWidth;
			canvas.height = canvasHeight;

			if (nodes.length === 0) {
				initNodes();
			} else {
				// Reposition nodes proportionally
				const cx = canvasWidth / 2;
				const cy = canvasHeight / 2;
				const ringRadius = Math.min(canvasWidth, canvasHeight) * 0.3;
				nodes.forEach((node, i) => {
					const angle = (Math.PI * 2 * i) / nodes.length - Math.PI / 2;
					node.targetX = cx + Math.cos(angle) * ringRadius;
					node.targetY = cy + Math.sin(angle) * ringRadius;
				});
			}
		}

		resize();
		window.addEventListener('resize', resize);

		let lastTime = performance.now();

		function loop(now: number) {
			const dt = Math.min(now - lastTime, 50);
			lastTime = now;

			update(dt, now);
			render(ctx!);

			animFrame = requestAnimationFrame(loop);
		}

		animFrame = requestAnimationFrame(loop);

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

	// ─── Overlay position ────────────────────────────────────────────────
	function getOverlayStyle(node: ServiceNode): string {
		if (!canvas) return '';
		const rect = canvas.getBoundingClientRect();
		const scaleX = rect.width / canvasWidth;
		const scaleY = rect.height / canvasHeight;
		const pos = getNodeScreenPos(node);
		const screenX = rect.left + pos.x * scaleX;
		const screenY = rect.top + pos.y * scaleY;

		const left = Math.min(Math.max(screenX + 60, 10), window.innerWidth - 310);
		const top = Math.min(Math.max(screenY - 80, 10), window.innerHeight - 260);

		return `left: ${left}px; top: ${top}px;`;
	}

	// ─── Packet tooltip position ─────────────────────────────────────────
	function getPacketTooltipStyle(pkt: DataPacket): string {
		if (!canvas) return 'display:none';
		const px = (pkt as any)._screenX;
		const py = (pkt as any)._screenY;
		if (px === undefined) return 'display:none';

		const rect = canvas.getBoundingClientRect();
		const scaleX = rect.width / canvasWidth;
		const scaleY = rect.height / canvasHeight;
		const screenX = rect.left + px * scaleX;
		const screenY = rect.top + py * scaleY;

		return `left: ${screenX + 15}px; top: ${screenY - 20}px;`;
	}
</script>

<div class="api-nexus" bind:this={container}>
	<!-- Canvas layer -->
	<canvas
		bind:this={canvas}
		class="nexus-canvas"
		on:mousemove={handleMouseMove}
		on:mousedown={handleMouseDown}
		on:mouseup={handleMouseUp}
		on:mouseleave={() => {
			cursorState.set('default');
			cursorLabel.set('');
			for (const n of nodes) n.hovered = false;
		}}
	></canvas>

	<!-- Header -->
	<div class="nexus-header">
		<div class="header-title">
			<h2 class="title">API Nexus</h2>
			<p class="subtitle">Integrations & API</p>
		</div>
		<p class="hint">click nodes to inspect &bull; send requests to see data flow</p>
	</div>

	<!-- Control buttons -->
	<div class="controls">
		<button
			class="ctrl-btn send-btn"
			class:active={requestAnim.active}
			disabled={requestAnim.active}
			on:click={handleSendRequest}
			on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set('send'); }}
			on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
		>
			<span class="btn-icon">{requestAnim.active ? '...' : '>'}</span>
			Send Request
		</button>
		<button
			class="ctrl-btn break-btn"
			class:active={breakMode}
			on:click={handleBreak}
			on:mouseenter={() => { cursorState.set('hover'); cursorLabel.set(breakMode ? 'restore' : 'break'); }}
			on:mouseleave={() => { cursorState.set('default'); cursorLabel.set(''); }}
		>
			<span class="btn-icon">{breakMode ? 'R' : 'X'}</span>
			{breakMode ? 'Restore' : 'Break'}
		</button>
	</div>

	<!-- Tags -->
	<div class="tags-row">
		{#each TAGS as tag}
			<span class="tech-tag">{tag}</span>
		{/each}
	</div>

	<!-- Node detail overlay -->
	{#if selectedNode}
		<div class="node-overlay" style={getOverlayStyle(selectedNode)}>
			<div class="overlay-header">
				<span class="overlay-icon" style="color: {selectedNode.color}">{selectedNode.icon}</span>
				<div>
					<h3 class="overlay-title">{selectedNode.label}</h3>
					<span class="overlay-protocol">{selectedNode.protocol}</span>
				</div>
				<button class="overlay-close" on:click={closeOverlay}>x</button>
			</div>

			<div class="overlay-section">
				<h4>Endpoints</h4>
				{#each selectedNode.endpoints as ep}
					<div class="endpoint-line">
						<span class="method">{ep.split(' ')[0]}</span>
						<span class="path">{ep.split(' ').slice(1).join(' ') || ep}</span>
					</div>
				{/each}
			</div>

			<div class="overlay-section">
				<h4>Middleware</h4>
				{#each selectedNode.middleware as mw}
					<div class="middleware-line">{mw}</div>
				{/each}
			</div>

			{#if selectedNode.broken}
				<div class="overlay-section error-section">
					<h4>Status: ERROR</h4>
					<p class="error-text">Connection failed - fallback active</p>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Packet JSON tooltip -->
	{#if hoveredPacket}
		<div class="packet-tooltip" style={getPacketTooltipStyle(hoveredPacket)}>
			<pre class="json-preview">{JSON.stringify(hoveredPacket.payload, null, 1)}</pre>
		</div>
	{/if}

	<!-- Error terminal -->
	{#if breakMode && errorLogLines.length > 0}
		<div class="error-terminal">
			<div class="terminal-header">
				<span class="terminal-dot red"></span>
				<span class="terminal-dot yellow"></span>
				<span class="terminal-dot green"></span>
				<span class="terminal-title">error_handler.log</span>
			</div>
			<div class="terminal-body">
				{#each errorLogLines as line}
					<div class="log-line" class:error={line.includes('ERR')} class:warn={line.includes('WARN')} class:ok={line.includes('OK') || line.includes('INFO')}>
						{line}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.api-nexus {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: var(--bg-primary, #0a0a1a);
		user-select: none;
	}

	.nexus-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		cursor: default;
	}

	/* ─── Header ────────────────────────────────────────────────────── */
	.nexus-header {
		position: absolute;
		top: 24px;
		left: 28px;
		z-index: 10;
		pointer-events: none;
	}

	.header-title {
		margin-bottom: 6px;
	}

	.title {
		font-family: var(--font-sans, 'Inter', sans-serif);
		font-size: 28px;
		font-weight: 800;
		letter-spacing: 0.04em;
		color: var(--text-primary, #f0f0f0);
		margin: 0;
		line-height: 1.1;
		text-shadow: 0 0 30px rgba(0, 212, 255, 0.15);
	}

	.subtitle {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 12px;
		color: var(--text-muted, #666);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		margin: 4px 0 0;
	}

	.hint {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 11px;
		color: var(--text-muted, #555);
		opacity: 0.6;
		margin: 0;
	}

	/* ─── Controls ──────────────────────────────────────────────────── */
	.controls {
		position: absolute;
		top: 24px;
		right: 28px;
		z-index: 10;
		display: flex;
		gap: 10px;
	}

	.ctrl-btn {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 12px;
		padding: 8px 16px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 6px;
		background: rgba(10, 10, 26, 0.8);
		color: var(--text-secondary, #aaa);
		cursor: pointer;
		backdrop-filter: blur(8px);
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		gap: 6px;
		letter-spacing: 0.04em;
	}

	.ctrl-btn:hover:not(:disabled) {
		border-color: rgba(255, 255, 255, 0.25);
		color: var(--text-primary, #f0f0f0);
	}

	.ctrl-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 3px;
		font-size: 11px;
		font-weight: 700;
	}

	.send-btn .btn-icon {
		background: rgba(0, 255, 136, 0.15);
		color: var(--aurora-green, #00ff88);
	}

	.send-btn:hover:not(:disabled) {
		border-color: var(--aurora-green, #00ff88);
		box-shadow: 0 0 12px rgba(0, 255, 136, 0.15);
	}

	.send-btn.active {
		border-color: var(--aurora-green, #00ff88);
		box-shadow: 0 0 20px rgba(0, 255, 136, 0.2);
		color: var(--aurora-green, #00ff88);
	}

	.break-btn .btn-icon {
		background: rgba(255, 68, 68, 0.15);
		color: #ff4444;
	}

	.break-btn:hover:not(:disabled) {
		border-color: #ff4444;
		box-shadow: 0 0 12px rgba(255, 68, 68, 0.15);
	}

	.break-btn.active {
		border-color: #ff4444;
		box-shadow: 0 0 20px rgba(255, 68, 68, 0.2);
		color: #ff4444;
	}

	.break-btn.active .btn-icon {
		background: rgba(0, 255, 136, 0.15);
		color: var(--aurora-green, #00ff88);
	}

	/* ─── Tags ──────────────────────────────────────────────────────── */
	.tags-row {
		position: absolute;
		bottom: 20px;
		right: 28px;
		z-index: 10;
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: flex-end;
		pointer-events: none;
	}

	.tech-tag {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		padding: 3px 8px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 4px;
		color: var(--text-muted, #555);
		background: rgba(10, 10, 26, 0.6);
		letter-spacing: 0.06em;
	}

	/* ─── Node Overlay ──────────────────────────────────────────────── */
	.node-overlay {
		position: fixed;
		z-index: 100;
		width: 280px;
		background: rgba(10, 12, 25, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		padding: 16px;
		backdrop-filter: blur(12px);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
		animation: overlayIn 0.2s ease-out;
	}

	@keyframes overlayIn {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.overlay-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 14px;
		padding-bottom: 10px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.overlay-icon {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 18px;
		font-weight: 700;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.04);
		flex-shrink: 0;
	}

	.overlay-title {
		font-family: var(--font-sans, 'Inter', sans-serif);
		font-size: 15px;
		font-weight: 700;
		color: var(--text-primary, #f0f0f0);
		margin: 0;
		line-height: 1.2;
	}

	.overlay-protocol {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		color: var(--aurora-cyan, #00d4ff);
		letter-spacing: 0.08em;
	}

	.overlay-close {
		margin-left: auto;
		width: 22px;
		height: 22px;
		border: none;
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-muted, #555);
		border-radius: 4px;
		cursor: pointer;
		font-family: var(--font-mono, monospace);
		font-size: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.overlay-close:hover {
		background: rgba(255, 60, 60, 0.15);
		color: #ff6666;
	}

	.overlay-section {
		margin-bottom: 12px;
	}

	.overlay-section:last-child {
		margin-bottom: 0;
	}

	.overlay-section h4 {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		font-weight: 600;
		color: var(--text-muted, #555);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		margin: 0 0 6px;
	}

	.endpoint-line {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 11px;
		padding: 3px 0;
		display: flex;
		gap: 8px;
	}

	.method {
		color: var(--aurora-green, #00ff88);
		font-weight: 600;
		min-width: 40px;
	}

	.path {
		color: var(--text-secondary, #aaa);
	}

	.middleware-line {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 11px;
		color: var(--text-secondary, #aaa);
		padding: 2px 0;
		padding-left: 10px;
		border-left: 2px solid rgba(180, 74, 255, 0.3);
	}

	.error-section {
		background: rgba(255, 50, 50, 0.08);
		border-radius: 6px;
		padding: 8px 10px;
		border: 1px solid rgba(255, 50, 50, 0.15);
	}

	.error-section h4 {
		color: #ff6666;
	}

	.error-text {
		font-family: var(--font-mono, monospace);
		font-size: 11px;
		color: #ff9999;
		margin: 0;
	}

	/* ─── Packet Tooltip ────────────────────────────────────────────── */
	.packet-tooltip {
		position: fixed;
		z-index: 90;
		background: rgba(10, 12, 25, 0.95);
		border: 1px solid rgba(0, 212, 255, 0.2);
		border-radius: 6px;
		padding: 8px 10px;
		backdrop-filter: blur(8px);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		pointer-events: none;
		animation: tooltipIn 0.15s ease-out;
	}

	@keyframes tooltipIn {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.json-preview {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		color: var(--aurora-cyan, #00d4ff);
		margin: 0;
		white-space: pre;
		line-height: 1.4;
		max-width: 220px;
		overflow: hidden;
	}

	/* ─── Error Terminal ────────────────────────────────────────────── */
	.error-terminal {
		position: absolute;
		bottom: 56px;
		left: 28px;
		z-index: 10;
		width: 420px;
		max-width: calc(100% - 56px);
		background: rgba(10, 10, 18, 0.95);
		border: 1px solid rgba(255, 50, 50, 0.2);
		border-radius: 8px;
		overflow: hidden;
		backdrop-filter: blur(10px);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
		animation: terminalIn 0.3s ease-out;
	}

	@keyframes terminalIn {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.terminal-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.03);
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.terminal-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.terminal-dot.red { background: #ff5f57; }
	.terminal-dot.yellow { background: #ffbd2e; }
	.terminal-dot.green { background: #28c840; }

	.terminal-title {
		font-family: var(--font-mono, monospace);
		font-size: 10px;
		color: var(--text-muted, #555);
		margin-left: 6px;
		letter-spacing: 0.04em;
	}

	.terminal-body {
		padding: 10px 12px;
		max-height: 160px;
		overflow-y: auto;
	}

	.log-line {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		line-height: 1.6;
		color: var(--text-secondary, #888);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.log-line.error {
		color: #ff6666;
	}

	.log-line.warn {
		color: #ffaa44;
	}

	.log-line.ok {
		color: var(--aurora-green, #00ff88);
	}

	/* ─── Responsive ────────────────────────────────────────────────── */
	@media (max-width: 768px) {
		.nexus-header {
			top: 14px;
			left: 16px;
		}

		.title {
			font-size: 22px;
		}

		.controls {
			top: 14px;
			right: 16px;
		}

		.ctrl-btn {
			padding: 6px 10px;
			font-size: 11px;
		}

		.tags-row {
			bottom: 12px;
			right: 16px;
		}

		.error-terminal {
			left: 12px;
			bottom: 48px;
			width: calc(100% - 24px);
		}

		.node-overlay {
			width: 240px;
		}
	}
</style>
