<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '#lib/api.ts';
	import type { Reminder } from '#lib/domain.ts';
	import ReminderEditor from '#lib/components/ReminderEditor.svelte';
	import Icon from '#lib/components/Icon.svelte';
	let token = $state(''),
		defaultDate = $state<string | null>(null),
		reminder = $state<Reminder | null>(null),
		status = $state<'loading' | 'form' | 'saved' | 'deleted' | 'done' | 'error'>('loading'),
		failure = $state(''),
		sequence = $state(0),
		expires = $state(0);
	const key = 'reminder-qr-session';
	const editorTitle = $derived(
		reminder
			? reminder.repeat || reminder.preview
				? 'Edit template'
				: 'Edit reminder'
			: 'Add reminder'
	);
	function storedToken() {
		try {
			return sessionStorage.getItem(key);
		} catch {
			return null;
		}
	}
	function remember(value: string) {
		try {
			if (value) sessionStorage.setItem(key, value);
			else sessionStorage.removeItem(key);
		} catch {
			/* Editing still works without browser storage. */
		}
	}
	let opening = 0;
	onMount(() => {
		async function start() {
			const request = ++opening;
			failure = '';
			const scan = location.hash.slice(1);
			if (scan) {
				remember('');
				token = '';
				status = 'loading';
			}
			history.replaceState(null, '', location.pathname);
			try {
				const stored = storedToken();
				const result = scan
					? await api<{
							token: string;
							reminder: Reminder | null;
							expires: number;
							defaultDate: string | null;
						}>('/api/qr/session', { method: 'POST', body: JSON.stringify({ token: scan }) })
					: stored
						? {
								...(await api<{
									reminder: Reminder | null;
									expires: number;
									defaultDate: string | null;
								}>('/api/qr/reminder', {
									headers: { Authorization: `Bearer ${stored}` }
								})),
								token: stored
							}
						: null;
				if (request !== opening) return;
				if (!result) throw new Error('Scan a QR code on your calendar.');
				sequence++;
				token = result.token;
				reminder = result.reminder;
				defaultDate = result.defaultDate;
				expires = result.expires;
				remember(token);
				status = 'form';
			} catch (cause) {
				if (request !== opening) return;
				failure = (cause as Error).message;
				status = 'error';
			}
		}
		void start();
		const changed = () => {
			if (location.hash) void start();
		};
		window.addEventListener('hashchange', changed);
		return () => window.removeEventListener('hashchange', changed);
	});
	async function finish() {
		try {
			if (token)
				await api('/api/qr/session', {
					method: 'DELETE',
					headers: { Authorization: `Bearer ${token}` }
				});
			remember('');
			token = '';
			status = 'done';
			failure = '';
		} catch (cause) {
			failure = (cause as Error).message;
		}
	}
	function another() {
		if (Date.now() >= expires) {
			failure = 'Access ended. Scan a new QR code.';
			status = 'error';
			return;
		}
		sequence++;
		status = 'form';
	}
</script>

<svelte:head
	><title>{editorTitle} - Family Calendar</title><meta
		name="robots"
		content="noindex, nofollow"
	/></svelte:head
>
<main class="qr-mobile-page">
	<div class="qr-brand"><Icon name="calendar" size={22} /><span>Family Calendar</span></div>
	<section class="qr-mobile-card">
		{#if status === 'form'}
			<h1>{editorTitle}</h1>
			{#key sequence}<ReminderEditor
					inline
					{reminder}
					{defaultDate}
					qrToken={token}
					onsaved={() => {
						status = 'saved';
						failure = '';
					}}
					onremoved={() => {
						status = 'deleted';
						failure = '';
					}}
					onclose={finish}
				/>{/key}
		{:else if status === 'saved' || status === 'deleted'}
			<div class="qr-confirmation" role="status">
				<span class="qr-success"><Icon name="check" size={34} /></span>
				<h1>
					{status === 'deleted' ? 'Note deleted' : reminder ? 'Reminder updated' : 'Reminder added'}
				</h1>
			</div>
			<div class="qr-next-actions">
				{#if !reminder}<button class="primary-button" onclick={another}
						><Icon name="plus" size={20} />Add another reminder</button
					>{/if}<button onclick={finish}>Done</button>
			</div>
		{:else if status === 'done'}<div class="qr-confirmation">
				<span class="qr-success"><Icon name="check" size={34} /></span>
				<h1>All done</h1>
			</div>
		{:else if status === 'loading'}<p role="status">Opening reminder…</p>
		{:else}<h1>Scan again</h1>{/if}
		{#if failure}<p class="error-message" role="alert">{failure}</p>{/if}
	</section>
</main>
