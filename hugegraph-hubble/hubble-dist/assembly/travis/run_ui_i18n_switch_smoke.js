#!/usr/bin/env node
/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const fs = require('fs');
const moduleBuiltin = require('module');
const path = require('path');
const {authenticateUi} = require('./ui_auth');

const MAC_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  path.join(process.env.HOME || '',
            'Library/Caches/ms-playwright/chromium-1226/chrome-mac-arm64/' +
            'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
];

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return fallback;
}

function chromiumExecutablePath() {
  const configured = argValue('--chromium-executable',
                              process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
                              process.env.CHROME_PATH || '');
  if (configured) {
    return configured;
  }
  for (const candidate of MAC_CHROME_PATHS) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function loadPlaywright() {
  const hubbleRoot = path.resolve(__dirname, '../../..');
  const candidateModules = [
    process.env.PLAYWRIGHT_NODE_MODULES || '',
    path.join(hubbleRoot, 'hubble-fe', 'node_modules')
  ].filter(Boolean);
  try {
    return require('playwright');
  } catch (error) {
    for (const nodeModules of candidateModules) {
      try {
        const requireFrom = moduleBuiltin.createRequire(
          path.join(nodeModules, 'playwright', 'package.json')
        );
        return requireFrom('playwright');
      } catch (_) {
        // Continue to the next configured module root.
      }
    }
    throw new Error(
      'Playwright is required for runtime i18n smoke. Install/enable it or ' +
      'set PLAYWRIGHT_NODE_MODULES. Original error: ' + error.message
    );
  }
}

async function captureLanguage(page, hubbleUrl, screenshot) {
  await page.goto(hubbleUrl + '/graphspace', {
    waitUntil: 'networkidle',
    timeout: 30000
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: screenshot, fullPage: true });
  return await page.locator('body').innerText({ timeout: 5000 });
}

async function switchToEnglish(page) {
  await page.locator(
    '[data-testid="language-switcher"] label:has(input[value="en-US"])'
  )
            .click({ timeout: 5000 });
  await page.waitForFunction(
    () => window.localStorage.getItem('languageType') === 'en-US',
    null,
    { timeout: 5000 }
  );
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await page.waitForTimeout(500);
}

async function main() {
  const hubbleUrl = (argValue('--hubble-url', process.env.HUBBLE_URL) ||
                     'http://127.0.0.1:8088').replace(/\/$/, '');
  const outputDir = path.resolve(argValue('--output-dir',
                                          '.workflow/hubble-v2-issue-694/evidence/ui'));
  const jsonOutput = argValue('--json-output', '');
  const username = argValue('--username', process.env.HUBBLE_USERNAME || 'admin');
  const password = argValue('--password', process.env.HUBBLE_PASSWORD || 'pa');
  const { chromium } = await loadPlaywright();
  const executablePath = chromiumExecutablePath();
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext();
  const page = await context.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('languageType')) {
      window.localStorage.setItem('languageType', 'zh-CN');
    }
  });
  const auth = await authenticateUi(context, page, hubbleUrl, username, password);
  let zhText;
  let enText;
  let selectorTextAfterSwitch = '';
  try {
    zhText = await captureLanguage(page, hubbleUrl,
                                   path.join(outputDir, 'i18n-zh-CN.png'));
    await switchToEnglish(page);
    selectorTextAfterSwitch = await page
      .locator('[data-testid="language-switcher"]')
      .innerText({ timeout: 5000 });
    await page.screenshot({
      path: path.join(outputDir, 'i18n-en-US.png'),
      fullPage: true
    });
    enText = await page.locator('body').innerText({ timeout: 5000 });
  } finally {
    await browser.close();
  }

  const rawKeyPattern = new RegExp(
    '\\b(addition|analysis|async-tasks|common|home|manage|navigation|' +
    'server-data-import|Topbar)\\.[A-Za-z0-9_.-]+'
  );
  const report = {
    hubbleUrl,
    authenticatedUser: auth.user.user_name,
    authLevel: auth.level,
    zhContainsChinese: /[\u4e00-\u9fff]/.test(zhText),
    enSelectorVisible: /English/.test(selectorTextAfterSwitch),
    textChanged: zhText !== enText,
    rawI18nKeyFound: rawKeyPattern.test(zhText) || rawKeyPattern.test(enText),
    notFoundPage: /404|页面不存在|Not Found/.test(zhText + enText),
    status: 'failed'
  };
  report.status = report.zhContainsChinese && report.enSelectorVisible &&
                  report.textChanged && !report.rawI18nKeyFound &&
                  !report.notFoundPage ? 'passed' : 'failed';

  if (jsonOutput) {
    fs.mkdirSync(path.dirname(path.resolve(jsonOutput)), { recursive: true });
    fs.writeFileSync(jsonOutput, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'passed') {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
