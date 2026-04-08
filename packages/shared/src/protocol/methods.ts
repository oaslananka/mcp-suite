export const Methods = {
  Initialize: "initialize",
  Initialized: "initialized",
  Ping: "ping",

  ToolsList: "tools/list",
  ToolsCall: "tools/call",

  ResourcesList: "resources/list",
  ResourcesRead: "resources/read",
  ResourcesSubscribe: "resources/subscribe",
  ResourcesUnsubscribe: "resources/unsubscribe",
  ResourcesTemplatesList: "resources/templates/list",

  PromptsList: "prompts/list",
  PromptsGet: "prompts/get",

  SamplingCreateMessage: "sampling/createMessage",

  TasksList: "tasks/list",
  TasksGet: "tasks/get",
  TasksCancel: "tasks/cancel",

  Notifications: {
    Progress: "notifications/progress",
    Message: "notifications/message",
    Initialized: "notifications/initialized",
    Cancelled: "notifications/cancelled",
    ResourcesUpdated: "notifications/resources/updated",
    ResourcesListChanged: "notifications/resources/list_changed",
    ToolsListChanged: "notifications/tools/list_changed",
    PromptsListChanged: "notifications/prompts/list_changed",
  }
} as const;
