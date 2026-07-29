import * as path from "path"
import * as os from "os"
import * as vscode from "vscode"
import { arePathsEqual } from "@utils/path"
import { HostProvider } from "@/hosts/host-provider"
import { ShowMessageRequest, ShowMessageType } from "@/shared/proto/host/window"
import { writeFile } from "@utils/fs"

export async function openImage(dataUri: string) {
	const matches = dataUri.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/)
	if (!matches) {
		HostProvider.window.showMessage({
			type: ShowMessageType.ERROR,
			message: "Invalid data URI format",
		})
		return
	}
	const [, format, base64Data] = matches
	const imageBuffer = Buffer.from(base64Data, "base64")
	const tempFilePath = path.join(os.tmpdir(), `temp_image_${Date.now()}.${format}`)
	try {
		await writeFile(tempFilePath, new Uint8Array(imageBuffer))
		await HostProvider.window.openFile({
			filePath: tempFilePath,
		})
	} catch (error) {
		HostProvider.window.showMessage({
			type: ShowMessageType.ERROR,
			message: `Error opening image: ${error}`,
		})
	}
}

export async function openFile(absolutePath: string) {
	try {
		const uri = vscode.Uri.file(absolutePath)

		// Check if the document is already open in a tab group that's not in the active editor's column. If it is, then close it (if not dirty) so that we don't duplicate tabs
		try {
			for (const group of vscode.window.tabGroups.all) {
				const existingTab = group.tabs.find(
					(tab) => tab.input instanceof vscode.TabInputText && arePathsEqual(tab.input.uri.fsPath, uri.fsPath),
				)
				if (existingTab) {
					const activeColumn = vscode.window.activeTextEditor?.viewColumn
					const tabColumn = vscode.window.tabGroups.all.find((group) => group.tabs.includes(existingTab))?.viewColumn
					if (activeColumn && activeColumn !== tabColumn && !existingTab.isDirty) {
						await vscode.window.tabGroups.close(existingTab)
					}
					break
				}
			}
		} catch {} // not essential, sometimes tab operations fail

		await HostProvider.window.showTextDocument({
			path: uri.fsPath,
			options: { preview: false },
		})
	} catch (error) {
		HostProvider.window.showMessage({
			type: ShowMessageType.ERROR,
			message: `Could not open file!`,
		})
	}
}

/**
 * Open a file with the cursor on a given 1-based line.
 *
 * The host bridge's showTextDocument has no selection concept, so the reveal is done here
 * where direct editor access is the norm, rather than in a controller handler.
 */
export async function openFileAtLine(absolutePath: string, line: number) {
	try {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath))

		// Clamp: a finding from an earlier run can point past the end of a file the user has
		// since shortened, and that should still open rather than throw.
		const targetLine = Math.min(Math.max(0, line - 1), Math.max(0, document.lineCount - 1))
		const position = new vscode.Position(targetLine, 0)

		await HostProvider.window.showTextDocument({ path: absolutePath, options: { preview: false } })

		// The host bridge returns no editor handle, so the reveal is done against the active
		// editor — which showTextDocument has just made this document.
		const editor = vscode.window.activeTextEditor
		if (editor && arePathsEqual(editor.document.uri.fsPath, document.uri.fsPath)) {
			editor.selection = new vscode.Selection(position, position)
			editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter)
		}
	} catch (error) {
		console.error("Could not open file at line:", error)
	}
}
