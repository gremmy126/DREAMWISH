import {
  isManifestAdapterImplementationAvailable,
  listManifestAdapterKeys
} from "./action-adapter.manifest";

export function isAdapterImplementationAvailable(adapterKey: string, adapterVersion: number) {
  return isManifestAdapterImplementationAvailable(adapterKey, adapterVersion);
}

export function listImplementedAdapterKeys() {
  return listManifestAdapterKeys();
}
