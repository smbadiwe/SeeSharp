import * as vscode from 'vscode';
import * as path from 'path';
import { EOL } from 'os';
import * as fs from 'fs';
import CsprojReader from './csprojReader';
import NamespaceDetector, { findUp } from './namespaceDetector';

const classnameRegex = new RegExp(/\${classname}/, 'g');
const namespaceRegex = new RegExp(/\${namespace}/, 'g');

export class Templating {
    public async createCodeFileFromTemplate(args: any, templatetype: string) {
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

            newfilepath = this.correctExtension(newfilepath);

            if (fs.existsSync(newfilepath)) {
                vscode.window.showErrorMessage(`File already exists: ${EOL}${newfilepath}`);
                
                return;
            }

            const namespaceDetector = new NamespaceDetector(newfilepath);
            const namespace = await namespaceDetector.getNamespace();
            const typename = path.basename(newfilepath, '.cs');

            await this.openTemplateAndSaveNewFile(templatetype, namespace, typename, newfilepath);
        } catch (errOnInput) {
            console.error('Error on input', errOnInput);

            vscode.window.showErrorMessage('Error on input. See extensions log for more info');
        }
    }

    private async openTemplateAndSaveNewFile(type: string, namespace: string, filename: string, originalfilepath: string) {
        const templatefileName = type + '.tmpl';
        const extension = vscode.extensions.getExtension('Soma Mbadiwe.SeeSharp');
  
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
                cursorPosition = this.findCursorInTemplate(text);
  
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
  
    private findCursorInTemplate(text: string): vscode.Position | null {
        const cursorPos = text.indexOf('${cursor}');
        const preCursor = text.substr(0, cursorPos);
        const matchesForPreCursor = preCursor.match(/\n/gi);
  
        if (matchesForPreCursor === null) return null;
  
        const lineNum = matchesForPreCursor.length;
        const charNum = preCursor.substr(preCursor.lastIndexOf('\n')).length;
  
        return new vscode.Position(lineNum, charNum);
    }
  
    private correctExtension(filename: string) {
        if (path.extname(filename) !== '.cs') {
            if (filename.endsWith('.')) return filename + 'cs';
            else return filename + '.cs';
        }

        return filename;
    }
}

export class ShellRuns {

    async addNugetPackage(args: any) {
        const startDir = await getIncomingDirectory(args);
        const currentProjectFile = await findUp('*.csproj', { cwd: startDir });
        if (!currentProjectFile) {
            vscode.window.showWarningMessage('Project file not found. Aborting.');
            
            return;
        }
  
        await this.runOneArgCommand('nuget package', 'dotnet add package', path.dirname(currentProjectFile));
    }
  
    async removeNugetPackage(args: any) {
        await this.removeReference(args, 'nuget package');
    }

    private async read(file: string): Promise<string> {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    
        return document.getText();
    }

    async addProjectReference(args: any) {
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
  
    async removeProjectReference(args: any) {
        await this.removeReference(args, 'project reference');
    }

    private async removeReference(args: any, refType: string) {
        const startDir = await getIncomingDirectory(args);
        const currentProjectFile = await findUp('*.csproj', { cwd: startDir });
        if (!currentProjectFile) {
            vscode.window.showWarningMessage('Project file not found. Aborting.');
            
            return;
        }
    
        try {
            const fileContent = await this.read(currentProjectFile);
            const projectReader = new CsprojReader(fileContent);
            const isForPackage = refType.endsWith('package');
            const existingRefs = isForPackage 
                ? await projectReader.getPackageRefs()
                : await projectReader.getProjectRefs();
            if (!existingRefs || existingRefs.length === 0) return;
      
            let items: vscode.QuickPickItem[];
            if (isForPackage) {
                items = existingRefs.map(r => ({
                    label: r.Include,
                    detail: `${r.Include} -- v${r.Version}`
                }));
            } else {
                items = existingRefs.map(r => ({
                    label: path.basename(r.Include),
                    detail: r.Include
                }));
            }
            const selected = await vscode.window.showQuickPick(items, {
                canPickMany: false,
                title: `Select ${refType} to be removed`
            });
            if (!selected) return;
      
            const terminal = vscode.window.createTerminal({
                cwd: path.dirname(currentProjectFile),
                name: 'SeeSharp'
            });
            const prop = isForPackage ? 'package' : 'reference';
            const selectedValue = isForPackage ? selected.label : selected.detail;
            terminal.sendText(`dotnet remove ${prop} "${selectedValue}"`);
            vscode.window.showInformationMessage(` ${refType} "${selectedValue}" removed successfully.`);
        } catch (e) {
            console.error(`Error removing  ${refType}.`, e);
            vscode.window.showErrorMessage(`Error removing  ${refType}. See log for details.`);
        }
    }
  
    async createNewProject(projectName: string, commandPrefix: string, cwd = '') {
        await this.runOneArgCommand(projectName, commandPrefix, cwd, true);
    }

    async runOneArgCommand(
        projectName: string, 
        commandPrefix: string,
        cwd = '', 
        addToSolution = true
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
  
    async createNewFile(projectName: string, commandPrefix: string) {
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

