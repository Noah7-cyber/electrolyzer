from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.goto("http://localhost:3000")

    # Wait for the chart to exist
    page.wait_for_selector("#h2-chart")
    page.wait_for_timeout(1000)

    # Click sim mode first so it isn't disabled
    page.click("#btn-mode-sim")
    page.wait_for_timeout(500)

    # Set parameters for a bad run (Baking Soda + Pencil Lead + 10cm)
    page.select_option("#sim-electrolyte", "baking_soda")
    page.select_option("#sim-material", "pencil")

    # Wait to see initial state
    page.screenshot(path="verification/physics_initial.png")

    # Start system at 100% PWM
    page.click("#btn-start")

    # Simulate a fast-forward by letting it run for ~10 seconds
    page.wait_for_timeout(10000)

    # Screenshot chart area and murky water
    page.screenshot(path="verification/physics_runaway.png")

    browser.close()
    print("Verification screenshots saved.")
