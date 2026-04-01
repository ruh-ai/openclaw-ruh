import type { ToolItem, SkillItem, TriggerCategory } from "./types";

export const MOCK_TOOLS: ToolItem[] = [
  {
    id: "jira",
    name: "Jira",
    description:
      "Atlassian's project tracker with customizable workflows, agile boards, and real-time reporting.",
    icon: "jira",
    connected: false,
  },
  {
    id: "github",
    name: "Github",
    description:
      "Code hosting with Git version control, pull requests, collaboration, and CI/CD integrations.",
    icon: "github",
    connected: false,
  },
  {
    id: "zoho-crm",
    name: "Zoho CRM",
    description: "Zoho OAuth integration for accessing CRM user data",
    icon: "zoho",
    connected: false,
  },
];

export const SKILL_MARKDOWN: Record<string, string> = {
  "email-triage": `name: email-triage
description: Automatically categorize, prioritize and label incoming emails based on content analysis and sender reputation. Routes urgent messages to the right team members and archives low-priority notifications.

## Capabilities
- Classify emails by urgency (critical, high, medium, low)
- Auto-label by category (support, sales, billing, internal)
- Route to appropriate team queues
- Detect spam and phishing attempts
- Generate daily digest summaries

## Configuration
\`\`\`yaml
inbox: primary
scan_interval: 5m
categories:
  - support
  - sales
  - billing
  - internal
urgency_model: gpt-4-turbo
\`\`\`

## Triggers
- New email received
- Scheduled digest (daily 9:00 AM)`,

  "task-automation": `name: task-automation
description: Streamline repetitive tasks by automating workflows and notifications. Connects with project management tools to create, assign, and update tasks based on predefined rules and AI-powered analysis.

## Capabilities
- Auto-create tasks from Slack messages
- Assign tasks based on team workload
- Send deadline reminders
- Update task status from git commits
- Generate weekly progress reports

## Configuration
\`\`\`yaml
sources:
  - slack
  - email
  - github
project_tool: jira
assignment_strategy: round-robin
reminder_schedule: "0 9 * * 1-5"
\`\`\`

## Triggers
- Message tagged with #task
- PR merged without linked issue
- Approaching deadline (24h warning)`,

  "data-analysis": `name: data-analysis
description: Analyze data trends and generate reports for informed decision-making. Connects to your data sources to provide real-time insights, anomaly detection, and automated reporting.

## Capabilities
- Connect to SQL databases and APIs
- Generate automated reports (PDF, CSV)
- Detect anomalies in metrics
- Create data visualizations
- Natural language data queries

## Configuration
\`\`\`yaml
data_sources:
  - postgres://analytics-db
  - api://metrics-service
refresh_interval: 15m
anomaly_threshold: 2.5_sigma
report_format: pdf
\`\`\`

## Triggers
- Scheduled report (weekly)
- Anomaly detected
- Manual query via chat`,
};

export const MOCK_SKILLS: SkillItem[] = [
  {
    id: "email-triage",
    name: "email-triage",
    description: "Automatically categorize, prioritize and label incoming emails.",
    markdownContent: SKILL_MARKDOWN["email-triage"],
  },
  {
    id: "task-automation",
    name: "task-automation",
    description:
      "Streamline repetitive tasks by automating workflows and notifications.",
    markdownContent: SKILL_MARKDOWN["task-automation"],
  },
  {
    id: "data-analysis",
    name: "data-analysis",
    description:
      "Analyze data trends and generate reports for informed decision-making.",
    isNew: true,
    markdownContent: SKILL_MARKDOWN["data-analysis"],
  },
];

