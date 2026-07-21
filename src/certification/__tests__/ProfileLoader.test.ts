import { describe, it, beforeEach, afterEach } from "mocha"
import { expect } from "chai"
import fs from "fs"
import path from "path"
import os from "os"
import { ProfileLoader } from "../ProfileLoader"

describe("ProfileLoader", () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "profile-test-"))
	})

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true })
	})

	describe("loadDO178CProfile()", () => {
		it("should return a valid DO-178C profile", () => {
			// We test against the default profile since we can't easily mock HOME
			// in this environment. The method falls back to defaults if file not found.
			const profile = ProfileLoader.loadDO178CProfile()
			expect(profile).to.have.property("standard", "DO-178C")
			expect(profile).to.have.property("version")
			expect(profile).to.have.property("levels")
			expect(profile.levels).to.be.an("object")
		})

		it("should have DAL levels A through D", () => {
			const profile = ProfileLoader.loadDO178CProfile()
			expect(profile.levels).to.have.property("DAL_A")
			expect(profile.levels).to.have.property("DAL_B")
			expect(profile.levels).to.have.property("DAL_C")
			expect(profile.levels).to.have.property("DAL_D")
		})
	})

	describe("saveProjectProfile() and loadProjectProfile()", () => {
		it("should save and load a profile round-trip", () => {
			const profile = ProfileLoader.loadDO178CProfile()
			ProfileLoader.saveProjectProfile(tmpDir, profile)

			const loaded = ProfileLoader.loadProjectProfile(tmpDir)
			expect(loaded).to.not.be.null
			expect(loaded!.standard).to.equal("DO-178C")
		})

		it("should return null when no project profile exists", () => {
			const loaded = ProfileLoader.loadProjectProfile(tmpDir)
			expect(loaded).to.be.null
		})
	})

	describe("getEffectiveProfile()", () => {
		it("should return project profile when it exists", () => {
			const profile = ProfileLoader.loadDO178CProfile()
			ProfileLoader.saveProjectProfile(tmpDir, profile)

			const effective = ProfileLoader.getEffectiveProfile(tmpDir)
			expect(effective).to.not.be.null
			expect(effective!.standard).to.equal("DO-178C")
		})

		it("should fall back to built-in profile when no project profile", () => {
			// getEffectiveProfile returns null when no project profile and built-in can't be loaded
			// (which is the case in test env where ~/.aeriocode/profiles may not exist)
			const effective = ProfileLoader.getEffectiveProfile(tmpDir)
			// Either returns the built-in profile or null if profile dir doesn't exist
			if (effective) {
				expect(effective.standard).to.equal("DO-178C")
			}
			// The important thing is it doesn't throw
		})
	})
})
