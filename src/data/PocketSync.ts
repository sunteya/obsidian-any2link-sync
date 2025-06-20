import { Notice } from "obsidian";
import { PocketAPI } from "../pocket_api/PocketAPI";
import { AccessInfo } from "../pocket_api/PocketAuth";
import { MetadataStore } from "./MetadataStore";
import { PocketItemStore } from "./PocketItemStore";

export const doPocketSync = async (
  itemStore: PocketItemStore,
  metadataStore: MetadataStore,
  pocketAPI: PocketAPI,
  accessInfo: AccessInfo,
  pocketSyncTag?: string
) => {
  const lastUpdateTimestamp = await metadataStore.getLastUpdateTimestamp();

  new Notice(`Fetching Pocket updates for dummy`);

  const getPocketItemsResponse = await pocketAPI.getPocketItems(
    accessInfo.accessToken,
    lastUpdateTimestamp,
    pocketSyncTag
  );

  new Notice(
    `Fetched ${
      Object.keys(getPocketItemsResponse.response.list).length
    } updates from Pocket`
  );

  const storageNotice = new Notice(`Storing updates from Pocket...`, 0);

  await itemStore.mergeUpdates(getPocketItemsResponse.response.list);
  await metadataStore.setLastUpdateTimestamp(getPocketItemsResponse.timestamp);

  storageNotice.hide();
  new Notice(`Done storing updates from Pocket`);
};
