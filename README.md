# SL External Editor

<img src="icon.png" height="150px" align="right">

This Extension is designed to integrate vscode better as the external editor for
Second Life

<sub>This project is not associated with [Linden Lab](https://lindenlab.com/)
any use of trademarks or copyrighted terms is done in good faith to explain
clearly what this project is for, and not an attempt to misrepresent</sub>

### [Get it here](https://marketplace.visualstudio.com/items?itemName=wlf-io.sl-external-editor)

## Setup

I suggest that you chose a folder on your system to hold all your sl projects,
without better support in the SL viewer directly it is difficult to manage
multiple, though nothing is stopping you from having as many editors open as you
like.

### Using the "main project folder" setup style

Set the external editor config in the viewer to something like this..

- Windows:
  `"C:\Users\<user>\AppData\Local\Programs\Microsoft VS Code\Code.exe" "C:\Users\<user>\projects\sl\scripts" "%s"`
- Mac: `/opt/homebrew/bin/code -r "/Users/<user>/projects/sl/scripting" "%s"`
- Linux: `/usr/bin/code "/home/<user>/projects/sl/scripting" "%s"`

These are not exact examples, your system setup may differ, the location of the
directory for your scripts is entirely up to you

After that you should be good to go, though I would advise looking through the
config options below, and trying the hint system.

### Free wheeling it

This way works best if you open vscode before you start working in SL

Set the external editor config in the viewer to something like this..

- Windows:
  `"C:\Users\<user>\AppData\Local\Programs\Microsoft VS Code\Code.exe" "%s"`
- Mac: `/opt/homebrew/bin/code "%s"`
- Linux: `/usr/bin/code "%s"`

These are not exact examples, your system setup may differ.

## Support

Contact `WolfGang Senizen` in world if you are having issues.

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
- External Pre processing tools - Example available soon!
- Attempting to open project directories automatically

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
- `secondLifeExternalEditor.dir.projects`: Used to open vscode automatically to
  the right directory inside of this specified one, if it can match a file.
  - e.g. `/home/user/projects` `C:\Users\user\projects`
  - When a new tempfile is passed to vscode if it cannot be matched in the
    current workspace, the extension will combine this path with the `@project`
    hint and the (script name or `@file` hint) to try and locate the right place
    to open
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
- `secondLifeExternalEditor.matcher.autoCloseTempScript` If a temp script file
  is opened and a matching file is found, the temp file will be closed and
  matching file opened.
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
  - `secondLifeExternalEditor.preprocessor.command.lsl`: The command to execute
    as a preprocessor step to affect the output before it is put into the
    viewers temp file for lsl scripts
  - `secondLifeExternalEditor.preprocessor.command.slua`: The command to execute
    as a preprocessor step to affect the output before it is put into the
    viewers temp file for SLua scripts
  - `secondLifeExternalEditor.preprocessor.watchIncludes`: If the preprocessor
    outputs compatible information about extra files it included, then the
    extension will watch for those files changing as well

## Planned Features

- Updates

## Known Issues

- It's not finished

## Release Notes

### 0.2

- `0.2.2` Add Preproc downloading
- `0.2.1` Add Preproc out file support
- `0.2.0` Add Preproc support and fix major save bug

### 0.1

- `0.1.1` Add snippets and better selene toml handling
- `0.1.0` Cool icon and "release"

### 0.0

- `0.0.10` Fixed relative paths for type defs
- `0.0.9` Better handling of auto opening files.
- `0.0.8` Add file open handling and auto closing of temp files
- `0.0.7` Fix for file copying not overwriting existing files
- `0.0.6` Setup publisher
- `0.0.5` Fix version issue
- `0.0.4` Implement Automatic type def downloads
- `0.0.3` Mac temp directory detection
- `0.0.2` Windows file path fixes
- `0.0.1` Initial implementation
