# SL External Editor

This Extension is designed to integrate vscode better as the external editor for
Second Life

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
  - This hint is also used to try and automatically open the right folder, if
    the `secondlifeExternalEditor.dir.projects` config option is set.
- `@file <file_name>` this will override the default script name detection
  mechanism, it can be combined with `@project` to specify files inside a
  project
  - When used in combination with `@project` it restricts to that specific file
    withing the detected project folder.
  - When used without `@project` it just overrides the auto detected script name
    and follows the rest of the matching rules.

## Extension Settings

This extension contributes the following settings:

- `secondlifeExternalEditor.enabled`: Recommend this is set at a workspace level
  rather than system wide
- `secondlifeExternalEditor.dir.projects`: _**UNUSED**_ Will be used to open
  vscode automatically to the right director inside of this specified one, if it
  can match a file.
- `secondlifeExternalEditor.hints.prefix`: The prefix to use to provide hints to
  the extension
- `secondlifeExternalEditor.watcher.tempFilesRequireDirectoryPrefix`: Sets
  wether scripts need to be named with their folder name as well (this can be
  disabled, but is recommended to avoid false matches) e.g.
  `<folder_name>/<file_name>` as the name of your script in sl.
- `secondlifeExternalEditor.watcher.fileExtensions`: List of file extensions to
  care about. (Defaults to `lua, luau, lsl, slua`)
- `secondlifeExternalEditor.download` Wether Type Def files should be
  automatically downloaded
- `secondlifeExternalEditor.download.location` Where those files should be
  stored for your projects
- Requires
  [Luau Language Server](https://marketplace.visualstudio.com/items?itemName=JohnnyMorganz.luau-lsp)
  or similar
  - `secondlifeExternalEditor.luau-lsp.downloadTypeDefs` A list of url's to
    download Luau Type Def files from
  - `secondlifeExternalEditor.luau-lsp.downloadApiDocs` A list of url's to
    download Luau-LSP Api documentation files from
- Requires
  [Selene](https://marketplace.visualstudio.com/items?itemName=Kampfkarren.selene-vscode)
  or similar
  - `secondlifeExternalEditor.selene.download` The location to download a selene
    standard library definition from
- `secondlifeExternalEditor.preprocessor.command`: _**NOT IMPLMENETED**_ This is
  to come
- `secondlifeExternalEditor.preprocessor.watchIncludes`: _**NOT IMPLMENETED**_
  This is to come

## Planned Features

- Integration with external preprocessing tools.
- Automatic opening to relevant directory if possible

## Known Issues

- It's not finished

## Release Notes

### 0.0

- `0.0.4` Implement Automatic type def downloads
- `0.0.3` Mac temp directory detection
- `0.0.2` Windows file path fixes
- `0.0.1` Initial implementation
