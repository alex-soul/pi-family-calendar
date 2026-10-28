<script lang="ts">
	let {
		id,
		label,
		value = $bindable(''),
		legacy = false,
		autocomplete = 'current-password'
	}: {
		id: string;
		label: string;
		value?: string;
		legacy?: boolean;
		autocomplete?: 'current-password' | 'new-password';
	} = $props();
	let longer = $state(false);
	let focused = $state(false);
	let position = $state(0);
	$effect(() => {
		if (!value) position = 0;
	});
	function update(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		input.value = input.value.replace(/[^0-9]/g, '').slice(0, longer ? 12 : 6);
		value = input.value;
		position = input.selectionStart ?? value.length;
	}
</script>

<label for={id}>{label}</label>
<div class="pin-entry" class:longer>
	<input
		{id}
		type="password"
		inputmode="numeric"
		{autocomplete}
		required
		minlength="6"
		maxlength={longer ? 12 : 6}
		pattern={longer ? '[0-9]{6,12}' : '[0-9]{6}'}
		{value}
		oninput={update}
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
		onselect={(event) => (position = event.currentTarget.selectionStart ?? 0)}
		aria-label={label}
	/>
	{#if !longer}<div class="pin-boxes" aria-hidden="true">
			{#each Array(6) as _, i}<span class:active={focused && i === Math.min(position, 5)}
					>{value[i] ? '●' : ''}</span
				>{/each}
		</div>{/if}
</div>
{#if legacy}<button
		class="pin-legacy"
		type="button"
		onclick={() => {
			longer = !longer;
			value = '';
			position = 0;
		}}
	>
		{longer ? 'Use six-digit PIN' : 'Use a longer PIN'}
	</button>{/if}

<style>
	.pin-entry {
		position: relative;
		width: min(100%, 324px);
		height: 48px;
		margin: 8px 0 14px;
	}
	.pin-entry input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		z-index: 1;
		opacity: 0;
		cursor: text;
	}
	.pin-boxes {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 7px;
		height: 100%;
	}
	.pin-boxes span {
		display: grid;
		place-items: center;
		background: var(--surface-raised);
		border: 1px solid var(--line);
		border-radius: 7px;
		font-size: 18px;
	}
	.pin-boxes span.active {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--control-edge);
	}
	.pin-entry.longer input {
		opacity: 1;
	}
	.pin-legacy {
		font-size: 12px;
		color: var(--muted);
		padding: 3px 0;
		min-height: 30px;
		margin: -8px 0 12px;
	}
</style>
