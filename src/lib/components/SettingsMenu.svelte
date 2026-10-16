<script lang="ts">
	import { seconds } from '#lib/inactivity.ts';
	import type { Calendar } from '../domain.ts';
	import CalendarOptions from './CalendarOptions.svelte';
	import Modal from './Modal.svelte';
	let {
		calendars,
		hidden = $bindable(),
		theme = $bindable(),
		resetScrollSeconds = $bindable(),
		returnTodaySeconds = $bindable(),
		onclose
	}: {
		calendars: Calendar[];
		hidden: string[];
		theme: 'dark' | 'warm';
		resetScrollSeconds: number | undefined;
		returnTodaySeconds: number | undefined;
		onclose: () => void;
	} = $props();
</script>

<Modal title="Display settings" {onclose}>
	<section class="settings-section">
		<h3>Calendars on this screen</h3>
		<CalendarOptions {calendars} bind:hidden />
	</section>
	<section class="settings-section">
		<h3>Appearance</h3>
		<div class="theme-options">
			<button
				class:chosen={theme === 'warm'}
				onclick={() => (theme = 'warm')}
				aria-pressed={theme === 'warm'}><span class="theme-swatch warm"></span>Warm</button
			>
			<button
				class:chosen={theme === 'dark'}
				onclick={() => (theme = 'dark')}
				aria-pressed={theme === 'dark'}><span class="theme-swatch dark"></span>Dark</button
			>
		</div>
	</section>
	<section class="settings-section">
		<h3>When left idle</h3>
		<div class="inactivity-options">
			<label for="reset-scroll">Reset scroll</label><input
				id="reset-scroll"
				type="number"
				min="1"
				step="1"
				inputmode="numeric"
				bind:value={resetScrollSeconds}
				onchange={() => (resetScrollSeconds = seconds(resetScrollSeconds))}
			/><span>sec</span>
			<label for="return-today">Return to Today</label><input
				id="return-today"
				type="number"
				min="1"
				step="1"
				inputmode="numeric"
				bind:value={returnTodaySeconds}
				onchange={() => (returnTodaySeconds = seconds(returnTodaySeconds))}
			/><span>sec</span>
		</div>
	</section>
</Modal>
