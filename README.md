# SL External Editor

This Extension is designed to integrate vscode better as the external editor for
Second Life

## Setup

I suggest that you chose a folder on your system to hold all your sl projects,
without better support in the SL viewer directly it is difficult to manage
multiple, though nothing is stopping you from having as many editors open as you
like

Setting the external editor config in the viewer to something like this..

- Windows:
  `"C:\Users\<user>\AppData\Local\Programs\Microsoft VS Code\Code.exe" "C:\Users\<user>\projects\sl\scripts" "%s"`
- Mac: `/opt/homebrew/bin/code -r "/Users/<user>/projects/sl/scripting" "%s"`
- Linux: `/usr/bin/code "/home/<user>/projects/sl/scripting" "%s"`

After that you should be good to go, though I would advise looking through the
config options below, and trying the hint system.

## Features

Detects saves to recognized file extensions, and matches them to files that the
Second Life viewer has created in the system temp directory

This is done either purely by name, by directory and name, or by specified hints
using directory and name to match

### Support For

- Windows, Linux, Mac
- [Luau Language Server](https://marketplace.visualstudio.com/items?itemName=JohnnyMorganz.luau-lsp)
  (optional)
- [Selene](https://marketplace.visualstudio.com/items?itemName=Kampfkarren.selene-vscode)
  (optional)
- Any Second Life viewer that has the `ExternalEditor` feature
- Automatic type definition downloading for `SLua`

### Commands

- `SL External Editor: Enable` - Enable The extension for the current directory
- `SL External Editor: Update LSP Defs` - Force an update and refresh of the LSP
  Defs
- `SL External Editor: Setup/Update Selene` - Force an update and refresh of the
  Selene Library

### Hints

Certain hints can be added to a script to make working with this extension
smoother, they are completely optional, but will help in situations where you
have many separate projects open at once, or use a single "Mono Project" folder.

Hints are written prefixed with the single line comment for their language, `//`
for LSL, `--` for SLua

- `@project <project_dir>` setting this will make the extension only match files
  for saving if they are within a directory path that contains `project_dir`
  - e.g. `-- @project huds/space_roleplay`
  - Would match a files in a directory like this
    `/home/user/secondlife/huds/space_roleplay/scripts/main.luau`
  - But not one like this
    `/home/user/projects/huds/secondlife/space_roleplay/main.luau`
  - This hint will also be used to try and automatically open the right folder,
    if the `secondLifeExternalEditor.dir.projects` config option is set.
- `@file <file_name>` this will override the default script name detection
  mechanism, it can be combined with `@project` to specify files inside a
  project
  - When used in combination with `@project` it restricts to that specific file
    withing the detected project folder.
  - When used without `@project` it just overrides the auto detected script name
    and follows the rest of the matching rules.

## Extension Settings

This extension contributes the following settings:

- `secondLifeExternalEditor.enabled`: Recommend this is set at a workspace level
  rather than system wide
- `secondLifeExternalEditor.dir.projects`: _**UNUSED**_ Will be used to open
  vscode automatically to the right director inside of this specified one, if it
  can match a file.
- `secondLifeExternalEditor.hints.prefix`: The prefix to use to provide hints to
  the extension
- `secondLifeExternalEditor.watcher.tempFilesRequireDirectoryPrefix`: Sets
  wether scripts need to be named with their folder name as well (this can be
  disabled, but is recommended to avoid false matches, especially when having
  multiple projects open at once) e.g. `<folder_name>/<file_name>` as the name
  of your script in SL.
- `secondLifeExternalEditor.watcher.fileExtensions`: List of file extensions to
  care about. (Defaults to `lua, luau, lsl, slua`)
- `secondLifeExternalEditor.download` Wether Type Def files should be
  automatically downloaded
- `secondLifeExternalEditor.download.location` Where those files should be
  stored for your projects
- Requires
  [Luau Language Server](https://marketplace.visualstudio.com/items?itemName=JohnnyMorganz.luau-lsp)
  or similar
  - `secondLifeExternalEditor.luau-lsp.downloadTypeDefs` A list of url's to
    download Luau Type Def files from
  - `secondLifeExternalEditor.luau-lsp.downloadApiDocs` A list of url's to
    download Luau-LSP Api documentation files from
- Requires
  [Selene](https://marketplace.visualstudio.com/items?itemName=Kampfkarren.selene-vscode)
  or similar
  - `secondLifeExternalEditor.selene.download` The location to download a selene
    standard library definition from
- _**Not yet implemented**_
  - `secondLifeExternalEditor.preprocessor.command`: _**NOT IMPLMENETED**_ The
    command to execute as a preprocessor step to affect the output before it is
    put into the viewers temp file
  - `secondLifeExternalEditor.preprocessor.watchIncludes`: _**NOT IMPLMENETED**_
    If the preprocessor outputs compatible information about extra files it
    included, then the extension will watch for those files changing as well

## Planned Features

- Integration with external preprocessing tools.
- Automatic opening to relevant directory if possible

## Known Issues

- It's not finished

## Release Notes

### 0.0

- `0.0.8` Add file open handling and auto closing of temp files
- `0.0.7` Fix for file copying not overwriting existing files
- `0.0.6` Setup publisher
- `0.0.5` Fix version issue
- `0.0.4` Implement Automatic type def downloads
- `0.0.3` Mac temp directory detection
- `0.0.2` Windows file path fixes
- `0.0.1` Initial implementation
