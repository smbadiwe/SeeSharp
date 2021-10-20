import * as vscode from 'vscode';
import CodeActionProvider from './codeActionProvider';
import { ShellRuns, Templating } from './commands';

const newProjectCommands = {
    // <command>: [<project type>, <comand prefix>]
    'seesharp.createClassLibrary': ['Class Library', 'dotnet new classlib -o'],
    'seesharp.createConsoleApp': ['Console Application', 'dotnet new console -o'],
    'seesharp.createWebApi': ['ASP.NET Core Web API', 'dotnet new webapi -o'],
    'seesharp.createXUnit': ['xUnit Test Project', 'dotnet new xunit -o'],
};

const templateArgs = {
    // <command>: <file type>
    'seesharp.createClass': 'Class',
    'seesharp.createInterface': 'Interface',
    'seesharp.createEnum': 'Enum',
    'seesharp.createController': 'Controller',
    'seesharp.createApiController': 'ApiController',
};

const compileCommands = {
    // <command>: [<task>, configuration>]
    'seesharp.buildDebug': ['build', 'Debug'],
    'seesharp.buildRelease': ['build', 'Release'],
    'seesharp.buildSolutionDebug': ['build', 'Debug'],
    'seesharp.buildSolutionRelease': ['build', 'Release'],
    'seesharp.cleanDebug': ['clean', 'Debug'],
    'seesharp.cleanRelease': ['clean', 'Release'],
    'seesharp.cleanSolutionDebug': ['clean', 'Debug'],
    'seesharp.cleanSolutionRelease': ['clean', 'Release']
};


export function activate(context: vscode.ExtensionContext): void {
    const documentSelector: vscode.DocumentSelector = {
        language: 'csharp',
        scheme: 'file'
    };
    const shellRuns = new ShellRuns();

    context.subscriptions.push(vscode.commands.registerCommand('seesharp.createSolution',
        async () => await shellRuns.createNewFile('Solution File', 'dotnet new sln -n')));
    context.subscriptions.push(vscode.commands.registerCommand('seesharp.addProjectReference',
        async (args: any) => await shellRuns.addProjectReference(args)));
    context.subscriptions.push(vscode.commands.registerCommand('seesharp.removeProjectReference',
        async (args: any) => await shellRuns.removeProjectReference(args)));
    context.subscriptions.push(vscode.commands.registerCommand('seesharp.addNugetPackage',
        async (args: any) => await shellRuns.addNugetPackage(args)));
    context.subscriptions.push(vscode.commands.registerCommand('seesharp.removeNugetPackage',
        async (args: any) => await shellRuns.removeNugetPackage(args)));

    for (const [command, [projectName, commandPrefix]] of Object.entries(newProjectCommands)) {
        context.subscriptions.push(vscode.commands.registerCommand(command,
            async () => await shellRuns.createNewProject(projectName, commandPrefix)));
    }

    for (const [command, [task, configuration]] of Object.entries(compileCommands)) {
        context.subscriptions.push(vscode.commands.registerCommand(command,
            async (args: any) => await shellRuns.compile(args, task, configuration)));
    }

    const temlating = new Templating();
    for (const [command, fileType] of Object.entries(templateArgs)) {
        context.subscriptions.push(vscode.commands.registerCommand(command,
            async (args: any) => await temlating.createCodeFileFromTemplate(args, fileType)));
    }
    
    const codeActionProvider = new CodeActionProvider();
    const disposable = vscode.languages.registerCodeActionsProvider(documentSelector, codeActionProvider);

    context.subscriptions.push(disposable);
    
    vscode.window.onDidCloseTerminal(async (e) => {
        console.log(`Terminal ${e.name}/${(await e.processId)} quitting. Status: ${e.exitStatus?.code}`);
    });
}

export function deactivate(): void { 
    const extensionTerminals = vscode.window.terminals?.filter(t => t.name === 'SeeSharp');
    if (extensionTerminals) {
        for (let i = 0; i < extensionTerminals.length; i++) {
            extensionTerminals[i].dispose();
        }
    }
}
