from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.goto("http://localhost:3000")

    # Click on the Calculations tab
    page.click("#tab-calc")
    page.wait_for_timeout(1000)

    # Take screenshot of the calculations tab
    page.screenshot(path="verification/calc_tab.png")

    # Click the sim mode switch
    page.click("#tab-main")
    page.wait_for_timeout(500)
    page.click("#btn-mode-sim")

    # Go back to calc tab to watch values update
    page.click("#tab-calc")

    # Start the system via the page's underlying functions or by toggling back
    page.click("#tab-main")
    page.click("#btn-start")
    page.click("#tab-calc")

    # Wait to see values change and flash
    page.wait_for_timeout(5000)
    page.screenshot(path="verification/calc_tab_active.png")

    browser.close()
    print("Verification screenshots saved.")
