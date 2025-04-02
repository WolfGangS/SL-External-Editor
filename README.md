# SL External Editor

This Extension is designed to integrate vscode better as the external editor for
Secondlife

## Features

Detects saves to recognized file extensions, and matches them to files that the
Secondlife viewer has created in the system temp directory

This is done either purely by name, by directory and name, or by specified hints
using directory and name to match

## Requirements

Secondlife using the external editor feature see Debug Setting `ExternalEditor`

## Extension Settings

This extension contributes the following settings:

- `sl-ext.enabled`: Recomend this is set at a workspace level rather than system
  wide
- `sl-ext.dir.projects`: _**UNUSED**_ Will be used to open vscode automatically
  to the right director inside of this specified one, if it can match a file.
- `sl-ext.hints.prefix`: The prefix to use to provide hints to the extension
- `sl-ext.watcher.tempFilesRequireDirectoryPrefix`: Sets wether scripts need to
  be named with their folder name aswell (this can be disabled, but is
  reconmended to avoid false matches) e.g. `<folder_name>/<file_name>` as the
  name of your script in sl.
- `sl-ext.watcher.fileExtensions`: List of file extensions to care about.
  (Defaults to `lua, luau, lsl`)
- `sl-ext.preprocessor.watchIncludes`: _**NOT IMPLMENETED**_ This is to come
- `sl-ext.preprocessor.command`: _**NOT IMPLMENETED**_ This is to come

## Planned Features

- Integration with external preprocessing tools.
- Automatic opening to relevant directory if possible
- Mac support for crazy temporaty file paths

## Known Issues

- It's not finished

## Release Notes

### 0.0.1

- Testing
