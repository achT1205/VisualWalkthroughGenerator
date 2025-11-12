/**
 * Form handler for automatically filling and submitting forms during crawling
 */

import { Page } from "playwright";

export interface FormField {
  selector: string;
  value: string;
  type?: "text" | "email" | "password" | "number" | "select" | "checkbox" | "radio";
}

export interface FormAction {
  action: "fill" | "click" | "select" | "check";
  selector: string;
  value?: string;
}

/**
 * Detect if page has forms that need interaction
 */
export async function detectForms(page: Page): Promise<boolean> {
  try {
    const hasForms = await page.evaluate(() => {
      const forms = document.querySelectorAll("form");
      const inputs = document.querySelectorAll("input[type='text'], input[type='email'], input[required], textarea[required]");
      return forms.length > 0 || inputs.length > 0;
    });
    return hasForms;
  } catch {
    return false;
  }
}

/**
 * Auto-fill forms with intelligent defaults
 */
export async function autoFillForm(
  page: Page,
  customFields?: FormField[]
): Promise<boolean> {
  try {
    console.log("   🔍 Detecting forms on page...");

    // Use custom fields if provided, otherwise use intelligent defaults
    const fieldsToFill = customFields || await generateDefaultFields(page);

    if (fieldsToFill.length === 0) {
      console.log("   ℹ️  No form fields detected");
      return false;
    }

    console.log(`   📝 Filling ${fieldsToFill.length} form field(s)...`);

    // Fill each field
    for (const field of fieldsToFill) {
      try {
        const element = await page.$(field.selector);
        if (!element) {
          continue;
        }

        const tagName = await element.evaluate((el) => el.tagName.toLowerCase());
        const inputType = await element.evaluate((el) => (el as HTMLInputElement).type);

        if (tagName === "input" || tagName === "textarea") {
          if (inputType === "checkbox" || inputType === "radio") {
            await element.check();
          } else {
            await element.fill(field.value);
          }
        } else if (tagName === "select") {
          await element.selectOption(field.value);
        }

        // Small delay between fields
        await page.waitForTimeout(200);
      } catch (error) {
        console.log(`      ⚠️  Could not fill field: ${field.selector}`);
      }
    }

    // Try to submit the form
    const submitted = await submitForm(page);
    
    if (submitted) {
      console.log("   ✅ Form submitted successfully");
      // Wait for navigation or page update
      await page.waitForTimeout(2000);
      return true;
    }

    return false;
  } catch (error) {
    console.log(`   ⚠️  Error filling form: ${error}`);
    return false;
  }
}

/**
 * Generate default field values based on common patterns
 */
async function generateDefaultFields(page: Page): Promise<FormField[]> {
  const fields: FormField[] = [];

  try {
    const fieldInfo = await page.evaluate(() => {
      const inputs: Array<{
        selector: string;
        type: string;
        name: string;
        placeholder: string;
        label: string;
        required: boolean;
      }> = [];

      // Find all input fields
      document.querySelectorAll("input, textarea, select").forEach((input, index) => {
        const element = input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const type = element.type || "text";
        const name = element.name || element.id || "";
        const placeholder = (element as HTMLInputElement).placeholder || "";
        const required = element.hasAttribute("required");
        
        // Try to find associated label
        let label = "";
        if (element.id) {
          const labelEl = document.querySelector(`label[for="${element.id}"]`);
          if (labelEl) {
            label = labelEl.textContent || "";
          }
        }
        if (!label && element.closest("label")) {
          label = element.closest("label")?.textContent || "";
        }

        // Generate unique selector
        let selector = "";
        if (element.id) {
          selector = `#${element.id}`;
        } else if (element.name) {
          selector = `[name="${element.name}"]`;
        } else {
          selector = `${element.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
        }

        inputs.push({
          selector,
          type,
          name,
          placeholder,
          label: label.trim(),
          required,
        });
      });

      return inputs;
    });

    // Generate values based on field patterns
    for (const info of fieldInfo) {
      let value = generateValueForField(info);

      if (value) {
        fields.push({
          selector: info.selector,
          value,
          type: info.type as FormField["type"],
        });
      }
    }
  } catch (error) {
    console.log(`      ⚠️  Error generating fields: ${error}`);
  }

  return fields;
}

/**
 * Generate appropriate value for a field based on its characteristics
 */
function generateValueForField(info: {
  type: string;
  name: string;
  placeholder: string;
  label: string;
}): string {
  const lowerName = info.name.toLowerCase();
  const lowerLabel = info.label.toLowerCase();
  const lowerPlaceholder = info.placeholder.toLowerCase();

  // Name fields
  if (
    lowerName.includes("name") ||
    lowerLabel.includes("name") ||
    lowerPlaceholder.includes("name")
  ) {
    return "John Doe";
  }

  // Email fields
  if (
    info.type === "email" ||
    lowerName.includes("email") ||
    lowerLabel.includes("email") ||
    lowerPlaceholder.includes("email")
  ) {
    return "test@example.com";
  }

  // Password fields
  if (info.type === "password") {
    return "TestPassword123!";
  }

  // Phone fields
  if (
    lowerName.includes("phone") ||
    lowerLabel.includes("phone") ||
    lowerPlaceholder.includes("phone") ||
    lowerName.includes("tel")
  ) {
    return "+1234567890";
  }

  // Age/Number fields
  if (info.type === "number" || lowerName.includes("age")) {
    return "25";
  }

  // Company/Organization
  if (
    lowerName.includes("company") ||
    lowerName.includes("organization") ||
    lowerLabel.includes("company")
  ) {
    return "Test Company";
  }

  // Address fields
  if (
    lowerName.includes("address") ||
    lowerLabel.includes("address")
  ) {
    return "123 Test Street";
  }

  // City
  if (lowerName.includes("city") || lowerLabel.includes("city")) {
    return "Test City";
  }

  // Country
  if (lowerName.includes("country") || lowerLabel.includes("country")) {
    return "United States";
  }

  // Default text value
  if (info.type === "text" || info.type === "textarea") {
    return "Test Value";
  }

  return "";
}

/**
 * Submit form by finding submit button
 */
async function submitForm(page: Page): Promise<boolean> {
  try {
    // Try multiple strategies to find submit button
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Submit")',
      'button:has-text("Continue")',
      'button:has-text("Next")',
      'button:has-text("Go")',
      'button:has-text("Enter")',
      '[role="button"]:has-text("Submit")',
      'form button',
      '.submit-button',
      '#submit',
    ];

    for (const selector of submitSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          const isVisible = await button.isVisible();
          if (isVisible) {
            await button.click();
            return true;
          }
        }
      } catch {
        continue;
      }
    }

    // Try pressing Enter on the last input field
    try {
      const lastInput = await page.$("input:last-of-type, textarea:last-of-type");
      if (lastInput) {
        await lastInput.press("Enter");
        return true;
      }
    } catch {
      // Ignore
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Check if page changed after form submission
 */
export async function waitForPageChange(
  page: Page,
  originalUrl: string,
  timeout: number = 5000
): Promise<boolean> {
  try {
    await page.waitForFunction(
      (url) => window.location.href !== url,
      originalUrl,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

