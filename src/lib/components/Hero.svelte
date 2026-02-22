<script lang="ts">
	import { onMount } from 'svelte';
	import { cursorPos } from '$lib/stores/cursor';
	import { scrollProgress, hasScrolled } from '$lib/stores/scroll';
	import * as THREE from 'three';
	import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
	import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
	import { base } from '$app/paths';
	import { lerp } from '$lib/utils/math';

	let canvas: HTMLCanvasElement;
	let animFrame: number;
	let scrollIndicatorVisible = true;
	let currentScrollProgress = 0;
	let targetScrollProgress = 0;

	hasScrolled.subscribe(v => {
		if (v) scrollIndicatorVisible = false;
	});

	scrollProgress.subscribe(v => {
		targetScrollProgress = v;
	});

	// Create circular particle texture
	function createCircleTexture(): THREE.Texture {
		const size = 64;
		const c = document.createElement('canvas');
		c.width = size;
		c.height = size;
		const ctx = c.getContext('2d')!;
		const half = size / 2;
		const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
		grad.addColorStop(0, 'rgba(255,255,255,1)');
		grad.addColorStop(0.6, 'rgba(255,255,255,1)');
		grad.addColorStop(0.85, 'rgba(255,255,255,0.4)');
		grad.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, size, size);
		const tex = new THREE.CanvasTexture(c);
		tex.needsUpdate = true;
		return tex;
	}

	// Sample random points inside a mesh volume using raycasting
	function samplePointsInMesh(geometry: THREE.BufferGeometry, count: number): Float32Array {
		const points: number[] = [];
		const tempMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());

		geometry.computeBoundingBox();
		const box = geometry.boundingBox!;
		const min = box.min;
		const max = box.max;

		const raycaster = new THREE.Raycaster();
		const direction = new THREE.Vector3(0, 0, 1);

		const maxAttempts = count * 20;
		let attempts = 0;

		while (points.length < count * 3 && attempts < maxAttempts) {
			attempts++;
			const x = min.x + Math.random() * (max.x - min.x);
			const y = min.y + Math.random() * (max.y - min.y);
			const z = min.z + Math.random() * (max.z - min.z);

			raycaster.set(new THREE.Vector3(x, y, min.z - 1), direction);
			const intersections = raycaster.intersectObject(tempMesh);

			if (intersections.length % 2 === 1) {
				points.push(x, y, z);
			} else if (intersections.length >= 2) {
				for (let k = 0; k < intersections.length - 1; k += 2) {
					if (z >= intersections[k].point.z && z <= intersections[k + 1].point.z) {
						points.push(x, y, z);
						break;
					}
				}
			}
		}

		return new Float32Array(points.slice(0, count * 3));
	}

	onMount(() => {
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
		renderer.setSize(canvas.clientWidth, canvas.clientHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

		const baseCamZ = 20;
		const baseCamY = -1.4;
		camera.position.z = baseCamZ;
		camera.position.y = baseCamY;

		const circleTexture = createCircleTexture();

		const loader = new FontLoader();
		loader.load(`${base}/fonts/helvetiker_regular.typeface.json`, (font) => {
			const title = 'EDWARD';
			const letterSpacing = 0.54;
			const textSize = 3.96;
			const extrudeDepth = 0.9;

			interface LetterData { startIdx: number; count: number; }
			const letterData: LetterData[] = [];

			const letterGeos: THREE.BufferGeometry[] = [];
			const letterWidths: number[] = [];
			let totalWidth = 0;

			for (let i = 0; i < title.length; i++) {
				const geo = new TextGeometry(title[i], {
					font,
					size: textSize,
					depth: extrudeDepth,
					curveSegments: 6,
					bevelEnabled: false
				});
				geo.computeBoundingBox();
				const width = geo.boundingBox!.max.x - geo.boundingBox!.min.x;
				letterGeos.push(geo);
				letterWidths.push(width);
				totalWidth += width + letterSpacing;
			}
			totalWidth -= letterSpacing;

			const particlesPerLetter = window.innerWidth < 768 ? 3000 : 6000;
			const allPositions: number[] = [];
			const allColors: number[] = [];
			const allOriginal: number[] = [];
			const allJitterPhase: number[] = [];
			const allJitterSpeed: number[] = [];
			const allJitterAmp: number[] = [];

			let xOffset = -totalWidth / 2;

			for (let i = 0; i < title.length; i++) {
				const geo = letterGeos[i];
				const startIdx = allPositions.length / 3;

				const sampled = samplePointsInMesh(geo, particlesPerLetter);
				const actualCount = sampled.length / 3;

				geo.computeBoundingBox();
				const yCenter = (geo.boundingBox!.max.y + geo.boundingBox!.min.y) / 2;
				const zCenter = (geo.boundingBox!.max.z + geo.boundingBox!.min.z) / 2;

				for (let j = 0; j < actualCount; j++) {
					const px = sampled[j * 3] + xOffset;
					const py = sampled[j * 3 + 1] - yCenter;
					const pz = sampled[j * 3 + 2] - zCenter;

					allPositions.push(px, py, pz);
					allOriginal.push(px, py, pz);

					// Same cyan as loading gear: rgb(0, 212, 255)
					allColors.push(0, 0.831, 1.0);

					allJitterPhase.push(
						Math.random() * Math.PI * 2,
						Math.random() * Math.PI * 2,
						Math.random() * Math.PI * 2
					);
					allJitterSpeed.push(
						4 + Math.random() * 8,
						4 + Math.random() * 8,
						4 + Math.random() * 8
					);
					allJitterAmp.push(
						0.03 + Math.random() * 0.1,
						0.03 + Math.random() * 0.1,
						0.02 + Math.random() * 0.07
					);
				}

				letterData.push({ startIdx, count: actualCount });
				xOffset += letterWidths[i] + letterSpacing;
				geo.dispose();
			}

			const totalParticles = allPositions.length / 3;
			const positions = new Float32Array(allPositions);
			const originalPositions = new Float32Array(allOriginal);
			const colors = new Float32Array(allColors);
			const velocities = new Float32Array(totalParticles * 3);
			const jitterPhase = new Float32Array(allJitterPhase);
			const jitterSpeed = new Float32Array(allJitterSpeed);
			const jitterAmp = new Float32Array(allJitterAmp);

			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
			geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

			const material = new THREE.PointsMaterial({
				size: 0.09,
				map: circleTexture,
				vertexColors: true,
				transparent: true,
				opacity: 1.0,
				blending: THREE.AdditiveBlending,
				sizeAttenuation: true,
				depthWrite: false
			});

			const particles = new THREE.Points(geometry, material);
			scene.add(particles);

			// Mouse tracking
			// Mouse tracking — recomputed each frame for current camera
			const mouse3D = new THREE.Vector3();
			const prevMouse3D = new THREE.Vector3();
			const mouseLocal = new THREE.Vector3();
			const mouseVel = new THREE.Vector3();
			let mouseInited = false;
			let screenMx = 0, screenMy = 0;

			const vFov = (60 * Math.PI) / 180;
			const halfTan = Math.tan(vFov / 2);

			const unsubCursor = cursorPos.subscribe(pos => {
				screenMx = (pos.x / window.innerWidth) * 2 - 1;
				screenMy = -(pos.y / window.innerHeight) * 2 + 1;
			});

			let time = 0;
			let lastTime = performance.now();
			const smoothVel = new THREE.Vector3();

			// Smoothed scroll value for buttery animation
			let smoothScroll = 0;

			function animate() {
				const now = performance.now();
				const dt = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms
				lastTime = now;
				time += dt;

				// Smooth scroll interpolation — silky 60fps
				smoothScroll = lerp(smoothScroll, targetScrollProgress, 1 - Math.pow(0.001, dt));
				currentScrollProgress = smoothScroll;
				const sp = smoothScroll;

				const posArr = geometry.attributes.position.array as Float32Array;

				// --- Scroll-driven camera: fly straight through the text ---
				// Phase 1 (0→0.4): gentle Y rotation to show 3D depth
				const rotPhase = Math.min(sp / 0.4, 1);
				const rotEased = rotPhase * rotPhase * (3 - 2 * rotPhase); // smoothstep
				particles.rotation.y = rotEased * 0.35; // max ~20 degrees

				// Phase 2 (0.2→1.0): camera moves forward along Z straight through
				const zoomPhase = Math.max(0, (sp - 0.2) / 0.8);
				const zoomEased = zoomPhase * zoomPhase; // quadratic ease-in
				camera.position.z = baseCamZ - zoomEased * 24;
				camera.position.y = lerp(baseCamY, 0, zoomEased); // center Y as we approach

				// Particle size grows as camera passes through
				material.size = 0.09 + zoomEased * 0.04;
				material.opacity = sp > 0.85 ? Math.max(0, 1 - (sp - 0.85) / 0.15) : 1.0;

				// Recompute mouse in local particle space each frame
				const camZ = camera.position.z;
				const camY = camera.position.y;
				const visH = 2 * halfTan * camZ;
				const visW = visH * (canvas.clientWidth / canvas.clientHeight);
				const worldX = screenMx * visW / 2;
				const worldY = screenMy * visH / 2 + camY;

				// Inverse-rotate by particles.rotation.y to get local coords
				const rotY = particles.rotation.y;
				const cosR = Math.cos(-rotY);
				const sinR = Math.sin(-rotY);
				const localX = worldX * cosR;
				const localZ = worldX * sinR;

				prevMouse3D.copy(mouse3D);
				mouse3D.set(localX, worldY, localZ);
				if (!mouseInited) {
					prevMouse3D.copy(mouse3D);
					mouseInited = true;
				}

				// Cursor velocity
				mouseVel.subVectors(mouse3D, prevMouse3D);
				smoothVel.lerp(mouseVel, 0.3);
				const cursorSpeed = smoothVel.length();


				const hitRadius = 1.4;
				const isMoving = cursorSpeed > 0.005;

				for (let i = 0; i < totalParticles; i++) {
					const i3 = i * 3;

					// Jitter
					const jx = Math.sin(time * jitterSpeed[i3] + jitterPhase[i3]) * jitterAmp[i3];
					const jy = Math.sin(time * jitterSpeed[i3 + 1] + jitterPhase[i3 + 1]) * jitterAmp[i3 + 1];
					const jz = Math.sin(time * jitterSpeed[i3 + 2] + jitterPhase[i3 + 2]) * jitterAmp[i3 + 2];

					const tx = originalPositions[i3] + jx;
					const ty = originalPositions[i3 + 1] + jy;
					const tz = originalPositions[i3 + 2] + jz;

					// Cursor impulse — works at all scroll stages
					if (isMoving) {
						const dx = posArr[i3] - mouse3D.x;
						const dy = posArr[i3 + 1] - mouse3D.y;
						const dist = Math.sqrt(dx * dx + dy * dy);

						if (dist < hitRadius) {
							const t = dist / hitRadius;
							const proximity = (1 - t) * (1 - t);
							const strength = Math.min(cursorSpeed, 0.92) * proximity;
							velocities[i3] += smoothVel.x * strength * 0.615;
							velocities[i3 + 1] += smoothVel.y * strength * 0.615;

							if (dist > 0.01) {
								velocities[i3] += (dx / dist) * strength * 0.077;
								velocities[i3 + 1] += (dy / dist) * strength * 0.077;
							}

							velocities[i3] += -dy / (dist + 0.5) * strength * 0.046;
							velocities[i3 + 1] += dx / (dist + 0.5) * strength * 0.046;
							velocities[i3 + 2] += (Math.random() - 0.5) * strength * 0.154;
						}
					}

					// Drag
					const drag = Math.pow(0.95, dt * 60);
					velocities[i3] *= drag;
					velocities[i3 + 1] *= drag;
					velocities[i3 + 2] *= drag;

					// Return to rest
					const returnRate = 1 - Math.pow(1 - 0.008, dt * 60);
					const currentX = posArr[i3] + velocities[i3];
					const currentY = posArr[i3 + 1] + velocities[i3 + 1];
					const currentZ = posArr[i3 + 2] + velocities[i3 + 2];

					posArr[i3] = lerp(currentX, tx, returnRate);
					posArr[i3 + 1] = lerp(currentY, ty, returnRate);
					posArr[i3 + 2] = lerp(currentZ, tz, returnRate);
				}


				geometry.attributes.position.needsUpdate = true;
				renderer.render(scene, camera);
				animFrame = requestAnimationFrame(animate);
			}

			animate();

			const cleanup = () => {
				unsubCursor();
				cancelAnimationFrame(animFrame);
				renderer.dispose();
				geometry.dispose();
				material.dispose();
				circleTexture.dispose();
			};

			(canvas as any).__cleanup = cleanup;
		});

		const handleResize = () => {
			if (!canvas) return;
			camera.aspect = canvas.clientWidth / canvas.clientHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(canvas.clientWidth, canvas.clientHeight);
		};
		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
			if ((canvas as any)?.__cleanup) {
				(canvas as any).__cleanup();
			} else {
				cancelAnimationFrame(animFrame);
				renderer.dispose();
			}
		};
	});
