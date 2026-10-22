<script lang="ts">
	import { tick } from 'svelte';
	import { dateKey, dateLabel, isDateKey, monthGrid } from '../dates.ts';
	import Icon from './Icon.svelte';
	let {
		id,
		type,
		value = $bindable(''),
		required = false,
		min,
		max,
		label
	}: {
		id: string;
		type: 'date' | 'time';
		value?: string;
		required?: boolean;
		min?: string;
		max?: string;
		label: string;
	} = $props();
	let panel: HTMLDivElement;
	let trigger: HTMLButtonElement;
	let input: HTMLInputElement;
	let open = $state(false),
		x = $state(8),
		y = $state(8);
	let month = $state('2026-01-01');
	let hour = $state('00'),
		minute = $state('00');
	const panelId = $props.id();
	const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
	const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
	let days = $derived(monthGrid(month).filter(isDateKey));
	const allowed = (v: string) => (!min || v >= min) && (!max || v <= max);
	function close() {
		panel.hidePopover();
		trigger.focus();
	}
	function choose(v: string) {
		value = v;
		close();
	}
	async function prepare() {
		const today = dateKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
		const initial = value || (min && today < min ? min : max && today > max ? max : today);
		if (type === 'date') {
			const bounded =
				initial < '1900-01-01' ? '1900-01-01' : initial > '9999-12-31' ? '9999-12-31' : initial;
			month = `${bounded.slice(0, 7)}-01`;
		}
		[hour, minute] = (value || '09:00').split(':');
		await tick();
		const anchor = trigger.getBoundingClientRect();
		x = Math.max(8, Math.min(anchor.right - panel.offsetWidth, innerWidth - panel.offsetWidth - 8));
		y = Math.max(8, Math.min(anchor.bottom + 6, innerHeight - panel.offsetHeight - 8));
		if (type === 'time')
			panel
				.querySelectorAll('[aria-pressed="true"]')
				.forEach((el) => el.scrollIntoView({ block: 'nearest' }));
	}
	function shiftMonth(delta: number) {
		const next = new Date(`${month}T12:00:00Z`);
		next.setUTCMonth(next.getUTCMonth() + delta);
		const year = next.getUTCFullYear();
		if (year >= 1900 && year <= 9999) month = next.toISOString().slice(0, 10);
	}
</script>

<svelte:window onresize={() => panel?.hidePopover()} />
<div class="date-time-field">
	<input bind:this={input!} {id} {type} bind:value {required} {min} {max} />
	{#if value && !required}<button
			type="button"
			class="field-action"
			aria-label={`Clear ${type}`}
			onclick={() => {
				value = '';
				input.focus();
			}}><Icon name="close" size={18} /></button
		>{/if}
	<button
		bind:this={trigger!}
		type="button"
		class="field-action"
		popovertarget={panelId}
		aria-label={`Choose ${label}`}
		aria-haspopup="dialog"
		aria-expanded={open}><Icon name={type === 'date' ? 'calendar' : 'clock'} size={19} /></button
	>
</div>
<div
	bind:this={panel!}
	id={panelId}
	class="picker"
	popover="auto"
	role="dialog"
	aria-label={`Choose ${label}`}
	style:left={`${x}px`}
	style:top={`${y}px`}
	ontoggle={(event) => {
		open = event.newState === 'open';
		if (open) void prepare();
	}}
>
	<header>
		<strong>{type === 'date' ? dateLabel(month, { month: 'long', year: 'numeric' }) : label}</strong
		><button type="button" class="field-action" aria-label="Close picker" onclick={close}
			><Icon name="close" size={18} /></button
		>
	</header>
	{#if type === 'date'}
		<div class="month-nav">
			<button
				type="button"
				aria-label="Previous month"
				disabled={month === '1900-01-01'}
				onclick={() => shiftMonth(-1)}><Icon name="left" size={18} /></button
			><button
				type="button"
				onclick={() => {
					month = `${dateKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone).slice(0, 7)}-01`;
				}}>This month</button
			><button
				type="button"
				aria-label="Next month"
				disabled={month === '9999-12-01'}
				onclick={() => shiftMonth(1)}><Icon name="right" size={18} /></button
			>
		</div>
		<div class="dates">
			{#each ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as day}<span class="weekday">{day}</span
				>{/each}
			{#each days as day}<button
					type="button"
					class:outside={day.slice(0, 7) !== month.slice(0, 7)}
					aria-label={dateLabel(day, {
						weekday: 'long',
						day: 'numeric',
						month: 'long',
						year: 'numeric'
					})}
					aria-pressed={value === day}
					disabled={!allowed(day) || day < '1900-01-01' || day > '9999-12-31'}
					onclick={() => choose(day)}>{Number(day.slice(8))}</button
				>{/each}
		</div>
	{:else}
		<div class="time-headings"><span>Hour</span><span>Minute</span></div>
		<div class="time-columns">
			<div role="group" aria-label="Hour">
				{#each hours as h}<button
						type="button"
						aria-label={`${h} hours`}
						aria-pressed={hour === h}
						onclick={() => (hour = h)}>{h}</button
					>{/each}
			</div>
			<div role="group" aria-label="Minute">
				{#each minutes as m}<button
						type="button"
						aria-label={`${m} minutes`}
						aria-pressed={minute === m}
						onclick={() => (minute = m)}>{m}</button
					>{/each}
			</div>
		</div>
		<footer>
			<span class="chosen-time">{hour}:{minute}</span><button
				type="button"
				class="primary-button"
				disabled={!allowed(`${hour}:${minute}`)}
				onclick={() => choose(`${hour}:${minute}`)}>Done</button
			>
		</footer>
	{/if}
</div>

<style>
	.date-time-field {
		display: flex;
		align-items: center;
		width: 100%;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface-raised);
	}
	.date-time-field:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	input {
		flex: 1;
		width: 0;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--text);
	}
	input:focus {
		outline: none;
	}
	input::-webkit-calendar-picker-indicator {
		display: none;
	}
	.field-action {
		flex: none;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 0;
		color: var(--accent);
	}
	.picker {
		position: fixed;
		inset: auto;
		margin: 0;
		width: 340px;
		max-width: calc(100vw - 16px);
		max-height: calc(100dvh - 16px);
		overflow: auto;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 16px;
		background: var(--panel);
		color: var(--text);
		box-shadow: var(--shadow);
	}
	header,
	footer,
	.month-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	header strong {
		font-size: 17px;
	}
	.month-nav {
		margin: 4px 0 8px;
	}
	.dates {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 2px;
	}
	.dates button {
		padding: 0;
		min-width: 0;
		min-height: 40px;
		font-variant-numeric: tabular-nums;
	}
	.weekday {
		padding: 6px 0;
		text-align: center;
		font-size: 12px;
		color: var(--muted);
	}
	.outside {
		color: var(--muted);
	}
	button[aria-pressed='true'] {
		background: var(--accent);
		color: var(--bg);
	}
	button:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.time-headings,
	.time-columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		text-align: center;
	}
	.time-headings {
		color: var(--muted);
		font-size: 13px;
		margin: 8px 0;
	}
	.time-columns > div {
		height: min(240px, 40dvh);
		overflow-y: auto;
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 4px;
		background: var(--surface);
		scrollbar-color: var(--muted) var(--surface);
	}
	.time-columns button {
		display: block;
		width: 100%;
		font-variant-numeric: tabular-nums;
	}
	footer {
		margin-top: 12px;
	}
	.chosen-time {
		font-size: 22px;
		font-variant-numeric: tabular-nums;
		padding-left: 10px;
	}
</style>
