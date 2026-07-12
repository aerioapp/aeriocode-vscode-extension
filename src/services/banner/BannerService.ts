import {
	type Banner,
	type BannerAction,
	type BannerRules,
	type BannersResponse,
	BannerActionType,
	type BannerCardData,
} from "@/shared/AerioBanner"
import { aeriocodeEnvConfig } from "@/config"
import { Controller } from "@/core/controller"
import { CacheService } from "@/core/storage/CacheService"
import { HostProvider } from "@/hosts/host-provider"
import { Logger } from "@services/logging/Logger"
import { FEATURE_FLAGS, type FeatureFlag } from "@/shared/services/feature-flags/feature-flags"
import { featureFlagsService } from "../feature-flags"

const DEFAULT_CACHE_DURATION_MS = 24 * 60 * 60 * 1000
const CIRCUIT_BREAKER_TIMEOUT_MS = 60 * 60 * 1000
const SERVER_ERROR_BACKOFF_MS = 15 * 60 * 1000
const AUTH_DEBOUNCE_MS = 1000
const FETCH_TIMEOUT_MS = 10000
const MAX_CONSECUTIVE_FAILURES = 3

const OS_MAP: Record<string, string> = {
	win32: "windows",
	linux: "linux",
	darwin: "macos",
}

const PROVIDER_ALIASES: Record<string, string[]> = {
	anthropic: ["anthropic", "claude-code"],
	openai: ["openai", "openai-native"],
	qwen: ["qwen", "qwen-code"],
}

interface DismissedBanner {
	bannerId: string
	dismissedAt: number
}

/**
 * Service for fetching and evaluating banner messages
 */
export class BannerService {
	private static instance: BannerService | null = null

	private cachedBanners: Banner[] = []
	private lastFetchTime = 0
	private backoffUntil = 0
	private consecutiveFailures = 0

	private userId: string | null = null

	private fetchPromise: Promise<Banner[]> | null = null
	private abortController: AbortController | null = null

	private debounceTimer: ReturnType<typeof setTimeout> | null = null
	private pendingDebounceResolve: (() => void) | null = null
	private authFetchPending = false

	private readonly validActionTypes: Set<string>

	private constructor(
		private readonly controller: Controller,
		private readonly cacheService: CacheService,
	) {
		this.validActionTypes = new Set(Object.values(BannerActionType))
		Logger.log("[BannerService] initialized")
	}

	public static initialize(controller: Controller): BannerService {
		if (BannerService.instance) {
			return BannerService.instance
		}
		BannerService.instance = new BannerService(controller, controller.cacheService)
		return BannerService.instance
	}

	public static get(): BannerService {
		if (!BannerService.instance) {
			throw new Error("BannerService not initialized. Call BannerService.initialize(controller) first.")
		}
		return BannerService.instance
	}

	public static reset(): void {
		const instance = BannerService.instance
		if (instance) {
			if (instance.debounceTimer) {
				clearTimeout(instance.debounceTimer)
				instance.debounceTimer = null
			}
			if (instance.pendingDebounceResolve) {
				instance.pendingDebounceResolve()
				instance.pendingDebounceResolve = null
			}
			instance.abortController?.abort()
			instance.abortController = null
			instance.fetchPromise = null
			instance.authFetchPending = false
		}
		BannerService.instance = null
	}

	public static async onAuthUpdate(userId: string | null): Promise<void> {
		const instance = BannerService.instance

		if (!instance || instance.userId === userId) return

		if (instance.debounceTimer) {
			clearTimeout(instance.debounceTimer)
			instance.debounceTimer = null
		}
		if (instance.pendingDebounceResolve) {
			instance.pendingDebounceResolve()
			instance.pendingDebounceResolve = null
		}

		instance.abortController?.abort()
		instance.abortController = null
		instance.fetchPromise = null

		instance.authFetchPending = true
		instance.userId = userId

		return new Promise<void>((resolve) => {
			instance.pendingDebounceResolve = resolve
			instance.debounceTimer = setTimeout(async () => {
				instance.debounceTimer = null
				instance.pendingDebounceResolve = null

				instance.consecutiveFailures = 0
				instance.backoffUntil = 0

				try {
					await instance.doFetch()
					Logger.info("[BannerService] Fetched")
				} finally {
					instance.authFetchPending = false
					resolve()
				}
			}, AUTH_DEBOUNCE_MS)
		})
	}

	public getActiveBanners(): BannerCardData[] {
		this.ensureFreshCache()

		const activeBanners = this.cachedBanners
			.filter((b) => b.placement !== "welcome")
			.filter((b) => !this.isBannerDismissed(b.id))
			.map((b) => this.toBannerCardData(b))
			.filter((b): b is BannerCardData => b !== null)

		return activeBanners
	}

