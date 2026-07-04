#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Build "AmmiAI" — an Android-first Tamil home-kitchen manager (pantry + meal plan +
  grocery). Delivered in 5 slices. Slices 1-4 (auth+onboarding, pantry, plan engine,
  grocery + cooked→pantry deduction) are green. This test round is for **Slice 5**:
  Notifications with 4 types + Test-Now buttons, Weekly Report with badges+share
  image, Free/Premium paywall (MOCKED IAP), and Settings screen with edit-profile /
  reset onboarding / hard-delete account. Free-tier quotas: 25 pantry items and
  4 plan generations/month must return HTTP 402 with a helpful detail message.
  Also stubbed a `/api/ai/*` layer that reads ANTHROPIC_API_KEY from env — no key
  yet, so `/api/ai/request` must 501 gracefully and `/api/ai/status` should report
  `configured: false`.

backend:
  - task: "Notification preferences GET/PUT"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "GET /api/settings/notifications returns defaults on first read and upserts; PUT accepts partial patches for all 11 preference fields."
  - task: "Premium status + MOCKED purchase + cancel"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "GET /api/premium/status returns is_premium=false by default with quota + free_limits block. POST /api/premium/purchase with plan=monthly|yearly flips is_premium=true and sets expires_at (30d/365d). POST /api/premium/cancel reverses it. Purchase is MOCKED (no real Google Play Billing)."
  - task: "Free-tier quota enforcement (pantry + plan/generate)"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/pantry returns 402 for the 26th pantry item (free users). POST /api/plan/generate with force=true returns 402 after 4 generations in the current calendar month (tracked in plan_gen_log). After purchase both limits go away."
  - task: "Weekly report"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "GET /api/report/weekly computes money_saved_inr (consumed − waste), waste_count, cooked_count, diet_balance_score (0..100), current_streak/longest_streak, and awards up to 4 badges (zero_waste_week, seven_day_streak, balanced_chef, home_cook_hero). Accepts optional end_date query."
  - task: "Hard-delete account"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "DELETE /api/account wipes users, user_sessions, profiles, pantry_items, waste_log, meal_plans, notif_prefs, premium, user_streaks, plan_gen_log for this user_id. Also purges the users row keyed by email/phone. After delete, /api/auth/me must return 401."
  - task: "AI stub endpoints"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "GET /api/ai/status returns { configured: false, model: 'claude-sonnet-4-5', capabilities: [...] } when ANTHROPIC_API_KEY is empty. POST /api/ai/request returns 501 with 'AI layer not configured'. Real Anthropic call is intentionally NOT wired — Prompt 6 will do it."

frontend:
  - task: "Settings screen — profile edit, notif toggles, danger actions"
    implemented: true
    working: "NA"
    file: "frontend/app/settings.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Reachable from Home tab settings icon or long-press header. Shows Premium banner (usage counts on free), Weekly report shortcut, Profile card (name/household/spice/goals), 4 notification rows with Test buttons + toggles, Privacy policy link, Reset onboarding, Log out, and Delete account. Delete uses window.confirm on web; hits DELETE /api/account and routes to /sign-in."
  - task: "Paywall (MOCKED)"
    implemented: true
    working: "NA"
    file: "frontend/app/paywall.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Hero + 4 benefits + Monthly ₹99 / Yearly ₹699 (yearly is default with 'Save 41%' badge). CTA calls POST /api/premium/purchase with receipt='MOCK'. Restore refetches /api/premium/status. Fine print explicitly says MOCKED for preview."
  - task: "Weekly report — visual + Share image + WhatsApp"
    implemented: true
    working: "NA"
    file: "frontend/app/report/weekly.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Fetches /api/report/weekly; renders inside a ViewShot wrapper. Actions: Copy text, WhatsApp share (web.open), Share image (captureRef → data-uri on web / share sheet on native). Toast confirms copy."
  - task: "Local notification scheduler + Test buttons"
    implemented: true
    working: "NA"
    file: "frontend/src/notifications.ts"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "expo-notifications DAILY/WEEKLY schedules for 4 kinds. fireTest() uses trigger:null on native. On web, it best-effort calls the browser Notification API. Preview banner in Settings warns notifications only fire on real Android/iOS builds."
  - task: "Free-tier quota UX (402 → paywall)"
    implemented: true
    working: "NA"
    file: "frontend/app/pantry/add.tsx, frontend/app/(tabs)/plan.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Both POST callers now check err.status===402 and push /paywall while surfacing the backend detail message as an inline error."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 5
  run_ui: true

test_plan:
  current_focus:
    - "Notification preferences GET/PUT"
    - "Premium status + MOCKED purchase + cancel"
    - "Free-tier quota enforcement (pantry + plan/generate)"
    - "Weekly report"
    - "Hard-delete account"
    - "AI stub endpoints"
    - "Settings screen — profile edit, notif toggles, danger actions"
    - "Paywall (MOCKED)"
    - "Weekly report — visual + Share image + WhatsApp"
    - "Free-tier quota UX (402 → paywall)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Slice 5 is code-complete and needs full backend + frontend E2E validation.
      • Auth: POST /api/auth/phone/send with { phone: "+919000012345" } then
        POST /api/auth/phone/verify with { phone, code: "123456" } — any 6-digit
        code is accepted (mocked). Use returned session_token as Bearer.
      • Verify the six backend tasks (notif, premium status/purchase/cancel,
        quota, weekly report, delete account, AI stub).
      • For quota: seed 25 pantry items via POST /api/pantry (any ingredient_id
        from GET /api/ingredients), then confirm the 26th returns 402. Purchase
        premium and confirm the same call now succeeds. Same for
        POST /api/plan/generate with force=true — after 4 hits it should 402.
      • For frontend: verify Settings screen renders and each notification
        Test button fires (best-effort browser notification), Paywall CTA
        completes a mock purchase and the Settings banner flips to "Premium
        active", and Weekly Report copy/share buttons work on web.
      • Delete account must invalidate the current bearer token.
