
# SeeSharp

Welcome to SeeSharp. This VSCode extension provides extensions to the IDE that will hopefully speed up your .NET5 C# development workflow.

## Features

### Some new and interesting features

- Add / Remove project references
- Add / remove nuget packages
- Create solution file
- Add new project
  - Console application
  - WebAPI
  - Class library
  - xUnit
  - _...more to come!_

### Other features

NB: Some of the GIFs have changed slightly in terms of how they're organized. Also, most commands are available in Command Pallette, prefixed with `SeeSharp:`.

**Add C# Class**

![Add C# Class](./featureimages/newclass.gif)

**Add C# Enum**

![Add C# Enum](./featureimages/newenum.gif)

**Add C# Interface**

![Add C# Interface](./featureimages/newinterface.gif)

**Add fields from constructors**

![Add fields from constructors](./featureimages/fieldfromctor.gif)

**Add constructor from properties**

![Add constructor from properties](./featureimages/ctorfromprop.gif)

**Add read-only property from constructors**

![Add read-only property from constructors](./featureimages/propfromctor.gif)

**Add property from constructors**

![Add property from constructors](./featureimages/fullpropfromctor.gif)

This extension traverses up the folder tree to find the project.json or *.csproj and uses that as the parent folder to determine namespaces.

-----------------------------------------------------------------------------------------------------------

## Credits

Although rebranded, and with a whole new set of features, this repo started with fork of https://github.com/KreativJos/csharpextensions, which is a fork of https://github.com/jchannon/csharpextensions. Thank you!


## Licence

MIT

See [licence.txt](./licence.txt)
Legacy Repository: [jchannon/SeeSharp](https://github.com/jchannon/SeeSharp)
