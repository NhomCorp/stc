const globals = require('globals');

// Google Apps Script runtime globals. The `globals` npm package does not ship a
// GAS environment, so the built-in services this project uses are declared here.
const gasGlobals = {
  SpreadsheetApp: 'readonly',
  PropertiesService: 'readonly',
  CacheService: 'readonly',
  UrlFetchApp: 'readonly',
  GmailApp: 'readonly',
  MailApp: 'readonly',
  HtmlService: 'readonly',
  ContentService: 'readonly',
  ScriptApp: 'readonly',
  Utilities: 'readonly',
  Logger: 'readonly',
  console: 'readonly',
  LockService: 'readonly',
  DriveApp: 'readonly',
  Session: 'readonly',
  Browser: 'readonly',
  CalendarApp: 'readonly',
  DocumentApp: 'readonly',
  FormApp: 'readonly',
  SlidesApp: 'readonly',
  Charts: 'readonly',
  Maps: 'readonly',
  XmlService: 'readonly',
};

// Apps Script entrypoints and functions invoked by triggers, the HTML client
// (google.script.run), or Telegram callbacks. They look "unused" to a static
// linter but must not be flagged.
const gasEntrypoints = {
  doGet: 'writable',
  doPost: 'writable',
  onOpen: 'writable',
  onEdit: 'writable',
  onInstall: 'writable',
};

module.exports = [
  {
    ignores: ['node_modules/**'],
  },
  {
    files: ['**/*.gs', '**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...gasGlobals,
        ...gasEntrypoints,
      },
    },
    rules: {
      // Highest-value check for GAS: catch references to undeclared identifiers
      // (typos, renamed helpers) that would only fail at runtime on Google's servers.
      'no-undef': 'error',
      // Top-level functions are entrypoints/handlers; they are not "unused".
      // Unused catch bindings are common in defensive GAS code and are ignored.
      'no-unused-vars': ['warn', { args: 'none', vars: 'local', caughtErrors: 'none' }],
    },
  },
  {
    // This config file itself runs under Node, not the GAS runtime.
    files: ['eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
];
