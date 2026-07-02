import { type ReactNode, useEffect } from "react"
import { useExtensionState } from "./context/ExtensionStateContext"

export function InternalTelemetryProvider({ children }: { children: ReactNode }) {
	const { telemetrySetting, distinctId, version, userInfo } = useExtensionState()

	// NOTE: Internal telemetry system - PostHog completely removed
	// const isTelemetryEnabled = telemetrySetting !== "disabled";
	const isTelemetryEnabled = false

	useEffect(() => {
		// Internal telemetry initialization would go here
		// For now, just log for debugging
		console.log("[InternalTelemetryProvider] Telemetry setting:", telemetrySetting)
	}, [telemetrySetting])

	useEffect(() => {
		if (!isTelemetryEnabled || !distinctId || !version) {
			return
		}

		// Internal telemetry user identification would go here
		console.log("[InternalTelemetryProvider] Would identify user:", {
			distinctId,
			version,
			userInfo,
		})
	}, [isTelemetryEnabled, distinctId, version, userInfo])

	// Return children directly - no PostHog provider needed
	return <>{children}</>
}
