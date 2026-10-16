<script lang="ts">
	import { untrack } from 'svelte';
	let {
		calendar,
		busy,
		onsave
	}: {
		calendar: {
			id: string;
			name: string;
			color: string;
			sourceName: string;
			sourceColor: string;
			displayName: string;
			displayColor: string | null;
		};
		busy: boolean;
		onsave: (name: string, color: string | null) => Promise<boolean | undefined>;
	} = $props();
	let name = $state(untrack(() => calendar.displayName));
	let color = $state(untrack(() => calendar.color));
	let customColor = $state(untrack(() => calendar.displayColor !== null));
	let saved = $state(false);
	async function save(reset = false) {
		saved = false;
		if (await onsave(reset ? '' : name, reset || !customColor ? null : color)) {
			saved = true;
			name = calendar.displayName;
			color = calendar.color;
			customColor = calendar.displayColor !== null;
		}
	}
</script>

<form
	class="calendar-appearance"
	onsubmit={(event) => {
		event.preventDefault();
		void save();
	}}
>
	<div class="calendar-appearance-preview" style:--calendar-color={color}>
		<strong>{name.trim() || calendar.sourceName}</strong>
		<span>Google: {calendar.sourceName}</span>
	</div>
	<div class="calendar-appearance-fields">
		<label
			>Friendly name<input
				bind:value={name}
				oninput={() => (saved = false)}
				placeholder={calendar.sourceName}
				maxlength="80"
				disabled={busy}
			/></label
		>
		<label class="calendar-colour-field"
			>Colour<input
				type="color"
				bind:value={color}
				oninput={() => {
					customColor = true;
					saved = false;
				}}
				disabled={busy}
			/></label
		>
	</div>
	<div class="form-actions">
		<button class="primary-button" type="submit" disabled={busy}>Save appearance</button>
		<button type="button" disabled={busy} onclick={() => save(true)}>Use Google defaults</button>
	</div>
	{#if saved}<p class="calendar-appearance-saved" role="status">Saved for all screens.</p>{/if}
</form>
