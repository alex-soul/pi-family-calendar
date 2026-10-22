import type { NoteCategory } from './domain.ts';
import { categoryIconPaths } from './category-icons.ts';
export const categoryColors = ['#a76a53', '#8b6bb1', '#4f8b81', '#597ca8', '#a57c36', '#aa637e'];
export const categoryIcons = [
	'',
	'calendar',
	'sun',
	'home',
	'note',
	'gift',
	'star',
	'heart',
	...Object.keys(categoryIconPaths)
];
export const generalCategory: NoteCategory = {
	id: 'general',
	name: 'General',
	color: '',
	icon: '',
	version: 1
};
