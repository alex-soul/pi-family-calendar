<script lang="ts">
	let { value, instant }: { value: string; instant: string } = $props();
	let parts = $derived(value.split(':'));
</script>

<time class="digital-clock" datetime={instant} aria-label={value}>
	<span class="clock-main" aria-hidden="true"
		>{parts[0]}<span class="clock-colon">:</span>{parts[1]}</span
	>
	<span class="clock-seconds" aria-hidden="true"
		>{parts[2]}<span class="seconds-track"
			><span style:width={`${(Number(parts[2]) / 59) * 100}%`}></span></span
		></span
	>
</time>

<style>
	.digital-clock {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 54px;
		font-family: 'Bahnschrift', 'SFMono-Regular', Consolas, monospace;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.clock-main {
		font-size: 44px;
		font-weight: 600;
		letter-spacing: -2px;
		line-height: 1;
		text-shadow: 0 0 20px color-mix(in srgb, var(--accent) 18%, transparent);
	}
	.clock-colon {
		color: var(--accent);
		font-weight: 400;
	}
	.clock-seconds {
		position: relative;
		font-size: 25px;
		font-weight: 500;
		letter-spacing: 1px;
		line-height: 1;
		color: var(--accent);
		background: linear-gradient(145deg, var(--accent-soft), transparent);
		border: 1px solid var(--control-edge);
		border-radius: 9px;
		padding: 7px 7px 10px;
	}
	.seconds-track {
		position: absolute;
		bottom: 4px;
		left: 7px;
		right: 7px;
		height: 2px;
		border-radius: 2px;
		background: var(--line);
		overflow: hidden;
	}
	.seconds-track span {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	@media (max-width: 600px) {
		.digital-clock {
			gap: 6px;
		}
		.clock-main {
			font-size: 34px;
		}
		.clock-seconds {
			font-size: 20px;
			padding: 6px 5px 9px;
		}
	}
	@media (max-width: 380px) {
		.clock-main {
			font-size: 30px;
		}
		.clock-seconds {
			font-size: 18px;
		}
	}
</style>
