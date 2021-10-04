import * as vscode from 'vscode';
import * as path from 'path';
import { EOL } from 'os';
import { promises as fs } from 'fs';
import CodeActionProvider from './codeActionProvider';
import NamespaceDetector from './namespaceDetector';

const classnameRegex = new RegExp(/\${classname}/, 'g');
const namespaceRegex = new RegExp(/\${namespace}/, 'g');
const knownExtensionNames = [
    'kreativ-software.csharpextensions',
    'jsw.csharpextensions'
];

export function activate(context: vscode.ExtensionContext): void {
    const documentSelector: vscode.DocumentSelector = {
        language: 'csharp',
        scheme: 'file'
    };

    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createClass',
        async (args: any) => await promptAndSave(args, 'class')));
    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createInterface',
        async (args: any) => await promptAndSave(args, 'interface')));
    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createEnum',
        async (args: any) => await promptAndSave(args, 'enum')));
    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createController',
        async (args: any) => await promptAndSave(args, 'controller')));
    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createApiController',
        async (args: any) => await promptAndSave(args, 'apicontroller')));
    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createPage',
        async (args: any) => await promptAndSave(args, 'page')));
    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createUserControl',
        async (args: any) => await promptAndSave(args, 'usercontrol')));
    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createResourceFile',
        async (args: any) => await promptAndSave(args, 'apicontroller')));

    const codeActionProvider = new CodeActionProvider();
    const disposable = vscode.languages.registerCodeActionsProvider(documentSelector, codeActionProvider);

    context.subscriptions.push(disposable);
}

async function promptAndSave(args: any, templatetype: string) {
    if (!args) {
        args = {
            _fsPath: vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length
                ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined
        };
    }

    const incomingpath: string = args._fsPath || args.fsPath || args.path;

    try {
        const newfilename = await vscode.window.showInputBox({ ignoreFocusOut: true, prompt: 'Please enter filename', value: 'new' + templatetype + '.cs' });

        if (typeof newfilename === 'undefined' || newfilename === '') return;

        let newfilepath = incomingpath + path.sep + newfilename;

        newfilepath = correctExtension(newfilepath);

        try {
            await fs.access(newfilepath);

            vscode.window.showErrorMessage(`File already exists: ${EOL}${newfilepath}`);

            return;
        } catch { }

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
        if (filename.endsWith('.')) filename = filename + 'cs';
        else filename = filename + '.cs';
    }

    return filename;
}

function findCurrentExtension(): vscode.Extension<any> | undefined {
    for (let i = 0; i < knownExtensionNames.length; i++) {
        const extension = vscode.extensions.getExtension(knownExtensionNames[i]);

        if (extension) return extension;
    }

    return undefined;
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
        const doc = await fs.readFile(templateFilePath, 'utf-8');
        const includeNamespaces = vscode.workspace.getConfiguration().get('csharpextensions.includeNamespaces', true);
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

        let text = doc
            .replace(namespaceRegex, namespace)
            .replace(classnameRegex, filename)
            .replace('${namespaces}', namespaces);

        const cursorPosition = findCursorInTemplate(text);

        text = text.replace('${cursor}', '');

        await fs.writeFile(originalfilepath, text);

        const openedDoc = await vscode.workspace.openTextDocument(originalfilepath);
        const editor = await vscode.window.showTextDocument(openedDoc);

        if (cursorPosition) {
            const newselection = new vscode.Selection(cursorPosition, cursorPosition);

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

export function deactivate(): void { /* Nothing to do here */ }
