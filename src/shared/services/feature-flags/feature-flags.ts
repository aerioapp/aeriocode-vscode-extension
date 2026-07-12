export const FEATURE_FLAGS = {
	CUSTOM_INSTRUCTIONS: "custom-instructions",
	DEV_ENV_POSTHOG: "dev-env-posthog",
	REMOTE_BANNERS: "remote-banners",
	REMOTE_WELCOME_BANNERS: "remote-welcome-banners",
	EXTENSION_REMOTE_BANNERS_TTL: "extension-remote-banners-ttl",
	WEBTOOLS: "webtools",
	WORKTREES: "worktrees",
	ONBOARDING_MODELS: "onboarding-models",
} as const

export type FeatureFlag = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS]

export const FeatureFlagDefaultValue: Partial<Record<FeatureFlag, any>> = {
	[FEATURE_FLAGS.REMOTE_BANNERS]: false,
	[FEATURE_FLAGS.REMOTE_WELCOME_BANNERS]: false,
	[FEATURE_FLAGS.EXTENSION_REMOTE_BANNERS_TTL]: 24 * 60 * 60 * 1000,
	[FEATURE_FLAGS.WEBTOOLS]: false,
	[FEATURE_FLAGS.WORKTREES]: false,
}
