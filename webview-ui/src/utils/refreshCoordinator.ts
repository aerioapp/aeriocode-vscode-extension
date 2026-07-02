/**
 * Refresh Coordinator - Prevents duplicate API calls and coordinates refresh timing
 * across different components to avoid rate limiting issues.
 */

type RefreshCallback = () => Promise<void>
type RefreshKey = string

interface RefreshRequest {
	key: RefreshKey
	callback: RefreshCallback
	priority: number // Higher priority requests execute first
}

interface RefreshState {
	isRefreshing: boolean
	lastRefresh: number
	queuedRequests: RefreshRequest[]
}

class RefreshCoordinator {
	private static instance: RefreshCoordinator
	private refreshStates: Map<RefreshKey, RefreshState> = new Map()
	private globalCooldown = 5000 // 5 second global cooldown between refreshes
	private lastGlobalRefresh = 0

	private constructor() {}

	static getInstance(): RefreshCoordinator {
		if (!RefreshCoordinator.instance) {
			RefreshCoordinator.instance = new RefreshCoordinator()
		}
		return RefreshCoordinator.instance
	}

	/**
	 * Register a refresh request and coordinate execution
	 */
	async coordinateRefresh(key: RefreshKey, callback: RefreshCallback, priority = 0): Promise<void> {
		const now = Date.now()

		// Check global cooldown
		const timeSinceLastGlobalRefresh = now - this.lastGlobalRefresh
		if (timeSinceLastGlobalRefresh < this.globalCooldown) {
			const waitTime = this.globalCooldown - timeSinceLastGlobalRefresh
			console.log(`RefreshCoordinator: Waiting ${waitTime}ms due to global cooldown`)
			await this.sleep(waitTime)
		}

		// Get or create refresh state for this key
		let state = this.refreshStates.get(key)
		if (!state) {
			state = {
				isRefreshing: false,
				lastRefresh: 0,
				queuedRequests: [],
			}
			this.refreshStates.set(key, state)
		}

		// Check if we need to wait due to key-specific cooldown (30 seconds)
		const timeSinceLastRefresh = now - state.lastRefresh
		const keyCooldown = 30000 // 30 seconds per key
		if (timeSinceLastRefresh < keyCooldown) {
			// If we have recent data, skip this refresh
			console.log(`RefreshCoordinator: Skipping refresh for ${key} - last refresh was ${timeSinceLastRefresh}ms ago`)
			return
		}

		// Add request to queue
		const request: RefreshRequest = { key, callback, priority }
		state.queuedRequests.push(request)

		// Sort by priority (higher first)
		state.queuedRequests.sort((a, b) => b.priority - a.priority)

		// If already refreshing, wait for current refresh to complete
		if (state.isRefreshing) {
			console.log(`RefreshCoordinator: Refresh already in progress for ${key}, queuing request`)
			return
		}

		// Execute the refresh
		await this.executeRefresh(key)
	}

	private async executeRefresh(key: RefreshKey): Promise<void> {
		const state = this.refreshStates.get(key)
		if (!state) return

		state.isRefreshing = true
		this.lastGlobalRefresh = Date.now()

		try {
			// Execute all queued requests for this key
			while (state.queuedRequests.length > 0) {
				const request = state.queuedRequests.shift()
				if (request) {
					console.log(`RefreshCoordinator: Executing refresh for ${key}`)
					await request.callback()
				}
			}

			// Update last refresh time
			state.lastRefresh = Date.now()
		} catch (error) {
			console.error(`RefreshCoordinator: Error executing refresh for ${key}:`, error)
		} finally {
			state.isRefreshing = false
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}
}

export const refreshCoordinator = RefreshCoordinator.getInstance()
