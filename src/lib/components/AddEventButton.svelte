<script lang="ts">
	import Icon from './Icon.svelte';
	import { dateLabel } from '../dates.ts';
	let { date, onadd }: { date: string; onadd: (date: string) => void } = $props();
</script>

<button
	class="icon-button add-circle event-add"
	aria-label={`Add event on ${dateLabel(date, { day: 'numeric', month: 'long', year: 'numeric' })}`}
	onclick={() => onadd(date)}><Icon name="plus" size={20} /></button
>
