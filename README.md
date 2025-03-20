# create-yaspp
Package for creating a [`Yaspp`](https://github.com/imdfl/yaspp) web site

To use this package, you do not need to install it. Simply `cd` to the folder in which you want to create your `yaspp` project
(preferably an empty one) and run the command `npx create-yaspp`. You can also specify a different project folder. Note that the script **will not proceed** if the project contains a file/folder named like an asset that `create-yaspp` needs to copy.

    $ npx create-yaspp [...arguments]

## Command line options

### Runtime Options
- `--dryrun`: Dry run. Print all the steps.
- `--auto`: If the configuration process involves interaction with the user, then `create-yaspp` will use the values provided in the command line without prompting the user for input.
- `--target <path/to/target/folder>`: absolute or relative path of the folder in which the project will be created. Defaults to current working directory. **The target directory should not contain** any file or folder named like an asset that the script needs to create.
- `--no-install`: Don't make the sample site publish-ready by running the initialization scripts in it. You can perform this step yourself by running `yarn init-clean` or `yarn init-site` in the created project folder.

### Project Configuration Options

- `--branch <branch name>`: If provided, clone this branch of the `yaspp` library rather than `master`.


## Install procedure

The rest of this document uses the `yarn` command. You can replace it with your favorite package runner, e.g. `npm run ...`. However, the tool
itself requires `yarn` to run properly.

After the command line options are validated, `create-yaspp` performs the following actions:
1. Create a sample site under the project folder, including sample data and valid configuration files.
2. if `no-install` was not specified, run `yarn init-clean` in the project folder. This will clone the [`Yaspp`](https://github.com/imdfl/yaspp) repository into the `yaspp` folder and setup the `yaspp` platform by running the required scripts there.

## Post install

**Note**: If you save the result of this setup in a git repository, always make sure that the file `yaspp/README.md` is present. This file
Doesn't serve any purpose in the site, but it's needed just to keep the `yaspp` folder in the repository. Without it, deployment
on [Vercel](https://vercel.com) fails.

See the [`Yaspp project`](https://github.com/imdfl/yaspp) for details about building and publishing a `yaspp` site. If the installation completed successfully, you should be able to test your site by running `yarn dev` in the project root or in the `yaspp` folder.