</script>

<section class="hero" aria-label="Hero section">
	<canvas bind:this={canvas} class="hero-canvas"></canvas>

	<div class="hero-content" style="opacity: {Math.max(0, 1 - currentScrollProgress * 5)}">
		<div class="hero-tags">
			{#each ['Databases', '·', 'Websites', '·', 'Automation', '·', 'Bots', '·', 'API'] as word}
				{#if word === '·'}
					<span class="tag-sep">·</span>
				{:else}
					<span class="tag">{#each word as char}<!-- svelte-ignore a11y_no_static_element_interactions --><span class="tag-char" on:mouseenter={(e) => e.currentTarget.classList.add('hop')} on:animationend={(e) => e.currentTarget.classList.remove('hop')}>{char}</span>{/each}</span>
				{/if}
			{/each}
		</div>
	</div>

	{#if currentScrollProgress < 0.05}
		<div class="scroll-indicator">
			<span>scroll to get in touch</span>
		</div>
	{/if}
</section>

<style>
	.hero {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
	}

	.hero-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 0;
	}

	.hero-content {
		position: relative;
		z-index: 1;
		text-align: center;
		margin-top: 150px;
	}

	.hero-tags {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.tag {
		font-family: var(--font-mono);
		font-size: clamp(11px, 1.4vw, 14px);
		color: var(--text-muted);
		letter-spacing: 0.05em;
	}

	.tag-char {
		display: inline-block;
		transition: color 0.2s ease;
		cursor: default;
	}

	:global(.tag-char.hop) {
		animation: tagHop 0.35s ease;
		color: var(--text-primary);
	}

	@keyframes tagHop {
		0%, 100% { transform: translateY(0); }
		40% { transform: translateY(-6px); }
		70% { transform: translateY(-2px); }
	}

	.tag-sep {
		color: var(--text-muted);
		opacity: 0.5;
	}

	.scroll-indicator {
		position: absolute;
		bottom: 40px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1;
		animation: pulse 2s ease-in-out infinite, float 2s ease-in-out infinite;
	}

	.scroll-indicator span {
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--text-muted);
		letter-spacing: 0.1em;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.6; }
		50% { opacity: 1; }
	}

	@keyframes float {
		0%, 100% { transform: translateX(-50%) translateY(0); }
		50% { transform: translateX(-50%) translateY(-5px); }
	}
</style>
