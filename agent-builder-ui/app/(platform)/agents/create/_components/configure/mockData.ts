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
    count: 12,
    color: "#F97316",
    triggers: [
      {
        id: "button-click",
        title: "Button Click",
        description: "Direct user interaction with a UI element",
        code: "on:click",
      },
      {
        id: "form-submit",
        title: "Form Submit",
        description: "User submits a form or data entry",
        code: "on:submit",
      },
      {
        id: "voice-command",
        title: "Voice Command",
        description: "Speech-to-text input triggers an action",
        code: "on:voice",
      },
      {
        id: "file-upload",
        title: "File Upload",
        description: "User uploads a file or document",
        code: "on:upload",
      },
    ],
  },
  {
    id: "time-based",
    label: "Time-Based",
    count: 8,
    color: "#F97316",
    triggers: [
      {
        id: "cron-schedule",
        title: "Cron Schedule",
        description: "Runs on a fixed time schedule",
        code: "cron: 0 */6 * * *",
      },
      {
        id: "delay-timer",
        title: "Delay Timer",
        description: "Fires after a specified delay period",
        code: "delay: 30s",
      },
    ],
  },
  {
    id: "data-change",
    label: "Data-Change",
    count: 9,
    color: "#E5484D",
    triggers: [
      {
        id: "db-row-insert",
        title: "DB Row Insert",
        description: "New record added to a database table",
        code: "on:db.insert",
      },
      {
        id: "field-update",
        title: "Field Update",
        description: "Specific field value changes in a record",
        code: "on:field.change",
      },
    ],
  },
  {
    id: "event-webhook",
    label: "Event / Webhook",
    count: 10,
    color: "#E5484D",
    triggers: [
      {
        id: "webhook-post",
        title: "Webhook POST",
        description: "External service sends HTTP POST",
        code: "on:webhook.post",
      },
      {
        id: "event-bus",
        title: "Event Bus",
        description: "Message published on event bus topic",
        code: "on:event.publish",
      },
    ],
  },
  {
    id: "conditional",
    label: "Conditional / Logic",
    count: 7,
    color: "#8B5CF6",
    triggers: [],
  },
  {
    id: "agent-to-agent",
    label: "Agent-to-Agent",
    count: 8,
    color: "#8B5CF6",
    triggers: [],
  },
  {
    id: "compliance",
    label: "Compliance & Security",
    count: 9,
    color: "#0EA5E9",
    triggers: [],
  },
  {
    id: "system-infra",
    label: "System / Infrastructure",
    count: 6,
    color: "#0EA5E9",
    triggers: [],
  },
];