	/**
	 * Returns welcome banners (placement === "welcome") for the What's New modal.
	 */
	public getWelcomeBanners(): BannerCardData[] | undefined {
		const isLocal = process.env.IS_DEV === "true" || process.env.AERIOCODE_ENVIRONMENT === "local"
		const flagEnabled = isLocal || featureFlagsService.getBooleanFlagEnabled(FEATURE_FLAGS.REMOTE_WELCOME_BANNERS)

		if (!flagEnabled) {
			return undefined
		}
		const bypassDismissals = process.env.IS_DEV === "true" || process.env.AERIOCODE_ENVIRONMENT === "local"

		this.ensureFreshCache()

		const welcomeCandidates = this.cachedBanners.filter((b) => b.placement === "welcome")

		const welcomeBanners = welcomeCandidates
			.filter((b) => bypassDismissals || !this.isBannerDismissed(b.id))
			.map((b) => this.toBannerCardData(b))
			.filter((b): b is BannerCardData => b !== null)

		return welcomeBanners
	}

	/**
	 * Testing hook for draining in-flight background fetch work deterministically.
	 */
	public async drainForTesting(): Promise<void> {
		await this.fetchPromise
	}

	private ensureFreshCache(): void {
		const now = Date.now()
		const cacheDurationMs = this.getCacheDurationMs()
		const shouldFetch =
			now >= this.backoffUntil &&
			now - this.lastFetchTime >= cacheDurationMs &&
			!this.fetchPromise &&
			!this.authFetchPending

		if (shouldFetch) {
			this.fetchPromise = this.doFetch()
			this.fetchPromise.finally(() => {
				this.fetchPromise = null
			})
		}
	}

	private getCacheDurationMs(): number {
		const flagPayload = featureFlagsService.getFlagPayload(FEATURE_FLAGS.EXTENSION_REMOTE_BANNERS_TTL)
		const ms = typeof flagPayload === "number" && Number.isFinite(flagPayload) ? flagPayload : DEFAULT_CACHE_DURATION_MS
		if (!Number.isFinite(ms) || ms <= 0) return DEFAULT_CACHE_DURATION_MS
		return ms
	}

	public clearCache(): void {
		this.abortController?.abort()
		this.abortController = null
		this.cachedBanners = []
		this.lastFetchTime = 0
		this.consecutiveFailures = 0
		this.backoffUntil = 0
		this.fetchPromise = null
		Logger.log("BannerService: Cache cleared and circuit breaker reset")
	}

	public async dismissBanner(bannerId: string): Promise<void> {
		try {
			const dismissed = (this.cacheService.getGlobalStateKey("dismissedBanners") as DismissedBanner[]) || []
			if (dismissed.some((b) => b.bannerId === bannerId)) return

			this.cacheService.setGlobalState("dismissedBanners", [...dismissed, { bannerId, dismissedAt: Date.now() }])

			await this.sendBannerEvent(bannerId, "dismiss")
			this.clearCache()
		} catch (error) {
			Logger.error("[BannerService] Error dismissing banner", error)
		}
	}

