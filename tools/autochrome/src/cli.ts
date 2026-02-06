#!/usr/bin/env node
/**
 * Autochrome CLI - Interactive browser automation for wallet testing
 *
 * Usage:
 *   npx tsx tools/autochrome/src/cli.ts
 *   npm run dev -- interactive
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserSession, SessionManager, SessionConfig, WalletExtension } from './browser.js';

const program = new Command();

// Supported wallet extensions
const WALLET_EXTENSIONS: Record<string, { name: string; chromeId: string; downloadUrl?: string }> = {
  xverse: {
    name: 'Xverse Wallet',
    chromeId: 'idnnbdplmphpflfnlkomgpfbpcgelopg',
    downloadUrl: 'https://chrome.google.com/webstore/detail/xverse-wallet/idnnbdplmphpflfnlkomgpfbpcgelopg',
  },
  leather: {
    name: 'Leather (Hiro)',
    chromeId: 'ldinpeekobnhjjdofggfgjlcehhmanlj',
    downloadUrl: 'https://chrome.google.com/webstore/detail/leather/ldinpeekobnhjjdofggfgjlcehhmanlj',
  },
  oyl: {
    name: 'OYL Wallet',
    chromeId: 'ilbckileiejlnlaogdddoindpaoknhic',
    downloadUrl: 'https://chrome.google.com/webstore/detail/oyl-wallet/ilbckileiejlnlaogdddoindpaoknhic',
  },
  unisat: {
    name: 'UniSat Wallet',
    chromeId: 'ppbibelpcjmhbdihakflkdcoccbgbkpo',
    downloadUrl: 'https://chrome.google.com/webstore/detail/unisat-wallet/ppbibelpcjmhbdihakflkdcoccbgbkpo',
  },
  magiceden: {
    name: 'Magic Eden',
    chromeId: 'mkpegjkblkkefacfnmkajcjmabijhclg',
    downloadUrl: 'https://chrome.google.com/webstore/detail/magic-eden-wallet/mkpegjkblkkefacfnmkajcjmabijhclg',
  },
  phantom: {
    name: 'Phantom',
    chromeId: 'bfnaelmomeimhlpmgjnjophhpkkoljpa',
    downloadUrl: 'https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa',
  },
  okx: {
    name: 'OKX Wallet',
    chromeId: 'mcohilncbfahbmgdjkbpemcciiolgcge',
    downloadUrl: 'https://chrome.google.com/webstore/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge',
  },
};

interface InteractiveState {
  session: BrowserSession | null;
  sessionManager: SessionManager;
  currentUrl: string;
  recording: boolean;
  recordedActions: Array<{ action: string; args: any; timestamp: Date }>;
  extensionsDir: string;
}

const state: InteractiveState = {
  session: null,
  sessionManager: new SessionManager(),
  currentUrl: '',
  recording: false,
  recordedActions: [],
  extensionsDir: path.join(process.env.HOME || '', '.autochrome', 'extensions'),
};

/**
 * Print welcome banner
 */
