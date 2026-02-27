/**
 * Verification test: Ensures percentage buttons (25%, 50%, 75%, MAX)
 * exist in all required components across the app.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const COMPONENTS_WITH_PERCENTAGE_BUTTONS = [
  {
    name: 'SendModal (BTC + Alkane)',
    path: 'app/wallet/components/SendModal.tsx',
  },
  {
    name: 'SwapInputs',
    path: 'app/swap/components/SwapInputs.tsx',
  },
  {
    name: 'LiquidityInputs',
    path: 'app/swap/components/LiquidityInputs.tsx',
  },
  {
    name: 'VaultDepositInterface',
    path: 'app/vaults/components/VaultDepositInterface.tsx',
  },
  {
    name: 'BoostSection (stake/unstake)',
    path: 'app/vaults/components/BoostSection.tsx',
  },
  {
    name: 'OpenPositionForm (futures)',
    path: 'app/futures/components/OpenPositionForm.tsx',
  },
];

describe('Percentage buttons present in all required components', () => {
  for (const component of COMPONENTS_WITH_PERCENTAGE_BUTTONS) {
    describe(component.name, () => {
      let source: string;

      // Read the source file once per component
      it('file exists and is readable', () => {
        const filePath = resolve(__dirname, '..', component.path);
        source = readFileSync(filePath, 'utf-8');
        expect(source).toBeTruthy();
      });

      it('has 25% button', () => {
        expect(source).toMatch(/0\.25|25\s*%/);
      });

      it('has 50% button', () => {
        expect(source).toMatch(/0\.5[^0-9]|50\s*%/);
      });

      it('has 75% button', () => {
        expect(source).toMatch(/0\.75|75\s*%/);
      });

      it('has MAX button', () => {
        // Some components use literal "MAX", others use i18n like t('boost.max')
        expect(source).toMatch(/MAX|\.max['")\s}]|onMax/i);
      });

      it('has percentage button click handler', () => {
        // Should have onClick handlers that set an amount based on percentage
        expect(source).toMatch(/onClick.*(?:pct|percent|setAmount|MAX|max|onMax)/is);
      });

      it('uses consistent button styling (shadow + rounded)', () => {
        // All percentage buttons should use the shared styling pattern
        expect(source).toMatch(/rounded-md/);
        expect(source).toMatch(/shadow-\[/);
      });
    });
  }
});

describe('SendModal has percentage buttons for BOTH BTC and Alkane inputs', () => {
  it('has two separate percentage button groups', () => {
    const filePath = resolve(__dirname, '..', 'app/wallet/components/SendModal.tsx');
    const source = readFileSync(filePath, 'utf-8');

    // Count occurrences of the percentage mapping pattern
    const percentMappingMatches = source.match(/\[0\.25,\s*0\.5,\s*0\.75\]\.map/g);
    expect(percentMappingMatches).toBeTruthy();
    expect(percentMappingMatches!.length).toBeGreaterThanOrEqual(2);
  });
});
