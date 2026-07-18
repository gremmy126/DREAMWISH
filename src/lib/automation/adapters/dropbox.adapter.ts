import { adapterImplementationSupports } from "./action-adapter.manifest";
import type { ActionAdapter } from "./action-adapter.types";
import { text } from "./adapter-utils";
import { executeOAuthJson } from "./oauth-json-client";
import { executeOAuthBinary, executeOAuthRaw } from "./oauth-json-client";
import { filenameFromDisposition, loadActionFile, saveRemoteFile } from "./file-transfer";

export const dropboxActionAdapter: ActionAdapter = {
  adapterVersion: 1,
  supports(adapterKey, adapterVersion) {
    return adapterImplementationSupports("dropbox", adapterKey, adapterVersion);
  },
  async execute(input) {
    if (input.definition.id === "upload-file") {
      const file = await loadActionFile(input.ownerId, input.normalizedInput.file, "upload.bin");
      const path = `/${text(input.normalizedInput, "path", file.name).replace(/^\/+|\/+$/gu, "") || file.name}`;
      return executeOAuthRaw(input, {
        url: "https://content.dropboxapi.com/2/files/upload",
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({ path, mode: "add", autorename: true, mute: false })
        },
        body: file.bytes
      });
    }
    if (input.definition.id === "download-file") {
      const fileId = text(input.normalizedInput, "fileId");
      const downloaded = await executeOAuthBinary(input, {
        url: "https://content.dropboxapi.com/2/files/download",
        method: "POST",
        headers: { "Dropbox-API-Arg": JSON.stringify({ path: fileId }) }
      });
      const metadataHeader = downloaded.contentDisposition;
      const file = await saveRemoteFile({
        ownerId: input.ownerId,
        bytes: downloaded.bytes,
        name: filenameFromDisposition(metadataHeader, fileId.split("/").pop() || "dropbox-download"),
        contentType: downloaded.contentType
      });
      return {
        output: { id: file.id, name: file.name, size: file.size, mimeType: file.mimeType },
        apiRequestId: downloaded.apiRequestId,
        rateLimitRemaining: downloaded.rateLimitRemaining,
        adapterLatencyMs: downloaded.adapterLatencyMs
      };
    }
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
