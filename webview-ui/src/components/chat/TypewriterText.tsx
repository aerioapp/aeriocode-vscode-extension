import { memo, useEffect, useState } from "react"

export const TypewriterText = memo(({ text, speed = 30 }: { text: string; speed?: number }) => {
	const [displayedLength, setDisplayedLength] = useState(0)
	const [isComplete, setIsComplete] = useState(false)

	useEffect(() => {
		setDisplayedLength(0)
		setIsComplete(false)
		const interval = setInterval(() => {
			setDisplayedLength((prev) => {
				if (prev >= text.length) {
					clearInterval(interval)
					setIsComplete(true)
					return prev
				}
				return prev + 1
			})
		}, speed)

		return () => clearInterval(interval)
	}, [text, speed])

	if (isComplete) {
		return (
			<span className="animate-shimmer bg-linear-90 from-[var(--vscode-foreground)] to-[var(--vscode-descriptionForeground)] bg-[length:200%_100%] bg-clip-text text-transparent truncate">
				{text}
			</span>
		)
	}

	return <span className="truncate">{text.slice(0, displayedLength)}</span>
})

TypewriterText.displayName = "TypewriterText"
