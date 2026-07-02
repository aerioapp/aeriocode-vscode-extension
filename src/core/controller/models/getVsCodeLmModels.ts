import { Controller } from ".."
import { EmptyRequest } from "@shared/proto/aeriocode/common"
import { VsCodeLmModelsArray } from "@shared/proto/aeriocode/models"

/**
 * Fetches available models from VS Code LM API
 * @param controller The controller instance
 * @param request Empty request
 * @returns Array of VS Code LM models (empty since we only support Aeriocode)
 */
export async function getVsCodeLmModels(controller: Controller, request: EmptyRequest): Promise<VsCodeLmModelsArray> {
	// Return empty array since VSCode LM API is not supported - we only use Aeriocode
	return VsCodeLmModelsArray.create({ models: [] })
}
