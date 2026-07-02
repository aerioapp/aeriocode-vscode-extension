import { expect } from "@playwright/test"
import { e2e } from "./utils/helpers"

e2e("code actions and editor panel", async ({ page, sidebar }) => {
	// Verify the welcome view is shown
	await expect(sidebar.getByRole("button", { name: "Get Started for Free" })).toBeVisible()
	await expect(sidebar.getByText("Hi, I'm Aeriocode")).toBeVisible()
})
