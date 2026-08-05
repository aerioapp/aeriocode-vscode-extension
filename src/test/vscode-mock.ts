// Minimal vscode mock for unit tests.
// Only provides APIs that are accessed at module level during import.

const mockDecorationType = {
	dispose: () => {},
	key: "mock-decoration",
}

const mockOutputChannel = {
	appendLine: () => {},
	append: () => {},
	show: () => {},
	hide: () => {},
	dispose: () => {},
	clear: () => {},
	name: "Mock Channel",
}

const mockDiagnosticCollection = {
	set: () => {},
	delete: () => {},
	clear: () => {},
	dispose: () => {},
}

const mockUri = {
	fsPath: "",
	scheme: "file",
	path: "",
	query: "",
	fragment: "",
	toString: () => "",
	with: (_: unknown) => mockUri,
}

export const window = {
	createTextEditorDecorationType: (_opts: unknown) => mockDecorationType,
	createOutputChannel: (_name: string, _lang?: string) => mockOutputChannel,
	createDiagnosticCollection: (_name?: string) => mockDiagnosticCollection,
	showErrorMessage: async () => undefined,
	showWarningMessage: async () => undefined,
	showInformationMessage: async () => undefined,
	showSaveDialog: async () => undefined,
	showOpenDialog: async () => undefined,
	showInputBox: async () => undefined,
	showQuickPick: async () => undefined,
	showTextDocument: async () => {},
	activeTextEditor: undefined,
	onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
	onDidChangeTextEditorSelection: () => ({ dispose: () => {} }),
	onDidChangeVisibleTextEditors: () => ({ dispose: () => {} }),
	visibleTextEditors: [],
	getVisibleTextEditors: () => [],
	withProgress: async (_opts: unknown, task: (progress: { report: () => void }) => Promise<unknown>) => {
		return await task({ report: () => {} })
	},
	createStatusBarItem: () => ({
		text: "",
		tooltip: "",
		show: () => {},
		hide: () => {},
		dispose: () => {},
	}),
	registerTreeDataProvider: () => ({ dispose: () => {} }),
	createTreeView: () => ({ dispose: () => {} }),
	setStatusBarMessage: () => ({ dispose: () => {} }),
}

/**
 * Settings a test has set, keyed by full section path (e.g. "aeriocode.compliance.standard").
 *
 * Exposed so a suite can exercise code that reads configuration. The previous double returned
 * `undefined` for every key, which meant any such code could only ever be tested on its
 * nothing-is-set path — and for a feature whose entire job is to be off by default, that is the one
 * path that proves least.
 */
export const __configStore = new Map<string, unknown>()

/**
 * Declared defaults, read from the real package.json.
 *
 * Not a hand-written copy: a test asserting the resolver's behaviour is only meaningful if the
 * default it sees is the default the extension actually ships. A second list would let the two
 * drift, and the drift would make the tests pass while the product misbehaved.
 */
function declaredDefault(fullKey: string): unknown {
	const properties = require("../../package.json").contributes?.configuration?.properties ?? {}
	return properties[fullKey]?.default
}

export function __resetConfig(): void {
	__configStore.clear()
}

