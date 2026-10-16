<script lang="ts">
	import { seconds } from '#lib/inactivity.ts';
	import Modal from './Modal.svelte';
	let {
		timeZone,
		source,
		theme = $bindable(),
		resetScrollSeconds = $bindable(),
		returnTodaySeconds = $bindable(),
		onclose
	}: {
		timeZone: string;
		source: string;
		theme: 'dark' | 'warm';
		resetScrollSeconds: number | undefined;
		returnTodaySeconds: number | undefined;
		onclose: () => void;
	} = $props();
</script>

<Modal title="Display settings" {onclose}>
	<p class="menu-context">
		These preferences belong to this browser. Changing them on your phone will not change the Pi
		display.
	</p>
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
				aria-describedby="idle-help"
			/><span>sec</span>
			<label for="return-today">Return to Today</label><input
				id="return-today"
				type="number"
				min="1"
				step="1"
				inputmode="numeric"
				bind:value={returnTodaySeconds}
				onchange={() => (returnTodaySeconds = seconds(returnTodaySeconds))}
				aria-describedby="idle-help"
			/><span>sec</span>
		</div>
		<p id="idle-help" class="management-hint">
			Leave a field blank to disable it. The menu button and expanded all-day rows reset after 15
			seconds.
		</p>
	</section>
	<p class="menu-footnote">Saved automatically · Time zone: {timeZone}</p>
</Modal>
