import { stylesheet } from "astroturf";
import log from "loglevel";
import { App, ButtonComponent, Notice, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_POCKET_SETTINGS, FolderTagMapping, SettingsManager } from "src/SettingsManager";
import PocketSync from "../main";
import {
  clearPocketAccessInfo,
  pocketAccessInfoExists,
  setupAuth,
} from "../pocket_api/PocketAuth";
import { FolderSuggest } from "src/vendor/obsidian-periodic-notes/file-suggest"

const styles = stylesheet`
  .error {
    border-color: var(--background-modifier-error-hover) !important;
  }
`;

const CONNECT_POCKET_CTA = "Connect your Pocket account";

const addAuthButton = (plugin: PocketSync, containerEl: HTMLElement) =>
  new Setting(containerEl)
    .setName("Pocket authorization")
    .setDesc(CONNECT_POCKET_CTA)
    .addButton((button) => {
      button.setButtonText(CONNECT_POCKET_CTA);
      button.onClick(setupAuth(plugin.pocketAPI));
    });

const SYNC_POCKET_CTA = "Sync Pocket items";

const addSyncButton = (plugin: PocketSync, containerEl: HTMLElement) =>
  new Setting(containerEl)
    .setName(SYNC_POCKET_CTA)
    .setDesc("Updates the Pocket items in Obsidian from Pocket")
    .addButton((button) => {
      button.setButtonText(SYNC_POCKET_CTA);
      button.onClick(async () => {
        plugin.syncPocketItems();
      });
    });

const CREATE_ITEM_NOTES_ON_SYNC_CTA = "Create Pocket item notes on sync";
const addCreateItemNotesOnSyncOption = (
  settingsManager: SettingsManager,
  containerEl: HTMLElement
) =>
  new Setting(containerEl)
    .setName(CREATE_ITEM_NOTES_ON_SYNC_CTA)
    .setDesc(
      "Create Pocket item notes automatically when new Pocket items are synced"
    )
    .addToggle((toggle) => {
      toggle.setValue(
        settingsManager.getSetting("create-item-notes-on-sync")
      );
      toggle.onChange((value) =>
        settingsManager.updateSetting("create-item-notes-on-sync", value)
      );
    });

const LOG_OUT_OF_POCKET_CTA = "Disconnect your Pocket account";

const addLogoutButton = (plugin: PocketSync, containerEl: HTMLElement) =>
  new Setting(containerEl)
    .setName(LOG_OUT_OF_POCKET_CTA)
    .setDesc("Disconnects Obsidian from Pocket")
    .addButton((button) => {
      button.setButtonText(LOG_OUT_OF_POCKET_CTA);
      button.onClick(async () => {
        if (await pocketAccessInfoExists(plugin)) {
          log.debug("Disconnecting from Pocket by clearing Pocket access info");
          clearPocketAccessInfo(plugin);
          new Notice("Disconnected from Pocket");
        } else {
          new Notice("Already logged out of Pocket, skipping");
        }
      });

      plugin.pocketAuthenticated = false;
      plugin.pocketUsername = null;
    });

const CLEAR_LOCAL_POCKET_DATA_CTA = "Clear locally-stored Pocket data";

const addClearLocalPocketDataButton = (
  plugin: PocketSync,
  containerEl: HTMLElement
) =>
  new Setting(containerEl)
    .setName(CLEAR_LOCAL_POCKET_DATA_CTA)
    .setDesc("Clears Pocket data stored locally by obsidian-pocket plugin")
    .addButton((button) => {
      button.setButtonText(CLEAR_LOCAL_POCKET_DATA_CTA);
      button.onClick(async () => {
        await plugin.metadataStore.clearDatabase();
        await plugin.itemStore.clearDatabase();
        await plugin.urlToItemNoteIndex.clearDatabase();
        new Notice("Cleared locally-stored Pocket data");
      });
    });


const HEADING_ITEM_NOTE = "Pocket item note settings";

const SET_ITEM_NOTE_TEMPLATE_CTA = "Pocket item note template file location";

