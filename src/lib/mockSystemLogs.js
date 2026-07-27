// Mock audit log data for System Logs module
// Each entry represents an action performed by a user/admin in the system.
// Fields: id, timestamp (ISO string), actor, action, target, details

export default [
  // Today (2026-07-27)
  {
    id: "log-001",
    timestamp: "2026-07-27T08:15:30Z",
    actor: "admin@example.com",
    action: "Created",
    target: "Device DV-2104",
    details: "Added new fleet device with plate ABC-1234",
  },
  {
    id: "log-002",
    timestamp: "2026-07-27T10:42:13Z",
    actor: "supervisor@example.com",
    action: "Viewed",
    target: "Delivery DEL-771245",
    details: "Opened analysis view for driver Juan D. Santos",
  },
  // Yesterday (2026-07-26)
  {
    id: "log-003",
    timestamp: "2026-07-26T14:05:00Z",
    actor: "admin@example.com",
    action: "Updated",
    target: "Device DV-2104",
    details: "Changed status from active to maintenance",
  },
  // 7 days ago (2026-07-20)
  {
    id: "log-004",
    timestamp: "2026-07-20T09:30:45Z",
    actor: "admin@example.com",
    action: "Deleted",
    target: "User john.doe@example.com",
    details: "Removed user account due to inactivity",
  },
  // 12 days ago (2026-07-15)
  {
    id: "log-005",
    timestamp: "2026-07-15T11:12:20Z",
    actor: "admin@example.com",
    action: "Created",
    target: "User jane.smith@example.com",
    details: 'Added new admin user with role "Supervisor"',
  },
  // 17 days ago (2026-07-10)
  {
    id: "log-006",
    timestamp: "2026-07-10T08:45:00Z",
    actor: "admin@example.com",
    action: "Maintenance",
    target: "Device DV-2241",
    details: "Performed routine maintenance check",
  },
  // 22 days ago (2026-07-05)
  {
    id: "log-007",
    timestamp: "2026-07-05T13:20:30Z",
    actor: "supervisor@example.com",
    action: "Viewed",
    target: "Report Monthly Summary",
    details: "Reviewed monthly performance metrics",
  },
  // 27 days ago (2026-06-30)
  {
    id: "log-008",
    timestamp: "2026-06-30T16:45:10Z",
    actor: "admin@example.com",
    action: "Deleted",
    target: "Device DV-2105",
    details: "Decommissioned retired device",
  },
  // 29 days ago (2026-06-28)
  {
    id: "log-009",
    timestamp: "2026-06-28T12:00:00Z",
    actor: "admin@example.com",
    action: "Created",
    target: "User mark.lee@example.com",
    details: "Added new driver user account",
  },
  // 30 days ago (2026-06-27)
  {
    id: "log-010",
    timestamp: "2026-06-27T09:15:00Z",
    actor: "supervisor@example.com",
    action: "Viewed",
    target: "System Settings",
    details: "Checked configuration parameters",
  },
];
