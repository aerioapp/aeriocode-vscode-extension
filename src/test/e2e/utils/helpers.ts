import { type Dirent, existsSync, mkdtempSync, type PathLike, readdirSync, type RmOptions, rmSync } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { type ElectronApplication, expect, type Frame, type Page, test } from "@playwright/test"
import { downloadAndUnzipVSCode, SilentReporter } from "@vscode/test-electron"
import { _electron } from "playwright"
import { AeriocodeApiServerMock } from "../fixtures/server"

interface E2ETestDirectories {
	workspaceDir: string
	userDataDir: string
	extensionsDir: string
}

export class E2ETestHelper {
	// Constants
	public static readonly CODEBASE_ROOT_DIR = path.resolve(__dirname, "..", "..", "..", "..")
	public static readonly E2E_TESTS_DIR = path.join(E2ETestHelper.CODEBASE_ROOT_DIR, "src", "test", "e2e")

	// Instance properties for caching
	private cachedFrame: Frame | null = null

	// Path utilities
	public static escapeToPath(text: string): string {
		return text.trim().toLowerCase().replaceAll(/\W/g, "_")
	}

	public static getResultsDir(testName = "", label?: string): string {
		const testDir = path.join(
			E2ETestHelper.CODEBASE_ROOT_DIR,
			"test-results",
			"playwright",
			E2ETestHelper.escapeToPath(testName),
		)
		return label ? path.join(testDir, label) : testDir
	}

	public static async waitUntil(predicate: () => boolean | Promise<boolean>, maxDelay = 5000): Promise<void> {
		let delay = 10
		const start = Date.now()

		while (!(await predicate())) {
			if (Date.now() - start > maxDelay) {
				throw new Error(`waitUntil timeout after ${maxDelay}ms`)
			}
			await new Promise((resolve) => setTimeout(resolve, delay))
			delay = Math.min(delay << 1, 1000) // Cap at 1s
		}
	}

	public async getSidebar(page: Page): Promise<Frame> {
		const findSidebarFrame = async (): Promise<Frame | null> => {
			// Check cached frame first
			if (this.cachedFrame && !this.cachedFrame.isDetached()) {
				return this.cachedFrame
			}

			for (const frame of page.frames()) {
				if (frame.isDetached()) {
					continue
				}

				try {
					const title = await frame.title()
					if (title.startsWith("Aeriocode")) {
						this.cachedFrame = frame
						return frame
					}
				} catch (error: any) {
					if (!error.message.includes("detached") && !error.message.includes("navigation")) {
						throw error
					}
				}
			}
			return null
		}

		await E2ETestHelper.waitUntil(async () => (await findSidebarFrame()) !== null)
		return (await findSidebarFrame()) || page.mainFrame()
	}

	/**
	 * Describe what is actually on disk, bounded so a full .app bundle cannot flood the log.
	 *
	 * The error this feeds is the only view into a runner we cannot reproduce locally, and
	 * a listing one level too shallow has already cost two wrong diagnoses.
	 */
	private static describeTree(root: string, maxDepth = 3, maxEntries = 40): string {
		const lines: string[] = []

		const walk = (dir: string, depth: number, prefix: string) => {
			if (depth > maxDepth || lines.length >= maxEntries) {
				return
			}
			let entries: Dirent[]
			try {
				entries = readdirSync(dir, { withFileTypes: true })
			} catch (error: any) {
				lines.push(`${prefix}<unreadable: ${error.code ?? error.message}>`)
				return
			}
			for (const entry of entries) {
				if (lines.length >= maxEntries) {
					lines.push(`${prefix}… (truncated)`)
					return
				}
				const kind = entry.isDirectory() ? "/" : entry.isSymbolicLink() ? " -> (symlink)" : ""
				lines.push(`${prefix}${entry.name}${kind}`)
				if (entry.isDirectory()) {
					walk(path.join(dir, entry.name), depth + 1, `${prefix}  `)
				}
			}
		}

		walk(root, 1, "")
		return lines.join("\n") || "(empty)"
	}

