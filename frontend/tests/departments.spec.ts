import { expect, test } from '@playwright/test';
import example from '../../backend/examples/global-memory-software-company.json';
import { departmentHierarchy } from '../src/lib/department-hierarchy';
import { installApi } from './api-fixture';

test('API relationship text builds the root, direct departments and engineering teams', () => {
  const tree = departmentHierarchy(example.departments, example.relationshipsDescription);
  expect(tree.roots.map(node => node.department.name)).toEqual(['總經理室']);
  expect(tree.roots[0].children).toHaveLength(5);
  expect(tree.roots[0].children.find(node => node.department.name === '研發管理部')?.children.map(node => node.department.name)).toEqual(['前端開發部', '後端開發部', '品質保證部', '平台與資安部']);
  expect(tree.unplaced).toHaveLength(0);
});

test('unspecified departments and cyclic prose do not acquire invented reporting lines', () => {
  const departments = ['甲部', '乙部', '丙部'].map((name, index) => ({ id: String(index), name, description: name }));
  const plain = departmentHierarchy(departments, '甲部與乙部協作。');
  expect(plain.roots).toHaveLength(0); expect(plain.unplaced).toHaveLength(3);
  const cycle = departmentHierarchy(departments, '甲部直接隸屬乙部。乙部直接隸屬甲部。');
  expect(cycle.roots).toHaveLength(0); expect(cycle.unplaced).toHaveLength(3);
});

test('department list restores selectable hierarchy on desktop and mobile', async ({ page }) => {
  const state = await installApi(page);
  Object.assign(state.memory!, example);
  await page.goto('/#company');
  await expect(page.locator('h1')).toHaveText('部門清單');
  await expect(page.locator('.sidebar').getByRole('link', { name: '部門清單', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: '總經理室直屬部門' }).getByRole('button')).toHaveCount(5);
  await expect(page.getByRole('region', { name: '研發管理部下屬團隊' }).getByRole('button')).toHaveCount(4);
  await expect(page.locator('.department-card')).toHaveCount(10);
  await page.getByRole('button', { name: /^前端開發部/ }).click();
  await expect(page.getByRole('complementary', { name: '部門職掌' }).getByRole('heading')).toHaveText('前端開發部');
  await expect(page.getByRole('button', { name: /^前端開發部/ })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: '/tmp/seax-departments-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /^後端開發部/ }).click();
  await expect(page.getByRole('complementary', { name: '部門職掌' }).getByRole('heading')).toHaveText('後端開發部');
  await page.screenshot({ path: '/tmp/seax-departments-mobile.png', fullPage: true });
});
