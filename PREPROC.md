# External Preprocessor Documentation for SL External Editor extension

## Using the provided option

If you run the vscode command `SL External Editor: Install PreProc` it will
prompt you to confirm then download and setup a simple preprocessor, it is not
as fully featured as the Firestorm one yet, and only supports certain basic
includes and defines.

See it's documentation [here](https://github.com/WolfGangS/DSL-PreProc)

## Setting up your own Preprocessor

To setup your own preprocessor you only need to fill in the
`secondLifeExternalEditor.preprocessor.command.lsl` or
`secondLifeExternalEditor.preprocessor.command.slua` settings with a command to
run on your system.

The extension will run the command and use the output to put into SL.

There are 2 output formats, and 2 output options, depending on your tool you
will need to configure you command correctly.

### The command

The command is a general terminal command for your os. I supports the following
substitutions.

| Replacement | Description                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| `%script%`  | The path of the file for the preprocessor to start on                                                               |
| `%out%`     | The file to ouput to, if specified extension fill look for writes to that file for the output rather than `std_out` |
| `%lang%`    | The language that the extension believes the script is                                                              |

e.g. `python ~/sl/LSL-PyOptimizer/main.py --bom %script%`",

### Output formats

#### JSON

If your tool can output json in the correct format the extension can do extra
work, such as rerunning the tool if a dependency updates, not just the main file
of the script. This format is likely to be extended to help with future
features, but should remain backwards compatible.

The format is as follows.

```ts
{
    "text": string, // The text content of the generation, this is what will be put into SL
    "files": string[] // A string array of "full paths" to files that were included in this generation
    "hash": string|undefined // And optional hash (unused), will be used to prevent saves in sl on no change
}
```

#### 'Plain text'

If the tool outputs 'plain text' then that will be taken and put directly into
sl with no further processing.

### Output options

#### stdout

By default the extension will watch `stdout` to get the result of your tool's
generation, so just echo'ing out is enough.

E.g. `cat "%file%"`

#### file

If the command contains the replacement token `%out%` the extension will read
from the file specified in the parameter after the tool finishes running.

E.g. `cat "%file%" >> "%out%"`
