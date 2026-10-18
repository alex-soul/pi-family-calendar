<script lang="ts">
	import Icon from './Icon.svelte';
	let {
		month,
		onprevious,
		onnext
	}: {
		month: boolean;
		onprevious: () => void;
		onnext: () => void;
	} = $props();
</script>

<nav class="header-date-nav" aria-label="Date navigation">
	<button
		class="icon-button"
		aria-label={month ? 'Previous month' : 'Previous dates'}
		title="Previous"
		onclick={onprevious}><Icon name="left" /></button
	>
	<button
		class="icon-button"
		aria-label={month ? 'Next month' : 'Next dates'}
		title="Next"
		onclick={onnext}><Icon name="right" /></button
	>
</nav>
