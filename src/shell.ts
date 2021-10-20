import * as vscode from 'vscode';
import * as childProcess from "child_process";

export const EXT_NAME = 'SeeSharp';
export const seeSharpChannel = vscode.window.createOutputChannel(EXT_NAME);

type Terminal = vscode.Terminal | {
  name: string;
  sendText: (connamd: string) => Promise<void>;
  show: (preserveFocus: boolean) => void
};

export function getWorkspecePathIfAny() {
  return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length
      ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
}

abstract class Shell {
  terminal: Terminal | undefined;
  cwd: string | undefined = undefined;
  isNew: boolean;
  constructor(cwd: string | undefined = undefined) {
      this.cwd = cwd;
      this.terminal = undefined;
      this.isNew = false;
  }

  abstract sendText(commandText: string): Promise<void>;
}

export class NodejsTerminal extends Shell {
  constructor(cwd: string | undefined = undefined) {
      super(cwd || getWorkspecePathIfAny());
  }

  /**
   * @param {string} command A shell command to execute
   * @return {Promise<string>} A promise that resolve to the output of the shell command, or an error
   * @example const output = await execute("ls -alh");
   */
  execute(command: string): Promise<string> {
      const cwd = this.cwd;
      /**
       * @param {Function} resolve A function that resolves the promise
       * @param {Function} reject A function that fails the promise
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
       */
      return new Promise(function(resolve, reject) {
          /**
           * @param {Error} error An error triggered during the execution of the childProcess.exec command
           * @param {string|Buffer} standardOutput The result of the shell command execution
           * @param {string|Buffer} standardError The error resulting of the shell command execution
           * @see https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback
           */
          childProcess.exec(command, { cwd }, function(error, standardOutput, standardError) {
              if (error) {
                  reject();

                  return;
              }

              if (standardError) {
                  reject(standardError);

                  return;
              }

              resolve(standardOutput);
          });
      });
  }

  async sendText(command: string): Promise<void> {
    seeSharpChannel.appendLine(`[INFO] Executing command: '${command}'`);
    await this.execute(command);
  }
}

export class VsCodeTerminal extends Shell {
  constructor(cwd: string | undefined = undefined) {
      super(cwd);
  }

  private async getTerminalFromVsCode(): Promise<vscode.Terminal> {
      let terminal = vscode.window.terminals.find(t => t.name === 'SeeSharp');
      if (terminal) {
          this.isNew = false;
      } else {
          terminal = vscode.window.createTerminal({
              name: 'SeeSharp',
              cwd: this.cwd
          });
          this.isNew = true;
      }
      terminal.show(true);
      return terminal;
  }

  async sendText(commandText: string): Promise<void> {
      if (!this.terminal) {
          this.terminal = await this.getTerminalFromVsCode();
          if (!this.isNew) {
              const cd = this.cwd || getWorkspecePathIfAny();
              if (cd) {
                  this.terminal.sendText(`cd "${cd}"`);
              }
          }
      }

      seeSharpChannel.appendLine(`[INFO] Executing command: '${commandText}'`);
      this.terminal.sendText(commandText);
      return Promise.resolve();
  }
}