export const workspace = {
	getConfiguration: (section?: string, _resource?: unknown) => ({
		get: (key: string, fallback?: unknown) => {
			const fullKey = section ? `${section}.${key}` : key
			if (__configStore.has(fullKey)) {
				return __configStore.get(fullKey)
			}
			const declared = declaredDefault(fullKey)
			return declared !== undefined ? declared : fallback
		},
		has: (key: string) => __configStore.has(section ? `${section}.${key}` : key),
		update: async (key: string, value: unknown) => {
			__configStore.set(section ? `${section}.${key}` : key, value)
		},
		inspect: () => undefined,
	}),
	getWorkspaceFolders: () => [],
	onDidChangeConfiguration: () => ({ dispose: () => {} }),
	onDidSaveTextDocument: () => ({ dispose: () => {} }),
	onDidCreateFiles: () => ({ dispose: () => {} }),
	onDidDeleteFiles: () => ({ dispose: () => {} }),
	onDidRenameFiles: () => ({ dispose: () => {} }),
	findFiles: async () => [],
	asRelativePath: (pathOrUri: string) => pathOrUri,
	applyEdit: async () => true,
	fs: {
		readFile: async () => new Uint8Array(),
		writeFile: async () => {},
		delete: async () => {},
		rename: async () => {},
		copy: async () => {},
		stat: async () => ({ type: 0, ctime: 0, mtime: 0, size: 0 }),
		readDirectory: async () => [],
		createDirectory: async () => {},
		exists: async () => false,
	},
	name: "",
}

export const env = {
	appName: "AerioCode",
	appRoot: "",
	language: "en",
	machineId: "mock-machine-id",
	remoteName: undefined,
	sessionId: "mock-session-id",
	shell: "/bin/bash",
	uiKind: 1,
	isTelemetryEnabled: false,
	onDidChangeTelemetryEnabled: () => ({ dispose: () => {} }),
	openExternal: async () => false,
}

export const Uri = {
	file: (path: string) => ({ ...mockUri, fsPath: path, path }),
	parse: (value: string) => ({ ...mockUri, path: value }),
	joinPath: (...segments: unknown[]) => ({ ...mockUri, path: segments.join("/") }),
	revive: (value: unknown) => value,
}

export const ExtensionMode = { Production: 1, Development: 2, Test: 3 }

export class Position {
	constructor(
		public line: number,
		public character: number,
	) {}
}

export class Range {
	constructor(
		public start: Position,
		public end: Position,
	) {}
}

export class Selection extends Range {
	constructor(anchorLine: number, anchorCharacter: number, activeLine: number, activeCharacter: number) {
		super(new Position(anchorLine, anchorCharacter), new Position(activeLine, activeCharacter))
	}
}

export const TextEdit = {
	insert: (position: Position, text: string) => ({ range: new Range(position, position), newText: text }),
	delete: (range: Range) => ({ range, newText: "" }),
	replace: (range: Range, text: string) => ({ range, newText: text }),
}

export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 }

export class Diagnostic {
	constructor(
		public range: Range,
		public message: string,
		public severity?: number,
	) {}
}

export class EventEmitter {
	private listeners: Array<(...args: unknown[]) => void> = []
	fire(data?: unknown) {
		for (const listener of this.listeners) listener(data)
	}
	event = (listener: (...args: unknown[]) => void) => {
		this.listeners.push(listener)
		return { dispose: () => {} }
	}
	dispose() {}
}

export class CancellationTokenSource {
	token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) }
	cancel() {
		this.token.isCancellationRequested = true
	}
	dispose() {}
}

export const StatusBarAlignment = { Left: 1, Right: 2 }

export class ThemeColor {
	constructor(public id: string) {}
}

export class MarkdownString {
	constructor(public value?: string) {}
	isTrusted = false
	supportHtml = false
}

export class TreeItem {
	constructor(
		public label: string,
		public collapsibleState?: number,
	) {}
	iconPath = undefined
	description = ""
	contextValue = ""
}

export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 }

export const OverviewRulerLane = { Left: 1, Center: 2, Right: 3, Full: 4 }

export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 }

// Default export for `import vscode from "vscode"` style
export default {
	window,
	workspace,
	env,
	Uri,
	ExtensionMode,
	Position,
	Range,
	Selection,
	TextEdit,
	DiagnosticSeverity,
	Diagnostic,
	EventEmitter,
	CancellationTokenSource,
	StatusBarAlignment,
	ThemeColor,
	MarkdownString,
	TreeItem,
	TreeItemCollapsibleState,
	OverviewRulerLane,
	ConfigurationTarget,
}