function printBanner(): void {
  console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════════╗
║                       🌐 AUTOCHROME                           ║
║         Interactive Browser Automation for Wallet Testing      ║
╚═══════════════════════════════════════════════════════════════╝
`));
}

/**
 * Print available commands
 */
function printHelp(): void {
  console.log(chalk.yellow('\nAvailable commands:\n'));

  console.log(chalk.green('Session Management:'));
  console.log('  start [wallet]    - Start browser session (optionally with wallet extension)');
  console.log('  stop              - Close current session');
  console.log('  status            - Show session status');
  console.log();

  console.log(chalk.green('Navigation:'));
  console.log('  go <url>          - Navigate to URL');
  console.log('  back              - Go back');
  console.log('  forward           - Go forward');
  console.log('  refresh           - Refresh page');
  console.log();

  console.log(chalk.green('Interaction:'));
  console.log('  click <selector>  - Click element');
  console.log('  type <sel> <text> - Type text into element');
  console.log('  press <key>       - Press keyboard key');
  console.log('  wait <selector>   - Wait for element');
  console.log('  waitnav           - Wait for navigation');
  console.log();

  console.log(chalk.green('Inspection:'));
  console.log('  html              - Get page HTML');
  console.log('  text              - Get page text');
  console.log('  query <selector>  - Query elements');
  console.log('  screenshot [file] - Take screenshot');
  console.log('  console           - Show console messages');
  console.log('  cookies           - Show cookies');
  console.log('  storage           - Show localStorage');
  console.log('  exec <js>         - Execute JavaScript');
  console.log();

  console.log(chalk.green('Network:'));
  console.log('  capture start     - Start network capture');
  console.log('  capture stop      - Stop network capture');
  console.log('  har [file]        - Export HAR file');
  console.log();

  console.log(chalk.green('Recording:'));
  console.log('  record start      - Start recording actions');
  console.log('  record stop       - Stop recording');
  console.log('  record show       - Show recorded actions');
  console.log('  record export [f] - Export as test script');
  console.log();

  console.log(chalk.green('Wallet Testing:'));
  console.log('  wallets           - List supported wallets');
  console.log('  connect <wallet>  - Connect wallet to current page');
  console.log();

  console.log(chalk.green('Other:'));
  console.log('  help              - Show this help');
  console.log('  clear             - Clear console');
  console.log('  exit              - Exit autochrome');
  console.log();
}

/**
 * Record an action if recording is enabled
 */
function recordAction(action: string, args: any): void {
  if (state.recording) {
    state.recordedActions.push({
      action,
      args,
      timestamp: new Date(),
    });
  }
}

/**
 * Export recorded actions as a test script
 */
function exportRecording(filename?: string): string {
  const script = `/**
 * Autochrome Recorded Test Script
 * Generated: ${new Date().toISOString()}
 */

import { BrowserSession } from '@subfrost/autochrome';

async function runTest() {
  const session = new BrowserSession({ headless: false });
  await session.launch();

  try {
${state.recordedActions.map(a => {
  switch (a.action) {
    case 'navigate':
      return `    await session.navigate('${a.args.url}');`;
    case 'click':
      return `    await session.click('${a.args.selector}');`;
    case 'type':
      return `    await session.type('${a.args.selector}', '${a.args.text}');`;
    case 'press':
      return `    await session.press('${a.args.key}');`;
    case 'wait':
      return `    await session.waitForSelector('${a.args.selector}');`;
    case 'waitnav':
      return `    await session.waitForNavigation();`;
    default:
      return `    // Unknown action: ${a.action}`;
  }
}).join('\n')}

    console.log('Test completed successfully!');
  } finally {
    await session.close();
  }
}

runTest().catch(console.error);
`;

  if (filename) {
    fs.writeFileSync(filename, script);
    console.log(chalk.green(`Exported to ${filename}`));
  }

  return script;
}

/**
 * Process a command
 */
async function processCommand(input: string): Promise<void> {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  if (!cmd) return;

  const spinner = ora();

  try {
    switch (cmd) {
      case 'help':
      case '?':
        printHelp();
        break;

      case 'clear':
        console.clear();
        printBanner();
        break;

      case 'exit':
      case 'quit':
      case 'q':
        if (state.session) {
          spinner.start('Closing session...');
          await state.session.close();
          spinner.succeed('Session closed');
        }
        console.log(chalk.cyan('\nGoodbye! 👋\n'));
        process.exit(0);
        break;

      case 'wallets':
        console.log(chalk.yellow('\nSupported Wallet Extensions:\n'));
        for (const [id, info] of Object.entries(WALLET_EXTENSIONS)) {
          console.log(`  ${chalk.green(id.padEnd(12))} - ${info.name}`);
          console.log(`                 Chrome ID: ${info.chromeId}`);
        }
        console.log();
        break;

      case 'start': {
        if (state.session) {
          console.log(chalk.yellow('Session already running. Use "stop" first.'));
          break;
        }

        const walletId = args[0];
        const config: SessionConfig = {
          headless: false,
          devtools: false,
        };

        if (walletId && WALLET_EXTENSIONS[walletId]) {
          const walletInfo = WALLET_EXTENSIONS[walletId];
          const extensionPath = path.join(state.extensionsDir, walletId);

          if (fs.existsSync(extensionPath)) {
            config.extensions = [{
              id: walletId,
              name: walletInfo.name,
              path: extensionPath,
            }];
            spinner.start(`Starting session with ${walletInfo.name}...`);
          } else {
            console.log(chalk.yellow(`\nWallet extension not found at: ${extensionPath}`));
            console.log(chalk.cyan(`\nTo add the extension:`));
            console.log(`1. Download from: ${walletInfo.downloadUrl}`);
            console.log(`2. Extract to: ${extensionPath}`);
            console.log(`3. Run 'start ${walletId}' again\n`);

            const { proceed } = await inquirer.prompt([{
              type: 'confirm',
              name: 'proceed',
              message: 'Start browser without extension?',
              default: true,
            }]);

            if (!proceed) break;
            spinner.start('Starting session without extension...');
          }
        } else if (walletId) {
          console.log(chalk.red(`Unknown wallet: ${walletId}`));
          console.log('Use "wallets" to see supported wallets.');
          break;
        } else {
          spinner.start('Starting browser session...');
        }

        const session = new BrowserSession(config);
        await session.launch();
        state.session = session;
        spinner.succeed('Browser session started');

        // Navigate to subfrost staging app by default
        const defaultUrl = 'https://staging-app.subfrost.io';
        console.log(chalk.gray(`Navigating to ${defaultUrl}...`));
        await session.navigate(defaultUrl);
        state.currentUrl = defaultUrl;
        console.log(chalk.green(`Ready! Current URL: ${state.currentUrl}`));
        break;
      }

      case 'stop':
        if (!state.session) {
          console.log(chalk.yellow('No session running.'));
          break;
        }
        spinner.start('Closing session...');
        await state.session.close();
        state.session = null;
        state.currentUrl = '';
        spinner.succeed('Session closed');
        break;

      case 'status':
        if (state.session) {
          console.log(chalk.green('Session: ') + 'Active');
          console.log(chalk.green('URL: ') + state.currentUrl);
          console.log(chalk.green('Recording: ') + (state.recording ? 'Yes' : 'No'));
          if (state.recording) {
            console.log(chalk.green('Actions recorded: ') + state.recordedActions.length);
          }
        } else {
          console.log(chalk.yellow('No session running.'));
        }
        break;

      case 'go':
      case 'navigate': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        let url = args.join(' ');
        if (!url) {
          console.log(chalk.red('Usage: go <url>'));
          break;
        }
        if (!url.startsWith('http')) {
          url = 'https://' + url;
        }
        spinner.start(`Navigating to ${url}...`);
        const result = await state.session.navigate(url);
        state.currentUrl = result.url;
        recordAction('navigate', { url });
        spinner.succeed(`Loaded: ${result.title}`);
        break;
      }

      case 'back':
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        await state.session.getPage()?.goBack();
        state.currentUrl = state.session.getPage()?.url() || '';
        console.log(chalk.green('Navigated back'));
        break;

      case 'forward':
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        await state.session.getPage()?.goForward();
        state.currentUrl = state.session.getPage()?.url() || '';
        console.log(chalk.green('Navigated forward'));
        break;

      case 'refresh':
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        spinner.start('Refreshing...');
        await state.session.getPage()?.reload({ waitUntil: 'networkidle2' });
        spinner.succeed('Page refreshed');
        break;

      case 'click': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        const selector = args.join(' ');
        if (!selector) {
          console.log(chalk.red('Usage: click <selector>'));
          break;
        }
        spinner.start(`Clicking ${selector}...`);
        await state.session.click(selector);
        recordAction('click', { selector });
        spinner.succeed('Clicked');
        break;
      }

      case 'type': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        if (args.length < 2) {
          console.log(chalk.red('Usage: type <selector> <text>'));
          break;
        }
        const selector = args[0];
        const text = args.slice(1).join(' ');
        spinner.start(`Typing into ${selector}...`);
        await state.session.type(selector, text);
        recordAction('type', { selector, text });
        spinner.succeed('Typed');
        break;
      }

      case 'press': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        const key = args[0];
        if (!key) {
          console.log(chalk.red('Usage: press <key>'));
          break;
        }
        await state.session.press(key);
        recordAction('press', { key });
        console.log(chalk.green(`Pressed ${key}`));
        break;
      }

      case 'wait': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        const selector = args.join(' ');
        if (!selector) {
          console.log(chalk.red('Usage: wait <selector>'));
          break;
        }
        spinner.start(`Waiting for ${selector}...`);
        await state.session.waitForSelector(selector);
        recordAction('wait', { selector });
        spinner.succeed('Element found');
        break;
      }

      case 'waitnav':
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        spinner.start('Waiting for navigation...');
        await state.session.waitForNavigation();
        state.currentUrl = state.session.getPage()?.url() || '';
        recordAction('waitnav', {});
        spinner.succeed('Navigation complete');
        break;

      case 'html': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        const html = await state.session.getHtml();
        console.log(html.substring(0, 5000));
        if (html.length > 5000) {
          console.log(chalk.gray(`\n... (${html.length - 5000} more characters)`));
        }
        break;
      }

      case 'text': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        const text = await state.session.getText();
        console.log(text.substring(0, 3000));
        if (text.length > 3000) {
          console.log(chalk.gray(`\n... (${text.length - 3000} more characters)`));
        }
        break;
      }

      case 'query': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        const selector = args.join(' ');
        if (!selector) {
          console.log(chalk.red('Usage: query <selector>'));
          break;
        }
        const elements = await state.session.query(selector, { all: true, includeText: true });
        console.log(chalk.green(`Found ${elements.length} elements:\n`));
        elements.forEach((el, i) => {
          console.log(chalk.cyan(`[${i}] `) + `<${el.tagName}>`);
          if (el.id) console.log(`    id: ${el.id}`);
          if (el.className) console.log(`    class: ${el.className}`);
          if (el.text) console.log(`    text: ${el.text.substring(0, 100)}`);
          if (el.href) console.log(`    href: ${el.href}`);
          console.log();
        });
        break;
      }

      case 'screenshot': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        const filename = args[0] || `screenshot-${Date.now()}.png`;
        spinner.start('Taking screenshot...');
        await state.session.screenshot({ path: filename, fullPage: false });
        spinner.succeed(`Screenshot saved to ${filename}`);
        break;
      }

      case 'console': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        const messages = state.session.getConsoleMessages();
        if (messages.length === 0) {
          console.log(chalk.gray('No console messages captured.'));
        } else {
          console.log(chalk.yellow(`\nConsole Messages (${messages.length}):\n`));
          messages.slice(-50).forEach(m => {
            const color = m.type === 'error' ? chalk.red :
                         m.type === 'warning' ? chalk.yellow :
                         chalk.gray;
            console.log(color(`[${m.type}] ${m.text}`));
          });
        }
        break;
      }

      case 'cookies': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        const cookies = await state.session.getCookies();
        console.log(chalk.yellow(`\nCookies (${cookies.length}):\n`));
        cookies.forEach(c => {
          console.log(`  ${chalk.green(c.name)}: ${c.value.substring(0, 50)}${c.value.length > 50 ? '...' : ''}`);
        });
        break;
      }

      case 'storage': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        const storage = await state.session.getLocalStorage();
        const keys = Object.keys(storage);
        console.log(chalk.yellow(`\nLocalStorage (${keys.length} items):\n`));
        keys.forEach(k => {
          const v = storage[k];
          console.log(`  ${chalk.green(k)}: ${v.substring(0, 80)}${v.length > 80 ? '...' : ''}`);
        });
        break;
      }

      case 'exec': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        const script = args.join(' ');
        if (!script) {
          console.log(chalk.red('Usage: exec <javascript>'));
          break;
        }
        const result = await state.session.execute(script);
        console.log(chalk.green('Result:'), result);
        break;
      }

      case 'capture': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        const subCmd = args[0];
        if (subCmd === 'start') {
          spinner.start('Starting network capture...');
          await state.session.startNetworkCapture();
          spinner.succeed('Network capture started');
        } else if (subCmd === 'stop') {
          await state.session.stopNetworkCapture();
          console.log(chalk.green('Network capture stopped'));
        } else {
          console.log(chalk.red('Usage: capture start|stop'));
        }
        break;
      }

      case 'har': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        const har = state.session.getHar();
        const filename = args[0] || `network-${Date.now()}.har`;
        fs.writeFileSync(filename, JSON.stringify(har, null, 2));
        console.log(chalk.green(`HAR exported to ${filename} (${har.entries.length} entries)`));
        break;
      }

      case 'record': {
        const subCmd = args[0];
        if (subCmd === 'start') {
          state.recording = true;
          state.recordedActions = [];
          console.log(chalk.green('Recording started'));
        } else if (subCmd === 'stop') {
          state.recording = false;
          console.log(chalk.green(`Recording stopped (${state.recordedActions.length} actions)`));
        } else if (subCmd === 'show') {
          console.log(chalk.yellow(`\nRecorded Actions (${state.recordedActions.length}):\n`));
          state.recordedActions.forEach((a, i) => {
            console.log(`  ${i + 1}. ${chalk.green(a.action)} ${JSON.stringify(a.args)}`);
          });
        } else if (subCmd === 'export') {
          const filename = args[1] || `recorded-test-${Date.now()}.ts`;
          const script = exportRecording(filename);
          if (!args[1]) {
            console.log(chalk.yellow('\nGenerated script:\n'));
            console.log(script);
          }
        } else {
          console.log(chalk.red('Usage: record start|stop|show|export [filename]'));
        }
        break;
      }

      case 'connect': {
        if (!state.session) {
          console.log(chalk.yellow('No session. Use "start" first.'));
          break;
        }
        const walletId = args[0];
        if (!walletId) {
          console.log(chalk.red('Usage: connect <wallet>'));
          console.log('Available: ' + Object.keys(WALLET_EXTENSIONS).join(', '));
          break;
        }
        console.log(chalk.yellow(`\nTo connect ${walletId} wallet:`));
        console.log('1. Click "Connect Wallet" on the page');
        console.log(`2. Select ${WALLET_EXTENSIONS[walletId]?.name || walletId}`);
        console.log('3. Approve the connection in the wallet popup');
        console.log('\nUse interactive commands (click, type, etc.) to perform these actions.\n');
        break;
      }

      default:
        console.log(chalk.red(`Unknown command: ${cmd}`));
        console.log('Type "help" for available commands.');
    }
  } catch (error: any) {
    spinner.fail('Error');
    console.log(chalk.red(`Error: ${error.message}`));
  }
}

/**
 * Interactive REPL
 */
async function runInteractive(): Promise<void> {
  printBanner();
  console.log(chalk.gray('Type "help" for available commands, "exit" to quit.\n'));

  // Ensure extensions directory exists
  if (!fs.existsSync(state.extensionsDir)) {
    fs.mkdirSync(state.extensionsDir, { recursive: true });
    console.log(chalk.gray(`Created extensions directory: ${state.extensionsDir}\n`));
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): void => {
    const prefix = state.session ? chalk.green('●') : chalk.gray('○');
    rl.question(`${prefix} autochrome> `, async (input) => {
      await processCommand(input);
      prompt();
    });
  };

  prompt();
}

// CLI setup
program
  .name('autochrome')
  .description('Interactive browser automation for wallet testing')
  .version('0.1.0');

program
  .command('interactive')
  .alias('i')
  .description('Start interactive REPL')
  .action(runInteractive);

program
  .command('run <script>')
  .description('Run a recorded test script')
  .action(async (script: string) => {
    console.log(chalk.yellow(`Running script: ${script}`));
    // TODO: Implement script runner
  });

program
  .command('wallets')
  .description('List supported wallet extensions')
  .action(() => {
    console.log(chalk.yellow('\nSupported Wallet Extensions:\n'));
    for (const [id, info] of Object.entries(WALLET_EXTENSIONS)) {
      console.log(`  ${chalk.green(id.padEnd(12))} - ${info.name}`);
      console.log(`                 Chrome ID: ${info.chromeId}`);
      if (info.downloadUrl) {
        console.log(`                 ${chalk.gray(info.downloadUrl)}`);
      }
      console.log();
    }
  });

// Default to interactive mode if no command specified
if (process.argv.length <= 2) {
  runInteractive();
} else {
  program.parse();
}
