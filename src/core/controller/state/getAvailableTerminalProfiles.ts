import { Controller } from "../index"
import * as proto from "@/shared/proto"
import { getAvailableTerminalProfiles as getTerminalProfilesFromShell } from "../../../utils/shell"

export async function getAvailableTerminalProfiles(
	controller: Controller,
	request: proto.aeriocode.EmptyRequest,
): Promise<proto.aeriocode.TerminalProfiles> {
	const profiles = getTerminalProfilesFromShell()

	return proto.aeriocode.TerminalProfiles.create({
		profiles: profiles.map((profile) => ({
			id: profile.id,
			name: profile.name,
			path: profile.path || "",
			description: profile.description || "",
		})),
	})
}
