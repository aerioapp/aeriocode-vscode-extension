import * as path from "path"
import type { TaskConfig } from "../types/TaskConfig"

export interface PathResolution {
	absolutePath: string
	resolvedPath: string
}

/**
 * Resolves a workspace-relative path to an absolute path.
 */
export function resolveWorkspacePath(config: TaskConfig, filePath: string, _context: string): PathResolution {
	const absolutePath = path.resolve(config.cwd, filePath)
	return {
		absolutePath,
		resolvedPath: filePath,
	}
}
