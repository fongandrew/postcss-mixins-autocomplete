import * as assert from 'assert';
import * as path from 'path';
import { Uri } from 'vscode';
import { beforeEach, describe, it } from 'mocha';
import { MixinExtractor, MixinCompletionProvider, FileSystem } from './extension';

class MockFileSystem implements FileSystem {
	private files = new Map<string, string>();

	setFile(path: string, content: string) {
		this.files.set(path, content);
	}

	async readFile(path: string): Promise<Buffer> {
		const content = this.files.get(path);
		if (content === undefined) {
			throw new Error(`File not found: ${path}`);
		}
		return Buffer.from(content);
	}
}

describe('MixinExtractor', () => {
	let fileSystem: MockFileSystem;
	let extractor: MixinExtractor;

	beforeEach(() => {
		fileSystem = new MockFileSystem();
		extractor = new MixinExtractor(fileSystem);
	});

	describe('extractMixinNames', () => {
		it('extracts mixin names from content', () => {
			const content = `
				@define-mixin button {
					padding: 10px;
				}
				@define-mixin card {
					border: 1px solid black;
				}
			`;
			const mixins = extractor.extractMixinNames(content);
			assert.deepStrictEqual(mixins, ['button', 'card']);
		});

		it('handles mixin names with hyphens and numbers', () => {
			const content = `
				@define-mixin button-primary {
					color: blue;
				}
				@define-mixin card2 {
					margin: 10px;
				}
			`;
			const mixins = extractor.extractMixinNames(content);
			assert.deepStrictEqual(mixins, ['button-primary', 'card2']);
		});

		it('ignores invalid mixin names', () => {
			const content = `
				@define-mixin 2invalid {
					color: red;
				}
				@define-mixin valid-name {
					color: blue;
				}
			`;
			const mixins = extractor.extractMixinNames(content);
			assert.deepStrictEqual(mixins, ['valid-name']);
		});
	});

	describe('updateMixinsForFile', () => {
		it('updates mixins for a file', async () => {
			const filePath = '/test/style.css';
			const content = `
				@define-mixin button {
					padding: 10px;
				}
			`;
			fileSystem.setFile(filePath, content);
			await extractor.updateMixinsForFile(filePath);
			assert.deepStrictEqual(extractor.items(), ['button']);
		});

		it('handles multiple files', async () => {
			const file1 = '/test/style1.css';
			const file2 = '/test/style2.css';

			fileSystem.setFile(file1, '@define-mixin button { padding: 10px; }');
			fileSystem.setFile(file2, '@define-mixin card { margin: 10px; }');

			await extractor.updateMixinsForFile(file1);
			await extractor.updateMixinsForFile(file2);

			assert.deepStrictEqual(extractor.items().sort(), ['button', 'card']);
		});

		it('updates existing file mixins', async () => {
			const filePath = '/test/style.css';

			fileSystem.setFile(filePath, '@define-mixin button { padding: 10px; }');
			await extractor.updateMixinsForFile(filePath);
			assert.deepStrictEqual(extractor.items(), ['button']);

			fileSystem.setFile(filePath, '@define-mixin card { margin: 10px; }');
			await extractor.updateMixinsForFile(filePath);
			assert.deepStrictEqual(extractor.items(), ['card']);
		});
	});

	describe('removeMixinsForFile', () => {
		it('removes mixins for a specific file', async () => {
			const file1 = '/test/style1.css';
			const file2 = '/test/style2.css';

			fileSystem.setFile(file1, '@define-mixin button { padding: 10px; }');
			fileSystem.setFile(file2, '@define-mixin card { margin: 10px; }');

			await extractor.updateMixinsForFile(file1);
			await extractor.updateMixinsForFile(file2);
			await extractor.removeMixinsForFile(file1);

			assert.deepStrictEqual(extractor.items(), ['card']);
		});
	});

	describe('reset', () => {
		it('clears all mixins', async () => {
			const filePath = '/test/style.css';
			fileSystem.setFile(filePath, '@define-mixin button { padding: 10px; }');
			await extractor.updateMixinsForFile(filePath);
			extractor.reset();
			assert.deepStrictEqual(extractor.items(), []);
		});
	});
});

