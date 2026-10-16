<script lang="ts">
	import type { Calendar } from '../domain.ts';
	import Modal from './Modal.svelte';
	import Icon from './Icon.svelte';
	let {
		calendars,
		hidden = $bindable(),
		onclose
	}: { calendars: Calendar[]; hidden: string[]; onclose: () => void } = $props();
</script>

<Modal title="Calendars on this screen" {onclose}>
	<p class="menu-context">Choose what you see here. Other screens keep their own selection.</p>
	<div class="calendar-options">
		{#each calendars as calendar}<button
				class="calendar-option"
				role="checkbox"
				aria-checked={!hidden.includes(calendar.id)}
				onclick={() =>
					(hidden = hidden.includes(calendar.id)
						? hidden.filter((id) => id !== calendar.id)
						: [...hidden, calendar.id])}
				><span class="calendar-label" style:--calendar-color={calendar.color}>{calendar.name}</span
				><span class="checkbox"
					>{#if !hidden.includes(calendar.id)}<Icon name="check" size={18} />{/if}</span
				></button
			>{:else}<p class="muted">No calendars connected.</p>{/each}
	</div>
	<p class="menu-footnote">Saved automatically for this browser.</p>
</Modal>
