# create-yaspp
Package for creating a [`Yaspp`](https://github.com/imdfl/yaspp) web site

To use this package, you do not need to install it. Simply `cd` to the folder in which you want to create your `yaspp` project
(preferably an empty one) and run the command

    $ npx create-yaspp [...arguments]

## Command line options

The generator prompts you for all the configuration values, but you can provide them in the command line.

- `--dry`: Dry run. Print all the steps and the resulting configuration.
- `--refresh`: If create-yaspp was run before in the current folder, then a file called `yaspp.site.json` should have been added to the project's root folder. If this file is found, `create-yaspp` will use the values in it to run the setup again, copying or cloning the site if a valid source is specified in the configuration.
- `--config <path/to/yourconfig.json>`: Use the values stored in the provided configuration file without prompting the user for input. If the values are invalid, an error message is printed and no setup is performed.
- `--repository <git url>`: The content repository to clone. If provided, the repository will be cloned into the `site` folder.
- `--branch <branch name>`: If provided, only this branch will be cloned from the repository.
- `--path <path>`: The relative or absolute path in your file system, in which the site's content is located. If provided, the content
will be copied to the `site` folder.
- `--content-root <path>`: Your top level content folder (the markdown files), relative to project root. Before build, this folder's content is copied to `yaspp/public/content`
- `--content-index <path>`: Relative to content root. This is the path to the folder that contains the page to show in the root url
- `--locale-root <path>`: Your top level locale folder, relative to project root. Before build, this folder's content is copied to `yaspp/public/locales`
- `--style-root <path>`: Your top level styles folder, relative to project root. If provided, this folder's content is copied to `yaspp/public/styles` before build.
- `--style-index <path>`: Your main scss file, relative to style root. If you provide this value, this file is copied to `yaspp/public/styles/site.scss`. If you don't provide this value, omit `--style-root`
- `--assets-root <path>`: Your top level assets folder, relative to project root.If provided, this folder's content is copied to `yaspp/public/assets/site` before build.
- `--langs <lang,lang...>`: Supported content languages
-  `--default-locale <lang>`: The default content language