	/**
	 * Locate the VS Code binary inside an unpacked install, whatever shape it landed in.
	 *
	 * @vscode/test-electron derives one fixed path per platform and never checks it. On the
	 * macOS runner that path — `Visual Studio Code.app/Contents/MacOS/Electron` — does not
	 * exist even though the bundle beside it does, and it stays missing across a clean
	 * re-download, so neither the cache nor the unpack strip level explains it. Rather than
	 * encode yet another guess about the layout, search for the binary: check the paths the
	 * library expects first, then walk the install for an executable by name.
	 */
	private static findVSCodeExecutable(installDir: string): string | null {
		const EXECUTABLE_NAMES = new Set(["Electron", "code", "Code.exe", "code-insiders", "Code - Insiders"])

		const candidates = [
			// The layout @vscode/test-electron assumes on macOS.
			path.join("Visual Studio Code.app", "Contents", "MacOS", "Electron"),
			// The same bundle with its top level stripped.
			path.join("Contents", "MacOS", "Electron"),
			// Linux and Windows ship a single binary at the top level.
			"code",
			"Code.exe",
		]

		for (const candidate of candidates) {
			const full = path.join(installDir, candidate)
			if (existsSync(full)) {
				return full
			}
		}

		// Any bundle's MacOS directory holds just the launcher, so read it rather than
		// assuming the launcher's name.
		for (const entry of readdirSync(installDir)) {
			if (!entry.endsWith(".app")) {
				continue
			}
			const macOsDir = path.join(installDir, entry, "Contents", "MacOS")
			if (!existsSync(macOsDir)) {
				continue
			}
			for (const candidate of readdirSync(macOsDir, { withFileTypes: true })) {
				if (candidate.isFile() || candidate.isSymbolicLink()) {
					return path.join(macOsDir, candidate.name)
				}
			}
		}

		// Last resort: find an executable by name anywhere in the install. Bounded depth,
		// because a VS Code bundle holds thousands of files and the launcher is shallow.
		const search = (dir: string, depth: number): string | null => {
			if (depth > 5) {
				return null
			}
			let entries: Dirent[]
			try {
				entries = readdirSync(dir, { withFileTypes: true })
			} catch {
				return null
			}
			for (const entry of entries) {
				const full = path.join(dir, entry.name)
				if (entry.isDirectory()) {
					const nested = search(full, depth + 1)
					if (nested) {
						return nested
					}
				} else if (EXECUTABLE_NAMES.has(entry.name)) {
					return full
				}
			}
			return null
		}

		const found = search(installDir, 1)
		if (found) {
			return found
		}

		return null
	}

	/**
	 * Download VS Code and return a path that actually exists.
	 *
	 * `downloadAndUnzipVSCode` reports success without ever checking its own answer: it
	 * skips the download whenever an `is-complete` marker sits beside the install, and the
	 * path it derives assumes an unpack layout it does not always produce (see
	 * findVSCodeExecutable). Either way the caller gets a path to a missing file, and
	 * Playwright surfaces it only as `electron.launch: ... spawn ... ENOENT` with every
	 * test failing in milliseconds.
	 *
	 * So: check the answer. Prefer finding the binary where it really landed; only if it
	 * is nowhere at all discard the versioned directory — marker included, so the next
	 * call cannot short-circuit — and download once more.
	 */
	public static async resolveVSCodeExecutable(): Promise<string> {
		const reportedPath = await downloadAndUnzipVSCode("stable", undefined, new SilentReporter())
		if (existsSync(reportedPath)) {
			return reportedPath
		}

		const cacheRoot = path.join(E2ETestHelper.CODEBASE_ROOT_DIR, ".vscode-test")
		const installName = path.relative(cacheRoot, reportedPath).split(path.sep)[0]
		const installDir = path.join(cacheRoot, installName)
		const insideCache = Boolean(installName) && !installName.startsWith("..")

		if (insideCache && existsSync(installDir)) {
			const found = E2ETestHelper.findVSCodeExecutable(installDir)
			if (found) {
				console.warn(`VS Code is not at ${reportedPath}; using ${found} instead.`)
				return found
			}
		}

		console.warn(`VS Code is missing at ${reportedPath} — discarding ${installName} and downloading again.`)
		if (insideCache) {
			await E2ETestHelper.rmForRetries(installDir, { recursive: true, force: true })
		}

		const redownloadedPath = await downloadAndUnzipVSCode("stable", undefined, new SilentReporter())
		if (existsSync(redownloadedPath)) {
			return redownloadedPath
		}
		if (insideCache && existsSync(installDir)) {
			const found = E2ETestHelper.findVSCodeExecutable(installDir)
			if (found) {
				console.warn(`After re-download VS Code is not at ${redownloadedPath}; using ${found} instead.`)
				return found
			}
		}

		// Nothing matched. Print the tree rather than a single directory level — the shallow
		// listing that shipped before said only "Visual Studio Code.app, is-complete", which
		// looked healthy while the launcher inside it was unaccounted for.
		const tree =
			insideCache && existsSync(installDir) ? E2ETestHelper.describeTree(installDir) : "(install directory missing)"
		throw new Error(
			`VS Code is still missing at ${redownloadedPath} after a clean re-download, and no ` +
				`executable was found under ${installDir}.\n${tree}`,
		)
	}