describe('MixinCompletionProvider', () => {
	let fileSystem: MockFileSystem;
	let extractor: MixinExtractor;
	let provider: MixinCompletionProvider;

	beforeEach(() => {
		fileSystem = new MockFileSystem();
		extractor = new MixinExtractor(fileSystem);
		provider = new MixinCompletionProvider(extractor);
	});

	it('provides completion items for available mixins', async () => {
		const file = '/test/style.css';
		fileSystem.setFile(
			file,
			`
			@define-mixin button { padding: 10px; }
			@define-mixin button-primary { color: blue; }
			@define-mixin card { margin: 10px; }
		`,
		);
		await extractor.updateMixinsForFile(file);

		const document = {
			lineAt: (_line: number) => ({
				text: '@mixin ',
				range: { start: { character: 0 }, end: { character: 7 } },
			}),
			uri: Uri.file(path.resolve(file)),
		};

		const position = { line: 0, character: 7 };
		const completionItems = await provider.provideCompletionItems(
			document as any,
			position as any,
		);

		assert.strictEqual(completionItems?.length, 3);
		assert.strictEqual(completionItems?.[0].label, 'button');
		assert.strictEqual(completionItems?.[1].label, 'button-primary');
		assert.strictEqual(completionItems?.[2].label, 'card');
		assert.strictEqual(completionItems?.[0].detail, 'PostCSS Mixin');
	});

	it('returns undefined when not after @mixin', async () => {
		const file = '/test/style.css';
		fileSystem.setFile(file, '@define-mixin button { padding: 10px; }');
		await extractor.updateMixinsForFile(file);

		const document = {
			lineAt: (_line: number) => ({
				text: '.some-class { ',
				range: { start: { character: 0 }, end: { character: 13 } },
			}),
			uri: Uri.file(path.resolve(file)),
		};

		const position = { line: 0, character: 13 };
		const completionItems = await provider.provideCompletionItems(
			document as any,
			position as any,
		);

		assert.strictEqual(completionItems, undefined);
	});

	it('filters completion items based on typed text', async () => {
		const file = '/test/style.css';
		fileSystem.setFile(
			file,
			`
			@define-mixin button { padding: 10px; }
			@define-mixin button-primary { color: blue; }
			@define-mixin card { margin: 10px; }
		`,
		);
		await extractor.updateMixinsForFile(file);

		// Test case-insensitive filtering with "but"
		const document1 = {
			lineAt: (_line: number) => ({
				text: '@mixin but',
				range: { start: { character: 0 }, end: { character: 10 } },
			}),
			uri: Uri.file(path.resolve(file)),
		};

		const position1 = { line: 0, character: 10 };
		const completionItems1 = await provider.provideCompletionItems(
			document1 as any,
			position1 as any,
		);

		assert.strictEqual(completionItems1?.length, 2);
		assert.strictEqual(completionItems1?.[0].insertText, 'ton');
		assert.strictEqual(completionItems1?.[1].insertText, 'ton-primary');

		// Test with "card"
		const document2 = {
			lineAt: (_line: number) => ({
				text: '@mixin card',
				range: { start: { character: 0 }, end: { character: 11 } },
			}),
			uri: Uri.file(path.resolve(file)),
		};

		const position2 = { line: 0, character: 11 };
		const completionItems2 = await provider.provideCompletionItems(
			document2 as any,
			position2 as any,
		);

		assert.strictEqual(completionItems2?.length, 1);
		assert.strictEqual(completionItems2?.[0].label, 'card');
	});

	it('handles underscores in the typed text', async () => {
		const file = '/test/style.css';
		fileSystem.setFile(
			file,
			`
			@define-mixin button-primary { color: blue; }
			@define-mixin button_secondary { color: gray; }
		`,
		);
		await extractor.updateMixinsForFile(file);

		// Test with underscore
		const document = {
			lineAt: (_line: number) => ({
				text: '@mixin button_',
				range: { start: { character: 0 }, end: { character: 14 } },
			}),
			uri: Uri.file(path.resolve(file)),
		};

		const position = { line: 0, character: 14 };
		const completionItems2 = await provider.provideCompletionItems(
			document as any,
			position as any,
		);

		assert.strictEqual(completionItems2?.length, 1);
		assert.strictEqual(completionItems2?.[0].insertText, 'secondary');
	});
});
