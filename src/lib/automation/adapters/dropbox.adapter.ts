import type { ActionAdapter } from "./action-adapter.types";
import { text } from "./adapter-utils";
import { executeOAuthJson } from "./oauth-json-client";

export const dropboxActionAdapter: ActionAdapter = {
  adapterVersion: 1,
  supports(adapterKey, adapterVersion) {
    return adapterVersion === 1 && adapterKey === "dropbox.share-file";
  },
  execute(input) {
    return executeOAuthJson(input, {
      url: "https://api.dropboxapi.com/2/sharing/add_file_member",
      method: "POST",
      body: {
        file: text(input.normalizedInput, "fileId"),
        members: [{ member: { ".tag": "email", email: text(input.normalizedInput, "recipient") }, access_level: { ".tag": text(input.normalizedInput, "role", "view") === "edit" ? "editor" : "viewer" } }],
        quiet: false
      }
    });
  }
};