const addItemNoteTemplateSetting = (
  settingsManager: SettingsManager,
  containerEl: HTMLElement
) =>
  new Setting(containerEl)
    .setName(SET_ITEM_NOTE_TEMPLATE_CTA)
    .setDesc(
      `Choose the file to use as a custom template when creating a new note from
      a Pocket item, rather than using the default template provided by
      obsidian-pocket.

      IMPORTANT: Please consider carefully whether it is worth the effort to
      provide your own custom template, as the default one is complete and
      tested to work properly with YAML front matter.`
    )
    .addText((text) => {
      text.setPlaceholder("Example: Templates/Pocket item note");
      text.setValue(settingsManager.getSetting("item-note-template"));
      text.onChange(async (newValue) => {
        await settingsManager.updateSetting("item-note-template", newValue);
      });
    });

const SET_ITEM_NOTE_TEMPLATE_WITH_TEMPLATER_CTA = "Integrated templater plugin for item note template";

const addItemNoteTemplateWithTemplaterSetting = (
  settingsManager: SettingsManager,
  containerEl: HTMLElement
) =>
  new Setting(containerEl)
    .setName(SET_ITEM_NOTE_TEMPLATE_WITH_TEMPLATER_CTA)
    .setDesc(
      `Use the templater plugin to process the Pocket item note template. This
      will allow you to use templater 'replace-in-file-templater' command in your Pocket item note template
      file, you must have the templater plugin installed and enabled for this`
    )
    .addToggle((toggle) => {
      toggle.setValue(
        settingsManager.getSetting(
          "item-note-template-with-templater"
        )
      );
      toggle.onChange((value) =>
        settingsManager.updateSetting("item-note-template-with-templater", value)
      );
    });

const SET_ITEM_NOTES_LOCATION_CTA = "Pocket item notes folder location";

const addItemNotesLocationSetting = (
  settingsManager: SettingsManager,
  containerEl: HTMLElement
) =>
  new Setting(containerEl)
    .setName(SET_ITEM_NOTES_LOCATION_CTA)
    .setDesc(
      "Choose the folder for creating new Pocket item notes. Pocket item notes will be created in the root folder by default."
    )
    .addText(async (text) => {
      text.setPlaceholder("Example: Pocket item notes/");
      text.setValue(settingsManager.getSetting("item-notes-folder"));
      text.onChange(async (newValue) => {
        await settingsManager.updateSetting("item-notes-folder", newValue);
      });
    });

const MULTI_WORD_TAG_CONVERTER_CTA = "Multi-word Pocket tag converter options";
const MULTI_WORD_TAG_CONVERTER_DESC = `
Pocket supports spaces within a tag (e.g. '#tag with spaces' is a valid Pocket
tag), while Obsidian tags do not. This setting determines how Pocket tags that
contain spaces are changed to work consistently in Obsidian.

This setting only affects the Pocket reading list - it does not change any
existing tags in Pocket or Obsidian.`;

const addMultiWordTagConverterSetting = (
  settingsManager: SettingsManager,
  containerEl: HTMLElement
) => {
  new Setting(containerEl)
    .setName(MULTI_WORD_TAG_CONVERTER_CTA)
    .setDesc(MULTI_WORD_TAG_CONVERTER_DESC)
    .addDropdown((dropdown) => {
      dropdown.addOption(
        "snake-case",
        "Snake case ('#tag with spaces' becomes #tag_with_spaces)"
      );
      dropdown.addOption(
        "camel-case",
        "Camel case ('#tag with spaces' becomes #TagWithSpaces)"
      );
      dropdown.addOption(
        "do-nothing",
        "Do nothing ('#tag with spaces' remains unchanged)"
      );

      dropdown.setValue(
        settingsManager.getSetting("multi-word-tag-converter") || "snake-case"
      );

      dropdown.onChange(async (newValue) => {
        await settingsManager.updateSetting(
          "multi-word-tag-converter",
          newValue
        );
      });
    });
};

const SYNC_TAG_CTA = "Pocket sync tag";
const SYNC_TAG_DESC = `Specify a Pocket tag to sync, e.g. adding 'obsidian' here
will result in only Pocket items tagged with 'obsidian' being synced. If this
setting is left blank, all Pocket items will be synced.`;

const addPocketSyncTagSetting = (
  settingsManager: SettingsManager,
  containerEl: HTMLElement
) => {
  new Setting(containerEl)
    .setName(SYNC_TAG_CTA)
    .setDesc(SYNC_TAG_DESC)
    .addText((text) => {
      text.setPlaceholder("Specify a tag to limit syncs");
      text.setValue(settingsManager.getSetting("pocket-sync-tag"));
      text.onChange(async (newValue) => {
        if (newValue.length == 0) {
          newValue = null;
        }
        await settingsManager.updateSetting("pocket-sync-tag", newValue);
      });
    });
};

