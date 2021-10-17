import * as vscode from 'vscode';
import * as path from 'path';
import { EOL } from 'os';
import * as fs from 'fs';
import CodeActionProvider from './codeActionProvider';
import NamespaceDetector, { findUp } from './namespaceDetector';

const classnameRegex = new RegExp(/\${classname}/, 'g');
const namespaceRegex = new RegExp(/\${namespace}/, 'g');

const oneArgCommands = {
    // <command>: [<project type>, <comand prefix>]
    "seesharp.createClassLibrary": ['Class Library', 'dotnet new classlib -o'],
    "seesharp.createConsoleApp": ['Console Application', 'dotnet new console -o'],
    "seesharp.createWebApi": ['ASP.NET Core Web API', 'dotnet new webapi -o'],
    "seesharp.createXUnit": ['xUnit Test Project', 'dotnet new xunit -o'],
};

export function activate(context: vscode.ExtensionContext): void {
    const documentSelector: vscode.DocumentSelector = {
        language: 'csharp',
        scheme: 'file'
    };
    context.subscriptions.push(vscode.commands.registerCommand('seesharp.createClass',
        async (args: any) => await promptAndSave(args, 'Class')));
    context.subscriptions.push(vscode.commands.registerCommand('seesharp.createInterface',
        async (args: any) => await promptAndSave(args, 'Interface')));
    context.subscriptions.push(vscode.commands.registerCommand('seesharp.createEnum',
        async (args: any) => await promptAndSave(args, 'Enum')));
    context.subscriptions.push(vscode.commands.registerCommand('seesharp.createController',
        async (args: any) => await promptAndSave(args, 'Controller')));
    context.subscriptions.push(vscode.commands.registerCommand('seesharp.createApiController',
        async (args: any) => await promptAndSave(args, 'ApiController')));

    context.subscriptions.push(vscode.commands.registerCommand('seesharp.createSolution',
        async () => await createNewFile('Solution File', 'dotnet new sln -n')));
    context.subscriptions.push(vscode.commands.registerCommand('seesharp.addProjectReference',
        async (args: any) => await addProjectReference(args)));
    context.subscriptions.push(vscode.commands.registerCommand('seesharp.removeProjectReference',
        async (args: any) => await addProjectReference(args)));
    context.subscriptions.push(vscode.commands.registerCommand('seesharp.addNugetPackage',
        async (args: any) => await doNugetPackage(args, 'dotnet add package')));
    context.subscriptions.push(vscode.commands.registerCommand('seesharp.removeNugetPackage',
        async (args: any) => await doNugetPackage(args, 'dotnet remove package')));

    for (const [command, [projectName, commandPrefix]] of Object.entries(oneArgCommands)) {
        context.subscriptions.push(vscode.commands.registerCommand(command,
            async () => await createNewProject(projectName, commandPrefix)));
    }

    const codeActionProvider = new CodeActionProvider();
    const disposable = vscode.languages.registerCodeActionsProvider(documentSelector, codeActionProvider);

    context.subscriptions.push(disposable);
    
    vscode.window.onDidCloseTerminal(async (e) => {
        vscode.window.showErrorMessage(`Terminal ${e.name}/${(await e.processId)} quitting. Status: ${e.exitStatus?.code}`);
    });
}

async function doNugetPackage(args: any, commandPrefix: string) {
    const startDir = await getIncomingDirectory(args);
    const currentProjectFile = await findUp('*.csproj', { cwd: startDir });
    if (!currentProjectFile) {
        vscode.window.showWarningMessage('Project file not found. Aborting.');
        return;
    }

    await createNewProject('nuget package', commandPrefix, false, path.dirname(currentProjectFile));
}

async function addProjectReference(args: any) {
    const startDir = await getIncomingDirectory(args);
    const currentProjectFile = await findUp('*.csproj', { cwd: startDir });
    if (!currentProjectFile) return;

    const selected = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(startDir),
        openLabel: 'Select project',
        filters: { 'C# Project': ['csproj'] }
    });
    if (!selected) return;

    const projectFile = selected[0].fsPath;
    if (projectFile === currentProjectFile) {
        vscode.window.showErrorMessage('You should not add project as a reference to itself');
        return;
    }

    const terminal = vscode.window.createTerminal({
        name: 'SeeSharp',
        cwd: path.dirname(currentProjectFile)
    });
    terminal.sendText(`dotnet add reference "${projectFile}"`);
}

async function createNewProject(
    projectName: string, 
    commandPrefix: string, 
    addToSolution: boolean = true,
    cwd: string = ''
) {
    const promptName = `${projectName.replace(' ', '')}1`;
    const objectName = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        prompt: `Please enter ${projectName} name`,
        value: promptName,
        valueSelection: [0, promptName.length]
    });

    if (!objectName) return;

    try {
        const terminal = vscode.window.createTerminal({
            cwd: addToSolution ? '' : cwd,
            name: 'SeeSharp'
        });
        
        terminal.sendText(`${commandPrefix} ${objectName}`);

        if (addToSolution) {
            const startDir = getWorkspecePathIfAny() || __dirname;
            const solutionFile = await findUp('*.sln', { cwd: startDir });

            if (!solutionFile) {
                const slnName = path.basename(startDir);
                vscode.window.showInformationMessage(`Creating solution: ${slnName}.`);
                terminal.sendText(`dotnet new sln -n ${slnName}`);
            }
            terminal.sendText(`dotnet sln add ${path.join(objectName, objectName + '.csproj')}`);
        }

        vscode.window.showInformationMessage(`${projectName} "${objectName}" processing succeeded.`);
    } catch (err) {
        console.error('Error executing command:', err);
        vscode.window.showErrorMessage('Error executing command. See extensions log for more info');
    }
}