	public static async rmForRetries(path: PathLike, options?: RmOptions): Promise<void> {
		const maxAttempts = 3 // Reduced from 5

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				rmSync(path, options)
				return
			} catch (error) {
				if (attempt === maxAttempts) {
					throw new Error(`Failed to rmSync ${path} after ${maxAttempts} attempts: ${error}`)
				}
				await new Promise((resolve) => setTimeout(resolve, 50 * attempt)) // Progressive delay
			}
		}
	}

	public static async signin(webview: Frame): Promise<void> {
		// In the current extension, clicking "Get Started for Free" opens an external browser for OAuth.
		// In e2e tests, we can't complete OAuth, so we just verify the welcome view is visible.
		const getStartedButton = webview.getByRole("button", {
			name: "Get Started for Free",
		})
		await expect(getStartedButton).toBeVisible()
	}

	public static async openAeriocodeSidebar(page: Page): Promise<void> {
		await page
			.getByRole("tab", { name: /Aeriocode/ })
			.locator("a")
			.click()
	}

	public static async runCommandPalette(page: Page, command: string): Promise<void> {
		const editorMenu = page.locator("li").filter({ hasText: "[Extension Development Host]" }).first()
		await editorMenu.click({ delay: 100 })
		const editorSearchBar = page.getByRole("textbox", {
			name: "Search files by name (append",
		})
		await editorSearchBar.click({ delay: 100 }) // Ensure focus
		await editorSearchBar.fill(`>${command}`)
		await page.keyboard.press("Enter")
	}

	// Clear cached frame when needed
	public clearCachedFrame(): void {
		this.cachedFrame = null
	}
}

/**
 * NOTE: Use the `e2e` test fixture for all E2E tests to test the Aeriocode extension.
 *
 * Extended Playwright test configuration for Aeriocode E2E testing.
 *
 * This test configuration provides a comprehensive setup for end-to-end testing of the Aeriocode VS Code extension,
 * including server mocking, temporary directories, VS Code instance management, and helper utilities.
 *
 * @extends test - Base Playwright test with multiple fixture extensions
 *
 * Fixtures provided:
 * - `server`: Shared AeriocodeApiServerMock instance for API mocking (reused across all tests)
 * - `workspaceDir`: Path to the test workspace directory
 * - `userDataDir`: Temporary directory for VS Code user data
 * - `extensionsDir`: Temporary directory for VS Code extensions
 * - `openVSCode`: Function that returns a Promise resolving to an ElectronApplication instance
 * - `app`: ElectronApplication instance with automatic cleanup
 * - `helper`: E2ETestHelper instance for test utilities
 * - `page`: Playwright Page object representing the main VS Code window with Aeriocode sidebar opened
 * - `sidebar`: Playwright Frame object representing the Aeriocode extension's sidebar iframe
 *
 * @returns Extended test object with all fixtures available for E2E test scenarios:
 * - **server**: Automatically starts and manages a AeriocodeApiServerMock instance
 * - **workspaceDir**: Sets up a test workspace directory from fixtures
 * - **userDataDir**: Creates a temporary directory for VS Code user data
 * - **extensionsDir**: Creates a temporary directory for VS Code extensions
 * - **openVSCode**: Factory function that launches VS Code with proper configuration for testing
 * - **app**: Manages the VS Code ElectronApplication lifecycle with automatic cleanup
 * - **helper**: Provides E2ETestHelper utilities for test operations
 * - **page**: Configures the main VS Code window with notifications disabled and Aeriocode sidebar open
 * - **sidebar**: Provides access to the Aeriocode extension's sidebar frame
 *
 * @example
 * ```typescript
 * e2e('should perform basic operations', async ({ sidebar, helper }) => {
 *   // Test implementation using the configured sidebar and helper
 * });
 * ```
 *
 * @remarks
 * - Automatically handles VS Code download and setup
 * - Installs the Aeriocode extension in development mode
 * - Records test videos for debugging
 * - Performs cleanup of temporary directories after each test
 * - Configures VS Code with disabled updates, workspace trust, and welcome screens
 */
