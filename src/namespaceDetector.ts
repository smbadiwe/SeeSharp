import { Uri, workspace } from 'vscode';
import * as path from 'path';
import CsprojReader from './csprojReader';
import ProjectJsonReader from './projectJsonReader';
import * as findupglob from 'find-up-glob';

export async function findUp(pattern: string, options: Object) {
    const files = await findupglob(pattern, options);
    if (files && files.length > 0) {
        return files[0];
    }

    return null;
}

export default class NamespaceDetector {
    private readonly filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    public async getNamespace(): Promise<string> {
        let fullNamespace = await this.fromCsproj();
        if (fullNamespace !== undefined) {
            return fullNamespace;
        }

        fullNamespace = await this.fromProjectJson();
        if (fullNamespace !== undefined) {
            return fullNamespace;
        }

        return await this.fromFilepath();
    }
    
    private async fromCsproj(): Promise<string | undefined> {
        const csprojFile = await findUp('*.csproj', { cwd: path.dirname(this.filePath) });

        if (!csprojFile) {
            return undefined;
        }

        const fileContent = await this.read(Uri.file(csprojFile));
        const projectReader = new CsprojReader(fileContent);
        const rootNamespace = await projectReader.getRootNamespace();

        if (rootNamespace === undefined) {
            return undefined;
        }

        return this.calculateFullNamespace(rootNamespace, path.dirname(csprojFile));
    }

    private async fromProjectJson(): Promise<string | undefined> {
        const projectJsonFile = await findUp('project.json', { cwd: path.dirname(this.filePath) });

        if (!projectJsonFile) {
            return undefined;
        }

        const projectJsonDir = path.dirname(projectJsonFile);
        const fileContent = await this.read(Uri.file(projectJsonFile));
        const projectReader = new ProjectJsonReader(fileContent);
        const rootNamespace = await projectReader.getRootNamespace();

        if (rootNamespace === undefined) {
            return undefined;
        }

        return this.calculateFullNamespace(rootNamespace, projectJsonDir);
    }
    
    private async getRootPath(): Promise<string> {
        const csproj = await findUp('*.csproj', { cwd: path.dirname(this.filePath) });

        if (csproj) {
            const csprojSplit = csproj.split(path.sep);

            return csprojSplit.slice(0, csprojSplit.length - 2).join(path.sep);
        }

        const jsonFile = await findUp('project.json', { cwd: path.dirname(this.filePath) });

        if (jsonFile) {
            const jsonSplit = jsonFile.split(path.sep);

            return jsonSplit.slice(0, jsonSplit.length - 2).join(path.sep);
        }

        return workspace.workspaceFolders && workspace.workspaceFolders.length ? workspace.workspaceFolders[0].uri.fsPath : '';
    }

    private async fromFilepath(): Promise<string> {
        const rootPath = await this.getRootPath();
        const namespaceWithLeadingDot = this.calculateFullNamespace('', rootPath);

        return namespaceWithLeadingDot.slice(1);
    }

    private async read(file: Uri): Promise<string> {
        const document = await workspace.openTextDocument(file);
        
        return document.getText();
    }

    private calculateFullNamespace(rootNamespace: string, rootDirectory: string): string {
        const filePathSegments: string[] = path.dirname(this.filePath).split(path.sep);
        const rootDirSegments: string[] = rootDirectory.split(path.sep);
        let fullNamespace = rootNamespace;
        for (let index = rootDirSegments.length; index < filePathSegments.length; index++) {
            fullNamespace += '.' + filePathSegments[index];
        }
        
        return fullNamespace;
    }
}