const FRONT_MATTER_URL_KEY_CTA = "Front matter URL key";
const FRONT_MATTER_URL_KEY_DESC = `Specify the key in the front matter to use
when matching Pocket items to Obsidian notes. The default key is "URL".
IMPORTANT: Please consider carefully whether it is worth the effort to customize
this option, and make sure that the key specified here is the same one that is
used in the Pocket item note template used to create your Pocket item notes.
Failure to do so will result in Pocket item notes not being matched to their
respective Pocket items.`;

const addFrontMatterURLKeySetting = (
  settingsManager: SettingsManager,
  containerEl: HTMLElement
) => {
  new Setting(containerEl)
    .setName(FRONT_MATTER_URL_KEY_CTA)
    .setDesc(FRONT_MATTER_URL_KEY_DESC)
    .addText((text) => {
      text.setPlaceholder(DEFAULT_POCKET_SETTINGS["frontmatter-url-key"]);
      text.setValue(settingsManager.getSetting("frontmatter-url-key"));
      text.onChange(async (newValue) => {
        if (newValue.length == 0) {
          newValue = null;
        }
        await settingsManager.updateSetting("frontmatter-url-key", newValue);
      });
    });
};

const addItemNoteIgnoreTagsSetting = (
  settingsManager: SettingsManager,
  containerEl: HTMLElement
) => {
  new Setting(containerEl)
    .setName("Ignore item tags")
    .setDesc("Specify a list of tags to ignore when creating item notes")
    .addText((text) => {
      text.setPlaceholder("Specify a list of tags to ignore");
      text.setValue(settingsManager.getSetting("item-note-ignore-tags").join(", "));
      text.onChange(async (newValue) => {
        const newTags = newValue.split(",").map(it => it.trim()).filter(it => it.length > 0)
        await settingsManager.updateSetting("item-note-ignore-tags", newTags);
      });
    });
}

const addItemNoteFilenamePatternSetting = (
  settingsManager: SettingsManager,
  containerEl: HTMLElement
) => {
  new Setting(containerEl)
    .setName("Item note filename pattern")
    .setDesc("Specify the pattern to use when creating item notes, available variables: {{title}} {{item_id}}")
    .addText((text) => {
      text.setPlaceholder(DEFAULT_POCKET_SETTINGS["item-note-filename-pattern"]);
      text.setValue(settingsManager.getSetting("item-note-filename-pattern"));
      text.onChange(async (newValue) => {
        if (newValue && newValue.length == 0) {
          newValue = null
        }

        await settingsManager.updateSetting("item-note-filename-pattern", newValue);
      });
    });
}

const CUSTOM_POCKET_API_URL_CTA = "Custom Pocket API URL";
const CUSTOM_POCKET_API_URL_DESC = `Use a custom Pocket API URL. This is an advanced setting and should only be used if
you know what you are doing.`;

const addCustomPocketAPIURLSetting = (
  settingsManager: SettingsManager,
  containerEl: HTMLElement
) => {
  new Setting(containerEl)
    .setName(CUSTOM_POCKET_API_URL_CTA)
    .setDesc(CUSTOM_POCKET_API_URL_DESC)
    .addText((text) => {
      text.setPlaceholder(DEFAULT_POCKET_SETTINGS["custom-pocket-api-url"]);
      text.setValue(settingsManager.getSetting("custom-pocket-api-url"));
      text.onChange(async (newValue) => {
        if (newValue.length == 0) {
          newValue = null;
        }
        await settingsManager.updateSetting("custom-pocket-api-url", newValue);
      });
    });
}


const HEADING_UPLOAD_DATA = "Upload data to pocket settings";

const UPLOAD_ALLOW_TAGS_CTA = "Upload allow tags";
const UPLOAD_ALLOW_TAGS_DESC = `Specify the allowed list of tags, multiple tags separated by commas.
If this setting is left blank, data will not be uploaded.`;

