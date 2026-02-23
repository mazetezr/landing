<script lang="ts">
	import { onMount } from 'svelte';
	import { soundEnabled } from '$lib/stores/sound';
	import { resumeAudio, playGearHum, playGearExplode, playTick } from '$lib/utils/audio';

	export let onComplete: () => void = () => {};

	let canvas: HTMLCanvasElement;
	let visible = true;
	let fadeOut = false;
	let hintOpacity = 1;

	onMount(() => {
		const ctx = canvas.getContext('2d')!;
		const dpr = window.devicePixelRatio || 1;
		let w = window.innerWidth;
		let h = window.innerHeight;
		canvas.width = w * dpr;
		canvas.height = h * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const cx = w / 2;
		const cy = h / 2;

		const SEGMENTS = 12;
		const INNER_R = 35;
		const OUTER_R = 60;
		const BAR_WIDTH = 5;

		interface Bar {
			angle: number;
			// Explosion physics
			x: number;
			y: number;
			vx: number;
			vy: number;
			rot: number;
			vr: number; // angular velocity
		}

		const bars: Bar[] = [];
		for (let s = 0; s < SEGMENTS; s++) {
			bars.push({
				angle: (Math.PI * 2 / SEGMENTS) * s,
				x: 0, y: 0,
				vx: 0, vy: 0,
				rot: 0,
				vr: 0
			});
		}

		let rotation = 0;
		let rotSpeed = 0.003;
		let hoverTime = 0;
		let exploded = false;
		let explodeTime = 0;
		let time = 0;
		let mouseX = -9999;
		let mouseY = -9999;
		let done = false;
		// Which segment is currently "lit" — sweeps around
		let litIndex = 0;
		let litTimer = 0;

		const HOVER_RADIUS = 90;
		const TARGET_TIME = 5;
		const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

		let audioResumed = false;
		const handleMouseMove = (e: MouseEvent) => {
			mouseX = e.clientX;
			mouseY = e.clientY;
		};
		const handleTouchMove = (e: TouchEvent) => {
			const t = e.touches[0];
			if (t) {
				mouseX = t.clientX;
				mouseY = t.clientY;
			}
		};
		const handleInteraction = async () => {
			if (!audioResumed) {
				audioResumed = true;
				await resumeAudio();
				// Small delay so no queued sounds burst out
				setTimeout(() => soundEnabled.set(true), 100);
			}
		};
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('touchmove', handleTouchMove);
		window.addEventListener('mousedown', handleInteraction);
		window.addEventListener('touchstart', handleInteraction);

		let animFrame: number;

		function animate() {
			if (done) return;
			time += 0.016;
			ctx.clearRect(0, 0, w, h);

			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);

			const dist = Math.hypot(mouseX - cx, mouseY - cy);
			const hovering = isMobile ? !exploded : (dist < HOVER_RADIUS && !exploded);

			if (hovering) {
				hoverTime += isMobile ? 0.032 : 0.016;
				rotSpeed = 0.003 + hoverTime * (isMobile ? 0.02 : 0.008);
			} else if (!exploded) {
				hoverTime = Math.max(0, hoverTime - 0.03);
				rotSpeed = 0.003 + hoverTime * 0.008;
			}

			// Advance lit segment — faster when spinning faster
			litTimer += rotSpeed * 8;
			if (litTimer >= 1) {
				litTimer -= 1;
				litIndex = (litIndex + 1) % SEGMENTS;
				if (hovering) playTick();
			}

			// Gear hum while hovering (every ~0.3s)
			if (hovering && Math.floor(time * 3) !== Math.floor((time - 0.016) * 3)) {
				playGearHum(Math.min(rotSpeed / 0.04, 1));
			}

			// Trigger explosion
			if (hoverTime >= TARGET_TIME && !exploded) {
				exploded = true;
				explodeTime = time;
				playGearExplode();

				for (const bar of bars) {
					const a = bar.angle + rotation;
					const midR = (INNER_R + OUTER_R) / 2;
					const mx = cx + Math.cos(a) * midR;
					const my = cy + Math.sin(a) * midR;

					bar.x = mx;
					bar.y = my;
					bar.rot = a;

					const outAngle = Math.atan2(my - cy, mx - cx) + (Math.random() - 0.5) * 0.8;
					const speed = 5 + Math.random() * 8;
					bar.vx = Math.cos(outAngle) * speed;
					bar.vy = Math.sin(outAngle) * speed;
					bar.vr = (Math.random() - 0.5) * 0.3;
				}
			}

			rotation += rotSpeed;

			const speedGlow = Math.min(1, rotSpeed / 0.04);

			// Progress ring
			if (!exploded && hoverTime > 0) {
				const progress = Math.min(hoverTime / TARGET_TIME, 1);
				ctx.beginPath();
				ctx.arc(cx, cy, OUTER_R + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
				ctx.strokeStyle = `rgba(0, 212, 255, ${0.3 * progress + 0.1})`;
				ctx.lineWidth = 1.5;
				ctx.stroke();
			}

			// Fade after explosion
			let globalAlpha = 1;
			if (exploded) {
				const elapsed = time - explodeTime;
				globalAlpha = Math.max(0, 1 - elapsed / 1.5);
				if (globalAlpha <= 0 && !done) {
					done = true;
					window.removeEventListener('mousemove', handleMouseMove);
					cancelAnimationFrame(animFrame);
					fadeOut = true;
					setTimeout(() => {
						visible = false;
						onComplete();
					}, 600);
					return;
				}
			}

			ctx.lineCap = 'round';
			const barLen = OUTER_R - INNER_R;

			if (!exploded) {
				// Draw solid bars with iOS-style sequential highlight
				for (let s = 0; s < SEGMENTS; s++) {
					const a = bars[s].angle + rotation;
					const cos = Math.cos(a);
					const sin = Math.sin(a);
					const x1 = cx + cos * INNER_R;
					const y1 = cy + sin * INNER_R;
					const x2 = cx + cos * OUTER_R;
					const y2 = cy + sin * OUTER_R;

					// iOS highlight: lit one is brightest, ones ahead dim (not yet lit)
					const diff = ((litIndex - s) % SEGMENTS + SEGMENTS) % SEGMENTS;
					const fade = Math.max(0.12, 1 - diff / SEGMENTS);
					const brightness = fade * (0.6 + speedGlow * 0.4);

					ctx.beginPath();
					ctx.moveTo(x1, y1);
					ctx.lineTo(x2, y2);
					ctx.strokeStyle = `rgba(0, 212, 255, ${brightness.toFixed(3)})`;
					ctx.lineWidth = BAR_WIDTH;
					ctx.stroke();

					// Glow on bright bars
					if (fade > 0.7 && speedGlow > 0.2) {
						ctx.beginPath();
						ctx.moveTo(x1, y1);
						ctx.lineTo(x2, y2);
						ctx.strokeStyle = `rgba(0, 212, 255, ${(brightness * 0.15).toFixed(3)})`;
						ctx.lineWidth = BAR_WIDTH + 6;
						ctx.stroke();
					}
				}
			} else {
				// Bars fly apart, tumbling
				for (const bar of bars) {
					bar.x += bar.vx;
					bar.y += bar.vy;
					bar.vx *= 0.97;
					bar.vy *= 0.97;
					bar.rot += bar.vr;
					bar.vr *= 0.99;

					const cos = Math.cos(bar.rot);
					const sin = Math.sin(bar.rot);
					const halfLen = barLen / 2;

					const x1 = bar.x - cos * halfLen;
					const y1 = bar.y - sin * halfLen;
					const x2 = bar.x + cos * halfLen;
					const y2 = bar.y + sin * halfLen;

					ctx.beginPath();
					ctx.moveTo(x1, y1);
					ctx.lineTo(x2, y2);
					ctx.strokeStyle = `rgba(0, 212, 255, ${globalAlpha.toFixed(3)})`;
					ctx.lineWidth = BAR_WIDTH;
					ctx.stroke();

					// Glow
					ctx.beginPath();
					ctx.moveTo(x1, y1);
					ctx.lineTo(x2, y2);
					ctx.strokeStyle = `rgba(0, 212, 255, ${(globalAlpha * 0.2).toFixed(3)})`;
					ctx.lineWidth = BAR_WIDTH + 8;
					ctx.stroke();
				}
			}

			// Hint text
			if (!exploded) {
				hintOpacity = hovering ? Math.max(0, hintOpacity - 0.01) : Math.min(1, hintOpacity + 0.01);
				if (hintOpacity > 0.01 && !isMobile) {
					ctx.font = '13px "JetBrains Mono", "Fira Code", monospace';
					ctx.textAlign = 'center';
					ctx.fillStyle = `rgba(0, 212, 255, ${(hintOpacity * 0.7).toFixed(2)})`;
					ctx.fillText('hold cursor over to enter', cx, cy + OUTER_R + 45);
				}
			}

			animFrame = requestAnimationFrame(animate);
		}

		animate();

		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('touchmove', handleTouchMove);
			window.removeEventListener('mousedown', handleInteraction);
			window.removeEventListener('touchstart', handleInteraction);
			cancelAnimationFrame(animFrame);
		};
	});
</script>

{#if visible}
	<div class="loading-screen" class:fade-out={fadeOut}>
		<canvas bind:this={canvas}></canvas>
	</div>
{/if}

<style>
	.loading-screen {
		position: fixed;
		inset: 0;
		z-index: 10000;
		background: #000;
		transition: opacity 0.6s ease;
	}

	.loading-screen.fade-out {
		opacity: 0;
	}

	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
</style>
