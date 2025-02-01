import * as vscode from 'vscode';
import * as fs from 'fs';

// Regex for unmatched single or double quotes. This matchds
// - Everything up to an unmatched quote
// - OR the entire string if all quotes are matched
const UP_TO_UNMATCHED_QUOTE_REGEX = /^(?:[^'"]*(?:"[^"]*"|'[^']*'))*[^'"]*(?=['"']|$)/;

// Regex to see if string ends with attribute
const ENDS_WITH_ATTR = /([\w-]+)=$/;

// Regex to get all parens (plus associated function call)
const PARENS_REGEX = /([\w$]*\(|\))/g;

// Default JSX attributes that trigger autocomplete
const DEFAULT_JSX_ATTRS = ['className', 'class', 'classList'];

// Default function names that trigger autocomplete
const DEFAULT_FN_NAMES = ['cn', 'cx', 'clsx', 'classNames'];

// Default number of lines to look back for matching JSX attributes or function calls
const MAX_LOOKBACK_LINES = 10;

// Regex for CSS classnames
const CLASS_REGEX = /\.([a-zA-Z][a-zA-Z0-9_-]*)/g;

// Store found class names by file name
const cssClassesByFile = new Map<string, Set<string>>();

export function activate(context: vscode.ExtensionContext) {
	const triggerChars = ['"', "'", ' '];

	// Register the completion provider with specific trigger characters
	const jsxProvider = vscode.languages.registerCompletionItemProvider(
		['javascriptreact', 'typescriptreact'],
		new CssClassCompletionProvider({
			attrs: DEFAULT_JSX_ATTRS,
			fns: DEFAULT_FN_NAMES,
		}),
		...triggerChars,
	);
	context.subscriptions.push(jsxProvider);

	const htmlProvider = vscode.languages.registerCompletionItemProvider(
		['html'],
		new CssClassCompletionProvider({ attrs: DEFAULT_JSX_ATTRS }),
		...triggerChars,
	);
	context.subscriptions.push(htmlProvider);

	scanWorkspaceForCssClasses();

	// Watch for CSS file changes
	const watcher = vscode.workspace.createFileSystemWatcher('**/*.css');
	watcher.onDidChange((uri) => updateCssClassesForFile(uri.fsPath));
	watcher.onDidCreate((uri) => updateCssClassesForFile(uri.fsPath));
	watcher.onDidDelete((uri) => removeCssClassesForFile(uri.fsPath));

	context.subscriptions.push(watcher);
}

class CssClassCompletionProvider implements vscode.CompletionItemProvider {
	constructor(
		protected opts: {
			/** Attribute names that trigger completion */
			attrs?: string[];
			/** Function names that trigger completion */
			fns?: string[];
		} = {},
	) {}

	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): Promise<vscode.CompletionItem[] | undefined> {
		if (!this.isInContext(document, position)) {
			return;
		}

		// Reverse keys in class list so most recently edited CSS results get priority
		const files = Array.from(cssClassesByFile.keys()).reverse();

		// Populate result list until we reach the maximum number of completion items
		const cssClasses = new Set<string>();
		for (const file of files) {
			const classes = cssClassesByFile.get(file);
			if (!classes) continue;
			for (const className of classes) {
				cssClasses.add(className);
			}
		}

		// Convert to completion item form
		return Array.from(cssClasses).map((className) => {
			const item = new vscode.CompletionItem(className, vscode.CompletionItemKind.Value);
			item.detail = 'CSS class';
			// If we're in a space-separated list of classes, don't add quotes
			item.insertText = className;
			return item;
		});
	}

	/**
	 * Check if the current position is inside a JSX attribute or matching function call
	 */
	private isInContext(document: vscode.TextDocument, position: vscode.Position): boolean {
		let lineContent = document.lineAt(position).text.substring(0, position.character);

		// We assume class name is in a single or double quote. We don't autocomplete
		// in backtick quotes because interpolation + autocomplete is weird.
		const beforeOpenQuote = UP_TO_UNMATCHED_QUOTE_REGEX.exec(lineContent);
		if (!beforeOpenQuote || beforeOpenQuote[0]?.length === lineContent.length) {
			return false;
		} else {
			lineContent = beforeOpenQuote[0];
		}

		// Check if this of the form `class="`
		const attrs = this.opts.attrs;
		if (attrs?.length) {
			const attrMatch = ENDS_WITH_ATTR.exec(lineContent);
			if (attrMatch) {
				return attrs.includes(attrMatch[1]);
			}
		}

		// Only check fn parens if needed (JSX/TSX)
		const fns = this.opts.fns;
		if (!fns?.length) {
			return false;
		}

		// Loop and do this for the preceding lines up to MAX_LOOKBACK_LINES
		let i = 0;
		// See negativeStack below
		let priorStack: string[] = [];
		do {
			if (i > 0) {
				const lineNum = position.line - i;
				if (lineNum < 0) break;
				lineContent = document.lineAt(lineNum).text + lineContent;
			}

			// Two stacks - Left parens add to the stack, right parens pop from the stack
			// If we find a right parens and there's nothing in the stack, we add it to
			// the negative stack (which becomes the prior stack on the next run)
			const parensStack: string[] = [];
			const negativeParensStack: string[] = [];
			let match: RegExpExecArray | null;
			while ((match = PARENS_REGEX.exec(lineContent))) {
				const parens = match[0];
				if (parens.endsWith('(')) {
					parensStack.push(parens);
				} else if (parens === ')') {
					if (parensStack.length) {
						parensStack.pop();
					} else {
						negativeParensStack.push(parens);
					}
				}
			}

			// These should all be closing parens
			for (const parens of priorStack) {
				if (parensStack.length) {
					parensStack.pop();
				} else {
					negativeParensStack.push(parens);
				}
			}

			if (parensStack.length === 1) {
				return fns.includes(parensStack[0].slice(0, -1));
			}

			priorStack = negativeParensStack;
		} while (++i < MAX_LOOKBACK_LINES);
		return false;
	}
}

async function scanWorkspaceForCssClasses() {
	cssClassesByFile.clear();

	const cssFiles = await vscode.workspace.findFiles('**/*.css');

	for (const file of cssFiles) {
		await updateCssClassesForFile(file.fsPath);
	}
}

async function updateCssClassesForFile(filePath: string) {
	try {
		const content = await fs.promises.readFile(filePath, 'utf-8');
		const classNames = extractClassNames(content);
		const classSet = new Set(classNames);
		// Delete first to update ordering in map
		cssClassesByFile.delete(filePath);
		cssClassesByFile.set(filePath, classSet);
	} catch (error) {
		console.error(`Error reading file ${filePath}:`, error);
	}
}

function removeCssClassesForFile(filePath: string) {
	cssClassesByFile.delete(filePath);
}

function extractClassNames(content: string): string[] {
	const matches = content.match(CLASS_REGEX) || [];
	return matches.map((match) => match.substring(1));
}

export function deactivate() {
	cssClassesByFile.clear();
}
