export type RequestHandler = (params: unknown) => Promise<unknown>;
export type NotificationHandler = (params: unknown) => Promise<void>;
export declare class MCPRouter {
    private requestHandlers;
    private notificationHandlers;
    on(method: string, handler: RequestHandler): void;
    onNotification(method: string, handler: NotificationHandler): void;
    handleRequest(method: string, params: unknown): Promise<unknown>;
    handleNotification(method: string, params: unknown): Promise<void>;
}
//# sourceMappingURL=router.d.ts.map