export const MOCK_TRIGGER_CATEGORIES: TriggerCategory[] = [
  {
    id: "user-initiated",
    label: "User-Initiated",
    count: 8,
    color: "#F97316",
    triggers: [
      { id: "button-click", title: "Button Click", description: "Direct user interaction with a UI element", code: "on:click" },
      { id: "form-submit", title: "Form Submit", description: "User submits a form or data entry", code: "on:submit" },
      { id: "voice-command", title: "Voice Command", description: "Speech-to-text input triggers an action", code: "on:voice" },
      { id: "file-upload", title: "File Upload", description: "User uploads a file or document", code: "on:upload" },
      { id: "chat-command", title: "Chat Command", description: "Slash command sent in a chat interface", code: "on:chat.command" },
      { id: "keyboard-shortcut", title: "Keyboard Shortcut", description: "User presses a defined hotkey combination", code: "on:hotkey" },
      { id: "api-request", title: "API Request", description: "External caller hits a REST endpoint", code: "on:api.call" },
      { id: "dashboard-widget", title: "Dashboard Widget", description: "User clicks an action widget on a dashboard", code: "on:widget.action" },
    ],
  },
  {
    id: "time-based",
    label: "Time-Based",
    count: 6,
    color: "#F97316",
    triggers: [
      { id: "cron-schedule", title: "Cron Schedule", description: "Runs on a fixed time schedule", code: "cron: 0 9 * * *" },
      { id: "delay-timer", title: "Delay Timer", description: "Fires after a specified delay period", code: "delay: 30s" },
      { id: "interval-repeat", title: "Interval Repeat", description: "Repeats every N minutes or hours", code: "every: 1h" },
      { id: "date-trigger", title: "Date / Calendar", description: "Fires on a specific date or recurring calendar event", code: "on:date" },
      { id: "business-hours", title: "Business Hours", description: "Activates only within configured working hours", code: "on:business_hours" },
      { id: "deadline-alert", title: "Deadline Alert", description: "Fires N hours before a tracked deadline", code: "on:deadline.before" },
    ],
  },
  {
    id: "data-change",
    label: "Data-Change",
    count: 6,
    color: "#E5484D",
    triggers: [
      { id: "db-row-insert", title: "DB Row Insert", description: "New record added to a database table", code: "on:db.insert" },
      { id: "field-update", title: "Field Update", description: "Specific field value changes in a record", code: "on:field.change" },
      { id: "doc-updated", title: "Document Updated", description: "A file or document is modified", code: "on:doc.update" },
      { id: "status-change", title: "Status Change", description: "Record status transitions to a new value", code: "on:status.change" },
      { id: "threshold-exceeded", title: "Threshold Exceeded", description: "A metric crosses a defined boundary", code: "on:metric.threshold" },
      { id: "row-delete", title: "Row Deleted", description: "A record is removed from a dataset", code: "on:db.delete" },
    ],
  },
  {
    id: "event-webhook",
    label: "Event / Webhook",
    count: 6,
    color: "#E5484D",
    triggers: [
      { id: "webhook-post", title: "Webhook POST", description: "External service sends HTTP POST", code: "on:webhook.post" },
      { id: "event-bus", title: "Event Bus", description: "Message published on event bus topic", code: "on:event.publish" },
      { id: "message-received", title: "Message Received", description: "New message arrives in a monitored channel", code: "on:message" },
      { id: "service-alert", title: "Service Alert", description: "Monitoring service fires an alert", code: "on:alert.fire" },
      { id: "queue-message", title: "Queue Message", description: "Item placed on a message queue", code: "on:queue.push" },
      { id: "webhook-get", title: "Webhook GET", description: "External service polls a GET endpoint", code: "on:webhook.get" },
    ],
  },
  {
    id: "conditional",
    label: "Conditional / Logic",
    count: 4,
    color: "#8B5CF6",
    triggers: [
      { id: "threshold-check", title: "Threshold Check", description: "Fires when a metric crosses a defined value", code: "on:threshold" },
      { id: "if-else-branch", title: "If / Else Branch", description: "Routes flow based on a condition expression", code: "if: condition" },
      { id: "retry-on-fail", title: "Retry on Failure", description: "Re-runs a step after transient errors", code: "on:retry" },
      { id: "rate-limit-guard", title: "Rate-Limit Guard", description: "Pauses execution when rate limits are hit", code: "on:rate_limit" },
    ],
  },
  {
    id: "agent-to-agent",
    label: "Agent-to-Agent",
    count: 3,
    color: "#8B5CF6",
    triggers: [
      { id: "agent-call", title: "Agent Call", description: "Another agent invokes this agent directly", code: "on:agent.call" },
      { id: "subtask-complete", title: "Subtask Complete", description: "Triggered when a child agent finishes", code: "on:subtask.done" },
      { id: "handoff", title: "Handoff", description: "Receives context passed from a parent agent", code: "on:handoff" },
    ],
  },
  {
    id: "compliance",
    label: "Compliance & Security",
    count: 3,
    color: "#0EA5E9",
    triggers: [
      { id: "audit-log", title: "Audit Log Entry", description: "Fires when a sensitive action is logged", code: "on:audit.write" },
      { id: "policy-violation", title: "Policy Violation", description: "Triggered when a rule breach is detected", code: "on:policy.breach" },
      { id: "access-request", title: "Access Request", description: "User requests elevated permissions", code: "on:access.request" },
    ],
  },
  {
    id: "system-infra",
    label: "System / Infrastructure",
    count: 3,
    color: "#0EA5E9",
    triggers: [
      { id: "health-check-fail", title: "Health Check Fail", description: "Service health endpoint returns non-2xx", code: "on:health.fail" },
      { id: "deploy-complete", title: "Deploy Complete", description: "CI/CD pipeline finishes a deployment", code: "on:deploy.done" },
      { id: "resource-threshold", title: "Resource Threshold", description: "CPU/memory exceeds configured limit", code: "on:resource.high" },
    ],
  },
];
