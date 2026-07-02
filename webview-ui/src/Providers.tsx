import { type ReactNode } from "react"

import { ExtensionStateContextProvider } from "./context/ExtensionStateContext"
import { AeriocodeAuthProvider } from "./context/AeriocodeAuthContext"
import { HeroUIProvider } from "@heroui/react"
import { InternalTelemetryProvider } from "./InternalTelemetryProvider"

export function Providers({ children }: { children: ReactNode }) {
	return (
		<ExtensionStateContextProvider>
			<InternalTelemetryProvider>
				<AeriocodeAuthProvider>
					<HeroUIProvider>{children}</HeroUIProvider>
				</AeriocodeAuthProvider>
			</InternalTelemetryProvider>
		</ExtensionStateContextProvider>
	)
}
