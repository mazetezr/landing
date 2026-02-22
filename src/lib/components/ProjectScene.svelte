<script lang="ts">
	import { onMount } from 'svelte';

	export let title: string;
	export let subtitle: string;
	export let tags: string[];
	export let hint: string;
	export let active: boolean = false;

	let visible = false;
	let titleVisible = false;
	let sceneVisible = false;
	let hintVisible = false;

	$: if (active && !visible) {
		visible = true;
		setTimeout(() => titleVisible = true, 300);
		setTimeout(() => sceneVisible = true, 500);
		setTimeout(() => hintVisible = true, 1200);
	}

	$: if (!active) {
		visible = false;
		titleVisible = false;
		sceneVisible = false;
		hintVisible = false;
	}
</script>

<div class="project-scene" class:active>
	<div class="scene-header" class:visible={titleVisible}>
		<div class="scene-meta">
			<h2 class="scene-title">{title}</h2>
			<p class="scene-subtitle">{subtitle}</p>
		</div>
		<div class="scene-tags">
			{#each tags as tag}
				<span class="scene-tag">{tag}</span>
			{/each}
		</div>
	</div>

	<div class="scene-content" class:visible={sceneVisible}>
		<slot />
	</div>

	<div class="scene-hint" class:visible={hintVisible}>
		<span>{hint}</span>
	</div>
</div>

<style>
	.project-scene {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		padding: 24px 60px 24px 24px;
	}

	.scene-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
		padding: 16px 0;
		opacity: 0;
		transform: translateY(20px);
		transition: opacity 0.6s ease, transform 0.6s ease;
		z-index: 2;
		position: relative;
	}

	.scene-header.visible {
		opacity: 1;
		transform: translateY(0);
	}

	.scene-meta {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.scene-title {
		font-size: clamp(20px, 3vw, 32px);
		font-weight: 700;
		color: var(--text-primary);
	}

	.scene-subtitle {
		font-size: clamp(12px, 1.5vw, 16px);
		color: var(--text-secondary);
		font-weight: 300;
	}

	.scene-tags {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: center;
	}

	.scene-tag {
		font-family: var(--font-mono);
		font-size: 11px;
		padding: 3px 10px;
		border-radius: 20px;
		background: rgba(0, 212, 255, 0.08);
		color: var(--aurora-cyan);
		border: 1px solid rgba(0, 212, 255, 0.15);
		letter-spacing: 0.03em;
	}

	.scene-content {
		flex: 1;
		position: relative;
		opacity: 0;
		transform: scale(0.95);
		transition: opacity 0.8s ease, transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
		z-index: 1;
		overflow: hidden;
		border-radius: 12px;
	}

	.scene-content.visible {
		opacity: 1;
		transform: scale(1);
	}

	.scene-hint {
		text-align: center;
		padding: 12px 0;
		opacity: 0;
		transition: opacity 0.6s ease;
		z-index: 2;
		position: relative;
	}

	.scene-hint.visible {
		opacity: 1;
	}

	.scene-hint span {
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--text-muted);
		letter-spacing: 0.05em;
	}

	@media (max-width: 768px) {
		.project-scene {
			padding: 16px 40px 16px 16px;
		}
	}
</style>
