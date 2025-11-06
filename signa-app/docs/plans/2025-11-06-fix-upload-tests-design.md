# Fix Upload Flow Tests - Design Document

**Date:** 2025-11-06
**Goal:** Fix 5 failing upload flow E2E tests using Playwright Codegen and root cause analysis
**Success Criteria:** All 5 upload tests passing (improve from 13/44 → 18/44, 40.9% pass rate)

## Problem Statement

The upload flow E2E tests are failing due to outdated selectors after UI refactoring:

1. ❌ should load upload page - UI element assertions failing
2. ❌ should upload PDF and process with OCR - Field detection timeout
3. ❌ should navigate through upload steps - Navigation timing
4. ❌ should display image-based preview - Selector mismatch
5. ❌ should add and remove recipients - State management

**OCR integration works correctly** (verified via browser console logs), but tests can't find the UI elements with current selectors.

## Approach

**Strategy:** Codegen-based selector regeneration with root cause analysis

**Why Codegen:**
- UI has been refactored since tests were written
- Codegen captures exact current DOM structure
- Playwright's selector strategy is optimized
- Faster than manual DOM inspection

**Critical Requirement:** Understand WHY each test fails BEFORE using Codegen to fix it.

## Architecture

### Files to Modify

**Primary:**
- `e2e/upload.spec.ts` - Contains all 5 failing tests

**Supporting:**
- `e2e/fixtures/test-helpers.ts` - May need selector updates if shared utilities fail

### Codegen Recording Sessions

Each session captures selectors for specific user flows:

**Session 1: Upload Page Load**
- **Flow:** Login → Navigate to `/upload`
- **Capture:** Page heading, upload button, step indicators
- **Fixes:** Test 1 "should load upload page"

**Session 2: PDF Upload + OCR**
- **Flow:** Login → Upload → Wait for OCR → View preview
- **Capture:** File input, loading indicator, image preview, field count
- **Fixes:** Test 2 "should upload PDF and process with OCR"

**Session 3: Multi-Step Navigation**
- **Flow:** Upload → Step 1 → 2 → 3 → 4
- **Capture:** "Next" buttons, step transition indicators, step content
- **Fixes:** Test 3 "should navigate through upload steps"

**Session 4: Image Preview**
- **Flow:** Upload PDF → Wait for OCR → Verify image display
- **Capture:** Image container, img tags, preview structure
- **Fixes:** Test 4 "should display image-based preview"

**Session 5: Recipient Management**
- **Flow:** Navigate to recipients → Add → Remove
- **Capture:** Add button, input fields, remove button, recipient list
- **Fixes:** Test 5 "should add and remove recipients"

## Implementation Workflow

### Phase 1: Root Cause Analysis (Per Test)

For EACH failing test:

```bash
# 1. Run with debugging
npx playwright test --grep "<test-name>" --headed --debug

# 2. Capture failure details
# - Screenshot location
# - Error message (what selector failed?)
# - Expected vs actual

# 3. Inspect actual DOM
# - Pause at failure point
# - DevTools inspect element
# - Document current structure

# 4. Identify what changed
# - Renamed class/id?
# - DOM structure changed?
# - Element removed entirely?
# - Different component used?
```

**Document findings before fixing:**
```markdown
Test: "should load upload page"
Expected: `.upload-container`
Actual: `<div class="max-w-3xl mx-auto">`
Change: Removed semantic class, now uses Tailwind utilities
Fix needed: Use text-based selector or add data-testid
```

### Phase 2: Codegen Recording

**Setup:**
```bash
# Ensure services running
npm run dev  # Port 5114
# Backend (5112) and OCR (5113) already running

# Launch Codegen
npx playwright codegen http://localhost:5114
```

**Recording Process:**
1. **Manually perform** the exact flow from failing test
2. **Codegen auto-generates** selectors in real-time
3. **Copy selectors** from Codegen output
4. **Save to temp file** for comparison

