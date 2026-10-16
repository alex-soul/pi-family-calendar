import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainDescription } from '../src/lib/description.ts';
test('rich descriptions become readable text, preserving paragraphs, entities and link destinations', () => {
	assert.equal(
		plainDescription(
			'<p>Pack <b>lunch</b> &amp; water</p><p><a href="https://example.test/join">Join</a></p>'
		),
		'Pack lunch & water\n\nJoin (https://example.test/join)'
	);
	assert.equal(plainDescription('Bring < 3 bags & arrive > 9'), 'Bring < 3 bags & arrive > 9');
	assert.equal(plainDescription('<span title="a > b">Caf&eacute; &#128522;</span>'), 'Café 😊');
	assert.equal(
		plainDescription('<script>alert(1)</script><p>Hello<img src="bad" onerror="alert(1)"></p>'),
		'Hello'
	);
	assert.equal(
		plainDescription('&lt;img src=x&gt;'),
		'<img src=x>',
		'decoded text must remain escaped by the UI'
	);
});
