/**
 * Banner types for AerioCode
 * These types define the structure of banner data used by the BannerService.
 */

export enum BannerActionType {
	VISIT_URL = "visit_url",
	DISMISS = "dismiss",
}

export interface BannerAction {
	action: BannerActionType
	title: string
	arg?: string
}

export interface Banner {
	id: string
	titleMd: string
	bodyMd?: string
	icon?: string
	placement: "sidebar" | "welcome"
	actions?: BannerAction[]
	rulesJson?: string
}

export interface BannerRules {
	providers?: string[]
	versions?: string[]
}

export interface BannerCardData {
	id: string
	title: string
	description?: string
	icon?: string
	actions: Array<{
		title: string
		action: BannerActionType
		arg?: string
	}>
}

export interface BannersResponse {
	data: {
		items: Banner[]
	}
}
