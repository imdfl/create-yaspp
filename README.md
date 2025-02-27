# create-yaspp
Package for creating a [`Yaspp`](https://github.com/imdfl/yaspp) web site

To use this package, you do not need to install it. Simply `cd` to the folder in which you want to create your `yaspp` project
(preferably an empty one) and run the command. You can also specify a different project folder. Note that the script **will not proceed** if the project folder is not empty.

    $ npx create-yaspp [...arguments]

## Command line options

### Runtime Options
- `--dryrun`: Dry run. Print all the steps and the resulting configuration.
- `--config <path/to/yourconfig.json>`: Use the values stored in the provided configuration file
- `--auto`: If a configuration file was provided with `--config` or if the auto-saved file `yaspp.site.json` is found, then `create-yaspp` will use the values in it to run the setup, without prompting the user for input, copying or cloning the site if a valid source is specified in the configuration.
- `--refesh`: If a valid configuration was provided with `--config` or if the auto-saved file `yaspp.site.json` is found, try
to refresh the site's content (clone or copy again) based on the values in the configuration.
- `--no-content`: Skip copying/cloning site content and the yaspp library.
- `--target <path/to/target/folder>`: absolute or relative path of the folder in which the project will be created. Defaults to current working directory. **The target 

### Project Configuration Options
The generator prompts you for all the configuration values, but you can provide them in the command line.

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


## Install procedure

After the configuration is validated, `create-yaspp` performs the following actions:
1. If a repository or a file system path were provided, clone/copy that data source into the `site` folder
2. Clone the [`Yaspp`](https://github.com/imdfl/yaspp) project into the `yaspp` folder
3. Save the configuration in `yaspp.config.json`
4. Copy default `.gitignore` and `package.json` to the project root, unless these files already exist.
5. Setup the `yaspp` platform by running the required scripts there.