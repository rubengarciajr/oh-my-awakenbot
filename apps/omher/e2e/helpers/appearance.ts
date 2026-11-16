import { expect, type Page } from "@playwright/test";

/** Change the live app through Settings; Vite module URLs can name separate store instances. */
export async function chooseTheme(page: Page, theme: "system" | "dark" | "light") {
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("settings-nav-general").click();
  const label = { system: "System", dark: "Dark", light: "Light" }[theme];
  const choice = page.getByTestId("theme-seg").getByRole("radio", { name: label, exact: true });
  await choice.click();
  await expect(choice).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("omher.theme"))).toBe(theme);
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
}
