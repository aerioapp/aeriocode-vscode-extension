/* eslint-disable eslint-rules/no-direct-vscode-api */
import { describe, it, beforeEach, afterEach } from "mocha"
import { strict as assert } from "assert"
import * as vscode from "vscode"
import * as os from "os"
import * as path from "path"
import pWaitFor from "p-wait-for"
import { getOpenTabs } from "@/hosts/vscode/hostbridge/window/getOpenTabs"
import { GetOpenTabsRequest } from "@/shared/proto/host/window"

describe("Hostbridge - Window - getOpenTabs", () => {
	const tempFiles: vscode.Uri[] = []

	async function createAndOpenTestDocument(fileNumber: number, column: vscode.ViewColumn): Promise<void> {
		const content = `// Test file ${fileNumber}\nconsole.log('Hello from file ${fileNumber}');`

		const tempDir = path.join(os.tmpdir(), "aeriocode-getOpenTabs-test")
		await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempDir))

		const filePath = path.join(tempDir, `test-file-${fileNumber}.js`)
		const uri = vscode.Uri.file(filePath)
		await vscode.workspace.fs.writeFile(uri, Buffer.from(content))

		tempFiles.push(uri)

		const doc = await vscode.workspace.openTextDocument(uri)
		await vscode.window.showTextDocument(doc, {
			viewColumn: column,
			preview: false,
		})
	}

	beforeEach(async () => {
		await vscode.commands.executeCommand("workbench.action.closeAllEditors")
	})

	afterEach(async () => {
		await vscode.commands.executeCommand("workbench.action.closeAllEditors")
		for (const uri of tempFiles) {
			try {
				await vscode.workspace.fs.delete(uri)
			} catch {
				// ignore cleanup errors
			}
		}
		tempFiles.length = 0
	})

	it("should return empty array when no tabs are open", async () => {
		await vscode.commands.executeCommand("workbench.action.closeAllEditors")

		const request = GetOpenTabsRequest.create({})
		const response = await getOpenTabs(request)

		assert.strictEqual(
			response.paths.length,
			0,
			`Should return empty array when no tabs are open. Found: ${JSON.stringify(response.paths)}`,
		)
	})

	it("should return paths of open text document tabs", async () => {
		await createAndOpenTestDocument(1, vscode.ViewColumn.One)
		await createAndOpenTestDocument(2, vscode.ViewColumn.Two)

		await pWaitFor(
			async () => {
				const request = GetOpenTabsRequest.create({})
				const response = await getOpenTabs(request)
				return response.paths.length === 2
			},
			{
				timeout: 4000,
				interval: 50,
			},
		)

		const request = GetOpenTabsRequest.create({})
		const response = await getOpenTabs(request)

		assert.strictEqual(
			response.paths.length,
			2,
			`Expected 2 tabs, got ${response.paths.length}. Found tabs: ${JSON.stringify(response.paths)}`,
		)
	})

	it("should return all open tabs even when multiple files are opened in the same ViewColumn", async () => {
		await createAndOpenTestDocument(1, vscode.ViewColumn.One)
		await createAndOpenTestDocument(2, vscode.ViewColumn.One)
		await createAndOpenTestDocument(3, vscode.ViewColumn.One)

		await pWaitFor(
			async () => {
				const request = GetOpenTabsRequest.create({})
				const response = await getOpenTabs(request)
				return response.paths.length === 3
			},
			{
				timeout: 4000,
				interval: 50,
			},
		)

		const request = GetOpenTabsRequest.create({})
		const response = await getOpenTabs(request)

		assert.strictEqual(
			response.paths.length,
			3,
			`Expected 3 open tabs, got ${response.paths.length}. Found: ${JSON.stringify(response.paths)}`,
		)
	})
})