export const e2e = test
	.extend<{ server: AeriocodeApiServerMock | null }>({
		server: async ({}, use) => {
			console.log("=== SERVER FIXTURE CALLED ===")
			// Start server if it doesn't exist
			if (!AeriocodeApiServerMock.globalSharedServer) {
				console.log("Starting global server...")
				await AeriocodeApiServerMock.startGlobalServer()
				console.log("Global server started successfully")
			} else {
				console.log("Using existing global server")
			}
			await use(AeriocodeApiServerMock.globalSharedServer)
		},
	})
	.extend<E2ETestDirectories>({
		workspaceDir: async ({}, use) => {
			await use(path.join(E2ETestHelper.E2E_TESTS_DIR, "fixtures", "workspace"))
		},
		userDataDir: async ({}, use) => {
			await use(mkdtempSync(path.join(os.tmpdir(), "vsce")))
		},
		extensionsDir: async ({}, use) => {
			await use(mkdtempSync(path.join(os.tmpdir(), "vsce")))
		},
	})
	.extend<{ openVSCode: () => Promise<ElectronApplication> }>({
		openVSCode: async ({ workspaceDir, userDataDir, extensionsDir }, use, testInfo) => {
			const executablePath = await E2ETestHelper.resolveVSCodeExecutable()

			await use(async () => {
				const app = await _electron.launch({
					executablePath,
					env: {
						...process.env,
						TEMP_PROFILE: "true",
						E2E_TEST: "true",
						AERIOCODE_ENVIRONMENT: "local",
						// IS_DEV: "true",
						// DEV_WORKSPACE_FOLDER: E2ETestHelper.CODEBASE_ROOT_DIR,
					},
					recordVideo: {
						dir: E2ETestHelper.getResultsDir(testInfo.title, "recordings"),
					},
					args: [
						"--no-sandbox",
						"--disable-updates",
						"--disable-workspace-trust",
						"--skip-welcome",
						"--skip-release-notes",
						`--user-data-dir=${userDataDir}`,
						`--extensions-dir=${extensionsDir}`,
						`--install-extension=${path.join(E2ETestHelper.CODEBASE_ROOT_DIR, "dist", "e2e.vsix")}`,
						`--extensionDevelopmentPath=${E2ETestHelper.CODEBASE_ROOT_DIR}`,
						workspaceDir,
					],
				})
				await E2ETestHelper.waitUntil(() => app.windows().length > 0)
				return app
			})
		},
	})
	.extend<{ app: ElectronApplication }>({
		app: async ({ openVSCode, userDataDir, extensionsDir }, use) => {
			const app = await openVSCode()

			try {
				await use(app)
			} finally {
				await app.close()
				// Cleanup in parallel
				await Promise.allSettled([
					E2ETestHelper.rmForRetries(userDataDir, { recursive: true }),
					E2ETestHelper.rmForRetries(extensionsDir, { recursive: true }),
				])
			}
		},
	})
	.extend<{ helper: E2ETestHelper }>({
		helper: async ({}, use) => {
			const helper = new E2ETestHelper()
			await use(helper)
		},
	})
	.extend({
		page: async ({ app }, use) => {
			const page = await app.firstWindow()
			await use(page)
		},
	})
	.extend<{ sidebar: Frame }>({
		sidebar: async ({ page, helper, server }, use) => {
			await E2ETestHelper.openAeriocodeSidebar(page)
			const sidebar = await helper.getSidebar(page)
			await use(sidebar)
		},
	})

// Backward compatibility exports
export const getResultsDir = E2ETestHelper.getResultsDir
export const getSidebar = (page: Page) => new E2ETestHelper().getSidebar(page)
export const rmForRetries = E2ETestHelper.rmForRetries
export const signin = E2ETestHelper.signin
export const openAeriocodeSidebar = E2ETestHelper.openAeriocodeSidebar
export const runCommandPalette = E2ETestHelper.runCommandPalette
export const waitUntil = E2ETestHelper.waitUntil
