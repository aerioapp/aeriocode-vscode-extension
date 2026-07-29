import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { listFiles } from "@services/glob/list-files"
import { asRelativePath, getWorkspacePath } from "@/utils/path"

/**
 * Resolving a compliance scope into a concrete list of files.
 *
 * The panel shows the user this list before anything is sent, because analysis uploads
 * file contents to the Aeriocode backend. "Which files am I about to send?" has to be
 * answerable before the request, not after.
 */

/** Extensions the backend's C/C++ grammars accept. Kept in step with core/parser.js. */
const CPP_EXTENSIONS = [".c", ".h", ".hh", ".hpp", ".hxx", ".cc", ".cpp", ".cxx", ".inl"]

const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
	c: [".c", ".h"],
	cpp: CPP_EXTENSIONS,
}

/** Mirrors the caps in the backend's compliance routes. */
export const MAX_FILES = 50
export const MAX_TOTAL_BYTES = 2 * 1024 * 1024

export interface ResolvedComplianceFile {
	path: string
	absolutePath: string
	sizeBytes: number
}

export interface ResolvedScope {
	files: ResolvedComplianceFile[]
	scopeLabel: string
	emptyReason: string
	excludedOverLimit: number
}

export function extensionsForLanguages(languages: string[]): string[] {
	const extensions = new Set<string>()
	for (const language of languages) {
		for (const extension of LANGUAGE_EXTENSIONS[language] ?? []) {
			extensions.add(extension)
		}
	}
	// An unknown language must not silently match everything — offering files the backend
	// will only skip is worse than offering none.
	return [...extensions]
}

function matches(filePath: string, extensions: string[]): boolean {
	return extensions.includes(path.extname(filePath).toLowerCase())
}

async function describe(absolutePaths: string[], extensions: string[]): Promise<ResolvedComplianceFile[]> {
	const seen = new Set<string>()
	const files: ResolvedComplianceFile[] = []

	for (const absolutePath of absolutePaths) {
		if (seen.has(absolutePath) || !matches(absolutePath, extensions)) {
			continue
		}
		seen.add(absolutePath)

		let sizeBytes = 0
		try {
			sizeBytes = (await fs.stat(absolutePath)).size
		} catch {
			// Unreadable or deleted between listing and stat — skip rather than offer a file
			// the analysis would fail on.
			continue
		}

		files.push({ path: await asRelativePath(absolutePath), absolutePath, sizeBytes })
	}

	return files.sort((left, right) => left.path.localeCompare(right.path))
}

/**
 * Trim to what one request can carry. Files beyond the cap are dropped rather than sent
 * and rejected, and the count is reported so the panel can say how many were left out.
 */
function applyLimits(files: ResolvedComplianceFile[]): { kept: ResolvedComplianceFile[]; excluded: number } {
	const kept: ResolvedComplianceFile[] = []
	let totalBytes = 0

	for (const file of files) {
		if (kept.length >= MAX_FILES || totalBytes + file.sizeBytes > MAX_TOTAL_BYTES) {
			continue
		}
		kept.push(file)
		totalBytes += file.sizeBytes
	}

	return { kept, excluded: files.length - kept.length }
}

function activeFilePath(): string | undefined {
	return vscode.window.activeTextEditor?.document.uri.fsPath
}

/** Open editors across all tab groups, not just the visible ones. */
function openEditorPaths(): string[] {
	return vscode.window.tabGroups.all
		.flatMap((group) => group.tabs)
		.map((tab) => (tab.input as { uri?: vscode.Uri })?.uri?.fsPath)
		.filter((fsPath): fsPath is string => typeof fsPath === "string")
}

async function globFiles(folder: string, extensions: string[], recursive: boolean): Promise<string[]> {
	// listFiles already skips node_modules, .git, build output and the like, and refuses to
	// walk the home or root directory. Fetch beyond MAX_FILES so the panel can report how
	// many were left out rather than silently trimming.
	const [found] = await listFiles(folder, recursive, MAX_FILES * 10)
	return found.filter((filePath) => matches(filePath, extensions))
}

export type ComplianceScopeName = "activeFile" | "openEditors" | "activeFolder" | "workspace"

export async function resolveScope(scope: ComplianceScopeName, languages: string[]): Promise<ResolvedScope> {
	const extensions = extensionsForLanguages(languages)
	const empty = (emptyReason: string, scopeLabel = ""): ResolvedScope => ({
		files: [],
		scopeLabel,
		emptyReason,
		excludedOverLimit: 0,
	})

	if (extensions.length === 0) {
		return empty("This standard targets a language the extension does not know how to collect files for.")
	}

	const extensionList = extensions.join(", ")
	let candidates: string[] = []
	let scopeLabel = ""

	switch (scope) {
		case "activeFile": {
			const active = activeFilePath()
			if (!active) {
				return empty("No file is open. Open a source file, or choose a different scope.")
			}
			if (!matches(active, extensions)) {
				return empty(`${path.basename(active)} is not a file this standard applies to (${extensionList}).`)
			}
			candidates = [active]
			scopeLabel = path.basename(active)
			break
		}

		case "openEditors": {
			candidates = openEditorPaths()
			scopeLabel = "open editors"
			if (candidates.length === 0) {
				return empty("No editors are open.", scopeLabel)
			}
			break
		}

		case "activeFolder": {
			const active = activeFilePath()
			if (!active) {
				return empty("No file is open, so there is no current folder. Choose a different scope.")
			}
			const folder = path.dirname(active)
			// Non-recursive: "this folder" should mean the sibling files the user can see,
			// not an entire subtree they did not ask for.
			candidates = await globFiles(folder, extensions, false)
			scopeLabel = (await asRelativePath(folder)) || path.basename(folder)
			break
		}

		case "workspace": {
			const workspacePath = await getWorkspacePath()
			if (!workspacePath) {
				return empty("No workspace folder is open.")
			}
			candidates = await globFiles(workspacePath, extensions, true)
			scopeLabel = path.basename(workspacePath)
			break
		}
	}

	const described = await describe(candidates, extensions)
	if (described.length === 0) {
		return empty(`No ${extensionList} files found in ${scopeLabel}.`, scopeLabel)
	}

	const { kept, excluded } = applyLimits(described)
	return { files: kept, scopeLabel, emptyReason: "", excludedOverLimit: excluded }
}
