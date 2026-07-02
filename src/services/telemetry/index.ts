/**
 * Internal Telemetry System for Aeriocode Extension
 *
 * This module provides a complete replacement for PostHog telemetry
 * using an internal backend API for data collection and management.
 */

// Export the main telemetry manager
export { telemetryManager } from "./TelemetryManager"
export { TelemetryManager } from "./TelemetryManager"

// Export the internal telemetry service
export { InternalTelemetryService } from "./InternalTelemetryService"

// Export the compatibility provider that replaces PostHogClientProvider
export { InternalTelemetryClientProvider, internalTelemetryClientProvider } from "./InternalTelemetryClientProvider"

// Export the compatibility telemetry service
export { CompatibilityTelemetryService } from "./CompatibilityTelemetryService"

// Import types for compatibility
import type { ErrorService } from "../error/ErrorService"
import type { FeatureFlagsService } from "../posthog/feature-flags/FeatureFlagsService"
import type { CompatibilityTelemetryService } from "./CompatibilityTelemetryService"

// Re-export the existing service interfaces for compatibility
export type { ErrorService } from "../error/ErrorService"
export type { FeatureFlagsService } from "../posthog/feature-flags/FeatureFlagsService"

// Create compatibility exports that match the old PostHogClientProvider interface
import { InternalTelemetryClientProvider } from "./InternalTelemetryClientProvider"

// Create singleton instances that match the old interface
const provider = InternalTelemetryClientProvider.getInstance()

// Export the same service accessors that the old PostHogClientProvider used
export const featureFlagsService = provider.featureFlags
export const errorService = provider.error
export const telemetryService = provider.telemetry

// Export the main provider class with the same name as the old PostHogClientProvider
// This allows for drop-in replacement
export const PostHogClientProvider = InternalTelemetryClientProvider
export { PostHogClientProvider as TelemetryClientProvider }

// Export convenience functions that match the old interface
export const getFeatureFlagsService = (): FeatureFlagsService => provider.featureFlags
export const getErrorService = (): ErrorService => provider.error
export const getTelemetryService = (): CompatibilityTelemetryService => provider.telemetry
