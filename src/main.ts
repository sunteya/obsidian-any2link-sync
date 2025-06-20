import log from "loglevel";
import { Notice, Plugin, TFile, getAllTags } from "obsidian";
import ReactDOM from "react-dom";
import { MetadataStore } from "./data/MetadataStore";
import { closePocketIDB, openPocketIDB, PocketIDB } from "./data/PocketIDB";
import { PocketItemStore } from "./data/PocketItemStore";
import { doPocketSync } from "./data/PocketSync";
import {
  openURLToPocketItemNoteIndex,
  URLToPocketItemNoteIndex,
} from "./data/URLToPocketItemNoteIndex";
import {
  buildTagNormalizer,
  bulkCreateItemNotes,
  getAllItemNotes,
  resolveItemNote,
  ResolveItemNoteFn,
} from "./ItemNote";
import {
  buildPocketAPI,
  PocketAPI,
  PocketItemAction,
  Username as PocketUsername,
} from "./pocket_api/PocketAPI";
import {
  loadPocketAccessInfo,
  OBSIDIAN_AUTH_PROTOCOL_ACTION,
  storePocketAccessInfo,
} from "./pocket_api/PocketAuth";
import { FolderTagMapping, PocketSettings, SettingsManager } from "./SettingsManager";
import {
  PocketItemListView,
  POCKET_ITEM_LIST_VIEW_TYPE,
} from "./ui/PocketItemListView";
import { createReactApp } from "./ui/ReactApp";
import { PocketSettingTab } from "./ui/settings";
import { ViewManager } from "./ui/ViewManager";
import { pocketTagsToPocketTagList } from "./pocket_api/PocketAPITypes"

const URL_INDEXING_DELAY_MS = 1000;

export default class PocketSync extends Plugin {
  pocketIDB: PocketIDB;
  itemStore: PocketItemStore;
  metadataStore: MetadataStore;
  urlToItemNoteIndex: URLToPocketItemNoteIndex;
  appEl: HTMLDivElement;
  viewManager: ViewManager;
  pocketUsername: PocketUsername | null;
  pocketAuthenticated: boolean;
  settingsManager: SettingsManager;
  pocketAPI: PocketAPI;
  pendingSync: Promise<void> | null = null;
  resolveItemNote: ResolveItemNoteFn;
  pendingBulkCreate: boolean;

  async syncPocketItems() {
    const accessInfo = await loadPocketAccessInfo(this);
    if (!accessInfo) {
      new Notice("Not logged into Pocket, skipping sync");
      return;
    }

    if (!!this.pendingSync) {
      new Notice("Sync already in progress, skipping");
      return;
    }

    const pocketSyncTag = this.settingsManager.getSetting("pocket-sync-tag");
    this.pendingSync = doPocketSync(
      this.itemStore,
      this.metadataStore,
      this.pocketAPI,
      accessInfo,
      pocketSyncTag
    );
    try {
      await this.pendingSync;
    } finally {
      this.pendingSync = null;
    }

    const shouldCreateAllItemNotes = this.settingsManager.getSetting("create-item-notes-on-sync");
    if (shouldCreateAllItemNotes) {
      await this.createAllPocketItemNotes();
    }
  }

  async createAllPocketItemNotes() {
    if (this.pendingBulkCreate) {
      new Notice(
        "Bulk creation of missing Pocket item notes already in progress"
      );
      return;
    }

    this.pendingBulkCreate = true;

    const allPocketItems = (await this.itemStore.getAllItems()).filter((item) => {
      const ignoreTags = this.settingsManager.getSetting('item-note-ignore-tags')
      if (ignoreTags.length == 0) {
        return true
      }

      const pocketTags = pocketTagsToPocketTagList(item.tags)
      const getTagNormalizer = buildTagNormalizer(this.settingsManager, false)
      const tags = pocketTags.map(getTagNormalizer)
      return !tags.some(it => ignoreTags.includes(it))
    })

    const pocketItemsWithoutNotes = (
      await getAllItemNotes(
        this.urlToItemNoteIndex,
        this.resolveItemNote
      )(allPocketItems)
    )
      .filter(({ itemNote }) => !itemNote)
      .map(({ item }) => item);

    new Notice(
      `Found ${pocketItemsWithoutNotes.length} Pocket items without notes`
    );

    if (pocketItemsWithoutNotes.length === 0) {
      new Notice("No Pocket item notes to be created");
      return;
    }

    const creationNotice = new Notice(
      `Creating all missing Pocket item notes...`,
      0
    );

    try {
      await bulkCreateItemNotes(
        this.app,
        this.settingsManager,
        this.app.vault,
        this.app.metadataCache,
        pocketItemsWithoutNotes
      );
      new Notice(`Done creating all missing Pocket item notes`);
    } catch (err) {
      new Notice("Failed to create all missing Pocket item notes");
    } finally {
      creationNotice.hide();
      this.pendingBulkCreate = false;
    }
  }

