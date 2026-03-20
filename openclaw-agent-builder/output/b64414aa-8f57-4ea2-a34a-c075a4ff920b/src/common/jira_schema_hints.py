"""Best-effort hints for Jira entity table + field names.

The ingestion service may expose Jira entities under different table names.
We try candidates in order until we get a non-empty result OR a successful query.

Update these when you know the canonical names in your ingestion service.
"""

from __future__ import annotations

# Candidate tables to query from schema_type="shared" (read-only).

PROJECT_TABLE_CANDIDATES = [
    "jira_projects",
    "entity_jira_projects",
    "entity_projects",
    "projects",
]

USER_TABLE_CANDIDATES = [
    "jira_users",
    "entity_jira_users",
    "entity_users",
    "users",
]

SPRINT_TABLE_CANDIDATES = [
    "jira_sprints",
    "entity_jira_sprints",
    "entity_sprints",
    "sprints",
]

ISSUE_TABLE_CANDIDATES = [
    "jira_issues",
    "entity_jira_issues",
    "entity_issues",
    "issues",
]

# Field name candidates inside issue rows.

ISSUE_STORY_POINTS_FIELDS = [
    "story_points",
    "storyPoints",
    "points",
    "customfield_story_points",
]

ISSUE_SPRINT_ID_FIELDS = [
    "sprint_id",
    "sprintId",
    "sprint",
    "sprintID",
]

ISSUE_ASSIGNEE_FIELDS = [
    "assignee_id",
    "assigneeId",
    "assignee",
    "assignee_account_id",
]

ISSUE_STATUS_FIELDS = [
    "status",
    "status_name",
    "statusName",
]

# For cycle-time computation: list of status change events.
# Candidate fields that could contain changelog / transitions.
ISSUE_CHANGELOG_FIELDS = [
    "changelog",
    "status_changelog",
    "transitions",
    "history",
]

# Sprint fields
SPRINT_ID_FIELDS = ["id", "sprint_id", "sprintId"]
SPRINT_NAME_FIELDS = ["name", "sprint_name", "sprintName"]
SPRINT_STATE_FIELDS = ["state", "status"]

# User fields
USER_ID_FIELDS = ["account_id", "id", "user_id", "accountId"]
USER_NAME_FIELDS = ["display_name", "name", "displayName", "email"]
