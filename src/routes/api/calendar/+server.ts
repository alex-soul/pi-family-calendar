import { error } from '@sveltejs/kit';
import { addDays, dateKey, isDateKey, monthGrid } from '#lib/dates.ts';
import { calendarProvider, timeZone } from '#lib/server/services.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const date = url.searchParams.get('date') || dateKey(new Date(), timeZone);
	if (!isDateKey(date) || date < '1900-01-01' || date > '2099-12-31')
		error(400, 'Choose a date between 1900 and 2099.');
	const grid = monthGrid(date);
	return Response.json(await calendarProvider.snapshot(grid[0], addDays(grid[41], 8), timeZone));
};
