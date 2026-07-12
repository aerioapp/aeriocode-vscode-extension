import { AutoApprovalSettings } from "../../AutoApprovalSettings"
import { AutoApprovalSettingsRequest } from "@shared/proto/aeriocode/state"

// Converts domain AutoApprovalSettings to proto AutoApprovalSettingsRequest
export function convertAutoApprovalSettingsToProto(settings: AutoApprovalSettings): AutoApprovalSettingsRequest {
	return {
		metadata: {},
		version: settings.version,
		actions: {
			readFiles: settings.actions.readFiles || false,
			readFilesExternally: settings.actions.readFilesExternally || false,
			editFiles: settings.actions.editFiles || false,
			editFilesExternally: settings.actions.editFilesExternally || false,
			executeSafeCommands: settings.actions.executeSafeCommands || false,
			executeAllCommands: settings.actions.executeAllCommands || false,
			useBrowser: settings.actions.useBrowser || false,
			useMcp: settings.actions.useMcp || false,
		},
		enableNotifications: settings.enableNotifications || false,
	}
}

// Converts proto AutoApprovalSettingsRequest to domain AutoApprovalSettings
export function convertProtoToAutoApprovalSettings(protoSettings: AutoApprovalSettingsRequest): AutoApprovalSettings {
	return {
		version: protoSettings.version,
		enabled: true,
		actions: {
			readFiles: protoSettings.actions?.readFiles || false,
			readFilesExternally: protoSettings.actions?.readFilesExternally || false,
			editFiles: protoSettings.actions?.editFiles || false,
			editFilesExternally: protoSettings.actions?.editFilesExternally || false,
			executeSafeCommands: protoSettings.actions?.executeSafeCommands || false,
			executeAllCommands: protoSettings.actions?.executeAllCommands || false,
			useBrowser: protoSettings.actions?.useBrowser || false,
			useMcp: protoSettings.actions?.useMcp || false,
		},
		maxRequests: 20,
		enableNotifications: protoSettings.enableNotifications || false,
		favorites: [],
	}
}
