export enum Environment {
	production = "production",
	staging = "staging",
	local = "local",
}

interface EnvironmentConfig {
	appBaseUrl: string
	apiBaseUrl: string
	mcpBaseUrl: string
}

function getAeriocodeEnv(): Environment {
	const _env = process.env.AERIOCODE_ENVIRONMENT
	if (_env && Object.values(Environment).includes(_env as Environment)) {
		return _env as Environment
	}
	return Environment.production
}

// Config getter function to avoid storing all configs in memory
function getEnvironmentConfig(env: Environment): EnvironmentConfig {
	switch (env) {
		case Environment.staging:
			return {
				appBaseUrl: "https://staging-app.aeriocode.bot",
				apiBaseUrl: "https://core-api.staging.int.aeriocode.bot",
				mcpBaseUrl: "https://api.aeriocode.bot/v1/mcp",
			}
		case Environment.local:
			return {
				appBaseUrl: "http://code.localhost:9080",
				apiBaseUrl: "http://code.localhost:9080",
				mcpBaseUrl: "http://code.localhost:9080/v1/mcp",
			}
		default:
			return {
				appBaseUrl: "https://code.aerio.bot",
				apiBaseUrl: "https://code.aerio.bot",
				mcpBaseUrl: "https://code.aerio.bot/v1/mcp",
			}
	}
}

// Get environment once at module load
const AERIOCODE_ENVIRONMENT = getAeriocodeEnv()
const _configCache = getEnvironmentConfig(AERIOCODE_ENVIRONMENT)

console.info("Aeriocode environment:", AERIOCODE_ENVIRONMENT)

export const aeriocodeEnvConfig = _configCache