**Example Codegen output:**
```typescript
await page.goto('http://localhost:5114/');
await page.getByRole('link', { name: 'Login' }).click();
await page.getByPlaceholder('Email Address').fill('demo@signaai.com');
await page.getByPlaceholder('Password').fill('Demo123!');
await page.getByRole('button', { name: 'Sign In' }).click();
await page.getByRole('link', { name: 'Upload' }).click();
```

### Phase 3: Selector Update

**Update Strategy:**
1. Open `e2e/upload.spec.ts`
2. Locate failing test
3. Replace outdated selector with Codegen selector
4. Keep test logic identical
5. Add comment documenting change

**Example update:**
```typescript
// Before
test('should load upload page', async ({ page }) => {
  await page.goto('/upload');
  await expect(page.locator('.upload-header')).toBeVisible();
  await expect(page.locator('.step-indicator')).toContainText('Upload');
});

// After (with root cause comments)
test('should load upload page', async ({ page }) => {
  await page.goto('/upload');
  // CHANGED: Removed .upload-header class, now uses heading element
  await expect(page.getByRole('heading', { name: 'Upload Document' })).toBeVisible();
  // CHANGED: Step indicators now use motion.div without semantic classes
  await expect(page.locator('text=/Upload.*Step/i')).toBeVisible();
});
```

### Phase 4: Individual Test Verification

After updating EACH test:

```bash
# Run the specific test
npx playwright test --grep "should load upload page" --project=chromium

# Verify it passes
# ✓ [chromium] › e2e/upload.spec.ts:14:7 › should load upload page (2.3s)

# Commit immediately
git add e2e/upload.spec.ts
git commit -m "fix(test): Update selectors for 'should load upload page' test

Root cause: UI refactoring removed semantic CSS classes, replaced with
Tailwind utilities. Updated to use role-based and text-based selectors.

- .upload-header → getByRole('heading', { name: 'Upload Document' })
- .step-indicator → text=/Upload.*Step/i locator
"
```

**Do NOT move to next test until current test passes.**

### Phase 5: Full Test Suite Validation

After all 5 individual tests pass:

```bash
# Run all upload tests together
npx playwright test e2e/upload.spec.ts --project=chromium

# Expected:
#   5 passed (upload.spec.ts)
#   0 failed

# Run full suite to verify no regressions
npx playwright test --project=chromium --reporter=list

# Expected improvement:
#   Before: 13/44 passing (29.5%)
#   After:  18/44 passing (40.9%)
```

## Root Cause Categories

Based on initial analysis, failures likely fall into these categories:

### Category 1: Selector Strategy Changed
- **Old:** CSS classes (`.button-primary`, `.upload-container`)
- **New:** Tailwind utilities (`className="px-4 py-2 bg-primary"`)
- **Fix:** Use semantic selectors (`getByRole`, `getByText`, `data-testid`)

### Category 2: Component Structure Changed
- **Old:** Simple div wrappers
- **New:** Framer Motion components, complex nested structure
- **Fix:** Target stable elements (roles, text content, test IDs)

### Category 3: Dynamic Content Timing
- **Old:** Synchronous rendering
- **New:** Async OCR processing, animated transitions
- **Fix:** Proper wait conditions, not arbitrary timeouts

### Category 4: Text Content Changed
- **Old:** "Upload File" button
- **New:** "Drag & drop files here" with browse button
- **Fix:** Update expected text, use flexible text matching

### Category 5: State-Dependent Elements
- **Old:** Remove button always present
- **New:** Remove button only shows with 2+ items
- **Fix:** Add item first before testing remove

## Investigation Tools

### Tool 1: Test Debugging
```bash
# Run with browser visible + debugger
npx playwright test --grep "<test>" --headed --debug

# Use in test code
await page.pause();  # Manual inspection point
```

### Tool 2: Screenshot Analysis
```bash
# Test creates screenshot on failure
# Location: test-results/<test-name>/test-failed-1.png

# Compare with expected state
open test-results/upload-should-load-upload-page-chromium/test-failed-1.png
```

