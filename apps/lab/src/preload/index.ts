import { contextBridge, ipcRenderer } from "electron";
import { IpcChannel } from "../main/ipc/channels.js";

export const api = {
  connectServer: (opts: unknown) => ipcRenderer.invoke(IpcChannel.ConnectServer, opts),
  disconnectServer: () => ipcRenderer.invoke(IpcChannel.DisconnectServer),
  getServerInfo: () => ipcRenderer.invoke(IpcChannel.GetServerInfo),
  listConnections: () => ipcRenderer.invoke(IpcChannel.ListConnections),
  deleteConnection: (id: string) => ipcRenderer.invoke(IpcChannel.DeleteConnection, id),
  deleteAllConnections: () => ipcRenderer.invoke(IpcChannel.DeleteAllConnections),
  setFavoriteConnection: (id: string, favorite: boolean) =>
    ipcRenderer.invoke(IpcChannel.SetFavoriteConnection, id, favorite),
  listTools: () => ipcRenderer.invoke(IpcChannel.ListTools),
  callTool: (name: string, args: unknown) => ipcRenderer.invoke(IpcChannel.CallTool, name, args),
  listResources: () => ipcRenderer.invoke(IpcChannel.ListResources),
  readResource: (uri: string) => ipcRenderer.invoke(IpcChannel.ReadResource, uri),
  subscribeResource: (uri: string) => ipcRenderer.invoke(IpcChannel.SubscribeResource, uri),
  listPrompts: () => ipcRenderer.invoke(IpcChannel.ListPrompts),
  getPrompt: (name: string, args: unknown) => ipcRenderer.invoke(IpcChannel.GetPrompt, name, args),
  listHistory: () => ipcRenderer.invoke(IpcChannel.GetHistory),
  listCollections: () => ipcRenderer.invoke(IpcChannel.ListCollections),
  startMock: (config: unknown) => ipcRenderer.invoke(IpcChannel.StartMock, config),
  stopMock: () => ipcRenderer.invoke(IpcChannel.StopMock),
  getSettings: () => ipcRenderer.invoke(IpcChannel.GetSettings),
  onUpdateAvailable: (listener: (payload: unknown) => void) => {
    ipcRenderer.on(IpcChannel.UpdateAvailable, (_event, payload) => listener(payload));
  },
  onUpdateDownloaded: (listener: (payload: unknown) => void) => {
    ipcRenderer.on(IpcChannel.UpdateDownloaded, (_event, payload) => listener(payload));
  },
  onDeepLinkOpened: (listener: (url: string) => void) => {
    ipcRenderer.on(IpcChannel.DeepLinkOpened, (_event, payload) => listener(String(payload)));
  },
};

contextBridge.exposeInMainWorld("labApi", api);
