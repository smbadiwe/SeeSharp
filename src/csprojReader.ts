import Nameable from './nameable';
import * as xml2js from 'xml2js';

type Item = {
    Include: string;
    Version: string | undefined;
}

type Ref = {
    $: Item;
}

type ItemGroup = {
    PackageReference: Ref[] | undefined;
    ProjectReference: Ref[] | undefined;
};

type PropertyGroup = {
    OutputType: string[] | undefined;
    TargetFramework: string[] | undefined;
    RootNamespace: string[] | undefined;
};

type Project = {
    $: Object;
    ItemGroup: ItemGroup[];
    PropertyGroup: PropertyGroup[];
};

type CsProject = {
    Project: Project;
};

export default class CsprojReader implements Nameable {
    private readonly xml: string;
    private readonly xmlParser: xml2js.Parser;
    private parsedObject: CsProject | undefined;

    /**
     * Initializes a new instance for a .csproj
     * file.
     *
     * @param fileContent - The .csproj file full content
     */
    constructor(fileContent: string) {
        this.xml = fileContent;
        this.xmlParser = new xml2js.Parser();
        this.parsedObject = undefined;
    }

    private async getParsedObject(): Promise<CsProject | undefined> {
        if (!this.parsedObject) {
            this.parsedObject = (await this.xmlParser.parseStringPromise(this.xml)) as CsProject;
        }

        return this.parsedObject;
    }

    private async getItemGroups(): Promise<ItemGroup[]> {
        const result = await this.getParsedObject();
        if (result && result.Project) {
            return result.Project.ItemGroup || [];
        }

        return [];
    }

    public async getPackageRefs(): Promise<Item[]> {
        const itemGroups = await this.getItemGroups();
        if (!itemGroups || itemGroups.length === 0) {
            return [];
        }
        
        const result = itemGroups
            .filter(i => i.PackageReference && i.PackageReference.length > 0)
            .map(i => i.PackageReference)
            .reduce((acc, val) => (!(acc && val)) ? [] : acc.concat(val), []);
        
        return (result || []).map(r => r.$);
    }

    public async getProjectRefs(): Promise<Item[]> {
        const itemGroups = await this.getItemGroups();
        if (itemGroups.length === 0) {
            return [];
        }
        
        const result = itemGroups
            .filter(i => i.ProjectReference && i.ProjectReference.length > 0)
            .map(i => i.ProjectReference)
            .reduce((acc, val) => (!(acc && val)) ? [] : acc.concat(val), []);
        
        return (result || []).map(r => r.$);
    }

    public async getRootNamespace(): Promise<string | undefined> {
        try {
            const result = await this.getParsedObject();

            if (!(result && result.Project 
                && result.Project.PropertyGroup 
                && result.Project.PropertyGroup.length)) {
                return undefined;
            }

            let foundNamespace = undefined;

            for (const propertyGroup of result.Project.PropertyGroup) {
                if (propertyGroup.RootNamespace) {
                    foundNamespace = propertyGroup.RootNamespace[0];
                    break;
                }
            }

            return foundNamespace;
        } catch (errParsingXml) {
            console.error('Error parsing project xml', errParsingXml);
        }

        return undefined;
    }
}
