from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.goto("http://localhost:3000")

    # Wait for the chart
    page.wait_for_selector("#h2-chart")
    page.wait_for_timeout(1000)

    # Screenshot chart area
    page.screenshot(path="verification/chart_clipping_sim.png")

    # Click live mode to set Y max to 150
    page.click("#btn-mode-live")
    page.wait_for_timeout(1000)

    # Screenshot chart area
    page.screenshot(path="verification/chart_clipping.png")

    browser.close()
    print("Verification screenshot saved.")
