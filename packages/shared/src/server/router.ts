import { MCPError, ErrorCodes } from "../protocol/errors.js";

export type RequestHandler = (params: unknown) => Promise<unknown>;
export type NotificationHandler = (params: unknown) => Promise<void>;

export class MCPRouter {
    private requestHandlers: Map<string, RequestHandler> = new Map();
    private notificationHandlers: Map<string, NotificationHandler> = new Map();

    public on(method: string, handler: RequestHandler): void {
        this.requestHandlers.set(method, handler);
    }

    public onNotification(method: string, handler: NotificationHandler): void {
        this.notificationHandlers.set(method, handler);
    }

    public async handleRequest(method: string, params: unknown): Promise<unknown> {
        const handler = this.requestHandlers.get(method);
        if (!handler) {
            throw new MCPError(ErrorCodes.MethodNotFound, `Method not found: ${method}`);
        }
        return await handler(params);
    }

    public async handleNotification(method: string, params: unknown): Promise<void> {
        const handler = this.notificationHandlers.get(method);
        if (handler) {
            await handler(params);
        }
    }
}
