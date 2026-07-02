# Fix VSIX Link Opening Issue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the issue where links don't open when the extension is packaged as VSIX, but work correctly when run via F5 debug mode.

**Architecture:** The root cause is a combination of three issues: (1) missing `process.env.AERIOCODE_ENVIRONMENT` define in esbuild.mjs causing the extension to default to production environment in VSIX mode, (2) CSP not including `*.aerio.bot` domain, and (3) the `open` npm package may not work reliably in packaged VSIX environments. The fix involves aligning the build configuration with the original extension, updating CSP, and using VS Code's native `vscode.env.openExternal` as the primary URL opening method.

**Tech Stack:** TypeScript, esbuild, VS Code Extension API, React (webview-ui)

---

## Root Cause Analysis

When running via F5 (debug mode):
- The extension uses `getHMRHtmlContent()` which connects to a local dev server
- The CSP is more permissive
- The `open` npm package works because Node.js runtime has full access

When packaged as VSIX:
- The extension uses `getHtmlContent()` with strict CSP
- `process.env.AERIOCODE_ENVIRONMENT` is undefined → defaults to `production` → `https://code.aerio.bot`
- CSP `connect-src` doesn't include `https://*.aerio.bot` → API calls may be blocked
- The `open` npm package may not work reliably in packaged environments

---

## Task 1: Fix esbuild.mjs - Add missing AERIOCODE_ENVIRONMENT define

**Covers:** Build configuration alignment with original extension

**Files:**
- Modify: `esbuild.mjs:133-135`

- [ ] **Step 1: Update the define block in esbuild.mjs**

Change the production define from:
```javascript
define: production
    ? { "import.meta.url": "_importMetaUrl", "process.env.IS_DEV": JSON.stringify(!production) }
    : { "import.meta.url": "_importMetaUrl" },
```

To:
```javascript
define: production
    ? { "import.meta.url": "_importMetaUrl", "process.env.IS_DEV": JSON.stringify(!production), "process.env.AERIOCODE_ENVIRONMENT": JSON.stringify("production") }
    : { "import.meta.url": "_importMetaUrl", "process.env.AERIOCODE_ENVIRONMENT": JSON.stringify("production") },
```

- [ ] **Step 2: Verify the change**

Run: `cat esbuild.mjs | grep -A2 "define:"`
Expected: Shows the updated define block with `AERIOCODE_ENVIRONMENT`

- [ ] **Step 3: Commit**

```bash
git add esbuild.mjs
git commit -m "fix: add AERIOCODE_ENVIRONMENT define to esbuild config"
```

---

## Task 2: Update CSP to include *.aerio.bot domain

**Covers:** Webview CSP configuration

**Files:**
- Modify: `src/core/webview/WebviewProvider.ts:212-217`

- [ ] **Step 1: Update the CSP connect-src in getHtmlContent()**

Change the connect-src from:
```javascript
connect-src https://*.posthog.com https://*.aeriocode.bot https://*.firebaseauth.com https://*.firebaseio.com https://*.googleapis.com https://*.firebase.com; 
```

To:
```javascript
connect-src https://*.posthog.com https://*.aerio.bot https://*.aeriocode.bot https://*.firebaseauth.com https://*.firebaseio.com https://*.googleapis.com https://*.firebase.com; 
```

- [ ] **Step 2: Verify the change**

Run: `grep "connect-src" src/core/webview/WebviewProvider.ts`
Expected: Shows the updated connect-src with `*.aerio.bot`

- [ ] **Step 3: Commit**

```bash
git add src/core/webview/WebviewProvider.ts
git commit -m "fix: add *.aerio.bot to webview CSP connect-src"
```

---

## Task 3: Update openExternal to use VS Code's native API as primary method

**Covers:** URL opening reliability in VSIX mode

**Files:**
- Modify: `src/utils/env.ts`

- [ ] **Step 1: Update openExternal to use vscode.env.openExternal as primary**

Replace the entire `openExternal` function in `src/utils/env.ts`:

```typescript
import { HostProvider } from "@/hosts/host-provider"
import { StringRequest, EmptyRequest } from "@shared/proto/aeriocode/common"
import * as vscode from "vscode"

/**
 * Writes text to the system clipboard
 * @param text The text to write to the clipboard
 * @returns Promise that resolves when the operation is complete
 * @throws Error if the operation fails
 */
export async function writeTextToClipboard(text: string): Promise<void> {
	try {
		await HostProvider.env.clipboardWriteText(StringRequest.create({ value: text }))
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		throw new Error(`Failed to write to clipboard: ${errorMessage}`)
	}
}

/**
 * Reads text from the system clipboard
 * @returns Promise that resolves to the clipboard text
 * @throws Error if the operation fails
 */
export async function readTextFromClipboard(): Promise<string> {
	try {
		const response = await HostProvider.env.clipboardReadText(EmptyRequest.create({}))
		return response.value
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		throw new Error(`Failed to read from clipboard: ${errorMessage}`)
	}
}

/**
 * Opens an external URL in the default browser
 * Uses VS Code's native openExternal API which works reliably in both
 * F5 debug mode and VSIX packaged mode.
 * @param url The URL to open
 * @returns Promise that resolves when the operation is complete
 * @throws Error if the operation fails
 */
export async function openExternal(url: string): Promise<void> {
	console.log("Opening browser:", url)
	try {
		// Use VS Code's native API which is the most reliable method
		await vscode.env.openExternal(vscode.Uri.parse(url))
	} catch (error) {
		console.error(`VS Code openExternal failed: ${error}`)
		// Fallback to the open package if VS Code API fails
		const { default: open } = await import("open")
		await open(url)
	}
}
```

- [ ] **Step 2: Verify the change compiles**

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | head -20`
Expected: No errors related to env.ts

- [ ] **Step 3: Commit**

```bash
git add src/utils/env.ts
git commit -m "fix: use VS Code native openExternal API for reliable URL opening"
```

---

## Task 4: Update VSCodeButtonLink to use onClick with openUrl gRPC call

**Covers:** Webview link handling for VSIX compatibility

**Files:**
- Modify: `webview-ui/src/components/common/VSCodeButtonLink.tsx`

- [ ] **Step 1: Update VSCodeButtonLink to handle clicks via gRPC**

Replace the entire file content:

```tsx
import React, { useCallback } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { UiServiceClient } from "@/services/grpc-client"
import { StringRequest } from "@shared/proto/aeriocode/common"

interface VSCodeButtonLinkProps {
	href: string
	children: React.ReactNode
	[key: string]: any
}

const VSCodeButtonLink: React.FC<VSCodeButtonLinkProps> = ({ href, children, ...props }) => {
	const handleClick = useCallback(
		async (e: React.MouseEvent) => {
			e.preventDefault()
			try {
				await UiServiceClient.openUrl(StringRequest.create({ value: href }))
			} catch (error) {
				console.error("Failed to open URL:", error)
				// Fallback: try opening via VSCodeLink behavior
				window.open(href, "_blank")
			}
		},
		[href],
	)

	return (
		<a
			href={href}
			onClick={handleClick}
			style={{
				textDecoration: "none",
				color: "inherit",
			}}>
			<VSCodeButton {...props}>{children}</VSCodeButton>
		</a>
	)
}

export default VSCodeButtonLink
```

- [ ] **Step 2: Verify the change compiles**

Run: `cd webview-ui && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to VSCodeButtonLink.tsx

- [ ] **Step 3: Commit**

```bash
git add webview-ui/src/components/common/VSCodeButtonLink.tsx
git commit -m "fix: use gRPC openUrl for VSCodeButtonLink clicks in VSIX"
```

---

## Task 5: Update WelcomeView to handle link clicks via gRPC

**Covers:** Welcome page hyperlink handling

**Files:**
- Modify: `webview-ui/src/components/welcome/WelcomeView.tsx`

- [ ] **Step 1: Add onClick handler to VSCodeLink in WelcomeView**

Update the VSCodeLink import and add click handler:

