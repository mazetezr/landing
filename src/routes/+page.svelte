<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { scrollProgress, hasScrolled } from '$lib/stores/scroll';

	import LoadingScreen from '$lib/components/LoadingScreen.svelte';
	import CustomCursor from '$lib/components/CustomCursor.svelte';
	import GridPulse from '$lib/components/GridPulse.svelte';
	import SoundToggle from '$lib/components/SoundToggle.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import ContactSection from '$lib/components/ContactSection.svelte';

	let loaded = false;
	let progress = 0;
	let showContact = false;

	const unsubs: Array<() => void> = [];

	unsubs.push(scrollProgress.subscribe(v => {
		progress = v;
		showContact = v >= 0.95;
	}));

	function onLoadComplete() {
		loaded = true;
	}

	onMount(() => {
		if (!browser) return;

		let targetProgress = 0;

		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();
			// Normalize deltaY across browsers/trackpads
			const raw = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
			const delta = Math.sign(raw) * Math.min(Math.abs(raw) * 0.0003, 0.03);
			targetProgress = Math.max(0, Math.min(1, targetProgress + delta));
			scrollProgress.set(targetProgress);
			if (targetProgress > 0) hasScrolled.set(true);
		};

		let touchStartY = 0;

		const handleTouchStart = (e: TouchEvent) => {
			touchStartY = e.touches[0].clientY;
		};

		const handleTouchMove = (e: TouchEvent) => {
			e.preventDefault();
			const diff = touchStartY - e.touches[0].clientY;
			touchStartY = e.touches[0].clientY;
			const delta = diff * 0.001;
			targetProgress = Math.max(0, Math.min(1, targetProgress + delta));
			scrollProgress.set(targetProgress);
			if (targetProgress > 0) hasScrolled.set(true);
		};

		window.addEventListener('wheel', handleWheel, { passive: false });
		window.addEventListener('touchstart', handleTouchStart, { passive: true });
		window.addEventListener('touchmove', handleTouchMove, { passive: false });

		return () => {
			window.removeEventListener('wheel', handleWheel);
			window.removeEventListener('touchstart', handleTouchStart);
			window.removeEventListener('touchmove', handleTouchMove);
		};
	});

	onDestroy(() => {
		unsubs.forEach(u => u());
	});
</script>

<svelte:head>
	<title>Edward — Fullstack Developer</title>
</svelte:head>

{#if !loaded}
	<LoadingScreen onComplete={onLoadComplete} />
{/if}

<CustomCursor />

<div class="top-controls">
	<SoundToggle />
</div>

<GridPulse />

<main class="main" class:loaded>
	<div class="hero-layer" style="opacity: {1 - Math.max(0, (progress - 0.8) * 5)}; pointer-events: {showContact ? 'none' : 'auto'}">
		<Hero />
	</div>

	<div class="contact-layer" style="opacity: {Math.max(0, (progress - 0.85) * 6.67)}; pointer-events: {showContact ? 'auto' : 'none'}">
		<ContactSection />
	</div>
</main>

<style>
	.top-controls {
		position: fixed;
		top: 20px;
		right: 80px;
		z-index: 200;
		display: flex;
		gap: 8px;
	}

	.main {
		position: fixed;
		inset: 0;
		z-index: 1;
	}

	.hero-layer, .contact-layer {
		position: absolute;
		inset: 0;
		transition: opacity 0.1s linear;
	}

	.contact-layer {
		z-index: 2;
	}

	@media (max-width: 768px) {
		.top-controls {
			right: 50px;
			top: 12px;
		}
	}
</style>
