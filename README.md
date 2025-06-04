# obsidian-any2link-sync

This plugin for [Obsidian](https://obsidian.md/) allows you to sync your links through the [any2.link](https://any2.link) service, so that you can easily create Obsidian notes directly from your saved links.

> Note: This plugin is being migrated from the original obsidian-pocket plugin. Pocket functionality will be gradually phased out as any2.link integration is implemented.

## Initial setup

After the plugin has been enabled, you will be able to see an "Any2Link Sync" option under the "Plugin options" section of the settings panel. Click on it to go to the settings tab, where you can connect your any2.link account and set up the plugin.

### Connect your any2.link account

Coming soon: Instructions for connecting to any2.link service.

### Specify settings

The settings tab will contain a number of settings that affect how the plugin syncs links and creates notes:

| Setting                        | Default value                      | What it does                                                                                                                                                                   |
| ------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create notes on sync           | Enabled                            | Create notes automatically when new links are synced                                                                                                                           |
| Multi-word tag converter       | Snake case                         | Specifies how to convert multi-word tags into Obsidian-compatible tags                                                                                                         |
| Sync tag                       | Blank (sync all items)             | Specifies a tag so that only items with that tag will be synced                                                                                                                |
| Notes folder location          | Obsidian vault root folder         | Specifies the folder whether new notes will be stored                                                                                                                          |
| Note template file location    | Blank (use the default template)   | Specifies a custom template file to use to create new notes                                                                                                                    |
| Front matter URL key           | URL (matches the default template) | Specifies the [YAML front matter](https://help.obsidian.md/Advanced+topics/YAML+front+matter) key that will be used to find the item's URL, used to match items to their notes |

It is highly encouraged that you use the default note template and front matter URL key. If you decide to customize these options, please ensure that your notes do end up having a valid front matter key for the URL.

## Usage

### Available commands

| Command                | What it does                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Open links list        | Opens a list in Obsidian where you can see your synced links and go to the URL or create/open a note    |
| Sync links             | Syncs links from any2.link to Obsidian                                                                  |
| Index all files by URL | Find all notes in the vault by checking whether a file has a URL front matter key that matches a link   |
| Create all notes       | Creates a note for all links that lack one                                                              |

### Syncing links

You can sync your links using an Obsidian command: "Sync links", or the button in the settings tab.

You can either sync all links or just links with a particular tag that you specify, using the "Sync tag" setting. Leave it blank to sync all links, or specify a tag to limit your sync to just links with that tag.

### Opening and using the links list

Once the links list is downloaded and stored, open the command palette and search for "Any2Link" to see the list of available commands. The command to open the links list is "Open links list".

The links list can be used to browse through the items you've saved and to create a note for any link by clicking on its title. You can also go directly to the URL for the link.

### Templates for notes

Templates for notes work similar to any other template in Obsidian, see [here](https://help.obsidian.md/Plugins/Templates).

This is the default template in the plugin:

```
---
Title: "{{title}}"
URL: {{url}}
Tags: [any2link, {{tags-no-hash}}]
Excerpt: >
    {{excerpt}}
---
{{tags}}
{{image}}
```

## Feature requests, bug reports and PRs

Feature requests, bug reports and PRs are welcome!

## Design overview and security considerations

This plugin runs completely locally. All of your data and access tokens are stored locally.

This plugin stores your data locally in Obsidian's IndexedDB.

## Support

If you find this plugin valuable, please let us know! It is great to hear from people who use what we've built.
