import * as assert from 'assert';
import * as vscode from 'vscode';
import { CssClassExtractor, FileSystem, CssClassCompletionProvider } from '../extension';

class MockFileSystem implements FileSystem {
	private files = new Map<string, string>();

	setFile(path: string, content: string) {
		this.files.set(path, content);
	}

	async readFile(
		path: string,
		_encoding: BufferEncoding | null | undefined,
	): Promise<Buffer | string> {
		const content = this.files.get(path);
		if (content === undefined) {
			throw new Error(`File not found: ${path}`);
		}
		return content;
	}
}

suite('CSS Class Extractor Tests', () => {
	let mockFs: MockFileSystem;
	let extractor: CssClassExtractor;

	setup(() => {
		mockFs = new MockFileSystem();
		extractor = new CssClassExtractor(mockFs);
	});

	test('extracts class names from CSS content', () => {
		const classNames = extractor.extractClassNames(`
			.header { color: red; }
			p { margin-bottom: 20px; }
			main.content { padding: 20px; }
			.footer {
				.link {
					text-decoration: none;
				}
			}

		`);
		assert.deepStrictEqual(classNames, ['header', 'content', 'footer', 'link']);
	});

	test('handles empty CSS content', () => {
		const classNames = extractor.extractClassNames('');
		assert.deepStrictEqual(classNames, []);
	});

	test('handles CSS content with no classes', () => {
		const classNames = extractor.extractClassNames('body { margin: 0; }');
		assert.deepStrictEqual(classNames, []);
	});

	test('provides items from multiple files, with last edited sorted first', async () => {
		mockFs.setFile('/test.css', '.header { color: red; }');
		mockFs.setFile('/other.css', '.footer { color: blue; }');
		await extractor.updateCssClassesForFile('/test.css');
		await extractor.updateCssClassesForFile('/other.css');
		const classes = extractor.items();
		assert.deepStrictEqual(classes, ['footer', 'header']);
	});

	test('handles file updates', async () => {
		mockFs.setFile('/test.css', '.header { color: red; } .main { color: green; }');
		mockFs.setFile('/other.css', '.main { padding: 10px; } .footer { padding: 10px; }');
		await extractor.updateCssClassesForFile('/test.css');
		await extractor.updateCssClassesForFile('/other.css');

		mockFs.setFile('/test.css', '.header { color: red; } .sidebar { color: blue; }');
		await extractor.updateCssClassesForFile('/test.css');

		const classes = extractor.items();
		assert.deepStrictEqual(classes, ['header', 'sidebar', 'main', 'footer']);
	});

	test('handles file removal', async () => {
		mockFs.setFile('/test.css', '.header { color: red; }');
		mockFs.setFile('/other.css', '.footer { color: blue; }');
		await extractor.updateCssClassesForFile('/test.css');
		await extractor.updateCssClassesForFile('/other.css');
		await extractor.removeCssClassesForFile('/other.css');

		const classes = extractor.items();
		assert.deepStrictEqual(classes, ['header']);
	});
});

suite('CSS Class Completion Provider Tests', () => {
	const getCompletionItemsForContent = async (content: string) => {
		const provider = new CssClassCompletionProvider(
			{ items: () => ['main'] } as unknown as CssClassExtractor,
			{
				attrs: ['className', 'class'],
				fns: ['clsx', 'classNames'],
				quote: true,
			},
		);
		const lines = content.split('\n');
		const document = {
			lineAt: (lineOrPost: number | vscode.Position) => ({
				text: lines[typeof lineOrPost === 'number' ? lineOrPost : lineOrPost.line],
			}),
			getText: () => content,
		} as unknown as vscode.TextDocument;
		const position = new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
		return provider.provideCompletionItems(document, position);
	};

	test('provides completion items for className attribute', async () => {
		const items = await getCompletionItemsForContent('<div className="');
		assert.ok(items?.length);
	});

	test('does not provide completions outside of specified attribute', async () => {
		const items = await getCompletionItemsForContent('<div id="');
		assert.strictEqual(items, undefined);
	});

	test('provides completions for function calls', async () => {
		const items = await getCompletionItemsForContent('clsx("');
		assert.ok(items?.length);
	});

	test('provides completions for nested function calls', async () => {
		const items = await getCompletionItemsForContent('foo(clsx("');
		assert.ok(items?.length);
	});

	test('provides completions for function calls with prior args', async () => {
		const items = await getCompletionItemsForContent('clsx("other", foo() && "');
		assert.ok(items?.length);
	});

	test('provides completions for multi-line function calls', async () => {
		const items = await getCompletionItemsForContent(`
			clsx(
				"other",
				(() => {
					return bar() && "header";
				}),
				foo() && "`);
		assert.ok(items?.length);
	});

	test('does not provide completions outside of specifed function calls', async () => {
		const items = await getCompletionItemsForContent('foo("');
		assert.strictEqual(items, undefined);
	});
});