### Tool 3: Error Context
```bash
# Playwright generates error-context.md
# Shows DOM snapshot at failure point

cat test-results/<test-name>/error-context.md
```

### Tool 4: Browser Console
```bash
# We added console logging in previous tasks
# Check for [OCR], [STATE], [VIEWER] logs

# In test:
page.on('console', msg => console.log('BROWSER:', msg.text()));
```

### Tool 5: Codegen
```bash
# Generate selectors from actual interaction
npx playwright codegen http://localhost:5114

# Options:
# --target=javascript    # Generate JS syntax
# --save-storage=auth.json  # Preserve login state
```

## Implementation Process

### Step-by-Step Execution

**For each of 5 tests:**

```
1. Investigate Root Cause
   - Run test with --headed --debug
   - Read error message
   - Check screenshot
   - Inspect error-context.md
   - Document what changed

2. Record with Codegen
   - Perform exact user flow
   - Copy generated selectors
   - Note any differences from test

3. Update Test
   - Replace outdated selectors
   - Add explanatory comments
   - Keep test logic same

4. Verify Fix
   - Run test individually
   - Must pass before continuing

5. Commit
   - Atomic commit per test
   - Document root cause in message

6. Move to Next Test
```

**Progress Tracking:**
- Create 5 TodoWrite items (one per test)
- Mark in_progress when investigating
- Mark completed only when test passes
- Ensures we don't skip ahead

### Rollback Safety

**Backup Strategy:**
```bash
# Before starting
cp e2e/upload.spec.ts e2e/upload.spec.ts.backup

# If test gets worse after update
git diff e2e/upload.spec.ts  # Review changes
git checkout e2e/upload.spec.ts  # Revert
# Re-investigate root cause
```

### Final Validation

**Success Checklist:**
```bash
# All 5 tests pass individually
✓ npx playwright test --grep "should load upload page"
✓ npx playwright test --grep "should upload PDF and process with OCR"
✓ npx playwright test --grep "should navigate through upload steps"
✓ npx playwright test --grep "should display image-based preview"
✓ npx playwright test --grep "should add and remove recipients"

# All 5 pass together
✓ npx playwright test e2e/upload.spec.ts

# No regressions in other tests
✓ npx playwright test --reporter=list
# Should show: 18+ passed (up from 13)

# Final documentation
✓ Create TEST-RESULTS-UPLOAD-FIXES.md
✓ Commit all changes
```

## Expected Outcomes

### Immediate Results
- **5 more tests passing**
- **Pass rate:** 29.5% → 40.9%
- **Upload flow:** Fully tested and validated

### Knowledge Gained
- Documentation of UI changes (old selectors → new selectors)
- Understanding of current DOM structure
- Updated test patterns for future tests

### Code Quality
- Tests use robust selectors (role-based, text-based)
- Proper async waiting (no arbitrary timeouts)
- Well-documented changes for maintenance

### Future Benefits
- Template for fixing other selector-based test failures
- Understanding of which selector strategies work best
- Foundation for test maintenance process

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Codegen gives dynamic selectors | Medium | High | Prefer getByRole, getByText over CSS classes |
| Tests still timeout after selector fix | Low | Medium | Root cause analysis first reveals if timing issue |
| UI changes break tests again | Medium | Low | Use stable selectors (roles, labels, test IDs) |
| Fix one test, break another | Low | Medium | Run full suite after each commit |

## Estimated Effort

**Time per test:** 20-30 minutes
- 5 minutes: Root cause investigation
- 5 minutes: Codegen recording
- 5 minutes: Selector update
- 5 minutes: Testing and verification
- 5 minutes: Documentation and commit

**Total estimated:** 2-2.5 hours for all 5 tests

## References

- Playwright Codegen docs: https://playwright.dev/docs/codegen
- Playwright locator strategies: https://playwright.dev/docs/locators
- Best practices: https://playwright.dev/docs/best-practices

---

**Design Status:** ✅ COMPLETE AND VALIDATED
**Next Step:** Worktree setup, then implementation planning