const addUploadAllowTagsSetting = (
  settingsManager: SettingsManager,
  containerEl: HTMLElement
) => {
  new Setting(containerEl)
    .setName(UPLOAD_ALLOW_TAGS_CTA)
    .setDesc(UPLOAD_ALLOW_TAGS_DESC)
    .addText((text) => {
      text.setPlaceholder("Specify a list of tags to allow");

      const tags = settingsManager.getSetting("upload-allow-tags");
      text.setValue(tags.join(", "));
      text.onChange(async (newValue) => {
        if (newValue.length == 0) {
          newValue = null;
        }

        const newTags = newValue.split(",").map(it => it.trim()).filter(it => it.length > 0)
        await settingsManager.updateSetting("upload-allow-tags", newTags);
      });
    });
}

const addUploadFolderTagMappingsSetting = (
  settingsManager: SettingsManager,
  containerEl: HTMLElement,
  settingTab: PluginSettingTab,
) => {
  const mappings = (settingsManager.getSetting('upload-folder-tag-mappings') ?? []).filter(it => it)

  new Setting(containerEl)
      .setName("Folder tags mappings")
      .setDesc("Set tags for folder mappings, item notes in that folder will automatically append these tags for uploading to Pocket.")
      .addButton((button: ButtonComponent) => {
          button
              .setTooltip("Add additional folder template")
              .setButtonText("+")
              .setCta()
              .onClick(() => {
                mappings.push({ folder: null, tags: [] })
                settingsManager.updateSetting('upload-folder-tag-mappings', mappings)
                settingTab.display()
              });
      });

    for (const idx in mappings) {
      const mapping = mappings[idx]
      new Setting(containerEl)
        .addSearch((cb) => {
          new FolderSuggest(settingTab.app, cb.inputEl);
          cb.setPlaceholder("Folder")
            .setValue(mapping.folder)
            .onChange((newFolder) => {
              if (!newFolder.endsWith("/")) {
                newFolder += "/";
              }
              mapping.folder = newFolder;
              settingsManager.updateSetting('upload-folder-tag-mappings', mappings);
            });
        })
        .addText((tx) => {
          tx.setPlaceholder("Tags")
          tx.setValue(mapping.tags.join(", "))
          tx.onChange((newValue) => {
            mapping.tags = newValue.split(",").map(it => it.trim()).filter(it => it.length > 0)
            settingsManager.updateSetting('upload-folder-tag-mappings', mappings)
          });
        })
        .addExtraButton((cb) => {
          cb.setIcon("cross")
            .setTooltip("Delete")
            .onClick(() => {
              const newMappings = mappings.filter((_, i) => i.toString() != idx)
              settingsManager.updateSetting('upload-folder-tag-mappings', newMappings)
              settingTab.display();
            });
        });
    }
}

export class PocketSettingTab extends PluginSettingTab {
  plugin: PocketSync;
  settingsManager: SettingsManager;

  constructor(app: App, plugin: PocketSync, settingsManager: SettingsManager) {
    super(app, plugin);
    this.plugin = plugin;
    this.settingsManager = settingsManager;
  }

  display(): void {
    let { containerEl } = this;
    containerEl.empty();
    addAuthButton(this.plugin, containerEl);
    addLogoutButton(this.plugin, containerEl);
    addSyncButton(this.plugin, containerEl);
    addClearLocalPocketDataButton(this.plugin, containerEl);
    addMultiWordTagConverterSetting(this.settingsManager, containerEl);
    addPocketSyncTagSetting(this.settingsManager, containerEl);
    addCustomPocketAPIURLSetting(this.settingsManager, containerEl);

    containerEl.createEl('h2', { text: HEADING_ITEM_NOTE });
    addCreateItemNotesOnSyncOption(this.settingsManager, containerEl);
    addItemNotesLocationSetting(this.settingsManager, containerEl);
    addItemNoteTemplateSetting(this.settingsManager, containerEl);
    addItemNoteTemplateWithTemplaterSetting(this.settingsManager, containerEl);
    addFrontMatterURLKeySetting(this.settingsManager, containerEl);
    addItemNoteIgnoreTagsSetting(this.settingsManager, containerEl);
    addItemNoteFilenamePatternSetting(this.settingsManager, containerEl);

    containerEl.createEl('h2', { text: HEADING_UPLOAD_DATA });
    addUploadAllowTagsSetting(this.settingsManager, containerEl);
    addUploadFolderTagMappingsSetting(this.settingsManager, containerEl, this);
  }
}
