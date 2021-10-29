import * as vscode from 'vscode';
import * as path from 'path';
import { EOL } from 'os';
import * as fs from 'fs';
import CsprojReader from './csprojReader';
import NamespaceDetector, { findUp } from './namespaceDetector';
import { EXT_NAME, NodejsTerminal, VsCodeTerminal, getWorkspecePathIfAny, seeSharpChannel } from './shell';

const classnameRegex = new RegExp(/\${classname}/, 'g');
const namespaceRegex = new RegExp(/\${namespace}/, 'g');

class BaseCommander {
    showErrorMsg(msg: string, e: any = undefined) {
        console.error(msg, e);
        seeSharpChannel.appendLine(`[ERROR] ${msg}. ${e}`);
        vscode.window.showErrorMessage(`${msg}. See ${EXT_NAME} log for more details.`);
    }

    showInfoMsg(msg: string) {
        vscode.window.showInformationMessage(msg);
        seeSharpChannel.appendLine(`[INFO] ${msg}`);
    }

    showWarningMsg(msg: string) {
        vscode.window.showWarningMessage(msg);
        seeSharpChannel.appendLine(`[WARN] ${msg}`);
    }
        
    private getDefaultArgs() {
        const activeFile = vscode.window.activeTextEditor?.document.fileName;

        return {
            _fsPath: activeFile || getWorkspecePathIfAny()
        };
    }

    getIncomingPath(args: any): string {
        if (!args) {
            args = this.getDefaultArgs();
        }

        return args._fsPath || args.fsPath || args.path;
    }

    async getIncomingDirectory(args: any) {
        return await this.ensureIsDirectory(this.getIncomingPath(args));
    }

    async ensureIsDirectory(incomingpath: string) {
        let isDirectory = false;
        try {
            isDirectory = (await fs.promises.lstat(incomingpath)).isDirectory();
        } catch { }
        if (!isDirectory) {
            incomingpath = path.dirname(incomingpath);
        }

        return incomingpath;
    }
}

export class Templating extends BaseCommander {
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

            const incomingpath = await this.getIncomingDirectory(args);

            let newfilepath = incomingpath + path.sep + newfilename;

            newfilepath = this.correctExtension(newfilepath);

            if (fs.existsSync(newfilepath)) {
                this.showErrorMsg(`File already exists: ${EOL}${newfilepath}`);
                
                return;
            }

            const namespaceDetector = new NamespaceDetector(newfilepath);
            const namespace = await namespaceDetector.getNamespace();
            const typename = path.basename(newfilepath, '.cs');

