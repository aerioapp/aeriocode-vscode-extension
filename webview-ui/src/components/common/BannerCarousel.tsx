import { ChevronLeft, ChevronRight, X } from "lucide-react"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface BannerActions {
	label: string
	onClick: () => void
	disabled?: boolean
}

export interface BannerData {
	id: string
	icon?: React.ReactNode
	title: string
	description: string | React.ReactNode
	actions?: BannerActions[]
	onDismiss?: () => void
}

interface BannerCarouselProps {
	banners: BannerData[]
}

interface BannerCardContentProps {
	banner: BannerData
	isActive: boolean
	isTransitioning: boolean
	showDismissButton: boolean
}

const BannerCardContent: React.FC<BannerCardContentProps> = ({ banner, isActive, isTransitioning, showDismissButton }) => {
	return (
		<div
			className={cn("p-3 transition-opacity duration-400 ease-in-out opacity-0", {
				"opacity-100": isActive && !isTransitioning,
				"cursor-auto": isActive,
			})}
			style={{
				gridArea: "stack",
				pointerEvents: isActive ? "auto" : "none",
			}}>
			<h3
				className={cn("font-semibold mb-2 flex items-center text-base pr-0", {
					"gap-2": banner.icon,
					"pr-6": showDismissButton,
				})}
				style={{ color: "var(--vscode-foreground)" }}>
				{banner.icon && <span className="shrink-0">{banner.icon}</span>}
				{banner.title}
			</h3>

			{typeof banner.description === "string" ? (
				<div
					className="text-sm leading-relaxed [&>*:last-child]:mb-0 [&_a]:hover:underline"
					style={{ color: "var(--vscode-descriptionForeground)" }}>
					{banner.description}
				</div>
			) : (
				<div className="text-sm leading-relaxed" style={{ color: "var(--vscode-descriptionForeground)" }}>
					{banner.description}
				</div>
			)}

			{banner.actions?.length ? (
				<div className="flex flex-wrap gap-2 mt-3">
					{banner.actions.map((action) => (
						<button
							disabled={action.disabled}
							key={action.label}
							onClick={action.onClick}
							className="px-3 py-1 text-sm rounded border border-[var(--vscode-editorGroup-border)] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
							{action.label}
						</button>
					))}
				</div>
			) : null}
		</div>
	)
}

export const BannerCarousel: React.FC<BannerCarouselProps> = ({ banners }) => {
	const [currentIndex, setCurrentIndex] = useState(0)
	const [isPaused, setIsPaused] = useState(false)
	const [isTransitioning, setIsTransitioning] = useState(false)
	const autoPlayIntervalRef = useRef<NodeJS.Timeout | null>(null)

	const safeCurrentIndex = useMemo(
		() => (banners.length === 0 ? 0 : Math.min(currentIndex, banners.length - 1)),
		[currentIndex, banners.length],
	)

	const transitionToIndex = useCallback((newIndex: number) => {
		setIsTransitioning(true)
		setTimeout(() => {
			setCurrentIndex(newIndex)
			setIsTransitioning(false)
		}, 200)
	}, [])

	const handlePrevious = useCallback(() => {
		const newIndex = currentIndex === 0 ? banners.length - 1 : currentIndex - 1
		transitionToIndex(newIndex)
		setIsPaused(true)
	}, [currentIndex, banners.length, transitionToIndex])

	const handleNext = useCallback(() => {
		const newIndex = currentIndex === banners.length - 1 ? 0 : currentIndex + 1
		transitionToIndex(newIndex)
		setIsPaused(true)
	}, [currentIndex, banners.length, transitionToIndex])

	useEffect(() => {
		if (currentIndex >= banners.length && banners.length > 0) {
			setCurrentIndex(banners.length - 1)
		}
	}, [banners.length, currentIndex])

	useEffect(() => {
		if (banners.length <= 1 || isPaused) {
			return
		}

		autoPlayIntervalRef.current = setInterval(() => {
			setCurrentIndex((prevIndex) => (prevIndex + 1) % banners.length)
		}, 6500)

		return () => {
			if (autoPlayIntervalRef.current) {
				clearInterval(autoPlayIntervalRef.current)
			}
		}
	}, [banners.length, isPaused])

	if (banners.length === 0) {
		return null
	}

	const currentBanner = banners[safeCurrentIndex]

	if (!currentBanner) {
		return null
	}

	const showDismissButton = !!currentBanner.onDismiss

	return (
		<div
			aria-label="Announcements"
			aria-live="polite"
			aria-roledescription="carousel"
			className="mx-3 mb-3"
			onMouseEnter={() => setIsPaused(true)}
			onMouseLeave={() => setIsPaused(false)}
			role="region">
			<div className="relative rounded-sm" style={{ backgroundColor: "var(--vscode-textBlockQuote-background)" }}>
				{showDismissButton && (
					<button
						aria-label="Dismiss banner"
						className="absolute top-2.5 right-2 z-10 p-1 bg-transparent border-none cursor-pointer hover:opacity-70"
						onClick={(e) => {
							e.stopPropagation()
							currentBanner.onDismiss?.()
						}}
						type="button">
						<X className="w-4 h-4" style={{ color: "var(--vscode-foreground)" }} />
					</button>
				)}

				<div className="grid" style={{ gridTemplateAreas: "'stack'" }}>
					{banners.map((banner, idx) => {
						const isActive = idx === safeCurrentIndex
						const showDismiss = !!banner.onDismiss

						return (
							<BannerCardContent
								banner={banner}
								isActive={isActive}
								isTransitioning={isTransitioning}
								key={banner.id}
								showDismissButton={showDismiss}
							/>
						)
					})}
				</div>

				{banners.length > 1 && (
					<div
						className="flex justify-between items-center px-3 py-1.5 border-t"
						style={{ borderColor: "var(--vscode-descriptionForeground)", opacity: 0.15 }}>
						<div className="text-sm" style={{ color: "var(--vscode-descriptionForeground)" }}>
							{safeCurrentIndex + 1} / {banners.length}
						</div>

						<div className="flex gap-0.5">
							<button
								aria-label="Previous banner"
								onClick={handlePrevious}
								className="p-1 bg-transparent border-none cursor-pointer hover:opacity-70"
								type="button">
								<ChevronLeft className="size-4" style={{ color: "var(--vscode-foreground)" }} />
							</button>
							<button
								aria-label="Next banner"
								onClick={handleNext}
								className="p-1 bg-transparent border-none cursor-pointer hover:opacity-70"
								type="button">
								<ChevronRight className="size-4" style={{ color: "var(--vscode-foreground)" }} />
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

export default BannerCarousel
