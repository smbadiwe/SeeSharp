// See https://github.com/microsoft/vscode/blob/bd7746b82be92350c3ca9c91fefaad0252abf760/src/vs/workbench/contrib/debug/node/terminals.ts#L79-L198
const enum ShellType { cmd, powershell, bash }

export function prepareCommand(
    shell: string, 
    args: string[], 
    cwd?: string, 
    env?: { [key: string]: string | null; }
): string { 
    shell = shell.trim().toLowerCase(); 
 
    // try to determine the shell type 
    let shellType; 
    if (shell.indexOf('powershell') >= 0 || shell.indexOf('pwsh') >= 0) { 
        shellType = ShellType.powershell; 
    } else if (shell.indexOf('cmd.exe') >= 0) { 
        shellType = ShellType.cmd; 
    } else if (shell.indexOf('bash') >= 0) { 
        shellType = ShellType.bash; 
    } else if (process.platform === 'win32') { 
        shellType = ShellType.cmd; // pick a good default for Windows 
    } else { 
        shellType = ShellType.bash;	// pick a good default for anything else 
    } 
 
    let quote: (s: string) => string; 
    // begin command with a space to avoid polluting shell history 
    let command = ' '; 
 
    switch (shellType) { 
 
    case ShellType.powershell: 
 
        quote = (s: string) => { 
            s = s.replace(/\'/g, '\'\''); 
            if (s.length > 0 && s.charAt(s.length - 1) === '\\') { 
                return `'${s}\\'`; 
            } 
            
            return `'${s}'`; 
        }; 
 
        if (cwd) { 
            command += `cd '${cwd}'; `; 
        } 
        if (env) { 
            for (const key in env) { 
                const value = env[key]; 
                if (value === null) { 
                    command += `Remove-Item env:${key}; `; 
                } else { 
                    command += `\${env:${key}}='${value}'; `; 
                } 
            } 
        } 
        if (args.length > 0) { 
            const cmd = quote(args.shift()!); 
            command += (cmd[0] === '\'') ? `& ${cmd} ` : `${cmd} `; 
            for (const a of args) { 
                command += `${quote(a)} `; 
            } 
        } 
        break; 
 
    case ShellType.cmd: 
 
        quote = (s: string) => { 
            s = s.replace(/\"/g, '""'); 
            
            return (s.indexOf(' ') >= 0 || s.indexOf('"') >= 0 || s.length === 0) ? `"${s}"` : s; 
        }; 
 
        if (cwd) { 
            command += `cd ${quote(cwd)} && `; 
        } 
        if (env) { 
            command += 'cmd /C "'; 
            for (const key in env) { 
                let value = env[key]; 
                if (value === null) { 
                    command += `set "${key}=" && `; 
                } else { 
                    value = value.replace(/[\^\&\|\<\>]/g, s => `^${s}`); 
                    command += `set "${key}=${value}" && `; 
                } 
            } 
        } 
        for (const a of args) { 
            command += `${quote(a)} `; 
        } 
        if (env) { 
            command += '"'; 
        } 
        break; 
 
    case ShellType.bash: 
 
        quote = (s: string) => { 
            s = s.replace(/(["'\\\$])/g, '\\$1'); 
            
            return (s.indexOf(' ') >= 0 || s.indexOf(';') >= 0 || s.length === 0) ? `"${s}"` : s; 
        }; 
 
        const hardQuote = (s: string) => { 
            return /[^\w@%\/+=,.:^-]/.test(s) ? `'${s.replace(/'/g, '\'\\\'\'')}'` : s; 
        }; 
 
        if (cwd) { 
            command += `cd ${quote(cwd)} ; `; 
        } 
        if (env) { 
            command += '/usr/bin/env'; 
            for (const key in env) { 
                const value = env[key]; 
                if (value === null) { 
                    command += ` -u ${hardQuote(key)}`; 
                } else { 
                    command += ` ${hardQuote(`${key}=${value}`)}`; 
                } 
            } 
            command += ' '; 
        } 
        for (const a of args) { 
            command += `${quote(a)} `; 
        } 
        break; 
    } 
 
    return command; 
} 