            await this.openTemplateAndSaveNewFile(templatetype, namespace, typename, newfilepath);
        } catch (e) {
            this.showErrorMsg('Error on input.', e);
        }
    }

    private async openTemplateAndSaveNewFile(type: string, namespace: string, filename: string, originalfilepath: string) {
        const templatefileName = type + '.tmpl';
        const extension = vscode.extensions.getExtension(`smbadiwe.${EXT_NAME}`);
  
        if (!extension) {
            this.showErrorMsg('Weird, but the extension you are currently using could not be found');
  
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
  
            this.showErrorMsg(errorMessage, errTryingToCreate);
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


export class ShellRuns extends BaseCommander {
    private getTerminal(cwd: string | undefined = undefined) {
        const useVSCodeTerminal = vscode.workspace.getConfiguration().get('seesharp.useVSCodeTerminal', true);
        if (useVSCodeTerminal) {
            return new VsCodeTerminal(cwd);
        }

        return new NodejsTerminal(cwd);
    }

    async addNugetPackage(args: any) {
        const startDir = await this.getIncomingDirectory(args);
        const currentProjectFile = await findUp('*.csproj', { cwd: startDir });
        if (!currentProjectFile) {
            this.showWarningMsg('Project file not found. Aborting.');
            
            return;
        }
  
        await this.runOneArgCommand({
            projectName: 'nuget package', 
            commandPrefix: 'dotnet add package', 
            cwd: path.dirname(currentProjectFile)
        });
    }
  
    async removeNugetPackage(args: any) {
        await this.removeReference(args, 'nuget package');
    }

    private async read(file: string): Promise<string> {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    
        return document.getText();
    }

    async addProjectReference(args: any) {
        const startDir = await this.getIncomingDirectory(args);
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
            this.showErrorMsg('You should not add project as a reference to itself');
            
            return;
        }
  
        const terminal = this.getTerminal(path.dirname(currentProjectFile));
        await terminal.sendText(`dotnet add reference "${projectFile}"`);
    }
  
    async removeProjectReference(args: any) {
        await this.removeReference(args, 'project reference');
    }

    private async removeReference(args: any, refType: string) {
        const startDir = await this.getIncomingDirectory(args);
        const currentProjectFile = await findUp('*.csproj', { cwd: startDir });
        if (!currentProjectFile) {
            this.showWarningMsg('Project file not found. Aborting.');
            
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
      
            const terminal = this.getTerminal(path.dirname(currentProjectFile));
            const prop = isForPackage ? 'package' : 'reference';
            const selectedValue = isForPackage ? selected.label : selected.detail;
            await terminal.sendText(`dotnet remove ${prop} "${selectedValue}"`);
            this.showInfoMsg(`${refType} "${selectedValue}" removed successfully.`);
        } catch (e) {
            this.showErrorMsg(`Error removing  ${refType}.`, e);
        }
    }
  
    async compile(args: any, task: string, configuration: string = 'Debug') {
        /**
         * @param task can be either of 'build', 'clean'.
         * @param configuration can be either of 'Debug', 'Release'.
         */
        let incomingpath = this.getIncomingPath(args);
        let commandText;
        if (['.sln', '.csproj'].includes(path.extname(incomingpath))) {
            commandText = `dotnet ${task} "${incomingpath}" --configuration ${configuration}`;
        } else {
            commandText = `dotnet ${task} --configuration ${configuration}`;
        }
        try {
            const terminal = this.getTerminal(await this.ensureIsDirectory(incomingpath));
            await terminal.sendText(commandText);
            this.showInfoMsg(`${task} (${configuration}) successful.`);
        } catch (e) {
            this.showErrorMsg(`${task} (${configuration}) failed.`, e);
        }
    }

    async createNewProject(projectName: string, commandPrefix: string, cwd = '') {
        await this.runOneArgCommand({ projectName, commandPrefix, cwd, addToSolution: true });
    }

    async runOneArgCommand({
        projectName, 
        commandPrefix,
        cwd = '', 
        addToSolution = false
    }: {
        projectName: string, 
        commandPrefix: string,
        cwd?: string, 
        addToSolution?: boolean
    }) {
        const promptName = `${projectName.replace(' ', '')}1`;
        const objectName = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            prompt: `Please enter ${projectName} name`,
            value: promptName,
            valueSelection: [0, promptName.length]
        });
  
        if (!objectName) return;
  
        try {
            const terminal = this.getTerminal(addToSolution ? '' : cwd);
            await terminal.sendText(`${commandPrefix} ${objectName}`);
  
            if (addToSolution) {
                const startDir = getWorkspecePathIfAny() || __dirname;
                const solutionFile = await findUp('*.sln', { cwd: startDir });
  
                if (!solutionFile) {
                    const slnName = path.basename(startDir);
                    this.showInfoMsg(`Creating solution: ${slnName}.`);
                    await terminal.sendText(`dotnet new sln -n ${slnName}`);
                }
                await terminal.sendText(`dotnet sln add ${path.join(objectName, objectName + '.csproj')}`);
            }
  
            this.showInfoMsg(`${projectName} "${objectName}" processing succeeded.`);
        } catch (err) {
            this.showErrorMsg('Error executing command.', err);
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
            const terminal = this.getTerminal();
            await terminal.sendText(`${commandPrefix} ${objectName}`);
            this.showInfoMsg(`${projectName} "${objectName}" created.`);
        } catch (err) {
            this.showErrorMsg('Error executing command.', err);
        }
    }
  
}