	public async sendBannerEvent(bannerId: string, eventType: "dismiss"): Promise<void> {
		try {
			const url = new URL("/banners/v2/messages", aeriocodeEnvConfig.apiBaseUrl).toString()
			const surface = "vscode"

			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

			await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(await this.buildBasicHeaders()),
				},
				body: JSON.stringify({
					banner_id: bannerId,
					instance_id: this.getInstanceId(),
					surface,
					event_type: eventType,
				}),
				signal: controller.signal,
			})

			clearTimeout(timeoutId)
			Logger.log(`[BannerService] Sent ${eventType} event for banner ${bannerId}`)
		} catch (error) {
			Logger.error("[BannerService] Error sending banner event", error)
		}
	}

	public isBannerDismissed(bannerId: string): boolean {
		try {
			const dismissed = (this.cacheService.getGlobalStateKey("dismissedBanners") as DismissedBanner[]) || []
			return dismissed.some((b) => b.bannerId === bannerId)
		} catch (error) {
			Logger.error("[BannerService] Error checking dismissed banner", error)
			return false
		}
	}

	private async doFetch(): Promise<Banner[]> {
		if (!featureFlagsService.getBooleanFlagEnabled(FEATURE_FLAGS.REMOTE_BANNERS)) {
			return []
		}

		this.abortController = new AbortController()
		const { signal } = this.abortController
		const timeoutId = setTimeout(() => this.abortController?.abort(), FETCH_TIMEOUT_MS)

		try {
			const url = this.buildFetchUrl()
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				...(await this.buildBasicHeaders()),
			}

			const response = await fetch(url, { method: "GET", headers, signal })
			clearTimeout(timeoutId)

			if (!response.ok) {
				throw Object.assign(new Error(`HTTP ${response.status}`), {
					status: response.status,
					headers: response.headers,
				})
			}

			const data = (await response.json()) as BannersResponse
			if (!data?.data?.items || !Array.isArray(data.data.items)) {
				Logger.log("BannerService: Invalid response format")
				return []
			}

			Logger.log(
				`[BannerService] Raw API response: ${data.data.items.length} items: ${JSON.stringify(
					data.data.items.map((b) => ({ id: b.id, placement: b.placement, titleMd: b.titleMd?.substring(0, 50) })),
				)}`,
			)

			const banners = data.data.items.filter((b) => this.matchesProviderRule(b))
			this.cachedBanners = banners
			this.lastFetchTime = Date.now()
			this.consecutiveFailures = 0

			Logger.log(
				`[BannerService] After provider filter: ${banners.length} banners: ${JSON.stringify(
					banners.map((b) => ({ id: b.id, placement: b.placement })),
				)}`,
			)

			this.controller.postStateToWebview().catch((error) => {
				Logger.error("Failed to post state to webview after fetching banners:", error as Error)
			})

			Logger.log(`[BannerService] Fetched ${banners.length} banner(s) at ${new Date(this.lastFetchTime).toISOString()}`)
			return banners
		} catch (error) {
			clearTimeout(timeoutId)

			if (error instanceof Error && error.name === "AbortError") {
				return this.cachedBanners
			}

			this.handleFetchError(error)
			return this.cachedBanners
		} finally {
			this.abortController = null
		}
	}

	private handleFetchError(error: unknown): void {
		this.consecutiveFailures++

		const typedError = error as { status?: number; headers?: { get(name: string): string | null } }
		const status = typedError.status

		let backoffMs = CIRCUIT_BREAKER_TIMEOUT_MS

		if (status === 429) {
			const retryAfter = typedError.headers?.get("retry-after")
			if (retryAfter) {
				const seconds = Number.parseInt(retryAfter, 10)
				if (!Number.isNaN(seconds)) {
					backoffMs = seconds * 1000
				} else {
					const date = new Date(retryAfter)
					if (!Number.isNaN(date.getTime())) {
						backoffMs = Math.max(0, date.getTime() - Date.now())
					}
				}
			}
		} else if (status && status >= 500 && status < 600) {
			backoffMs = SERVER_ERROR_BACKOFF_MS
		}

		this.backoffUntil = Date.now() + backoffMs

		if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
			this.backoffUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT_MS
			const msg =
				this.consecutiveFailures === MAX_CONSECUTIVE_FAILURES ? "Circuit breaker tripped" : "Half-open recovery failed"
			Logger.log(`BannerService: ${msg}, will allow recovery attempt after 1 hour`)
		}

		Logger.error(
			`[BannerService] Failed ${this.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}. ` +
				`Backing off for ${Math.ceil(backoffMs / 60000)} minutes`,
		)
	}

	private buildFetchUrl(): string {
		const url = new URL("/banners/v2/messages", aeriocodeEnvConfig.apiBaseUrl)
		url.searchParams.set("ide", "vscode")
		url.searchParams.set("extension_version", this.getVersion())
		url.searchParams.set("os", OS_MAP[process.platform] || "unknown")
		return url.toString()
	}

	private getVersion(): string {
		try {
			// Try to get version from package.json
			const pkg = require("../../../package.json")
			return pkg.version || "unknown"
		} catch {
			return "unknown"
		}
	}

	private getInstanceId(): string {
		// Generate a stable instance ID based on machine info
		const os = require("os")
		return os.hostname() || "unknown"
	}

	private async buildBasicHeaders(): Promise<Record<string, string>> {
		return {
			"x-aeriocode-version": this.getVersion(),
		}
	}

	private matchesProviderRule(banner: Banner): boolean {
		try {
			const rules: BannerRules = JSON.parse(banner.rulesJson || "{}")
			if (!rules?.providers?.length) return true

			return rules.providers.some((ruleProvider: string) => {
				for (const [, aliases] of Object.entries(PROVIDER_ALIASES)) {
					if (aliases.includes(ruleProvider)) {
						return aliases.includes("aeriocode")
					}
				}
				return ruleProvider === "aeriocode"
			})
		} catch (error) {
			Logger.log(
				`[BannerService] Error parsing provider rules for banner ${banner.id}: ` +
					`${error instanceof Error ? error.message : String(error)}`,
			)
			return true
		}
	}

	private getBannerActions(banner: Banner): BannerAction[] {
		return banner.actions ?? []
	}

	private toBannerCardData(banner: Banner): BannerCardData | null {
		const actions = this.getBannerActions(banner)

		for (const action of actions) {
			if (!action.action || !this.validActionTypes.has(action.action) || !action.title) {
				Logger.error(`[BannerService] Invalid action type (${action.action}) for banner ${banner.id}`)
				return null
			}
		}

		return {
			id: banner.id,
			title: banner.titleMd,
			description: banner.bodyMd,
			icon: banner.icon,
			actions: actions.map((a) => ({
				title: a.title || "",
				action: a.action as BannerActionType,
				arg: a.arg,
			})),
		}
	}
}
