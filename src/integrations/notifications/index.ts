import * as vscode from "vscode"

interface NotificationOptions {
	subtitle: string
	message: string
}

/**
 * Shows a system notification to the user.
 */
export function showSystemNotification(options: NotificationOptions): void {
	vscode.window.showInformationMessage(`${options.subtitle}: ${options.message}`)
}
