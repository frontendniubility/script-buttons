import { promises as fsPromises } from 'fs';
import vscode from 'vscode';
import { workspace } from 'vscode';
import { Disposable, PackageJson, Scripts } from './types';
import fs from "fs";
import path from "path";
const { readFile } = fsPromises;

export function activate(context: vscode.ExtensionContext) {
  const disposables: Disposable[] = [];
  const terminals: { [name: string]: vscode.Terminal } = {};
  const cwd = getWorkspaceFolderPath();

  function resolveAutoPackageManager() {

    if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
      return "pnpm";
    } else if (fs.existsSync(path.join(cwd, "package-lock.json"))) {
      return "npm";
    } else if (fs.existsSync(path.join(cwd, "yarn-lock.json"))) {
      return "yarn";
    } else
      return "pnpm";
  }

  let config = vscode.workspace.getConfiguration('NodePackageManager');

  let npmName = config.get<string>('name');
  if (npmName?.toLowerCase().trim() == "auto") {
    npmName = resolveAutoPackageManager();
  }
  npmName = resolveAutoPackageManager();
  // config.update('name', 'A', vscode.ConfigurationTarget.Global);


  function addDisposable(disposable: Disposable) {
    context.subscriptions.push(disposable);
    disposables.push(disposable);
  }


  function cleanup() {
    disposables.forEach((disposable) => disposable.dispose());
  }

  function createStatusBarItem(text: string, tooltip?: string, command?: string, color?: string) {
    const item = vscode.window.createStatusBarItem(1, 0);
    item.text = text;
    item.command = command;
    item.tooltip = tooltip;
    item.color = color;

    addDisposable(item);
    item.show();

    return item;
  }

  function getWorkspaceFolderPath(): string {
    const workspaceFolder = workspace.workspaceFolders?.[0];
    const path = workspaceFolder?.uri.fsPath;
    return path ?? ".";
  }

  async function getJsonFile<T>(path: string) {
    const fileBuffer = await readFile(path);
    const data = JSON.parse(fileBuffer.toString()) as T;
    return data;
  }

  async function getPackageJson() {
    const packageJson = await getJsonFile<PackageJson>(`${cwd}/package.json`);
    return packageJson;
  }

  async function getConfigJson() {
    const config = await getJsonFile<Scripts>(`${cwd}/script-buttons.json`);
    return config;
  }

  function createErrorMessage() {
    createStatusBarItem(`$(circle-slash) Script Buttons`, `No scripts found!`, undefined);
  }

  function createRefreshButton() {
    createStatusBarItem(
      '$(refresh)',
      'Script Buttons: Refetches the scripts from your package.json file',
      'script-buttons.refreshScripts',
    );
  }

  function createScriptButtonsAndCommands(scripts: Scripts, isNpm = false) {
    for (const name in scripts) {
      const command = isNpm ? `${npmName} run ${name}` : scripts[name];
      const vscCommand = createVscCommand(command, name, isNpm);

      const color = isNpm ? 'white' : undefined;
      createStatusBarItem(name, command, vscCommand, color);
    }
  }

  function createVscCommand(command: string, name: string, isNpm = false) {
    const vscCommand = `script-buttons.${isNpm && (npmName + '-')}${name.replace(' ', '')}`;

    const commandDisposable = vscode.commands.registerCommand(vscCommand, async () => {
      let terminal = terminals[vscCommand];

      if (terminal) {
        delete terminals[vscCommand];
        terminal.dispose();
      }

      terminal = vscode.window.createTerminal({
        name,
        cwd,
      });

      terminals[vscCommand] = terminal;

      terminal.show(true);
      terminal.sendText(command);
    });

    addDisposable(commandDisposable);
    return vscCommand;
  }

  async function init() {
    cleanup();
    registerCommands();
    createRefreshButton();

    let scripts: Scripts = {};

    try {
      const packageJson = await getPackageJson();
      console.log('Loaded package.json!');

      // ${npmName} install command
      const vscCommand = createVscCommand(`${npmName} install`, 'install', true);
      createStatusBarItem(`${npmName?.toUpperCase()} Install`, `${npmName} install`, vscCommand, 'white');

      createScriptButtonsAndCommands(packageJson.scripts, true);
      scripts = { ...scripts, ...packageJson.scripts };
    } catch {
      console.log('No package.json found!');
    }

    try {
      const configScripts = await getConfigJson();
      console.log('Loaded script-buttons.json!');

      createScriptButtonsAndCommands(configScripts);
      scripts = { ...scripts, ...configScripts };
    } catch {
      console.log('No script-buttons.json found!');
    }

    if (!Object.keys(scripts).length) {
      createErrorMessage();
    }
  }

  function registerCommands() {
    const refreshScriptsDisposable = vscode.commands.registerCommand(
      'script-buttons.refreshScripts',
      () => {
        init();
      },
    );

    addDisposable(refreshScriptsDisposable);
  }

  init();
}

export function deactivate() { }
