import packageInfo from '../../../package.json' with { type: 'json' };

/** Local installation metadata only; never checks GitHub or exposes environment configuration. */
export function buildInfo() {
	const rawDate = process.env.APP_BUILD_DATE;
	const releaseChannel = process.env.APP_RELEASE_CHANNEL;
	return {
		version: packageInfo.version,
		revision: process.env.APP_REVISION || 'development',
		builtAt:
			rawDate && Number.isFinite(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : null,
		channel:
			releaseChannel === 'prerelease'
				? 'Prerelease'
				: releaseChannel === 'development' || packageInfo.version.includes('-dev')
					? 'Development'
					: packageInfo.version.includes('-')
						? 'Prerelease'
						: 'Release',
		runtime: process.version,
		platform: `${process.platform} / ${process.arch}`
	};
}
