from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.goto("http://localhost:3000")

    # Click on the Theory tab
    page.click("#tab-theory")
    page.wait_for_timeout(1000)

    # Take screenshot of the initial theory tab
    page.screenshot(path="verification/theory_tab_initial.png")

    # Click the second accordion (Faraday's Law)
    page.click("button:has-text(\"Faraday's Law\")")
    page.wait_for_timeout(1000)

    # Hover over the first variable badge to test tooltip
    page.hover(".theory-accordion.active .theory-badge:first-of-type")
    page.wait_for_timeout(500)

    page.screenshot(path="verification/theory_tab_expanded.png")

    browser.close()
    print("Verification screenshots saved.")
