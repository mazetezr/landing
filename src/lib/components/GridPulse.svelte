<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { cursorPos } from '$lib/stores/cursor';
	import { playGridPulse } from '$lib/utils/audio';

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	let animFrame: number;
	let mx = -1000, my = -1000;

	const HEX_R = 110;
	const HIT_DIST = 10;
	const PULSE_LEN = 80;
	const PULSE_SPEED = 1.2;
	const CORNER_R = 8;

	interface Edge {
		ax: number; ay: number;
		bx: number; by: number;
		len: number;
	}

	interface Pulse {
		edge: number;
		head: number;
		dir: number;
		life: number;
	}

	let edges: Edge[] = [];
	let pulses: Pulse[] = [];
	let cooldown = 0;

	// Clear zone in center for hero text
	let clearX = 0, clearY = 0, clearW = 0, clearH = 0;

	function updateClearZone() {
		const w = window.innerWidth;
		const h = window.innerHeight;
		clearW = Math.min(700, w * 0.65);
		clearH = 350;
		clearX = (w - clearW) / 2;
		clearH = 250;
		clearY = (h - clearH) / 2;
	}

	function segmentIntersectsRect(ax: number, ay: number, bx: number, by: number, rx: number, ry: number, rw: number, rh: number): boolean {
		// Check if either endpoint is inside the rect
		if (ax >= rx && ax <= rx + rw && ay >= ry && ay <= ry + rh) return true;
		if (bx >= rx && bx <= rx + rw && by >= ry && by <= ry + rh) return true;

		// Check segment against all 4 rect edges
		const edges: [number, number, number, number][] = [
			[rx, ry, rx + rw, ry],
			[rx + rw, ry, rx + rw, ry + rh],
			[rx + rw, ry + rh, rx, ry + rh],
			[rx, ry + rh, rx, ry],
		];
		for (const [cx, cy, dx, dy] of edges) {
			if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return true;
		}
		return false;
	}

	function segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
		const d1x = bx - ax, d1y = by - ay;
		const d2x = dx - cx, d2y = dy - cy;
		const cross = d1x * d2y - d1y * d2x;
		if (Math.abs(cross) < 1e-10) return false;
		const t = ((cx - ax) * d2y - (cy - ay) * d2x) / cross;
		const u = ((cx - ax) * d1y - (cy - ay) * d1x) / cross;
		return t >= 0 && t <= 1 && u >= 0 && u <= 1;
	}

	function edgeInClearZone(ax: number, ay: number, bx: number, by: number): boolean {
		return segmentIntersectsRect(ax, ay, bx, by, clearX, clearY, clearW, clearH);
	}

	function buildGrid(w: number, h: number) {
		const newEdges: Edge[] = [];
		const seen = new Set<string>();
		const sqrt3 = Math.sqrt(3);
		const colStep = 1.5 * HEX_R;
		const rowStep = sqrt3 * HEX_R;
		const cols = Math.ceil(w / colStep) + 3;
		const rows = Math.ceil(h / rowStep) + 3;

		for (let q = -1; q < cols; q++) {
			for (let r = -1; r < rows; r++) {
				const cx = q * colStep;
				const cy = r * rowStep + (q & 1 ? rowStep / 2 : 0);

				for (let i = 0; i < 6; i++) {
					const a0 = (Math.PI / 3) * i;
					const a1 = (Math.PI / 3) * ((i + 1) % 6);
					const ax = cx + HEX_R * Math.cos(a0);
					const ay = cy + HEX_R * Math.sin(a0);
					const bx = cx + HEX_R * Math.cos(a1);
					const by = cy + HEX_R * Math.sin(a1);

					if (edgeInClearZone(ax, ay, bx, by)) continue;

					const x1 = Math.round(ax * 10), y1 = Math.round(ay * 10);
					const x2 = Math.round(bx * 10), y2 = Math.round(by * 10);
					const key = x1 < x2 || (x1 === x2 && y1 < y2)
						? `${x1},${y1},${x2},${y2}`
						: `${x2},${y2},${x1},${y1}`;

					if (!seen.has(key)) {
						seen.add(key);
						newEdges.push({ ax, ay, bx, by, len: Math.hypot(bx - ax, by - ay) });
					}
				}
			}
		}

		edges = newEdges;
		pulses = [];
	}

	function closestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): { dist: number; t: number } {
		const dx = bx - ax, dy = by - ay;
		const len2 = dx * dx + dy * dy;
		if (len2 === 0) return { dist: Math.hypot(px - ax, py - ay), t: 0 };
		let t = ((px - ax) * dx + (py - ay) * dy) / len2;
		t = Math.max(0, Math.min(1, t));
		const cx = ax + t * dx, cy = ay + t * dy;
		return { dist: Math.hypot(px - cx, py - cy), t };
	}

	function animate() {
		const w = window.innerWidth;
		const h = window.innerHeight;
		ctx.clearRect(0, 0, w, h);

		if (cooldown > 0) cooldown--;

		if (cooldown === 0) {
			for (let i = 0; i < edges.length; i++) {
				const e = edges[i];
				const { dist, t } = closestOnSegment(mx, my, e.ax, e.ay, e.bx, e.by);
				if (dist < HIT_DIST && t > 0.05 && t < 0.95) {
					const headPx = t * e.len;
					const dir = t < 0.5 ? -1 : 1;
					pulses.push({ edge: i, head: headPx, dir, life: 1 });
					cooldown = 4;
					break;
				}
			}
		}

		// Update pulses
		for (let i = pulses.length - 1; i >= 0; i--) {
			const p = pulses[i];
			p.head += p.dir * PULSE_SPEED;
			p.life -= 0.008;

			const e = edges[p.edge];
			if (p.life <= 0 || p.head < -PULSE_LEN || p.head > e.len + PULSE_LEN) {
				pulses.splice(i, 1);
			}
		}

		// Draw pulses with rounded ends
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		for (const p of pulses) {
			const e = edges[p.edge];
			const dx = (e.bx - e.ax) / e.len;
			const dy = (e.by - e.ay) / e.len;

			// Clamp head and tail to edge, inset by corner radius
			const minT = CORNER_R;
			const maxT = e.len - CORNER_R;

			const headT = Math.max(minT, Math.min(maxT, p.head));
			const tailPos = p.head - p.dir * PULSE_LEN;
			const tailT = Math.max(minT, Math.min(maxT, tailPos));

			// Skip if segment is too small
			if (Math.abs(headT - tailT) < 1) continue;

			const hx = e.ax + dx * headT;
			const hy = e.ay + dy * headT;
			const tx = e.ax + dx * tailT;
			const ty = e.ay + dy * tailT;

			const grad = ctx.createLinearGradient(tx, ty, hx, hy);
			grad.addColorStop(0, `rgba(0, 212, 255, 0)`);
			grad.addColorStop(1, `rgba(0, 212, 255, ${0.3 * p.life})`);

			ctx.beginPath();
			ctx.moveTo(tx, ty);
			ctx.lineTo(hx, hy);
			ctx.strokeStyle = grad;
			ctx.lineWidth = 1;
			ctx.stroke();
		}

		animFrame = requestAnimationFrame(animate);
	}

	const unsub = cursorPos.subscribe(pos => {
		mx = pos.x;
		my = pos.y;
	});

	onMount(() => {
		ctx = canvas.getContext('2d')!;
		updateClearZone();
		resize();
		window.addEventListener('resize', resize);
		animate();
	});

	function resize() {
		const dpr = window.devicePixelRatio || 1;
		canvas.width = window.innerWidth * dpr;
		canvas.height = window.innerHeight * dpr;
		canvas.style.width = window.innerWidth + 'px';
		canvas.style.height = window.innerHeight + 'px';
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		updateClearZone();
		buildGrid(window.innerWidth, window.innerHeight);
	}

	onDestroy(() => {
		cancelAnimationFrame(animFrame);
		window.removeEventListener('resize', resize);
		unsub();
	});
</script>

<canvas bind:this={canvas} class="grid-pulse"></canvas>

<style>
	.grid-pulse {
		position: fixed;
		inset: 0;
		z-index: 0;
		pointer-events: none;
	}
</style>
