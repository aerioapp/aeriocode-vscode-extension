import { resolveWorkspacePath } from "./workspacePath"
import { ToolValidator } from "./ToolValidator"
import type { TaskConfig } from "../types/TaskConfig"

export interface PathResolution {
	absolutePath: string
	resolvedPath: string
}

/**
 * Resolves and validates file paths for tool operations.
 */
export class PathResolver {
	constructor(
		private config: TaskConfig,
		private validator: ToolValidator,
	) {}

	/**
	 * Resolves a relative path to an absolute path and validates access.
	 */
	async resolveAndValidate(path: string, context: string): Promise<PathResolution | undefined> {
		try {
			const pathResult = resolveWorkspacePath(this.config, path, context)
			const absolutePath = typeof pathResult === "string" ? pathResult : pathResult.absolutePath
			const resolvedPath = typeof pathResult === "string" ? path : pathResult.resolvedPath

			const accessValidation = this.validator.checkAeriocodeIgnorePath(resolvedPath)
			if (!accessValidation.ok) {
				return undefined
			}

			return { absolutePath, resolvedPath }
		} catch {
			return undefined
		}
	}
}
