# PostCSS Mixins Autocomplete

A Visual Studio Code extension that provides autocomplete suggestions for PostCSS mixins defined in your project.

## Features

- Automatically detects mixin definitions in your CSS/PostCSS files using `@define-mixin`
- Provides autocomplete suggestions when typing `@mixin`
- Supports both `.css` and `.pcss` file extensions
- Updates in real-time as you add or modify mixins
- Configurable file patterns for watching CSS files

## Installation

The extension is currently WIP and not released on VS Code marketplace. You can install manually though:

- Download VSIX file from https://github.com/fongandrew/css-class-autocomplete/releases
- Select `Install from VSIX` from the VS Code command palette. 

## Usage

1. Define your mixins in your CSS/PostCSS files using `@define-mixin`:

```css
@define-mixin button {
    padding: 10px 20px;
    border-radius: 4px;
    /* ... */
}
```

2. Start typing `@mixin` in your CSS/PostCSS files, and the extension will suggest available mixins:

```css
.my-button {
    @mixin button;
}
```

## Requirements

- Visual Studio Code version 1.96.0 or higher
- PostCSS files in your project using `@define-mixin` syntax

## Extension Settings

This extension adds the following settings:

* `postcssMixinsAutocomplete.cssFilePatterns`: Array of glob patterns for files to watch for mixin definitions.
  Default: `["**/*.{css,pcss,postcss}"]`

  Example configuration in settings.json:
  ```json
  {
    "postcssMixinsAutocomplete.cssFilePatterns": [
      "**/*.css",
      "**/*.pcss",
      "src/**/*.postcss"
    ]
  }
  ```

## Known Issues

None currently.
