import type { Controller } from "../index"
import { EmptyRequest, Empty } from "@shared/proto/aeriocode/common"

import { getAllExtensionState, getGlobalState, updateGlobalState } from "../../storage/state"
import { sendMcpMarketplaceCatalogEvent } from "../mcp/subscribeToMcpMarketplaceCatalog"
import { telemetryService } from "@/services/telemetry"
import { McpMarketplaceCatalog } from "@shared/mcp"

/**
 * Initialize webview when it launches
 * @param controller The controller instance
 * @param request The empty request
 * @returns Empty response
 */
export async function initializeWebview(controller: Controller, request: EmptyRequest): Promise<Empty> {
	try {
		// Populate file paths for workspace tracker (don't await)
		controller.workspaceTracker?.populateFilePaths()

		// For Aeriocode-only support, we don't need to fetch external models
		// The model info is already defined in the backendDefaultModelInfo

		// Send cached MCP marketplace catalog if available
		getGlobalState(controller.context, "mcpMarketplaceCatalog").then((mcpMarketplaceCatalog) => {
			if (mcpMarketplaceCatalog) {
				sendMcpMarketplaceCatalogEvent(mcpMarketplaceCatalog as McpMarketplaceCatalog)
			}
		})

		// Silently refresh MCP marketplace catalog
		controller.silentlyRefreshMcpMarketplace()

		// Initialize telemetry service with user's current setting
		controller.getStateToPostToWebview().then((state) => {
			const { telemetrySetting } = state
			const isOptedIn = telemetrySetting !== "disabled"
			telemetryService.updateTelemetryState(isOptedIn)
		})

		return Empty.create({})
	} catch (error) {
		console.error("Failed to initialize webview:", error)
		// Return empty response even on error to not break the frontend
		return Empty.create({})
	}
}
