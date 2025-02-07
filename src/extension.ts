import * as vscode from 'vscode';
import * as fs from 'fs';

// Regex for mixin definitions and usage
const MIXIN_DEFINITION_REGEX = /@define-mixin\s+([a-zA-Z][a-zA-Z0-9_-]*)/g;
const MIXIN_USAGE_CHECK_REGEX = /@mixin\s+([a-zA-Z0-9_-]*)$/;

export interface FileSystem {
	readFile(
		...args: Parameters<typeof fs.promises.readFile>
	): ReturnType<typeof fs.promises.readFile>;
}

export class DefaultFileSystem implements FileSystem {
	readFile(
		...args: Parameters<typeof fs.promises.readFile>
	): ReturnType<typeof fs.promises.readFile> {
		return fs.promises.readFile(...args);
	}
}

export class MixinExtractor {
	// Mixins by filename
	private mixinsByFile = new Map<string, Set<string>>();

	constructor(private fileSystem: FileSystem = new DefaultFileSystem()) {}

	extractMixinNames(content: string): string[] {
		const matches = Array.from(content.matchAll(MIXIN_DEFINITION_REGEX));
		return matches.map((match) => match[1]);
	}

	async updateMixinsForFile(filePath: string): Promise<void> {
		try {
			const content = await this.fileSystem.readFile(filePath, 'utf-8');
			const mixinNames = this.extractMixinNames(String(content));
			const mixinSet = new Set(mixinNames);
			// Delete first to update ordering in map
			this.mixinsByFile.delete(filePath);
			this.mixinsByFile.set(filePath, mixinSet);
		} catch (error) {
			console.error(`Error reading file ${filePath}:`, error);
		}
	}

	async removeMixinsForFile(filePath: string): Promise<void> {
		this.mixinsByFile.delete(filePath);
	}

	items() {
		// Reverse keys in mixin list so most recently edited results get priority
		const files = Array.from(this.mixinsByFile.keys()).reverse();

		// Populate result list
		const mixins = new Set<string>();
		for (const file of files) {
			const mixinSet = this.mixinsByFile.get(file);
			if (!mixinSet) continue;
			for (const mixinName of mixinSet) {
				mixins.add(mixinName);
			}
		}

		return Array.from(mixins);
	}

	reset() {
		this.mixinsByFile.clear();
	}
}

export function activate(context: vscode.ExtensionContext) {
	// Map of mixins by file
	const mixinExtractor = new MixinExtractor();

	// Track current providers for disposal
	let currentProviders: vscode.Disposable[] = [];
	let currentWatchers: vscode.FileSystemWatcher[] = [];

	/**
	 * Setup completion providers with current configuration
	 */
	function setupProviders(context: vscode.ExtensionContext) {
		// Dispose of existing providers
		currentProviders.forEach((provider) => provider.dispose());
		currentProviders = [];

		// Register CSS provider
		const cssProvider = vscode.languages.registerCompletionItemProvider(
			['css', 'postcss'],
			new MixinCompletionProvider(mixinExtractor),
			// Trigger on ' ' after @mixin
			' ',
			// Check again after typing a separator character (e.g. if we're tacking
			// something onto an existing string.Ideally, we'd want to trigger after every
			// keypress but that's potentially annoying or expensive.
			'-',
			'_',
		);
		currentProviders.push(cssProvider);
		context.subscriptions.push(cssProvider);
	}

	/**
	 * Set up file watchers for CSS files based on configuration
	 */
	async function setupCssFileWatchers(context: vscode.ExtensionContext) {
		// Dispose of existing watchers
		currentWatchers.forEach((watcher) => watcher.dispose());
		currentWatchers = [];

		// Get configuration
		const config = vscode.workspace.getConfiguration('postcssMixinsAutocomplete');
		const patterns = config.get<string[]>('cssFilePatterns') ?? ['**/*.{css,pcss,postcss}'];

		// Create a watcher for each pattern
		patterns.forEach((pattern) => {
			const watcher = vscode.workspace.createFileSystemWatcher(pattern);

			watcher.onDidChange((uri) => mixinExtractor.updateMixinsForFile(uri.fsPath));
			watcher.onDidCreate((uri) => mixinExtractor.updateMixinsForFile(uri.fsPath));
			watcher.onDidDelete((uri) => mixinExtractor.removeMixinsForFile(uri.fsPath));

			currentWatchers.push(watcher);
			context.subscriptions.push(watcher);
		});

		// Do initial scan
		mixinExtractor.reset();

		// Find all matching style files across all patterns
		const styleFiles = await Promise.all(
			patterns.map((pattern) => vscode.workspace.findFiles(pattern)),
		);

		// Process each file
		for (const filesForPattern of styleFiles) {
			for (const file of filesForPattern) {
				await mixinExtractor.updateMixinsForFile(file.fsPath);
			}
		}
	}

	// Setup initial providers and watchers
	setupProviders(context);
	setupCssFileWatchers(context);

	// Watch for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('postcssMixinsAutocomplete')) {
				setupCssFileWatchers(context);
			}
		}),
	);
}

export class MixinCompletionProvider implements vscode.CompletionItemProvider {
	constructor(protected mixinExtractor: MixinExtractor) {}

	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): Promise<vscode.CompletionItem[] | undefined> {
		const linePrefix = document.lineAt(position).text.substring(0, position.character);

		// Check for @mixin and get typed text
		const match = linePrefix.match(MIXIN_USAGE_CHECK_REGEX);
		if (!match) {
			return undefined;
		}

		const typedText = match[1] || '';

		// Filter mixins that start with what's been typed
		const filteredMixins = this.mixinExtractor
			.items()
			.filter((mixinName) => mixinName.toLowerCase().startsWith(typedText.toLowerCase()));

		// Convert extractor mixins to completion item form
		return filteredMixins.map((mixinName) => {
			const item = new vscode.CompletionItem(mixinName, vscode.CompletionItemKind.Function);
			item.detail = 'PostCSS Mixin';
			item.insertText = mixinName.slice(typedText.length);
			return item;
		});
	}
}

export function deactivate() {
	// Nothing to do
}
