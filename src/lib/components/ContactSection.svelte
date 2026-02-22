<script lang="ts">
	import { onMount } from 'svelte';
	import { playFocus, playSendSuccess, playSendError, playClick, playTypewriter } from '$lib/utils/audio';

	let formEl: HTMLFormElement;

	onMount(() => {
		const handleFocus = () => playFocus();
		const handleKeydown = () => playTypewriter();
		formEl?.addEventListener('focusin', handleFocus);
		formEl?.addEventListener('keydown', handleKeydown);
		return () => {
			formEl?.removeEventListener('focusin', handleFocus);
			formEl?.removeEventListener('keydown', handleKeydown);
		};
	});

	let projectName = '';
	let fullName = '';
	let email = '';
	let telegram = '';
	let whatsapp = '';
	let description = '';
	let budget = '';
	let timeline = '';

	let sending = false;
	let sent = false;
	let error = '';

	const WORKER_URL = 'https://tg-contact-proxy.edwardnikonor.workers.dev';

	function onBudgetInput(e: Event) {
		const input = e.target as HTMLInputElement;
		input.value = input.value.replace(/[^0-9]/g, '');
		budget = input.value;
	}

	async function handleSubmit() {
		error = '';

		if (!projectName || !fullName || !email || !description || !budget || !timeline) {
			error = 'Please fill in all required fields';
			return;
		}

		sending = true;

		try {
			const res = await fetch(WORKER_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					projectName, fullName, email, telegram,
					whatsapp, description, budget, timeline
				})
			});

			if (!res.ok) throw new Error('Failed to send');
			sent = true;
			playSendSuccess();
		} catch {
			error = 'Failed to send. Try emailing directly.';
			playSendError();
		} finally {
			sending = false;
		}
	}
</script>

<section class="contact">
	{#if sent}
		<div class="success">
			<div class="success-icon">✓</div>
			<h2>Request sent</h2>
			<p>I'll get back to you shortly.</p>
		</div>
	{:else}
		<h2 class="title">Get in touch</h2>

		<form class="form" bind:this={formEl} on:submit|preventDefault={handleSubmit}>
			<div class="row">
				<label class="field">
					<span class="label">Project Name <span class="req">*</span></span>
					<input type="text" bind:value={projectName} placeholder="e.g. Trading Bot" />
				</label>
				<label class="field">
					<span class="label">Full Name <span class="req">*</span></span>
					<input type="text" bind:value={fullName} placeholder="John Doe" />
				</label>
			</div>

			<div class="row">
				<label class="field">
					<span class="label">Email <span class="req">*</span></span>
					<input type="email" bind:value={email} placeholder="john@example.com" />
				</label>
				<label class="field">
					<span class="label">Telegram <span class="opt">(optional)</span></span>
					<input type="text" bind:value={telegram} placeholder="@username" />
				</label>
			</div>

			<div class="row">
				<label class="field">
					<span class="label">WhatsApp <span class="opt">(optional)</span></span>
					<input type="text" bind:value={whatsapp} placeholder="+1234567890" />
				</label>
				<label class="field">
					<span class="label">Budget ($) <span class="req">*</span></span>
					<input type="text" inputmode="numeric" value={budget} on:input={onBudgetInput} placeholder="5000" />
				</label>
			</div>

			<label class="field full">
				<span class="label">Project Description <span class="req">*</span></span>
				<textarea bind:value={description} rows="4" placeholder="Describe what you need built..."></textarea>
			</label>

			<label class="field full">
				<span class="label">Timeline <span class="req">*</span></span>
				<input type="text" bind:value={timeline} placeholder="e.g. 2 weeks, 1 month, flexible" />
			</label>

			{#if error}
				<p class="error">{error}</p>
			{/if}

			<button type="submit" class="submit" disabled={sending} on:click={() => playClick()}>
				{sending ? 'Sending...' : 'Send Request'}
			</button>
		</form>
	{/if}
</section>

<style>
	.contact {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		overflow-y: auto;
		padding: 40px 20px;
	}

	.title {
		font-family: var(--font-mono);
		font-size: clamp(20px, 3vw, 28px);
		font-weight: 400;
		color: var(--aurora-cyan);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		margin-bottom: 32px;
	}

	.form {
		width: 100%;
		max-width: 600px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field.full {
		grid-column: 1 / -1;
	}

	.label {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--text-secondary);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.req {
		color: var(--aurora-cyan);
	}

	.opt {
		color: var(--text-muted);
		font-size: 10px;
		text-transform: none;
	}

	input, textarea {
		font-family: var(--font-mono);
		font-size: 14px;
		color: var(--text-primary);
		background: transparent;
		border: 1px solid var(--text-muted);
		border-radius: 6px;
		padding: 10px 12px;
		outline: none;
		transition: border-color 0.2s ease, box-shadow 0.2s ease;
	}

	input:focus, textarea:focus {
		border-color: var(--aurora-cyan);
		box-shadow: 0 0 12px rgba(0, 212, 255, 0.1);
	}

	input::placeholder, textarea::placeholder {
		color: var(--text-muted);
		opacity: 0.5;
	}

	textarea {
		resize: vertical;
		min-height: 80px;
	}

	.error {
		font-family: var(--font-mono);
		font-size: 12px;
		color: #ff4466;
	}

	.submit {
		font-family: var(--font-mono);
		font-size: 14px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--aurora-cyan);
		background: transparent;
		border: 1px solid var(--aurora-cyan);
		border-radius: 8px;
		padding: 14px 32px;
		margin-top: 8px;
		transition: background 0.3s ease, box-shadow 0.3s ease, color 0.3s ease;
		align-self: center;
	}

	.submit:hover:not(:disabled) {
		background: rgba(0, 212, 255, 0.08);
		box-shadow: 0 0 24px rgba(0, 212, 255, 0.2);
	}

	.submit:disabled {
		opacity: 0.5;
	}

	.success {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.success-icon {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: 2px solid var(--aurora-cyan);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 24px;
		color: var(--aurora-cyan);
	}

	.success h2 {
		font-family: var(--font-mono);
		font-size: 20px;
		color: var(--text-primary);
		font-weight: 400;
	}

	.success p {
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--text-secondary);
	}

	@media (max-width: 600px) {
		.row {
			grid-template-columns: 1fr;
		}
	}
</style>
