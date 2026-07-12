import { DiffViewProvider } from "@integrations/editor/DiffViewProvider"

export interface FileOpsResult {
	deleted?: boolean
	userEdits?: string
	autoFormattingEdits?: string
	finalContent?: string
	newProblemsMessage?: string
}

/**
 * Operations for file provider interactions.
 */
export class FileProviderOperations {
	constructor(private diffViewProvider: DiffViewProvider) {}

	async createFile(path: string, content: string, saveImmediately = true): Promise<void> {
		this.diffViewProvider.editType = "create"
		await this.diffViewProvider.open(path)
		await this.diffViewProvider.update(content, true)
		if (saveImmediately) {
			await this.diffViewProvider.saveChanges()
		}
	}

	async modifyFile(path: string, content: string, saveImmediately = true): Promise<void> {
		this.diffViewProvider.editType = "modify"
		await this.diffViewProvider.open(path)
		await this.diffViewProvider.update(content, true)
		if (saveImmediately) {
			await this.diffViewProvider.saveChanges()
		}
	}

	async deleteFile(path: string, saveImmediately = true): Promise<void> {
		this.diffViewProvider.editType = "modify"
		await this.diffViewProvider.open(path)
		await this.diffViewProvider.update("", true)
		if (saveImmediately) {
			await this.diffViewProvider.saveChanges()
		}
	}

	async saveChanges(): Promise<FileOpsResult> {
		const result = await this.diffViewProvider.saveChanges()
		return {
			finalContent: result?.finalContent,
			userEdits: result?.userEdits,
			autoFormattingEdits: result?.autoFormattingEdits,
			newProblemsMessage: result?.newProblemsMessage,
		}
	}
}