```tsx
import { VSCodeButton, VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { useCallback, useEffect, useState, memo } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { validateApiConfiguration } from "@/utils/validate"
import AeriocodeLogoWhite from "@/assets/AeriocodeLogoWhite"
import { AccountServiceClient, StateServiceClient, UiServiceClient } from "@/services/grpc-client"
import { EmptyRequest, BooleanRequest, StringRequest } from "@shared/proto/aeriocode/common"

const WelcomeView = memo(() => {
	const { apiConfiguration, mode } = useExtensionState()
  const [apiErrorMessage, setApiErrorMessage] = useState<string | undefined>(undefined)

	const disableLetsGoButton = apiErrorMessage != null

	const handleLogin = () => {
		AccountServiceClient.accountLoginClicked(EmptyRequest.create()).catch((err) =>
			console.error("Failed to get login URL:", err),
		)
	}

	const handleLinkClick = useCallback(async (url: string) => {
		try {
			await UiServiceClient.openUrl(StringRequest.create({ value: url }))
		} catch (error) {
			console.error("Failed to open URL:", error)
			window.open(url, "_blank")
		}
	}, [])

	const handleSubmit = async () => {
		try {
			await StateServiceClient.setWelcomeViewCompleted(BooleanRequest.create({ value: true }))
		} catch (error) {
			console.error("Failed to update API configuration or complete welcome view:", error)
		}
	}

	useEffect(() => {
		setApiErrorMessage(validateApiConfiguration(mode, apiConfiguration))
	}, [apiConfiguration, mode])

	return (
		<div className="fixed inset-0 p-0 flex flex-col">
			<div className="h-full px-5 overflow-auto">
                <h2 className="text-center">Hi, I'm Aeriocode</h2>
				<div className="flex justify-center my-5">
					<AeriocodeLogoWhite className="size-16" />
				</div>
				<p>
					I can do all kinds of tasks thanks to breakthroughs in{" "}
					<VSCodeLink href="https://www.aerio.bot" className="inline" onClick={(e) => { e.preventDefault(); handleLinkClick("https://www.aerio.bot") }}>
						Aerio's
					</VSCodeLink>
					agentic coding capabilities and access to tools that let me create & edit files, explore complex projects, use
					a browser, and execute terminal commands <i>(with your permission, of course)</i>. I can even use MCP to
					create new tools and extend my own capabilities.
				</p>

                <VSCodeButton appearance="primary" onClick={handleLogin} className="w-full mt-1">
                    Get Started for Free
                </VSCodeButton>
			</div>
		</div>
	)
})

export default WelcomeView
```

- [ ] **Step 2: Verify the change compiles**

Run: `cd webview-ui && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to WelcomeView.tsx

- [ ] **Step 3: Commit**

```bash
git add webview-ui/src/components/welcome/WelcomeView.tsx
git commit -m "fix: handle link clicks in WelcomeView via gRPC for VSIX compatibility"
```

---

## Task 6: Build and package the extension for testing

**Covers:** Verification of all changes

**Files:**
- None (build verification only)

- [ ] **Step 1: Build the webview**

Run: `cd webview-ui && npm run build`
Expected: Build succeeds without errors

- [ ] **Step 2: Build the extension**

Run: `npm run package`
Expected: Build succeeds without errors

- [ ] **Step 3: Package as VSIX**

Run: `npx vsce package --no-dependencies --out dist/aeriocode.vsix`
Expected: VSIX file created successfully

- [ ] **Step 4: Verify the VSIX contains the changes**

Run: `unzip -l dist/aeriocode.vsix | grep -E "(extension.js|index.css|index.js)"`
Expected: Shows the bundled files

---

## Summary

These changes address the three root causes of the VSIX link opening issue:

1. **esbuild.mjs**: Adds the missing `AERIOCODE_ENVIRONMENT` define to ensure consistent environment configuration
2. **WebviewProvider.ts**: Updates CSP to include `*.aeriocode.bot` domain for API calls
3. **env.ts**: Uses VS Code's native `openExternal` API as the primary method, with fallback to `open` package
4. **VSCodeButtonLink.tsx**: Handles link clicks via gRPC `openUrl` method for reliable URL opening
5. **WelcomeView.tsx**: Adds explicit click handlers for links to ensure they open via gRPC

These changes align the modified extension with the original extension's behavior while adding additional reliability for VSIX packaging.
