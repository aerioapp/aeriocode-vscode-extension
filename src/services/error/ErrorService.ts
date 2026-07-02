import * as pkg from "../../../package.json"
import type { ITelemetryProvider } from "../telemetry/ITelemetryProvider"
import { AeriocodeError } from "./AeriocodeError"

const isDev = process.env.IS_DEV === "true"

export class ErrorService {
	private telemetryProvider: ITelemetryProvider

	constructor(telemetryProvider: ITelemetryProvider, _distinctId: string) {
		this.telemetryProvider = telemetryProvider
	}

	public logException(error: Error | AeriocodeError): void {
		const errorDetails = {
			message: error.message,
			stack: error.stack,
			name: error.name,
			extension_version: pkg.version,
			is_dev: isDev,
		}

		if (error instanceof AeriocodeError) {
			Object.assign(errorDetails, {
				modelId: error.modelId,
				providerId: error.providerId,
				serialized_error: error.serialize(),
			})
		}

		this.telemetryProvider.log("extension.error", {
			error_type: "exception",
			...errorDetails,
			timestamp: new Date().toISOString(),
		})

		console.error("[ErrorService] Logging", error)
	}

	public logMessage(message: string, level: "error" | "warning" | "log" | "debug" | "info" = "log"): void {
		this.telemetryProvider.log("extension.message", {
			message: message.substring(0, 500),
			level,
			extension_version: pkg.version,
			is_dev: isDev,
			timestamp: new Date().toISOString(),
		})
	}

	public toAeriocodeError(rawError: unknown, modelId?: string, providerId?: string): AeriocodeError {
		const transformed = AeriocodeError.transform(rawError, modelId, providerId)
		this.logException(transformed)
		return transformed
	}
}
