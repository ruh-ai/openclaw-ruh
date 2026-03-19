// Auth Routes
export const authRoute = `${process.env.NEXT_PUBLIC_AUTH_URL}?redirect_url=${process.env.NEXT_PUBLIC_APP_URL}`;
export const loginRoute = "/authenticate";
export const getAccessTokenRoute = "/auth/access-token";

// Platform Routes
export const dashboardRoute = "/";
export const overviewRoute = "/";
export const agentsRoute = "/agents";
export const createAgentRoute = "/agents/create";
export const toolsRoute = "/tools";
export const activityRoute = "/activity";

// Settings Routes
export const settingsRoute = "/settings";
