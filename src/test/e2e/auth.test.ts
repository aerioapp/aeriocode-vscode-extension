import { expect } from "@playwright/test"
import { e2e } from "./utils/helpers"

e2e("Auth - can set up API keys", async ({ page, sidebar }) => {
	// Verify the welcome view is shown with login button
	await expect(sidebar.getByRole("button", { name: "Get Started for Free" })).toBeVisible()

	// Verify the welcome text is visible
	await expect(sidebar.getByText("Hi, I'm Aeriocode")).toBeVisible()
})