  getItemNoteTags(itemNote: TFile) {
    const result = new Set<string>()

    const cache = this.app.metadataCache.getFileCache(itemNote)
    for (const tag of (getAllTags(cache) ?? [])) {
      result.add(tag.replace('#', ''))
    }

    const mappings = this.settingsManager.getSetting('upload-folder-tag-mappings') ?? []

    for (const mapping of mappings) {
      if (itemNote.path.startsWith(mapping.folder)) {
        for (const tag of mapping.tags) {
          result.add(tag)
        }
      }
    }

    return result
  }

  async uploadItemNotesTags() {
    const accessInfo = await loadPocketAccessInfo(this);
    if (!accessInfo) {
      new Notice("Not logged into Pocket, skipping sync");
      return;
    }

    const allowTags = new Set(this.settingsManager.getSetting('upload-allow-tags'))
    if (allowTags.size === 0) {
      new Notice("The tags for upload are not set. Please specify them in the settings.");
      return;
    }

    const allPocketItems = (await this.itemStore.getAllItems())
    const allItemNotes = (
      await getAllItemNotes(
        this.urlToItemNoteIndex,
        this.resolveItemNote
      )(allPocketItems)
    ).filter(({ itemNote }) => itemNote)

    const actions = [] as PocketItemAction[]
    for (const { itemNote, item } of allItemNotes) {
      const itemTags = new Set(Object.keys(item.tags))
      const noteTags = this.getItemNoteTags(itemNote)

      for (const tag of allowTags) {
        if (noteTags.has(tag) && !itemTags.has(tag)) {
          actions.push({ action: "tags_add", item_id: item.item_id, tags: tag })
        } else if (!noteTags.has(tag) && itemTags.has(tag)) {
          actions.push({ action: "tags_remove", item_id: item.item_id, tags: tag })
        }
      }
    }

    if (actions.length === 0) {
      new Notice("No notes need to be uploaded.");
      return;
    }

    const changes = new Set<number>()
    const resp = await this.pocketAPI.modifyPocketItems(accessInfo.accessToken, actions)
    for (const idx in resp.action_results) {
      const action = actions[idx]
      const item = await this.itemStore.getItem(action.item_id)
      changes.add(item.item_id)

      if (action.action == 'tags_add') {
        item.tags[action.tags] = {
          item_id: item.item_id.toString(),
          tag: action.tags
        }

        await this.itemStore.mergeUpdates({ [item.item_id]: item })
      } else if (action.action == 'tags_remove') {
        delete item.tags[action.tags]
        await this.itemStore.mergeUpdates({ [item.item_id]: item })
      }
    }

    if (resp.status === 1) {
      new Notice(`Uploaded ${changes.size} item notes tags to Pocket`);
    } else {
      new Notice(`Failed to upload item notes tags to Pocket`);
    }
  }