async function createNewFile(projectName: string, commandPrefix: string) {
    const promptName = `${projectName.replace(' ', '')}1`;
    const objectName = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        prompt: `Please enter ${projectName} name`,
        value: promptName,
        valueSelection: [0, promptName.length]
    });

    if (!objectName) return;

    try {
        const terminal = vscode.window.createTerminal('SeeSharp');
        terminal.sendText(`${commandPrefix} ${objectName}`);
        vscode.window.showInformationMessage(`${projectName} "${objectName}" created.`);
    } catch (err) {
        console.error('Error executing command:', err);
        vscode.window.showErrorMessage('Error executing command. See extensions log for more info');
    }
}

function getWorkspecePathIfAny() {
    return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length
        ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
}

function getDefaultArgs() {
    const activeFile = vscode.window.activeTextEditor?.document.fileName;

    return {
        _fsPath: activeFile || getWorkspecePathIfAny()
    };
}

async function getIncomingDirectory(args: any) {
    if (!args) {
        args = getDefaultArgs();
    }

    let incomingpath: string = args._fsPath || args.fsPath || args.path;
    let isDirectory = false;
    try {
        isDirectory = (await fs.promises.lstat(incomingpath)).isDirectory();
    } catch { }
    if (!isDirectory) {
        incomingpath = path.dirname(incomingpath);
    }

    return incomingpath;
}

async function promptAndSave(args: any, templatetype: string) {
    try {
        const promptFilename = `new${templatetype}.cs`;
        const newfilename = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            prompt: 'Please enter filename',
            value: promptFilename,
            valueSelection: [0, promptFilename.length - 3]
        });
        
        if (!newfilename) return;

        const incomingpath = await getIncomingDirectory(args);

        let newfilepath = incomingpath + path.sep + newfilename;

        newfilepath = correctExtension(newfilepath);

        if (fs.existsSync(newfilepath)) {
            vscode.window.showErrorMessage(`File already exists: ${EOL}${newfilepath}`);
            return;
        }

        const namespaceDetector = new NamespaceDetector(newfilepath);
        const namespace = await namespaceDetector.getNamespace();
        const typename = path.basename(newfilepath, '.cs');

        await openTemplateAndSaveNewFile(templatetype, namespace, typename, newfilepath);
    } catch (errOnInput) {
        console.error('Error on input', errOnInput);

        vscode.window.showErrorMessage('Error on input. See extensions log for more info');
    }
}

function correctExtension(filename: string) {
    if (path.extname(filename) !== '.cs') {
        if (filename.endsWith('.')) return filename + 'cs';
        else return filename + '.cs';
    }

    return filename;
}

function findCurrentExtension(): vscode.Extension<any> | undefined {
    return vscode.extensions.getExtension('Soma Mbadiwe.SeeSharp');
}

async function openTemplateAndSaveNewFile(type: string, namespace: string, filename: string, originalfilepath: string) {
    const templatefileName = type + '.tmpl';
    const extension = findCurrentExtension();

    if (!extension) {
        vscode.window.showErrorMessage('Weird, but the extension you are currently using could not be found');

        return;
    }

    const templateFilePath = path.join(extension.extensionPath, 'templates', templatefileName);

    try {
        const doc = fs.readFileSync(templateFilePath, 'utf-8');
        const isForCsFile = namespace || filename;
        const includeNamespaces = isForCsFile && vscode.workspace.getConfiguration().get('seesharp.includeNamespaces', true);
        let namespaces = '';

        if (includeNamespaces) {
            namespaces = [
                'using System;',
                'using System.Collections.Generic;',
                'using System.Linq;',
                'using System.Threading.Tasks;'
            ].join(EOL);

            namespaces = `${namespaces}${EOL}${EOL}`;
        }

        let text = doc;
        let cursorPosition;
        if (isForCsFile) {
            cursorPosition = findCursorInTemplate(text);

            text = text
                .replace(namespaceRegex, namespace)
                .replace(classnameRegex, filename)
                .replace('${namespaces}', namespaces)
                .replace('${cursor}', '');
        }

        fs.writeFileSync(originalfilepath, text);

        if (isForCsFile && cursorPosition) {
            const newselection = new vscode.Selection(cursorPosition, cursorPosition);

            const openedDoc = await vscode.workspace.openTextDocument(originalfilepath);
            const editor = await vscode.window.showTextDocument(openedDoc);

            editor.selection = newselection;
        }
    } catch (errTryingToCreate) {
        const errorMessage = `Error trying to create file '${originalfilepath}' from template '${templatefileName}'`;

        console.error(errorMessage, errTryingToCreate);

        vscode.window.showErrorMessage(errorMessage);
    }
}

function findCursorInTemplate(text: string): vscode.Position | null {
    const cursorPos = text.indexOf('${cursor}');
    const preCursor = text.substr(0, cursorPos);
    const matchesForPreCursor = preCursor.match(/\n/gi);

    if (matchesForPreCursor === null) return null;

    const lineNum = matchesForPreCursor.length;
    const charNum = preCursor.substr(preCursor.lastIndexOf('\n')).length;

    return new vscode.Position(lineNum, charNum);
}

export function deactivate(): void { 
    const extensionTerminals = vscode.window.terminals.filter(t => t.name === "SeeSharp");
    if (extensionTerminals) {
        for (let i = 0; i < extensionTerminals.length; i++) {
            extensionTerminals[i].dispose();
        }
    }
}