  async onload() {
    const defaultLogLevel = process.env.BUILD === "prod" ? "info" : "debug";
    log.setDefaultLevel(defaultLogLevel);

    log.info("Loading Pocket plugin");

    this.settingsManager = new SettingsManager({
      loadSettings: async () => {
        const settings: PocketSettings = Object.assign(
          {},
          await this.loadData()
        );
        return settings;
      },
      saveSettings: async (settings: PocketSettings) =>
        await this.saveData(settings),
    });
    await this.settingsManager.load();

    this.pendingSync = null;
    this.pendingBulkCreate = false;

    this.pocketAPI = buildPocketAPI(this.settingsManager);

    // Set up Pocket IDB and dependent stores
    log.debug("Opening Pocket IDB");
    this.pocketIDB = await openPocketIDB([
      PocketItemStore.upgradeDatabase,
      MetadataStore.upgradeDatabase,
      URLToPocketItemNoteIndex.upgradeDatabase,
    ]);
    log.debug("Pocket IDB opened");

    log.debug("Opening Pocket item store");
    this.itemStore = new PocketItemStore(this.pocketIDB);
    log.debug("Pocket item store opened");

    log.debug("Opening metadata store");
    this.metadataStore = new MetadataStore(this.pocketIDB);
    log.debug("metadata store opened");

    log.debug("Opening URL to Pocket item note index");
    let eventRefs = undefined;
    [this.urlToItemNoteIndex, eventRefs] = await openURLToPocketItemNoteIndex(
      this.pocketIDB,
      this.app.metadataCache,
      this.app.vault,
      this.settingsManager
    );

    for (let eventRef of eventRefs) {
      this.registerEvent(eventRef);
    }

    log.debug("URL to Pocket item note index opened");

    this.resolveItemNote = resolveItemNote(this.app.vault);

    this.addCommands();
    this.addSettingTab(
      new PocketSettingTab(this.app, this, this.settingsManager)
    );

    (async () => {
      const accessInfo = await loadPocketAccessInfo(this);
      if (!accessInfo) {
        log.info(`Not authenticated to Pocket`);
      }
      this.pocketAuthenticated = !!accessInfo;
      this.pocketUsername = "dummy";
    })();

    this.registerObsidianProtocolHandler(
      OBSIDIAN_AUTH_PROTOCOL_ACTION,
      async (params) => {
        const accessInfo = await this.pocketAPI.getAccessToken();
        storePocketAccessInfo(this, accessInfo);
        this.pocketAuthenticated = true;
        this.pocketUsername = "dummy";
        new Notice(`Logged in to Pocket as dummy`);
      }
    );

    // Set up React-based Pocket item list view
    this.viewManager = new ViewManager();
    this.mount();
    this.registerView(
      POCKET_ITEM_LIST_VIEW_TYPE,
      (leaf) => new PocketItemListView(leaf, this)
    );

    // always index on startup, because it could be that Pocket item notes were
    // created on a different app, or indexing was never run. need to wait until
    // metadata cache is initialized.
    setTimeout(async () => {
      await this.urlToItemNoteIndex.indexURLsForAllFilePaths();
    }, URL_INDEXING_DELAY_MS);
  }

  // Mount React app
  mount = () => {
    console.debug("Mounting React components");
    ReactDOM.render(
      createReactApp(this.viewManager),
      this.appEl ?? (this.appEl = document.body.createDiv())
    );
    console.debug("Done mounting React components");
  };

  async onunload() {
    log.info("Unloading Pocket plugin");

    log.debug("Killing all views");
    this.killAllViews();
    this.viewManager = null;

    if (this.appEl) {
      ReactDOM.unmountComponentAtNode(this.appEl);
      this.appEl.detach();
    }

    log.debug("Closing Pocket IDB");
    closePocketIDB(this.pocketIDB);
    this.itemStore = null;

    this.pocketAPI = null;
  }

  killAllViews = () => {
    this.app.workspace
      .getLeavesOfType(POCKET_ITEM_LIST_VIEW_TYPE)
      .forEach((leaf) => leaf.detach());
    this.viewManager.views.forEach((view) => view.unload());
    this.viewManager.clearViews();
  };

  openPocketList = async () => {
    await this.app.workspace.activeLeaf.setViewState({
      type: POCKET_ITEM_LIST_VIEW_TYPE,
    });
  };

  addCommands = () => {
    this.addCommand({
      id: "open-pocket-list",
      name: "Open Pocket list",
      callback: async () => {
        await this.openPocketList();
      },
    });

    this.addCommand({
      id: "sync-pocket-list",
      name: "Sync Pocket list",
      callback: async () => {
        await this.syncPocketItems();
      },
    });

    this.addCommand({
      id: "index-all-files-by-URL",
      name: "Index all files by URL",
      callback: async () => {
        const notice = new Notice("Indexing URLs for Pocket item notes");
        const nIndexedURLs =
          await this.urlToItemNoteIndex.indexURLsForAllFilePaths();
        notice.hide();
        new Notice(`Found ${nIndexedURLs} new URLs`);
      },
    });

    this.addCommand({
      id: "create-all-pocket-item-notes",
      name: "Create all Pocket item notes",
      callback: async () => {
        await this.createAllPocketItemNotes();
      },
    });

    this.addCommand({
      id: "upload-item-notes-tags",
      name: "Upload item note's tags to Pocket",
      callback: async () => {
        await this.uploadItemNotesTags()
      }
    })
  };
}
